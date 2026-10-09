
/* V25 execution domain. Device-local only; full ledger schema remains untouched. */
const EXEC_LIMITS=Object.freeze({base:1000,pull:700,ext:300});
const EXEC_BACKUP_KEY="btc_v25_before_migration";
let executionStorageOK=true,executionLastSaved=null;
function executionBackupRaw(){
  try{
    const state=localStorage.getItem("btc_exec_v7"),ledger=localStorage.getItem("btc_dca_ledger_v1");
    if(!localStorage.getItem(EXEC_BACKUP_KEY)){
      const backup=JSON.stringify({schema:1,at:Date.now(),state,ledger});
      localStorage.setItem(EXEC_BACKUP_KEY,backup);
      if(localStorage.getItem(EXEC_BACKUP_KEY)!==backup)throw Error("backup verification");
    }
    executionLastSaved=state;return true;
  }catch(e){executionStorageOK=false;return false}
}
function executionId(){return "q-"+(globalThis.crypto&&crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2))}
function executionRound(n){return Math.round((n+Number.EPSILON)*100)/100}
function executionMonth(at){const d=new Date(at);return Number.isFinite(d.getTime())?d.getFullYear()+"年"+(d.getMonth()+1)+"月":""}
function executionKey(row){return row.dcaLedgerId?"ledger:"+row.dcaLedgerId:row.v25Id||""}
function executionFingerprint(row){return JSON.stringify([row.ts,row.mo,row.t,row.a,row.p,row.b])}
function executionSourceRows(){
  const ledger=dcaLedgerView();
  if(!ledger)return{ledger:false,rows:(Array.isArray(S.log)?S.log:[]).filter(x=>x&&x.source!=="dca-ledger"&&!x.dcaLedgerId)};
  return{ledger:true,rows:ledger.state.orders.filter(o=>o.type==="btc").map(o=>({
    ts:o.at,mo:executionMonth(o.at),t:o.strategy,a:executionRound((ledger.derived.alloc.get(o.id)||{}).cny||0),
    p:o.price,b:o.btc,cold:o.cold,source:"dca-ledger",dcaLedgerId:o.id,tp:null
  }))};
}
function executionResolve(row,bindings){
  const id=executionKey(row),binding=bindings&&Object.prototype.hasOwnProperty.call(bindings,id)?bindings[id]:null;
  const validBinding=binding&&binding.fingerprint===executionFingerprint(row);
  const choice=validBinding?binding.choice:binding?null:row.executionChoice||row.tp;
  const slot=choice!=null&&choice!=="manual"&&TR.find(t=>t.k===row.t&&t.p===Number(choice));
  return{...row,id,tp:slot?slot.p:null,executionChoice:choice==="manual"?"manual":slot?String(slot.p):null,
    resolved:row.t==="base"||!!slot||choice==="manual",bindingChanged:!!binding&&!validBinding,audit:validBinding?binding.audit:row.executionAudit||null};
}
function executionSummary(rows,month){
  const current=rows.filter(r=>r.mo===month),bud={base:0,pull:0,ext:0},slots={},issues=[];
  const ids=new Set();
  for(const r of rows){
    if(!r.id||ids.has(r.id))issues.push("记录编号缺失或重复");ids.add(r.id);
    if(!/^\d{4}年(?:[1-9]|1[0-2])月$/.test(r.mo)||!(Number.isFinite(+r.a)&&+r.a>0)||!Object.hasOwn(EXEC_LIMITS,r.t))issues.push("记录金额、月份或类型异常");
  }
  for(const r of current){
    if(Object.hasOwn(bud,r.t)&&Number.isFinite(+r.a)&&r.a>0)bud[r.t]+=+r.a;
    if(r.tp!=null&&r.resolved)slots[r.tp]=(slots[r.tp]||0)+(+r.a||0);
  }
  Object.keys(bud).forEach(k=>bud[k]=executionRound(bud[k]));
  const total=executionRound(Object.values(bud).reduce((a,b)=>a+b,0));
  return{rows,current,bud,slots,total,left:Math.max(0,2000-total),issues:[...new Set(issues)],unknown:current.filter(r=>!r.resolved)};
}
function executionView(){
  const source=executionSourceRows(),meta=S.executionV25||{},rows=source.rows.map(r=>executionResolve(r,meta.bindings));
  const view=executionSummary(rows,mstr());
  try{if(localStorage.getItem("btc_exec_v7")!==executionLastSaved)view.issues.push("另一页面已更新记录，请刷新后再执行")}catch(e){view.issues.push("本机存储不可用")}
  const mismatch=meta.reconcile&&!meta.reconcile.confirmed&&meta.reconcile.month===mstr()&&!source.ledger;
  if(mismatch)view.issues.push("旧预算计数与流水不一致，请确认采用流水汇总");
  if(!executionStorageOK)view.issues.push("本机备份或存储不可用，暂停记录");
  return{...view,ledger:source.ledger,ready:meta.schema===1&&!view.issues.length};
}
function executionInit(){
  if(!executionStorageOK)return false;
  if(!S.executionV25||S.executionV25.schema!==1){
    const before={...S.bud},month=S.month;
    S.log.forEach(r=>{if(r&&!r.dcaLedgerId&&!r.v25Id)r.v25Id=executionId()});
    S.executionV25={schema:1,createdAt:Date.now(),bindings:{},events:[],reconcile:null};
    const view=executionView();
    if(!view.ledger&&month===mstr()&&Object.keys(EXEC_LIMITS).some(k=>!Number.isFinite(+before[k])||Math.abs(+before[k]-view.bud[k])>.011))
      S.executionV25.reconcile={month,before,fromRecords:{...view.bud},confirmed:false};
  }
  executionProject();saveState();return true;
}
function executionProject(){
  const view=executionView();
  if(S.executionV25&&S.executionV25.schema===1){
    S.month=mstr();S.bud={...view.bud};
    // An unresolved legacy counter can only reduce available budget, never release it.
    const rec=S.executionV25.reconcile;
    if(rec&&!rec.confirmed&&rec.month===S.month&&!view.ledger)Object.keys(EXEC_LIMITS).forEach(k=>S.bud[k]=Math.max(S.bud[k],Number.isFinite(+rec.before[k])?+rec.before[k]:0));
  }
  return view;
}
function executionSlotRemaining(p){const t=TR.find(t=>t.p===p),v=executionView();return t?Math.max(0,executionRound(t.a-(v.slots[p]||0))):0}
function executionAudit(kind){
  const snap=decisionSnapshot();
  return{kind,at:Date.now(),rule:snap.rule,id:snap.id,market:snap.market,model:snap.model,cost:snap.cost,sources:snap.sources,
    state:snap.classified.state,priceReady:snap.priceReady,anchor:S.rh,manualAnchor:!!S.rhManual,
    simulation:!!S.tweak,budget:{...executionView().bud}};
}
function executionCommit(change){
  if(!executionStorageOK){ntf("无法安全保存，请先导出备份并检查存储权限");return false}
  let previous;
  try{
    if(localStorage.getItem(STATE_KEY)!==executionLastSaved){ntf("另一页面已修改数据，请先刷新后再记录");return false}
    previous=JSON.stringify(S);change();executionProject();
    const next=JSON.stringify(S);localStorage.setItem(STATE_KEY,next);
    if(localStorage.getItem(STATE_KEY)!==next)throw Error("write verification");
    executionLastSaved=next;return true;
  }catch(e){if(previous)S=JSON.parse(previous);ntf("未保存成功，已撤回本次修改；请先导出备份");return false}
}
function executionRefresh(){upB();rl2();trig(false,false);renderAction();renderExecutionReview()}
function executionOptions(type,value=""){
  return '<option value="">请选择归属，不自动猜档</option>'+TR.filter(t=>t.k===type).map(t=>`<option value="${t.p}"${String(t.p)===String(value)?" selected":""}>回撤 ${Math.round(t.p*100)}% 档 · ¥${t.a}</option>`).join("")+`<option value="manual"${value==="manual"?" selected":""}>计划外买入（占用本类预算，不核销档位）</option>`;
}
function executionRenderSlotInput(){
  const select=$("executionSlot"),wrap=$("executionSlotField"),type=$("ltype");if(!select||!wrap||!type)return;
  const old=select.value;select.innerHTML=executionOptions(type.value,old);wrap.hidden=type.value==="base"||!!dcaLedgerView();
}
function executionBind(id,choice){
  const view=executionView(),r=view.rows.find(x=>x.id===id);if(!r||r.t==="base")return;
  if(choice!=="manual"&&!TR.some(t=>t.k===r.t&&String(t.p)===choice)){ntf("请选择一个档位或计划外买入");return}
  if(!confirm(`将 ¥${r.a} 关联为${choice==="manual"?"计划外买入":"回撤 "+Math.round(Number(choice)*100)+"% 档"}？不会新增交易或修改持仓。`))return;
  if(executionCommit(()=>{
    const binding={choice,fingerprint:executionFingerprint(r),audit:executionAudit("事后关联")};
    S.executionV25.bindings[id]=binding;
    S.executionV25.events.push({at:Date.now(),type:"bind",id,choice});
  })){executionRefresh();ntf("归属已保存；事后关联不代表交易当时信号")}
}
function executionReconcile(){
  const view=executionView();if(!confirm(`按实际流水重新汇总本月：基础 ¥${view.bud.base}、回撤 ¥${view.bud.pull}、极端 ¥${view.bud.ext}。这可能释放旧计数占用的额度，请先核对是否缺少流水。旧计数保留在迁移备份中。确认采用？`))return;
  if(executionCommit(()=>{const r=S.executionV25.reconcile;if(r)r.confirmed=true;S.executionV25.events.push({at:Date.now(),type:"reconcile",budget:view.bud})})){executionRefresh();ntf("已采用流水汇总；没有删除任何交易")}
}
function executionExportMigration(){
  try{const raw=localStorage.getItem(EXEC_BACKUP_KEY);if(!raw)throw Error("missing");const a=document.createElement("a"),url=URL.createObjectURL(new Blob([raw],{type:"application/json"}));a.href=url;a.download="btc-before-v25.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(e){ntf("迁移备份不可用")}
}
function executionImportPair(state){
  const oldState=localStorage.getItem(STATE_KEY),oldLedger=localStorage.getItem(DCA_LEDGER_KEY);
  const ledger=dcaLedgerSanitize(state.dcaLedger);
  if(ledger){ledger.updatedAt=Date.now();state.dcaLedger=ledger}else delete state.dcaLedger;
  let ledgerWritten=false;
  try{
    if(ledger)localStorage.setItem(DCA_LEDGER_KEY,JSON.stringify(ledger));else localStorage.removeItem(DCA_LEDGER_KEY);
    ledgerWritten=true;localStorage.setItem(STATE_KEY,JSON.stringify(state));
  }catch(error){
    if(ledgerWritten){
      try{if(oldLedger==null)localStorage.removeItem(DCA_LEDGER_KEY);else localStorage.setItem(DCA_LEDGER_KEY,oldLedger);
        if(oldState==null)localStorage.removeItem(STATE_KEY);else localStorage.setItem(STATE_KEY,oldState)}catch(restoreError){throw Error("恢复失败，请保留本机导入前备份并停止继续操作")}
    }
    throw error;
  }
}
function renderExecutionReview(){
  const box=$("executionReview"),status=$("executionStatus");if(!box||!status)return;
  const v=executionView();
  status.textContent=v.issues.length?v.issues.join("；"):v.unknown.length?`本月 ${v.unknown.length} 笔待确认归属，额外加仓提示暂缓`:`本月记录已核对 · 已用 ¥${v.total} / ¥2,000`;
  const reconcile=$("executionReconcile");if(reconcile)reconcile.hidden=!(S.executionV25&&S.executionV25.reconcile&&!S.executionV25.reconcile.confirmed&&!v.ledger);
  const count=$("executionSource");if(count)count.textContent=v.ledger?"完整账本为准；旧轻量记录保留但不重复计入预算。归属信息仅保存在主站。":"轻量账本为准；预算与档位由同一批流水汇总。部分执行只扣除实际金额。";
  const recent=v.rows.slice().sort((a,b)=>b.ts-a.ts),rows=[...v.unknown,...recent.filter(r=>!v.unknown.some(x=>x.id===r.id)).slice(0,20)];
  box.innerHTML=rows.length?rows.map(r=>{
    const audit=r.audit,auditText=audit?`${audit.kind} · ${new Date(audit.at).toLocaleString("zh-CN")} · 规则 ${audit.rule} · 参考价 $${audit.market&&audit.market.price||"--"} · 评分 ${audit.model&&audit.model.score!=null?audit.model.score:"不足"}${audit.simulation?" · 微调模式":""}`:"旧记录：没有交易当时的判断快照，不补造历史信号";
    return `<article class="exec-row"><div class="exec-row-head"><strong>${esc(r.mo)} · ¥${esc(r.a)}</strong><span>${r.t==="base"?"基础定投":r.executionChoice==="manual"?"计划外":r.tp!=null?"回撤 "+Math.round(r.tp*100)+"% 档":"待确认归属"}</span></div>${r.t!=="base"?`<div class="exec-controls"><select aria-label="${esc(r.mo)} ¥${esc(r.a)} 买入归属" data-exec-id="${esc(r.id)}">${executionOptions(r.t,r.executionChoice||"")}</select><button type="button" class="btn sm" data-exec-bind="${esc(r.id)}">确认归属</button></div>`:""}<details><summary>记录与判断快照</summary><p>${esc(auditText)}</p><p>成交 $${esc(r.p)} · ${Number(r.b).toFixed(8)} BTC${r.bindingChanged?" · 原流水已改动，请重新确认归属":""}</p>${audit?`<p>记录前预算：基础 ¥${esc(audit.budget&&audit.budget.base)} / 回撤 ¥${esc(audit.budget&&audit.budget.pull)} / 极端 ¥${esc(audit.budget&&audit.budget.ext)}。完整指标与来源随 JSON 备份导出。</p>`:""}</details></article>`;
  }).join(""):'<p class="data-note">暂无执行记录。这里只记账，不发起交易。</p>';
  box.querySelectorAll("[data-exec-bind]").forEach(button=>button.addEventListener("click",()=>{const select=[...box.querySelectorAll("[data-exec-id]")].find(x=>x.dataset.execId===button.dataset.execBind);if(select)executionBind(button.dataset.execBind,select.value)}));
  executionRenderSlotInput();
}

const FLOOR_EMBEDDED={
  "schema": 2,
  "source": "https://bitview.space/api",
  "sourceDate": "2026-09-27",
  "sourceUpdatedAt": "2026-09-27T12:30:00Z",
  "updatedAt": "2026-09-27T12:30:00.346Z",
  "checkedAt": "2026-09-27T12:30:00.349Z",
  "status": "fallback",
  "model": "Consensus",
  "price": 85040.97,
  "levels": {
    "p95": 63891.5,
    "p98": 62973,
    "p99": 62365.5,
    "p995": 61568.5,
    "p999": 56433.5
  },
  "models": {
    "Raw": {
      "p95": 62942,
      "p98": 59523,
      "p99": 54074,
      "p995": 47909,
      "p999": 42356
    },
    "Cointime": {
      "p95": 63846,
      "p98": 62942,
      "p99": 62249,
      "p995": 60944,
      "p999": 53717
    },
    "CM": {
      "p95": 63762,
      "p98": 62436,
      "p99": 61478,
      "p995": 59526,
      "p999": 44106
    },
    "CM 8y": {
      "p95": 63796,
      "p98": 62434,
      "p99": 60946,
      "p995": 59571,
      "p999": 44555
    },
    "CM 4y": {
      "p95": 63867,
      "p98": 62921,
      "p99": 62228,
      "p995": 60859,
      "p999": 51078
    },
    "CM 2y": {
      "p95": 63916,
      "p98": 63004,
      "p99": 62482,
      "p995": 62193,
      "p999": 59150
    },
    "CM 1y": {
      "p95": 64127,
      "p98": 63081,
      "p99": 62942,
      "p995": 62418,
      "p999": 61128
    },
    "CM 6m": {
      "p95": 64278,
      "p98": 63111,
      "p99": 62942,
      "p995": 62584,
      "p999": 61609
    },
    "CM 3m": {
      "p95": 64386,
      "p98": 63231,
      "p99": 62961,
      "p995": 62802,
      "p999": 61674
    },
    "CM 1m": {
      "p95": 64581,
      "p98": 63789,
      "p99": 63060,
      "p995": 62942,
      "p999": 61720
    }
  }
}
;

const $=id=>document.getElementById(id);
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,
  c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function setInputIfIdle(id,value){const el=$(id);if(el&&document.activeElement!==el)el.value=value}
const fmtPrice=(n)=>Number(n).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0});
const parsePrice=(value)=>+String(value==null?"":value).replace(/,/g,"").trim()||0;
function beginPriceEdit(el){const n=parsePrice(el.value)||S.price||0;el.value=n>0?String(Math.round(n)):"";requestAnimationFrame(()=>{try{el.select()}catch(e){}})}
function endPriceEdit(el){const n=Math.round(parsePrice(el.value));if(n>0){if(n!==S.price)S.manualPrice=true;S.price=n;el.dataset.rv=n;el._rvLive=n;el.value=fmtPrice(n);renderPriceDerived()}else el.value=S.price>0?fmtPrice(S.price):""}
const PRICE_HINT_KEY="btc_price_hint_v1";
function initPriceHint(){
  const el=$("bp");if(!el||el.dataset.hintReady)return;el.dataset.hintReady="1";let timer=0;
  const clear=()=>{if(timer){clearTimeout(timer);timer=0}};
  el.addEventListener("pointerdown",()=>{clear();timer=setTimeout(()=>ntf("长按价格可临时校正"),520)},{passive:true});
  ["pointerup","pointercancel","pointerleave"].forEach(type=>el.addEventListener(type,clear,{passive:true}));
  
}
const stillMode=()=>document.visibilityState!=="visible"||matchMedia("(prefers-reduced-motion: reduce)").matches;
function rollNum(el,to,fmt,dur=240){if(!el)return;const from=Number.isFinite(el._rvLive)?el._rvLive:+el.dataset.rv;el.dataset.rv=to;
  if(el._rvRaf)cancelAnimationFrame(el._rvRaf);el._rvRaf=0;
  if(stillMode()||!Number.isFinite(from)||from===to){el._rvLive=to;el.textContent=fmt(to);return}
  const t0=performance.now();(function step(t){const p=Math.min(1,(t-t0)/dur),e=1-Math.pow(1-p,3),v=from+(to-from)*e;el._rvLive=v;
  el.textContent=fmt(v);el._rvRaf=p<1?requestAnimationFrame(step):0})(t0)}
function rollInput(el,to,dur=240){if(!el)return;const from=Number.isFinite(el._rvLive)?el._rvLive:+el.dataset.rv;el.dataset.rv=to;
  if(el._rvRaf)cancelAnimationFrame(el._rvRaf);el._rvRaf=0;
  if(document.activeElement===el){el._rvLive=to;return}
  if(stillMode()||!Number.isFinite(from)||from===to){el._rvLive=to;el.value=fmtPrice(Math.round(to));return}
  const t0=performance.now();(function step(t){
  if(document.activeElement===el){el._rvLive=to;el._rvRaf=0;return}
  const p=Math.min(1,(t-t0)/dur),e=1-Math.pow(1-p,3),v=from+(to-from)*e;el._rvLive=v;
  el.value=fmtPrice(Math.round(v));el._rvRaf=p<1?requestAnimationFrame(step):0})(t0)}
let _pfT=0;function flashPrice(dir){if(!dir||stillMode())return;const w=document.querySelector(".price-big");if(!w)return;
  w.classList.remove("pup","pdn");void w.offsetWidth;w.classList.add(dir>0?"pup":"pdn");
  clearTimeout(_pfT);_pfT=setTimeout(()=>w.classList.remove("pup","pdn"),420)}
function fadeSwap(el,text,color){if(!el)return;if(color!==undefined)el.style.color=color;
  if(el.textContent===text)return;if(stillMode()){el.textContent=text;return}
  el.style.opacity=0;setTimeout(()=>{el.textContent=text;el.style.opacity=1},240)}
const SWEEP_MAP={"价格":"hero","均线":"#ahr","减半":"#ahr","AHR999":"#ahr","MVRV":"#valuation","均衡价":"#valuation","FGI":"#valuation","200WMA":"#valuation","Puell":"#radar","RR":"#radar","SOPR":"#radar","LTH-NUPL":"#radar","LTH_PSIL":"#lthpsil","资本化价格":"#capitalized","稳定币":"#liquidity","概率":"#liquidity","资金费率":"#liquidity","Coinbase溢价":"#market","关机价":"#market"};
const SWEEP_ORDER=["hero","#ahr","#valuation","#radar","#liquidity","#market"];
function sweepTarget(k){if(k==="hero")return document.querySelector(".aurum-hero");
  const s=document.querySelector(k);if(!s)return null;
  return s.querySelector(".today-card,.chart-card,.radar-card,.liq-card,.phase-card,.fund-card,.health")||s}
function fireSweep(card){if(!card||stillMode())return;
  let w=card.querySelector(":scope>.au-sweepwrap");
  if(!w){w=document.createElement("span");w.className="au-sweepwrap";w.innerHTML='<span class="au-sweep"></span>';
  if(getComputedStyle(card).position==="static")card.style.position="relative";card.appendChild(w)}
  const s=w.firstChild;s.classList.remove("run");void s.offsetWidth;s.classList.add("run")}
function flushSweeps(){sweepCollect=false;if(!SWEEP_PENDING.size)return;
  const l=SWEEP_ORDER.filter(k=>SWEEP_PENDING.has(k));SWEEP_PENDING.clear();
  l.forEach((k,i)=>setTimeout(()=>fireSweep(sweepTarget(k)),i*90))}
function pingDot(){if(stillMode())return;const p=document.getElementById("lpulse");if(!p)return;
  p.classList.remove("run");void p.offsetWidth;p.classList.add("run")}
function ensureVendor(){if(window.LightweightCharts)return true;const el=document.getElementById("lwcVendor");if(!el)return false;try{const s=document.createElement("script");s.textContent=el.textContent;document.head.appendChild(s);if(window.LightweightCharts)el.remove()}catch(e){try{console.warn("图表组件注入失败",e&&e.message||String(e))}catch(_){}}return!!window.LightweightCharts}
const injectManifest=()=>{try{if(!/^https?:$/.test(location.protocol))return;const dir=location.href.replace(/[?#].*$/,"").replace(/[^/]*$/,""),man={name:"BTC Aurum 情报终端",short_name:"BTC情报",start_url:(()=>{try{const u=new URL(location.href);u.hash="";["v","_build","_head"].forEach(k=>u.searchParams.delete(k));return u.toString()}catch(e){return location.href.split("#")[0]}})(),scope:dir,display:"standalone",background_color:"#000000",theme_color:"#000000",icons:[{src:dir+"apple-touch-icon.png",sizes:"180x180",type:"image/png",purpose:"any"}]},l=document.getElementById("pwaManifest");if(l)l.href="data:application/manifest+json;charset=utf-8,"+encodeURIComponent(JSON.stringify(man))}catch(e){}};
const DM=[
  {w:.2,h:["深度低估区","低估区","偏热区","高估区"],t:[20,70,90]},
  {w:.15,h:["低于均线","1-1.5x 正常","1.5-2.5x 偏高",">2.5x 高估"],t:[20,40,75]},
  {w:.15,h:["<1 低估","1-2x 合理","2-3x 偏高",">3x 泡沫"],t:[25,60,80]},
  {w:.15,h:["极度恐惧","恐惧","贪婪","极度贪婪"],t:[30,50,70]},
  {w:.15,h:["<0.5 矿工底","0.5-1 正常","1-2 偏高",">2 高危"],t:[22,50,75]},
  {w:.1,h:["<0.002 买入","正常范围","0.004-0.015 偏高",">0.015 高危"],t:[22,50,80]},
  {w:.1,h:["<0.97 投降","≈1 临界","1-1.05 获利",">1.05 顶部"],t:[25,55,80]}
];
const DN=["AHR999 新拟","200周均线","MVRV","恐惧贪婪","Puell 矿工","Reserve Risk","SOPR"];
const DW=["20% · 26回归","15%","15%","15%","15%","10%","10%"];
var BV_DIM_SRC={};
const MB=[[0,.1],[30,.3],[50,.8],[70,1.2],[85,1.95],[100,3]];
const TR=[{p:.1,a:200,k:"pull"},{p:.2,a:200,k:"pull"},{p:.3,a:300,k:"pull"},{p:.4,a:150,k:"ext"},{p:.5,a:150,k:"ext"}];
const M21_SUPPLY=21000000,M21_TARGETS=[.01,.05,.1,1];
const POWER_HISTORY_URL="https://mempool.space/api/v1/historical-price?currency=USD",POWER_HISTORY_FALLBACK_URL="https://api.blockchain.info/charts/market-price?timespan=all&sampled=true&metadata=false&cors=true&format=json",POWER_HISTORY_CACHE_KEY="btc_power_history_v2",POWER_HISTORY_CACHE_TTL=24*3600*1000;
const POWER_GENESIS_TS=Date.UTC(2009,0,3)/1000,POWER_FAIR_A=-17.016,POWER_FAIR_B=5.845,POWER_SUPPORT_A=-17.466,POWER_SUPPORT_B=5.845,POWER_RESIST_A=-13.36632341,POWER_RESIST_B=5.02927337,POWER_END_TS=Date.UTC(2035,11,31)/1000;
const MINING_API_URL="https://mempool.space/api/v1/mining/hashrate/all",MINING_FALLBACK_URL="https://mempool.space/api/v1/mining/hashrate/3y",MINING_CACHE_KEY="btc_mining_trends_v2",MINING_CACHE_TTL=6*3600*1000;
const HOLDER_API_URL="https://bitview.space/api/series/bulk",HOLDER_CACHE_KEY="btc_holder_cohorts_v1",HOLDER_CACHE_TTL=6*3600*1000,HOLDER_HISTORY_KEY="cohortHistory_v1",HOLDER_HISTORY_DAYS=180,HOLDER_HISTORY_MIN_DAYS=30,HOLDER_SUBSIDY=3.125,HOLDER_BLOCKS_PER_DAY=144;
const HOLDER_COHORTS=[
  {key:"micro",range:"<0.01 BTC",name:"微型地址",series:"addrs_under_1m_sats"},
  {key:"small",range:"0.01–0.1 BTC",name:"小额地址",series:"addrs_1m_sats_to_10m_sats"},
  {key:"retail",range:"0.1–1 BTC",name:"中小额地址",series:"addrs_10m_sats_to_1btc"},
  {key:"mid",range:"1–10 BTC",name:"中等地址",series:"addrs_1btc_to_10btc"},
  {key:"large",range:"10–100 BTC",name:"大额地址",series:"addrs_10btc_to_100btc"},
  {key:"shark",range:"100–1K BTC",name:"大型地址",series:"addrs_100btc_to_1k_btc"},
  {key:"whale",range:"1K–10K BTC",name:"鲸鱼地址",series:"addrs_1k_btc_to_10k_btc"},
  {key:"mega",range:"10K–100K BTC",name:"巨鲸地址",series:"addrs_10k_btc_to_100k_btc"},
  {key:"ultra",range:"≥100K BTC",name:"超大型地址",series:"addrs_over_100k_btc"}
];
const HOLDER_DISPLAY_COHORTS=[
  {key:"lt0.1",range:"<0.1 BTC",name:"小额地址",members:["micro","small"]},
  {key:"0.1-1",range:"0.1–1 BTC",name:"中小额地址",members:["retail"]},
  {key:"1-10",range:"1–10 BTC",name:"中等地址",members:["mid"]},
  {key:"10-100",range:"10–100 BTC",name:"大额地址",members:["large"]},
  {key:"100-1k",range:"100–1K BTC",name:"大型地址",members:["shark"]},
  {key:"1k-10k",range:"1K–10K BTC",name:"鲸鱼地址",members:["whale"]},
  {key:"gte10k",range:"≥10K BTC",name:"超大型地址",members:["mega","ultra"]}
];
const CAMPS=[
  {id:"retail",name:"散户",cohorts:["lt0.1","0.1-1"]},
  {id:"core",name:"中坚",cohorts:["1-10","10-100"]},
  {id:"whale",name:"鲸鱼",cohorts:["100-1k","1k-10k"]},
  {id:"custody",name:"托管层",cohorts:["gte10k"]}
];
const HOLDER_PERIOD_LABEL={_24h:"1日",_1w:"7日",_1m:"30日"},HOLDER_PERIOD_DAYS={_24h:1,_1w:7,_1m:30};
const DEEP_LOSS_API_URL="https://bitview.space/api/series/bulk",DEEP_LOSS_CACHE_KEY="btc_deep_loss_v1",DEEP_LOSS_CACHE_TTL=6*3600*1000;
const DEEP_LOSS_RETRY_COOLDOWN=20*60*1000;
const DEEP_LOSS_LEVELS=[
  {pct:30,key:"p30",series:"utxos_over_30pct_in_loss_supply"},
  {pct:40,key:"p40",series:"utxos_over_40pct_in_loss_supply"},
  {pct:50,key:"p50",series:"utxos_over_50pct_in_loss_supply"},
  {pct:80,key:"p80",series:"utxos_over_80pct_in_loss_supply"}
];
const DEEP_LOSS_SERIES=["date","supply","utxos_in_loss_supply","utxos_over_20pct_in_loss_supply",...DEEP_LOSS_LEVELS.map(x=>x.series),"price_low","price_ath"];
const DEEP_LOSS_SEED={schema:1,stamp:"2026-08-01T06:11:18Z",rows:[
  {day:"2026-05-03",supply:20024129.27829588,loss:6760891.35101486,p20:3206968.30773947,p30:1181413.28290782,p40:0,p50:0,p80:0,priceLow:78048.66,priceAth:125651.43},
  {day:"2026-05-04",supply:20024594.90324333,loss:6814217.03204917,p20:3094365.27652987,p30:958341.90424394,p40:0,p50:0,p80:0,priceLow:78521.56,priceAth:125651.43},
  {day:"2026-05-05",supply:20025063.65321603,loss:6783522.75642025,p20:2900929.03185333,p30:705482.81605769,p40:0,p50:0,p80:0,priceLow:79637.4,priceAth:125651.43},
  {day:"2026-05-06",supply:20025504.27821583,loss:6804195.46554689,p20:2894101.76485621,p30:682528.60890445,p40:0,p50:0,p80:0,priceLow:81096.8,priceAth:125651.43},
  {day:"2026-05-07",supply:20025948.02821412,loss:6997363.15622112,p20:3083903.78064361,p30:956448.23166397,p40:0,p50:0,p80:0,priceLow:79563.99,priceAth:125651.43},
  {day:"2026-05-08",supply:20026407.4031975,loss:6886763.97146606,p20:3037761.94897729,p30:901694.83957881,p40:0,p50:0,p80:0,priceLow:79425.49,priceAth:125651.43},
  {day:"2026-05-09",supply:20026941.77812911,loss:6845350.0870962,p20:3032899.41715354,p30:836208.83463463,p40:0,p50:0,p80:0,priceLow:80245.13,priceAth:125651.43},
  {day:"2026-05-10",supply:20027410.52810517,loss:6595038.44142057,p20:2790816.4862712,p30:521265.61583481,p40:0,p50:0,p80:0,priceLow:80406.52,priceAth:125651.43},
  {day:"2026-05-11",supply:20027926.15304923,loss:6666449.18287016,p20:2852305.55491741,p30:582499.22514511,p40:0,p50:0,p80:0,priceLow:80474.03,priceAth:125651.43},
  {day:"2026-05-12",supply:20028344.90304623,loss:7024650.88127642,p20:3029335.84189451,p30:860127.90553269,p40:0,p50:0,p80:0,priceLow:80170.41,priceAth:125651.43},
  {day:"2026-05-13",supply:20028779.27799499,loss:7184963.68661187,p20:3081797.58523038,p30:1060007.7936884,p40:0,p50:0,p80:0,priceLow:79092.13,priceAth:125651.43},
  {day:"2026-05-14",supply:20029251.15297989,loss:6749914.81100693,p20:2865812.75532615,p30:676444.57377353,p40:0,p50:0,p80:0,priceLow:79248,priceAth:125651.43},
  {day:"2026-05-15",supply:20029704.27797232,loss:7242884.88283425,p20:3091204.71055126,p30:1108864.45843121,p40:0,p50:0,p80:0,priceLow:78956.09,priceAth:125651.43},
  {day:"2026-05-16",supply:20030176.15294768,loss:7603936.47284895,p20:3178229.08793543,p30:1292191.74788057,p40:0,p50:0,p80:0,priceLow:77688.64,priceAth:125651.43},
  {day:"2026-05-17",supply:20030613.65292107,loss:7666754.18342333,p20:3288123.83807716,p30:1398867.13958915,p40:0,p50:0,p80:0,priceLow:77669.23,priceAth:125651.43},
  {day:"2026-05-18",supply:20031051.1527079,loss:7758207.49207777,p20:3483288.84915653,p30:1629371.48077494,p40:0,p50:0,p80:0,priceLow:76037.88,priceAth:125651.43},
  {day:"2026-05-19",supply:20031494.90270125,loss:7801424.63365741,p20:3477815.42241659,p30:1693334.7157467,p40:0,p50:0,p80:0,priceLow:76367.29,priceAth:125651.43},
  {day:"2026-05-20",supply:20031969.90265776,loss:7654911.05094411,p20:3296244.2739747,p30:1526459.43744782,p40:0,p50:0,p80:0,priceLow:76705.15,priceAth:125651.43},
  {day:"2026-05-21",supply:20032366.77764504,loss:7460144.97155156,p20:3261760.6769287,p30:1443040.57917653,p40:0,p50:0,p80:0,priceLow:76810.7,priceAth:125651.43},
  {day:"2026-05-22",supply:20032854.27761313,loss:8095974.52870545,p20:3631635.37738368,p30:1909496.49407879,p40:0,p50:0,p80:0,priceLow:75824.23,priceAth:125651.43},
  {day:"2026-05-23",supply:20033366.77761292,loss:7816912.90740001,p20:3453701.72235283,p30:1709407.58943365,p40:0,p50:0,p80:0,priceLow:74629.69,priceAth:125651.43},
  {day:"2026-05-24",supply:20033776.15261272,loss:7659838.44254682,p20:3448940.15291333,p30:1643850.08691775,p40:0,p50:0,p80:0,priceLow:76496.37,priceAth:125651.43},
  {day:"2026-05-25",supply:20034291.77761258,loss:7644738.50126168,p20:3427547.36855156,p30:1551423.95701225,p40:0,p50:0,p80:0,priceLow:76787.46,priceAth:125651.43},
  {day:"2026-05-26",supply:20034726.15260875,loss:8063264.37182462,p20:3617574.9349622,p30:1870650.30705621,p40:0,p50:0,p80:0,priceLow:75842.93,priceAth:125651.43},
  {day:"2026-05-27",supply:20035163.6525421,loss:8304836.55441667,p20:3932689.30148211,p30:2189806.21082342,p40:25913.08874885,p50:0,p80:0,priceLow:74171.78,priceAth:125651.43},
  {day:"2026-05-28",supply:20035669.90247168,loss:8168712.65616713,p20:4162901.11036102,p30:2453616.41131527,p40:70086.4070628,p50:0,p80:0,priceLow:72558.1,priceAth:125651.43},
  {day:"2026-05-29",supply:20036107.4023888,loss:8202693.18230828,p20:4150739.80136781,p30:2474039.72956052,p40:70623.91359923,p50:0,p80:0,priceLow:73011.08,priceAth:125651.43},
  {day:"2026-05-30",supply:20036551.15234781,loss:8059255.81686972,p20:4069103.96247383,p30:2382161.37984331,p40:56459.00539041,p50:0,p80:0,priceLow:73276.79,priceAth:125651.43},
  {day:"2026-05-31",supply:20037001.1523178,loss:8021466.05158202,p20:3983288.86162342,p30:2378712.58597805,p40:47999.61496038,p50:0,p80:0,priceLow:73322.84,priceAth:125651.43},
  {day:"2026-06-01",supply:20037423.02717851,loss:8502840.38161621,p20:4678499.04278031,p30:2763218.02108623,p40:247486.98286781,p50:0,p80:0,priceLow:70847.8,priceAth:125651.43},
  {day:"2026-06-02",supply:20037766.77706787,loss:9672306.17385586,p20:6236239.53660784,p30:3450826.78633876,p40:1270206.83448471,p50:0,p80:0,priceLow:66853.7,priceAth:125651.43},
  {day:"2026-06-03",supply:20038104.27699146,loss:9995252.43196293,p20:6474741.32748133,p30:3885486.21275746,p40:1892106.25828451,p50:0,p80:0,priceLow:64751.85,priceAth:125651.43},
  {day:"2026-06-04",supply:20038548.02685009,loss:10213214.61848947,p20:6645010.80930006,p30:4352463.59757205,p40:2345252.6799956,p50:0,p80:0,priceLow:62386.42,priceAth:125651.43},
  {day:"2026-06-05",supply:20038969.90174006,loss:10441301.8868048,p20:7090597.47668611,p30:4885827.9901687,p40:2660391.28531701,p50:49021.45273533,p80:0,priceLow:59587.43,priceAth:125651.43},
  {day:"2026-06-06",supply:20039351.15171468,loss:10550578.31258406,p20:7276543.52266223,p30:5117027.46268753,p40:2785036.03998996,p50:128357.60638446,p80:0,priceLow:59863.05,priceAth:125651.43},
  {day:"2026-06-07",supply:20039716.77668165,loss:9987273.44908706,p20:6626819.82259596,p30:4533198.37320113,p40:2345793.15848198,p50:0,p80:0,priceLow:60831.67,priceAth:125651.43},
  {day:"2026-06-08",supply:20040113.65053302,loss:10027682.84363467,p20:6607796.85167291,p30:4345845.12923919,p40:2332941.77782245,p50:0,p80:0,priceLow:62514.37,priceAth:125651.43},
  {day:"2026-06-09",supply:20040501.1504601,loss:10360722.50623858,p20:7044479.99997171,p30:4731635.11661538,p40:2635096.29887657,p50:26884.30759392,p80:0,priceLow:61063.77,priceAth:125651.43},
  {day:"2026-06-10",supply:20040894.89908714,loss:10402436.44831291,p20:7137386.92346794,p30:4889992.03052869,p40:2688777.73507728,p50:60351.05665892,p80:0,priceLow:60981.91,priceAth:125651.43},
  {day:"2026-06-11",supply:20041316.76674345,loss:9795269.41397912,p20:6576118.93782896,p30:4311928.99947582,p40:2318417.36155236,p50:0,p80:0,priceLow:61470.45,priceAth:125651.43},
  {day:"2026-06-12",supply:20041776.13997128,loss:9841334.95105439,p20:6563057.5974866,p30:4298520.28610877,p40:2311987.89700856,p50:0,p80:0,priceLow:63049.7,priceAth:125651.43},
  {day:"2026-06-13",supply:20042163.63996518,loss:9430067.61600471,p20:6405887.36819025,p30:4020683.19039424,p40:1912623.80089711,p50:0,p80:0,priceLow:63400.87,priceAth:125651.43},
  {day:"2026-06-14",supply:20042619.88993958,loss:9333122.70786566,p20:6287891.15478575,p30:3705008.5378491,p40:1672558.94154568,p50:0,p80:0,priceLow:63790.13,priceAth:125651.43},
  {day:"2026-06-15",supply:20043088.63989031,loss:9293259.59137702,p20:6204815.78622624,p30:3551337.33051407,p40:1481507.24775852,p50:0,p80:0,priceLow:65330.46,priceAth:125651.43},
  {day:"2026-06-16",supply:20043594.88989026,loss:9492070.23753387,p20:6263686.54752038,p30:3670649.20843162,p40:1658985.511767,p50:0,p80:0,priceLow:65449.5,priceAth:125651.43},
  {day:"2026-06-17",supply:20044007.38989023,loss:9585048.28121646,p20:6374883.37090369,p30:4009197.62331732,p40:1907293.44766076,p50:0,p80:0,priceLow:64019.89,priceAth:125651.43},
  {day:"2026-06-18",supply:20044523.01489016,loss:10122590.04345973,p20:6598392.99572412,p30:4508816.40687497,p40:2403505.33287612,p50:40.15585443,p80:0,priceLow:62388.54,priceAth:125651.43},
  {day:"2026-06-19",supply:20044994.88988848,loss:9887526.29615489,p20:6517646.92018228,p30:4455393.50655071,p40:2306847.02169738,p50:0,p80:0,priceLow:62385.87,priceAth:125651.43},
  {day:"2026-06-20",supply:20045479.26488566,loss:9470530.3792004,p20:6404031.47324205,p30:4019765.88130965,p40:1979961.78684609,p50:0,p80:0,priceLow:63136.1,priceAth:125651.43},
  {day:"2026-06-21",supply:20045898.01488521,loss:9900216.93918544,p20:6497796.38835529,p30:4270106.28860389,p40:2290989.97696805,p50:0,p80:0,priceLow:63362.23,priceAth:125651.43},
  {day:"2026-06-22",supply:20046385.51488518,loss:9725225.71949408,p20:6424314.99554785,p30:4121903.77944485,p40:2026352.89856054,p50:0,p80:0,priceLow:63210.7,priceAth:125651.43},
  {day:"2026-06-23",supply:20046926.1396701,loss:10132844.71549566,p20:6720009.96513597,p30:4555473.5697937,p40:2447339.78369896,p50:2485.77858084,p80:0,priceLow:62247.62,priceAth:125651.43},
  {day:"2026-06-24",supply:20047410.51467006,loss:10590806.45155914,p20:7036264.8458567,p30:5016976.61482314,p40:2689708.30511947,p50:81725.92598509,p80:0,priceLow:59520.03,priceAth:125651.43},
  {day:"2026-06-25",supply:20047941.76466005,loss:10648984.14274636,p20:7227914.76040941,p30:5083535.72110131,p40:2866197.6863738,p50:201673.91973752,p80:0,priceLow:58788.31,priceAth:125651.43},
  {day:"2026-06-26",supply:20048426.13963909,loss:10543241.1256367,p20:7219637.88916798,p30:5072478.4454589,p40:2868882.31485819,p50:201805.30939675,p80:0,priceLow:58774.21,priceAth:125651.43},
  {day:"2026-06-27",supply:20048951.13963361,loss:10575427.1954533,p20:7144269.29846197,p30:5068224.42320972,p40:2825542.69774753,p50:162043.7686258,p80:0,priceLow:59644.47,priceAth:125651.43},
  {day:"2026-06-28",supply:20049354.26461839,loss:10808729.36682645,p20:7240047.26900489,p30:5284458.01765402,p40:2873893.75197536,p50:234135.99355547,p80:0,priceLow:59143.59,priceAth:125651.43},
  {day:"2026-06-29",supply:20049744.88961828,loss:10389008.97595822,p20:7102687.73472448,p30:5015861.81930601,p40:2810167.28257111,p50:150198.30058811,p80:0,priceLow:59204.17,priceAth:125651.43},
  {day:"2026-06-30",supply:20050210.51461277,loss:10851937.02240491,p20:7383773.91129463,p30:6037569.37192529,p40:3061698.89142013,p50:518543.59031499,p80:0,priceLow:58238.72,priceAth:125651.43},
  {day:"2026-07-01",supply:20050657.38961212,loss:10336604.20456116,p20:7062926.04718555,p30:4992273.15516084,p40:2791006.21559867,p50:147966.77271721,p80:0,priceLow:58246.21,priceAth:125651.43},
  {day:"2026-07-02",supply:20051066.7645992,loss:10057812.92169372,p20:6782968.50009146,p30:4719945.04866376,p40:2552720.10708755,p50:53258.88092929,p80:0,priceLow:59584.85,priceAth:125651.43},
  {day:"2026-07-03",supply:20051538.63948121,loss:9630062.26141535,p20:6594387.57289935,p30:4462711.9656925,p40:2388028.7148924,p50:2370.1189947,p80:0,priceLow:61177.67,priceAth:125651.43},
  {day:"2026-07-04",supply:20052019.88948118,loss:9495497.38891098,p20:6374326.36458453,p30:4385773.77326172,p40:2244612.71068684,p50:0,p80:0,priceLow:62365.77,priceAth:125651.43},
  {day:"2026-07-05",supply:20052419.88934563,loss:9352039.11221524,p20:6308069.97934227,p30:4157664.63219636,p40:2033108.78952619,p50:0,p80:0,priceLow:62400.09,priceAth:125651.43},
  {day:"2026-07-06",supply:20052782.38934561,loss:9185003.38139159,p20:6280535.03860864,p30:4035501.29611203,p40:1962127.86688641,p50:0,p80:0,priceLow:61709.68,priceAth:125651.43},
  {day:"2026-07-07",supply:20053216.76091219,loss:9442737.43969303,p20:6311207.94071346,p30:4151580.64954259,p40:2195414.84848365,p50:0,p80:0,priceLow:63001.14,priceAth:125651.43},
  {day:"2026-07-08",supply:20053635.51089914,loss:9825511.50349364,p20:6572464.07683145,p30:4487064.67012122,p40:2387668.93819235,p50:4010.03897729,p80:0,priceLow:61685.84,priceAth:125651.43},
  {day:"2026-07-09",supply:20054026.13588755,loss:9469559.15884607,p20:6347606.19482807,p30:4358532.72076143,p40:2235874.60463601,p50:0,p80:0,priceLow:61753.78,priceAth:125651.43},
  {day:"2026-07-10",supply:20054432.38588748,loss:8998302.85980959,p20:6251378.0453119,p30:3965069.36871855,p40:1954627.6639988,p50:0,p80:0,priceLow:63055.52,priceAth:125651.43},
  {day:"2026-07-11",supply:20054866.76088737,loss:9121915.33669605,p20:6250988.55255876,p30:4017362.32666656,p40:1956043.43090571,p50:0,p80:0,priceLow:63865.61,priceAth:125651.43},
  {day:"2026-07-12",supply:20055316.76088731,loss:9326468.54334468,p20:6249343.37083774,p30:4054481.3445203,p40:1955708.22645895,p50:0,p80:0,priceLow:63805.33,priceAth:125651.43},
  {day:"2026-07-13",supply:20055776.1358873,loss:10061544.48907854,p20:6467139.89001199,p30:4484292.48621038,p40:2416528.94946031,p50:19002.77267471,p80:0,priceLow:61815.59,priceAth:125651.43},
  {day:"2026-07-14",supply:20056257.38587634,loss:8677481.31616178,p20:6149880.02706352,p30:3794065.46365746,p40:1791936.84911676,p50:0,p80:0,priceLow:62297.72,priceAth:125651.43},
  {day:"2026-07-15",supply:20056694.88585184,loss:8772313.30883637,p20:6134078.62926275,p30:3715417.78226181,p40:1776450.60472907,p50:0,p80:0,priceLow:64536.96,priceAth:125651.43},
  {day:"2026-07-16",supply:20057073.01084605,loss:9086245.40754373,p20:6189996.1258168,p30:3937036.30925953,p40:1939719.87115948,p50:0,p80:0,priceLow:63872.65,priceAth:125651.43},
  {day:"2026-07-17",supply:20057469.88583886,loss:9050649.67159842,p20:6179367.73812629,p30:3996416.65576062,p40:1939476.61486997,p50:0,p80:0,priceLow:62559.69,priceAth:125651.43},
  {day:"2026-07-18",supply:20057988.63582885,loss:8671870.78586044,p20:6113803.11463754,p30:3771883.84030141,p40:1788679.12006602,p50:0,p80:0,priceLow:63830.05,priceAth:125651.43},
  {day:"2026-07-19",supply:20058504.26071881,loss:8716432.45319615,p20:6113046.23186497,p30:3797706.19864497,p40:1789289.59126262,p50:0,p80:0,priceLow:64412.02,priceAth:125651.43},
  {day:"2026-07-20",supply:20058960.51071372,loss:8606588.18689365,p20:6020784.38313277,p30:3609894.80867508,p40:1585084.76886963,p50:0,p80:0,priceLow:63854.09,priceAth:125651.43},
  {day:"2026-07-21",supply:20059391.76069777,loss:8440321.34503038,p20:5947114.39050402,p30:3399905.35295783,p40:1405792.99632751,p50:0,p80:0,priceLow:65266.88,priceAth:125651.43},
  {day:"2026-07-22",supply:20059751.13567675,loss:8545399.54213248,p20:5943919.54202386,p30:3448920.77845189,p40:1407919.93171356,p50:0,p80:0,priceLow:65439.41,priceAth:125651.43},
  {day:"2026-07-23",supply:20060163.6356458,loss:8696113.72975616,p20:6010259.08686435,p30:3607485.54984609,p40:1581646.94397465,p50:0,p80:0,priceLow:64596.73,priceAth:125651.43},
  {day:"2026-07-24",supply:20060644.8855907,loss:9120011.67599713,p20:6152078.18288178,p30:3900284.25835773,p40:1926877.01844288,p50:0,p80:0,priceLow:63852.25,priceAth:125651.43},
  {day:"2026-07-25",supply:20061076.13557864,loss:8936485.16329788,p20:6097853.87958748,p30:3849953.55129684,p40:1819182.3657563,p50:0,p80:0,priceLow:63826.29,priceAth:125651.43},
  {day:"2026-07-26",supply:20061532.38557611,loss:8638467.74473828,p20:5995930.61545271,p30:3576238.54865005,p40:1573040.56651887,p50:0,p80:0,priceLow:64347.95,priceAth:125651.43},
  {day:"2026-07-27",supply:20061963.63557609,loss:9212961.29711305,p20:6142478.71218898,p30:3900498.06582637,p40:1922408.17646243,p50:0,p80:0,priceLow:63932.13,priceAth:125651.43},
  {day:"2026-07-28",supply:20062360.51057517,loss:9380424.14742451,p20:6141920.65604628,p30:4019939.87346621,p40:1925610.30050005,p50:0,p80:0,priceLow:63049.11,priceAth:125651.43},
  {day:"2026-07-29",supply:20062807.3855751,loss:9280965.55976131,p20:6133021.97229311,p30:3957496.89819494,p40:1920932.18804104,p50:0,p80:0,priceLow:63360.96,priceAth:125651.43},
  {day:"2026-07-30",supply:20063285.51057501,loss:8697057.2124239,p20:6067170.97806831,p30:3695848.83651283,p40:1763919.85983542,p50:0,p80:0,priceLow:63752.08,priceAth:125651.43},
  {day:"2026-07-31",supply:20063776.13557344,loss:9827868.02146479,p20:6179608.235467,p30:4270382.82407045,p40:2192302.16509529,p50:0,p80:0,priceLow:62399.3,priceAth:125651.43}
]};
const BITVIEW_API_BULK_URL="https://bitview.space/api/series/bulk",BITVIEW_FLOOR_CACHE_KEY="btc_bitview_floor_v2",BITVIEW_FLOOR_CACHE_TTL=6*3600*1000,BITVIEW_FLOOR_FAIL_KEY="btc_bitview_floor_fail_v2",BITVIEW_FLOOR_FAIL_TTL=20*60*1000;
let bitviewFloorLastCheck=0,bitviewFloorLastFailure=0,bitviewFloorError="",bitviewFloorMemoryOnly=false,bitviewFloorTimer=null;
const BITVIEW_MODEL_DEFS=[
  {name:"Raw",id:"raw"},{name:"Cointime",id:"cointime"},{name:"CM",id:"coinflow"},{name:"CM 8y",id:"coinflow_8y"},{name:"CM 4y",id:"coinflow_4y"},
  {name:"CM 2y",id:"coinflow_2y"},{name:"CM 1y",id:"coinflow_1y"},{name:"CM 6m",id:"coinflow_6m"},{name:"CM 3m",id:"coinflow_3m"},{name:"CM 1m",id:"coinflow_1m"}
];
const BITVIEW_MODEL_ORDER=BITVIEW_MODEL_DEFS.map(x=>x.name),BITVIEW_FLOOR_PCTS=["pct95","pct98","pct99","pct99_5","pct99_9"];
const BITVIEW_FLOOR_SERIES=["date","price",...BITVIEW_MODEL_DEFS.flatMap(m=>BITVIEW_FLOOR_PCTS.map(p=>`bedrock_${m.id}_floor_${p}`))];
const BITVIEW_FLOOR_SEED=FLOOR_EMBEDDED;
const BITVIEW_OVERVIEW_SERIES=["date","capital_sentiment_phase","capital_sentiment_score","sth_realized_price","true_market_mean","active_price","rarity_meter_coins_in_loss_rank","rarity_meter_profit_taking_rank","rarity_meter_capitulation_rank","rarity_meter_peak_regret_rank","rarity_meter_seller_exhaustion_rank"];
const BITVIEW_OVERVIEW_CACHE_KEY="btc_bitview_overview_v1",BITVIEW_OVERVIEW_CACHE_TTL=6*3600*1000;
const BITVIEW_RARITY_META=[{key:"coins",label:"亏损筹码"},{key:"profit",label:"获利了结"},{key:"capitulation",label:"投降亏损"},{key:"regret",label:"高位后悔"},{key:"exhaustion",label:"卖方衰竭"}];
const BITVIEW_LTH_SERIES=["date","lth_sopr_1w","lth_realized_profit_to_loss_ratio_1w","lth_coindays_destroyed_sum_1w"],BITVIEW_LTH_CACHE_KEY="btc_bitview_lth_pulse_v1",BITVIEW_LTH_CACHE_TTL=6*3600*1000;
const BITVIEW_PSIL_SERIES=["date","lth_supply_in_loss_share","price"],BITVIEW_PSIL_CACHE_KEY="btc_bitview_lth_psil_v1",BITVIEW_PSIL_CACHE_TTL=6*3600*1000;
const BITVIEW_COST_BASIS_SERIES=["date","price","sth_realized_price","true_market_mean"],BITVIEW_COST_BASIS_CACHE_KEY="btc_bitview_cost_basis_v1",BITVIEW_COST_BASIS_CACHE_TTL=6*3600*1000;
const BITVIEW_CAPITALIZED_SERIES=["date","price","sth_capitalized_price","lth_capitalized_price","capitalized_price"],BITVIEW_CAPITALIZED_CACHE_KEY="btc_bitview_capitalized_price_v1",BITVIEW_CAPITALIZED_CACHE_TTL=6*3600*1000;
const CUSTODY_API={fees:"https://bitview.space/api/v1/fees/recommended",mempool:"https://bitview.space/api/mempool",difficulty:"https://bitview.space/api/v1/difficulty-adjustment"},CUSTODY_CACHE_KEY="btc_custody_window_v1",CUSTODY_CACHE_TTL=10*60*1000;
const BITVIEW_OVERVIEW_SEED={schema:1,day:"2026-08-08",stamp:"2026-08-08T14:07:47Z",days:["2026-08-08"],phases:["deep_bear"],scores:[-2],sth:67409.25,trueMean:75826.97,active:83073.91,rarity:{coins:0,profit:0,capitulation:0,regret:0,exhaustion:0}};
const BITVIEW_LTH_SEED={schema:1,day:"2026-08-08",stamp:"2026-08-08T14:07:47Z",days:["2026-08-08"],sopr:[0.868367],pl:[0.484478],cdd:[151014342.175]};
const CUSTODY_SEED={schema:1,ts:Date.parse("2026-08-08T14:15:00Z"),fees:{fastestFee:1.5,halfHourFee:1.011,hourFee:.56,economyFee:.2,minimumFee:.1},mempool:{count:63807,vsize:38964287,total_fee:7873617},difficulty:{progressPercent:98.0655,difficultyChange:.6706,estimatedRetargetDate:1786229868000,remainingBlocks:39}};
// 冷启动保险层：仅在实时源和本机成功缓存都不可用时启用。
// 数值来自 2026-08-21 已成功显示的最近有效快照；界面必须标注数据日，不得冒充实时值。
const CHAIN_LAST_GOOD_SNAPSHOT={
  day:"2026-08-21",ts:Date.parse("2026-08-21T00:00:00Z"),
  metrics:{
    "SOPR":{key:"sopr",values:{sopr:1.012,prevSopr:1.001},series:[
      {day:"2026-07-22",value:1.007},{day:"2026-08-14",value:.998},{day:"2026-08-20",value:1.001},{day:"2026-08-21",value:1.012}
    ]},
    "Puell":{key:"puell",values:{puell:.754,prevPuell:.676},series:[
      {day:"2026-07-22",value:.721},{day:"2026-08-14",value:.762},{day:"2026-08-20",value:.676},{day:"2026-08-21",value:.754}
    ]},
    "RR":{key:"rr",values:{rr:.0006,prevRr:.00057},series:[
      {day:"2026-07-22",value:.00056},{day:"2026-08-14",value:.00053},{day:"2026-08-20",value:.00057},{day:"2026-08-21",value:.0006}
    ]},
    "LTH-NUPL":{key:"lthnupl",values:{lthNupl:.3289,prevLthNupl:.2906},series:[
      {day:"2026-07-22",value:.2578},{day:"2026-08-14",value:.2254},{day:"2026-08-20",value:.2906},{day:"2026-08-21",value:.3289}
    ]}
  }
};
const FLOOR_API={
  date:"https://bitview.space/api/series/date/day1?start=2014-01-01",
  price:"https://bitview.space/api/series/price/day1?start=2014-01-01",
  cost:"https://bitview.space/api/series/cost_basis_per_coin_pct50/day1?start=2014-01-01"
};
const FLOOR_CACHE_KEY="btc_utxo_floor_v1",FLOOR_CACHE_TTL=24*3600*1000;
const COST_STATE_KEY="btc_cost_structure_state_v1";
const FLOOR_SEED=[["2015-01-01",314.39,330,309.76,301.51],["2015-04-01",245.84,257,220.71,208.46],["2015-07-01",257.89,243,210.02,200.3],["2015-10-01",237.58,237,207.25,196.96],["2016-01-01",433.57,282,249.87,237.88],["2016-04-01",416.94,338,303.29,287.88],["2016-07-01",676.17,392,352.59,334.59],["2016-10-01",611.13,417,377.66,357.22],["2017-01-01",999.19,442,404.56,378.99],["2017-04-01",1072.62,551,506.9,473.55],["2017-07-01",2418.18,612,564.98,526.76],["2017-10-01",4341.26,822,761.25,710.63],["2018-01-01",13506.63,2549,2368.15,2212.21],["2018-04-01",6804.1,3506,3269.82,3059.58],["2018-07-01",6383.76,4357,4077.81,3831.33],["2018-10-01",6557.08,5750,5392.64,5065.38],["2019-01-01",3833.42,3865,3581.45,3342.45],["2019-04-01",4141.58,3850,3565.81,3341.26],["2019-07-01",10525.85,4101,3807.18,3572.79],["2019-10-01",8322.87,5564,5180.4,4866.97],["2020-01-01",7163.73,6434,5998.87,5652.08],["2020-04-01",6666.46,6199,5779.55,5431.27],["2020-07-01",9225.75,6695,6252.13,5884.36],["2020-10-01",10600.06,7167,6708.31,6309.77],["2021-01-01",29310.83,8138,7629.09,7174.66],["2021-04-01",58889.08,9263,8697.35,8204.4],["2021-07-01",33465.93,10246,9633.27,9125.07],["2021-10-01",47957.6,11088,10438.67,9897.26],["2022-01-01",47332.22,13161,12413.68,11810.98],["2022-04-01",46231.75,16980,16028.08,15255.01],["2022-07-01",19309.6,19156,18092.27,17227.37],["2022-10-01",19282.25,19179,18146.02,17252.37],["2023-01-01",16595.17,16595,15697.16,14932.48],["2023-04-01",28503.61,16978,16080.89,15318.38],["2023-07-01",30551.17,19284,18308.61,17419.59],["2023-10-01",27868.77,20230,19227.94,18314.66],["2024-01-01",43739.99,21842,20806.9,19802],["2024-04-01",69939.43,26288,25096.82,23887.76],["2024-07-01",63063.53,27537,26319.72,25121.13],["2024-10-01",60913.79,29190,27932.52,26649.05],["2025-01-01",94460.79,36899,35344.04,33742.57],["2025-04-01",85128.69,39279,37694.72,35960.59],["2025-07-01",105794.69,42742,41120.73,39229.1],["2025-10-01",117739.73,50320,48488.94,46234.93],["2026-01-01",88448.95,61681,59520.75,56727.83],["2026-04-01",68256.91,63762,61562.37,58665.84],["2026-07-01",60246.33,61022,58909.4,56212.41],["2026-07-23",65361.01,62419,60276.47,57506.7]];
const CORE_HEALTH=["AHR999","200WMA","MVRV","FGI","Puell","RR","SOPR"];
const MODULE_HEALTH=["BRK信号","Floor模型","UTXO底价","成本状态机","幂律历史","矿业趋势","持币群体","成本基础","资本化价格","LTH花费","LTH筹码集中","URPD","深度亏损","自托管窗口","定投回测"];
const SOURCE_ORDER=["价格","价格共识","AHR999","200WMA","均线","FGI","资金费率","Coinbase溢价","减半","关机价","MVRV","均衡价","概率","USDT","USDC","LTH-NUPL","LTH_PSIL","SOPR","Puell","RR",...MODULE_HEALTH];
const CACHE_KEY="btc_live_v9",STATE_KEY="btc_exec_v7",UPDATE_META_KEY="btc_update_meta_v1",BG_API_KEY_KEY="btc_bg_api_key_v1",CACHE_TTL=30*60*1000,STABLE_FLOW_THRESHOLD=1e9;
const DAILY_KEY="btc_daily_v1",METRIC_HISTORY_CACHE_KEY="btc_metric_history_v1";
const LEGACY_STATUS_HISTORY_KEY="btc_status_history_v1",PREV_STATUS_HISTORY_KEY="btc_indicator_history_v2",STATUS_HISTORY_KEY="btc_indicator_history_v3";
const BINANCE_BASES=["https://data-api.binance.vision","https://api-gcp.binance.com","https://api.binance.com"];
const SLOW_TTL=24*3600*1000,BG_FAILURE_TTL=60*60*1000,STABLE_TTL=12*3600*1000,STABLE_DATA_STALE_MS=3*86400000,CHAIN_STALE_MS=3*86400000,VALUATION_CACHE_KEY="btc_valuation_cache_v1";
const POLYMARKET_EVENT_SLUG="what-price-will-bitcoin-hit-before-2027",POLYMARKET_EVENT_END=Date.parse("2027-01-01T00:00:00Z"),POLYMARKET_DOWN_PRICE=50000,POLYMARKET_UP_PRICE=100000,POLYMARKET_YEAR=2026,POLYMARKET_MARKET_KEY=`${POLYMARKET_EVENT_SLUG}|${POLYMARKET_DOWN_PRICE}|${POLYMARKET_UP_PRICE}`;
const AHR_A=5.5856,AHR_B=-16.1567,AHR_A0=5.84,AHR_B0=-17.01,MINER_EFF_LO=12,MINER_EFF_HI=37.3,ELEC_KWH=.06;
// V22.3.15 · 2026 重拟合把 AHR999 整体抬高，经典 0.45/1.2/5 阈值必须同比例平移，否则分区与评分系统性偏冷。
// k = pl_classic / pl_new，与价格无关，只随币龄缓慢漂移（2026-08 ≈ 1.305）。
const AHR_GENESIS_MS=Date.UTC(2009,0,3);
function ahrCoinDays(ts){const t=Number.isFinite(+ts)&&+ts>0?+ts:Date.now();return Math.max(1,Math.floor((t-AHR_GENESIS_MS)/864e5))}
function ahrShift(ts){const l=Math.log10(ahrCoinDays(ts));return Math.pow(10,(AHR_A0-AHR_A)*l+(AHR_B0-AHR_B))}
const MODEL_MIN_RELIABLE=4,MODEL_MIN_COVERAGE=3.5,RADAR_MIN_SAMPLES=90;
const SCORE_FIELDS=["ahr","wmaRatio","mvrv","fgi","puell","rr","sopr"];
const SCORE_MAPPERS=[ahr999ToSc,wma200ToSc,mvrvToSc,fgiToSc,puellToSc,rrToSc,soprToSc];
const SOURCE_STALE_MS={"价格":30*60*1000,"价格共识":30*60*1000,"资金费率":16*3600*1000,"Coinbase溢价":2*3600*1000,"200WMA":10*86400000,"概率":2*86400000,"FGI":2*86400000,"均线":3*86400000,"AHR999":3*86400000,"MVRV":3*86400000,"均衡价":3*86400000,"USDT":3*86400000,"USDC":3*86400000,"LTH-NUPL":3*86400000,"LTH_PSIL":3*86400000,"SOPR":3*86400000,"Puell":3*86400000,"RR":3*86400000,"关机价":3*86400000,"减半":3*86400000,"BRK信号":3*86400000,"Floor模型":3*86400000,"成本状态机":3*86400000,"LTH花费":3*86400000,"自托管窗口":30*60*1000};
const ENDPOINT_LABELS={"bitview.space":"Bitview / BRK","data-api.binance.vision":"Binance","api-gcp.binance.com":"Binance","api.binance.com":"Binance","www.okx.com":"OKX","api.exchange.coinbase.com":"Coinbase","community-api.coinmetrics.io":"Coin Metrics","api.alternative.me":"Alternative.me","stablecoins.llama.fi":"DefiLlama","api.coingecko.com":"CoinGecko","api.bitcoin-data.com":"Bitcoin Data","api.bgeometrics.com":"BGeometrics","bitcoin-data.com":"Bitcoin Data","mempool.space":"mempool.space","gamma-api.polymarket.com":"Polymarket","api.blockchain.info":"Blockchain.com","blockchain.info":"Blockchain.com"};
let HEALTH={},FALLBACK_HEALTH={},METRIC_PREV={},METRIC_HISTORY={},progActive=false,progN=0,PROG_EST=26,priceTimer=null,fullTimer=null,fetchInFlight=false,priceTickInFlight=false,lastTickAt=0,lastFullAt=0,personalChart=null,personalSeries=null,personalMarkers=null,decisionChart=null,decisionSeries=null,decisionMarkers=null,decisionRange="1Y",decisionMode="D",decisionDataKey="",decisionHalvingTime=null,miningData=null,miningSource="",miningLoading=false,miningRange="1Y",miningHashChart=null,miningHashSeries=null,miningHashDataKey="",miningDiffChart=null,miningDiffSeries=null,miningDiffDataKey="",holderData=null,holderSource="",holderLoading=false,holderPeriod="_24h",holderHistory={},deepLossData=DEEP_LOSS_SEED,deepLossSource="snapshot",deepLossFailAt=0,deepLossLoading=false,moduleHealthRaf=0;
let ENDPOINT_HEALTH={},HEALTH_FILTER="all",HEALTH_RUNTIME={online:navigator.onLine!==false,storageOk:null,persistent:null,storageUsage:null,storageQuota:null,swState:"检查中",lastSyncAt:0,lastSyncDuration:null,lastSyncOk:null,priceConsensus:null};
let DAILY=[],STATUS_HISTORY=[],personalDataKey="",personalDefaultLabel="",onPTimer=null,lastHistorySaveAt=0,intelligenceRaf=0,calcSaveTimer=0,ntfTimer=0,SWEEP_PENDING=new Set(),sweepCollect=false,BOOT_PAINTED=false;
let bitviewFloorData=BITVIEW_FLOOR_SEED,bitviewFloorSource="snapshot",bitviewFloorLoading=false,bitviewOverviewData=BITVIEW_OVERVIEW_SEED,bitviewOverviewSource="snapshot",bitviewOverviewLoading=false,lthPulseData=BITVIEW_LTH_SEED,lthPulseSource="snapshot",lthPulseLoading=false,lthPsilData=null,lthPsilSource="",lthPsilLoading=false,lthPsilRange="ALL",lthPsilResizeObserver=null,lthPsilPlot=null,costBasisData=null,costBasisSource="",costBasisLoading=false,costBasisRange="ALL",costBasisResizeObserver=null,costBasisPlot=null,capitalizedData=null,capitalizedSource="",capitalizedLoading=false,capitalizedRange="ALL",capitalizedResizeObserver=null,capitalizedPlot=null,custodyData=CUSTODY_SEED,custodySource="snapshot",custodyLoading=false;
let floorRows=FLOOR_SEED.slice(),floorRange="ALL",floorSource="snapshot",floorStamp="2026-07-23T12:50:25Z",floorLoading=false,floorResizeObserver=null,floorPlot=null;
let powerHistory=[],powerSource="local",powerProvider="",powerLoading=false,powerResizeObserver=null,powerPlot=null;
function endpointName(url){try{const host=new URL(url,location.href).hostname;return ENDPOINT_LABELS[host]||host.replace(/^www\./,"")}catch(e){return"未知接口"}}
function shortEndpointError(error){const s=String(error&&error.name==="AbortError"?"超时":error&&error.message||error||"请求失败");return s.replace(/https?:\/\/\S+/g,"").trim().slice(0,48)||"请求失败"}
function recordEndpoint(url,ok,latency,error){
  const name=endpointName(url),old=ENDPOINT_HEALTH[name]||{name,attempts:0,successes:0,failures:0,consecutiveFailures:0};
  old.attempts++;old.lastAt=Date.now();old.lastLatency=Number.isFinite(+latency)?Math.max(0,Math.round(+latency)):null;old.lastOk=!!ok;
  if(ok){old.successes++;old.consecutiveFailures=0;old.lastOkAt=old.lastAt;old.lastError=""}
  else{old.failures++;old.consecutiveFailures++;old.lastErrorAt=old.lastAt;old.lastError=shortEndpointError(error)}
  ENDPOINT_HEALTH[name]=old;
  if($("healthPanel")&&$("healthPanel").open&&!moduleHealthRaf)moduleHealthRaf=requestAnimationFrame(()=>{moduleHealthRaf=0;renderHealth()});
}
function updatePriceConsensus(results){
  const quotes=(results||[]).filter(x=>x&&x.status==="fulfilled"&&x.value&&x.value.price>0).map(x=>({source:x.value.source,price:+x.value.price}));
  if(!quotes.length){HEALTH_RUNTIME.priceConsensus={quotes:[],spread:null,status:"fail",at:Date.now()};markHealth("价格共识","fail","三家现货源均未响应");renderHealth();return}
  const prices=quotes.map(x=>x.price).sort((a,b)=>a-b),median=prices[Math.floor(prices.length/2)],spread=quotes.length>1?(prices.at(-1)-prices[0])/median*100:null;
  const status=quotes.length<2?"fallback":spread>1?"conflict":spread>.35?"fallback":"ok",detail=quotes.length<2?`仅 ${quotes.length}/3 源响应`:`${quotes.length}/3 源 · 最大偏差 ${spread.toFixed(2)}%`;
  HEALTH_RUNTIME.priceConsensus={quotes,spread,status,at:Date.now()};markHealth("价格共识",status,detail,Date.now(),quotes.map(x=>x.source).join(" / "));renderHealth();
}
function mstr(){const d=new Date();return d.getFullYear()+"年"+(d.getMonth()+1)+"月"}
function loadState(){try{return JSON.parse(localStorage.getItem(STATE_KEY))}catch(e){return null}}
function saveState(){
  if(!executionStorageOK)return false;
  try{
    if(localStorage.getItem(STATE_KEY)!==executionLastSaved)return false;
    const next=JSON.stringify(S);localStorage.setItem(STATE_KEY,next);executionLastSaved=next;return true;
  }catch(e){console.warn("状态保存不可用",e);return false}
}
function getBgApiKey(){try{return(localStorage.getItem(BG_API_KEY_KEY)||"").trim()}catch(e){return""}}
function withBgToken(url){const key=getBgApiKey();if(!key)return url;try{const u=new URL(url);u.searchParams.set("token",key);return u.toString()}catch(e){return url}}
function invalidateBgMetricCache(){["sopr","puell","rr","lthnupl","rp","balanced","transfer"].forEach(k=>{try{const key="bg5_"+k,c=JSON.parse(localStorage.getItem(key)||"null");if(c){c.ts=0;delete c.failTs;localStorage.setItem(key,JSON.stringify(c))}}catch(e){}})}
function renderBgKeyState(){const el=$("bgKeyState"),input=$("bgApiKey"),has=!!getBgApiKey();if(!el)return;el.textContent=has?"已配置 · 仅存本机":"未配置 API Key";el.className="api-key-state"+(has?" ok":"");if(input){input.value="";input.placeholder=has?"输入新 Key 可替换":"输入个人 API Key"}}
function saveBgApiKey(){const input=$("bgApiKey"),key=(input&&input.value||"").trim();if(!key){ntf("请输入 API Key");return}try{localStorage.setItem(BG_API_KEY_KEY,key);invalidateBgMetricCache();renderBgKeyState();ntf("API Key 已保存 · 正在更新链上数据");if(!fetchInFlight)setTimeout(()=>fetchLive(true),80)}catch(e){ntf("API Key 保存失败")}}
function clearBgApiKey(){if(!getBgApiKey()){ntf("当前未配置 API Key");return}if(!confirm("清除本机保存的 BGeometrics API Key？现有指标缓存不会删除。"))return;try{localStorage.removeItem(BG_API_KEY_KEY);renderBgKeyState();ntf("API Key 已从本机清除")}catch(e){ntf("清除失败")}}
function metricCacheBackup(){const out={};["bg5_sopr","bg5_puell","bg5_rr","bg5_lthnupl","bg5_rp","bg5_balanced","bg5_transfer","stable4_cache",VALUATION_CACHE_KEY,BITVIEW_PSIL_CACHE_KEY,BITVIEW_CAPITALIZED_CACHE_KEY,COST_STATE_KEY].forEach(k=>{try{const v=localStorage.getItem(k);if(v)out[k]=JSON.parse(v)}catch(e){}});return out}
function restoreMetricCaches(box){if(!box||typeof box!=="object")return;["bg5_sopr","bg5_puell","bg5_rr","bg5_lthnupl","bg5_rp","bg5_balanced","bg5_transfer","stable4_cache",VALUATION_CACHE_KEY,BITVIEW_PSIL_CACHE_KEY,BITVIEW_CAPITALIZED_CACHE_KEY,COST_STATE_KEY].forEach(k=>{if(box[k]!=null)try{localStorage.setItem(k,JSON.stringify(box[k]))}catch(e){}})}
executionBackupRaw();
let S=loadState()||{price:0,rh:0,rhManual:false,month:mstr(),dims:[50,50,50,50,50,50,50],bud:{base:0,pull:0,ext:0},log:[],hd:{d:0,dc:0,dcCny:0,l:0,lc:0,lcCny:0,costSchema:2,ibit:0,gridLo:0,gridHi:0,goal:300000},m21:{target:.1,monthly:1000},sigs:{},spark30:[],fx:7.1};
if(!S.bud)S.bud={base:0,pull:0,ext:0};if(!S.log)S.log=[];S.hd={d:0,dc:0,dcCny:null,l:0,lc:0,lcCny:null,costSchema:0,ibit:0,gridLo:0,gridHi:0,goal:300000,...(S.hd||{})};if(S.hd.costSchema!==2){const fx=Math.max(.01,+S.fx||7.1);if(S.hd.dcCny==null||!Number.isFinite(+S.hd.dcCny))S.hd.dcCny=Math.max(0,+S.hd.d||0)*Math.max(0,+S.hd.dc||0)*fx;if(S.hd.lcCny==null||!Number.isFinite(+S.hd.lcCny))S.hd.lcCny=Math.max(0,+S.hd.l||0)*Math.max(0,+S.hd.lc||0)*fx;S.hd.costSchema=2}else{S.hd.dcCny=Math.max(0,+S.hd.dcCny||0);S.hd.lcCny=Math.max(0,+S.hd.lcCny||0)}if(!S.m21||typeof S.m21!=="object")S.m21={target:.1,monthly:1000};
if(!S.dcaLab||typeof S.dcaLab!=="object")S.dcaLab={monthly:2000,start:"2021-11",mult:[4,1.5,.4,0]};S.m21.target=M21_TARGETS.includes(+S.m21.target)?+S.m21.target:.1;S.m21.monthly=Math.max(1,Math.min(1e9,+S.m21.monthly||1000));if(!S.sigs)S.sigs={};if(!Array.isArray(S.dims)||S.dims.length!==7)S.dims=[50,50,50,50,50,50,50];if(typeof S.rhManual!=="boolean")S.rhManual=false;if(!Array.isArray(S.spark30))S.spark30=[];if(S.probMarket!==POLYMARKET_MARKET_KEY){S.probMarket=POLYMARKET_MARKET_KEY;S.sigs.pb=0;S.sigs.pu=0;saveState();}
try{DAILY=JSON.parse(localStorage.getItem(DAILY_KEY))||[]}catch(e){DAILY=[]}
if(!Array.isArray(DAILY))DAILY=[];
if(!DAILY.length&&Array.isArray(S.daily)&&S.daily.length)DAILY=S.daily;
if(!DAILY.length){try{const c=JSON.parse(localStorage.getItem(CACHE_KEY));if(c&&c.data&&Array.isArray(c.data.daily))DAILY=c.data.daily}catch(e){}}
if(DAILY.length){try{localStorage.setItem(DAILY_KEY,JSON.stringify(DAILY))}catch(e){}}
if(S.daily!==undefined){delete S.daily;saveState()}
try{STATUS_HISTORY=JSON.parse(localStorage.getItem(STATUS_HISTORY_KEY))||[]}catch(e){STATUS_HISTORY=[]}
if(!STATUS_HISTORY.length){try{STATUS_HISTORY=JSON.parse(localStorage.getItem(PREV_STATUS_HISTORY_KEY))||[]}catch(e){STATUS_HISTORY=[]}}
if(!STATUS_HISTORY.length){try{STATUS_HISTORY=JSON.parse(localStorage.getItem(LEGACY_STATUS_HISTORY_KEY))||[]}catch(e){STATUS_HISTORY=[]}}
if(!Array.isArray(STATUS_HISTORY))STATUS_HISTORY=[];
STATUS_HISTORY=STATUS_HISTORY.filter(x=>x&&x.day).sort((a,b)=>String(a.day).localeCompare(String(b.day))).slice(-365);
STATUS_HISTORY.forEach(x=>{if(x&&x.quality)Object.keys(x.quality).forEach(k=>{x.quality[k]=slimQuality(x.quality[k])})});
if(STATUS_HISTORY.length){try{localStorage.setItem(STATUS_HISTORY_KEY,JSON.stringify(STATUS_HISTORY))}catch(e){}}
function cleanupLegacyKeys(){try{[["btc_indicator_history_v3",["btc_indicator_history_v2","btc_status_history_v1"]],["btc_live_v9",["btc_live_v6","btc_live_v7","btc_live_v8"]],["bg5_rp",["bg2_rp","bg4_rp"]]].forEach(([cur,olds])=>{if(localStorage.getItem(cur))olds.forEach(k=>localStorage.removeItem(k))})}catch(e){}}
const BACKUP_REMIND_MS=14*86400000;
function renderBackupHint(){renderBackupStatus();}
function exportBackup(){
  try{
    const ledger=readDcaLedger();if(ledger)S.dcaLedger=ledger;
    const signature=backupSignature();
    const payload={app:"BTC-DCA",schema:5,build:BUILD_ID,exportedAt:new Date().toISOString(),state:S,daily:DAILY,statusHistory:STATUS_HISTORY,metricCaches:metricCacheBackup(),liveCache:readCache(true)},blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),a=document.createElement("a"),day=new Date().toISOString().slice(0,10);
    a.href=URL.createObjectURL(blob);a.download=`btc-status-backup-${day}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);S.lastExportAt=Date.now();saveState();const receiptOK=backupRecordGenerated(signature);renderBackupHint();ntf(receiptOK?"文件已生成，请先保存文件，再点按「我已保存备份」":"文件已生成，但备份提醒记录保存失败")
  }catch(e){ntf("导出失败，请检查浏览器存储权限")}
}
async function importBackup(input){
  const file=input&&input.files&&input.files[0];if(!file)return;
  try{
    const payload=JSON.parse(await file.text()),state=payload&&payload.state;
    if(!payload||payload.app!=="BTC-DCA"||!state||typeof state!=="object"||!Array.isArray(state.log))throw new Error("invalid backup");
    if(!confirm(`导入 ${payload.exportedAt?new Date(payload.exportedAt).toLocaleString("zh-CN"):"未知时间"} 的备份？当前本机数据将被覆盖。`))return;
    state.log=(Array.isArray(state.log)?state.log:[]).map(l=>({
      ts:+l.ts||0,dt:String(l.dt||"").slice(0,32),
      t:["base","pull","ext"].includes(l.t)?l.t:"base",
      a:Math.max(0,+l.a||0),p:Math.max(0,+l.p||0),b:Math.max(0,+l.b||0),
      mo:String(l.mo||"").slice(0,16),
      tp:l.tp==null?null:+l.tp,cold:l.cold===true,
      v25Id:typeof l.v25Id==="string"?l.v25Id.slice(0,100):undefined,
      executionChoice:l.executionChoice==="manual"?"manual":l.executionChoice,executionAudit:l.executionAudit||null,
      source:l.dcaLedgerId?"dca-ledger":undefined,dcaLedgerId:l.dcaLedgerId?String(l.dcaLedgerId).slice(0,150):undefined
    }));
    const daily=(Array.isArray(payload.daily)?payload.daily:[]).filter(r=>Array.isArray(r)&&Number.isFinite(+r[0])&&+r[0]>0&&Number.isFinite(+r[4])&&+r[4]>0),statusHistory=(Array.isArray(payload.statusHistory)?payload.statusHistory:[]).filter(r=>r&&/^\d{4}-\d{2}-\d{2}$/.test(String(r.day)));
    const before=JSON.stringify({schema:1,at:Date.now(),state:localStorage.getItem(STATE_KEY),ledger:localStorage.getItem(DCA_LEDGER_KEY)});
    localStorage.setItem("btc_v25_before_import",before);
    executionImportPair(state);
    if(Array.isArray(payload.daily))localStorage.setItem(DAILY_KEY,JSON.stringify(daily));
    if(Array.isArray(payload.statusHistory))localStorage.setItem(STATUS_HISTORY_KEY,JSON.stringify(statusHistory));
    restoreMetricCaches(payload.metricCaches);
    if(payload.liveCache)localStorage.setItem(CACHE_KEY,JSON.stringify(payload.liveCache));
    ntf("导入成功，正在重载");setTimeout(()=>location.reload(),500)
  }catch(e){ntf("导入未完成：文件格式或存储异常；请保留导入前备份")}
  finally{input.value=""}
}
async function requestPersistentStorage(){
  const el=$("storageNote");if(!el)return;
  try{
    if(!navigator.storage||!navigator.storage.persist){el.textContent="当前浏览器不支持持久存储；请定期导出 JSON 备份。";return}
    const ok=await navigator.storage.persist();el.textContent=ok?"本机持久存储已启用；仍建议换机前导出 JSON 备份。":"浏览器未授予持久存储；请定期导出 JSON 备份。"
  }catch(e){el.textContent="无法确认持久存储状态；请定期导出 JSON 备份。"}
}
function buildUI(){
  $("dims").innerHTML=DN.map((n,i)=>`<div class="dim"><div class="dim-info"><div class="dim-name">${n}</div><div class="dim-meta"><span class="dim-live" id="ds${i}">LIVE</span> · ${DW[i]}<span class="dim-src" id="dsrc${i}">${BV_DIM_SRC[i]?" · "+BV_DIM_SRC[i]:""}</span></div></div><input class="dim-slider" type="range" min="0" max="100" value="${S.dims[i]}" id="d${i}" aria-label="${n} 评分" oninput="calc()"><div class="dim-raw num" id="r${i}"></div><div class="dim-val num" id="v${i}">${S.dims[i]}</div><div class="dim-hint" id="h${i}"></div></div>`).join("");
}
function readCache(allowStale=false){try{const c=JSON.parse(localStorage.getItem(CACHE_KEY));if(!c)return null;if(allowStale||Date.now()-c.ts<CACHE_TTL)return c}catch(e){}return null}
function cacheAge(ts){if(!(ts>0))return"时间未知";const ms=Math.max(0,Date.now()-ts);if(ms<60000)return"刚刚";if(ms<3600000)return Math.floor(ms/60000)+"分钟前";if(ms<86400000)return Math.floor(ms/3600000)+"小时前";return Math.floor(ms/86400000)+"天前"}
function staleLimit(name){return SOURCE_STALE_MS[name]||CHAIN_STALE_MS}
function effectiveHealthStatus(name,status,dataAt){if(name==="定投回测")return dcaMonthlyStatus(status,dataAt);if(status==="idle"||status==="loading")return status;if(status==="fail")return"fail";if(status==="stale")return"stale";if(!(dataAt>0))return status==="conflict"?"conflict":"stale";return Date.now()-dataAt>staleLimit(name)?"stale":status}
function refreshHealthAges(){Object.entries(HEALTH).forEach(([name,h])=>{if(!h)return;h.name=name;h.dataAt=h.dataAt||h.ts||null;h.fetchedAt=h.fetchedAt||null;h.status=effectiveHealthStatus(name,h.status,h.dataAt)})}
function ensureModuleHealth(){MODULE_HEALTH.forEach(name=>{if(!HEALTH[name])HEALTH[name]={name,status:"idle",detail:"进入模块后加载",ts:null,dataAt:null,fetchedAt:null,sourceDetail:"按需加载"}})}
function saveCache(data,successAt=lastFullAt||null){try{localStorage.setItem(CACHE_KEY,JSON.stringify({ts:Date.now(),successAt,data,health:HEALTH}))}catch(e){}}
function restoreCacheHealth(c){
  HEALTH={};
  const saved=c&&c.health&&typeof c.health==="object"?c.health:{};
  SOURCE_ORDER.forEach(name=>{
    const h=saved[name];
    if(h&&MODULE_HEALTH.includes(name)&&(h.status==="idle"||h.status==="loading")){
      HEALTH[name]={name,status:"idle",detail:"进入模块后加载",ts:null,dataAt:null,fetchedAt:null,sourceDetail:"按需加载"};
    }else if(h){
      const ts=h.dataAt||Object.prototype.hasOwnProperty.call(h,"ts")&&h.ts||c.ts||null,
        baseStatus=h.status==="conflict"?"conflict":h.status==="stale"?"stale":h.status==="fail"?"fail":"cache",status=effectiveHealthStatus(name,baseStatus,ts),
        sourceDetail=h.sourceDetail||h.detail||"";
      HEALTH[name]={name,status,detail:`缓存 ${cacheAge(ts)}${sourceDetail?" · "+sourceDetail:""}`,ts,dataAt:ts,fetchedAt:h.fetchedAt||c.ts||null,sourceDetail,lastAttemptAt:h.lastAttemptAt||null,lastError:h.lastError||""};
    }else if(name==="价格共识"){
      HEALTH[name]={name,status:"loading",detail:"等待三家现货源交叉校验",ts:null,dataAt:null,fetchedAt:null,sourceDetail:"Binance / OKX / Coinbase"};
    }else if(MODULE_HEALTH.includes(name)){
      HEALTH[name]={name,status:"idle",detail:"进入模块后加载",ts:null,dataAt:null,fetchedAt:null,sourceDetail:"按需加载"};
    }else{
      const ts=c&&c.ts||null,status=effectiveHealthStatus(name,"cache",ts);HEALTH[name]={name,status,detail:`快照 ${cacheAge(ts)}`,ts,dataAt:ts,fetchedAt:ts,sourceDetail:""};
    }
  });
  ensureModuleHealth();
}
function setLiveStatus(state,msg){
  $("ldot").className="dot status-dot "+(state==="ok"?"on":state==="loading"?"spin":"");
  const el=$("lupdated"),h=HEALTH["价格"],stamp=h&&(h.dataAt||h.ts);
  el.title=[msg,h&&freshnessTitle(h)].filter(Boolean).join("\n");
  const priceLabel=S.manualPrice?"手动价格":stamp?`价格 ${cacheAge(stamp)}`:"价格时间未知";
  el.textContent=String(msg).replace(/ · 核心 \d+\/7/g,"").replace(/^\d{1,2}:\d{2}(?= ·)/,priceLabel);
}
async function checkAppUpdate(){return inspectAppUpdate()}
function reloadLatest(){return applyAppUpdate()}
function progStart(){progActive=true;progN=0;$("fetchBar").style.opacity="1";$("fetchBar").style.width="4%"}
function progStep(){if(!progActive)return;progN++;$("fetchBar").style.width=Math.min(90,progN/PROG_EST*90)+"%";$("lupdated").textContent=`正在更新 ${Math.min(99,Math.round(progN/PROG_EST*100))}%`}
function progDone(){progActive=false;$("fetchBar").style.width="100%";setTimeout(()=>{$("fetchBar").style.opacity="0";setTimeout(()=>$("fetchBar").style.width="0",350)},300)}
function tryFetch(url,ms=8000){
  return sharedMarketRead(marketReadKey("get",url,ms),async()=>{
    progStep();const started=Date.now();
    try{const data=await fetchMarketBody(url,ms);recordEndpoint(url,true,Date.now()-started);return data}
    catch(error){recordEndpoint(url,false,Date.now()-started,error);throw error}
  });
}
function ahr999ToSc(v,ts){if(!v)return 65;const k=1;/* V25.1.18：与首页一致，固定分界 0.45 / 1.2 / 5 */if(v<.45*k)return 95;if(v<.7*k)return 88;if(v<k)return 78;if(v<1.5*k)return 62;if(v<2.5*k)return 42;if(v<5*k)return 25;return 12}
function wma200ToSc(r){if(!r)return 60;if(r<.7)return 95;if(r<.85)return 82;if(r<1.1)return 67;if(r<1.5)return 47;if(r<2.2)return 30;return 15}
function mvrvToSc(v){if(!v)return 62;if(v<.8)return 95;if(v<1.2)return 85;if(v<1.8)return 72;if(v<2.5)return 52;if(v<3.5)return 32;return 15}
function fgiToSc(v){if(v==null)return 50;if(v<10)return 95;if(v<20)return 85;if(v<35)return 72;if(v<50)return 58;if(v<65)return 44;if(v<80)return 28;return 15}
function soprToSc(v){if(!v)return 55;if(v<.95)return 95;if(v<.97)return 88;if(v<.99)return 76;if(v<1)return 64;if(v<1.02)return 50;if(v<1.05)return 34;return 16}
function puellToSc(v){if(!v)return 60;if(v<.4)return 92;if(v<.5)return 84;if(v<.8)return 70;if(v<1)return 60;if(v<1.5)return 46;if(v<2.5)return 30;return 14}
function rrToSc(v){if(!v)return 70;if(RR_BV&&v===RR_BV.v)return rrPctScore(RR_BV.pct);if(v<.001)return 94;if(v<.0015)return 84;if(v<.0025)return 72;if(v<.004)return 58;if(v<.008)return 40;if(v<.015)return 25;return 12}
function numOnly(x){if(typeof x==="number")return isFinite(x)?x:null;if(typeof x!=="string")return null;if(!/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(x.trim()))return null;const n=parseFloat(x);return isFinite(n)?n:null}
function bgLast(res){
  let arr=res&&res.data?res.data:res;
  if(!arr)return null;
  if(!Array.isArray(arr))arr=[arr];
  if(!arr.length)return null;
  const last=arr[arr.length-1];
  if(Array.isArray(last))return numOnly(last[1]);
  const pref=["nupllth","nupl_lth","lthnupl","lth_nupl","sopr","puellmultiple","puell_multiple","puell","reserverisk","reserve_risk","rr","value","val","v","metric"],
    keys=Object.keys(last);
  for(const p of pref)for(const k of keys)if(k.toLowerCase()===p){
    const v=numOnly(last[k]);
    if(v!=null)return v
  }
  for(const k of keys){
    if(/date|day|time|unix|^d$|^t$|ts$/i.test(k))continue;
    const v=numOnly(last[k]);
    if(v!=null)return v
  }
  return null
}
function parseDataTs(v){
  if(v==null)return null;
  if(typeof v==="number"||/^\d+(\.\d+)?$/.test(String(v).trim())){
    const n=Number(v);
    if(!Number.isFinite(n))return null;
    if(n>1e12)return n;
    if(n>1e9)return n*1000;
    return null;
  }
  const t=Date.parse(String(v).replace(/\.(\d{3})\d+(?=Z)/,'.$1'));
  return Number.isFinite(t)?t:null;
}
function bgPoint(res){
  let arr=res&&res.data?res.data:res;
  if(!arr)return null;
  if(!Array.isArray(arr))arr=[arr];
  if(!arr.length)return null;
  const last=arr[arr.length-1];
  const value=bgLast([last]);
  let dataTs=null;
  if(Array.isArray(last)){
    dataTs=parseDataTs(last[0]);
  }else if(last&&typeof last==="object"){
    const keys=["unixTs","unix_ts","timestamp","time","date","day","datetime","t","ts"];
    for(const k of keys){
      if(last[k]!=null){
        dataTs=parseDataTs(last[k]);
        if(dataTs)break;
      }
    }
  }
  return value==null?null:{v:value,dataTs};
}
function bgSeriesPoints(res){
  let arr=res&&res.data?res.data:res;if(!Array.isArray(arr))return[];
  const points=arr.map((row,i)=>{const p=bgPoint([row]);return p?{...p,i}:null}).filter(Boolean);
  if(points.every(p=>p.dataTs))points.sort((a,b)=>a.dataTs-b.dataTs);
  else points.sort((a,b)=>a.i-b.i);
  return points;
}
function dayFromTs(ts){return ts?new Date(ts).toISOString().slice(0,10):null}
function compactMetricSeries(points,lo=-Infinity,hi=Infinity){
  const out=[];(points||[]).forEach(p=>{const day=dayFromTs(p&&p.dataTs),value=+(p&&p.v);if(!day||!Number.isFinite(value)||value<lo||value>hi)return;const row={day,value};if(out.length&&out.at(-1).day===day)out[out.length-1]=row;else out.push(row)});return out.slice(-366)
}
function mergeMetricSeries(a,b){
  const by=new Map();[...(a||[]),...(b||[])].forEach(x=>{if(x&&x.day&&Number.isFinite(+x.value))by.set(x.day,{day:x.day,value:+x.value})});return[...by.values()].sort((x,y)=>x.day.localeCompare(y.day)).slice(-366)
}
function restoreMetricHistoryCache(){
  try{
    const box=JSON.parse(localStorage.getItem(METRIC_HISTORY_CACHE_KEY)||"null"),data=box&&box.data;
    if(!data||typeof data!=="object")return;
    Object.entries(data).forEach(([key,rows])=>{
      if(Array.isArray(rows)&&rows.length)METRIC_HISTORY[key]=mergeMetricSeries(METRIC_HISTORY[key],rows);
    });
  }catch(e){}
}
function persistMetricHistoryCache(){
  try{
    const data={};
    Object.entries(METRIC_HISTORY).forEach(([key,rows])=>{
      if(Array.isArray(rows)&&rows.length)data[key]=rows.slice(-366);
    });
    localStorage.setItem(METRIC_HISTORY_CACHE_KEY,JSON.stringify({ts:Date.now(),data}));
  }catch(e){}
}
function runWhenNetworkIdle(fn,minDelay=0,maxWait=12000){
  const started=Date.now();
  const attempt=()=>{
    if(fetchInFlight&&Date.now()-started<maxWait){setTimeout(attempt,350);return}
    const run=()=>{try{fn()}catch(e){}};
    if("requestIdleCallback"in window)requestIdleCallback(run,{timeout:1800});
    else setTimeout(run,0);
  };
  setTimeout(attempt,Math.max(0,minDelay));
}
async function hedgedFirst(urls,worker,stagger=750){
  if(!Array.isArray(urls)||!urls.length)throw new Error("no sources");
  return await new Promise((resolve,reject)=>{
    let settled=false,finished=0,lastErr=null;
    urls.forEach((url,i)=>{
      setTimeout(async()=>{
        if(settled)return;
        try{
          const value=await worker(url);
          if(value==null)throw new Error("invalid source");
          if(!settled){settled=true;resolve({url,value})}
        }catch(e){
          lastErr=e;finished++;
          if(finished===urls.length&&!settled)reject(lastErr||new Error("all sources failed"));
        }
      },i*stagger);
    });
  });
}
function dailyAverageSeries(rows,valueKey="fundingRate",timeKey="fundingTime"){
  const by=new Map();(rows||[]).forEach(r=>{const ts=parseDataTs(r&&r[timeKey]||r&&r.ts),value=+(r&&r[valueKey]);if(!ts||!Number.isFinite(value))return;const day=dayFromTs(ts),a=by.get(day)||[];a.push(value);by.set(day,a)});return[...by.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([day,a])=>({day,value:a.reduce((x,y)=>x+y,0)/a.length})).slice(-366)
}
function formatDataDay(ts){
  if(!ts)return"日期未知";
  // 数据日按 UTC 计算，统一显示为 MM-DD（见《文案规范》E）
  return new Date(ts).toISOString().slice(5,10);
}
function staleDetail(ts){
  if(!ts)return"日期未知";
  const days=Math.max(0,Math.floor((Date.now()-ts)/86400000));
  return `滞后 ${days}天 · 数据日 ${formatDataDay(ts)}`;
}
async function fetchAny(urls,ms=7000){
  const errors=[];
  for(const url of urls){
    try{return await tryFetch(url,ms)}
    catch(e){errors.push(e)}
  }
  throw errors[errors.length-1]||new Error("all sources failed");
}
function binanceFetch(path,ms=7000){
  return sharedMarketRead(marketReadKey("binance",path,ms),()=>binanceFetchCore(path,ms));
}
async function binanceFetchCore(path,ms=7000){
  progStep();
  const t0=Date.now();
  let sticky="";
  try{sticky=localStorage.getItem("bn_ep1")||""}catch(e){}
  if(sticky&&BINANCE_BASES.includes(sticky)){
    const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),Math.min(ms,3500));
    try{
      const r=await fetch(sticky+path,{mode:"cors",cache:"no-store",signal:ctl.signal});
      if(!r.ok)throw new Error(`${sticky} ${r.status}`);
      const ct=r.headers.get("content-type")||"";
      const data=ct.includes("json")?await r.json():await r.text();recordEndpoint(sticky+path,true,Date.now()-t0);return data
    }catch(e){}finally{clearTimeout(timer)}
  }
  const controllers=BINANCE_BASES.map(()=>new AbortController());
  const timer=setTimeout(()=>controllers.forEach(c=>c.abort()),ms);
  const requests=BINANCE_BASES.map((base,i)=>
    fetch(base+path,{
      mode:"cors",
      cache:"no-store",
      signal:controllers[i].signal
    }).then(async r=>{
      if(!r.ok)throw new Error(`${base} ${r.status}`);
      const ct=r.headers.get("content-type")||"";
      const data=ct.includes("json")?await r.json():await r.text();
      return{base,data};
    })
  );
  try{
    const winner=await Promise.any(requests);
    controllers.forEach(c=>c.abort());
    clearTimeout(timer);
    try{localStorage.setItem("bn_ep1",winner.base)}catch(e){}
    recordEndpoint(winner.base+path,true,Date.now()-t0);
    return winner.data;
  }catch(e){
    clearTimeout(timer);
    recordEndpoint(BINANCE_BASES[0]+path,false,Date.now()-t0,e);
    throw e;
  }
}
async function fetchBtcDailyCandles(){
  const rows=await binanceFetch("/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=1000",8000);
  if(!Array.isArray(rows)||rows.some(k=>!Array.isArray(k)))throw new Error("bad daily klines");
  return rows.map(k=>[Math.floor(+k[0]/1000),+k[1],+k[2],+k[3],+k[4]]).filter(k=>k.every(Number.isFinite)&&k[4]>0);
}
function fetchSpotTicker(ms=6500){
  return sharedMarketRead(marketReadKey("spot","BTC",ms),()=>fetchSpotTickerCore(ms));
}
async function fetchSpotTickerCore(ms=6500){
  const consensusRound=++marketConsensusRound;
  const jobs=[
    (async()=>{
      const t=await binanceFetch("/api/v3/ticker/24hr?symbol=BTCUSDT",ms),price=+t.lastPrice,change24h=+t.priceChangePercent;
      if(!(price>0))throw new Error("bad Binance ticker");
      return{price,change24h,source:"Binance"};
    })(),
    (async()=>{
      const j=await tryFetch("https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT",ms),t=j&&j.data&&j.data[0],price=+(t&&t.last),open=+(t&&t.open24h),change24h=open>0?(price/open-1)*100:null;
      if(!(price>0))throw new Error("bad OKX ticker");
      return{price,change24h,source:"OKX"};
    })(),
    (async()=>{
      const t=await tryFetch("https://api.exchange.coinbase.com/products/BTC-USD/stats",ms),price=+t.last,open=+t.open,change24h=open>0?(price/open-1)*100:null;
      if(!(price>0))throw new Error("bad Coinbase ticker");
      return{price,change24h,source:"Coinbase"};
    })()
  ];
  Promise.allSettled(jobs).then(rows=>{if(consensusRound===marketConsensusRound)updatePriceConsensus(rows)}).catch(()=>{});
  try{return await Promise.any(jobs)}
  catch(e){throw new Error("all ticker sources failed")}
}

function getFallbackData(){
  const c=readCache(true),d=c&&c.data?{...c.data}:{};
  if(d.probMarketKey!==POLYMARKET_MARKET_KEY){delete d.prob50;delete d.prob90;}
  if(d.price==null&&S.price)d.price=S.price;
  if(d.spark30==null&&S.spark30&&S.spark30.length)d.spark30=S.spark30;
  if(S.ahr){
    if(d.ahr999==null)d.ahr999=S.ahr.v;
    if(d.ahr999c==null)d.ahr999c=S.ahr.c;
    if(d.plNew==null)d.plNew=S.ahr.pl;
    if(d.dma200==null)d.dma200=S.ahr.dma;
    if(d.ahr1price==null)d.ahr1price=S.ahr.p1;
  }
  if(S.mas){
    if(d.ma51==null)d.ma51=S.mas.m51;
    if(d.ma120==null)d.ma120=S.mas.m120;
    if(d.ma250==null)d.ma250=S.mas.m250;
    if(d.ma850==null)d.ma850=S.mas.m850;
  }
  if(S.sigs){
    if(d.wma200==null&&S.sigs.wm)d.wma200=S.sigs.wm;
    if(d.wma200ratio==null&&d.wma200&&d.price)d.wma200ratio=d.price/d.wma200;
    if(d.balanced==null&&S.sigs.bl)d.balanced=S.sigs.bl;
    if(d.sopr==null&&S.sigs.sp)d.sopr=S.sigs.sp;
    if(d.halvingDays==null&&S.sigs.hv)d.halvingDays=S.sigs.hv;
    if(d.halvingBlocks==null&&S.sigs.hb)d.halvingBlocks=S.sigs.hb;
    if(d.shutLo==null&&S.sigs.lo)d.shutLo=S.sigs.lo;
    if(d.shutHi==null&&S.sigs.hi)d.shutHi=S.sigs.hi;
    if(d.prob50==null&&S.probMarket===POLYMARKET_MARKET_KEY&&S.sigs.pb)d.prob50=S.sigs.pb;
    if(d.prob90==null&&S.probMarket===POLYMARKET_MARKET_KEY&&S.sigs.pu)d.prob90=S.sigs.pu;
    if(d.lthNupl==null&&S.sigs.lth!=null)d.lthNupl=S.sigs.lth;
  }
  if(d.usdtSeries==null&&S.stbU)d.usdtSeries=S.stbU;
  if(d.usdcSeries==null&&S.stbC)d.usdcSeries=S.stbC;
  if(d.stableDataTs==null&&S.stbTs)d.stableDataTs=S.stbTs;
  if(S.raw){
    ["fgi","fgiLabel","prevFgi","mvrv","prevMvrv","puell","prevPuell","rr","prevRr","lthNupl","prevLthNupl","lthPsil","prevLthPsil","prevSopr","fundingRate","fundingTime","fundingSource","coinbasePrice","coinbasePremium","coinbaseSpread"].forEach(k=>{if(d[k]==null&&S.raw[k]!=null)d[k]=S.raw[k]});
  }
  const valuation=readValuationCache();
  if(d.mvrv==null&&valuation.mvrv!=null)d.mvrv=+valuation.mvrv;
  if(d.realized==null&&valuation.realized!=null)d.realized=+valuation.realized;
  if(d.balanced==null&&valuation.balanced!=null)d.balanced=+valuation.balanced;
  return d;
}
function carryFields(result,fallback,name,fields,detail="沿用上次成功值"){
  let used=false;
  fields.forEach(k=>{
    if(result[k]==null&&fallback[k]!=null){
      result[k]=fallback[k];
      used=true;
    }
  });
  if(used){
    const old=FALLBACK_HEALTH[name],ts=old&&(old.dataAt||old.ts)||null,
      status=effectiveHealthStatus(name,old&&old.status==="stale"?"stale":"cache",ts),
      sourceDetail=old&&(old.sourceDetail||old.detail)||"",
      oldDetail=sourceDetail?" · "+sourceDetail:"";
    markHealth(name,status,`${detail} · ${cacheAge(ts)}${oldDetail}`,ts,sourceDetail);
  }
  else markHealth(name,"fail","暂无可用值");
  return used;
}
function chainSnapshotSeed(name){return CHAIN_LAST_GOOD_SNAPSHOT.metrics[name]||null}
function primeChainFallbackHistory(){
  Object.values(CHAIN_LAST_GOOD_SNAPSHOT.metrics).forEach(seed=>{
    METRIC_HISTORY[seed.key]=mergeMetricSeries(seed.series,METRIC_HISTORY[seed.key]);
  });
}
function carryBgFields(result,fallback,name,fields){
  const has=!!getBgApiKey(),seed=chainSnapshotSeed(name),hasSaved=fields.some(k=>fallback[k]!=null);
  if(seed)METRIC_HISTORY[seed.key]=mergeMetricSeries(seed.series,METRIC_HISTORY[seed.key]);
  if(hasSaved){
    const used=carryFields(result,fallback,name,fields,has?"授权源失败 · 沿用上次成功值":"未配置 API Key · 沿用上次成功值");
    if(seed)fields.forEach(k=>{if(result[k]==null&&seed.values[k]!=null)result[k]=seed.values[k]});
    return used;
  }
  if(seed){
    fields.forEach(k=>{if(result[k]==null&&seed.values[k]!=null)result[k]=seed.values[k]});
    const note=has?"授权源失败":"未配置 API Key",source=`内置最近有效快照 · 数据日 ${CHAIN_LAST_GOOD_SNAPSHOT.day}`;
    markHealth(name,"cache",`${note} · ${source}`,CHAIN_LAST_GOOD_SNAPSHOT.ts,source);
    return true;
  }
  markHealth(name,"fail",has?"授权源失败 · 暂无可用值":"未配置 BGeometrics API Key");
  return false;
}
function aggregateDailyLast(points){
  const byDay=new Map();
  for(const p of points||[]){
    if(!Array.isArray(p)||p.length<2||!(p[1]>0))continue;
    const day=new Date(p[0]).toISOString().slice(0,10);
    const old=byDay.get(day);
    if(!old||p[0]>old.ts)byDay.set(day,{ts:p[0],v:p[1]});
  }
  const rows=[...byDay.values()]
    .sort((a,b)=>a.ts-b.ts)
    .slice(-40);
  return{values:rows.map(x=>x.v),dataTs:rows.length?rows.at(-1).ts:null,series:rows.map(x=>({day:dayFromTs(x.ts),value:x.v}))};
}
async function cgCapSeries(id){
  try{
    const r=await tryFetch(
      `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=40`,
      8000
    );
    return aggregateDailyLast(r.market_caps||[]);
  }catch(e){return{values:[],dataTs:null}}
}
async function llamaSeries(id){
  try{
    const r=await tryFetch(`https://stablecoins.llama.fi/stablecoincharts/all?stablecoin=${id}`,8000);
    if(!Array.isArray(r))return{values:[],dataTs:null};
    const points=r.map(d=>{
      const t=d.totalCirculatingUSD||d.totalCirculating||{};
      return[parseDataTs(d.date||d.timestamp||d.time),t.peggedUSD||0]
    }).filter(p=>p[0]&&p[1]>0);
    return aggregateDailyLast(points);
  }catch(e){return{values:[],dataTs:null}}
}
// V25.1.26：七维评分的链上分项优先使用 Bitview。取不到时才使用原来的备用源。
const BITVIEW_DIM_TTL=6*3600*1000,BITVIEW_DIM_FAIL_TTL=60*60*1000;
function setDimSource(i,text){BV_DIM_SRC[i]=text;const e=$("dsrc"+i);if(e)e.textContent=text?" · "+text:""}
function bitviewHealth(label,ts,fromCache){
  const stale=ts&&Date.now()-ts>CHAIN_STALE_MS;
  markHealth(label,stale?"stale":"ok",stale?`Bitview · ${staleDetail(ts)}`:`Bitview · 数据日 ${formatDataDay(ts)}`,ts||null);
}
async function bitviewDailyPoints(name,lo,hi){
  const raw=await tryFetch(bitviewBulkUrl(["date",name],"-400"),12000),d=pickSeries(raw,"date",0),v=pickSeries(raw,name,1);
  if(!d||!v)throw new Error("no series "+name);
  const pts=[];for(let i=0;i<Math.min(d.length,v.length);i++){const x=+v[i];if(/^\d{4}-\d{2}-\d{2}$/.test(String(d[i]))&&Number.isFinite(x)&&x>=lo&&x<=hi)pts.push({day:String(d[i]),value:x})}
  if(!pts.length)throw new Error("empty "+name);
  return pts;
}
// Bitview 提供 /api/series/search?q= 查找序列名。结果在本机保存 24 小时。
async function bitviewDiscover(q,pick){
  const key="bv5_find_"+q;
  try{const c=JSON.parse(localStorage.getItem(key));if(c&&Date.now()-c.ts<24*3600*1000)return c.names||[]}catch(e){}
  let names=[];
  try{
    const r=await tryFetch("https://bitview.space/api/series/search?q="+encodeURIComponent(q),10000);
    const walk=x=>{if(typeof x==="string")names.push(x);else if(Array.isArray(x))x.forEach(walk);else if(x&&typeof x==="object"){["id","name","series","key","metric"].forEach(k=>{if(typeof x[k]==="string")names.push(x[k])});["results","items","series","data","matches","hits"].forEach(k=>{if(x[k]&&typeof x[k]==="object")walk(x[k])})}};
    walk(r);names=[...new Set(names)].filter(pick).sort((a,b)=>a.length-b.length).slice(0,5);
  }catch(e){}
  try{localStorage.setItem(key,JSON.stringify({ts:Date.now(),names}))}catch(e){}
  return names;
}
const BITVIEW_FIND={
  sopr:{q:"sopr 24h",pick:n=>/^sopr_24h$/.test(n)}
};
async function bitviewMetric(key,label,names,lo,hi){
  let cached=null;try{cached=JSON.parse(localStorage.getItem("bv5_"+key))}catch(e){}
  if(cached&&Array.isArray(cached.series)&&cached.series.length)METRIC_HISTORY[key]=mergeMetricSeries(METRIC_HISTORY[key],cached.series);
  if(cached&&cached.prev)METRIC_PREV[key]=cached.prev;
  if(cached&&cached.v!=null&&Date.now()-cached.ts<BITVIEW_DIM_TTL){bitviewHealth(label,cached.sourceTs,true);return cached.v}
  if(cached&&cached.failTs&&Date.now()-cached.failTs<BITVIEW_DIM_FAIL_TTL)return null;
  for(const name of names){
    try{
      const pts=await bitviewDailyPoints(name,lo,hi),last=pts.at(-1),prev=pts.length>1?pts.at(-2):null,ts=bitviewDayTs(last.day);
      METRIC_HISTORY[key]=mergeMetricSeries(METRIC_HISTORY[key],pts.slice(-366));
      if(prev)METRIC_PREV[key]={v:prev.value,sourceTs:bitviewDayTs(prev.day)};
      try{localStorage.setItem("bv5_"+key,JSON.stringify({v:last.value,sourceTs:ts,ts:Date.now(),series:pts.slice(-366),prev:METRIC_PREV[key]||null,name}))}catch(e){}
      bitviewHealth(label,ts,false);return last.value;
    }catch(e){}
  }
  const find=BITVIEW_FIND[key];
  if(find){
    const found=(await bitviewDiscover(find.q,find.pick)).filter(n=>!names.includes(n));
    for(const name of found){
      try{
        const pts=await bitviewDailyPoints(name,lo,hi),last=pts.at(-1),prev=pts.length>1?pts.at(-2):null,ts=bitviewDayTs(last.day);
        METRIC_HISTORY[key]=mergeMetricSeries(METRIC_HISTORY[key],pts.slice(-366));
        if(prev)METRIC_PREV[key]={v:prev.value,sourceTs:bitviewDayTs(prev.day)};
        try{localStorage.setItem("bv5_"+key,JSON.stringify({v:last.value,sourceTs:ts,ts:Date.now(),series:pts.slice(-366),prev:METRIC_PREV[key]||null,name}))}catch(e){}
        bitviewHealth(label,ts,false);return last.value;
      }catch(e){}
    }
  }
  try{localStorage.setItem("bv5_"+key,JSON.stringify({failTs:Date.now()}))}catch(e){}
  return null;
}
var RR_BV=null;
function rrPctScore(p){if(p<.10)return 94;if(p<.20)return 84;if(p<.35)return 72;if(p<.50)return 58;if(p<.70)return 40;if(p<.85)return 25;return 12}
async function bitviewReserveRisk(){
  let cached=null;try{cached=JSON.parse(localStorage.getItem("bv5_rr2"))}catch(e){}
  const use=c=>{RR_BV={v:c.v,pct:c.pct};METRIC_HISTORY.rr=c.series;bitviewHealth("RR",c.sourceTs,false);return c.v};
  if(cached&&cached.v>0&&Date.now()-cached.ts<BITVIEW_DIM_TTL)return use(cached);
  if(cached&&cached.failTs&&Date.now()-cached.failTs<BITVIEW_DIM_FAIL_TTL)return null;
  try{
    const raw=await tryFetch(bitviewBulkUrl(["date","reserve_risk"],"2011-01-01"),15000),d=pickSeries(raw,"date",0),v=pickSeries(raw,"reserve_risk",1);
    const pts=[];for(let i=0;i<Math.min(d.length,v.length);i++){const x=+v[i];if(/^\d{4}-\d{2}-\d{2}$/.test(String(d[i]))&&x>0)pts.push({day:String(d[i]),value:x})}
    if(pts.length<1000)throw new Error("short");
    const last=pts.at(-1),sorted=pts.map(x=>x.value).sort((a,b)=>a-b);let lo=0;while(lo<sorted.length&&sorted[lo]<=last.value)lo++;
    const out={v:last.value,pct:lo/sorted.length,sourceTs:bitviewDayTs(last.day),ts:Date.now(),series:pts.slice(-366)};
    try{localStorage.setItem("bv5_rr2",JSON.stringify(out))}catch(e){}
    return use(out);
  }catch(e){try{localStorage.setItem("bv5_rr2",JSON.stringify({failTs:Date.now()}))}catch(_){}return null}
}
async function bitviewMvrv(){
  let cached=null;try{cached=JSON.parse(localStorage.getItem("bv5_mvrv"))}catch(e){}
  if(cached&&cached.v>0&&Date.now()-cached.ts<BITVIEW_DIM_TTL)return{...cached,fromCache:true};
  if(cached&&cached.failTs&&Date.now()-cached.failTs<BITVIEW_DIM_FAIL_TTL)return null;
  try{
    const [price,rp]=await Promise.all([bitviewDailyPoints("price",1,1e8),bitviewDailyPoints("realized_price",1,1e7)]);
    const pm=new Map(price.map(x=>[x.day,x.value])),series=rp.map(x=>pm.has(x.day)?{day:x.day,value:pm.get(x.day)/x.value}:null).filter(Boolean);
    if(!series.length)throw new Error("no overlap");
    const last=series.at(-1),prev=series.length>1?series.at(-2).value:null,out={v:last.value,prev,realized:rp.at(-1).value,sourceTs:bitviewDayTs(last.day),ts:Date.now(),series:series.slice(-366)};
    try{localStorage.setItem("bv5_mvrv",JSON.stringify(out))}catch(e){}
    return out;
  }catch(e){
    try{localStorage.setItem("bv5_mvrv",JSON.stringify({failTs:Date.now()}))}catch(_){}
    return null;
  }
}
async function bgMetric(key,label,paths,lo,hi){
  let cached=null;const apiKey=getBgApiKey(),authNote=apiKey?"个人Key":"公开兼容";
  try{cached=JSON.parse(localStorage.getItem("bg5_"+key))}catch(e){}

  const usePoint=(v,sourceTs,fromCache)=>{
    if(sourceTs&&Date.now()-sourceTs>CHAIN_STALE_MS)markHealth(label,"stale",`${staleDetail(sourceTs)} · ${authNote}`,sourceTs);
    else if(!sourceTs)markHealth(label,"stale","沿用 · 数据日期未知");
    else markHealth(label,fromCache?"cache":"ok",fromCache?`24小时慢指标 · ${authNote}`:`数据日 ${formatDataDay(sourceTs)} · ${authNote}`,sourceTs);
    return v;
  };

  if(cached&&cached.prevV!=null)METRIC_PREV[key]={v:+cached.prevV,sourceTs:cached.prevSourceTs||null};
  if(cached&&Array.isArray(cached.series)&&cached.series.length)METRIC_HISTORY[key]=mergeMetricSeries(METRIC_HISTORY[key],cached.series);
  if(cached&&Date.now()-cached.ts<SLOW_TTL&&cached.v!=null)return usePoint(cached.v,cached.sourceTs,true);
  if(cached&&cached.failTs&&Date.now()-cached.failTs<BG_FAILURE_TTL){
    if(cached.v!=null)return usePoint(cached.v,cached.sourceTs,true);
    return null;
  }

  try{
    const won=await hedgedFirst(paths,async url=>{
      const r=await tryFetch(withBgToken(url),5200),points=bgSeriesPoints(r),point=points.at(-1)||bgPoint(r);
      if(!(point&&point.v>=lo&&point.v<=hi))throw new Error("bad metric");
      return{url,points,point};
    },800);
    const {url,points,point}=won.value,prev=points.length>1?points.at(-2):null,series=compactMetricSeries(points,lo,hi),
      cachedDay=dayFromTs(cached&&cached.sourceTs),pointDay=dayFromTs(point.dataTs),
      oldPoint=cached&&cached.v>=lo&&cached.v<=hi&&cachedDay&&pointDay&&cachedDay<pointDay?{v:+cached.v,sourceTs:cached.sourceTs||null}:null,
      prior=prev&&prev.v>=lo&&prev.v<=hi?{v:prev.v,sourceTs:prev.dataTs||null}:oldPoint,
      cachedPoint=cachedDay&&cached&&cached.v>=lo&&cached.v<=hi?[{day:cachedDay,value:+cached.v}]:[],
      current=point.dataTs?[{day:pointDay,value:point.v}]:[],
      mergedSeries=mergeMetricSeries(METRIC_HISTORY[key],cachedPoint.concat(series,current));
    if(prior)METRIC_PREV[key]=prior;
    if(mergedSeries.length)METRIC_HISTORY[key]=mergedSeries;
    const savedPrev=METRIC_PREV[key]||null;
    localStorage.setItem("bg5_"+key,JSON.stringify({ts:Date.now(),v:point.v,sourceTs:point.dataTs||null,prevV:savedPrev?savedPrev.v:null,prevSourceTs:savedPrev?savedPrev.sourceTs:null,series:mergedSeries,sourceUrl:url}));
    return usePoint(point.v,point.dataTs,false);
  }catch(e){}

  try{localStorage.setItem("bg5_"+key,JSON.stringify({...cached,failTs:Date.now()}))}catch(e){}
  if(cached&&cached.v!=null)return usePoint(cached.v,cached.sourceTs,true);
  return null;
}

async function fetchBgValue(paths,lo,hi){
  try{
    const won=await hedgedFirst(paths,async url=>{
      const r=await tryFetch(withBgToken(url),6000),points=bgSeriesPoints(r),point=points.at(-1)||bgPoint(r);
      if(!(point&&point.v>=lo&&point.v<=hi))throw new Error("bad value");
      return{v:point.v,dataTs:point.dataTs||null,source:/api\.bitcoin-data\.com/.test(url)?"Bitcoin Data API":/bgeometrics/.test(url)?"BGeometrics":"Bitcoin Data",url};
    },850);
    return won.value;
  }catch(e){return null}
}

function saveValuationCache(patch){
  try{
    const old=JSON.parse(localStorage.getItem(VALUATION_CACHE_KEY)||"{}");
    localStorage.setItem(
      VALUATION_CACHE_KEY,
      JSON.stringify({...old,...patch,savedAt:Date.now()})
    );
  }catch(e){
    console.warn("估值缓存保存失败",e);
  }
}
function readValuationCache(){
  let out={};
  try{
    out=JSON.parse(localStorage.getItem(VALUATION_CACHE_KEY)||"{}")||{};
  }catch(e){out={}}

  // 一次性兼容此前各版本保存的数据，避免升级后旧数据凭空消失。
  const liveKeys=["btc_live_v9","btc_live_v8","btc_live_v7","btc_live_v6"];
  for(const key of liveKeys){
    try{
      const box=JSON.parse(localStorage.getItem(key)||"null");
      const d=box&&box.data?box.data:box;
      if(!d)continue;
      if(out.mvrv==null&&d.mvrv!=null)out.mvrv=+d.mvrv;
      if(out.realized==null&&d.realized!=null)out.realized=+d.realized;
      if(out.balanced==null&&d.balanced!=null)out.balanced=+d.balanced;
      if(out.transfer==null&&d.transfer!=null)out.transfer=+d.transfer;
      if(out.sourceTs==null&&d.valuationSourceTs!=null)out.sourceTs=d.valuationSourceTs;
    }catch(e){}
  }

  // 兼容最早版本的 Realized Price 单项缓存。
  for(const key of ["bg2_rp","bg4_rp","bg5_rp"]){
    try{
      const d=JSON.parse(localStorage.getItem(key)||"null");
      if(d&&out.realized==null&&d.v!=null){
        out.realized=+d.v;
        out.sourceTs=d.sourceTs||null;
        out.source=out.source||"旧版 Realized Price 缓存";
      }
    }catch(e){}
  }

  if(out.mvrv==null&&S.raw&&S.raw.mvrv!=null)out.mvrv=+S.raw.mvrv;
  if(out.balanced==null&&S.sigs&&S.sigs.bl)out.balanced=+S.sigs.bl;
  if(out.balanced==null&&out.realized!=null&&out.transfer!=null)out.balanced=Math.round(out.realized-out.transfer);
  if(out.realized==null&&out.balanced!=null&&out.transfer!=null)out.realized=out.balanced+out.transfer;

  if(out.mvrv!=null||out.realized!=null||out.balanced!=null){
    saveValuationCache(out);
  }
  return out;
}

function valuationStatus(sourceTs,mode){
  const hasDate=!!sourceTs;
  const isStale=hasDate&&Date.now()-sourceTs>CHAIN_STALE_MS;

  if(mode==="主源"){
    if(isStale)return{
      status:"stale",
      detail:`Coin Metrics · ${staleDetail(sourceTs)}`
    };
    return{
      status:"ok",
      detail:hasDate
        ?`Coin Metrics · 数据日 ${formatDataDay(sourceTs)}`
        :"Coin Metrics · 日期未知"
    };
  }

  if(mode==="备用源"){
    if(isStale)return{
      status:"stale",
      detail:`Realized Price备用 · ${staleDetail(sourceTs)}`
    };
    return{
      status:"fallback",
      detail:hasDate
        ?`Realized Price备用 · 数据日 ${formatDataDay(sourceTs)}`
        :"Realized Price备用 · 日期未知"
    };
  }

  if(isStale)return{
    status:"stale",
    detail:`估值缓存 · ${staleDetail(sourceTs)}`
  };
  return{
    status:"cache",
    detail:hasDate
      ?`估值缓存 · 数据日 ${formatDataDay(sourceTs)}`
      :"估值缓存 · 日期未知"
  };
}
async function tryFetchValuation(url,ms=20000){
  progStep();
  const ctl=new AbortController(),
    tid=setTimeout(()=>ctl.abort(),ms),t0=Date.now();
  try{
    const r=await fetch(url,{
      mode:"cors",
      cache:"no-store",
      signal:ctl.signal
    });
    clearTimeout(tid);
    if(!r.ok)throw new Error(r.status);
    const ct=r.headers.get("content-type")||"";
    const data=ct.includes("json")?await r.json():await r.text();recordEndpoint(url,true,Date.now()-t0);return data;
  }catch(e){
    clearTimeout(tid);
    recordEndpoint(url,false,Date.now()-t0,e);
    throw e;
  }
}
function readLegacyRpCache(){
  try{
    const c=JSON.parse(localStorage.getItem("bg2_rp")||"null");
    if(c&&c.v!=null)return c;
  }catch(e){}
  return null;
}
async function fetchRealizedPriceFallback(){
  const fresh=readLegacyRpCache();
  if(fresh&&Date.now()-fresh.ts<6*3600*1000){
    return{v:+fresh.v,sourceTs:fresh.sourceTs||null,source:fresh.source||"旧版 bg2_rp",url:fresh.url||null,cached:true,staleCache:false};
  }

  let mem={};try{mem=JSON.parse(localStorage.getItem("bg_ep2")||"{}")}catch(e){}
  const paths=[
    "https://api.bitcoin-data.com/v1/realized-price",
    "https://api.bgeometrics.com/v1/realized-price",
    "https://bitcoin-data.com/api/v1/realized-price",
    "https://bitcoin-data.com/v1/realized-price",
    "https://bitcoin-data.com/v1/realized_price"
  ];
  let order=paths.slice();
  if(mem.rp)order=[mem.rp].concat(paths.filter(p=>p!==mem.rp));

  try{
    const won=await hedgedFirst(order,async url=>{
      const res=await tryFetchValuation(url,9000),point=bgPoint(res),value=point&&point.v!=null?point.v:bgLast(res);
      if(!(value!=null&&value>=5000&&value<=300000))throw new Error("bad realized price");
      return{value,sourceTs:point&&point.dataTs?point.dataTs:null,source:url.includes("bgeometrics")?"BGeometrics":"Bitcoin Data",url};
    },950);
    const x=won.value;
    mem.rp=x.url;
    try{
      localStorage.setItem("bg_ep2",JSON.stringify(mem));
      localStorage.setItem("bg2_rp",JSON.stringify({ts:Date.now(),v:x.value,sourceTs:x.sourceTs||null,source:x.source,url:x.url}));
    }catch(e){}
    saveValuationCache({realized:x.value,sourceTs:x.sourceTs||null,source:x.source,sourceUrl:x.url,mode:"legacy-fallback"});
    return{v:x.value,sourceTs:x.sourceTs||null,source:x.source,url:x.url,cached:false,staleCache:false};
  }catch(e){}

  if(fresh&&fresh.v!=null){
    return{v:+fresh.v,sourceTs:fresh.sourceTs||null,source:fresh.source||"旧版 bg2_rp",url:fresh.url||null,cached:true,staleCache:true};
  }

  const permanent=readValuationCache();
  if(permanent.realized!=null){
    return{v:+permanent.realized,sourceTs:permanent.sourceTs||null,source:permanent.source||"永久估值缓存",url:permanent.sourceUrl||null,cached:true,staleCache:true};
  }
  return null;
}

function datedStableSeries(values,series,lastTs){
  if(Array.isArray(series)&&series.length)return series.filter(x=>x&&x.day&&finiteValue(x.value)!=null).map(x=>({day:x.day,value:+x.value}));
  const a=Array.isArray(values)?values:[],end=lastTs?new Date(lastTs):new Date();return a.map((value,i)=>{const d=new Date(end);d.setUTCDate(d.getUTCDate()-(a.length-1-i));return{day:d.toISOString().slice(0,10),value:+value}}).filter(x=>Number.isFinite(x.value))
}
function setStableMetricHistory(u,c,dataTs,uSeries,cSeries){
  const ua=datedStableSeries(u,uSeries,dataTs&&dataTs.u),ca=datedStableSeries(c,cSeries,dataTs&&dataTs.c),um=new Map(ua.map(x=>[x.day,x.value])),cm=new Map(ca.map(x=>[x.day,x.value])),days=[...new Set([...um.keys(),...cm.keys()])].sort(),caps=[];
  days.forEach(day=>{const uv=um.get(day),cv=cm.get(day);if(Number.isFinite(uv)&&Number.isFinite(cv))caps.push({day,value:uv+cv})});
  METRIC_HISTORY.stableCap=caps.slice(-40);METRIC_HISTORY.stableD1=caps.map((x,i)=>i?{day:x.day,value:x.value-caps[i-1].value}:null).filter(Boolean);METRIC_HISTORY.stable=caps.map((x,i)=>i>=7?{day:x.day,value:x.value-caps[i-7].value}:null).filter(Boolean)
}

async function stableSeriesCached(){
  let c=null;
  try{c=JSON.parse(localStorage.getItem("stable4_cache"))}catch(e){}
  if(c&&Date.now()-c.ts<STABLE_TTL&&c.u&&c.c&&c.u.length>=32&&c.c.length>=32&&Array.isArray(c.uSeries)&&Array.isArray(c.cSeries)){
    setStableMetricHistory(c.u,c.c,c.dataTs,c.uSeries,c.cSeries);
    return {u:c.u,c:c.c,uSeries:c.uSeries||[],cSeries:c.cSeries||[],cached:true,stale:false,cacheTs:c.ts,dataTs:c.dataTs||{u:null,c:null}};
  }
  let u=await llamaSeries(1),s=await llamaSeries(2);
  if(!u.values.length)u=await cgCapSeries("tether");
  if(!s.values.length)s=await cgCapSeries("usd-coin");
  if(u.values.length&&s.values.length){
    const ts=Date.now(),dataTs={u:u.dataTs||null,c:s.dataTs||null};
    setStableMetricHistory(u.values,s.values,dataTs,u.series,s.series);
    try{localStorage.setItem("stable4_cache",JSON.stringify({ts,u:u.values,c:s.values,dataTs,uSeries:u.series||[],cSeries:s.series||[]}))}catch(e){}
    return {u:u.values,c:s.values,uSeries:u.series||[],cSeries:s.series||[],cached:false,stale:false,cacheTs:ts,dataTs};
  }
  if(c&&c.u&&c.c){setStableMetricHistory(c.u,c.c,c.dataTs,c.uSeries,c.cSeries);return {u:c.u,c:c.c,uSeries:c.uSeries||[],cSeries:c.cSeries||[],cached:true,stale:true,cacheTs:c.ts||null,dataTs:c.dataTs||{u:null,c:null}}}
  return null;
}
function markHealth(name,status,detail="",ts=Date.now(),sourceDetail=detail){const dataAt=status==="fail"?null:ts>0?ts:null;HEALTH[name]={name,status:effectiveHealthStatus(name,status,dataAt),detail,ts:dataAt,dataAt,fetchedAt:Date.now(),sourceDetail};if(status==="ok"&&sweepCollect){const _t=SWEEP_MAP[name];if(_t)SWEEP_PENDING.add(_t)}}
function markModuleHealth(name,text,kind="warn",dataAt=null){
  let ts=typeof dataAt==="number"?dataAt:parseDataTs(dataAt),status;
  if(/同步中|加载中|载入中|正在/.test(text))status="loading";
  else if(/进入模块|未加载|等待加载/.test(text))status="idle";
  else if(/较旧|滞后|过期/.test(text))status="stale";
  else if(kind==="bad"||/不可用|失败|缺失/.test(text))status="fail";
  else if(kind==="good")status="ok";
  else status=/缓存|快照|内置|本机/.test(text)?"cache":"fallback";
  const normalized=effectiveHealthStatus(name,status,ts),old=HEALTH[name];
  if(old&&old.status===normalized&&old.detail===text&&(old.dataAt||null)===(ts||null))return;
  markHealth(name,status,text,ts||null,text);
  if(moduleHealthRaf||!$("healthSummary"))return;
  moduleHealthRaf=requestAnimationFrame(()=>{moduleHealthRaf=0;renderHealth()});
}
function healthWeight(h){
  if(!h)return 0;
  const status=effectiveHealthStatus(h.name||"",h.status,h.dataAt||h.ts);let weight=status==="ok"?1:status==="fallback"?.85:status==="cache"?.72:status==="loading"?.5:status==="stale"?.25:status==="conflict"?.08:0;
  if(["AHR999","200WMA"].includes(h.name)&&HEALTH["价格共识"]){const pc=HEALTH["价格共识"].status;if(pc==="conflict")weight*=.35;else if(pc==="fallback")weight*=.9}
  return weight;
}
function updateDimSourceLabels(){
  const map=["AHR999","200WMA","MVRV","FGI","Puell","RR","SOPR"];
  map.forEach((name,i)=>{
    const el=$(`ds${i}`),h=HEALTH[name];
    if(!el)return;
    const status=h?h.status:"fail";
    el.textContent=status==="ok"?"可用":status==="fallback"?"备用":status==="cache"?"缓存":status==="stale"?"滞后":status==="conflict"?"冲突":"缺失";
    el.style.color=status==="ok"?"var(--market-positive)":status==="fallback"?"var(--market-warning)":status==="cache"?"var(--market-caution)":status==="stale"?"var(--market-caution)":"var(--market-negative)";
  });
}
function healthStatusMeta(status){
  const m={ok:["可用","ok","var(--market-positive)"],fallback:["备用","fallback","var(--market-caution)"],cache:["缓存","cache","var(--market-caution)"],stale:["滞后","stale","var(--market-warning)"],conflict:["冲突","conflict","var(--market-negative)"],fail:["缺失","fail","var(--market-negative)"],loading:["加载中","loading","var(--signal-info)"],idle:["按需","idle","var(--text-tertiary)"]};
  return m[status]||m.fail;
}
function healthRole(name){return CORE_HEALTH.includes(name)?"核心":MODULE_HEALTH.includes(name)?"按需":"基础"}
function healthWindow(ms){if(ms<3600000)return Math.round(ms/60000)+"分钟";if(ms<86400000)return Math.round(ms/3600000)+"小时";return Math.round(ms/86400000)+"天"}
function healthDuration(ms){if(!(ms>=0))return"--";return ms<1000?Math.round(ms)+"ms":(ms/1000).toFixed(ms<10000?1:0)+"s"}
function healthBytes(n){if(!(n>=0))return"--";return n<1048576?Math.round(n/1024)+"KB":(n/1048576).toFixed(n<10485760?1:0)+"MB"}
function healthCenterSnapshot(){
  const items=SOURCE_ORDER.filter(n=>HEALTH[n]),active=items.filter(n=>!['idle'].includes(HEALTH[n].status)),coreItems=CORE_HEALTH.map(n=>HEALTH[n]||{name:n,status:"fail",dataAt:null}),core=coreHealthInfo(),fresh=active.filter(n=>["ok","fallback"].includes(HEALTH[n].status)).length,issues=active.filter(n=>["stale","conflict","fail"].includes(HEALTH[n].status));
  const avg=list=>list.length?list.reduce((s,h)=>s+healthWeight(h),0)/list.length*100:0,coreScore=avg(coreItems),supportItems=active.filter(n=>!CORE_HEALTH.includes(n)).map(n=>HEALTH[n]),supportScore=supportItems.length?avg(supportItems):coreScore;
  const pc=HEALTH_RUNTIME.priceConsensus,consistency=pc?(pc.status==="ok"?100:pc.status==="fallback"?60:pc.status==="conflict"?8:0):55;
  const swNeutral=!/^https?:$/.test(location.protocol),runtime=(HEALTH_RUNTIME.online?45:0)+(HEALTH_RUNTIME.storageOk===false?0:30)+(swNeutral||/已接管|已激活|就绪/.test(HEALTH_RUNTIME.swState)?25:12);
  const measured=CORE_HEALTH.some(n=>HEALTH[n]),score=measured?Math.round(coreScore*.58+supportScore*.20+consistency*.12+runtime*.10):null;
  const severe=issues.filter(n=>CORE_HEALTH.includes(n)||n==="价格"||n==="价格共识");
  const ready=core.ready,verdict=!measured?"正在建立可信度":ready&&!severe.length?"数据可信，可用于决策":ready?"数据可用，但存在降级":"关键数据不足，暂不判断",color=score==null?"var(--text-tertiary)":score>=85?"var(--market-positive)":score>=65?"var(--market-caution)":"var(--market-negative)";
  return{items,active,core,fresh,issues,severe,score,ready,verdict,color,pc};
}
function renderHealthAlerts(snap){
  const el=$("healthAlerts");if(!el)return;const alerts=[];
  if(!HEALTH_RUNTIME.online)alerts.push({kind:"bad",title:"当前设备离线",text:"页面只会沿用本机缓存；恢复网络后请重新检测。"});
  snap.issues.slice().sort((a,b)=>(CORE_HEALTH.includes(b)?1:0)-(CORE_HEALTH.includes(a)?1:0)||({conflict:0,fail:1,stale:2}[HEALTH[a].status]??3)-({conflict:0,fail:1,stale:2}[HEALTH[b].status]??3)).slice(0,4).forEach(name=>{const h=HEALTH[name],meta=healthStatusMeta(h.status);alerts.push({kind:h.status==="stale"?"warn":"bad",title:`${name} · ${meta[0]}`,text:h.detail||h.sourceDetail||"暂无可用说明"})});
  const degraded=CORE_HEALTH.filter(n=>HEALTH[n]&&["fallback","cache"].includes(HEALTH[n].status));
  if(degraded.length&&!alerts.some(x=>/SOPR|Puell|RR/.test(x.title)))alerts.push({kind:"warn",title:"核心输入存在降级",text:`${degraded.join("、")} 正在使用备用源或本机成功缓存，模型已自动降低其权重。`});
  if(!getBgApiKey()&&["SOPR","Puell","RR"].some(n=>HEALTH[n]&&HEALTH[n].status!=="ok"))alerts.push({kind:"warn",title:"授权链上源未配置",text:"SOPR、Puell 与 Reserve Risk 可能沿用最近快照；配置个人 Key 后可恢复自动更新。"});
  if(!alerts.length)alerts.push({kind:"good",title:"未发现阻断性问题",text:"核心数据、价格共识与网站运行状态均在允许范围内。"});
  el.innerHTML=alerts.slice(0,5).map(a=>`<div class="health-alert ${a.kind}"><i aria-hidden="true"></i><div><b>${esc(a.title)}</b><span>${esc(a.text)}</span></div></div>`).join("");
}
function renderHealthRuntime(){
  const el=$("healthRuntimeGrid");if(!el)return;const r=HEALTH_RUNTIME,storageText=r.storageOk==null?"检查中":r.storageOk?"可写":"不可用",storageSub=r.storageUsage!=null&&r.storageQuota>0?`${healthBytes(r.storageUsage)} / ${healthBytes(r.storageQuota)}${r.persistent===true?" · 持久化":r.persistent===false?" · 可被系统清理":""}`:"本机缓存状态",syncText=r.lastSyncAt?cacheAge(r.lastSyncAt):"尚未完成",syncSub=r.lastSyncDuration!=null?`耗时 ${healthDuration(r.lastSyncDuration)} · ${r.lastSyncOk?"核心可用":"核心不足"}`:"等待全量同步";const u=typeof APP_UPDATE!=="undefined"?APP_UPDATE:null,updatePending=!!u?.ready,updateText=u?.status||"等待检查",updateSub=u?.checkedAt?"检查于 "+new Date(u.checkedAt).toLocaleTimeString("zh-CN"):"当前 "+BUILD_LABEL,cards=[
    ["网络",r.online?"在线":"离线",r.online?"允许实时请求":"仅使用本机缓存",r.online?"var(--market-positive)":"var(--market-negative)"],
    ["本机存储",storageText,storageSub,r.storageOk===false?"var(--market-negative)":"var(--market-positive)"],
    ["离线缓存",r.swState,"Service Worker 运行状态",/失败|不可用/.test(r.swState)?"var(--market-negative)":"var(--text-primary)"],
    ["全量同步",syncText,syncSub,r.lastSyncOk===false?"var(--market-caution)":"var(--text-primary)"],
    ["版本检查",updateText,updateSub,updatePending?"var(--market-caution)":"var(--text-primary)"]
  ];el.innerHTML=cards.map(c=>`<div class="health-runtime"><small>${c[0]}</small><b style="color:${c[3]}">${esc(c[1])}</b><span>${esc(c[2])}</span></div>`).join("");
}
function renderEndpointHealth(){
  const grid=$("healthEndpointGrid"),summary=$("healthEndpointSummary");if(!grid)return;const rows=Object.values(ENDPOINT_HEALTH).sort((a,b)=>(a.lastOk===b.lastOk?0:a.lastOk?1:-1)||(b.lastAt||0)-(a.lastAt||0)),attempts=rows.reduce((s,x)=>s+x.attempts,0),successes=rows.reduce((s,x)=>s+x.successes,0);
  if(summary)summary.textContent=rows.length?`${rows.length} 组 · 本轮 ${successes}/${attempts} 次成功`:"等待本轮接口请求";
  if(!rows.length){grid.innerHTML='<div class="health-endpoint"><small>连接状态</small><b>等待请求</b><span>重新检测后显示接口延迟</span></div>';return}
  grid.innerHTML=rows.slice(0,12).map(x=>{const ratio=x.attempts?x.successes/x.attempts:0,kind=!x.lastOk?"bad":ratio<.65||x.lastLatency>4000?"warn":"good",state=!x.lastOk?"连接失败":x.lastLatency>4000?"响应较慢":"连接正常",sub=x.lastOk?`${x.lastLatency==null?"--":x.lastLatency+"ms"} · 成功 ${x.successes}/${x.attempts}`:`${x.lastError||"请求失败"} · 成功 ${x.successes}/${x.attempts}`;return`<div class="health-endpoint ${kind}"><small>${esc(x.name)}</small><b>${state}</b><span>${esc(sub)}</span></div>`}).join("");
}
function healthFilteredItems(items){
  if(HEALTH_FILTER==="core")return items.filter(n=>CORE_HEALTH.includes(n));
  if(HEALTH_FILTER==="base")return items.filter(n=>!CORE_HEALTH.includes(n)&&!MODULE_HEALTH.includes(n));
  if(HEALTH_FILTER==="module")return items.filter(n=>MODULE_HEALTH.includes(n));
  if(HEALTH_FILTER==="issue")return items.filter(n=>HEALTH[n]&&!["ok","idle"].includes(HEALTH[n].status));
  return items;
}
function renderHealth(){
  ensureModuleHealth();refreshHealthAges();renderBgKeyState();
  const snap=healthCenterSnapshot(),panel=$("healthPanel"),score=snap.score,shown=healthFilteredItems(snap.items),activeCount=snap.active.length;
  if(panel){panel.style.setProperty("--health-score",score==null?0:score);panel.style.setProperty("--health-color",snap.color)}
  if($("healthScore"))$("healthScore").textContent=score==null?"--":score;
  if($("healthScoreRing"))$("healthScoreRing").setAttribute("aria-label",score==null?"数据健康度等待检查":`数据健康度 ${score} 分`);
  if($("healthVerdict"))$("healthVerdict").textContent=snap.verdict;
  if($("healthVerdictSub"))$("healthVerdictSub").textContent=snap.ready?`七项核心指标可靠 ${snap.core.reliable}/7，有效覆盖 ${snap.core.coverage.toFixed(1)}/7；异常输入已自动降权。`:`当前可靠核心 ${snap.core.reliable}/7，有效覆盖 ${snap.core.coverage.toFixed(1)}/7；至少需要 4 项可靠且覆盖达到 3.5。`;
  if($("healthSummary"))$("healthSummary").textContent=score==null?"等待检查":`健康 ${score} · ${snap.issues.length?snap.issues.length+"项异常":"无阻断"}`;
  if($("healthCoreValue"))$("healthCoreValue").textContent=`${snap.core.reliable}/7`;
  if($("healthCoreSub"))$("healthCoreSub").textContent=`有效覆盖 ${snap.core.coverage.toFixed(1)}/7 · ${snap.core.live}项可用/备用`;
  if($("healthFreshValue"))$("healthFreshValue").textContent=activeCount?`${Math.round(snap.fresh/activeCount*100)}%`:"--";
  if($("healthFreshSub"))$("healthFreshSub").textContent=activeCount?`${snap.fresh}/${activeCount} 项为可用或备用`:`不含按需未加载模块`;
  const pc=snap.pc;if($("healthConsensusValue"))$("healthConsensusValue").textContent=!pc||pc.spread==null?pc&&pc.quotes.length?`${pc.quotes.length}/3`:"--":`${pc.spread.toFixed(2)}%`;
  if($("healthConsensusSub"))$("healthConsensusSub").textContent=!pc?"等待三家现货源":pc.quotes.length<2?"仅一个现货源响应":`${pc.quotes.length}/3 源 · 偏差越低越一致`;
  if($("healthSyncValue"))$("healthSyncValue").textContent=HEALTH_RUNTIME.lastSyncAt?cacheAge(HEALTH_RUNTIME.lastSyncAt):"--";
  if($("healthSyncSub"))$("healthSyncSub").textContent=HEALTH_RUNTIME.lastSyncDuration!=null?`耗时 ${healthDuration(HEALTH_RUNTIME.lastSyncDuration)} · ${HEALTH_RUNTIME.lastSyncOk?"核心可用":"核心不足"}`:"尚未完成本轮检测";
  if($("healthSourceCount"))$("healthSourceCount").textContent=`${shown.length}/${snap.items.length}`;
  if($("healthGrid"))$("healthGrid").innerHTML=shown.map(n=>{const h=HEALTH[n],meta=healthStatusMeta(h.status),detail=h.sourceDetail||h.detail||"暂无来源说明",age=freshnessDataText(h,true),fetched=h.fetchedAt?`拉取 ${cacheAge(h.fetchedAt)}`:"尚未拉取",limit=n==="定投回测"?"周期：已完成自然月":`阈值 ${healthWindow(staleLimit(n))}`;return`<div class="health-item"><div class="health-source-head"><div class="health-name">${esc(n)}</div><span class="health-role">${healthRole(n)}</span></div><div class="health-detail">${esc(detail)}<span> · ${esc(age)} · ${esc(fetched)} · ${esc(limit)}</span></div><span class="health-state-chip ${meta[1]}">${meta[0]}</span></div>`}).join("")||'<div class="health-item"><div class="health-name">当前筛选无项目</div><div class="health-detail">切换筛选条件查看其他数据源。</div><span class="health-state-chip idle">空</span></div>';
  renderHealthAlerts(snap);renderHealthRuntime();renderEndpointHealth();

  const badge=$("healthBadge");
  if(badge){badge.textContent=score==null?"检测中":`健康 ${score}`;badge.className="hbadge "+(score==null?"":snap.ready&&snap.severe.length===0?"good":score>=60?"warn":"bad")}

  updateDimSourceLabels();
  renderFreshness();
  renderAction();
}
function freshnessWorst(names){
  const rank={ok:0,fallback:1,cache:2,loading:2,idle:2,stale:3,conflict:4,fail:5},items=(Array.isArray(names)?names:[names]).map(n=>HEALTH[n]).filter(Boolean);
  return items.length?items.sort((a,b)=>(rank[b.status]??4)-(rank[a.status]??4)||((a.dataAt||a.ts||0)-(b.dataAt||b.ts||0)))[0]:null;
}
// These sources expose dated observations. Fetching them today does not make
// yesterday's on-chain close a real-time reading. This only formats labels.
const DATED_HEALTH=new Set(["AHR999","200WMA","均线","FGI","关机价","MVRV","均衡价","USDT","USDC","LTH-NUPL","LTH_PSIL","SOPR","Puell","RR","BRK信号","Floor模型","UTXO底价","成本状态机","幂律历史","矿业趋势","持币群体","成本基础","资本化价格","LTH花费","LTH筹码集中","URPD","深度亏损"]);
function freshnessDate(ts,full=false){
  if(!(ts>0)||!Number.isFinite(new Date(+ts).getTime()))return"日期未知";
  const day=new Date(+ts).toISOString().slice(0,10);
  return full||day.slice(0,4)!==String(new Date().getUTCFullYear())?day:day.slice(5);
}
function freshnessDataText(h,full=false){
  const ts=h&&(h.dataAt||h.ts);
  if(!(ts>0))return"数据日期未知";
  if(h.name==="定投回测")return "回测截至 "+(Number.isFinite(new Date(+ts).getTime())?new Date(+ts).toISOString().slice(0,7):"日期未知");
  return DATED_HEALTH.has(h.name)?`${h.name==="AHR999"?"成本日":"数据日"} ${freshnessDate(ts,full)}${full?" UTC":""}`:`更新 ${cacheAge(ts)}`;
}
function freshnessTitle(h){
  const fetched=new Date(h.fetchedAt);
  return [h.name,freshnessDataText(h,true),h.fetchedAt&&Number.isFinite(fetched.getTime())?`拉取 ${fetched.toISOString().replace("T"," ").slice(0,19)} UTC`:"尚未拉取",h.detail,h.lastError].filter(Boolean).join(" · ");
}
function freshnessText(h){
  if(h.name==="定投回测")return dcaFreshnessText(h);
  const status=effectiveHealthStatus(h.name,h.status,h.dataAt||h.ts),ts=h.dataAt||h.ts;
  if(status==="loading"||h.detail==="同步历史")return"更新中";
  if(status==="idle")return"等待数据";
  if(status==="fail")return"暂不可用";
  if(status==="conflict")return"数据冲突";
  if(!(ts>0))return"日期未知";
  if(status==="ok")return freshnessDataText(h).replace(/^成本日 /,"数据日 ").replace(/^(数据日|更新) /,"$1 · ");
  return `${healthStatusMeta(status)[0]} · ${DATED_HEALTH.has(h.name)?freshnessDate(ts):cacheAge(ts)}`;
}
function setFresh(id,names){
  const el=$(id);if(!el)return;const h=freshnessWorst(names);
  if(!h){el.textContent="等待数据";el.className="fresh-badge";el.removeAttribute("title");return}
  const status=effectiveHealthStatus(h.name,h.status,h.dataAt||h.ts);
  el.textContent=freshnessText(h);
  el.className="fresh-badge "+(status==="ok"?"good":["fail","conflict"].includes(status)?"bad":"warn");
  el.title=(Array.isArray(names)?names:[names]).map(n=>HEALTH[n]&&freshnessTitle(HEALTH[n])).filter(Boolean).join("\n");
}
function mirrorFgiFreshBadge(){
  const src=$("freshFgi"),dst=$("freshFgiChart");
  if(!dst)return;
  if(src&&src.textContent&&src.textContent!=="等待数据"){
    dst.textContent=src.textContent;
    dst.className=src.className;
    if(src.title)dst.title=src.title;else dst.removeAttribute("title");
  }else if(typeof setFresh==="function"){
    setFresh("freshFgiChart","FGI");
  }
}
function renderFreshness(){
  refreshHealthAges();
  setFresh("freshScore",CORE_HEALTH);setFresh("freshAhr","AHR999");setFresh("freshStable",["USDT","USDC"]);
  setFresh("freshFgi","FGI");setFresh("freshFgiChart","FGI");mirrorFgiFreshBadge();setFresh("freshFunding","资金费率");setFresh("freshPremium","Coinbase溢价");
  setFresh("freshMarket",["关机价","均衡价","200WMA","SOPR","Puell","减半","概率","LTH-NUPL"]);
  setFresh("freshMiner","关机价");setFresh("freshBalanced","均衡价");setFresh("freshWma","200WMA");setFresh("freshSopr","SOPR");setFresh("freshPuellMarket","Puell");setFresh("freshHalving","减半");setFresh("freshProb50","概率");setFresh("freshProb90","概率");setFresh("freshLth","LTH-NUPL");setFresh("freshLthPsil","LTH_PSIL");setFresh("freshMA","均线");setFresh("freshAnchors","BRK信号");setFresh("freshCostBasis","成本基础");setFresh("freshCostState","成本状态机");setFresh("freshLthPulse","LTH花费");setFresh("freshCustody","自托管窗口");setFresh("freshDcaLab","定投回测");
  setFresh("freshBitviewFloor","Floor模型");setFresh("freshFloor","UTXO底价");setFresh("freshPower","幂律历史");setFresh("freshMining","矿业趋势");setFresh("freshHolders","持币群体");setFresh("freshCapitalized","资本化价格");setFresh("freshDist","URPD");setFresh("freshDeepLoss","深度亏损");
}
function renderFunds(){
  S.raw=S.raw||{};
  const fgi=+S.raw.fgi,fv=$("fgiValue"),fs=$("fgiState");
  if(Number.isFinite(fgi)&&fgi>=0){
    const st=fgi<25?["极度恐惧","var(--market-positive)"]:fgi<45?["恐惧","var(--market-positive-emphasis)"]:fgi<56?["中性","var(--text-secondary)"]:fgi<75?["贪婪","var(--market-caution)"]:["极度贪婪","var(--market-negative)"];
    fv.textContent=Math.round(fgi);fv.style.color=st[1];fs.textContent=st[0];fs.style.color=st[1];
  }else{fv.textContent="--";fs.textContent="等待数据";fs.style.color="var(--text-tertiary)"}
  const funding=+S.raw.fundingRate,fr=$("fundingRate"),fst=$("fundingState"),fh=$("fundingHint");
  if(Number.isFinite(funding)){
    const pct=funding*100,annual=pct*3*365,st=funding<-.0001?["空头拥挤","var(--signal-info)"]:funding<=.0001?["杠杆中性","var(--market-positive-emphasis)"]:funding<=.0003?["多头温和","var(--market-warning)"]:["多头拥挤","var(--market-negative)"],health=HEALTH["资金费率"]||{},hint=String(S.raw.fundingSource||health.sourceDetail||health.detail||""),source=/binance/i.test(hint)?"Binance备用":/okx/i.test(hint)?"OKX":"永续";
    fr.textContent=(pct>=0?"+":"")+pct.toFixed(4)+"%";fr.style.color=st[1];fst.textContent=st[0];fst.style.color=st[1];fh.textContent=`${source} 永续 · 年化约 ${annual>=0?"+":""}${annual.toFixed(1)}%`;
  }else{fr.textContent="--";fst.textContent="等待数据";fst.style.color="var(--text-tertiary)";fh.textContent="OKX BTC-USDT 永续 · 每8小时"}
  const premium=+S.raw.coinbasePremium,cp=$("coinbasePremium"),ps=$("premiumState"),ph=$("premiumHint");
  if(Number.isFinite(premium)){
    const st=premium>.1?["美国现货需求偏强","var(--market-positive)"]:premium<-.1?["美国现货需求偏弱","var(--market-caution)"]:["现货需求中性","var(--text-secondary)"],diff=finiteValue(S.raw.coinbaseSpread);
    cp.textContent=(premium>=0?"+":"")+premium.toFixed(3)+"%";cp.style.color=st[1];ps.textContent=st[0];ps.style.color=st[1];ph.textContent=diff==null?"Coinbase USD − BTC/USDT 参考价":`价差 ${diff>=0?"+":""}$${Math.round(diff).toLocaleString()} · USD/USDT 参考`;
  }else{cp.textContent="--";ps.textContent="等待数据";ps.style.color="var(--text-tertiary)";ph.textContent="Coinbase USD − BTC/USDT 参考价"}
  renderFreshness();
}
function statusDay(){return new Date().toISOString().slice(0,10)}
function finiteValue(v){if(v==null||v==="")return null;const n=+v;return Number.isFinite(n)?n:null}
function qDay(q){return q?(q.d||q.dataDay||null):null}
function slimQuality(q){if(!q)return{w:0};const w=finiteValue(q.w!=null?q.w:q.weight),o={w:w==null?0:Math.round(Math.max(0,Math.min(1,w))*100)/100},d=q.d||q.dataDay||null;if(d)o.d=d;return o}
function healthQuality(name){const h=HEALTH[name],dataAt=h&&(h.dataAt||h.ts)||null,status=h?effectiveHealthStatus(name,h.status,dataAt):"fail";return{weight:healthWeight(h),status,dataAt,dataDay:dayFromTs(dataAt),source:h&&(h.sourceDetail||h.detail)||""}}
function combinedHealthQuality(names){const a=names.map(healthQuality),valid=a.filter(x=>x.dataAt>0),weight=a.length?Math.min(...a.map(x=>x.weight)):0,dataAt=valid.length?Math.min(...valid.map(x=>x.dataAt)):null,status=weight>=1?"ok":weight>=.85?"fallback":weight>=.75?"cache":weight>0?"stale":"fail";return{weight,status,dataAt,dataDay:dayFromTs(dataAt),source:names.join("+")}}
function snapshotQuality(){const q=n=>slimQuality(healthQuality(n)),stable=slimQuality(combinedHealthQuality(["USDT","USDC"]));return{ahr:q("AHR999"),wmaRatio:q("200WMA"),mvrv:q("MVRV"),fgi:q("FGI"),puell:q("Puell"),rr:q("RR"),sopr:q("SOPR"),lth:q("LTH-NUPL"),lthPsil:q("LTH_PSIL"),stableD1:stable,stableD7:{...stable},funding:q("资金费率"),premium:q("Coinbase溢价")}}
function recordQualityWeight(r,key,value){const q=r&&r.quality&&r.quality[key],w=q&&finiteValue(q.w!=null?q.w:q.weight);if(w!=null)return Math.max(0,Math.min(1,w));return r&&r.quality?0:value!=null?1:0}
function evaluateRecord(r){const values=SCORE_FIELDS.map(k=>finiteValue(r&&r[k]));let available=0,reliable=0,coverage=0,raw=0,adjusted=0;const rowTs=(r&&(+r.ts||Date.parse((r.day||"")+"T00:00:00Z")))||null;values.forEach((v,i)=>{const mapped=v!=null?SCORE_MAPPERS[i](v,rowTs):50,q=v!=null?recordQualityWeight(r,SCORE_FIELDS[i],v):0;if(v!=null)available++;if(v!=null&&q>=.5)reliable++;coverage+=q;raw+=mapped*DM[i].w;adjusted+=(50+(mapped-50)*q)*DM[i].w});const ready=available>=MODEL_MIN_RELIABLE&&reliable>=MODEL_MIN_RELIABLE&&coverage>=MODEL_MIN_COVERAGE;return{ready,available,reliable,coverage,rawScore:Math.round(raw),referenceScore:Math.round(adjusted),score:ready?Math.round(adjusted):null}}
function readStatusInputs(){
  const stable=combinedStableStats(),wm=finiteValue($("swm")&&$("swm").value),soprRaw=$("ssp")&&$("ssp").value,sopr=soprRaw===""?null:finiteValue(soprRaw),lthRaw=$("slth")&&$("slth").value;
  const snap={day:statusDay(),ts:Date.now(),price:finiteValue(S.price),score:null,ahr:S.ahr?finiteValue(S.ahr.v):null,mvrv:finiteValue(S.raw&&S.raw.mvrv),fgi:finiteValue(S.raw&&S.raw.fgi),puell:finiteValue(S.raw&&S.raw.puell),rr:finiteValue(S.raw&&S.raw.rr),sopr,lth:lthRaw===""?null:finiteValue(lthRaw),lthPsil:finiteValue(S.raw&&S.raw.lthPsil),stableD1:stable?finiteValue(stable.d1):null,stableD7:stable?finiteValue(stable.d7):null,wmaRatio:wm>0&&S.price>0?S.price/wm:null,funding:finiteValue(S.raw&&S.raw.fundingRate),premium:finiteValue(S.raw&&S.raw.coinbasePremium),quality:snapshotQuality()};
  snap.score=evaluateRecord(snap).score;return snap;
}
function persistIndicatorHistory(force=false){
  if(!force&&Date.now()-lastHistorySaveAt<300000)return;lastHistorySaveAt=Date.now();try{localStorage.setItem(STATUS_HISTORY_KEY,JSON.stringify(STATUS_HISTORY))}catch(e){}
}
function commitStatusSnapshot(force=false,render=true){
  const snap=currentStatusSnapshot();if(!(snap.price>0))return;const snapModel=evaluateRecord(snap);
  const i=STATUS_HISTORY.findIndex(x=>x&&x.day===snap.day);if(i>=0){const old=STATUS_HISTORY[i],oldReady=evaluateRecord(old).ready,merged={...old};if(snapModel.ready||!oldReady)Object.keys(snap).forEach(k=>{if(snap[k]!=null)merged[k]=snap[k]});else{merged.ts=snap.ts;merged.price=snap.price}STATUS_HISTORY[i]=merged}else STATUS_HISTORY.push(snap);
  STATUS_HISTORY=STATUS_HISTORY.filter(x=>x&&x.day).sort((a,b)=>String(a.day).localeCompare(String(b.day))).slice(-365);
  persistIndicatorHistory(force);if(render)renderIntelligence();
}
function previousStatusSnapshot(){const today=statusDay();return STATUS_HISTORY.filter(x=>x&&x.day<today).sort((a,b)=>String(a.day).localeCompare(String(b.day))).at(-1)||null}
function completedDailyRows(){const utcToday=Math.floor(Date.now()/86400000)*86400,rows=normalizedDaily();return rows.filter(r=>r.time<utcToday)}
function ahrHistorySeries(){
  const rows=normalizedDaily(),out=[];let inverse=0;rows.forEach((r,i)=>{inverse+=1/r.close;if(i>=200)inverse-=1/rows[i-200].close;if(i<199)return;const hm=200/inverse,dg=Math.floor((r.time*1000-new Date("2009-01-03").getTime())/864e5),pl=Math.pow(10,AHR_A*Math.log10(dg)+AHR_B),value=r.close*r.close/(hm*pl);if(Number.isFinite(value)&&value>0)out.push({day:new Date(r.time*1000).toISOString().slice(0,10),value})});return out.slice(-365)
}
function metricDayMap(key){return new Map((METRIC_HISTORY[key]||[]).filter(x=>x&&x.day&&finiteValue(x.value)!=null).map(x=>[x.day,+x.value]))}
function calibratedScoreFromRecord(r){return evaluateRecord(r).score}
function historyQuality(day){return{w:1,d:day}}
function rebuildIndicatorHistory(){
  const old=new Map(STATUS_HISTORY.filter(x=>x&&x.day).map(x=>[x.day,x])),maps={ahr:new Map(ahrHistorySeries().map(x=>[x.day,x.value])),mvrv:metricDayMap("mvrv"),fgi:metricDayMap("fgi"),puell:metricDayMap("puell"),rr:metricDayMap("rr"),sopr:metricDayMap("sopr"),lth:metricDayMap("lthnupl"),lthPsil:metricDayMap("lthPsil"),stableD1:metricDayMap("stableD1"),stableD7:metricDayMap("stable"),funding:metricDayMap("funding")},rows=normalizedDaily().slice(-365).map(r=>{const day=new Date(r.time*1000).toISOString().slice(0,10),saved=old.get(day),base=saved?{...saved,quality:{...(saved.quality||{})}}:{day,quality:{}};base.day=day;base.ts=r.time*1000;base.price=r.close;Object.keys(maps).forEach(k=>{const v=maps[k].get(day);if(Number.isFinite(v)){base[k]=v;base.quality[k]=historyQuality(day)}});const model=evaluateRecord(base);if(model.ready)base.score=model.score;else delete base.score;return base});
  old.forEach((v,day)=>{if(day<=statusDay()&&!rows.some(x=>x.day===day)){const base={...v,quality:{...(v.quality||{})}},model=evaluateRecord(base);if(model.ready)base.score=model.score;else delete base.score;rows.push(base)}});STATUS_HISTORY=rows.filter(x=>x&&x.day&&x.day<=statusDay()).sort((a,b)=>String(a.day).localeCompare(String(b.day))).slice(-365);commitStatusSnapshot(true)
}
const PHASES={unknown:{name:"数据建立中",color:"var(--text-secondary)",desc:"有效历史不足，暂不判断市场阶段。"},capitulation:{name:"深度投降",color:"var(--market-positive)",desc:"估值与链上亏损兑现同时进入极端区。"},bottom:{name:"低估筑底",color:"var(--market-positive-emphasis)",desc:"长期估值偏低，市场仍在消化压力并构筑底部。"},recovery:{name:"复苏",color:"var(--market-warning)",desc:"估值修复中，链上状态开始从压力区回升。"},expansion:{name:"趋势扩张",color:"var(--signal-info)",desc:"价格与盈利趋势扩张，市场进入顺周期阶段。"},distribution:{name:"高位分配",color:"var(--market-caution)",desc:"估值走高且获利兑现增强，需留意分配压力。"},overheat:{name:"过热风险",color:"var(--market-negative)",desc:"多项估值进入历史高位，回撤风险显著上升。"}};
function phaseInfo(r){
  const model=evaluateRecord(r||{});if(!model.ready)return{key:"unknown",score:null,model,...PHASES.unknown};const sc=model.score,lth=finiteValue(r.lth),sopr=finiteValue(r.sopr),wma=finiteValue(r.wmaRatio);let key;if((sc>=85&&(lth!=null&&lth<.1||sopr!=null&&sopr<.97))||(lth!=null&&lth<0&&sopr!=null&&sopr<1))key="capitulation";else if(sc>=70)key="bottom";else if(sc>=55)key="recovery";else if(sc>=35&&(wma==null||wma>=1))key="expansion";else if(sc>=20)key="distribution";else key="overheat";return{key,score:sc,model,...PHASES[key]}
}

const REGIME_ORDER=["overheat","distribution","expansion","recovery","bottom","capitulation"];
const REGIME_BANDS={
  overheat:{lo:0,hi:20},
  distribution:{lo:20,hi:35},
  expansion:{lo:35,hi:55},
  recovery:{lo:55,hi:70},
  bottom:{lo:70,hi:85},
  capitulation:{lo:85,hi:100}
};
const REGIME_SIGNAL_NAMES=["AHR999","200WMA","MVRV","FGI","Puell","Reserve Risk","SOPR"];
function regimeClamp(v,lo=0,hi=1){return Math.max(lo,Math.min(hi,v))}
function regimeSignals(r){
  const model=evaluateRecord(r||{}),ts=(r&&(+r.ts||Date.parse((r.day||"")+"T00:00:00Z")))||Date.now();
  return SCORE_FIELDS.map((key,i)=>{
    const value=finiteValue(r&&r[key]),q=value==null?0:recordQualityWeight(r,key,value);
    if(value==null||q<=0)return null;
    const mapped=SCORE_MAPPERS[i](value,ts),contribution=(mapped-50)*DM[i].w*q;
    return{name:REGIME_SIGNAL_NAMES[i],key,value,q,mapped,contribution,weight:DM[i].w};
  }).filter(Boolean)
}
function regimeBandStrength(phase,r){
  if(!phase||phase.key==="unknown"||phase.score==null)return 0;
  const sc=phase.score,band=REGIME_BANDS[phase.key];
  if(!band)return 0;
  // “深度投降”允许由 LTH+SOPR 极端链上组合触发，即使综合分数尚未 >=85。
  if(phase.key==="capitulation"&&sc<85){
    const lth=finiteValue(r&&r.lth),sopr=finiteValue(r&&r.sopr);
    return lth!=null&&lth<0&&sopr!=null&&sopr<1?.88:.68;
  }
  if(phase.key==="overheat")return regimeClamp((20-sc)/20);
  if(phase.key==="capitulation")return regimeClamp((sc-85)/15);
  const half=(band.hi-band.lo)/2,dist=Math.min(sc-band.lo,band.hi-sc);
  return regimeClamp(dist/half);
}
function regimeBoundaryInfo(r){
  const phase=phaseInfo(r||{}),sc=phase.score;
  if(phase.key==="unknown"||sc==null)return{name:"等待评分",distance:null,detail:"有效数据不足"};
  if(phase.key==="capitulation"&&sc<85)return{name:"链上极端触发",distance:null,detail:"LTH / SOPR 组合覆盖评分边界"};
  const idx=REGIME_ORDER.indexOf(phase.key),band=REGIME_BANDS[phase.key],candidates=[];
  if(idx>0)candidates.push({name:PHASES[REGIME_ORDER[idx-1]].name,distance:Math.abs(sc-band.lo),score:band.lo});
  if(idx<REGIME_ORDER.length-1)candidates.push({name:PHASES[REGIME_ORDER[idx+1]].name,distance:Math.abs(band.hi-sc),score:band.hi});
  const near=candidates.sort((a,b)=>a.distance-b.distance)[0];
  return near?{name:near.name,distance:Math.round(near.distance),detail:`评分边界 ${near.score}`}:{name:"阶段极端",distance:null,detail:"暂无相邻边界"};
}
function regimeConfidenceAt(rows,idx){
  const r=rows[idx],phase=phaseInfo(r||{}),model=evaluateRecord(r||{});
  if(!r||phase.key==="unknown"||!model.ready)return{ready:false,confidence:null,phase,coverage:0,agreement:0,band:0,stability:0};
  const signals=regimeSignals(r),totalW=signals.reduce((s,x)=>s+x.weight*x.q,0),
    spread=totalW?signals.reduce((s,x)=>s+Math.abs(x.mapped-model.score)*x.weight*x.q,0)/totalW:50,
    agreement=regimeClamp(1-spread/45),
    coverage=regimeClamp(model.coverage/7),
    band=regimeBandStrength(phase,r),
    endTs=Date.parse(r.day+"T00:00:00Z"),startTs=endTs-6*86400000;
  let stableN=0,sameN=0;
  for(let i=idx;i>=0;i--){
    const x=rows[i],ts=Date.parse(x.day+"T00:00:00Z");if(ts<startTs)break;
    const p=phaseInfo(x);if(p.key==="unknown")continue;
    stableN++;if(p.key===phase.key)sameN++;
  }
  const stability=stableN>=3?sameN/stableN:stableN?(.35+.15*sameN):.25;
  const confidence=Math.round(100*(coverage*.35+agreement*.25+band*.20+regimeClamp(stability)*.20));
  return{ready:true,confidence:regimeClamp(confidence,0,100),phase,coverage,agreement,band,stability,signals,model}
}
function regimeDrivers(r){
  return regimeSignals(r).sort((a,b)=>Math.abs(b.contribution)-Math.abs(a.contribution)).slice(0,3)
}
function regimeContext(){
  const rows=intelligenceRows(),idx=rows.length-1,now=idx>=0?regimeConfidenceAt(rows,idx):{ready:false,confidence:null,phase:PHASES.unknown};
  if(!now.ready)return{...now,delta:null,old:null,boundary:regimeBoundaryInfo(rows.at(-1)||{}),drivers:[]};
  const latestTs=Date.parse(rows[idx].day+"T00:00:00Z"),target=latestTs-7*86400000;
  let oldIdx=-1;
  for(let i=idx-1;i>=0;i--){
    const ts=Date.parse(rows[i].day+"T00:00:00Z");
    if(ts<=target){oldIdx=i;break}
  }
  if(oldIdx<0){
    for(let i=idx-1;i>=0;i--){if(regimeConfidenceAt(rows,i).ready){oldIdx=i;break}}
  }
  const old=oldIdx>=0?regimeConfidenceAt(rows,oldIdx):null;
  return{
    ...now,
    old,
    delta:old&&old.ready?now.confidence-old.confidence:null,
    boundary:regimeBoundaryInfo(rows[idx]),
    drivers:regimeDrivers(rows[idx]),
    days:phaseContext().days
  }
}
function regimeDriverChip(d){
  const pos=d.contribution>=0,impact=Math.abs(d.contribution);
  return`<span class="regime-driver-chip ${pos?"pos":"neg"}">${d.name} · ${pos?"低估":"偏热"} ${pos?"+":"−"}${impact.toFixed(1)}</span>`;
}
function renderRegimeEngine(){
  const rc=regimeContext(),known=rc.ready&&rc.phase&&rc.phase.key!=="unknown",
    engine=$("regimeEngine"),phaseCard=$("phaseConfidence")&&$("phaseConfidence").closest(".phase-card");
  if(!known){
    if(engine)engine.style.setProperty("--regime-color","var(--text-secondary)");
    if($("regimeHeroName"))$("regimeHeroName").textContent="数据建立中";
    if($("regimeHeroDays"))$("regimeHeroDays").textContent="等待有效历史";
    if($("regimeHeroConfidence"))$("regimeHeroConfidence").textContent="--%";
    if($("regimeHeroMeter"))$("regimeHeroMeter").style.width="0%";
    if($("regimeHeroDelta"))$("regimeHeroDelta").textContent="7日变化 --";
    if($("regimeHeroBoundary"))$("regimeHeroBoundary").textContent="最近边界 --";
    if($("regimeHeroCoverage"))$("regimeHeroCoverage").textContent="有效覆盖 --";
    if($("regimeHeroDrivers"))$("regimeHeroDrivers").innerHTML="";
    if($("phaseConfidence"))$("phaseConfidence").textContent="--%";
    if($("phaseConfidenceHint"))$("phaseConfidenceHint").textContent="等待有效历史";
    if($("phaseConfidenceDelta"))$("phaseConfidenceDelta").textContent="--";
    if($("phaseConfidenceDeltaHint"))$("phaseConfidenceDeltaHint").textContent="置信度变化";
    if($("phaseBoundary"))$("phaseBoundary").textContent="--";
    if($("phaseBoundaryHint"))$("phaseBoundaryHint").textContent="等待评分";
    if($("phaseRegimeDrivers"))$("phaseRegimeDrivers").innerHTML="";
    return
  }
  const color=rc.phase.color,delta=rc.delta,coverage=rc.model?rc.model.coverage:0,
    changed=rc.old&&rc.old.ready&&rc.old.phase.key!==rc.phase.key,
    deltaText=changed?`7日 ${rc.old.phase.name} → ${rc.phase.name}`:delta==null?"7日变化 --":`7日置信度 ${delta>=0?"+":""}${delta}pp`,
    boundaryText=rc.boundary.distance==null?rc.boundary.name:`邻近 ${rc.boundary.name} · ${rc.boundary.distance}分`,
    driversHtml=rc.drivers.map(regimeDriverChip).join("");
  if(engine)engine.style.setProperty("--regime-color",color);
  if(phaseCard)phaseCard.style.setProperty("--regime-color",color);
  $("regimeHeroName").textContent=rc.phase.name;
  $("regimeHeroName").style.color=color;
  $("regimeHeroDays").textContent=`持续 ${Math.max(1,rc.days||1)} 天`;
  $("regimeHeroConfidence").textContent=rc.confidence+"%";
  $("regimeHeroConfidence").style.color=color;
  $("regimeHeroMeter").style.width=rc.confidence+"%";
  $("regimeHeroMeter").style.background=color;
  $("regimeHeroDelta").textContent=deltaText;
  $("regimeHeroBoundary").textContent=boundaryText;
  $("regimeHeroCoverage").textContent=`有效覆盖 ${coverage.toFixed(1)}/7`;
  $("regimeHeroDrivers").innerHTML=driversHtml;

  $("phaseConfidence").textContent=rc.confidence+"%";
  $("phaseConfidence").style.color=color;
  $("phaseConfidenceHint").textContent=`覆盖 ${(rc.coverage*100).toFixed(0)}% · 一致性 ${(rc.agreement*100).toFixed(0)}%`;
  $("phaseConfidenceDelta").textContent=changed?`${rc.old.phase.name}→${rc.phase.name}`:delta==null?"--":`${delta>=0?"+":""}${delta}pp`;
  $("phaseConfidenceDelta").style.color=delta==null?"var(--text-primary)":delta>=0?"var(--market-positive)":"var(--market-caution)";
  $("phaseConfidenceDeltaHint").textContent=changed?"7日内阶段发生切换":`近7日稳定度 ${(rc.stability*100).toFixed(0)}%`;
  $("phaseBoundary").textContent=rc.boundary.distance==null?rc.boundary.name:`${rc.boundary.name} · ${rc.boundary.distance}分`;
  $("phaseBoundaryHint").textContent=rc.boundary.detail;
  $("phaseRegimeDrivers").innerHTML=driversHtml;
}

function intelligenceRows(){const rows=STATUS_HISTORY.map(x=>({...x})),cur=currentStatusSnapshot(),i=rows.findIndex(x=>x.day===cur.day);if(i>=0)Object.keys(cur).forEach(k=>{if(cur[k]!=null)rows[i][k]=cur[k]});else if(cur.price>0)rows.push(cur);return rows.filter(x=>x&&x.day).sort((a,b)=>String(a.day).localeCompare(String(b.day))).slice(-365)}
function phaseContext(){
  const rows=intelligenceRows(),latest=rows.at(-1),reliable=rows.filter(x=>evaluateRecord(x).ready);if(!latest||!evaluateRecord(latest).ready){const previous=reliable.length?phaseInfo(reliable.at(-1)):null;return{phase:phaseInfo(latest||{}),days:0,previous}}
  const current=phaseInfo(latest);let start=reliable.length-1,previous=null;while(start>0&&phaseInfo(reliable[start-1]).key===current.key)start--;if(start>0)previous=phaseInfo(reliable[start-1]);const days=Math.max(1,Math.round((Date.parse(latest.day)-Date.parse(reliable[start].day))/86400000)+1);return{phase:current,days,previous}
}
const RADAR_METRICS=[
  {key:"ahr",name:"AHR999",digits:3,goodDown:true},
  {key:"mvrv",name:"MVRV",digits:3,goodDown:true},
  {key:"sopr",name:"SOPR",digits:3},
  {key:"lth",name:"LTH-NUPL",digits:4},
  {key:"puell",name:"Puell",digits:3,goodDown:true},
  {key:"rr",name:"RR",digits:4,deltaDigits:5,goodDown:true},
  {key:"stableD7",name:"稳定币7日",money:true},
  {key:"funding",name:"资金费率",funding:true,goodDown:true}
];
const RADAR_DIRECT_HISTORY={sopr:"sopr",lth:"lthnupl",puell:"puell",rr:"rr"};
function radarSeries(key){
  const byDay=new Map(),metricKey=RADAR_DIRECT_HISTORY[key];
  // 链上慢指标先读取自身已验证日线，避免冷启动时因综合快照尚未建立而误显示为 0 日。
  if(metricKey)(METRIC_HISTORY[metricKey]||[]).forEach(x=>{const value=finiteValue(x&&x.value);if(x&&x.day&&value!=null)byDay.set(x.day,{day:x.day,value})});
  intelligenceRows().forEach(x=>{const value=finiteValue(x[key]),q=x.quality&&x.quality[key];if(value==null||recordQualityWeight(x,key,value)<=0)return;const day=qDay(q)||x.day;if(day)byDay.set(day,{day,value})});
  return[...byDay.values()].sort((a,b)=>String(a.day).localeCompare(String(b.day))).slice(-365);
}
function radarReference(series,days){if(series.length<2)return null;const lastTs=Date.parse(series.at(-1).day),target=lastTs-days*86400000,maxGap=days+Math.max(2,Math.ceil(days*.25));for(let i=series.length-2;i>=0;i--){const ts=Date.parse(series[i].day);if(ts<=target)return(lastTs-ts)/86400000<=maxGap?series[i]:null}return null}
function radarValue(m,v){if(v==null)return"--";if(m.money)return fmtUsdB(v);if(m.funding)return(v>=0?"+":"")+(v*100).toFixed(4)+"%";if(m.percent)return v.toFixed(m.digits)+"%";return v.toFixed(m.digits)}
function radarDelta(m,d){if(d==null)return"--";if(m.money){const r=+(d/1e9).toFixed(2);return r===0?"0":fmtUsdB(d)}if(m.funding){const bp=+(d*10000).toFixed(2);return bp===0?"0":signed(d*10000,2,"bp")}if(m.percent){const r=+d.toFixed(m.digits);return r===0?"0":signed(d,m.digits,"pp")}const dg=m.deltaDigits||m.digits,r=+d.toFixed(dg);return r===0?"0":signed(d,dg)}
function radarDeltaColor(m,d){if(d==null)return"var(--text-tertiary)";const v=m.money?+(d/1e9).toFixed(2):m.funding?+(d*100).toFixed(4):+d.toFixed(m.deltaDigits||m.digits);if(v===0)return"var(--text-tertiary)";return v>0?(m.goodDown?"var(--market-caution)":"var(--market-positive)"):(m.goodDown?"var(--market-positive)":"var(--market-caution)")}
function radarColor(m,v){if(v==null)return"var(--text-tertiary)";if(m.key==="ahr"){const k=1;return v<1.2*k?"var(--market-positive)":v<5*k?"var(--market-caution)":"var(--market-negative)"}if(m.key==="mvrv")return v<1.2?"var(--market-positive)":v<2.5?"var(--market-warning)":"var(--market-negative)";if(m.key==="lth")return v<.1?"var(--market-caution)":v<.5?"var(--market-positive-emphasis)":"var(--market-positive)";if(m.money)return v>=0?"var(--market-positive)":"var(--market-negative)";if(m.funding)return Math.abs(v)>.0003?"var(--market-negative)":"var(--market-positive-emphasis)";if(m.key==="sopr")return v<.97?"var(--market-positive)":v<=1.05?"var(--text-primary)":"var(--market-caution)";if(m.key==="puell")return v<.5?"var(--market-positive)":v<1?"var(--text-primary)":v<2?"var(--market-caution)":"var(--market-negative)";if(m.key==="rr")return v<.002?"var(--market-positive)":v<.004?"var(--text-primary)":v<.015?"var(--market-caution)":"var(--market-negative)";return"var(--text-primary)"}
function renderRadar(){
  const el=$("radarGrid");if(!el)return;let qualified=0;el.innerHTML=RADAR_METRICS.map(m=>{const ser=radarSeries(m.key),cur=ser.at(-1)&&ser.at(-1).value,refs=[1,7,30].map(d=>radarReference(ser,d)),deltas=refs.map(r=>r?cur-r.value:null),enough=ser.length>=RADAR_MIN_SAMPLES,pct=cur==null||!enough?null:Math.round(ser.filter(x=>x.value<=cur).length/ser.length*100),spark=ser.slice(-30).map(x=>x.value),col=radarColor(m,cur);if(enough)qualified++;return`<div class="radar-card radar-${m.key}"><div class="radar-head"><span class="radar-name">${m.name}</span><span class="radar-pct">${pct==null?`样本 ${ser.length}日`:`${pct}%分位 · ${ser.length}日`}</span></div><div class="radar-main"><b class="radar-value num" style="color:${col}">${radarValue(m,cur)}</b><svg class="radar-spark" viewBox="0 0 74 28" preserveAspectRatio="none" aria-hidden="true"><polyline points="${sparkPath(spark,74,28)}" fill="none" stroke="${col}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg></div><div class="radar-change">${["1日","7日","30日"].map((n,i)=>`<span>${n}<b style="color:${radarDeltaColor(m,deltas[i])}">${radarDelta(m,deltas[i])}</b></span>`).join("")}</div></div>`}).join("");const b=$("freshRadar");b.textContent=qualified?`分位 · ${qualified}/${RADAR_METRICS.length} 项`:"积累历史中";b.className="fresh-badge "+(qualified===RADAR_METRICS.length?"good":"warn")
}
function scoreDrivers(){
  const rows=intelligenceRows(),cur=rows.at(-1),prev=rows.slice(0,-1).at(-1);if(!cur||!prev||!evaluateRecord(cur).ready||!evaluateRecord(prev).ready)return[];const defs=[["AHR999","ahr",ahr999ToSc],["200WMA","wmaRatio",wma200ToSc],["MVRV","mvrv",mvrvToSc],["恐惧贪婪","fgi",fgiToSc],["Puell","puell",puellToSc],["Reserve Risk","rr",rrToSc],["SOPR","sopr",soprToSc]];return defs.map((d,i)=>{const key=d[1],a=finiteValue(cur[key]),b=finiteValue(prev[key]),qa=qDay(cur.quality&&cur.quality[key]),qb=qDay(prev.quality&&prev.quality[key]);if(a==null||b==null||qa&&qb&&qa===qb)return null;const q=Math.min(recordQualityWeight(cur,key,a),recordQualityWeight(prev,key,b));if(q<=0)return null;const delta=(d[2](a,cur.ts)-d[2](b,prev.ts))*DM[i].w*q;return{name:d[0],delta,current:a,previous:b}}).filter(Boolean).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta))
}
function renderDrivers(){
  const drivers=scoreDrivers().slice(0,3),el=$("intelDriver");if(!el)return;el.textContent=drivers.length?`${drivers[0].name} ${signed(drivers[0].delta,1,"分")}`:"等待对比"
}
const THRESHOLD_EVENTS=[
  {key:"ahr",t:.45,scaled:false,label:"AHR "},{key:"ahr",t:1.2,scaled:false,label:"AHR "},
  {key:"sopr",t:1,label:"SOPR "},{key:"lth",t:.1,label:"LTH-NUPL "},
  {key:"mvrv",t:1,label:"MVRV "},{key:"wmaRatio",t:1,label:"价格/200WMA "}
];
function crossPair(pv,cv,t,label,events){
  const p=finiteValue(pv),c=finiteValue(cv);if(p==null||c==null||p===c)return;
  if(p<t&&c>=t)events.push(`${label}上穿 ${t}`);
  else if(p>=t&&c<t)events.push(`${label}下穿 ${t}`)
}
function eventHistory(){
  const rows=intelligenceRows().filter(x=>Date.now()-Date.parse(x.day)<=31*86400000),events=[],sameSourceDay=(a,b,key)=>{const qa=qDay(a.quality&&a.quality[key]),qb=qDay(b.quality&&b.quality[key]);return!!(qa&&qb&&qa===qb)};for(let i=1;i<rows.length;i++){const a=rows[i-1],b=rows[i],pa=phaseInfo(a),pb=phaseInfo(b);if(pa.key!=="unknown"&&pb.key!=="unknown"&&pa.key!==pb.key)events.push({day:b.day,text:`阶段：${pa.name} → ${pb.name}`});THRESHOLD_EVENTS.forEach(x=>{if(sameSourceDay(a,b,x.key))return;const hits=[],xt=x.scaled?+(x.t*ahrShift(b.ts||Date.parse(b.day+"T00:00:00Z"))).toFixed(2):x.t;crossPair(a[x.key],b[x.key],xt,x.label,hits);hits.forEach(text=>events.push({day:b.day,text}))});const sa=Math.abs(finiteValue(a.stableD1)||0),sb=Math.abs(finiteValue(b.stableD1)||0);if(!sameSourceDay(a,b,"stableD1")&&sa<1e9&&sb>=1e9)events.push({day:b.day,text:"稳定币最新日异动超过 $1B"});const fa=Math.abs(finiteValue(a.funding)||0),fb=Math.abs(finiteValue(b.funding)||0);if(!sameSourceDay(a,b,"funding")&&fa<=.0003&&fb>.0003)events.push({day:b.day,text:"永续资金费率进入拥挤区"})}return events.sort((a,b)=>b.day.localeCompare(a.day)).slice(0,8)
}
function renderTimeline(){const events=eventHistory(),el=$("intelEvent");if(el)el.textContent=events.length?events[0].text:"30天无切换"
}
function renderIntelligenceNow(){
  if(!$("phaseName"))return;
  const ctx=phaseContext(),st=combinedHealthQuality(["USDT","USDC"]).weight>=.5?combinedStableStats():null,funding=healthWeight(HEALTH["资金费率"])>=.5?finiteValue(S.raw&&S.raw.fundingRate):null,known=ctx.phase.key!=="unknown";
  $("phaseName").textContent=ctx.phase.name;$("phaseName").style.color=ctx.phase.color;$("phaseDesc").textContent=ctx.phase.desc;$("phaseDays").textContent=known?ctx.days+"天":"--";$("phaseDays").style.color=ctx.phase.color;$("phasePrevious").textContent=ctx.previous?(known?`此前：${ctx.previous.name}`:`最近完整阶段：${ctx.previous.name}`):"尚无完整阶段历史";$("intelPhase").textContent=known?`${ctx.phase.name} · ${ctx.days}天`:ctx.phase.name;$("intelFunds").textContent=st?(st.d7>=1e9?"稳定币扩张":st.d7<=-1e9?"稳定币收缩":funding!=null&&Math.abs(funding)>.0003?"杠杆拥挤":"资金中性"):funding!=null&&Math.abs(funding)>.0003?"杠杆拥挤":"等待资金面";
  const phasePosition={capitulation:8,bottom:25,recovery:42,expansion:58,distribution:75,overheat:92},marker=$("cycleMarker"),spectrum=$("cycleSpectrum");
  if(marker){marker.hidden=!known;if(known){marker.style.left=phasePosition[ctx.phase.key]+"%";marker.style.background=ctx.phase.color;marker.style.color=ctx.phase.color}}
  if(spectrum){spectrum.dataset.phase=ctx.phase.key;spectrum.setAttribute("aria-label",known?`BTC 当前周期阶段：${ctx.phase.name}`:"BTC 周期阶段等待识别")}
  document.querySelectorAll(".cycle-label[data-phase]").forEach(el=>el.classList.toggle("active",known&&el.dataset.phase===ctx.phase.key));
  if($("heroDate")){const day=statusDay();$("heroDate").textContent=day.slice(5).replace("-"," · ");$("heroDate").setAttribute("aria-label","UTC 日期 "+day)}
  renderRadar();renderDrivers();renderTimeline();renderRegimeEngine()
}
function renderIntelligence(){if(intelligenceRaf)return;intelligenceRaf=requestAnimationFrame(()=>{intelligenceRaf=0;renderIntelligenceNow()})}
async function copyDailyBrief(){
  const ctx=phaseContext(),rc=regimeContext(),cur=currentStatusSnapshot(),model=evaluateRecord(cur),reliable=key=>recordQualityWeight(cur,key,cur[key])>=.5,drivers=scoreDrivers().slice(0,3),events=eventHistory(),st=reliable("stableD7")?combinedStableStats():null,conf=confidenceInfo(),line=(name,v)=>`${name}：${v}`,phaseText=ctx.phase.key==="unknown"?`${ctx.phase.name}${ctx.previous?`（最近完整阶段 ${ctx.previous.name}）`:""}`:`${ctx.phase.name}（持续 ${ctx.days} 天${ctx.previous?`，此前 ${ctx.previous.name}`:""}）`;
  const brk=bitviewOverviewValid(bitviewOverviewData)?bitviewOverviewData:null,brkMeta=brk?capitalPhaseMeta(brk.phases.at(-1)):null,rarity=brk?BITVIEW_RARITY_META.map(x=>({...x,rank:+brk.rarity[x.key]})).filter(x=>x.rank>0):[],pulse=lthPulseValid(lthPulseData)?lthPulseData:null,cw=custodyValid(custodyData)?custodyData:null;
  const text=[`BTC 今日情报（UTC 日）· ${statusDay()}`,line("现价",cur.price?`$${Math.round(cur.price).toLocaleString()} ${$("pc24Value").textContent||""}`:"--"),line("市场阶段",phaseText),line("Regime 置信度",rc.ready?`${rc.confidence}%${rc.delta==null?"":` · 7日 ${rc.delta>=0?"+":""}${rc.delta}pp`} · ${rc.boundary.distance==null?rc.boundary.name:`邻近 ${rc.boundary.name} ${rc.boundary.distance}分`}`:"--"),line("Regime 主要驱动",rc.ready&&rc.drivers.length?rc.drivers.map(d=>`${d.name}${d.contribution>=0?"+":"−"}${Math.abs(d.contribution).toFixed(1)}`).join("、"):"--"),line("BRK 资本阶段",brk?`${brkMeta.label}（${+brk.scores.at(-1)>0?"+":""}${+brk.scores.at(-1)}） · ${brk.day}`:"--"),line("估值评分",model.ready?`${model.score} · 数据置信度${conf.label}`:`数据不足（可靠 ${model.reliable}/7 · 有效 ${model.coverage.toFixed(1)}/7）`),line("链上成本锚",brk?`STH ${floorMoney(+brk.sth)} · True Mean ${floorMoney(+brk.trueMean)} · Active ${floorMoney(+brk.active)}`:"--"),line("Rarity Meter",rarity.length?rarity.map(x=>`${x.label} ${x.rank}/3`).join("、"):brk?"当前无罕见事件":"--"),line("AHR999",reliable("ahr")&&cur.ahr!=null?cur.ahr.toFixed(3):"--"),line("MVRV",reliable("mvrv")&&cur.mvrv!=null?cur.mvrv.toFixed(3):"--"),line("SOPR",reliable("sopr")&&cur.sopr!=null?cur.sopr.toFixed(3):"--"),line("LTH-NUPL",reliable("lth")&&cur.lth!=null?cur.lth.toFixed(4):"--"),line("LTH_PSIL",reliable("lthPsil")&&cur.lthPsil!=null?cur.lthPsil.toFixed(2)+"%":"--"),line("LTH 花费脉冲",pulse?`SOPR ${(+pulse.sopr.at(-1)).toFixed(3)} · 盈亏比 ${(+pulse.pl.at(-1)).toFixed(3)}`:"--"),line("稳定币7日",st?fmtUsdB(st.d7):"--"),line("资金费率",reliable("funding")&&cur.funding!=null?(cur.funding*100).toFixed(4)+"%":"--"),line("自托管窗口",cw?`30分钟费率 ${(+cw.fees.halfHourFee).toFixed(2)} sat/vB · 内存池 ${(+cw.mempool.vsize/1e6).toFixed(1)} MB`:"--"),line("主要变化",drivers.length?drivers.map(d=>`${d.name}${signed(d.delta,1,"分")}`).join("、"):"暂无可靠连续对比"),line("最新事件",events[0]?`${events[0].day} ${events[0].text}`:"近30天无关键阈值切换")].join("\n");
  try{if(navigator.clipboard&&navigator.clipboard.writeText)await navigator.clipboard.writeText(text);else{const t=document.createElement("textarea");t.value=text;t.style.position="fixed";t.style.opacity="0";document.body.appendChild(t);t.select();document.execCommand("copy");t.remove()}ntf("今日情报已复制")}catch(e){ntf("复制失败，请长按手动选择")}
}
function previousDailyClose(){const done=completedDailyRows();if(done.length)return done.at(-1).close;const d=normalizedDaily();return d.length?d.at(-1).close:null}
function previousAhrValue(){const rows=completedDailyRows(),closes=rows.slice(-200).map(r=>r.close).filter(v=>v>0);if(closes.length<200)return null;const last=rows.at(-1),hm=closes.length/closes.reduce((a,b)=>a+1/b,0),dg=Math.floor((last.time*1000-new Date("2009-01-03").getTime())/864e5),pl=Math.pow(10,AHR_A*Math.log10(dg)+AHR_B);return hm>0&&pl>0?last.close*last.close/(hm*pl):null}
function previousStableDaily(){const one=ser=>Array.isArray(ser)&&ser.length>=3?ser.at(-2)-ser.at(-3):null,u=one(S.stbU),c=one(S.stbC);return u==null&&c==null?null:(u||0)+(c||0)}
function previousScoreBootstrap(){
  if(S.tweak)return null;const prevPrice=previousDailyClose(),wm=+($("swm")&&$("swm").value)||0,raw=S.raw||{},inputs=[[previousAhrValue(),ahr999ToSc],[prevPrice>0&&wm>0?prevPrice/wm:null,wma200ToSc],[raw.prevMvrv,mvrvToSc],[raw.prevFgi,fgiToSc],[raw.prevPuell,puellToSc],[raw.prevRr,rrToSc],[raw.prevSopr,soprToSc]],available=inputs.filter(x=>x[0]!=null&&Number.isFinite(+x[0])).length,hasHealth=CORE_HEALTH.some(n=>healthWeight(HEALTH[n])>0);
  if(available<4)return null;return Math.round(inputs.reduce((sum,x,i)=>{const mapped=x[0]!=null&&Number.isFinite(+x[0])?x[1](+x[0]):50,q=!hasHealth?1:healthWeight(HEALTH[CORE_HEALTH[i]]);return sum+(50+(mapped-50)*q)*DM[i].w},0));
}
function historicalPreviousStatus(){
  const rows=completedDailyRows(),last=rows.at(-1),prevPrice=last&&last.close||null,wm=+($("swm")&&$("swm").value)||0,raw=S.raw||{},stableD1=previousStableDaily();
  return{day:last?new Date(last.time*1000).toISOString().slice(0,10):"昨日",price:prevPrice,score:previousScoreBootstrap(),ahr:previousAhrValue(),sopr:finiteValue(raw.prevSopr),lth:finiteValue(raw.prevLthNupl),lthPsil:finiteValue(raw.prevLthPsil),stableD1,wmaRatio:prevPrice>0&&wm>0?prevPrice/wm:null,funding:null,premium:null};
}
function comparisonPrevious(){
  const history=historicalPreviousStatus(),snap=previousStatusSnapshot(),out={...history};if(snap)Object.keys(snap).forEach(k=>{if(snap[k]!=null)out[k]=snap[k]});out.score=S.tweak?null:calibratedScoreFromRecord(out)??out.score;out._source=snap?"snapshot":"history";return out;
}
function signed(n,d=2,suffix=""){return(n>=0?"+":"")+n.toFixed(d)+suffix}
function renderDailyChanges(){
  const note=$("deltaNote"),badge=$("freshChanges");if(!note||!badge)return;
  const prev=comparisonPrevious(),cur=currentStatusSnapshot(),prevClose=previousDailyClose()||(prev&&prev.price>0?prev.price:null),reliablePair=key=>!!prev&&recordQualityWeight(cur,key,cur[key])>=.5&&recordQualityWeight(prev,key,prev[key])>=.5,hasPrev=!!prev&&["ahr","sopr","lth","lthPsil","mvrv","wmaRatio","stableD1","funding"].some(k=>cur[k]!=null&&prev[k]!=null&&reliablePair(k));
  const summary=[];if(cur.price>0&&prevClose>0)summary.push(`BTC ${signed((cur.price/prevClose-1)*100,2,"%")}`);if(cur.score!=null&&prev&&prev.score!=null)summary.push(`评分 ${signed(cur.score-prev.score,0,"分")}`);if(reliablePair("lthPsil"))summary.push(`LTH_PSIL ${signed(cur.lthPsil-prev.lthPsil,2,"pp")}`);
  const events=[];
  if(hasPrev){THRESHOLD_EVENTS.forEach(x=>{if(reliablePair(x.key))crossPair(prev[x.key],cur[x.key],x.t,x.label,events)});if(reliablePair("stableD1")&&Math.abs(cur.stableD1||0)>=1e9&&Math.abs(prev.stableD1||0)<1e9)events.push("稳定币最新日异动超过 $1B");if(reliablePair("funding")&&Math.abs(cur.funding||0)>.0003&&Math.abs(prev.funding||0)<=.0003)events.push("永续资金费率进入拥挤区")}
  const context=events.length?`阈值变化：${events.join(" · ")}`:hasPrev?"今日暂无关键阈值切换":"部分指标仍在建立本机日快照";note.textContent=[summary.join(" · "),context].filter(Boolean).join(" · ");
  badge.textContent=prev&&/^\d{4}-\d{2}-\d{2}$/.test(String(prev.day))?`对比日 · ${String(prev.day).slice(5)}`:"等待数据";badge.className="fresh-badge "+(hasPrev?"good":"warn");
}
function setHealthFilter(filter){
  HEALTH_FILTER=["all","core","base","module","issue"].includes(filter)?filter:"all";
  document.querySelectorAll("[data-health-filter]").forEach(btn=>{const on=btn.dataset.healthFilter===HEALTH_FILTER;btn.classList.toggle("active",on);btn.setAttribute("aria-pressed",on?"true":"false")});renderHealth();
}
async function runRuntimeDiagnostics(){
  HEALTH_RUNTIME.online=navigator.onLine!==false;
  try{const k="btc_health_write_probe_v1";localStorage.setItem(k,String(Date.now()));localStorage.removeItem(k);HEALTH_RUNTIME.storageOk=true}catch(e){HEALTH_RUNTIME.storageOk=false}
  try{if(navigator.storage&&navigator.storage.estimate){const e=await navigator.storage.estimate();HEALTH_RUNTIME.storageUsage=Number.isFinite(+e.usage)?+e.usage:null;HEALTH_RUNTIME.storageQuota=Number.isFinite(+e.quota)?+e.quota:null}if(navigator.storage&&navigator.storage.persisted)HEALTH_RUNTIME.persistent=await navigator.storage.persisted()}catch(e){}
  try{
    if(!("serviceWorker"in navigator))HEALTH_RUNTIME.swState="不支持";
    else if(!/^https:$/.test(location.protocol))HEALTH_RUNTIME.swState="仅在线预览";
    else{const reg=await navigator.serviceWorker.getRegistration("./");HEALTH_RUNTIME.swState=navigator.serviceWorker.controller?"已接管":reg&&reg.active?"已激活":reg&&(reg.installing||reg.waiting)?"安装中":"待注册"}
  }catch(e){HEALTH_RUNTIME.swState="检查失败"}
  renderHealth();
}
function initHealthCenter(){
  const panel=$("healthPanel");if(!panel||panel.dataset.ready)return;panel.dataset.ready="1";
  panel.querySelectorAll("[data-health-filter]").forEach(btn=>btn.addEventListener("click",()=>setHealthFilter(btn.dataset.healthFilter)));
  panel.addEventListener("toggle",()=>{if(panel.open){renderHealth();runRuntimeDiagnostics()}});
  window.addEventListener("online",()=>{HEALTH_RUNTIME.online=true;renderHealth();if(panel.open&&!fetchInFlight)fetchLive(true)},{passive:true});
  window.addEventListener("offline",()=>{HEALTH_RUNTIME.online=false;renderHealth()},{passive:true});
  if("serviceWorker"in navigator)navigator.serviceWorker.addEventListener("controllerchange",runRuntimeDiagnostics);
  runRuntimeDiagnostics();
}
function openHealthPanel(){const p=$("healthPanel");if(!p)return;if(typeof ACTIVE_TAB!=="undefined"&&ACTIVE_TAB!=="value")setTab("value",true);p.open=true;renderHealth();runRuntimeDiagnostics();requestAnimationFrame(()=>scrollSectionToAppTop(p,stillMode()?"auto":"smooth"))}
async function runHealthCheck(){
  const btn=$("healthRefreshBtn");if(fetchInFlight){ntf("数据检测正在进行");return}if(btn){btn.disabled=true;btn.textContent="检测中…"}openHealthPanel();
  try{ENDPOINT_HEALTH={};await runRuntimeDiagnostics();await fetchLive(true);await runRuntimeDiagnostics();ntf(coreHealthInfo().ready?"数据健康检测完成":"检测完成 · 核心数据仍不足")}
  catch(e){ntf("健康检测中断，请稍后重试")}
  finally{if(btn){btn.disabled=false;btn.textContent="重新检测"}renderHealth()}
}
function healthReportText(){
  const s=healthCenterSnapshot(),pc=s.pc,lines=["BTC 数据健康诊断",`版本：${BUILD_LABEL}（${BUILD_ID}）`,`生成：${new Date().toLocaleString("zh-CN")}`,`健康度：${s.score==null?"等待检查":s.score+"/100"} · ${s.verdict}`,`核心模型：可靠 ${s.core.reliable}/7 · 覆盖 ${s.core.coverage.toFixed(1)}/7 · 可用/备用 ${s.core.live}/7`,`价格共识：${!pc?"等待检测":pc.quotes.length<2?pc.quotes.length+"/3 源响应":pc.quotes.length+`/3 源 · 最大偏差 ${pc.spread.toFixed(2)}%`}`,`最近全量：${HEALTH_RUNTIME.lastSyncAt?cacheAge(HEALTH_RUNTIME.lastSyncAt):"尚未完成"}${HEALTH_RUNTIME.lastSyncDuration!=null?" · "+healthDuration(HEALTH_RUNTIME.lastSyncDuration):""}`,"","核心输入："];
  CORE_HEALTH.forEach(n=>{const h=HEALTH[n],m=healthStatusMeta(h?h.status:"fail");lines.push(`- ${n}：${m[0]}${h&&h.dataAt?" · 数据"+cacheAge(h.dataAt):""}${h&&h.sourceDetail?" · "+h.sourceDetail:""}`)});
  lines.push("","需注意：");if(s.issues.length)s.issues.forEach(n=>{const h=HEALTH[n],m=healthStatusMeta(h.status);lines.push(`- ${n}：${m[0]} · ${h.detail||h.sourceDetail||"暂无说明"}`)});else lines.push("- 未发现阻断性问题");
  lines.push("",`运行：${HEALTH_RUNTIME.online?"在线":"离线"} · 存储${HEALTH_RUNTIME.storageOk==null?"待检查":HEALTH_RUNTIME.storageOk?"可写":"异常"} · 离线缓存${HEALTH_RUNTIME.swState}`);if(typeof appUpdateReport==="function")lines.push("",appUpdateReport());return lines.join("\n")
}
async function copyHealthReport(){
  const text=healthReportText();try{if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(text);else{const ta=document.createElement("textarea");ta.value=text;ta.style.position="fixed";ta.style.opacity="0";document.body.appendChild(ta);ta.select();document.execCommand("copy");ta.remove()}ntf("数据健康诊断已复制")}catch(e){ntf("复制失败，请稍后重试")}
}
function arrangeDashboard(){const market=$("market"),marketDivider=$("marketDivider"),valuationDivider=$("valuationDivider");if(market&&marketDivider&&valuationDivider){valuationDivider.parentNode.insertBefore(marketDivider,valuationDivider);valuationDivider.parentNode.insertBefore(market,valuationDivider)}}
function moduleIsReady(id){const el=$(id);return!!(el&&(el.dataset.ready==="1"||el.dataset.lazyVisible==="1"))}
function renderInitializedPriceViews(){renderBitviewOverview();if(moduleIsReady("costbasis"))renderCostBasisPrice();if(moduleIsReady("coststate"))renderCostStructureState();if(moduleIsReady("decision"))renderDecisionChart();if(moduleIsReady("powerlaw"))renderPowerLaw();if(moduleIsReady("floor")){renderBitviewFloor();renderFloorSummary();drawFloorChart()}if(moduleIsReady("capitalized"))drawCapitalizedChart();if($("personal")&&$("personal").open)renderPersonalChart()}
function paintSpotEarly(price,change,source){
  if(!(price>0))return;S.manualPrice=false;S.price=Math.round(price);rollInput($("bp"),S.price);if(document.activeElement!==$("lp"))$("lp").value=S.price;
  if(Number.isFinite(change))renderPriceDelta24(change);
  lastTickAt=Date.now();setLiveStatus("loading",`${source||"现货"} 已连接 · 正在完成全量指标`);renderPriceSpark();renderInitializedPriceViews()
}
function reportTaskError(e){
  const msg=String((e&&e.message)||e||"");
  if(/abort|network|failed to fetch|load failed|^\d{3}$|timeout/i.test(msg))return;
  try{console.warn("数据任务异常",e)}catch(_){}
}
async function fetchLive(force=false){
  if(!force){
    const c=readCache(false);
    if(c){
      restoreCacheHealth(c);
      applyLive(c.data);
      const core=coreHealthInfo();lastFullAt=core.ready?c.successAt||c.ts||0:0;
      renderHealth();
      setLiveStatus(core.ready?"ok":"",`缓存 ${cacheAge(c.ts)} · 核心 ${core.reliable}/7 · 后台更新`);
      setTimeout(()=>fetchLive(true),450);
      return;
    }
  }

  progStart();
  sweepCollect=true;SWEEP_PENDING.clear();
  setLiveStatus("loading","拉取中");
  const fallbackBox=readCache(true);
  FALLBACK_HEALTH=fallbackBox&&fallbackBox.health||{};
  HEALTH=Object.fromEntries(MODULE_HEALTH.filter(name=>HEALTH[name]).map(name=>[name,HEALTH[name]]));
  ensureModuleHealth();

  const fallback=getFallbackData(),result={};
  // 先注入最近已验证历史点；后续实时/缓存序列会按日覆盖同日快照。
  primeChainFallbackHistory();
  renderIntelligence();
  const tasks=[];
  let _running=0,_corePaintTimer=0,_corePaintAt=0;
  const _queue=[];
  const _maxPrio=3;
  const _nextJob=()=>{
    for(let p=0;p<=_maxPrio;p++){const g=_queue[p];if(g&&g.length)return g.shift()}
    return null;
  };
  const _pump=()=>{while(_running<6){const j=_nextJob();if(!j)break;_running++;j().finally(()=>{_running--;_pump()})}};
  const fastSnapshot=()=>{
    const snap={...fallback,...result},latestPrice=result.price||snap.price||S.price;
    if(latestPrice>0&&snap.dma200>0){
      const dg=Math.floor((new Date()-new Date("2009-01-03"))/864e5),
        pl=Math.pow(10,AHR_A*Math.log10(dg)+AHR_B),pl0=Math.pow(10,AHR_A0*Math.log10(dg)+AHR_B0);
      snap.ahr999=latestPrice*latestPrice/(snap.dma200*pl);
      snap.ahr999c=latestPrice*latestPrice/(snap.dma200*pl0);
      snap.ahr1price=Math.sqrt(snap.dma200*pl0);snap.plNew=pl;
      const maHealth=HEALTH["均线"];
      markHealth("AHR999",maHealth&&maHealth.status==="ok"?"ok":"cache",maHealth&&maHealth.status==="ok"?"日线本地计算":"沿用200日成本重算",maHealth&&(maHealth.dataAt||maHealth.ts)||null);
    }
    if(latestPrice>0&&snap.wma200>0)snap.wma200ratio=latestPrice/snap.wma200;
    if(snap.mvrvDerived&&snap.realized>0&&latestPrice>0){snap.mvrv=latestPrice/snap.realized;delete snap.mvrvDerived}
    return snap;
  };
  const publishCore=()=>{
    if(_corePaintTimer)return;
    const wait=Math.max(0,120-(Date.now()-_corePaintAt));
    _corePaintTimer=setTimeout(()=>{
      _corePaintTimer=0;_corePaintAt=Date.now();
      const snap=fastSnapshot();if(!Object.keys(snap).length)return;
      applyLive(snap);renderHealth();
      const core=coreHealthInfo();
      if(core.ready)persistMetricHistoryCache();
      setLiveStatus(core.ready?"ok":"loading",core.ready
        ?`${new Date().toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"})} · 核心 ${core.reliable}/7 · 其余指标更新中`
        :`核心 ${core.reliable}/7 · 正在并行建立`);
    },wait);
  };
  const task=(prio,f)=>{let done;const p=new Promise(r=>done=r);
    const rank=Number.isInteger(prio)?Math.max(0,Math.min(_maxPrio,prio)):1;
    if(!_queue[rank])_queue[rank]=[];
    _queue[rank].push(async()=>{try{await f()}catch(e){reportTaskError(e)}finally{if(rank===0)publishCore();done()}});
    tasks.push(p)};

  // 核心行情：价格按 Binance → OKX → Coinbase 降级；日线仍由 Binance 官方节点竞速。
  task(0,async()=>{
    try{
      const t=await fetchSpotTicker(6500),p=t.price,c=t.change24h;
      if(!(p>0))throw new Error("bad ticker");
      result.price=p;
      result.change24h=c;
      result.priceSource=t.source;
      markHealth("价格","ok",t.source);
      paintSpotEarly(p,c,t.source);
    }catch(e){
      carryFields(result,fallback,"价格",["price","change24h","priceSource"]);
    }
  });

  task(0,async()=>{
    try{
      const daily=await fetchBtcDailyCandles(),dc=daily.map(k=>k[4]);
      const ma=n=>dc.length<n?null:dc.slice(-n).reduce((a,b)=>a+b,0)/n;
      const hm=n=>dc.length<n?null:n/dc.slice(-n).reduce((a,b)=>a+1/b,0);
      result.ma51=ma(51);
      result.ma120=ma(120);
      result.dma200=hm(200);
      result.ma250=ma(250);
      result.ma850=ma(850);
      result.spark30=dc.slice(-30);
      if(!result.ma51||!result.ma850)throw new Error("bad daily klines");
      DAILY=daily;
      try{localStorage.setItem(DAILY_KEY,JSON.stringify(daily))}catch(e){}
      markHealth("均线","ok","Binance日线竞速",daily.at(-1)[0]*1000);
      if(moduleIsReady("decision"))renderDecisionChart();
    }catch(e){
      // AHR999 不在此处回落：由 AHR999 独立计算链（recalcPriceModels 内）基于 dma200 与最新价自行计算，
      // 日线K线失败不代表 AHR999 计算失败，误挂会导致 AHR999 被错误标记为沿用旧值。
      carryFields(result,fallback,"均线",["ma51","ma120","ma250","ma850","dma200"]);
    }
  });

  task(0,async()=>{
    try{
      const wk=await binanceFetch("/api/v3/klines?symbol=BTCUSDT&interval=1w&limit=210",8000);
      const wc=wk.map(k=>+k[4]).filter(Number.isFinite),w=wc.slice(-200);
      if(w.length<190)throw new Error("bad weekly klines");
      result.wma200=w.reduce((a,b)=>a+b,0)/w.length;
      markHealth("200WMA","ok","Binance周线竞速",+wk.at(-1)[0]||Date.now());
    }catch(e){
      carryFields(result,fallback,"200WMA",["wma200","wma200ratio"]);
    }
  });

  task(0,async()=>{
    try{
      const fg=await tryFetch("https://api.alternative.me/fng/?limit=366",7000),rows=(fg.data||[]).slice().sort((a,b)=>(+a.timestamp||0)-(+b.timestamp||0)),latest=rows.at(-1),prev=rows.at(-2);
      if(!latest)throw new Error("empty");
      METRIC_HISTORY.fgi=rows.map(x=>({day:dayFromTs((+x.timestamp||0)*1000),value:+x.value})).filter(x=>x.day&&Number.isFinite(x.value)).slice(-366);
      result.fgi=+latest.value;
      result.fgiLabel=latest.value_classification;
      if(prev&&Number.isFinite(+prev.value))result.prevFgi=+prev.value;
      markHealth("FGI","ok","已更新",(+latest.timestamp||0)*1000||Date.now());
    }catch(e){
      carryFields(result,fallback,"FGI",["fgi","fgiLabel","prevFgi"]);
    }
  });

  task(1,async()=>{
    try{
      const j=await tryFetch("https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP",7000),t=j&&j.data&&j.data[0],rate=+(t&&t.fundingRate);
      if(!Number.isFinite(rate))throw new Error("bad funding rate");
      result.fundingRate=rate;
      result.fundingTime=+(t&&t.fundingTime)||null;
      result.fundingSource="OKX";
      markHealth("资金费率","ok","OKX BTC-USDT-SWAP",+(t&&t.ts)||Date.now());
    }catch(e){
      try{const t=await tryFetch("https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT",7000),rate=+t.lastFundingRate;if(!Number.isFinite(rate))throw new Error("bad fallback rate");result.fundingRate=rate;result.fundingTime=+t.nextFundingTime||null;result.fundingSource="Binance";markHealth("资金费率","fallback","Binance永续备用",+t.time||Date.now())}catch(e2){carryFields(result,fallback,"资金费率",["fundingRate","fundingTime","fundingSource"])}
    }

    try{
      let series=[];for(const url of ["https://www.okx.com/api/v5/public/funding-rate-history?instId=BTC-USDT-SWAP&limit=100","https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=1000"]){try{const h=await tryFetch(url,7000),rows=Array.isArray(h)?h:h&&h.data||[];series=dailyAverageSeries(rows);if(series.length)break}catch(e){}}
      if(series.length)METRIC_HISTORY.funding=series;
    }catch(e){}

    try{
      const t=await tryFetch("https://api.exchange.coinbase.com/products/BTC-USD/ticker",7000),price=+t.price;
      if(!(price>0))throw new Error("bad Coinbase price");
      result.coinbasePrice=price;
      markHealth("Coinbase溢价","ok","Coinbase Exchange",parseDataTs(t.time)||Date.now());
    }catch(e){
      carryFields(result,fallback,"Coinbase溢价",["coinbasePrice","coinbasePremium","coinbaseSpread"]);
    }
  });

  task(1,async()=>{
    try{
      const bh=await tryFetch("https://mempool.space/api/blocks/tip/height",9000),
        height=+bh,nh=height<840000?840000:height<1050000?1050000:1260000;
      if(!(height>0))throw new Error("bad height");
      result.halvingBlocks=nh-height;
      result.halvingDays=Math.ceil(result.halvingBlocks*10/60/24);
      markHealth("减半","ok","mempool.space");
    }catch(e){
      carryFields(result,fallback,"减半",["halvingDays","halvingBlocks"]);
    }

    try{
      const [hr,rw]=await Promise.all([
        tryFetch("https://mempool.space/api/v1/mining/hashrate/3d",10000),
        tryFetch("https://mempool.space/api/v1/mining/reward-stats/144",10000)
      ]);
      const hashTH=(hr.currentHashrate||0)/1e12,dailyBTC=+rw.totalReward/1e8;
      if(!(hashTH>0&&dailyBTC>0))throw new Error("bad mining");
      const btcPerTH=dailyBTC/hashTH;
      result.shutLo=Math.round(MINER_EFF_LO*.024*ELEC_KWH/btcPerTH);
      result.shutHi=Math.round(MINER_EFF_HI*.024*ELEC_KWH/btcPerTH);
      result.netEH=Math.round(hashTH/1e6);
      markHealth("关机价","ok","算力推算");
    }catch(e){
      carryFields(result,fallback,"关机价",["shutLo","shutHi","netEH"]);
    }
  });

  task(0,async()=>{
    let primaryMvrv=false,
      primaryRp=false,
      primaryTs=null;

    // 均衡价必须来自实时指标，或由 Realized Price − Transfer Price 动态推导。
    // 不再使用固定差值；固定常数会随着链上历史累积而持续失真。
    const balancedPaths=[
      "https://api.bitcoin-data.com/v1/balanced-price",
      "https://api.bgeometrics.com/v1/balanced-price",
      "https://bitcoin-data.com/api/v1/balanced-price",
      "https://bitcoin-data.com/v1/balanced-price"
    ],transferPaths=[
      "https://api.bitcoin-data.com/v1/transfer-price",
      "https://api.bgeometrics.com/v1/transfer-price",
      "https://bitcoin-data.com/api/v1/transfer-price",
      "https://bitcoin-data.com/v1/transfer-price"
    ];
    let balancedDirect=null,transferDirect=null;
    const valuationAux=Promise.all([
      bgMetric("balanced","均衡价",balancedPaths,1000,300000),
      fetchBgValue(transferPaths,100,100000)
    ]).then(v=>{balancedDirect=v[0];transferDirect=v[1]}).catch(()=>{});

    // 零级：Bitview。MVRV = 价格 ÷ 已实现价格（realized_price），与「周期底部 / 顶部探索」同源。
    try{
      const bv=await bitviewMvrv();
      if(bv){
        result.mvrv=bv.v;if(bv.prev>0)result.prevMvrv=bv.prev;result.realized=bv.realized;
        primaryMvrv=true;primaryRp=true;primaryTs=bv.sourceTs;
        METRIC_HISTORY.mvrv=mergeMetricSeries(METRIC_HISTORY.mvrv,bv.series);
        bitviewHealth("MVRV",bv.sourceTs,!!bv.fromCache);setDimSource(2,"Bitview");
        saveValuationCache({mvrv:result.mvrv,realized:result.realized,sourceTs:bv.sourceTs,source:"Bitview",mode:"primary"});
      }
    }catch(e){}

    // 一级：Coin Metrics（Bitview 不可用时）。Balanced / Transfer 在旁路并发，不再挡在 MVRV 前面。
    if(!primaryMvrv)try{
      let mv;
      try{
        mv=await tryFetch(
          "https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&metrics=CapMVRVCur,CapRealUSD,SplyCur&frequency=1d&limit_per_asset=366",
          12000
        )
      }catch(e){
        mv=await tryFetch(
          "https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&metrics=CapMVRVCur,CapMrktCurUSD,SplyCur&frequency=1d&limit_per_asset=366",
          12000
        )
      }
      let all=(mv.data||[]).slice();
      for(let page=1;page<4&&mv.next_page_url&&all.length<366;page++){mv=await tryFetch(mv.next_page_url,12000);all.push(...(mv.data||[]))}
      const rows=all.sort((a,b)=>(parseDataTs(a.time||a.timestamp||a.date)||0)-(parseDataTs(b.time||b.timestamp||b.date)||0)).slice(-366),row=rows.at(-1),prevRow=rows.at(-2);
      if(!row)throw new Error("Coin Metrics empty");
      METRIC_HISTORY.mvrv=rows.map(x=>({day:dayFromTs(parseDataTs(x.time||x.timestamp||x.date)),value:+x.CapMVRVCur})).filter(x=>x.day&&x.value>0).slice(-366);

      primaryTs=parseDataTs(
        row.time||row.timestamp||row.date
      );

      if(row.CapMVRVCur!=null&&+row.CapMVRVCur>0){
        result.mvrv=+row.CapMVRVCur;
        if(prevRow&&prevRow.CapMVRVCur!=null&&+prevRow.CapMVRVCur>0)result.prevMvrv=+prevRow.CapMVRVCur;
        primaryMvrv=true;setDimSource(2,"Coin Metrics");
        const state=valuationStatus(primaryTs,"主源");
        markHealth("MVRV",state.status,state.detail,primaryTs||null);
      }

      if(
        (row.CapRealUSD!=null||row.CapMrktCurUSD!=null&&row.CapMVRVCur!=null&&+row.CapMVRVCur>0)&&
        row.SplyCur!=null&&
        +row.SplyCur>0
      ){
        const realizedCap=row.CapRealUSD!=null?+row.CapRealUSD:+row.CapMrktCurUSD/+row.CapMVRVCur;
        result.realized=realizedCap/+row.SplyCur;
        primaryRp=true;
      }

      if(primaryMvrv||primaryRp){
        saveValuationCache({
          ...(primaryMvrv?{mvrv:result.mvrv}:{}),
          ...(primaryRp?{realized:result.realized}:{}),
          ...(result.balanced!=null?{balanced:result.balanced}:{}),
          ...(result.transfer!=null?{transfer:result.transfer}:{}),
          sourceTs:primaryTs||null,
          source:"Coin Metrics",
          mode:"primary"
        });
      }
    }catch(e){try{console.warn("Coin Metrics 主源失败",e&&e.message||String(e))}catch(_){}}

    await valuationAux;
    if(balancedDirect!=null)result.balanced=balancedDirect;
    if(transferDirect){result.transfer=transferDirect.v;result.transferSourceTs=transferDirect.dataTs||null}

    // 二级：MVRV / Realized Price 缺失时走多端点备用源。
    if(result.mvrv==null||result.realized==null){
      const rp=await fetchRealizedPriceFallback();

      if(rp&&rp.v>0){
        if(result.realized==null){
          result.realized=rp.v;
        }

        if(result.mvrv==null){
          const latestPrice=result.price||fallback.price||S.price;
          if(latestPrice>0){
            result.mvrv=latestPrice/rp.v;
            result.mvrvDerived=true;
            const state=valuationStatus(
              rp.sourceTs,
              rp.cached?"缓存":"备用源"
            );
            markHealth(
              "MVRV",
              state.status,
              `${rp.source} · 现价÷RP · ${state.detail}`,
              rp.sourceTs||null
            );
          }
        }

        saveValuationCache({
          ...(result.mvrv!=null?{mvrv:result.mvrv}:{}),
          realized:rp.v,
          ...(result.balanced!=null?{balanced:result.balanced}:{}),
          ...(result.transfer!=null?{transfer:result.transfer}:{}),
          sourceTs:rp.sourceTs||null,
          source:rp.source,
          sourceUrl:rp.url||null,
          mode:rp.cached?"cache":"legacy-fallback"
        });
      }
    }

    // 三级：永久估值缓存。
    const vc=readValuationCache();

    if(result.mvrv==null&&vc.mvrv!=null){
      result.mvrv=+vc.mvrv;
      const state=valuationStatus(vc.sourceTs,"缓存");
      markHealth(
        "MVRV",
        state.status,
        `${vc.source||"估值缓存"} · ${state.detail}`,
        vc.sourceTs||null
      );
    }

    if(result.realized==null&&vc.realized!=null){
      result.realized=+vc.realized;
    }

    if(result.transfer==null&&vc.transfer!=null){
      result.transfer=+vc.transfer;
      result.transferSourceTs=vc.sourceTs||null;
    }

    if(result.balanced==null){
      if(result.realized!=null&&result.transfer!=null)result.balanced=Math.round(result.realized-result.transfer);
      else if(vc.balanced!=null)result.balanced=+vc.balanced;

      if(result.balanced!=null&&!HEALTH["均衡价"]){
        const derived=result.realized!=null&&result.transfer!=null,
          sourceTs=derived?Math.min(primaryTs||Infinity,result.transferSourceTs||Infinity):vc.sourceTs,
          cleanTs=Number.isFinite(sourceTs)?sourceTs:vc.sourceTs||null,
          state=valuationStatus(cleanTs,derived?"备用源":"缓存");
        markHealth(
          "均衡价",
          state.status,
          `${derived?"RP − Transfer Price":vc.source||"估值缓存"} · ${state.detail}`,
          cleanTs
        );
      }
    }

    if(result.realized==null&&result.balanced!=null&&result.transfer!=null)result.realized=result.balanced+result.transfer;

    if(result.mvrv!=null||result.realized!=null||result.balanced!=null){
      saveValuationCache({
        ...(result.mvrv!=null?{mvrv:result.mvrv}:{}),
        ...(result.realized!=null?{realized:result.realized}:{}),
        ...(result.balanced!=null?{balanced:result.balanced}:{}),
        ...(result.transfer!=null?{transfer:result.transfer}:{}),
        sourceTs:(HEALTH["均衡价"]&&HEALTH["均衡价"].dataAt)||primaryTs||vc.sourceTs||null,
        source:balancedDirect!=null?"Balanced Price API":result.transfer!=null?"RP − Transfer Price":vc.source||"估值缓存",
        mode:balancedDirect!=null?"direct":result.transfer!=null?"derived":"cache"
      });
    }

    if(result.mvrv==null){
      carryFields(result,fallback,"MVRV",["mvrv","prevMvrv"]);
    }
    if(result.balanced==null){
      carryFields(
        result,
        fallback,
        "均衡价",
        ["balanced","realized"]
      );
    }
  });

  task(2,async()=>{
    const daysLeft=Math.ceil((POLYMARKET_EVENT_END-Date.now())/86400000);
    if(daysLeft<=0){
      carryFields(result,fallback,"概率",["prob50","prob90"]);
      const old=HEALTH["概率"];
      markHealth("概率","stale",`${POLYMARKET_YEAR}年市场已到期 · 请更新事件 slug`,old&&old.ts||null);
      return;
    }
    try{
      const ev=await fetchAny([
        `https://gamma-api.polymarket.com/events/slug/${POLYMARKET_EVENT_SLUG}`,
        `https://gamma-api.polymarket.com/events?slug=${POLYMARKET_EVENT_SLUG}`
      ],8000);
      const e0=Array.isArray(ev)?ev[0]:ev,
        markets=(e0&&e0.markets||[]).filter(m=>
          m.closed!==true&&
          String(m.closed).toLowerCase()!=="true"&&
          m.archived!==true&&
          m.active!==false
        );

      const numbers=s=>{
        const out=[],re=/(\d[\d,]*(?:\.\d+)?)\s*([kK])?\b/g,tx=String(s||"");let m;
        while((m=re.exec(tx)))out.push(Number(m[1].replace(/,/g,""))*(m[2]?1000:1));
        return out.filter(Number.isFinite)
      };

      const findMkt=(amount,direction)=>markets.find(m=>{
        const title=String(m.groupItemTitle||"").trim(),
          q=String(m.question||"").toLowerCase(),
          nums=numbers(title);
        if(nums.length!==1||nums[0]!==amount)return false;
        return direction==="down"
          ?(/^[↓↘]/.test(title)||/\bdip\b|\bbelow\b|\bless than\b/.test(q))
          :(/^[↑↗]/.test(title)||/\breach\b|\bhit\b|\babove\b|\bgreater than\b/.test(q));
      });

      const yesProb=m=>{
        if(!m)return null;
        const prices=typeof m.outcomePrices==="string"
          ?JSON.parse(m.outcomePrices)
          :(m.outcomePrices||[]);
        const outcomes=typeof m.outcomes==="string"
          ?JSON.parse(m.outcomes)
          :(m.outcomes||[]);
        const yesIndex=Math.max(0,outcomes.findIndex(x=>String(x).toLowerCase()==="yes"));
        const v=Number(prices[yesIndex]);
        return Number.isFinite(v)?Math.round(v*1000)/10:null;
      };

      const p50=yesProb(findMkt(POLYMARKET_DOWN_PRICE,"down")),
        p90=yesProb(findMkt(POLYMARKET_UP_PRICE,"up"));

      if(p50!=null)result.prob50=p50;
      if(p90!=null)result.prob90=p90;
      if(p50!=null||p90!=null)result.probMarketKey=POLYMARKET_MARKET_KEY;
      if(p50==null&&p90==null)throw new Error("active markets not found");

      if(p50!=null&&p90!=null){
        markHealth("概率",daysLeft<=31?"stale":"ok",daysLeft<=31?`年内市场 ${daysLeft}天后到期 · 请更新 slug`:`${POLYMARKET_YEAR}年内活跃市场 · ${POLYMARKET_DOWN_PRICE/1000}K/${POLYMARKET_UP_PRICE/1000}K`);
      }else{
        if(p50==null&&fallback.prob50!=null)result.prob50=fallback.prob50;
        if(p90==null&&fallback.prob90!=null)result.prob90=fallback.prob90;
        markHealth("概率",daysLeft<=31?"stale":"cache",daysLeft<=31?`年内市场 ${daysLeft}天后到期 · 部分市场更新`:"部分市场更新");
      }
    }catch(e){
      carryFields(result,fallback,"概率",["prob50","prob90"]);
      if(daysLeft<=31){const old=HEALTH["概率"];markHealth("概率","stale",`年内市场 ${daysLeft}天后到期 · 请更新 slug`,old&&old.ts||null)}
    }
  });

  task(2,async()=>{
    const st=await stableSeriesCached();
    if(st&&st.u&&st.c){
      result.usdtSeries=st.u;
      result.usdcSeries=st.c;
      result.usdtDated=st.uSeries||[];
      result.usdcDated=st.cSeries||[];
      result.stableDataTs=st.dataTs||{u:null,c:null};
      const markStable=(name,key)=>{
        const dataTs=st.dataTs&&st.dataTs[key],tooOld=dataTs&&Date.now()-dataTs>STABLE_DATA_STALE_MS,
          status=st.stale||!dataTs||tooOld?"stale":st.cached?"cache":"ok",
          source=st.stale?"过期日线缓存":st.cached?"日线缓存":"日线更新",
          detail=`${source} · ${dataTs?"数据日 "+formatDataDay(dataTs):"数据日期未知"}`;
        markHealth(name,status,detail,dataTs||null);
      };
      markStable("USDT","u");
      markStable("USDC","c");
    }else{
      carryFields(result,fallback,"USDT",["usdtSeries"]);
      carryFields(result,fallback,"USDC",["usdcSeries"]);
    }
  });

  task(0,async()=>{
    const viaBitview=(key,label,names,lo,hi,idx,fallback)=>bitviewMetric(key,label,names,lo,hi).then(v=>{
      if(v!=null){setDimSource(idx,"Bitview");return v}
      setDimSource(idx,"BGeometrics");return fallback();
    });
    const [sopr,puell,rr]=await Promise.all([
      viaBitview("sopr","SOPR",["sopr_24h"],.5,2,6,()=>bgMetric("sopr","SOPR",[
        "https://api.bitcoin-data.com/v1/sopr",
        "https://api.bgeometrics.com/v1/sopr",
        "https://bitcoin-data.com/api/v1/sopr",
        "https://bitcoin-data.com/v1/sopr"
      ],.5,2)),
      viaBitview("puell","Puell",["puell_multiple"],.05,20,4,()=>bgMetric("puell","Puell",[
        "https://api.bitcoin-data.com/v1/puell-multiple",
        "https://api.bgeometrics.com/v1/puell-multiple",
        "https://bitcoin-data.com/api/v1/puell-multiple",
        "https://bitcoin-data.com/v1/puell-multiple",
        "https://bitcoin-data.com/v1/puell_multiple"
      ],.05,20)),
      bitviewReserveRisk().then(v=>{if(v!=null){setDimSource(5,"Bitview");return v}setDimSource(5,"BGeometrics");return null}).then(v=>v!=null?v:bgMetric("rr","RR",[
        "https://api.bitcoin-data.com/v1/reserve-risk",
        "https://api.bgeometrics.com/v1/reserve-risk",
        "https://bitcoin-data.com/api/v1/reserve-risk",
        "https://bitcoin-data.com/v1/reserve-risk",
        "https://bitcoin-data.com/v1/reserve_risk"
      ],.00005,.2))
    ]);
    if(sopr!=null){result.sopr=sopr;if(METRIC_PREV.sopr)result.prevSopr=METRIC_PREV.sopr.v}
    else carryBgFields(result,fallback,"SOPR",["sopr","prevSopr"]);
    if(puell!=null){result.puell=puell;if(METRIC_PREV.puell)result.prevPuell=METRIC_PREV.puell.v}
    else carryBgFields(result,fallback,"Puell",["puell","prevPuell"]);
    if(rr!=null){result.rr=rr;if(METRIC_PREV.rr)result.prevRr=METRIC_PREV.rr.v}
    else carryBgFields(result,fallback,"RR",["rr","prevRr"]);
  });

  // 免费接口调用额度较低，bgMetric 会缓存 24 小时；独立任务避免拖慢其他链上指标。
  task(2,async()=>{
    const lthNupl=await bitviewMetric("lthnupl","LTH-NUPL",["lth_nupl"],-1,1).then(v=>v!=null?v:bgMetric("lthnupl","LTH-NUPL",[
      "https://api.bitcoin-data.com/v1/nupl-lth",
      "https://api.bgeometrics.com/v1/nupl-lth",
      "https://bitcoin-data.com/api/v1/nupl-lth",
      "https://bitcoin-data.com/v1/nupl-lth",
      "https://bitcoin-data.com/v1/nupl-lth/last"
    ],-.8,1.1));
    if(lthNupl!=null){result.lthNupl=lthNupl;if(METRIC_PREV.lthnupl)result.prevLthNupl=METRIC_PREV.lthnupl.v}
    else carryBgFields(result,fallback,"LTH-NUPL",["lthNupl","prevLthNupl"]);
  });

  // LTH_PSIL 使用公开的 Bitview/BRK 日线序列；只补充链上压力观察，不参与七维估值。
  task(1,async()=>{
    try{
      const d=lthPsilNormalize(await tryFetch(bitviewBulkUrl(BITVIEW_PSIL_SERIES,"-366"),12000));
      if(!d)throw new Error("bad LTH_PSIL series");
      result.lthPsil=d.value;
      if(d.previous!=null)result.prevLthPsil=d.previous;
      METRIC_HISTORY.lthPsil=d.series;
      markHealth("LTH_PSIL","ok","Bitview/BRK · LTH 自身供应口径",bitviewDayTs(d.day),"Bitview/BRK · lth_supply_in_loss_share");
    }catch(e){
      carryFields(result,fallback,"LTH_PSIL",["lthPsil","prevLthPsil"]);
    }
  });

  _pump();
  await Promise.all(tasks);
  if(_corePaintTimer){clearTimeout(_corePaintTimer);_corePaintTimer=0}

  // 统一使用本轮最终价格重算所有价格派生指标，避免并行任务先后造成旧价格。
  const latestPrice=result.price||fallback.price||S.price;
  if(result.prevMvrv==null&&result.realized>0){const prevPrice=previousDailyClose();if(prevPrice>0)result.prevMvrv=prevPrice/result.realized}
  if(result.coinbasePrice>0&&latestPrice>0&&HEALTH["Coinbase溢价"]&&HEALTH["Coinbase溢价"].status==="ok"){result.coinbasePremium=(result.coinbasePrice/latestPrice-1)*100;result.coinbaseSpread=result.coinbasePrice-latestPrice}
  if(latestPrice>0&&result.dma200>0){
    const dg=Math.floor((new Date()-new Date("2009-01-03"))/864e5),
      pl=Math.pow(10,AHR_A*Math.log10(dg)+AHR_B),
      pl0=Math.pow(10,AHR_A0*Math.log10(dg)+AHR_B0);
    result.ahr999=latestPrice*latestPrice/(result.dma200*pl);
    result.ahr999c=latestPrice*latestPrice/(result.dma200*pl0);
    result.ahr1price=Math.sqrt(result.dma200*pl0);
    result.plNew=pl;
    const maHealth=HEALTH["均线"];
    markHealth(
      "AHR999",
      maHealth&&maHealth.status==="ok"?"ok":"cache",
      maHealth&&maHealth.status==="ok"?"日线本地计算":"沿用200日成本重算",
      maHealth&&(maHealth.dataAt||maHealth.ts)||null
    );
  }else if(!HEALTH["AHR999"]){
    carryFields(result,fallback,"AHR999",["ahr999","ahr999c","ahr1price","plNew","dma200"]);
  }

  if(latestPrice>0&&result.wma200>0){
    result.wma200ratio=latestPrice/result.wma200;
  }

  // 备用源的 MVRV 使用本轮最新 BTC 价格重新计算，避免并行请求先后造成旧价格。
  if(result.mvrvDerived&&result.realized>0){
    if(latestPrice>0)result.mvrv=latestPrice/result.realized;
    delete result.mvrvDerived;
    saveValuationCache({
      mvrv:result.mvrv,
      realized:result.realized,
      balanced:result.balanced,
      ...(result.transfer!=null?{transfer:result.transfer}:{})
    });
  }

  // 永远合并上次完整快照，避免一次局部失败把原有数据清空。
  const merged={...fallback,...result};
  const got=Object.keys(merged).length>0;
  if(got){
    refreshHealthAges();const core=coreHealthInfo();
    if(core.live>=MODEL_MIN_RELIABLE)lastFullAt=Date.now();
    delete merged.daily;
    saveCache(merged,lastFullAt);
    if(HEALTH["价格"]&&HEALTH["价格"].status==="ok")lastTickAt=Date.now();
    applyLive(merged);persistMetricHistoryCache();flushSweeps();
    const fail=SOURCE_ORDER.filter(n=>HEALTH[n]&&HEALTH[n].status==="fail").length;
    setLiveStatus("ok",
      new Date().toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"})+
      ` · 核心 ${core.reliable}/7`+(fail?` · ${fail}项暂无数据`:core.ready?" · 数据可用":" · 暂不判断")
    );
  }else{
    setLiveStatus("","暂无可用数据");
  }
  renderHealth();
  progDone();
}
function applyLive(d){
  if(!BOOT_PAINTED){BOOT_PAINTED=true;document.body.classList.remove("booting")}
  if(!d)return;
  S.raw=S.raw||{};
  ["fgi","fgiLabel","prevFgi","mvrv","prevMvrv","puell","prevPuell","rr","prevRr","lthNupl","prevLthNupl","lthPsil","prevLthPsil","prevSopr","fundingRate","fundingTime","fundingSource","coinbasePrice","coinbasePremium","coinbaseSpread"].forEach(k=>{if(d[k]!=null)S.raw[k]=d[k]});
  if(d.mvrv!=null||d.realized!=null||d.balanced!=null||d.transfer!=null)saveValuationCache({...(d.mvrv!=null?{mvrv:d.mvrv}:{}),...(d.realized!=null?{realized:d.realized}:{}),...(d.balanced!=null?{balanced:d.balanced}:{}),...(d.transfer!=null?{transfer:d.transfer}:{})});
  if(d.price>0){
    S.manualPrice=false;S.price=Math.round(d.price);
    rollInput($("bp"),S.price);
    if(document.activeElement!==$("lp"))$("lp").value=S.price;
  }
  if(d.change24h!=null)renderPriceDelta24(d.change24h);
  if(d.ahr999){const sc=ahr999ToSc(d.ahr999);$("d0").value=sc;$("r0").textContent=d.ahr999.toFixed(3);S.dims[0]=sc}
  if(d.ahr999&&d.plNew&&d.dma200)S.ahr={v:d.ahr999,c:d.ahr999c,pl:d.plNew,dma:d.dma200,p1:d.ahr1price};
  if(d.ma51)S.mas={m51:d.ma51,m120:d.ma120,m250:d.ma250,m850:d.ma850};
  if(d.spark30&&d.spark30.length)S.spark30=d.spark30.slice(-30);
  if(d.wma200&&d.wma200ratio){const sc=wma200ToSc(d.wma200ratio);$("d1").value=sc;$("r1").textContent=d.wma200ratio.toFixed(2)+"x";S.dims[1]=sc;setInputIfIdle("swm",Math.round(d.wma200))}
  if(d.mvrv){const sc=mvrvToSc(d.mvrv);$("d2").value=sc;$("r2").textContent=d.mvrv.toFixed(2)+"x";S.dims[2]=sc}
  if(d.fgi!=null){const sc=fgiToSc(d.fgi);$("d3").value=sc;$("r3").textContent=d.fgi;S.dims[3]=sc}
  if(d.halvingDays)setInputIfIdle("shv",d.halvingDays);
  if(d.halvingBlocks>0)S.sigs.hb=Math.round(d.halvingBlocks);
  if(d.shutLo&&d.shutHi){setInputIfIdle("slo",d.shutLo);setInputIfIdle("shi",d.shutHi)}
  if(d.prob50!=null)setInputIfIdle("spb",d.prob50);
  if(d.prob90!=null)setInputIfIdle("spu",d.prob90);
  if(d.lthNupl!=null)setInputIfIdle("slth",(+d.lthNupl).toFixed(4));
  renderLthPsil(d.lthPsil,d.prevLthPsil);
  if(d.usdtSeries)S.stbU=d.usdtSeries;
  if(d.usdcSeries)S.stbC=d.usdcSeries;
  if(d.usdtDated)S.stbUDated=d.usdtDated;
  if(d.usdcDated)S.stbCDated=d.usdcDated;
  if(d.stableDataTs)S.stbTs=d.stableDataTs;
  if(d.balanced)setInputIfIdle("sbl",d.balanced);
  if(d.sopr){const sc=soprToSc(d.sopr);$("d6").value=sc;$("r6").textContent=d.sopr.toFixed(3);S.dims[6]=sc;setInputIfIdle("ssp",d.sopr.toFixed(3))}
  if(d.puell){const sc=puellToSc(d.puell);$("d4").value=sc;$("r4").textContent=d.puell.toFixed(2);S.dims[4]=sc;renderPuellMarket(d.puell)}
  else renderPuellMarket(S.raw&&S.raw.puell);
  if(d.rr){const sc=rrToSc(d.rr);$("d5").value=sc;$("r5").textContent=RR_BV&&d.rr===RR_BV.v?`分位 ${Math.round(RR_BV.pct*100)}%`:d.rr.toFixed(4);S.dims[5]=sc}
  renderPriceDerived();
  renderStableCombined();
  renderFunds();
  rebuildIndicatorHistory();
  renderDailyChanges();
  if(moduleIsReady("decision"))renderDecisionChart();
}
function heroValuationState(score,ready){
  if(!ready||!Number.isFinite(+score))return"fair";
  return score>=85?"deep_value":score>=70?"undervalued":score>=50?"fair":score>=30?"elevated":"overheated"
}
function s2m(s){for(let i=0;i<MB.length-1;i++){const a=MB[i],b=MB[i+1];if(s>=a[0]&&s<=b[0]){const t=(s-a[0])/(b[0]-a[0]);return Math.round((a[1]+t*(b[1]-a[1]))*100)/100}}return s<=0?.1:3}
function s2z(s){if(s<30)return{t:"高估风险",c:"var(--market-negative)"};if(s<50)return{t:"估值偏热",c:"var(--market-caution)"};if(s<70)return{t:"估值合理",c:"var(--market-warning)"};if(s<85)return{t:"长期低估",c:"var(--market-positive-emphasis)"};return{t:"深度低估",c:"var(--market-positive)"}}
function dh2(i,v){const m=DM[i],t=m.t;return v<t[0]?m.h[3]:v<t[1]?m.h[2]:v<t[2]?m.h[1]:m.h[0]}
function healthCoverage(){return CORE_HEALTH.reduce((a,n)=>a+healthWeight(HEALTH[n]),0)}
function coreHealthInfo(){const reliable=CORE_HEALTH.filter(n=>healthWeight(HEALTH[n])>=.5).length,live=CORE_HEALTH.filter(n=>{const h=HEALTH[n],s=h&&effectiveHealthStatus(n,h.status,h.dataAt||h.ts);return s==="ok"||s==="fallback"}).length,coverage=healthCoverage();return{reliable,live,coverage,ready:reliable>=MODEL_MIN_RELIABLE&&coverage>=MODEL_MIN_COVERAGE}}
function confidenceInfo(){const value=healthCoverage(),key=value>=5.5?"high":value>=3.5?"mid":"low";return{value,key,label:key==="high"?"高":key==="mid"?"中":"低",color:key==="high"?"var(--market-positive)":key==="mid"?"var(--market-caution)":"var(--market-negative)"}}
function basePace(sc,budget=S.bud,month=S.month){
  const parts=sc>=85?1:sc>=60?2:4,days=parts===1?[1]:parts===2?[1,15]:[1,8,15,22],step=1000/parts,spent=Math.max(0,Math.min(1000,+budget.base||0)),baseLeft=1000-spent,now=new Date(),today=month===mstr()?now.getDate():1,dueCount=days.filter(d=>d<=today).length,dueTarget=Math.min(1000,dueCount*step),remainder=spent%step,finishCurrent=remainder>0?step-remainder:step,dueAmount=dueTarget>spent?Math.round(Math.min(baseLeft,dueTarget-spent,finishCurrent)):0,nextDay=days.find((d,i)=>d>today&&(i+1)*step>spent)||null,index=Math.min(parts,Math.floor(spent/step)+1),label=parts===1?"月初一次":parts===2?"上、下半月各一次":"每周一次";
  return{parts,days,step,spent,baseLeft,dueAmount,nextDay,index,label};
}
function calc(persist=true,render=true){
  refreshHealthAges();
  S.dims=DM.map((_,i)=>{const v=+$(`d${i}`).value;$(`v${i}`).textContent=v;$(`h${i}`).textContent=dh2(i,v);return v});
  const hasHealth=CORE_HEALTH.some(n=>healthWeight(HEALTH[n])>0);
  const raw=S.dims.reduce((a,v,i)=>a+v*DM[i].w,0),adjusted=S.dims.reduce((a,v,i)=>{const q=(S.tweak||!hasHealth)?1:healthWeight(HEALTH[CORE_HEALTH[i]]),neutralized=50+(v-50)*q;return a+neutralized*DM[i].w},0),real=decisionSnapshot().model,sc=S.tweak?Math.round(adjusted):real.referenceScore,ml=s2m(sc),z=s2z(sc),cover=healthCoverage(),pace=basePace(sc);
  S.score=S.tweak?sc:real.score;S.scoreRaw=S.tweak?Math.round(raw):real.rawScore;S.mult=ml;
  const core=S.tweak?coreHealthInfo():real,showScore=real.ready||S.tweak;
  if(!showScore){$("scoreNum").textContent="--";$("scoreNum").dataset.rv="";fadeSwap($("sz"),"等待数据","var(--text-tertiary)");$("scoreMult").textContent="--";$("bm").textContent=" · 等待评分";$("cur").style.left="50%";$("scoreCoverage").textContent="正在建立 7 维数据覆盖"}
  else{if(S.tweak){$("scoreNum").dataset.rv=sc;$("scoreNum").textContent=sc}else rollNum($("scoreNum"),sc,x=>String(Math.round(x)));fadeSwap($("sz"),core.ready||S.tweak?z.t:"参考分",core.ready||S.tweak?z.c:"var(--text-secondary)");$("scoreMult").textContent=S.scoreRaw;$("bm").textContent=` · ${ml.toFixed(2)}x · ${pace.parts}次/月`;$("cur").style.left=sc+"%";$("scoreCoverage").textContent=S.tweak
      ?"微调模式 · 未校准"
      :!core.ready
        ?`数据不足 · 可靠 ${core.reliable}/7 · 有效 ${core.coverage.toFixed(1)}/7`
      :(hasHealth&&Math.abs(S.scoreRaw-sc)>=1
        ?`有效 ${cover.toFixed(1)}/7 · 原始${S.scoreRaw}→校准${sc}`
        :`有效 ${cover.toFixed(1)}/7 · 健康校准`)}
  if(persist){clearTimeout(calcSaveTimer);calcSaveTimer=setTimeout(saveState,300)}if(render)renderAction();return sc;
}
function triggerDone(p){return executionSlotRemaining(p)<=.005}
function pendingTriggers(){if(!(S.price>0&&S.rh>0))return[];const v=executionView();if(!v.ready||v.unknown.length)return[];return TR.filter(t=>S.price<=S.rh*(1-t.p)&&!triggerDone(t.p)).map(t=>({...t,a:Math.min(executionSlotRemaining(t.p),Math.max(0,EXEC_LIMITS[t.k]-v.bud[t.k]))}))}
function autoAnchorValue(){const a=[];if(S.mas&&S.mas.m250)a.push(S.mas.m250);if(S.ahr&&S.ahr.p1)a.push(S.ahr.p1);return a.length?Math.round(a.reduce((x,y)=>x+y,0)/a.length):null}
function updateAnchorMode(){const mode=$("rhMode"),source=$("rhSourceLabel"),reset=$("anchorAuto");if(mode)mode.textContent=S.rhManual?"手动锚点":"(MA250 + AHR₁) / 2"+(lastFullAt===0?"（估算中）":"");if(source)source.textContent=S.rhManual?"手动锁定":"MA250·AHR999 均值";if(reset)reset.hidden=!S.rhManual}
function syncAutoAnchor(){if(!S.rhManual){const v=autoAnchorValue();if(v>0){S.rh=v;if(document.activeElement!==$("rh"))$("rh").value=v}}updateAnchorMode()}
function setManualAnchor(){S.rhManual=true;updateAnchorMode();trig()}
function useAutoAnchor(){S.rhManual=false;syncAutoAnchor();trig();saveState();ntf("已恢复自动锚点")}
function recalcPriceModels(){
  if(S.price>0&&S.ahr&&S.ahr.dma>0){
    const dg=Math.floor((new Date()-new Date("2009-01-03"))/864e5),
      pl=Math.pow(10,AHR_A*Math.log10(dg)+AHR_B),
      pl0=Math.pow(10,AHR_A0*Math.log10(dg)+AHR_B0),
      v=S.price*S.price/(S.ahr.dma*pl),c=S.price*S.price/(S.ahr.dma*pl0);
    S.ahr={...S.ahr,v,c,pl,p1:Math.sqrt(S.ahr.dma*pl0)};
    const sc=ahr999ToSc(v);$("d0").value=sc;$("r0").textContent=v.toFixed(3);S.dims[0]=sc;
  }
  const wm=+($("swm")&&$("swm").value)||S.sigs&&S.sigs.wm||0;
  if(S.price>0&&wm>0){const ratio=S.price/wm,sc=wma200ToSc(ratio);$("d1").value=sc;$("r1").textContent=ratio.toFixed(2)+"x";S.dims[1]=sc}
}
function renderPriceDerived(){
  recalcPriceModels();syncAutoAnchor();
  calc(false,false);trig(false,false);upG();sig(false,false);upH2();renderMA();if(S.ahr)renderAhr(S.ahr);renderPriceSpark();renderInitializedPriceViews();saveState();renderAction();
}
function renderPriceTick(){
  recalcPriceModels();syncAutoAnchor();calc(false,false);upG();sig(false,false);if(S.ahr)renderAhr(S.ahr);renderPriceSpark();renderInitializedPriceViews();render21M();
  const personal=$("personal");if(personal&&personal.open){trig(false,false);upH2();renderPersonalChart()}
  saveState();renderAction();
}
function setStatusDot(id,tone){const el=$(id);if(el)el.className=`dot dot-${tone}`}
function renderAction(){
  executionProject();
  const shared=decisionSnapshot(),snap=shared.market,model=shared.model,ready=model.ready,sc=model.score,conf=confidenceInfo(),zone=ready?s2z(sc):null,phase=phaseInfo(snap),ahr=S.ahr&&Number.isFinite(+S.ahr.v)&&healthWeight(HEALTH["AHR999"])>=.5?+S.ahr.v:null,spEl=$("ssp"),sp=spEl&&spEl.value!==""&&healthWeight(HEALTH["SOPR"])>=.5?+spEl.value:null,lthEl=$("slth"),lth=lthEl&&lthEl.value!==""&&healthWeight(HEALTH["LTH-NUPL"])>=.5?+lthEl.value:null,lthPsil=healthWeight(HEALTH["LTH_PSIL"])>=.5?finiteValue(S.raw&&S.raw.lthPsil):null,wm=healthWeight(HEALTH["200WMA"])>=.5?+($("swm")&&$("swm").value)||0:0,stableQuality=combinedHealthQuality(["USDT","USDC"]),st=stableQuality.weight>=.5?combinedStableStats():null;
  const valuationState=heroValuationState(sc,ready),heroEl=$("today");
  if(heroEl){heroEl.dataset.valuationState=valuationState}
  let chainTitle="链上等待数据",chainText="链上指标仍在更新";
  if(Number.isFinite(lth)){if(lth<0){chainTitle="长期持有者浮亏";chainText="长期持有者整体进入未实现亏损"}else if(lth<.1){chainTitle="长期利润接近警戒";chainText="长期持有者利润已接近盈亏警戒线"}else if(lth<.25){chainTitle="长期利润收窄";chainText="长期持有者仍盈利，但利润空间正在收窄"}else if(lth<.5){chainTitle="长期盈利健康";chainText="长期持有者维持健康盈利"}else{chainTitle="长期利润丰厚";chainText="长期持有者未实现利润处于高位"}}
  else if(Number.isFinite(lthPsil)){chainTitle=lthPsil>=30?"长期供应广泛承压":"长期浮亏面可控";chainText=`LTH 自身供应中有 ${lthPsil.toFixed(2)}% 处于未实现亏损`}
  else if(Number.isFinite(sp)){chainTitle=sp<1?"链上轻度投降":"链上获利兑现";chainText=sp<1?"SOPR 低于 1，链上出现亏损兑现":"SOPR 高于 1，链上以盈利兑现为主"}
  if(Number.isFinite(lth)&&Number.isFinite(lthPsil))chainText+=`；LTH 浮亏供应 ${lthPsil.toFixed(2)}%`;
  const liqText=st?(st.d7>=1e9?"稳定币七日明显扩张":st.d7<=-1e9?"稳定币七日明显收缩":"稳定币七日变化温和"):"稳定币流动性等待更新",pbEl=$("spb"),pb=pbEl&&pbEl.value!==""&&healthWeight(HEALTH["概率"])>=.5?+pbEl.value:null,riskText=pb==null?"待定":pb>=40?"高概率":pb>=25?"偏高":pb>=10?"中等":"低概率";
  $("actionTitle").textContent=ready?`${phase.name} · ${chainTitle}`:"数据不足 · 暂不判断";
  $("actionSub").textContent=ready?`BTC 当前处于${zone.t}区间；${chainText}。${liqText}${conf.key==="low"?"，部分数据源暂不可用。":"。"}`:`可靠核心指标 ${model.reliable}/7，有效权重 ${model.coverage.toFixed(1)}/7；达到至少 ${MODEL_MIN_RELIABLE} 项可靠数据后再生成估值与阶段结论。`;
  const ringScore=ready?Math.max(0,Math.min(100,sc)):0;
  $("actionScore").textContent=ready?sc:"--";
  $("todayScoreArc").style.strokeDashoffset=String(100-ringScore);
  $("todayScoreRing").setAttribute("aria-label",ready?`估值评分 ${sc}`:"估值评分等待数据");
  $("actionBtn").textContent="复制今日情报";
  $("oppKpi").textContent=ready?zone.t:"待确认";$("oppKpi").style.color="";setStatusDot("oppKpiDot",!ready?"idle":sc<30?"risk":sc<70?"warn":"good");
  const riskKpiFull=`${POLYMARKET_YEAR} 年内跌破 $${Math.round(POLYMARKET_DOWN_PRICE/1000)}K · 截止 12/31`,riskKpiLabel=$("riskKpiLabel");
  riskKpiLabel.textContent="下行风险";riskKpiLabel.title=riskKpiFull;riskKpiLabel.setAttribute("aria-label",riskKpiFull);
  const riskKpi=$("riskKpi");riskKpi.textContent=pb==null?"待定":riskText;riskKpi.title=pb==null?riskKpiFull:`${riskKpiFull}：${pb.toFixed(1)}%（${riskText}）`;riskKpi.style.color="";setStatusDot("riskKpiDot",pb==null?"idle":pb>=40?"risk":pb>=10?"warn":"good");
  $("confKpi").textContent=conf.label;$("confKpi").style.color="";setStatusDot("confKpiDot",conf.key==="high"?"good":conf.key==="mid"?"warn":"risk");
  const rs=[],ahrK=1,costSnap={...COST_STATE_META[shared.classified.state],state:shared.classified.state,trusted:shared.cost.trusted,valid:shared.cost.valid};if(costSnap&&costSnap.state!=="WAITING")rs.push([`成本 ${costSnap.short} · ${costSnap.valid}/4 组有效`,costSnap.trusted&&costSnap.tone!=="bad"?"":"warn"]);if(!ready)rs.push([`可靠 ${model.reliable}/7 · 有效 ${model.coverage.toFixed(1)}/7`,"warn"]);else if(conf.key==="low")rs.push(["部分指标缺失","warn"]);if(ahr!=null)rs.push([`AHR ${ahr.toFixed(3)} · ${ahr<.45*ahrK?"深度低估":ahr<1.2*ahrK?"低估":ahr<5*ahrK?"偏热":"高估"}`,ahr>=5*ahrK?"warn":""]);if(wm>0)rs.push([`价格/200WMA ${(S.price/wm).toFixed(2)}x`,S.price/wm>2.5?"warn":""]);if(Number.isFinite(sp))rs.push([`SOPR ${sp.toFixed(3)}`,sp>1.05?"warn":""]);if(Number.isFinite(lth))rs.push([`LTH-NUPL ${lth.toFixed(3)}`,lth<.1?"warn":""]);if(Number.isFinite(lthPsil))rs.push([`LTH_PSIL ${lthPsil.toFixed(2)}%`,lthPsil>=30?"warn":""]);if(st)rs.push([st.d7>=0?`稳定币7日 ${fmtUsdB(st.d7)}`:`稳定币7日 ${fmtUsdB(st.d7)}`,st.d7<0?"warn":""]);const funding=healthWeight(HEALTH["资金费率"])>=.5?+(S.raw&&S.raw.fundingRate):null;if(Number.isFinite(funding)&&Math.abs(funding)>.0003)rs.push(["永续杠杆拥挤","warn"]);if(!rs.length)rs.push(["等待更多有效数据","neutral"]);$("actionReasons").innerHTML=rs.slice(0,6).map(r=>`<span class="reason ${r[1]}">${r[0]}</span>`).join("");renderDailyChanges();renderIntelligence();renderBitviewOverview();
  if(moduleIsReady("coststate"))renderCostStructureState();
}
function onP(){S.manualPrice=true;S.price=parsePrice($("bp").value);$("lp").value=S.price;clearTimeout(onPTimer);onPTimer=setTimeout(renderPriceDerived,300)}
function trig(persist=true,render=true){const v=+$("rh").value,hi=v>0?v:(S.rh>0?S.rh:0);S.rh=hi;if(!(hi>0&&S.price>0)){$("rhd").textContent=hi>0?hi.toLocaleString():"--";$("cp").textContent=S.price>0?"现价 $"+S.price.toLocaleString():"现价 --";$("dp2").textContent="--";$("tb").innerHTML='<div class="log-empty">价格与自动锚点就绪后生成回撤档位</div>';if(persist)saveState();upB();if(render)renderAction();return}const cur=S.price,dp=(hi-cur)/hi*100;$("rhd").textContent=hi.toLocaleString();$("cp").textContent="现价 $"+cur.toLocaleString();$("dp2").textContent=dp>0?"-"+dp.toFixed(1)+"%":"+"+Math.abs(dp).toFixed(1)+"%";$("dp2").style.color=dp>0?"var(--market-negative)":"var(--market-positive)";$("tb").innerHTML=TR.map(t=>{const tp=Math.round(hi*(1-t.p)),fire=cur<=hi*(1-t.p),done=triggerDone(t.p),remaining=executionSlotRemaining(t.p),pill=done?'<span class="pill done">已执行</span>':fire?'<span class="pill fire">触发</span>':'<span class="pill wait">等待</span>';return `<div class="trig"><div class="trig-pct">跌${Math.round(t.p*100)}%</div><div class="trig-price num" style="${fire&&!done?"color:var(--market-negative)":""}">$${tp.toLocaleString()}</div><div class="trig-amt num">¥${done?t.a:remaining}</div>${pill}</div>`}).join("");if(persist)saveState();upB();if(render)renderAction()}
function upB(){executionProject();const b=S.bud;$("u0").textContent=b.base;$("u1").textContent=b.pull;$("u2").textContent=b.ext;$("b0").style.width=Math.min(100,b.base/10)+"%";$("b1").style.width=Math.min(100,b.pull/7)+"%";$("b2").style.width=Math.min(100,b.ext/3)+"%";const p=pendingTriggers(),left=Math.max(0,2000-b.base-b.pull-b.ext),pull=Math.min(left,Math.max(0,700-b.pull),p.filter(t=>t.k==="pull").reduce((a,t)=>a+t.a,0)),ext=Math.min(Math.max(0,left-pull),Math.max(0,300-b.ext),p.filter(t=>t.k==="ext").reduce((a,t)=>a+t.a,0));$("pendingPull").textContent="¥"+pull;$("pendingExt").textContent="¥"+ext;if(typeof renderFocusPlan==="function")renderFocusPlan()}
function upH2(){const h=S.hd,fx=Math.max(.01,+S.fx||7.1),dCost=Math.max(0,+h.dcCny||0),dAvgCny=h.d>0?dCost/h.d:0,dAvgUsd=dAvgCny/fx,pnl=dAvgUsd>0&&S.price>0?(S.price/dAvgUsd-1)*100:null,lCost=Math.max(0,+h.lcCny||0),lAvgCny=h.l>0?lCost/h.l:0,lAvgUsd=lAvgCny/fx;$("hd").textContent=(+h.d||0).toFixed(4)+" BTC";$("hdc").innerHTML=`总成本 ¥${Math.round(dCost).toLocaleString("zh-CN")} · 均价 ¥${Math.round(dAvgCny).toLocaleString("zh-CN")} / $${Math.round(dAvgUsd).toLocaleString("en-US")}`+(pnl==null?"":` · <span style="color:${pnl>=0?"var(--market-positive)":"var(--market-negative)"};font-weight:700">${pnl>=0?"+":""}${pnl.toFixed(1)}%</span>`);$("hl").textContent=(+h.l||0).toFixed(4)+" BTC";$("hlc").textContent=`总成本 ¥${Math.round(lCost).toLocaleString("zh-CN")} · 均价 ¥${Math.round(lAvgCny).toLocaleString("zh-CN")} / $${Math.round(lAvgUsd).toLocaleString("en-US")}`;$("hibit").textContent=Math.max(0,+h.ibit||0).toLocaleString()+" 股";$("hgrid").textContent=`${fmtPriceK(+h.gridLo||0)} – ${fmtPriceK(+h.gridHi||0)}`;renderLedgerSyncState();render21M()}
function renderAhr(a){if(typeof renderFocusAhr==="function")return renderFocusAhr(a);if(!a||!a.v)return;const k=ahrShift(),v=a.v,z=v<.45*k?{t:"深度低估",c:"var(--market-positive)"}:v<1.2*k?{t:"长期低估",c:"var(--market-positive-emphasis)"}:v<5*k?{t:"估值偏热",c:"var(--market-caution)"}:{t:"高估风险",c:"var(--market-negative)"};rollNum($("ahrBig"),v,x=>x.toFixed(3));$("ahrBig").style.color=z.c;fadeSwap($("ahrZone"),z.t);$("ahrZone").style.color=z.c;if(a.c)$("ahrC").textContent=a.c.toFixed(3);if(a.pl)$("ahrPL").textContent="$"+Math.round(a.pl/1000)+"K";if(a.dma)$("ahrDMA").textContent="$"+Math.round(a.dma/1000)+"K";const lg=(Math.log(Math.min(12*k,Math.max(.2*k,v)))-Math.log(.2*k))/(Math.log(12)-Math.log(.2))*100;$("ahrCur").style.left=lg.toFixed(1)+"%";if(a.dma&&a.pl){const p045=Math.sqrt(.45*k*a.dma*a.pl),p1=a.p1||Math.sqrt(k*a.dma*a.pl),p12=Math.sqrt(1.2*k*a.dma*a.pl),cpv=S.price;const row=(lbl,px,desc)=>{const below=cpv<=px,dd=(cpv-px)/px*100,pill=below?'<span class="pill opportunity">买入机会</span>':`<span class="pill wait">现价高出 +${dd.toFixed(1)}%</span>`;return `<div class="trig"><div class="trig-pct" style="width:92px">${lbl}</div><div class="trig-price num">$${Math.round(px).toLocaleString()}<span style="font-size:11px;color:var(--text-tertiary);font-weight:500"> ${desc}</span></div>${pill}</div>`};$("ahrLadder").innerHTML=row("AHR = 0.45",p045,"深度低估线")+row("AHR = 1.00",p1,"周期中轴")+row("AHR = 1.20",p12,"低估区上沿")}const lb=$("ahrLbls");if(lb)lb.innerHTML=`<span>深度低估 &lt;${(.45*k).toFixed(2)}</span><span>低估 ${(.45*k).toFixed(2)}–${(1.2*k).toFixed(2)}</span><span>偏热 ${(1.2*k).toFixed(2)}–${(5*k).toFixed(1)}</span><span>高估 &gt;${(5*k).toFixed(1)}</span>`;const sn=$("ahrShiftNote");if(sn)sn.textContent="×"+k.toFixed(3)}
function chartTheme(){const c=getComputedStyle(document.documentElement),v=n=>c.getPropertyValue(n).trim();return{card:v("--surface-1"),surface:v("--surface-panel"),tx:v("--text-primary"),tx2:v("--text-secondary"),div:v("--border-subtle"),gn:v("--market-positive"),rd:v("--market-negative"),btc:v("--brand-ink"),blue:v("--signal-info")}}
function chartDay(ts){return new Date(ts*1000).toLocaleDateString("zh-CN",{year:"numeric",month:"2-digit",day:"2-digit"})}
function shortCny(v){if(!(v>=0))return"--";return v>=1000000?"¥"+(v/1000000).toFixed(2)+"M":v>=10000?"¥"+(v/10000).toFixed(2)+"万":"¥"+Math.round(v).toLocaleString()}
function normalizedDaily(){
  const rows=(DAILY||[]).map(r=>({time:+r[0]>1e12?Math.floor(+r[0]/1000):Math.floor(+r[0]),open:+r[1],high:+r[2],low:+r[3],close:+r[4]})).filter(r=>r.time>0&&r.open>0&&r.high>0&&r.low>0&&r.close>0).sort((a,b)=>a.time-b.time),out=[];
  rows.forEach(r=>{if(out.length&&out.at(-1).time===r.time)out[out.length-1]=r;else out.push(r)});
  const last=out.at(-1);if(last&&S.price>0&&Date.now()/1000-last.time<172800){last.close=S.price;last.high=Math.max(last.high,S.price);last.low=Math.min(last.low,S.price)}
  return out;
}
function decisionRows(){
  const daily=normalizedDaily();if(decisionMode==="D")return daily.map(x=>({time:x.time,close:x.close}));
  const weeks=[];daily.forEach(x=>{const day=(new Date(x.time*1000).getUTCDay()+6)%7,time=x.time-day*86400,last=weeks.at(-1);if(last&&last.time===time)last.close=x.close;else weeks.push({time,close:x.close})});return weeks;
}
function decisionPayload(){
  const rows=decisionRows(),period=decisionMode==="D"?200:40,trend=[];let sum=0;
  rows.forEach((x,i)=>{sum+=x.close;if(i>=period)sum-=rows[i-period].close;if(i>=period-1)trend.push({time:x.time,value:sum/period})});
  const days={"90D":90,"1Y":365,"2Y":730,"ALL":Infinity}[decisionRange]||365,last=rows.at(-1),cut=last&&Number.isFinite(days)?last.time-days*86400:-Infinity,price=rows.filter(x=>x.time>=cut).map(x=>({time:x.time,value:x.close})),trendCut=trend.filter(x=>x.time>=cut),halvingTs=Date.UTC(2024,3,20)/1000,halving=price.find(x=>x.time>=halvingTs);
  return{price,trend:trendCut,period,halving};
}
function setDecisionReadout(price,trend,time){
  const p=Number(price),m=Number(trend),dist=p>0&&m>0?(p/m-1)*100:null;
  $("decisionPrice").textContent=p>0?"$"+Math.round(p).toLocaleString():"--";
  $("decisionTrend").textContent=m>0?"$"+Math.round(m).toLocaleString():"--";
  $("decisionDistance").textContent=dist==null?"--":(dist>=0?"+":"")+dist.toFixed(1)+"%";
  $("decisionDistance").style.color=dist==null?"var(--text-tertiary)":dist>=0?"var(--market-positive)":"var(--market-negative)";
  if(time)$("decisionChartLive").textContent=`${chartDay(+time)} · 结构观察`;
}
function positionHalvingGuide(){const guide=$("halvingGuide");if(!guide||!decisionChart||!decisionHalvingTime){if(guide)guide.hidden=true;return}const x=decisionChart.timeScale().timeToCoordinate(decisionHalvingTime);if(x==null||x<0||x>$("decisionChartShell").clientWidth){guide.hidden=true;return}guide.hidden=false;guide.style.left=Math.round(x)+"px"}
function makeDecisionChart(){
  if(decisionChart||!ensureVendor())return;const LC=LightweightCharts,t=chartTheme();
  decisionChart=LC.createChart($("decisionChart"),{autoSize:true,layout:{background:{type:LC.ColorType.Solid,color:t.surface||t.card},textColor:t.tx2,fontFamily:getComputedStyle(document.body).fontFamily,attributionLogo:true},grid:{vertLines:{color:t.div},horzLines:{color:t.div}},rightPriceScale:{borderColor:t.div,scaleMargins:{top:.13,bottom:.12}},timeScale:{borderColor:t.div,timeVisible:false,secondsVisible:false,rightOffset:2,barSpacing:7,minBarSpacing:1,lockVisibleTimeRangeOnResize:true},crosshair:{mode:LC.CrosshairMode.Normal},localization:{locale:"zh-CN",priceFormatter:v=>"$"+Math.round(v).toLocaleString()}});
  decisionSeries={price:decisionChart.addSeries(LC.AreaSeries,{lineColor:t.btc,topColor:"rgba(247,147,26,.28)",bottomColor:"rgba(247,147,26,.015)",lineWidth:2,priceLineVisible:true,lastValueVisible:true}),trend:decisionChart.addSeries(LC.LineSeries,{color:t.blue,lineWidth:2,lineStyle:LC.LineStyle.Solid,priceLineVisible:false,lastValueVisible:true})};
  decisionChart.subscribeCrosshairMove(p=>{if(!p.time){const d=decisionPayload(),pv=d.price.at(-1),tv=d.trend.at(-1);setDecisionReadout(pv&&pv.value,tv&&tv.value);$("decisionChartLive").textContent=decisionMode==="D"?`${decisionRange} · 日线结构`:`${decisionRange} · 周线结构`;return}const pv=p.seriesData.get(decisionSeries.price),tv=p.seriesData.get(decisionSeries.trend);setDecisionReadout(pv&&pv.value,tv&&tv.value,p.time)});decisionChart.timeScale().subscribeVisibleTimeRangeChange(positionHalvingGuide)
}
function renderDecisionChart(){
  const section=$("decision");if(section&&!section.dataset.lazyVisible)return;
  const empty=$("decisionChartEmpty"),d=decisionPayload(),label=decisionMode==="D"?"MA200D":"MA40W";
  $("decisionTrendLabel").textContent=label;$("decisionLegendTrend").textContent=decisionMode==="D"?"200日趋势":"40周趋势";
  if(!d.price.length){decisionHalvingTime=null;positionHalvingGuide();empty.classList.add("on");$("decisionDot").className="dot";$("decisionFresh").textContent="等待行情";setDecisionReadout(null,null);return}
  if(!ensureVendor()){empty.classList.add("on");empty.textContent="图表组件加载失败";return}
  empty.classList.remove("on");makeDecisionChart();decisionSeries.price.setData(d.price);decisionSeries.trend.setData(d.trend);
  const markers=d.halving?[{time:d.halving.time,position:"belowBar",color:chartTheme().btc,shape:"circle",text:"2024 减半",size:1}]:[];
  decisionHalvingTime=d.halving?d.halving.time:null;
  if(!decisionMarkers)decisionMarkers=LightweightCharts.createSeriesMarkers(decisionSeries.price,markers);else decisionMarkers.setMarkers(markers);
  const key=`${decisionMode}|${decisionRange}|${d.price.length}|${d.price.at(-1).time}`;if(key!==decisionDataKey){decisionDataKey=key;decisionChart.timeScale().fitContent()}requestAnimationFrame(positionHalvingGuide);
  const p=d.price.at(-1),m=d.trend.at(-1);setDecisionReadout(p&&p.value,m&&m.value);$("decisionChartLive").textContent=decisionMode==="D"?`${decisionRange} · 日线结构`:`${decisionRange} · 周线结构`;$("decisionDot").className="dot on";$("decisionFresh").textContent=HEALTH["均线"]?"日线已同步":"本机历史";
}
function initDecisionControls(){
  document.querySelectorAll("[data-decision-mode]").forEach(b=>b.addEventListener("click",()=>{decisionMode=b.dataset.decisionMode;document.querySelectorAll("[data-decision-mode]").forEach(x=>{const on=x===b;x.classList.toggle("active",on);x.setAttribute("aria-pressed",String(on))});renderDecisionChart()}));
  document.querySelectorAll("[data-decision-range]").forEach(b=>b.addEventListener("click",()=>{decisionRange=b.dataset.decisionRange;document.querySelectorAll("[data-decision-range]").forEach(x=>x.classList.toggle("active",x===b));renderDecisionChart()}));
}
function bitviewMedian(values){
  const a=values.map(Number).filter(Number.isFinite).sort((x,y)=>x-y),n=a.length;if(!n)return null;
  return n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2;
}
function bitviewFloorNormalize(raw){
  if(typeof raw==="string"){try{raw=JSON.parse(raw)}catch(_){return null}}
  if(!Array.isArray(raw)||raw.length!==BITVIEW_FLOOR_SERIES.length||!raw.every(r=>r&&r.index==="day1"&&Array.isArray(r.data)&&r.start===raw[0].start&&r.end===raw[0].end&&r.data.length===raw[0].data.length))return null;
  const arrays=BITVIEW_FLOOR_SERIES.map((name,idx)=>pickSeries(raw,name,idx));
  if(arrays.some(a=>!Array.isArray(a)||!a.length))return null;
  const n=Math.min(...arrays.map(a=>a.length));let i=n-1;
  for(;i>=0;i--){if(/^\d{4}-\d{2}-\d{2}$/.test(String(arrays[0][i]||""))&&Date.parse(arrays[0][i]+"T00:00:00Z")<=Date.now()&&arrays.slice(1).every(a=>Number.isFinite(+a[i])&&+a[i]>0))break}
  if(i<0)return null;
  const models={},map={pct95:"p95",pct98:"p98",pct99:"p99",pct99_5:"p995",pct99_9:"p999"};let cursor=2;
  BITVIEW_MODEL_DEFS.forEach(model=>{const row={};BITVIEW_FLOOR_PCTS.forEach(p=>row[map[p]]=+arrays[cursor++][i]);models[model.name]=row});
  const levels={};Object.values(map).forEach(key=>levels[key]=bitviewMedian(BITVIEW_MODEL_ORDER.map(name=>models[name][key])));
  const stamp=String(raw&&raw[0]&&raw[0].stamp||"");
  const out={schema:2,source:"https://bitview.space/api",sourceDate:String(arrays[0][i]),sourceUpdatedAt:stamp,updatedAt:new Date().toISOString(),checkedAt:new Date().toISOString(),status:"live",model:"Consensus",price:+arrays[1][i],levels,models};
  return bitviewFloorValid(out)?out:null;
}
function bitviewFloorValid(d){
  if(!d||![1,2].includes(+d.schema)||!/^\d{4}-\d{2}-\d{2}$/.test(String(d.sourceDate||""))||!d.levels)return false;
  const l=d.levels,keys=["p95","p98","p99","p995","p999"];
  if(!keys.every(k=>Number.isFinite(+l[k])&&+l[k]>0))return false;
  if(!(l.p95>=l.p98&&l.p98>=l.p99&&l.p99>=l.p995&&l.p995>=l.p999))return false;
  const day=Date.parse(d.sourceDate+"T00:00:00Z"),stamp=Date.parse(d.sourceUpdatedAt);
  if(!Number.isFinite(day)||new Date(day).toISOString().slice(0,10)!==d.sourceDate||day>Date.now()||!Number.isFinite(stamp)||stamp>Date.now()+300000||!(d.price>0))return false;
  if(!d.models||!BITVIEW_MODEL_ORDER.every(name=>{const m=d.models[name];return m&&keys.every((k,i)=>Number.isFinite(+m[k])&&+m[k]>0&&(!i||+m[keys[i-1]]>=+m[k]))}))return false;
  return keys.every(k=>Math.abs(+d.levels[k]-bitviewMedian(BITVIEW_MODEL_ORDER.map(name=>d.models[name][k])))<0.01);
}
function bitviewFloorCompare(a,b){return a.sourceDate.localeCompare(b.sourceDate)||(Date.parse(a.sourceUpdatedAt)-Date.parse(b.sourceUpdatedAt))}
function bitviewFloorReadCache(){
  try{const c=JSON.parse(localStorage.getItem(BITVIEW_FLOOR_CACHE_KEY));return c&&c.ts>0&&c.ts<=Date.now()&&bitviewFloorValid(c.data)?c:null}catch(e){return null}
}
function bitviewFloorRestore(){
  const c=bitviewFloorReadCache();
  if(c&&(!bitviewFloorValid(bitviewFloorData)||bitviewFloorCompare(c.data,bitviewFloorData)>0||bitviewFloorCompare(c.data,bitviewFloorData)===0&&bitviewFloorSource!=="api")){
    bitviewFloorData=c.data;bitviewFloorSource="cache";bitviewFloorLastCheck=c.ts;
  }
}
function bitviewFloorGap(level,spot){
  if(!(level>0&&spot>0))return"距现价 --";
  const p=(level/spot-1)*100;
  return`距现价 ${p>=0?"+":""}${p.toFixed(1)}%`;
}
function bitviewFloorAge(day){
  const ts=Date.parse(String(day)+"T00:00:00Z");return Number.isFinite(ts)?Math.max(0,Math.floor((Date.now()-ts)/86400000)):999;
}
function bitviewFloorSetStatus(text,kind="warn"){
  const loading=/同步中|加载中/.test(text);markModuleHealth("Floor模型",text,kind,loading?null:bitviewFloorData&&bitviewFloorData.sourceDate);
  setFresh("freshBitviewFloor","Floor模型");
}
function bitviewFloorTable(d){
  const body=$("bitFloorModelRows");if(!body)return;
  body.innerHTML=BITVIEW_MODEL_ORDER.flatMap(name=>{
    const l=d.models&&d.models[name];if(!l)return[];
    return[`<tr class="${name==="CM"?"active":""}"><td>${name}</td><td>${floorMoney(l.p95)}</td><td>${floorMoney(l.p99)}</td><td>${floorMoney(l.p995)}</td><td>${floorMoney(l.p999)}</td></tr>`]
  }).join("")||'<tr><td colspan="5">暂无模型数据</td></tr>';
}
function renderBitviewFloor(){
  const d=bitviewFloorData;if(!bitviewFloorValid(d)||!$("bitFloorSpot"))return;
  const l=d.levels,spot=S.price>0?S.price:+d.price;
  $("bitFloorSpot").textContent=floorMoney(spot);
  [["P95","p95"],["P99","p99"],["P995","p995"],["P98","p98"],["P999","p999"]].forEach(([id,key])=>{
    $("bitFloor"+id).textContent=floorMoney(+l[key]);
    $("bitFloor"+id+"Gap").textContent=bitviewFloorGap(+l[key],spot);
    const bar=$("bitFloor"+id+"Bar");if(bar)bar.style.width=floorClamp(Math.abs((+l[key]/spot-1)*100)/40*100,4,100).toFixed(1)+"%";
  });
  let state,callout,sub,color;
  if(spot>=l.p95){state="高于 p95 · 尚未进入风险区";callout=`第一观察位 ${floorMoney(l.p95)}`;sub=`现价回撤 ${Math.abs((l.p95/spot-1)*100).toFixed(1)}% 将触及 p95`;color="var(--text-primary)"}
  else if(spot>=l.p99){state="已进入 p95 近期风险区";callout=`下一层 p99 ${floorMoney(l.p99)}`;sub="风险带已触发，仍需结合 UTXO 成本锚确认";color="var(--market-warning)"}
  else if(spot>=l.p995){state="已进入 p99 核心底部区";callout=`下一层 p99.5 ${floorMoney(l.p995)}`;sub="历史尾部压力显著，优先观察模型是否随价格下移";color="var(--market-negative)"}
  else if(spot>=l.p999){state="已进入 p99.5 深度压力区";callout=`极端线 p99.9 ${floorMoney(l.p999)}`;sub="极端环境仍可能跌破，避免把统计线当绝对底";color="#bf5af2"}
  else{state="低于 p99.9 · 极端尾部事件";callout="模型已进入样本外极端区";sub="此时分位标签可靠性最低，应以流动性和链上数据交叉验证";color="var(--signal-info)"}
  $("bitFloorState").textContent=state;$("bitFloorState").style.color=color;
  $("bitFloorDate").textContent=`数据日期 ${d.sourceDate} · 十模型中位数`;
  $("bitFloorCallout").textContent=callout;$("bitFloorCallout").style.color=color;$("bitFloorCalloutSub").textContent=sub;
  const age=bitviewFloorAge(d.sourceDate),source=bitviewFloorSource==="api"?"Bitview 在线数据":bitviewFloorSource==="cache"?"Bitview · 本机缓存":"页面内置真实快照",p95=BITVIEW_MODEL_ORDER.map(name=>+(d.models&&d.models[name]&&d.models[name].p95)).filter(x=>x>0),lo=p95.length?Math.min(...p95):null,hi=p95.length?Math.max(...p95):null,dispersion=lo&&hi?((hi-lo)/l.p95*100):null;
  const range=lo&&hi?` · p95 模型区间 ${floorMoney(lo)}–${floorMoney(hi)}${dispersion!=null?` · 分歧 ${dispersion.toFixed(2)}%`:""}`:"";
  $("bitFloorSource").textContent=`${source}${range} · 截至 ${d.sourceDate}${age<999?`（距今 ${age} 天）`:""}${bitviewFloorError?` · ${bitviewFloorError}`:""}${bitviewFloorMemoryOnly?" · 缓存未保存，本页暂存":""}`;
  let bfStateText, bfStateKind;
  if(age>=999||age>3){bfStateText=age>=999?"数据日期未知":"Floor 数据滞后";bfStateKind="bad"}
  else if(bitviewFloorSource==="api"){bfStateText="实时共识已同步";bfStateKind="good"}
  else{bfStateText=bitviewFloorSource==="cache"?"缓存共识可用":"内置共识快照";bfStateKind=age>1?"warn":"good"}
  if(bitviewFloorError){bfStateText=age>3?"更新失败 · 数据滞后":"更新未成功 · 沿用数据";bfStateKind=age>3?"bad":"warn"}
  bitviewFloorSetStatus(bfStateText,bfStateKind);
  bitviewFloorTable(d);
  if(moduleIsReady("coststate"))renderCostStructureState();
}
async function refreshBitviewFloor(force=false){
  if(bitviewFloorLoading)return;
  bitviewFloorRestore();
  if(!force&&bitviewFloorLastCheck>0&&Date.now()-bitviewFloorLastCheck<BITVIEW_FLOOR_CACHE_TTL){renderBitviewFloor();return}
  if(!force){try{bitviewFloorLastFailure=Math.max(bitviewFloorLastFailure,+localStorage.getItem(BITVIEW_FLOOR_FAIL_KEY)||0)}catch(_){}if(bitviewFloorLastFailure>0&&bitviewFloorLastFailure<=Date.now()&&Date.now()-bitviewFloorLastFailure<BITVIEW_FLOOR_FAIL_TTL){renderBitviewFloor();return}}
  if(navigator.onLine===false){bitviewFloorError="离线，保留已有数据";renderBitviewFloor();return}
  bitviewFloorError="";
  bitviewFloorLoading=true;bitviewFloorSetStatus("十模型同步中","warn");
  try{
    const u=new URL(BITVIEW_API_BULK_URL);u.searchParams.set("index","day1");u.searchParams.set("series",BITVIEW_FLOOR_SERIES.join(","));u.searchParams.set("start","-7");
    const d=bitviewFloorNormalize(await tryFetch(u.toString(),15000));
    if(!bitviewFloorValid(d))throw new Error("Bitview Floor unavailable");
    bitviewFloorRestore();
    if(bitviewFloorValid(bitviewFloorData)&&bitviewFloorCompare(d,bitviewFloorData)<0)throw Error("older");
    bitviewFloorData=d;bitviewFloorSource="api";bitviewFloorLastCheck=Date.now();bitviewFloorLastFailure=0;bitviewFloorMemoryOnly=false;
    try{localStorage.setItem(BITVIEW_FLOOR_CACHE_KEY,JSON.stringify({ts:bitviewFloorLastCheck,data:d}));localStorage.removeItem(BITVIEW_FLOOR_FAIL_KEY)}catch(e){bitviewFloorMemoryOnly=true}
    renderBitviewFloor();if(force)ntf("Floor 已检查 · 数据日期 "+d.sourceDate);
  }catch(e){
    bitviewFloorLastFailure=Date.now();bitviewFloorError=e?.message==="older"?"接口数据较旧，保留较新数据":"更新失败，保留已有数据";
    bitviewFloorRestore();
    try{localStorage.setItem(BITVIEW_FLOOR_FAIL_KEY,String(bitviewFloorLastFailure))}catch(_){}
    renderBitviewFloor();if(force)ntf("Floor 数据暂不可用 · 已保留当前快照");
  }finally{bitviewFloorLoading=false}
}
function initBitviewFloor(){
  bitviewFloorRestore();
  if(bitviewFloorTimer===null){
    const resume=()=>{if(document.visibilityState!=="hidden"&&moduleIsReady("floor"))refreshBitviewFloor(false)};
    bitviewFloorTimer=setInterval(resume,60000);
    window.addEventListener("online",resume);document.addEventListener("visibilitychange",resume);
  }
  renderBitviewFloor();refreshBitviewFloor(false);
}
function bitviewBulkUrl(series,start="-31"){
  const u=new URL(BITVIEW_API_BULK_URL);u.searchParams.set("index","day1");u.searchParams.set("series",series.join(","));u.searchParams.set("start",start);return u.toString();
}
function bitviewDayTs(day){const ts=Date.parse(String(day)+"T00:00:00Z");return Number.isFinite(ts)?ts:null}

function costBasisNormalize(raw){
  const dates=pickSeries(raw,"date",0),prices=pickSeries(raw,"price",1),sths=pickSeries(raw,"sth_realized_price",2),tmms=pickSeries(raw,"true_market_mean",3);
  if([dates,prices,sths,tmms].some(a=>!Array.isArray(a)||!a.length))return null;
  const n=Math.min(dates.length,prices.length,sths.length,tmms.length),series=[];
  for(let i=0;i<n;i++){
    const day=String(dates[i]||""),price=+prices[i],sth=+sths[i],tmm=+tmms[i];
    if(/^\d{4}-\d{2}-\d{2}$/.test(day)&&[price,sth,tmm].every(v=>Number.isFinite(v)&&v>0))series.push({day,price,sth,tmm});
  }
  if(!series.length)return null;
  return{schema:1,day:series.at(-1).day,series};
}
function costBasisValid(d){
  return!!(d&&d.schema===1&&Array.isArray(d.series)&&d.series.length>=365&&d.series.every((r,i)=>
    r&&/^\d{4}-\d{2}-\d{2}$/.test(r.day)&&[r.price,r.sth,r.tmm].every(v=>Number.isFinite(+v)&&+v>0)&&(i===0||r.day>d.series[i-1].day)));
}
function costBasisReadCache(){
  try{
    const c=JSON.parse(localStorage.getItem(BITVIEW_COST_BASIS_CACHE_KEY)||"null");
    return c&&costBasisValid(c.data)?c:null;
  }catch(e){return null}
}
function costBasisRows(){
  const all=costBasisData&&Array.isArray(costBasisData.series)?costBasisData.series:[];
  if(!all.length||costBasisRange==="ALL")return all;
  const years=+costBasisRange.replace("Y","")||1,end=Date.parse(all.at(-1).day+"T00:00:00Z"),cut=new Date(end);
  cut.setUTCFullYear(cut.getUTCFullYear()-years);
  const day=cut.toISOString().slice(0,10),rows=all.filter(r=>r.day>=day);
  return rows.length>1?rows:all;
}
function costBasisMoney(v){return v>0?"$"+Math.round(v).toLocaleString("en-US"):"--"}
function costBasisGap(level,spot){
  if(!(level>0&&spot>0))return"距现价 --";
  const pct=(level/spot-1)*100;
  return `距现价 ${pct>=0?"+":"−"}${Math.abs(pct).toFixed(1)}%`;
}
function costBasisState(sth,tmm,spot){
  if(!(sth>0&&tmm>0&&spot>0))return{label:"等待数据",sub:"比较两条成本线",kind:"warn"};
  const a=spot>=sth,b=spot>=tmm;
  if(a&&b)return{label:"现价高于双成本线",sub:"STH 与 TMM 均位于现价下方",kind:"good"};
  if(!a&&!b)return{label:"现价低于双成本线",sub:"STH 与 TMM 均位于现价上方",kind:"bad"};
  if(!a&&b)return{label:"低于 STH · 高于 TMM",sub:"短期筹码承压，但仍高于活跃市场成本",kind:"warn"};
  return{label:"高于 STH · 低于 TMM",sub:"两条成本线顺序暂时反转",kind:"warn"};
}
function costBasisSetStatus(text,kind="warn"){
  const loading=/同步中|加载中|同步历史/.test(text),last=costBasisData&&costBasisData.series&&costBasisData.series.at(-1);
  markModuleHealth("成本基础",text,kind,loading?null:last&&bitviewDayTs(last.day));
  setFresh("freshCostBasis","成本基础");
}
function renderCostBasisPreview(){
  if(!$("costBasisPrice"))return;
  let sth=null,tmm=null,day=null;
  if(costBasisValid(costBasisData)){
    const r=costBasisData.series.at(-1);sth=+r.sth;tmm=+r.tmm;day=r.day;
  }else if(bitviewOverviewValid(bitviewOverviewData)){
    sth=+bitviewOverviewData.sth;tmm=+bitviewOverviewData.trueMean;day=bitviewOverviewData.day;
  }
  if(!(sth>0&&tmm>0))return;
  const spot=S.price>0?S.price:(costBasisValid(costBasisData)?+costBasisData.series.at(-1).price:null);
  $("costBasisPrice").textContent=costBasisMoney(spot);
  $("costBasisPriceSub").textContent=day?`成本线数据日 ${day}`:"实时现价";
  $("costBasisSth").textContent=costBasisMoney(sth);
  $("costBasisSthGap").textContent=costBasisGap(sth,spot);
  $("costBasisTmm").textContent=costBasisMoney(tmm);
  $("costBasisTmmGap").textContent=costBasisGap(tmm,spot);
  const st=costBasisState(sth,tmm,spot),card=$("costBasisStateCard");
  $("costBasisState").textContent=st.label;$("costBasisStateSub").textContent=st.sub;
  card.classList.remove("good","warn","bad");card.classList.add(st.kind);
  if(moduleIsReady("coststate"))renderCostStructureState();
}
function drawCostBasisChart(){
  const canvas=$("costBasisChart"),shell=$("costBasisChartShell"),empty=$("costBasisEmpty");
  if(!canvas||!shell)return;
  const rows=costBasisRows();
  if(rows.length<2){if(empty)empty.hidden=false;costBasisPlot=null;return}
  if(empty)empty.hidden=true;
  const w=Math.max(280,shell.clientWidth),h=Math.max(250,shell.clientHeight),dpr=Math.min(2,window.devicePixelRatio||1);
  canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);canvas.style.width=w+"px";canvas.style.height=h+"px";
  const ctx=canvas.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  const css=getComputedStyle(document.documentElement),
    grid=css.getPropertyValue("--border-subtle").trim()||"rgba(127,127,127,.18)",
    tx=css.getPropertyValue("--text-primary").trim()||"#111",
    tx3=css.getPropertyValue("--text-tertiary").trim()||"#8e8e93",
    sthColor=css.getPropertyValue("--capitalized-sth").trim()||"#d8a10b",
    tmmColor=css.getPropertyValue("--signal-info").trim()||"#62a8ff";
  const x0=8,x1=w-58,y0=17,y1=h-27,pw=x1-x0,ph=y1-y0;
  let min=Infinity,max=-Infinity;
  rows.forEach(r=>[r.price,r.sth,r.tmm].forEach(v=>{v=+v;if(v<min)min=v;if(v>max)max=v}));
  const rawLo=Math.log10(min),rawHi=Math.log10(max),pad=Math.max(.06,(rawHi-rawLo)*.06),lo=rawLo-pad,hi=rawHi+pad;
  const x=i=>x0+i/(rows.length-1)*pw,y=v=>y1-(Math.log10(v)-lo)/(hi-lo)*ph;
  ctx.font="11px system-ui,-apple-system,sans-serif";ctx.textBaseline="middle";ctx.lineWidth=1;
  for(let i=0;i<=5;i++){
    const yy=y0+i/5*ph,value=10**(hi-(hi-lo)*i/5);
    ctx.strokeStyle=grid;ctx.beginPath();ctx.moveTo(x0,Math.round(yy)+.5);ctx.lineTo(x1,Math.round(yy)+.5);ctx.stroke();
    ctx.fillStyle=tx3;ctx.textAlign="left";ctx.fillText(lthPsilMoney(value),x1+6,yy);
  }
  const tickN=w<430?4:6;
  for(let i=0;i<tickN;i++){
    const idx=Math.round(i/(tickN-1)*(rows.length-1)),xx=x(idx),
      label=costBasisRange==="1Y"?rows[idx].day.slice(5):costBasisRange==="3Y"?rows[idx].day.slice(0,7):rows[idx].day.slice(0,4);
    ctx.fillStyle=tx3;ctx.textAlign=i===0?"left":i===tickN-1?"right":"center";ctx.textBaseline="bottom";ctx.fillText(label,xx,h-4);
  }
  ctx.textBaseline="middle";
  const line=(key,color,width)=>{
    ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineJoin="round";ctx.lineCap="round";ctx.beginPath();
    rows.forEach((r,i)=>{const xx=x(i),yy=y(+r[key]);i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy)});ctx.stroke();
  };
  line("tmm",tmmColor,1.55);line("sth",sthColor,1.65);line("price",tx,1.75);
  costBasisPlot={rows,x0,x1,pw,x};
  canvas.setAttribute("aria-label",`${rows[0].day} 至 ${rows.at(-1).day}，BTC 价格、STH Realized Price 与 True Market Mean 历史图表`);
}
function costBasisTooltipAt(ev){
  if(!costBasisPlot)return;
  const shell=$("costBasisChartShell"),tip=$("costBasisTooltip"),p=costBasisPlot,rect=shell.getBoundingClientRect(),
    px=Math.max(p.x0,Math.min(p.x1,ev.clientX-rect.left)),
    idx=Math.max(0,Math.min(p.rows.length-1,Math.round((px-p.x0)/p.pw*(p.rows.length-1)))),
    r=p.rows[idx],xx=p.x(idx),left=Math.max(7,Math.min(shell.clientWidth-198,xx+12));
  tip.innerHTML=`<b>${r.day}</b>
    <div><span>BTC 价格</span><strong>${costBasisMoney(+r.price)}</strong></div>
    <div class="sth"><span>STH Realized</span><strong>${costBasisMoney(+r.sth)}</strong></div>
    <div class="tmm"><span>True Market Mean</span><strong>${costBasisMoney(+r.tmm)}</strong></div>`;
  tip.style.left=left+"px";tip.style.top="12px";tip.classList.add("on");tip.setAttribute("aria-hidden","false");
}
function hideCostBasisTooltip(){
  const tip=$("costBasisTooltip");if(tip){tip.classList.remove("on");tip.setAttribute("aria-hidden","true")}
}
function renderCostBasisPrice(){
  renderCostBasisPreview();
  if(!costBasisValid(costBasisData))return;
  const r=costBasisData.series.at(-1),age=bitviewFloorAge(r.day),
    source=costBasisSource==="live"?"Bitview / BRK 实时历史":costBasisSource==="cache"?"Bitview / BRK 本机缓存":"Bitview / BRK";
  $("costBasisSource").textContent=`数据源 · ${source} · 免费 API · 截至 ${r.day}`;
  costBasisSetStatus(age>3?"数据滞后":costBasisSource==="live"?"实时已同步":"缓存可用",age>3?"bad":costBasisSource==="live"?"good":"warn");
  drawCostBasisChart();
}
async function refreshCostBasisPrice(force=false){
  if(costBasisLoading)return;
  const cached=costBasisReadCache();
  if(!force&&cached&&Date.now()-cached.ts<BITVIEW_COST_BASIS_CACHE_TTL){
    costBasisData=cached.data;costBasisSource="cache";renderCostBasisPrice();return;
  }
  costBasisLoading=true;costBasisSetStatus("同步历史","warn");
  try{
    const d=costBasisNormalize(await tryFetch(bitviewBulkUrl(BITVIEW_COST_BASIS_SERIES,"2017-01-01"),22000));
    if(!costBasisValid(d))throw new Error("bad cost basis history");
    costBasisData=d;costBasisSource="live";
    try{localStorage.setItem(BITVIEW_COST_BASIS_CACHE_KEY,JSON.stringify({ts:Date.now(),data:d}))}catch(e){}
    renderCostBasisPrice();
    if(force)ntf("STH / True Market Mean 成本基础价格已更新");
  }catch(e){
    if(!costBasisData&&cached){costBasisData=cached.data;costBasisSource="cache"}
    if(costBasisData)renderCostBasisPrice();
    else{
      renderCostBasisPreview();costBasisSetStatus("历史暂不可用","bad");
      if($("costBasisEmpty"))$("costBasisEmpty").textContent="历史暂不可用。点按「更新」重试。";
    }
    if(force)ntf("成本基础价格暂不可用 · 已保留当前数据");
  }finally{costBasisLoading=false}
}
function initCostBasisPrice(){
  const section=$("costbasis");if(!section||section.dataset.ready)return;section.dataset.ready="1";
  const cached=costBasisReadCache();
  if(cached){costBasisData=cached.data;costBasisSource="cache";renderCostBasisPrice()}
  else{renderCostBasisPreview();costBasisSetStatus("等待历史","warn")}
  section.querySelectorAll("[data-costbasis-range]").forEach(btn=>btn.addEventListener("click",()=>{
    costBasisRange=btn.dataset.costbasisRange;
    section.querySelectorAll("[data-costbasis-range]").forEach(x=>{const on=x===btn;x.classList.toggle("active",on);x.setAttribute("aria-pressed",on?"true":"false")});
    hideCostBasisTooltip();drawCostBasisChart();
  }));
  const canvas=$("costBasisChart");
  canvas.addEventListener("pointermove",costBasisTooltipAt,{passive:true});
  canvas.addEventListener("pointerdown",costBasisTooltipAt,{passive:true});
  canvas.addEventListener("pointerleave",hideCostBasisTooltip,{passive:true});
  if("ResizeObserver"in window){
    costBasisResizeObserver=new ResizeObserver(()=>requestAnimationFrame(drawCostBasisChart));
    costBasisResizeObserver.observe($("costBasisChartShell"));
  }else window.addEventListener("resize",drawCostBasisChart,{passive:true});
  refreshCostBasisPrice(false);
}

/* In-flight reads only; no result cache, automatic retry or personal storage. */
const MARKET_REQUESTS=new Map();
let marketConsensusRound=0,priceRefreshEpoch=0;
function copyMarketResponse(value){
  if(value===null||typeof value!=="object")return value;
  return typeof structuredClone==="function"?structuredClone(value):JSON.parse(JSON.stringify(value));
}
function sharedMarketRead(key,load){
  let pending=MARKET_REQUESTS.get(key);
  if(!pending){
    pending=Promise.resolve().then(load).finally(()=>{if(MARKET_REQUESTS.get(key)===pending)MARKET_REQUESTS.delete(key)});
    MARKET_REQUESTS.set(key,pending);
  }
  // Callers may sort/transform data. Never share their mutable result objects.
  return pending.then(copyMarketResponse);
}
function marketReadKey(kind,url,ms){return JSON.stringify([kind,String(url),ms])}
async function fetchMarketBody(url,ms){
  const ctl=new AbortController();
  const timer=setTimeout(()=>ctl.abort(),ms);
  try{
    const response=await fetch(url,{mode:"cors",cache:"no-store",signal:ctl.signal});
    if(!response.ok)throw new Error(response.status);
    const type=response.headers.get("content-type")||"";
    return await (type.includes("json")?response.json():response.text());
  }finally{clearTimeout(timer)}
}

/* One input adapter for real-mode score, phase, cost state and execution audits. */
const DECISION_RULE="V25.0.0";
function decisionHash(value){let h=2166136261;for(const c of value){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return(h>>>0).toString(16)}
function decisionSnapshot(){
  const market=readStatusInputs(),model=evaluateRecord(market),cost=costStructureInput();
  const age=Date.now()-lastTickAt,priceReady=!S.manualPrice&&market.price>0&&Number.isFinite(market.price)&&lastTickAt>0&&age>=0&&age<=staleLimit("价格")&&HEALTH_RUNTIME.online!==false&&!cost.priceConflict;
  cost.spot=market.price>0&&Number.isFinite(market.price)?market.price:0;
  cost.ready=cost.ready&&cost.spot>0;cost.trusted=cost.trusted&&priceReady;
  const previous=costStateRead(),classified=costStructureClassify(cost,previous&&previous.state);
  const sources=Object.fromEntries(CORE_HEALTH.map(name=>[name,healthQuality(name)]));
  const identity={...market,ts:0,score:model.score,cost,sources,priceReady,classified,rule:DECISION_RULE};
  const id=decisionHash(JSON.stringify(identity));market.score=model.score;
  // Fresh object on each call: callers cannot mutate a shared cache or historical snapshot.
  return{rule:DECISION_RULE,id,at:market.ts,market,model,cost,classified,sources,priceReady};
}
function currentStatusSnapshot(){return decisionSnapshot().market}

/* ========== 成本结构状态机 ========== */
const COST_STATE_META={
  WAITING:{label:"等待成本数据",short:"等待",tone:"warn",color:"var(--market-caution)",desc:"至少两组有效成本锚就绪后生成结构状态。",action:"保持原计划，等待数据健康度恢复。"},
  EXPANSION:{label:"盈利扩张",short:"盈利扩张",tone:"good",color:"var(--market-positive)",desc:"现价位于主要成本线之上，持币群体整体仍有盈利缓冲。",action:"成本线上方不等于没有风险。基础定投按期执行，额外资金仍核对原有回撤档位。"},
  STH_TEST:{label:"短期成本回踩",short:"短期回踩",tone:"warn",color:"var(--market-caution)",desc:"短期持有者成本或获利筹码比例承压，尚未进入更深成本区。",action:"回踩本身不触发买入。只有预设档位到达且预算、记录、数据均可核对时，才列出一档加仓。"},
  COMPRESSION:{label:"成本压缩",short:"成本压缩",tone:"warn",color:"var(--brand-ink)",desc:"现价低于市场成本中枢，或获利筹码占比低于 45%；迟滞区内也会暂时保留该状态。",action:"成本承压不等于见底。沿用原回撤档位，每次只核对一档，并保留极端预备金。"},
  DELEVERAGING:{label:"去杠杆深压",short:"去杠杆",tone:"bad",color:"var(--market-negative)",desc:"现价进入 Bedrock 或 UTXO 常见压力底带；这里只描述成本位置，不直接测量爆仓。",action:"压力较深，仍可能继续下跌。只列出预设的一档，不因价格跌深而放大总预算。"},
  CAPITULATION:{label:"投降尾部",short:"投降尾部",tone:"bad",color:"var(--signal-extreme)",desc:"现价触及极端成本分位，模型误差和进一步下跌风险都需重视；这不是已确认的市场底部。",action:"仅核对事先设定的档位，不提高总预算、不使用杠杆，并保留生活应急现金。"},
  RECLAIM:{label:"成本线收复",short:"成本收复",tone:"good",color:"var(--signal-info)",desc:"价格从压力状态重新站上关键成本线，结构正在修复，但尚未完成盈利扩张确认。",action:"收复成本线不是追涨指令。基础定投与加仓仍按原计划分别核对，不临时增加档位。"}
};
const COST_STATE_RANK={EXPANSION:0,RECLAIM:.5,STH_TEST:1,COMPRESSION:2,DELEVERAGING:3,CAPITULATION:4,WAITING:9};
function costStatePositive(...values){return values.map(Number).filter(v=>Number.isFinite(v)&&v>0)}
function costStateMax(...values){const a=costStatePositive(...values);return a.length?Math.max(...a):null}
function costStateAge(day){const value=String(day||""),ts=Date.parse(value+"T00:00:00Z"),age=Math.floor((Date.now()-ts)/86400000);return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(ts)&&new Date(ts).toISOString().slice(0,10)===value&&age>=0?age:999}
function costStatePercent(value){if(value==null||typeof value==="boolean"||!String(value).trim())return null;const n=Number(value);return Number.isFinite(n)&&n>=0&&n<=100?n:null}
function costStateSource(name,day,valid,detail){const age=costStateAge(day),kind=!valid||age>14?"bad":age>3?"warn":"good",weight=!valid?0:age<=3?1:age<=14?.65:.2;return{name,day,valid:!!valid,detail,age,kind,weight}}
function costStructureInput(){
  const cb=costBasisValid(costBasisData)?costBasisData.series.at(-1):bitviewOverviewValid(bitviewOverviewData)?{day:bitviewOverviewData.day,sth:+bitviewOverviewData.sth,tmm:+bitviewOverviewData.trueMean}:null,
    fr=floorRows&&floorRows.length?floorRows.at(-1):null,bf=bitviewFloorValid(bitviewFloorData)?bitviewFloorData:null,ur=window.__costStructureUrpd||null,
    spot=+S.price||+(cb&&cb.price)||+(bf&&bf.price)||+(fr&&fr[1])||+(ur&&ur.spot)||0,
    sth=+(cb&&cb.sth)||0,tmm=+(cb&&cb.tmm)||0,c50=+(fr&&fr[2])||0,f5=+(fr&&fr[3])||0,f2=+(fr&&fr[4])||0,
    p95=+(bf&&bf.levels&&bf.levels.p95)||0,p99=+(bf&&bf.levels&&bf.levels.p99)||0,p995=+(bf&&bf.levels&&bf.levels.p995)||0,
    realized=+(ur&&ur.realized)||0,profitPct=costStatePercent(ur&&ur.profitPct);
  const sources=[costStateSource("STH / TMM",cb&&cb.day,sth>0&&tmm>0,costBasisSource==="live"?"Bitview 实时历史":costBasisSource==="cache"?"本机缓存":"BRK 快照"),costStateSource("UTXO C50",fr&&fr[0],c50>0&&f5>0&&f2>0,floorSource==="live"?"Bitview 实时日线":floorSource==="cache"?"本机缓存":"历史快照"),costStateSource("Bedrock",bf&&bf.sourceDate,p95>0&&p99>0&&p995>0,bitviewFloorSource==="api"?"十模型实时共识":bitviewFloorSource==="cache"?"本机缓存":"安全快照"),costStateSource("URPD",ur&&ur.day,realized>0&&profitPct!=null,ur&&ur.source||"等待筹码分布")];
  let quality=Math.round(sources.reduce((s,x)=>s+x.weight,0)/sources.length*100);const pc=HEALTH_RUNTIME.priceConsensus;if(pc&&pc.status==="conflict")quality=Math.round(quality*.65);const valid=sources.filter(x=>x.valid).length,fresh=sources.filter(x=>x.valid&&x.age<=14).length,ready=spot>0&&valid>=2,trusted=ready&&fresh>=2&&quality>=50&&!(pc&&pc.status==="conflict"),latest=sources.filter(x=>x.valid&&x.day).map(x=>x.day).sort().at(-1)||null;
  return{spot,sth,tmm,c50,f5,f2,p95,p99,p995,realized,profitPct,sources,quality,valid,fresh,ready,trusted,latest,priceConflict:!!(pc&&pc.status==="conflict")}
}
function costStructureClassify(i,prevState=""){
  if(!i||!i.ready)return{state:"WAITING",pressure:null,extreme:null,center:null};
  const pressure=costStateMax(i.f5,i.p99),extreme=costStateMax(i.f2,i.p995),center=costStateMax(i.tmm,i.c50,i.realized),high=costStateMax(i.sth,i.tmm,i.c50,i.realized),spot=i.spot;
  let state=extreme&&spot<=extreme?"CAPITULATION":pressure&&spot<=pressure?"DELEVERAGING":center&&spot<center||i.profitPct!=null&&i.profitPct<45?"COMPRESSION":i.sth>0&&spot<i.sth||i.profitPct!=null&&i.profitPct<60?"STH_TEST":"EXPANSION";
  const prev=COST_STATE_META[prevState]?prevState:"",baseRank=COST_STATE_RANK[state];
  if(prev==="CAPITULATION"&&baseRank<4&&extreme&&spot<=extreme*1.03)state="CAPITULATION";
  else if(prev==="DELEVERAGING"&&baseRank<3&&pressure&&spot<=pressure*1.03)state="DELEVERAGING";
  else if(prev==="COMPRESSION"&&baseRank<2&&center&&spot<=center*1.02)state="COMPRESSION";
  else if(prev==="STH_TEST"&&baseRank<1&&i.sth>0&&spot<=i.sth*1.02)state="STH_TEST";
  else if(prev==="RECLAIM"){
    if(COST_STATE_RANK[state]>=2){}else if(high&&spot<high*1.06)state="RECLAIM";
  }else if(COST_STATE_RANK[prev]>=2&&COST_STATE_RANK[state]<=1){
    const reclaim=costStateMax(i.sth,i.tmm,i.realized);if(reclaim&&spot>=reclaim*1.02&&((high&&spot<high*1.08)||(i.profitPct!=null&&i.profitPct<70)))state="RECLAIM";
  }
  return{state,pressure,extreme,center,high}
}
function costStateRead(){try{const d=JSON.parse(localStorage.getItem(COST_STATE_KEY)||"null");if(!d||d.schema!==1||!COST_STATE_META[d.state])return null;d.history=Array.isArray(d.history)?d.history.slice(-40):[];return d}catch(e){return null}}
function costStateCommit(state,input){
  const old=costStateRead(),now=Date.now();if(!input.trusted)return old;let out=old||{schema:1,state,day:input.latest,spot:input.spot,since:now,updatedAt:now,history:[]};
  if(out.state!==state){out={...out,state,day:input.latest,spot:input.spot,since:now,updatedAt:now,history:[...(out.history||[]),{from:out.state||"WAITING",to:state,at:now,day:input.latest,spot:input.spot}].slice(-40)}}
  else if(out.day!==input.latest||now-(+out.updatedAt||0)>30*60*1000)out={...out,day:input.latest,spot:input.spot,updatedAt:now};
  try{localStorage.setItem(COST_STATE_KEY,JSON.stringify(out))}catch(e){}return out
}
function costStateMoney(v){return v>0?"$"+Math.round(v).toLocaleString("en-US"):"--"}
function costStateGap(v,spot){if(!(v>0&&spot>0))return"等待数据";const p=(v/spot-1)*100;return`距现价 ${p>=0?"+":"−"}${Math.abs(p).toFixed(1)}%`}
function costStateDuration(ts){if(!(ts>0))return"--";const d=Math.max(0,Date.now()-ts),days=Math.floor(d/86400000);if(days)return days+" 天";const hours=Math.floor(d/3600000);if(hours)return hours+" 小时";return Math.max(1,Math.floor(d/60000))+" 分钟"}
function costStateTriggerFor(state,i,c){
  if(state==="EXPANSION")return{price:i.sth,label:"短期持有者成本 · 向下观察"};
  if(state==="STH_TEST")return{price:costStateMax(i.tmm,i.c50),label:"市场成本中枢 · 向下观察"};
  if(state==="COMPRESSION")return{price:c.pressure,label:"p99 / F5 常见压力底带 · 向下观察"};
  if(state==="DELEVERAGING")return{price:c.extreme,label:"p99.5 / F2 极端成本区 · 向下观察"};
  if(state==="CAPITULATION")return{price:costStateMax(i.sth,i.tmm,i.realized),label:"活跃成本收复基准 · 需另满足收复条件"};
  if(state==="RECLAIM")return{price:c.high?c.high*1.06:null,label:"主要成本线上方约 6% · 扩张观察位"};
  return{price:null,label:"等待成本线"}
}
function costPlanMoney(value){return value==null?"--":"¥"+value.toLocaleString("zh-CN",{maximumFractionDigits:2})}
function costPlanDistance(level,spot){if(!(level>0&&spot>0))return"等待行情";const gap=(level/spot-1)*100;return Math.abs(gap)<.005?"已到观察线":`距现价还需${gap<0?"下跌":"上涨"} ${Math.abs(gap).toFixed(1)}%`}
function costStateText(id,text){const el=$(id);if(el&&el.textContent!==String(text))el.textContent=text}
function costPlanContext(input){
  const shared=decisionSnapshot(),model=shared.model,execution=executionView(),ledger=execution.ledger,
    priceAge=Date.now()-(+lastTickAt||0),anchorSources=[];
  if(S.mas&&S.mas.m250>0)anchorSources.push("均线");if(S.ahr&&S.ahr.p1>0)anchorSources.push("AHR999");
  const sourceOK=name=>["ok","fallback","cache"].includes(healthQuality(name).status),
    active=[input.sth>0||input.tmm>0,input.c50>0||input.f5>0||input.f2>0,input.p95>0||input.p99>0||input.p995>0,input.realized>0||input.profitPct!=null],
    costReady=input.trusted&&input.sources.every((x,i)=>!active[i]||x.valid&&x.kind==="good");
  return{input,bud:execution.bud,executionReady:execution.ready,month:mstr(),currentMonth:mstr(),logs:execution.rows,slots:TR,spot:+S.price,anchor:+S.rh,manual:!!S.rhManual,tweak:!!S.tweak,
    pace:model.ready&&Number.isFinite(model.score)&&!S.tweak?basePace(model.score,execution.bud,mstr()):null,costReady,
    priceReady:!S.manualPrice&&Number.isFinite(+S.price)&&S.price>0&&lastTickAt>0&&priceAge>=0&&priceAge<=staleLimit("价格")&&HEALTH_RUNTIME.online!==false&&!input.priceConflict,
    anchorReady:Number.isFinite(+S.rh)&&S.rh>0&&(S.rhManual||anchorSources.length>0&&anchorSources.every(sourceOK)),ledger:!!ledger};
}
/* Read-only adapter: keep the original budget, cadence and TR prices. Never record orders here. */
function costPlanDecision(ctx){
  const limits={base:1000,pull:700,ext:300},keys=Object.keys(limits),valid=ctx.executionReady!==false&&ctx.month===ctx.currentMonth&&ctx.bud&&keys.every(k=>ctx.bud[k]!=null&&typeof ctx.bud[k]!=="boolean"&&String(ctx.bud[k]).trim()!==""&&Number.isFinite(+ctx.bud[k])&&+ctx.bud[k]>=0),
    used=Object.fromEntries(keys.map(k=>[k,valid?+ctx.bud[k]:0])),left=Object.fromEntries(keys.map(k=>[k,valid?Math.max(0,limits[k]-used[k]):null])),
    totalLeft=valid?Math.max(0,2000-keys.reduce((n,k)=>n+used[k],0)):null,
    logs=(ctx.logs||[]).filter(l=>l&&l.mo===ctx.currentMonth&&Number.isFinite(+l.a)&&+l.a>0),
    spent=k=>logs.filter(l=>l.t===k).reduce((n,l)=>n+(+l.a),0),
    slotOf=l=>l.tp!=null&&ctx.slots.find(t=>t.k===l.t&&t.p===+l.tp),
    unknownExtra=logs.some(l=>["pull","ext"].includes(l.t)&&!slotOf(l)&&l.executionChoice!=="manual")||valid&&["pull","ext"].some(k=>Math.abs(spent(k)-used[k])>.011),
    unknownBase=valid&&spent("base")>used.base+.011,
    card=(status,label,amount,note)=>({status,label,amount,note});
  let base,extra,next=null;
  if(!valid||unknownBase)base=card("check","先核对计划",null,ctx.month!==ctx.currentMonth?"月份尚未同步":"预算与记录需要核对");
  else if(left.base<=0||totalLeft<=0)base=card("done","本月已完成",0,"不重复投入基础预算");
  else if(!ctx.priceReady)base=card("check","等待有效行情",null,"更新行情后再核对执行金额");
  else if(ctx.tweak)base=card("check","微调模式",null,"恢复真实数据后再核对");
  else if(!ctx.pace||!Number.isFinite(ctx.pace.dueAmount))base=card("check","按原计划",null,"评分不足，不重算本期金额");
  else if(ctx.pace.dueAmount>0)base=card("buy","本期可执行",Math.min(ctx.pace.dueAmount,left.base,totalLeft),`${ctx.pace.label} · 当前一笔待执行`);
  else base=card(ctx.pace.nextDay?"wait":"done","本期已完成",0,ctx.pace.nextDay?`下次计划：本月 ${ctx.pace.nextDay} 日`:"本月计划已完成，等待下月");
  if(!valid)extra=card("check","先核对预算",null,"月份或预算尚未同步");
  else if(totalLeft<=0||left.pull+left.ext<=0)extra=card("done","本月不再追加",0,"加仓额度已用完");
  else if(ctx.tweak)extra=card("check","暂停加仓判断",null,"微调值不用于真实执行");
  else if(unknownExtra)extra=card("check","先核对记录",null,"已有加仓无法对应档位，避免重复买入");
  else if(!ctx.priceReady)extra=card("check","等待有效行情",null,ctx.input.priceConflict?"现货报价冲突，暂停判断":"行情过期或离线，更新后再核对");
  else if(!ctx.costReady)extra=card("check","等待成本数据",null,"成本来源缺失或滞后，暂不追加");
  else if(!ctx.anchorReady)extra=card("check","等待有效锚点",null,"自动锚点数据待更新");
  else{
    const allocated=t=>logs.filter(l=>l.t===t.k&&l.tp!=null&&+l.tp===t.p).reduce((n,l)=>n+(+l.a),0),
      pending=ctx.slots.filter(t=>allocated(t)<t.a-.005&&left[t.k]>0).map(t=>({...t,price:ctx.anchor*(1-t.p),amount:Math.min(t.a-allocated(t),left[t.k],totalLeft)})),
      fired=pending.filter(t=>ctx.spot<=t.price);
    next=fired[0]||pending[0]||null;
    if(!next)extra=card("done","本月档位已完成",0,"已执行的档位不会重复提示");
    else if(fired.length)extra=card("buy","可执行一档",next.amount,`回撤 ${Math.round(next.p*100)}% 档 · ${next.k==="ext"?"极端预备金":"回撤预算"}${fired.length>1?" · 不合并多档":""}`);
    else extra=card("wait","暂不加仓",0,"尚未到达预设回撤档位");
  }
  // If another category already overspent, the combined display still cannot exceed the monthly cap.
  if(base.status==="buy"&&extra.status==="buy"){
    extra.amount=Math.min(extra.amount,Math.max(0,totalLeft-base.amount));
    if(extra.amount<=0){extra=card("done","本月不再追加",0,"先保留本期待执行的基础额度");next=null}
  }
  const buying=base.status==="buy"||extra.status==="buy",checking=base.status==="check"||extra.status==="check";
  const title=extra.status==="buy"?(base.status==="buy"?"本期定投＋一档加仓":"可按计划加仓一档"):base.status==="buy"?"本期定投可执行":checking?"先核对，再执行":base.status==="done"&&extra.status==="done"?"本月无需追加":"暂不追加，等待计划";
  const summary=extra.status==="buy"?"预设档位已触发；仅列一档，不增加月度总预算。":base.status==="buy"?`基础定投已到期；${extra.status==="check"?"额外加仓条件尚待确认。":"额外资金继续按原档位等待。"}`:checking?"条件尚未齐备，不把缺失数据当成买入信号。":"本期未有新的待执行动作，保留剩余额度。";
  return{base,extra,next,left,totalLeft,title,summary,action:buying?"buy":checking?"check":"wait",valid,manual:ctx.manual,spot:ctx.spot};
}
function renderCostPlan(input,state){
  const context=costPlanContext(input),plan=costPlanDecision(context),panel=$("costStatePanel");if(panel)panel.dataset.action=plan.action;
  costStateText("costDecisionTitle",plan.title);
  const risk=input.trusted&&["DELEVERAGING","CAPITULATION"].includes(state)?" 当前处于深度压力区，仍可能继续下跌。":"";
  costStateText("costDecisionSummary",plan.summary+risk);
  [["Base",plan.base],["Extra",plan.extra]].forEach(([key,item])=>{const el=$("cost"+key+"Card");if(el)el.dataset.status=item.status;costStateText("cost"+key+"Status",item.label);costStateText("cost"+key+"Amount",costPlanMoney(item.amount));costStateText("cost"+key+"Note",item.note)});
  costStateText("costBudgetLeft",costPlanMoney(plan.totalLeft));costStateText("costBudgetNote",plan.valid?`基础 ${costPlanMoney(plan.left.base)} · 回撤 ${costPlanMoney(plan.left.pull)} · 极端 ${costPlanMoney(plan.left.ext)} 剩余额度` : "总预算 ¥2,000 · 等待当月记录同步");
  const t=plan.next,ready=plan.extra.status==="buy";
  costStateText("costNextLabel",t?(ready?"本次已触发档":"下一加仓档"):"下一步");
  costStateText("costNextPrice",t?costStateMoney(t.price):plan.extra.status==="done"?"本月不再追加":"先核对条件");
  costStateText("costNextDistance",t?(ready?"已到预设档位":costPlanDistance(t.price,plan.spot)):plan.extra.status==="done"?"不重复执行":"暂不判断买点");
  costStateText("costNextNote",t?`相对${plan.manual?"手动":"自动"}锚点回撤 ${Math.round(t.p*100)}% · 本档上限 ${costPlanMoney(t.amount)}。不是成本状态边界。`:plan.extra.note);
  return{...plan,costReady:context.costReady};
}
function costStateOpenPlan(){const target=$("personal");if(!target)return;if(typeof keepDockVisibleForTabNavigation==="function")keepDockVisibleForTabNavigation();if(typeof setTab==="function")setTab("mine",true);target.open=true;if(typeof scrollSectionToAppTop==="function")scrollSectionToAppTop(target,"auto");else target.scrollIntoView({block:"start"});const summary=target.querySelector("summary");if(summary)summary.focus({preventScroll:true})}
function renderCostStructureState(){
  const sec=$("coststate");if(!sec)return;
  const shared=decisionSnapshot(),input=shared.cost,classified=shared.classified,record=costStateCommit(classified.state,input),
    state=input.ready?classified.state:"WAITING",meta=COST_STATE_META[state],trigger=costStateTriggerFor(state,input,classified),displayRecord=record&&record.state===state?record:null;
  sec.style.setProperty("--cost-state-color",meta.color);
  costStateText("costStateKicker",input.trusted?"成本分区参考 · 沿用原状态规则":input.ready?"成本分区暂定 · 数据尚待核对":"等待至少两组有效成本来源");
  costStateText("costStateName",(input.ready&&!input.trusted?"暂定 · ":"")+meta.label);
  costStateText("costStateDesc",input.priceConflict?"现货报价发生冲突，成本结构暂不确认。":meta.desc);
  costStateText("costStateAction",input.trusted?meta.action:"数据降级时不据此增加投入；基础定投仍核对原有计划。");
  const plan=renderCostPlan(input,state);
  costStateText("costStateTrigger",costStateMoney(trigger.price));
  costStateText("costStateTriggerSub",trigger.price?`${trigger.label} · ${costPlanDistance(trigger.price,input.spot)}。实际切换还参考迟滞与获利筹码。`:trigger.label);
  const timely=input.sources.filter(x=>x.valid&&x.kind==="good").length;
  costStateText("costStateConfidence",`${input.valid}/4 组有效 · ${timely}/4 组及时`);
  costStateText("costStateSince",displayRecord?costStateDuration(displayRecord.since):"尚未确认");
  const rail=$("costStateRail");if(rail){rail.querySelectorAll("[data-cost-state]").forEach(x=>x.classList.toggle("active",x.dataset.costState===state));rail.setAttribute("aria-label",`当前成本结构：${meta.label}；分区不是价格预测`)}
  const evidence=[
    {name:"短期持有者成本 · STH",value:input.sth,sub:costStateGap(input.sth,input.spot)},
    {name:"活跃市场均价 · TMM",value:input.tmm,sub:costStateGap(input.tmm,input.spot)},
    {name:"UTXO 中位成本 · C50",value:input.c50,sub:costStateGap(input.c50,input.spot)},
    {name:"获利筹码占比 · URPD",text:input.profitPct==null?"--":input.profitPct.toFixed(1)+"%",sub:input.realized>0?`实现均价 ${costStateMoney(input.realized)}`:"等待筹码分布"}
  ];
  const evidenceEl=$("costStateEvidence");if(evidenceEl)evidenceEl.innerHTML=evidence.map(x=>`<article><small>${x.name}</small><b class="num">${x.text||costStateMoney(x.value)}</b><span>${x.sub}</span></article>`).join("");
  const sourcesEl=$("costStateSources");if(sourcesEl)sourcesEl.innerHTML=input.sources.map(x=>`<div class="cost-state-source ${x.kind}"><i aria-hidden="true"></i><div><b>${x.name}</b><span>${x.valid?esc((x.day||"日期未知")+" · "+(x.kind==="good"?"及时":x.kind==="warn"?"滞后":"过期")):"缺失或不完整"}</span></div></div>`).join("");
  const history=record&&Array.isArray(record.history)?record.history.filter(x=>x&&COST_STATE_META[x.to]).slice(-6).reverse():[],historyEl=$("costStateHistoryList");
  if(historyEl)historyEl.innerHTML=history.length?history.map(x=>{const a=COST_STATE_META[x.from]||COST_STATE_META.WAITING,b=COST_STATE_META[x.to];return`<div class="cost-state-history-row"><span class="num">${esc(x.day||"--")}</span><b>${a.short} → ${b.short}</b><span class="num">${costStateMoney(x.spot)}</span></div>`}).join(""):'<div class="cost-state-history-row"><span>--</span><b>尚无迁移记录</b><span>等待首个可信状态</span></div>';
  costStateText("costStateUpdated",`判断 #${shared.id} · 行情 ${lastTickAt>0?cacheAge(lastTickAt):"待更新"} · 成本数据最新 ${input.latest||"--"}`);
  window.__costStructureSnapshot={state,label:meta.label,short:meta.short,tone:meta.tone,quality:input.quality,trusted:input.trusted,action:meta.action,at:Date.now()};
  const status=input.priceConflict?"报价冲突":plan.costReady?"成本数据可用":input.ready?"成本数据待更新":"成本数据不足",kind=plan.costReady?"good":"warn";
  markModuleHealth("成本状态机",status,kind,plan.costReady&&input.latest?input.latest:null);
  setFresh("freshCostState","成本状态机");
}
let costStateRefreshing=false;
async function refreshCostStructureState(force=false){
  if(costStateRefreshing)return;costStateRefreshing=true;const button=$("costStateRefresh");
  if(button){button.disabled=true;button.textContent="更新中";button.setAttribute("aria-busy","true")}
  try{
    const tasks=[];
    if(force&&typeof tickPrice==="function")tasks.push(tickPrice());
    if(typeof refreshBitviewOverview==="function")tasks.push(refreshBitviewOverview(!!force));
    if(typeof refreshBitviewFloor==="function")tasks.push(refreshBitviewFloor(!!force));
    if(typeof refreshFloorModel==="function")tasks.push(refreshFloorModel(!!force));
    if(typeof refreshCostBasisPrice==="function")tasks.push(refreshCostBasisPrice(!!force));
    if(typeof window.__requestUrpdStructure==="function")tasks.push(window.__requestUrpdStructure(!!force));
    await Promise.allSettled(tasks);renderCostStructureState();
    if(force)ntf("已重新核对成本、档位与预算");
  }finally{costStateRefreshing=false;if(button){button.disabled=false;button.textContent="更新";button.removeAttribute("aria-busy")}}
}
function initCostStructureState(){const sec=$("coststate");if(!sec||sec.dataset.ready)return;sec.dataset.ready="1";renderCostStructureState();initBitviewFloor();initFloorModel();initCostBasisPrice();if(typeof window.__requestUrpdStructure==="function")window.__requestUrpdStructure(false)}

function capitalizedNormalize(raw){
  const dates=pickSeries(raw,"date",0),prices=pickSeries(raw,"price",1),sths=pickSeries(raw,"sth_capitalized_price",2),lths=pickSeries(raw,"lth_capitalized_price",3),alls=pickSeries(raw,"capitalized_price",4);
  if([dates,prices,sths,lths,alls].some(a=>!Array.isArray(a)||!a.length))return null;
  const n=Math.min(dates.length,prices.length,sths.length,lths.length,alls.length),series=[];
  for(let i=0;i<n;i++){
    const day=String(dates[i]||""),price=+prices[i],sth=+sths[i],lth=+lths[i],all=+alls[i];
    if(/^\d{4}-\d{2}-\d{2}$/.test(day)&&[price,sth,lth,all].every(v=>Number.isFinite(v)&&v>0))series.push({day,price,sth,lth,all});
  }
  if(!series.length)return null;
  return{schema:1,day:series.at(-1).day,series};
}
function capitalizedValid(d){
  return!!(d&&d.schema===1&&Array.isArray(d.series)&&d.series.length>=365&&d.series.every((r,i)=>r&&/^\d{4}-\d{2}-\d{2}$/.test(r.day)&&[r.price,r.sth,r.lth,r.all].every(v=>Number.isFinite(+v)&&+v>0)&&(i===0||r.day>d.series[i-1].day)));
}
function capitalizedReadCache(){try{const c=JSON.parse(localStorage.getItem(BITVIEW_CAPITALIZED_CACHE_KEY)||"null");return c&&capitalizedValid(c.data)?c:null}catch(e){return null}}
function capitalizedRows(){
  const all=capitalizedData&&Array.isArray(capitalizedData.series)?capitalizedData.series:[];
  if(!all.length||capitalizedRange==="ALL")return all;
  const years=+capitalizedRange.replace("Y","")||1,end=Date.parse(all.at(-1).day+"T00:00:00Z"),cut=new Date(end);cut.setUTCFullYear(cut.getUTCFullYear()-years);
  const day=cut.toISOString().slice(0,10),rows=all.filter(r=>r.day>=day);return rows.length>1?rows:all;
}
function capitalizedMoney(v){return v>0?"$"+Math.round(v).toLocaleString("en-US"):"--"}
function capitalizedGap(level,spot){
  if(!(level>0&&spot>0))return"距现价 --";
  const pct=(level/spot-1)*100;return `距现价 ${pct>=0?"+":"−"}${Math.abs(pct).toFixed(1)}%`;
}
function capitalizedSetStatus(text,kind="warn"){
  const loading=/同步中|加载中|同步历史/.test(text),last=capitalizedData&&capitalizedData.series&&capitalizedData.series.at(-1);
  markModuleHealth("资本化价格",text,kind,loading?null:last&&bitviewDayTs(last.day));
  setFresh("freshCapitalized","资本化价格");
}
function drawCapitalizedChart(){
  const canvas=$("capitalizedChart"),shell=$("capitalizedChartShell"),empty=$("capitalizedEmpty");if(!canvas||!shell)return;
  const rows=capitalizedRows();if(rows.length<2){if(empty)empty.hidden=false;capitalizedPlot=null;return}if(empty)empty.hidden=true;
  const w=Math.max(280,shell.clientWidth),h=Math.max(250,shell.clientHeight),dpr=Math.min(2,window.devicePixelRatio||1);
  canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);canvas.style.width=w+"px";canvas.style.height=h+"px";
  const ctx=canvas.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  const css=getComputedStyle(document.documentElement),grid=css.getPropertyValue("--border-subtle").trim()||"rgba(127,127,127,.18)",tx=css.getPropertyValue("--text-primary").trim()||"#111",tx3=css.getPropertyValue("--text-tertiary").trim()||"#8e8e93";
  const x0=8,x1=w-58,y0=17,y1=h-27,pw=x1-x0,ph=y1-y0;
  let min=Infinity,max=-Infinity;rows.forEach(r=>[r.price,r.sth,r.lth,r.all].forEach(v=>{v=+v;if(v<min)min=v;if(v>max)max=v}));
  const rawLo=Math.log10(min),rawHi=Math.log10(max),pad=Math.max(.06,(rawHi-rawLo)*.06),lo=rawLo-pad,hi=rawHi+pad,x=i=>x0+i/(rows.length-1)*pw,y=v=>y1-(Math.log10(v)-lo)/(hi-lo)*ph;
  ctx.font="11px system-ui,-apple-system,sans-serif";ctx.textBaseline="middle";ctx.lineWidth=1;
  for(let i=0;i<=5;i++){
    const yy=y0+i/5*ph,value=10**(hi-(hi-lo)*i/5);ctx.strokeStyle=grid;ctx.beginPath();ctx.moveTo(x0,Math.round(yy)+.5);ctx.lineTo(x1,Math.round(yy)+.5);ctx.stroke();ctx.fillStyle=tx3;ctx.textAlign="left";ctx.fillText(lthPsilMoney(value),x1+6,yy);
  }
  const tickN=w<430?4:6;for(let i=0;i<tickN;i++){
    const idx=Math.round(i/(tickN-1)*(rows.length-1)),xx=x(idx),label=capitalizedRange==="1Y"?rows[idx].day.slice(5):capitalizedRange==="3Y"?rows[idx].day.slice(0,7):rows[idx].day.slice(0,4);ctx.fillStyle=tx3;ctx.textAlign=i===0?"left":i===tickN-1?"right":"center";ctx.textBaseline="bottom";ctx.fillText(label,xx,h-4);
  }
  ctx.textBaseline="middle";
  const line=(key,color,width)=>{ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineJoin="round";ctx.lineCap="round";ctx.beginPath();rows.forEach((r,i)=>{const xx=x(i),yy=y(+r[key]);i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy)});ctx.stroke()};
  line("all","#ef7627",1.45);line("lth","#bf5af2",1.55);line("sth","#d8a10b",1.55);line("price",tx,1.7);
  capitalizedPlot={rows,x0,x1,pw,x};canvas.setAttribute("aria-label",`${rows[0].day} 至 ${rows.at(-1).day}，BTC 现价与 STH、LTH、全市场资本化价格历史图表`);
}
function capitalizedTooltipAt(ev){
  if(!capitalizedPlot)return;
  const shell=$("capitalizedChartShell"),tip=$("capitalizedTooltip"),p=capitalizedPlot,rect=shell.getBoundingClientRect(),px=Math.max(p.x0,Math.min(p.x1,ev.clientX-rect.left)),idx=Math.max(0,Math.min(p.rows.length-1,Math.round((px-p.x0)/p.pw*(p.rows.length-1)))),r=p.rows[idx],x=p.x(idx),left=Math.max(7,Math.min(shell.clientWidth-192,x+12));
  tip.innerHTML=`<b>${r.day}</b><div><span>BTC 现价</span><strong>${capitalizedMoney(+r.price)}</strong></div><div class="sth"><span>STH</span><strong>${capitalizedMoney(+r.sth)}</strong></div><div class="lth"><span>LTH</span><strong>${capitalizedMoney(+r.lth)}</strong></div><div class="all"><span>全市场</span><strong>${capitalizedMoney(+r.all)}</strong></div>`;
  tip.style.left=left+"px";tip.style.top="12px";tip.classList.add("on");tip.setAttribute("aria-hidden","false");
}
function hideCapitalizedTooltip(){const tip=$("capitalizedTooltip");if(tip){tip.classList.remove("on");tip.setAttribute("aria-hidden","true")}}
function renderCapitalizedPrice(){
  if(!capitalizedValid(capitalizedData))return;
  const r=capitalizedData.series.at(-1);$("capitalizedPrice").textContent=capitalizedMoney(+r.price);$("capitalizedPriceSub").textContent=`数据日 ${r.day}`;$("capitalizedSth").textContent=capitalizedMoney(+r.sth);$("capitalizedSthGap").textContent=capitalizedGap(+r.sth,+r.price);$("capitalizedLth").textContent=capitalizedMoney(+r.lth);$("capitalizedLthGap").textContent=capitalizedGap(+r.lth,+r.price);$("capitalizedAll").textContent=capitalizedMoney(+r.all);$("capitalizedAllGap").textContent=capitalizedGap(+r.all,+r.price);
  const age=bitviewFloorAge(r.day),source=capitalizedSource==="live"?"Bitview 实时历史":capitalizedSource==="cache"?"Bitview · 本机缓存":"Bitview";$("capitalizedSource").textContent=`数据源 · ${source} · 截至 ${r.day}`;capitalizedSetStatus(age>3?"数据滞后":capitalizedSource==="live"?"实时已同步":"缓存可用",age>3?"bad":capitalizedSource==="live"?"good":"warn");drawCapitalizedChart();
}
async function refreshCapitalizedPrice(force=false){
  if(capitalizedLoading)return;const cached=capitalizedReadCache();
  if(!force&&cached&&Date.now()-cached.ts<BITVIEW_CAPITALIZED_CACHE_TTL){capitalizedData=cached.data;capitalizedSource="cache";renderCapitalizedPrice();return}
  capitalizedLoading=true;capitalizedSetStatus("同步历史","warn");
  try{
    const d=capitalizedNormalize(await tryFetch(bitviewBulkUrl(BITVIEW_CAPITALIZED_SERIES,"2017-01-01"),22000));if(!capitalizedValid(d))throw new Error("bad capitalized price history");
    capitalizedData=d;capitalizedSource="live";try{localStorage.setItem(BITVIEW_CAPITALIZED_CACHE_KEY,JSON.stringify({ts:Date.now(),data:d}))}catch(e){}renderCapitalizedPrice();if(force)ntf("STH / LTH 资本化价格已更新");
  }catch(e){
    if(!capitalizedData&&cached){capitalizedData=cached.data;capitalizedSource="cache"}if(capitalizedData)renderCapitalizedPrice();else{capitalizedSetStatus("历史暂不可用","bad");if($("capitalizedEmpty"))$("capitalizedEmpty").textContent="历史暂不可用。点按「更新」重试。"}if(force)ntf("资本化价格暂不可用 · 已保留当前数据");
  }finally{capitalizedLoading=false}
}
function initCapitalizedPrice(){
  const section=$("capitalized");if(!section||section.dataset.ready)return;section.dataset.ready="1";
  const cached=capitalizedReadCache();if(cached){capitalizedData=cached.data;capitalizedSource="cache";renderCapitalizedPrice()}
  section.querySelectorAll("[data-capitalized-range]").forEach(btn=>btn.addEventListener("click",()=>{capitalizedRange=btn.dataset.capitalizedRange;section.querySelectorAll("[data-capitalized-range]").forEach(x=>{const on=x===btn;x.classList.toggle("active",on);x.setAttribute("aria-pressed",on?"true":"false")});hideCapitalizedTooltip();drawCapitalizedChart()}));
  const canvas=$("capitalizedChart");canvas.addEventListener("pointermove",capitalizedTooltipAt,{passive:true});canvas.addEventListener("pointerdown",capitalizedTooltipAt,{passive:true});canvas.addEventListener("pointerleave",hideCapitalizedTooltip,{passive:true});
  if("ResizeObserver"in window){capitalizedResizeObserver=new ResizeObserver(()=>requestAnimationFrame(drawCapitalizedChart));capitalizedResizeObserver.observe($("capitalizedChartShell"))}else window.addEventListener("resize",drawCapitalizedChart,{passive:true});refreshCapitalizedPrice(false);
}
function lthPsilNormalize(raw){
  const dates=pickSeries(raw,"date",0),values=pickSeries(raw,"lth_supply_in_loss_share",1),prices=pickSeries(raw,"price",2);
  if(!Array.isArray(dates)||!Array.isArray(values)||!dates.length||!values.length)return null;
  const n=Math.min(dates.length,values.length,Array.isArray(prices)?prices.length:Infinity),series=[];
  for(let i=0;i<n;i++){
    const day=String(dates[i]||""),value=+values[i],price=Array.isArray(prices)?+prices[i]:null;
    if(/^\d{4}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(value)&&value>=0&&value<=100&&(price==null||Number.isFinite(price)&&price>0))series.push({day,value,price});
  }
  if(!series.length)return null;
  const last=series.at(-1),prev=series.length>1?series.at(-2):null;
  return{schema:1,day:last.day,value:last.value,price:last.price,previous:prev?prev.value:null,series};
}
function lthPsilValid(d){
  return!!(d&&d.schema===1&&Array.isArray(d.series)&&d.series.length>=365&&d.series.every((r,i)=>r&&/^\d{4}-\d{2}-\d{2}$/.test(r.day)&&Number.isFinite(+r.value)&&+r.value>=0&&+r.value<=100&&Number.isFinite(+r.price)&&+r.price>0&&(i===0||r.day>d.series[i-1].day)));
}
function lthPsilReadCache(){try{const c=JSON.parse(localStorage.getItem(BITVIEW_PSIL_CACHE_KEY)||"null");return c&&lthPsilValid(c.data)?c:null}catch(e){return null}}
function lthPsilRows(){
  const all=lthPsilData&&Array.isArray(lthPsilData.series)?lthPsilData.series:[];if(!all.length||lthPsilRange==="ALL")return all;
  const years=+lthPsilRange.replace("Y","")||1,end=Date.parse(all.at(-1).day+"T00:00:00Z"),cut=new Date(end);cut.setUTCFullYear(cut.getUTCFullYear()-years);const day=cut.toISOString().slice(0,10),rows=all.filter(r=>r.day>=day);return rows.length>1?rows:all;
}
function lthPsilMoney(v){if(!(v>0))return"--";if(v>=1e6)return"$"+(v/1e6).toFixed(1)+"M";if(v>=1e3)return"$"+(v/1e3).toFixed(v>=1e5?0:1)+"K";return"$"+Math.round(v)}
function lthPsilState(v){return v<5?["浮亏面较窄","var(--market-positive)"]:v<15?["少数 LTH 承压","var(--market-positive-emphasis)"]:v<30?["LTH 浮亏面扩大","var(--market-warning)"]:v<45?["LTH 供应广泛承压","var(--market-caution)"]:["LTH 浮亏面处于极端区","var(--market-negative)"]}
function drawLthPsilChart(){
  const canvas=$("lthPsilChart"),shell=$("lthPsilChartShell"),empty=$("lthPsilEmpty");if(!canvas||!shell)return;const rows=lthPsilRows();
  if(rows.length<2){if(empty)empty.hidden=false;lthPsilPlot=null;return}if(empty)empty.hidden=true;
  const w=Math.max(280,shell.clientWidth),h=Math.max(240,shell.clientHeight),dpr=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);canvas.style.width=w+"px";canvas.style.height=h+"px";
  const ctx=canvas.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);const css=getComputedStyle(document.documentElement),grid=css.getPropertyValue("--border-subtle").trim()||"rgba(127,127,127,.18)",tx3=css.getPropertyValue("--text-tertiary").trim()||"#8e8e93",x0=50,x1=w-64,y0=17,y1=h-27,pw=x1-x0,ph=y1-y0,maxPct=Math.max(60,Math.ceil(Math.max(...rows.map(r=>+r.value))/10)*10),prices=rows.map(r=>+r.price),logMin=Math.log10(Math.min(...prices)),logMax=Math.log10(Math.max(...prices)),logPad=Math.max(.08,(logMax-logMin)*.05),lo=logMin-logPad,hi=logMax+logPad;
  const x=i=>x0+i/(rows.length-1)*pw,yPct=v=>y1-v/maxPct*ph,yPrice=v=>y1-(Math.log10(v)-lo)/(hi-lo)*ph;
  ctx.font="11px system-ui,-apple-system,sans-serif";ctx.textBaseline="middle";ctx.lineWidth=1;
  for(let i=0;i<=5;i++){const yy=y0+i/5*ph,p=maxPct*(1-i/5),price=10**(hi-(hi-lo)*i/5);ctx.strokeStyle=grid;ctx.beginPath();ctx.moveTo(x0,Math.round(yy)+.5);ctx.lineTo(x1,Math.round(yy)+.5);ctx.stroke();ctx.fillStyle=tx3;ctx.textAlign="right";ctx.fillText(Math.round(p)+"%",x0-6,yy);ctx.textAlign="left";ctx.fillText(lthPsilMoney(price),x1+6,yy)}
  const tickN=w<430?4:6;for(let i=0;i<tickN;i++){const idx=Math.round(i/(tickN-1)*(rows.length-1)),xx=x(idx),label=lthPsilRange==="1Y"?rows[idx].day.slice(5):lthPsilRange==="3Y"?rows[idx].day.slice(0,7):rows[idx].day.slice(0,4);ctx.fillStyle=tx3;ctx.textAlign=i===0?"left":i===tickN-1?"right":"center";ctx.textBaseline="bottom";ctx.fillText(label,xx,h-4)}ctx.textBaseline="middle";
  const line=(fn,color,width)=>{ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineJoin="round";ctx.lineCap="round";ctx.beginPath();rows.forEach((r,i)=>{const xx=x(i),yy=fn(r);i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy)});ctx.stroke()};line(r=>yPrice(+r.price),"#8e8e93",1.25);line(r=>yPct(+r.value),"#f7931a",1.8);
  lthPsilPlot={rows,x0,x1,y0,y1,pw,ph,x};canvas.setAttribute("aria-label",`${rows[0].day} 至 ${rows.at(-1).day}，LTH_PSIL 与 BTC 价格历史双轴图表`);
}
function lthPsilTooltipAt(ev){
  if(!lthPsilPlot)return;const shell=$("lthPsilChartShell"),tip=$("lthPsilTooltip"),p=lthPsilPlot,rect=shell.getBoundingClientRect(),px=Math.max(p.x0,Math.min(p.x1,ev.clientX-rect.left)),idx=Math.max(0,Math.min(p.rows.length-1,Math.round((px-p.x0)/p.pw*(p.rows.length-1)))),r=p.rows[idx],x=p.x(idx),left=Math.max(7,Math.min(shell.clientWidth-174,x+12));
  tip.innerHTML=`<b>${r.day}</b><div><span>LTH_PSIL</span><strong>${(+r.value).toFixed(2)}%</strong></div><div><span>BTC 价格</span><strong>${lthPsilMoney(+r.price)}</strong></div>`;tip.style.left=left+"px";tip.style.top="12px";tip.classList.add("on");tip.setAttribute("aria-hidden","false")
}
function hideLthPsilTooltip(){const tip=$("lthPsilTooltip");if(tip){tip.classList.remove("on");tip.setAttribute("aria-hidden","true")}}
function renderLthPsilModule(){
  if(!lthPsilData)return;const last=lthPsilData.series.at(-1),prev=lthPsilData.series.at(-2);renderLthPsil(+last.value,prev?+prev.value:null,+last.price,last.day);const src=$("lthPsilSource");if(src)src.textContent=`数据源 · Bitview / Bitcoin Research Kit · ${lthPsilSource==="live"?"实时历史":lthPsilSource==="cache"?"本机缓存":"当前数据"}`;drawLthPsilChart()
}
async function refreshLthPsil(force=false){
  if(lthPsilLoading)return;const cached=lthPsilReadCache();if(!force&&cached&&Date.now()-cached.ts<BITVIEW_PSIL_CACHE_TTL){lthPsilData=cached.data;lthPsilSource="cache";renderLthPsilModule();return}
  lthPsilLoading=true;const badge=$("freshLthPsil");if(badge){badge.textContent="同步历史";badge.className="fresh-badge warn"}
  try{const d=lthPsilNormalize(await tryFetch(bitviewBulkUrl(BITVIEW_PSIL_SERIES,"2013-01-01"),20000));if(!lthPsilValid(d))throw new Error("bad LTH_PSIL history");lthPsilData=d;lthPsilSource="live";try{localStorage.setItem(BITVIEW_PSIL_CACHE_KEY,JSON.stringify({ts:Date.now(),data:d}))}catch(e){}markHealth("LTH_PSIL","ok","Bitview/BRK · LTH 自身供应口径",bitviewDayTs(d.day),"Bitview/BRK · lth_supply_in_loss_share + price");renderLthPsilModule();renderFreshness();if(force)ntf("LTH_PSIL 全历史已更新")}
  catch(e){if(!lthPsilData&&cached){lthPsilData=cached.data;lthPsilSource="cache"}if(lthPsilData)renderLthPsilModule();else if($("lthPsilEmpty"))$("lthPsilEmpty").textContent="历史暂不可用。点按「更新」重试。";if(force)ntf("LTH_PSIL 历史暂不可用 · 已保留当前数据")}
  finally{lthPsilLoading=false}
}
function initLthPsil(){
  const section=$("lthpsil");if(!section||section.dataset.ready)return;section.dataset.ready="1";const cached=lthPsilReadCache();if(cached){lthPsilData=cached.data;lthPsilSource="cache";markHealth("LTH_PSIL","ok","Bitview/BRK · 本机缓存",bitviewDayTs(cached.data.day),"Bitview/BRK · lth_supply_in_loss_share + price");renderLthPsilModule();renderFreshness()}
  section.querySelectorAll("[data-psil-range]").forEach(btn=>btn.addEventListener("click",()=>{lthPsilRange=btn.dataset.psilRange;section.querySelectorAll("[data-psil-range]").forEach(x=>{const on=x===btn;x.classList.toggle("active",on);x.setAttribute("aria-pressed",on?"true":"false")});hideLthPsilTooltip();drawLthPsilChart()}));const canvas=$("lthPsilChart");canvas.addEventListener("pointermove",lthPsilTooltipAt,{passive:true});canvas.addEventListener("pointerdown",lthPsilTooltipAt,{passive:true});canvas.addEventListener("pointerleave",hideLthPsilTooltip,{passive:true});if("ResizeObserver"in window){lthPsilResizeObserver=new ResizeObserver(()=>requestAnimationFrame(drawLthPsilChart));lthPsilResizeObserver.observe($("lthPsilChartShell"))}else window.addEventListener("resize",drawLthPsilChart,{passive:true});refreshLthPsil(false)
}
function bitviewOverviewValid(d){
  if(!d||d.schema!==1||!/^\d{4}-\d{2}-\d{2}$/.test(String(d.day||""))||!Array.isArray(d.days)||!d.days.length||!Array.isArray(d.phases)||d.phases.length!==d.days.length||!Array.isArray(d.scores)||d.scores.length!==d.days.length)return false;
  if(![d.sth,d.trueMean,d.active].every(v=>Number.isFinite(+v)&&+v>0)||!d.rarity)return false;
  return BITVIEW_RARITY_META.every(x=>Number.isFinite(+d.rarity[x.key])&&+d.rarity[x.key]>=0&&+d.rarity[x.key]<=3);
}
function bitviewOverviewNormalize(raw){
  const arrays=BITVIEW_OVERVIEW_SERIES.map((name,idx)=>pickSeries(raw,name,idx));if(arrays.some(a=>!Array.isArray(a)||!a.length))return null;
  const n=Math.min(...arrays.map(a=>a.length)),rows=[];
  for(let i=0;i<n;i++){
    const day=String(arrays[0][i]||""),phase=String(arrays[1][i]||""),score=+arrays[2][i],sth=+arrays[3][i],trueMean=+arrays[4][i],active=+arrays[5][i],ranks=arrays.slice(6).map(a=>+a[i]);
    if(/^\d{4}-\d{2}-\d{2}$/.test(day)&&phase&&Number.isFinite(score)&&sth>0&&trueMean>0&&active>0&&ranks.every(x=>Number.isFinite(x)&&x>=0&&x<=3))rows.push({day,phase,score,sth,trueMean,active,ranks});
  }
  const last=rows.at(-1);if(!last)return null;
  const rarity={};BITVIEW_RARITY_META.forEach((x,i)=>rarity[x.key]=last.ranks[i]);
  const out={schema:1,day:last.day,stamp:String(raw&&raw[0]&&raw[0].stamp||""),days:rows.map(x=>x.day),phases:rows.map(x=>x.phase),scores:rows.map(x=>x.score),sth:last.sth,trueMean:last.trueMean,active:last.active,rarity};
  return bitviewOverviewValid(out)?out:null;
}
function bitviewOverviewReadCache(){try{const c=JSON.parse(localStorage.getItem(BITVIEW_OVERVIEW_CACHE_KEY));return c&&bitviewOverviewValid(c.data)?c:null}catch(e){return null}}
function capitalPhaseMeta(key){
  return({raging_bull:{label:"狂热牛市",tone:"bull"},bull:{label:"牛市",tone:"bull"},cautious_bull:{label:"谨慎牛市",tone:"caution"},hopeful_bull:{label:"希望牛市",tone:"caution"},early_bull:{label:"早期牛市",tone:"caution"},weak_bull:{label:"弱牛市",tone:"caution"},limbo:{label:"过渡期",tone:"caution"},deep_bear:{label:"深熊",tone:"bear"},bear:{label:"熊市",tone:"bear"},early_bear:{label:"早期熊市",tone:"bear"}})[key]||{label:String(key||"未知").replaceAll("_"," "),tone:"caution"};
}
function anchorGapText(anchor,spot){
  if(!(anchor>0&&spot>0))return"等待现价";const gap=(anchor/spot-1)*100;
  return`距现价 ${gap>=0?"+":"−"}${Math.abs(gap).toFixed(1)}%`;
}
function renderBitviewOverview(){
  const d=bitviewOverviewData;if(!bitviewOverviewValid(d)||!$("capitalPhaseTag"))return;
  const phase=d.phases.at(-1),meta=capitalPhaseMeta(phase),score=+d.scores.at(-1),tag=$("capitalPhaseTag");let streak=1;
  for(let i=d.phases.length-2;i>=0&&d.phases[i]===phase;i--)streak++;
  const streakText=streak===d.phases.length&&d.phases.length>=31?`≥${streak}日`:`${streak}日`;
  tag.textContent=`BRK 资本阶段 · ${meta.label} · ${score>0?"+":""}${score}`;tag.className=`capital-phase-tag ${meta.tone}`;tag.title=`Capital Sentiment · ${streakText} · 数据日 ${d.day}`;
  const alert=$("rarityAlert"),hits=BITVIEW_RARITY_META.map(x=>({...x,rank:+d.rarity[x.key]})).filter(x=>x.rank>0),max=hits.length?Math.max(...hits.map(x=>x.rank)):0;
  alert.hidden=!hits.length;alert.className=`rarity-alert${max?` rank${max}`:""}`;
  if(hits.length){$("rarityTitle").textContent=`Rarity Meter · 罕见事件 ${max}/3`;$("rarityText").textContent=hits.map(x=>`${x.label} ${x.rank}/3`).join(" · ")}
  const spot=S.price>0?S.price:null;$("anchorSth").textContent=floorMoney(+d.sth);$("anchorTrueMean").textContent=floorMoney(+d.trueMean);$("anchorActive").textContent=floorMoney(+d.active);
  $("anchorSthGap").textContent=anchorGapText(+d.sth,spot);$("anchorTrueMeanGap").textContent=anchorGapText(+d.trueMean,spot);$("anchorActiveGap").textContent=anchorGapText(+d.active,spot);
  const cursor=$("anchorCursor"),spectrum=$("anchorSpectrum");if(cursor&&spot>0){const ratio=spot/+d.sth,pos=floorClamp((ratio-.75)/.5*100,2,98);cursor.style.left=pos.toFixed(1)+"%";spectrum.setAttribute("aria-label",`现价 ${floorMoney(spot)}；短期持有者实现价格 ${floorMoney(+d.sth)}；${anchorGapText(+d.sth,spot)}`)}
  const age=bitviewFloorAge(d.day),source=bitviewOverviewSource==="api"?"BRK 信号已同步":bitviewOverviewSource==="cache"?"BRK 本机缓存":"BRK 内置快照",kind=age>3?"bad":bitviewOverviewSource==="api"?"good":"warn",status=age>3?"BRK 信号滞后":source;
  markModuleHealth("BRK信号",status,kind,d.day);setFresh("freshAnchors","BRK信号");if(moduleIsReady("costbasis"))renderCostBasisPreview();if(moduleIsReady("coststate"))renderCostStructureState();
}
async function refreshBitviewOverview(force=false){
  if(bitviewOverviewLoading)return;const cached=bitviewOverviewReadCache();if(!force&&cached&&Date.now()-(+cached.ts||0)<BITVIEW_OVERVIEW_CACHE_TTL)return;
  bitviewOverviewLoading=true;markModuleHealth("BRK信号","资本阶段同步中","warn",null);setFresh("freshAnchors","BRK信号");
  try{
    const d=bitviewOverviewNormalize(await tryFetch(bitviewBulkUrl(BITVIEW_OVERVIEW_SERIES,"-31"),15000));if(!bitviewOverviewValid(d))throw new Error("bad Bitview overview");
    bitviewOverviewData=d;bitviewOverviewSource="api";try{localStorage.setItem(BITVIEW_OVERVIEW_CACHE_KEY,JSON.stringify({ts:Date.now(),data:d}))}catch(e){}renderBitviewOverview();if(force)ntf("Bitview 资本阶段与成本锚已更新");
  }catch(e){if(!bitviewOverviewValid(bitviewOverviewData)&&cached){bitviewOverviewData=cached.data;bitviewOverviewSource="cache"}renderBitviewOverview();if(force)ntf("BRK 信号暂不可用 · 已保留当前快照")}
  finally{bitviewOverviewLoading=false}
}
function initBitviewOverview(){
  if(document.body.dataset.bitviewOverviewReady)return;document.body.dataset.bitviewOverviewReady="1";
  const cached=bitviewOverviewReadCache();if(cached){bitviewOverviewData=cached.data;bitviewOverviewSource="cache"}
  renderBitviewOverview();
  runWhenNetworkIdle(()=>refreshBitviewOverview(false),900,12000);
}
function lthPulseValid(d){
  if(!d||d.schema!==1||!/^\d{4}-\d{2}-\d{2}$/.test(String(d.day||"")))return false;const arrays=[d.days,d.sopr,d.pl,d.cdd];if(arrays.some(a=>!Array.isArray(a)||!a.length)||!arrays.every(a=>a.length===arrays[0].length))return false;
  return d.sopr.every(v=>Number.isFinite(+v)&&+v>0)&&d.pl.every(v=>Number.isFinite(+v)&&+v>=0)&&d.cdd.every(v=>Number.isFinite(+v)&&+v>=0);
}
function lthPulseNormalize(raw){
  const arrays=BITVIEW_LTH_SERIES.map((name,idx)=>pickSeries(raw,name,idx));if(arrays.some(a=>!Array.isArray(a)||!a.length))return null;const n=Math.min(...arrays.map(a=>a.length)),rows=[];
  for(let i=0;i<n;i++){const day=String(arrays[0][i]||""),sopr=+arrays[1][i],pl=+arrays[2][i],cdd=+arrays[3][i];if(/^\d{4}-\d{2}-\d{2}$/.test(day)&&sopr>0&&Number.isFinite(pl)&&pl>=0&&Number.isFinite(cdd)&&cdd>=0)rows.push({day,sopr,pl,cdd})}
  const last=rows.at(-1);if(!last)return null;const out={schema:1,day:last.day,stamp:String(raw&&raw[0]&&raw[0].stamp||""),days:rows.map(x=>x.day),sopr:rows.map(x=>x.sopr),pl:rows.map(x=>x.pl),cdd:rows.map(x=>x.cdd)};return lthPulseValid(out)?out:null;
}
function lthPulseReadCache(){try{const c=JSON.parse(localStorage.getItem(BITVIEW_LTH_CACHE_KEY));return c&&lthPulseValid(c.data)?c:null}catch(e){return null}}
function pulseCompact(v){if(!(v>=0))return"--";return v>=1e9?(v/1e9).toFixed(2)+"B":v>=1e6?(v/1e6).toFixed(1)+"M":v>=1e3?(v/1e3).toFixed(1)+"K":Math.round(v).toLocaleString()}
function renderLthPulse(){
  const d=lthPulseData;if(!lthPulseValid(d)||!$("lthPulseSopr"))return;const sopr=+d.sopr.at(-1),pl=+d.pl.at(-1),cdd=+d.cdd.at(-1),med=bitviewMedian(d.cdd.slice(-30))||cdd,ratio=med>0?cdd/med:null;let title,desc,color;
  if(sopr<1&&pl<1){title="长期持有者正在亏损移动筹码";desc="LTH SOPR 与实现盈利/亏损比同时低于 1，近期移动的长期筹码以亏损兑现为主。";color="var(--market-negative)"}
  else if(sopr>=1&&pl>=1){title="长期持有者以盈利花费为主";desc="两项盈亏指标都位于 1 上方，长期筹码移动仍以盈利兑现为主。";color="var(--market-positive)"}
  else{title="长期持有者花费信号分化";desc="SOPR 与实现盈利/亏损比暂未同向，等待下一批链上结算确认。";color="var(--market-caution)"}
  $("lthPulseState").textContent=title;$("lthPulseState").style.color=color;$("lthPulseDesc").textContent=desc;$("lthPulseDay").textContent=`数据日 ${d.day}`;
  $("lthPulseSopr").textContent=sopr.toFixed(3);$("lthPulseSopr").style.color=sopr>=1?"var(--market-positive)":"var(--market-negative)";$("lthPulseSoprSub").textContent=sopr>=1?"近期盈利花费占优":"近期亏损花费占优";
  $("lthPulsePl").textContent=pl.toFixed(3);$("lthPulsePl").style.color=pl>=1?"var(--market-positive)":"var(--market-negative)";$("lthPulsePlSub").textContent=pl>=1?"实现盈利大于亏损":"实现亏损大于盈利";
  $("lthPulseCdd").textContent=pulseCompact(cdd);$("lthPulseCddSub").textContent=ratio==null?"等待 30 日基线":`近 30 日中位数的 ${ratio.toFixed(2)}×`;
  const spark=$("lthPulseSpark"),values=d.sopr.slice(-20),lo=Math.min(...values,.8),hi=Math.max(...values,1.05),days=d.days.slice(-values.length);spark.innerHTML=values.map((v,i)=>{const h=floorClamp((v-lo)/Math.max(.001,hi-lo)*23+5,5,28),c=v>=1?"var(--market-positive)":v>=.9?"var(--market-caution)":"var(--market-negative)";return`<i style="height:${h.toFixed(1)}px;background:${c}" title="${days[i]} · ${v.toFixed(3)}"></i>`}).join("");
  const age=bitviewFloorAge(d.day),source=lthPulseSource==="api"?"Bitview 实时 API":lthPulseSource==="cache"?"Bitview · 本机缓存":"Bitview · 内置快照";$("lthPulseSource").textContent=`${source} · 截至 ${d.day}`;const kind=age>3?"bad":lthPulseSource==="api"?"good":"warn",status=age>3?"LTH 数据滞后":lthPulseSource==="api"?"LTH 花费已同步":lthPulseSource==="cache"?"LTH 缓存可用":"LTH 内置快照";markModuleHealth("LTH花费",status,kind,d.day);setFresh("freshLthPulse","LTH花费");
}
async function refreshLthPulse(force=false){
  if(lthPulseLoading)return;const cached=lthPulseReadCache();if(!force&&cached&&Date.now()-(+cached.ts||0)<BITVIEW_LTH_CACHE_TTL)return;lthPulseLoading=true;markModuleHealth("LTH花费","LTH 花费同步中","warn",null);setFresh("freshLthPulse","LTH花费");
  try{const d=lthPulseNormalize(await tryFetch(bitviewBulkUrl(BITVIEW_LTH_SERIES,"-31"),15000));if(!lthPulseValid(d))throw new Error("bad LTH pulse");lthPulseData=d;lthPulseSource="api";try{localStorage.setItem(BITVIEW_LTH_CACHE_KEY,JSON.stringify({ts:Date.now(),data:d}))}catch(e){}renderLthPulse();if(force)ntf("LTH 花费脉冲已更新")}
  catch(e){if(!lthPulseValid(lthPulseData)&&cached){lthPulseData=cached.data;lthPulseSource="cache"}renderLthPulse();if(force)ntf("LTH 数据暂不可用 · 已保留当前快照")}finally{lthPulseLoading=false}
}

/* Cash-flow-neutral NAV. Contributions buy fund units before each simulated trade. */
function dcaLabRunRows(rows,p=dcaLabParams()){
  const fx=p.fx==null?Math.max(.01,+S.fx||7.1):Number(p.fx),fee=Number(p.feePct||0)/100;
  if(!Array.isArray(rows)||rows.length<2||!Number.isFinite(fx)||fx<=0||!Number.isFinite(p.monthly)||p.monthly<=0||!Number.isFinite(fee)||fee<0||fee>.05||!Array.isArray(p.mult)||p.mult.length!==4||p.mult.some(v=>!Number.isFinite(v)||v<0))return null;
  if(rows.some((r,i)=>!r||![r.price,r.ahr,r.k].every(v=>Number.isFinite(v)&&v>0)||dcaLabDate(r.day)==null||i>0&&(dcaLabMonthSerial(r.m)!==dcaLabMonthSerial(rows[i-1].m)+1||r.day<=rows[i-1].day)))return null;
  const accounts=Object.fromEntries(["A","B","C","D"].map(k=>[k,{btc:0,cash:0,units:0,cost:0,fees:0}]));
  let inv=0;
  const path=rows.map(r=>{
    const pc=r.price*fx,ahrRefit=r.ahr,k=r.k,ahrClassic=r.ahrClassic>0?r.ahrClassic:ahrRefit/k,
      zi=zoneIndexOf(ahrClassic,1),ziRefit=zoneIndexOf(ahrRefit,k),smoothMult=dcaSmoothMultiplier(ahrClassic);
    inv+=p.monthly;
    const row={m:r.m,day:r.day,signalDay:r.signalDay,price:r.price,ahr:ahrRefit,ahrRefit,ahrClassic,k,zi,ziRefit,smoothMult,inv};
    for(const key of ["A","B","C","D"]){
      const a=accounts[key],equityBefore=a.btc*pc+a.cash,navBefore=a.units>0?equityBefore/a.units:1;
      a.units+=p.monthly/navBefore;a.cash+=p.monthly;
      const mult=key==="A"?1:key==="B"?p.mult[zi]:key==="C"?p.mult[ziRefit]:smoothMult;
      const spend=Math.min(p.monthly*mult,a.cash),feePaid=spend*fee;
      a.cash-=spend;a.btc+=(spend-feePaid)/pc;a.cost+=spend;a.fees+=feePaid;
      const equity=a.btc*pc+a.cash;
      Object.assign(row,{["spend"+key]:spend,["cash"+key]:a.cash,["btc"+key]:a.btc,["eq"+key]:equity,["r"+key]:equity/inv,["nav"+key]:equity/a.units});
    }
    row.spend=row.spendB;row.cash=row.cashB;return row;
  });
  const ddOf=key=>{let peak=1,max=0,at=0;const s=path.map((x,i)=>{peak=Math.max(peak,x[key]);const dd=Math.max(0,1-x[key]/peak);if(dd>max){max=dd;at=i}return dd});return{s,max,at}};
  const last=path.at(-1),result={p:{...p,fx,feePct:fee*100},fx,path,last};
  for(const key of ["A","B","C","D"]){
    result["cost"+key]=accounts[key].cost;result["fees"+key]=accounts[key].fees;result["dd"+key]=ddOf("nav"+key);
    result["irr"+key]=dcaLabXirr(path.map(r=>({day:r.day,amount:-p.monthly})).concat({day:last.day,amount:last["eq"+key]}));
  }
  return result;
}
function dcaLabXirr(flows){
  if(!Array.isArray(flows)||flows.length<2)return null;
  const first=dcaLabDate(flows[0].day),last=dcaLabDate(flows.at(-1).day);
  if(first==null||last==null||last<=first||flows.some(f=>dcaLabDate(f.day)==null||!Number.isFinite(f.amount)))return null;
  const terms=flows.map(f=>({t:(dcaLabDate(f.day)-first)/(365.25*864e5),a:f.amount}));
  const npv=y=>terms.reduce((n,f)=>n+f.a*Math.exp(-y*f.t),0);
  let lo=-20,hi=20,fl=npv(lo),fh=npv(hi);
  if(!Number.isFinite(fl)||!Number.isFinite(fh)||fl*fh>0)return null;
  for(let i=0;i<180;i++){
    const mid=(lo+hi)/2,fm=npv(mid);if(Math.abs(fm)<1e-8)return Math.expm1(mid);
    if(fl*fm<=0){hi=mid;fh=fm}else{lo=mid;fl=fm}
  }
  return Math.expm1((lo+hi)/2);
}

/* Monthly observations and network checks are different clocks. */
function dcaExpectedMonth(now=Date.now()) {
  const d=new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),0)).toISOString().slice(0,7);
}
function dcaHistoryCoverage(rows,now=Date.now()) {
  const expected=dcaExpectedMonth(now),end=dcaLabMonthSerial(expected);
  const months=[...new Set((rows||[]).map(r=>r.m))].filter(m=>/^\d{4}-(0[1-9]|1[0-2])$/.test(m)&&m<=expected).sort();
  const first=months[0],last=months.at(-1),missing=[];
  if(first){const seen=new Set(months);for(let s=dcaLabMonthSerial(first);s<=end;s++){
    const m=Math.floor(s/12)+'-'+String(s%12+1).padStart(2,'0');if(!seen.has(m))missing.push(m);
  }}
  return{expected,first,last,missing,complete:!!last&&last===expected&&!missing.length};
}
function dcaMonthlyStatus(status,dataAt,now=Date.now()) {
  if(['idle','loading','fail','conflict'].includes(status))return status;
  dataAt=+dataAt;
  const d=new Date(dataAt),valid=dataAt>0&&Number.isFinite(d.getTime())&&d.getUTCHours()===0&&d.getUTCMinutes()===0&&d.getUTCSeconds()===0&&d.getUTCMilliseconds()===0&&new Date(dataAt+864e5).getUTCDate()===1;
  if(!valid||d.toISOString().slice(0,7)!==dcaExpectedMonth(now))return 'stale';
  if(dcaLabMonths.length&&!dcaHistoryCoverage(dcaLabMonths,now).complete)return 'stale';
  // A cached pre-V25.1 "stale" flag may have been produced by the old 3-day rule.
  return status==='stale'?'cache':status;
}
function dcaPublishHealth({fetchedAt=0,attemptAt=0,error='',loading=false}={}) {
  const coverage=dcaHistoryCoverage(dcaLabMonths),old=HEALTH['定投回测']||{};
  const last=dcaLabMonths.at(-1),at=last?dcaLabDate(last.day):null;
  const status=loading?'loading':!last?'fail':!coverage.complete?'stale':dcaLabSource==='live'&&!error?'ok':'cache';
  HEALTH['定投回测']={name:'定投回测',status,ts:at,dataAt:at,
    fetchedAt:fetchedAt||old.fetchedAt||null,lastAttemptAt:attemptAt||old.lastAttemptAt||null,lastError:error,
    sourceDetail:'Binance 完整日线 → 已完成自然月',
    detail:!last?'历史不可用':coverage.missing.length?`缺少 ${coverage.missing.length} 个完整月份：${coverage.missing.slice(0,3).join('、')}`:`${dcaLabMonths.length} 个完整月 · 月份连续`};
}
function dcaFreshnessText(h) {
  const at=+(h.dataAt||h.ts),date=new Date(at),month=at>0&&Number.isFinite(date.getTime())?date.toISOString().slice(0,7):'';
  const status=dcaMonthlyStatus(h.status,at);
  if(status==='idle')return '等待数据';
  if(status==='loading')return '更新中'+(month?' · '+month:'');
  if(status==='fail')return '历史不可用';
  if(status==='conflict')return '历史冲突';
  if(h.lastError)return '更新失败'+(month?' · 缓存 '+month:'');
  if(status==='stale')return '历史缺月'+(month?' · 截至 '+month:'');
  return (status==='cache'?'缓存 · ':'')+'截至 '+month;
}
function renderDcaHistoryNote() {
  const el=$('dcaLabFreshNote'),h=HEALTH['定投回测'];if(!el||!h)return;
  const coverage=dcaHistoryCoverage(dcaLabMonths);
  el.textContent=[h.detail,'应覆盖至 '+coverage.expected,
    h.fetchedAt?'历史获取 '+cacheAge(h.fetchedAt):'获取时间未知',
    h.lastAttemptAt?'最近检查 '+cacheAge(h.lastAttemptAt):'尚未联网检查',
    h.lastError?'本次获取失败，保留已有历史':'只比较已结束的完整自然月'].join(' · ');
}

/* ========== 定投策略对照 DCA LAB ========== */
const DCALAB_CACHE_KEY="btc_dcalab_v25",DCALAB_TTL=6*3600*1000,DCALAB_WARMUP=200,DCAROLL_PERIODS=[24,36,48];
const DCALAB_DEFAULT_MULT=[4,1.5,.4,0];
const DCALAB_STARTS=[{v:"2021-11",n:"上轮牛顶"},{v:"2022-11",n:"上轮熊底"},{v:"2024-01",n:"ETF 获批"}];
let dcaLabMonths=[],dcaLabSource="",dcaLabLoading=false,dcaLabPlot=null,dcaRollPlot=null,dcaHoldingsPlot=null,dcaAhrPlot=null,dcaLabView="net",dcaLabResizeObserver=null;
function dcaLabParams(){
  const p=S.dcaLab||{},m=Array.isArray(p.mult)&&p.mult.length===4?p.mult:DCALAB_DEFAULT_MULT;
  return{monthly:Math.max(100,Math.min(1e6,Math.round(+p.monthly||2000))),start:DCALAB_STARTS.some(x=>x.v===p.start)?p.start:"2021-11",roll:DCAROLL_PERIODS.includes(+p.roll)?+p.roll:36,
    fx:Number.isFinite(+p.fx)&&+p.fx>0?+p.fx:Math.max(.01,+S.fx||7.1),feePct:Number.isFinite(+p.feePct)?Math.max(0,Math.min(5,+p.feePct)):0,
    mult:m.map(v=>Math.max(0,Math.min(10,+v||0)))};
}
function setDcaLabAssumptions(){
  const fx=Number($("dcaLabFx").value),feePct=Number($("dcaLabFee").value);
  if(!Number.isFinite(fx)||fx<=0||fx>100||!Number.isFinite(feePct)||feePct<0||feePct>5){ntf("汇率需大于 0，费用为 0–5%");return}
  S.dcaLab={...dcaLabParams(),fx,feePct};saveState();renderDcaLab();
}
function setDcaLabMonthly(){const el=$("dcaLabMonthly");if(!el)return;const v=Math.max(100,Math.min(1e6,Math.round(+el.value||2000)));el.value=v;S.dcaLab={...dcaLabParams(),monthly:v};saveState();renderDcaLab()}
function setDcaLabStart(v){if(!DCALAB_STARTS.some(x=>x.v===v))return;S.dcaLab={...dcaLabParams(),start:v};saveState();renderDcaLab()}
function setDcaRollMonths(v){v=+v;if(!DCAROLL_PERIODS.includes(v))return;S.dcaLab={...dcaLabParams(),roll:v};saveState();hideDcaRollTooltip();renderDcaLab()}
function setDcaLabMult(i,raw){const p=dcaLabParams(),mult=p.mult.slice();mult[i]=Math.max(0,Math.min(10,Math.round((+raw||0)*10)/10));S.dcaLab={...p,mult};saveState();renderDcaLab()}
function resetDcaLab(){S.dcaLab={monthly:2000,start:"2021-11",roll:36,mult:DCALAB_DEFAULT_MULT.slice()};saveState();renderDcaLab();ntf("已恢复回测默认参数")}
async function dcaLabFetchDaily(){const map=new Map();reviewNormalizeDaily(DAILY).forEach(r=>{if(r.time>0&&r.close>0)map.set(r.time,r.close)});let cursor=Date.UTC(2021,2,1),guard=0;while(guard++<5){const rows=await binanceFetch(`/api/v3/klines?symbol=BTCUSDT&interval=1d&startTime=${cursor}&limit=1000`,9000);if(!Array.isArray(rows)||!rows.length)throw Error("empty daily history");rows.forEach(k=>{const t=Math.floor(+k[0]/1000),c=+k[4];if(t>0&&c>0)map.set(t,c)});const lastOpen=+rows[rows.length-1][0];if(rows.length<1000||!(lastOpen>cursor)||lastOpen>=Date.now()-864e5)break;cursor=lastOpen+864e5}return[...map.entries()].map(([time,close])=>({time,close})).sort((a,b)=>a.time-b.time)}
function dcaLabBuildMonths(daily){
  if(!Array.isArray(daily))return[];
  const unique=new Map();daily.forEach(r=>{if(r&&Number.isFinite(r.time)&&r.time>0&&Number.isFinite(r.close)&&r.close>0&&r.time%86400===0)unique.set(r.time,r.close)});
  const rows=[...unique].sort((a,b)=>a[0]-b[0]).map(([time,close])=>({time,close})),out=[],GEN=Date.UTC(2009,0,3),today=Math.floor(Date.now()/864e5)*864e5;
  let inverse=0,signal=null;
  for(let i=0;i<rows.length;i++){
    const r=rows[i],ms=r.time*1000,day=new Date(ms).toISOString().slice(0,10),tomorrow=new Date(ms+864e5);
    // Previous day's observable signal; execution at completed month-end close.
    if(signal&&signal.time===r.time-86400&&tomorrow.getUTCDate()===1&&ms<today)
      out.push({m:day.slice(0,7),day,signalDay:signal.day,price:r.close,ahr:signal.ahr,ahrClassic:signal.ahrClassic,k:signal.k});
    inverse+=1/r.close;if(i>=DCALAB_WARMUP)inverse-=1/rows[i-DCALAB_WARMUP].close;
    signal=null;
    if(i<DCALAB_WARMUP-1||r.time-rows[i-DCALAB_WARMUP+1].time!==(DCALAB_WARMUP-1)*86400)continue;
    const hm=DCALAB_WARMUP/inverse,dg=Math.floor((ms-GEN)/864e5);if(!(hm>0&&dg>0))continue;
    const x=Math.log10(dg),ahr=r.close*r.close/(hm*Math.pow(10,AHR_A*x+AHR_B)),ahrClassic=r.close*r.close/(hm*Math.pow(10,AHR_A0*x+AHR_B0)),k=ahrShift(ms);
    if([ahr,ahrClassic,k].every(v=>Number.isFinite(v)&&v>0))signal={time:r.time,day,ahr,ahrClassic,k};
  }
  return out;
}
function dcaLabDate(day){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(day)))return null;
  const ts=Date.parse(day+"T00:00:00Z");return Number.isFinite(ts)&&new Date(ts).toISOString().slice(0,10)===day?ts:null;
}
function dcaLabValid(d){
  return !!(d&&d.schema===2&&Array.isArray(d.rows)&&d.rows.length>=24&&d.rows.every((r,i)=>{
    if(!r)return false;const at=dcaLabDate(r.day),signal=dcaLabDate(r.signalDay);
    return at!=null&&r.m===r.day.slice(0,7)&&signal===at-864e5&&new Date(at+864e5).getUTCDate()===1&&at<Date.now()&&
      [r.price,r.ahr,r.ahrClassic,r.k].every(v=>Number.isFinite(v)&&v>0)&&(i===0||r.m>d.rows[i-1].m);
  }));
}
function dcaLabReadCache(){try{const c=JSON.parse(localStorage.getItem(DCALAB_CACHE_KEY)||"null");return c&&dcaLabValid(c.data)?c:null}catch(e){return null}}
async function refreshDcaLab(force=false){
  if(dcaLabLoading)return;
  const cached=dcaLabReadCache(),cachedAt=+(cached?.ts)||0;
  if(!force&&cached&&cachedAt>0&&Date.now()>=cachedAt&&Date.now()-cachedAt<DCALAB_TTL&&dcaHistoryCoverage(cached.data.rows).complete){
    dcaLabMonths=cached.data.rows;dcaLabSource="cache";
    dcaPublishHealth({fetchedAt:cachedAt,error:HEALTH['定投回测']?.lastError||''});renderDcaLab();return;
  }
  if(!dcaLabMonths.length&&cached){dcaLabMonths=cached.data.rows;dcaLabSource="cache";dcaPublishHealth({fetchedAt:cachedAt});}
  dcaLabLoading=true;const attemptAt=Date.now();dcaPublishHealth({loading:true,attemptAt});setFresh("freshDcaLab","定投回测");renderDcaHistoryNote();
  try{
    const rows=dcaLabBuildMonths(await dcaLabFetchDaily()),data={schema:2,rows};
    if(!dcaLabValid(data)||!dcaHistoryCoverage(rows).complete)throw Error("incomplete monthly history");
    if(dcaLabMonths.length&&rows[0].m>dcaLabMonths[0].m)throw Error("history truncated");
    dcaLabMonths=rows;dcaLabSource="live";const fetchedAt=Date.now();
    try{localStorage.setItem(DCALAB_CACHE_KEY,JSON.stringify({ts:fetchedAt,data}));}catch(e){}
    dcaPublishHealth({fetchedAt,attemptAt});
    if(force)ntf("已核对完整月历史");
  }catch(e){
    dcaLabSource="cache";dcaPublishHealth({attemptAt,error:"历史获取失败或月份不完整"});
    if(force)ntf(dcaLabMonths.length?"更新失败，已保留原有历史":"历史暂不可用，请稍后重试");
  }finally{dcaLabLoading=false;renderDcaLab();renderFreshness();}
}
function dcaSmoothMultiplier(normalizedAhr){
  const x=Math.max(.05,+normalizedAhr||12),knots=[[.20,4],[.45,2],[1.20,1],[5,0]];if(x<=knots[0][0])return knots[0][1];if(x>=knots.at(-1)[0])return 0;
  for(let i=1;i<knots.length;i++)if(x<=knots[i][0]){const a=knots[i-1],b=knots[i],t=(Math.log(x)-Math.log(a[0]))/(Math.log(b[0])-Math.log(a[0]));return Math.max(0,Math.min(4,a[1]+(b[1]-a[1])*t))}return 0
}

function dcaLabSimulate(){const p=dcaLabParams();return dcaLabRunRows(dcaLabCompletedMonths().filter(r=>r.m>=p.start),p)}
function dcaLabCompletedMonths(){const n=new Date(),current=n.getUTCFullYear()+"-"+String(n.getUTCMonth()+1).padStart(2,"0");return dcaLabMonths.filter(r=>r.m<current)}
function dcaLabMonthSerial(m){const x=/^(\d{4})-(\d{2})$/.exec(String(m||""));return x?(+x[1])*12+(+x[2])-1:null}
function dcaRollMedian(values){const a=values.filter(Number.isFinite).sort((x,y)=>x-y),n=a.length;if(!n)return null;return n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2}
function dcaRollingResults(){
  const p=dcaLabParams(),months=dcaLabCompletedMonths(),periods=p.roll;if(months.length<periods)return null;const windows=[];let skipped=0;
  for(let i=0;i+periods<=months.length;i++){const slice=months.slice(i,i+periods),first=dcaLabMonthSerial(slice[0].m),lastSerial=dcaLabMonthSerial(slice.at(-1).m);if(first==null||lastSerial-first!==periods-1||slice.some((x,j)=>dcaLabMonthSerial(x.m)!==first+j)){skipped++;continue}const sim=dcaLabRunRows(slice,p);if(!sim)continue;const L=sim.last,excess=L.rB-L.rA;windows.push({start:sim.path[0].m,end:L.m,periods,excess,eqDiff:L.eqB-L.eqA,btcDiff:L.btcB-L.btcA,cash:L.cash,cashRate:L.cash/L.inv,ddDiff:sim.ddA.max-sim.ddB.max,retA:L.rA-1,retB:L.rB-1,ddA:sim.ddA.max,ddB:sim.ddB.max,win:excess>1e-10,tie:Math.abs(excess)<=1e-10})}
  if(!windows.length)return null;const wins=windows.filter(x=>x.win).length,ties=windows.filter(x=>x.tie).length,mean=key=>windows.reduce((s,x)=>s+x[key],0)/windows.length,rank=windows.slice().sort((a,b)=>a.excess-b.excess);
  return{p,periods,windows,skipped,wins,ties,winRate:wins/windows.length,medianExcess:dcaRollMedian(windows.map(x=>x.excess)),meanExcess:mean("excess"),medianBtcDiff:dcaRollMedian(windows.map(x=>x.btcDiff)),medianCashRate:dcaRollMedian(windows.map(x=>x.cashRate)),medianDdDiff:dcaRollMedian(windows.map(x=>x.ddDiff)),best:rank.at(-1),worst:rank[0]}
}

function dcaLabCny(v){return"¥"+Math.round(v).toLocaleString("zh-CN")}
function dcaLabPct(v,d){return(v>=0?"+":"−")+Math.abs(v*100).toFixed(d==null?1:d)+"%"}
function renderDcaLabStarts(){const box=$("dcaLabStarts");if(!box)return;const p=dcaLabParams(),first=dcaLabMonths.length?dcaLabMonths[0].m:"9999-99";box.innerHTML=DCALAB_STARTS.map(s=>`<option value="${s.v}"${s.v===p.start?" selected":""}${s.v<first?" disabled":""}>${s.v} ${s.n}</option>`).join("");box.value=p.start;box.onchange=()=>setDcaLabStart(box.value)}
function renderDcaLabCards(sim){const box=$("dcaLabCards"),delta=$("dcaLabDelta");if(!box)return;if(!sim){box.innerHTML="";if(delta)delta.hidden=true;return}const L=sim.last,ret=v=>`${v<1?"−":""}${Math.abs((v-1)*100).toFixed(1)}%`,card=(cls,name,tag,ratio,eq,btc,dd,cash,badge="")=>`<article class="dcaexp-kpi ${cls}"><div class="dcaexp-kpi-head"><span><i></i>${name}</span>${badge?`<em>${badge}</em>`:""}</div><b class="${ratio<1?"bad":""}">${ret(ratio)}</b><div class="dcaexp-kpi-balance"><strong>${btc.toFixed(4)} BTC</strong><span>资产 ${dcaLabCny(eq)}</span></div><div class="dcaexp-kpi-foot"><span>${tag}</span><span>回撤 −${(dd.max*100).toFixed(1)}%${cash>1?` · 现金 ${dcaLabCny(cash)}`:""}</span></div></article>`;
  box.innerHTML=card("uniform","平价 DCA","固定 1×",L.rA,L.eqA,L.btcA,sim.ddA,0)+card("classic","经典 AHR999","离散分区",L.rB,L.eqB,L.btcB,sim.ddB,L.cashB)+card("refit","新拟合 AHR999","2026 拟合",L.rC,L.eqC,L.btcC,sim.ddC,L.cashC,"校验")+card("smooth","连续加权","连续 0–4×",L.rD,L.eqD,L.btcD,sim.ddD,L.cashD)+`<article class="dcaexp-capital"><div><small>总承诺资金</small><b class="num">${dcaLabCny(L.inv)}</b></div><div class="dcaexp-capital-meta num"><strong>${sim.path.length} 个月 · 月基准 ${dcaLabCny(sim.p.monthly)}</strong><span>期末 BTC $${Math.round(L.price).toLocaleString("en-US")}</span></div></article>`;
  if(delta){const candidates=[{name:"AHR999 经典",eq:L.eqB,btc:L.btcB},{name:"新拟合 AHR999",eq:L.eqC,btc:L.btcC},{name:"连续加权",eq:L.eqD,btc:L.btcD}].sort((a,b)=>b.eq-a.eq),best=candidates[0],dM=best.eq-L.eqA,dB=best.btc-L.btcA;delta.hidden=false;delta.querySelector("p").innerHTML=`<span class="dcaexp-verdict-main">当前起点最佳 <b>${best.name}</b><em>较平价 ${dM>=0?"领先":"落后"} ${dcaLabCny(Math.abs(dM))}</em></span><span class="dcaexp-verdict-sub num">期末持币 ${dB>=0?"多":"少"} ${Math.abs(dB).toFixed(6)} BTC · 四种策略承诺资金同为 ${dcaLabCny(L.inv)}</span>`}}
function renderDcaLabAudit(sim){const el=$("dcaLabAudit");if(!el)return;if(!sim){el.innerHTML="";const rates=$("dcaLabRates");if(rates)rates.textContent="历史不足，暂不计算";return}const rates=$("dcaLabRates");if(rates)rates.textContent="实际日期年化 XIRR：平价 "+(sim.irrA==null?"不可计算":dcaLabPct(sim.irrA))+" · 经典 "+(sim.irrB==null?"不可计算":dcaLabPct(sim.irrB))+" · 新拟合 "+(sim.irrC==null?"不可计算":dcaLabPct(sim.irrC))+" · 连续 "+(sim.irrD==null?"不可计算":dcaLabPct(sim.irrD))+"。固定汇率 "+sim.fx+"，买入费率 "+sim.p.feePct+"%。";const L=sim.last,eps=.011,equalInv=Math.abs(L.inv-sim.p.monthly*sim.path.length)<eps,budgetB=Math.abs((sim.costB+L.cashB)-L.inv)<eps,budgetC=Math.abs((sim.costC+L.cashC)-L.inv)<eps,budgetD=Math.abs((sim.costD+L.cashD)-L.inv)<eps,equivalent=sim.path.every(x=>x.zi===x.ziRefit)&&Math.abs(L.eqB-L.eqC)<eps,cacheBytes=(()=>{try{return(localStorage.getItem(DCALAB_CACHE_KEY)||"").length}catch(e){return 0}})(),items=[[equalInv,"同承诺资金"],[budgetB&&budgetC&&budgetD,"三现金池守恒"],[equivalent,"经典/新拟合分区等价"],[cacheBytes<20000,cacheBytes?`缓存 ${(cacheBytes/1024).toFixed(1)}KB`:"缓存待建"]];el.innerHTML=items.map(([ok,t])=>`<span class="${ok?"good":"warn"}">${ok?"●":"•"} ${t}</span>`).join("")}
function renderDcaRolling(){
  const p=dcaLabParams(),completed=dcaLabCompletedMonths(),roll=dcaRollingResults(),cards=$("dcaRollCards"),verdict=$("dcaRollVerdict"),meta=$("dcaRollMeta"),table=$("dcaRollTable");
  document.querySelectorAll("[data-dcaroll-months]").forEach(b=>{const n=+b.dataset.dcarollMonths,on=n===p.roll;b.classList.toggle("active",on);b.setAttribute("aria-pressed",on?"true":"false");b.disabled=completed.length<n});
  if(!roll){if(cards)cards.innerHTML="";if(verdict)verdict.hidden=true;if(table)table.innerHTML="";if(meta)meta.textContent=`仅 ${completed.length} 个完整月 · 需要 ${p.roll} 个`;drawDcaRollChart();return}
  const tone=v=>v>1e-10?"var(--market-positive)":v<-.0000000001?"var(--market-negative)":"var(--text-primary)",stat=(name,value,note,color)=>`<article class="dcaroll-card"><small>${name}</small><b class="num" style="color:${color}">${value}</b><span>${note}</span></article>`;
  if(cards)cards.innerHTML=stat("AHR999 胜率",(roll.winRate*100).toFixed(1)+"%",`${roll.wins}/${roll.windows.length} 个起点 · 平局 ${roll.ties}`,tone(roll.winRate-.5))+stat("中位超额收益",dcaLabPct(roll.medianExcess),"经典累计收益率 − 平价累计收益率",tone(roll.medianExcess))+stat("平均超额收益",dcaLabPct(roll.meanExcess),"所有滚动起点平均",tone(roll.meanExcess))+stat("中位回撤改善",dcaLabPct(roll.medianDdDiff),roll.medianDdDiff>=0?"AHR999 回撤更小":"AHR999 回撤更大",tone(roll.medianDdDiff));
  if(verdict){let kind="",title="策略优势依赖起投时点";if(roll.winRate>=.6&&roll.medianExcess>0){kind="good";title="AHR999 加权跨起点占优"}else if(roll.winRate<=.4&&roll.medianExcess<0){kind="bad";title="均匀定投跨起点占优"}verdict.className=`dcaroll-verdict ${kind}`;verdict.hidden=false;verdict.querySelector("b").textContent=title;const btc=roll.medianBtcDiff,btcText=`${btc>=0?"多":"少"}持有 ${Math.abs(btc).toFixed(6)} BTC`;verdict.querySelector("span").textContent=`${roll.periods} 期窗口中，AHR999 策略中位数${btcText}，期末现金留存中位数 ${(roll.medianCashRate*100).toFixed(1)}%。现金能降低部分回撤，也可能形成上涨期拖累。`}
  const extreme=(name,x)=>`<article class="dcaroll-extreme"><small>${name}</small><b class="num">${x.start} → ${x.end}</b><span style="color:${tone(x.excess)}">${Math.abs(x.eqDiff)<.01?"资产持平":x.eqDiff>0?"多赚 "+dcaLabCny(x.eqDiff):"少赚 "+dcaLabCny(Math.abs(x.eqDiff))} · 超额 ${dcaLabPct(x.excess)}</span><span class="num">BTC ${x.btcDiff>=0?"+":"−"}${Math.abs(x.btcDiff).toFixed(6)} · 现金 ${(x.cashRate*100).toFixed(1)}%</span></article>`;
  if(table)table.innerHTML=extreme("最佳起投月份",roll.best)+extreme("最差起投月份",roll.worst);if(meta)meta.textContent=`${roll.windows.length} 个起点 · 每窗 ${roll.periods} 期 · 月预算 ${dcaLabCny(p.monthly)}${roll.skipped?" · 跳过 "+roll.skipped+" 个缺月窗口":""}`;drawDcaRollChart()
}
function drawDcaRollChart(){
  const canvas=$("dcaRollChart"),shell=$("dcaRollChartShell"),empty=$("dcaRollEmpty");if(!canvas||!shell)return;const roll=dcaRollingResults();if(!roll){if(empty)empty.classList.add("on");dcaRollPlot=null;return}if(empty)empty.classList.remove("on");
  const w=Math.max(280,shell.clientWidth),h=Math.max(220,shell.clientHeight),dpr=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);canvas.style.width=w+"px";canvas.style.height=h+"px";const ctx=canvas.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  const rows=roll.windows,n=rows.length,x0=48,x1=w-12,y0=15,y1=h-28,pw=x1-x0,ph=y1-y0,slot=pw/n,maxAbs=Math.max(.01,...rows.map(x=>Math.abs(x.excess)))*1.16,Y=v=>y0+(maxAbs-v)/(maxAbs*2)*ph,zero=Y(0),grid=cssv("--border-subtle")||"rgba(127,127,127,.18)",tx=cssv("--text-tertiary")||"#8e8e93",pos=cssv("--market-positive")||"#34c759",neg=cssv("--market-negative")||"#ff453a";
  ctx.font="11px system-ui,-apple-system,sans-serif";ctx.textBaseline="middle";for(let i=0;i<=4;i++){const v=maxAbs-i*maxAbs/2,yy=Y(v);ctx.strokeStyle=grid;ctx.beginPath();ctx.moveTo(x0,Math.round(yy)+.5);ctx.lineTo(x1,Math.round(yy)+.5);ctx.stroke();ctx.fillStyle=tx;ctx.textAlign="right";ctx.fillText((v>0?"+":"")+(v*100).toFixed(1)+"%",x0-6,yy)}
  const bw=Math.max(2,Math.min(16,slot*.68));rows.forEach((r,i)=>{const xx=x0+i*slot+(slot/2),yy=Y(r.excess);ctx.fillStyle=r.excess>=0?pos:neg;ctx.globalAlpha=(r===roll.best||r===roll.worst)?1:.68;ctx.fillRect(xx-bw/2,Math.min(yy,zero),bw,Math.max(1,Math.abs(zero-yy)))});ctx.globalAlpha=1;
  const ticks=w<430?3:5;ctx.textBaseline="bottom";for(let i=0;i<ticks;i++){const idx=Math.round(i/(ticks-1)*(n-1)),xx=x0+idx*slot+slot/2;ctx.fillStyle=tx;ctx.textAlign=i===0?"left":i===ticks-1?"right":"center";ctx.fillText(rows[idx].start.slice(2),xx,h-5)}ctx.textBaseline="middle";canvas.setAttribute("aria-label",`${roll.periods} 期 DCA 滚动回测超额收益分布，共 ${n} 个起点`);dcaRollPlot={roll,rows,x0,x1,slot,w}
}
function dcaRollTooltipAt(ev){if(!dcaRollPlot)return;const shell=$("dcaRollChartShell"),tip=$("dcaRollTooltip"),p=dcaRollPlot,rect=shell.getBoundingClientRect(),px=Math.max(p.x0,Math.min(p.x1-.001,ev.clientX-rect.left)),idx=Math.max(0,Math.min(p.rows.length-1,Math.floor((px-p.x0)/p.slot))),r=p.rows[idx],left=Math.max(7,Math.min(shell.clientWidth-190,p.x0+idx*p.slot+p.slot+6));tip.innerHTML=`<b>${r.start} → ${r.end}</b><div><span>超额收益</span><strong>${dcaLabPct(r.excess)}</strong></div><div><span>期末差额</span><strong>${r.eqDiff>=0?"+":"−"}${dcaLabCny(Math.abs(r.eqDiff))}</strong></div><div><span>回撤改善</span><strong>${dcaLabPct(r.ddDiff)}</strong></div><div><span>现金留存</span><strong>${(r.cashRate*100).toFixed(1)}%</strong></div>`;tip.style.left=left+"px";tip.style.top="10px";tip.classList.add("on");tip.setAttribute("aria-hidden","false")}
function hideDcaRollTooltip(){const t=$("dcaRollTooltip");if(t){t.classList.remove("on");t.setAttribute("aria-hidden","true")}}
function renderDcaLabRules(sim){const bar=$("dcaLabBar"),lbls=$("dcaLabLbls"),cur=$("dcaLabCursor"),box=$("dcaLabRules"),k=ahrShift(),edges=[.45*k,1.20*k,5.00*k];if(bar)bar.innerHTML=[35,43,62,38].map((f,i)=>`<div style="flex:${f};background:${cssv(ZONE_DEFS[i].v)}"></div>`).join("");if(lbls)lbls.innerHTML=ZONE_DEFS.map((z,i)=>`<span>${z.n} ${i===0?"&lt;"+edges[0].toFixed(2):i===3?"&gt;"+edges[2].toFixed(1):edges[i-1].toFixed(2)+"–"+edges[i].toFixed(i===2?1:2)}</span>`).join("");const v=+((S.ahr&&S.ahr.v)||0);if(cur&&v>0){const lg=(Math.log(Math.min(12*k,Math.max(.2*k,v)))-Math.log(.2*k))/(Math.log(12)-Math.log(.2))*100;cur.style.left=lg.toFixed(1)+"%"}if(!box)return;const p=dcaLabParams(),hits=[0,0,0,0];if(sim)sim.path.forEach(x=>hits[x.zi]++);box.innerHTML=ZONE_DEFS.map((z,i)=>`<div class="dcalab-rule"><i style="background:${cssv(z.v)}"></i><b>${z.n}</b><s>${i===0?"&lt; "+edges[0].toFixed(2):i===3?"≥ "+edges[2].toFixed(1):edges[i-1].toFixed(2)+" – "+edges[i].toFixed(i===2?1:2)}</s><em class="num">${hits[i]} 期</em><span class="dcalab-mult"><input type="number" min="0" max="10" step="0.1" inputmode="decimal" value="${p.mult[i]}" data-dcalab-mult="${i}" aria-label="${z.n}投入倍数" /><u>×</u></span></div>`).join("");box.querySelectorAll("[data-dcalab-mult]").forEach(el=>el.addEventListener("change",()=>setDcaLabMult(+el.dataset.dcalabMult,el.value)))}
function dcaLabColor(name,fallback){const sec=$("dcalab"),v=sec?getComputedStyle(sec).getPropertyValue(name).trim():"";return v||fallback}
function dcaLabChartSetup(canvas,shell,empty,minHeight=250){if(!canvas||!shell)return null;const sim=dcaLabSimulate();if(!sim){if(empty)empty.classList.add("on");return null}if(empty)empty.classList.remove("on");const w=Math.max(280,shell.clientWidth),h=Math.max(minHeight,shell.clientHeight),dpr=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);canvas.style.width=w+"px";canvas.style.height=h+"px";const ctx=canvas.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.font="11px system-ui,-apple-system,sans-serif";ctx.textBaseline="middle";return{sim,w,h,ctx}}
function dcaLabLine(ctx,rows,X,Y,key,color,width=1.8,dash=[]){ctx.save();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineJoin="round";ctx.lineCap="round";ctx.setLineDash(dash);ctx.beginPath();rows.forEach((r,i)=>{const v=typeof key==="function"?key(r):r[key],xx=X(i),yy=Y(v);i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy)});ctx.stroke();ctx.restore()}
function dcaLabXTicks(ctx,rows,X,w,h,color){const n=rows.length,t=w<430?3:5;ctx.textBaseline="bottom";for(let i=0;i<t;i++){const idx=Math.round(i/(t-1)*(n-1)),xx=X(idx);ctx.fillStyle=color;ctx.textAlign=i===0?"left":i===t-1?"right":"center";ctx.fillText(rows[idx].m,xx,h-5)}ctx.textBaseline="middle"}
function drawDcaHoldingsChart(){
  const canvas=$("dcaHoldingsChart"),shell=$("dcaHoldingsChartShell"),empty=$("dcaHoldingsEmpty"),base=dcaLabChartSetup(canvas,shell,empty,250);if(!base){dcaHoldingsPlot=null;return}const{sim,w,h,ctx}=base,rows=sim.path,n=rows.length,x0=50,x1=w-11,y0=17,y1=h-27,pw=x1-x0,ph=y1-y0,X=i=>x0+(n<2?0:i/(n-1)*pw),hi=Math.max(.0001,...rows.flatMap(r=>[r.btcA,r.btcB,r.btcC,r.btcD]))*1.10,Y=v=>y1-v/hi*ph,grid=cssv("--border-subtle")||"rgba(127,127,127,.18)",tx=cssv("--text-tertiary")||"#8e8e93";
  for(let i=0;i<=4;i++){const v=hi*(1-i/4),yy=Y(v);ctx.strokeStyle=grid;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x0,Math.round(yy)+.5);ctx.lineTo(x1,Math.round(yy)+.5);ctx.stroke();ctx.fillStyle=tx;ctx.textAlign="right";ctx.fillText(v.toFixed(v<1?2:1),x0-6,yy)}
  dcaLabLine(ctx,rows,X,Y,"btcA",dcaLabColor("--dca-uniform","#3b82f6"),1.8);dcaLabLine(ctx,rows,X,Y,"btcB",dcaLabColor("--dca-classic","#ef6b35"),2.2);dcaLabLine(ctx,rows,X,Y,"btcC",dcaLabColor("--dca-refit","#9a7cff"),1.5,[5,3]);dcaLabLine(ctx,rows,X,Y,"btcD",dcaLabColor("--dca-smooth","#16b887"),2);dcaLabXTicks(ctx,rows,X,w,h,tx);dcaHoldingsPlot={sim,rows,x0,x1,pw,X};canvas.setAttribute("aria-label",`${rows[0].m} 至 ${rows.at(-1).m} 四种定投策略累计持币量曲线`);const meta=$("dcaHoldingsMeta");if(meta)meta.textContent=`${rows[0].m} → ${rows.at(-1).m} · ${n} 个月`
}
function drawDcaAhrChart(){
  const canvas=$("dcaAhrChart"),shell=$("dcaAhrChartShell"),empty=$("dcaAhrEmpty"),base=dcaLabChartSetup(canvas,shell,empty,250);if(!base){dcaAhrPlot=null;return}const{sim,w,h,ctx}=base,rows=sim.path,n=rows.length,x0=48,x1=w-11,y0=17,y1=h-27,pw=x1-x0,ph=y1-y0,X=i=>x0+(n<2?0:i/(n-1)*pw),hi=Math.max(1.35,...rows.flatMap(r=>[r.ahrClassic,r.ahrRefit,1.2*r.k]))*1.10,Y=v=>y1-v/hi*ph,grid=cssv("--border-subtle")||"rgba(127,127,127,.18)",tx=cssv("--text-tertiary")||"#8e8e93";
  for(let i=0;i<=4;i++){const v=hi*(1-i/4),yy=Y(v);ctx.strokeStyle=grid;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x0,Math.round(yy)+.5);ctx.lineTo(x1,Math.round(yy)+.5);ctx.stroke();ctx.fillStyle=tx;ctx.textAlign="right";ctx.fillText(v.toFixed(1),x0-6,yy)}
  const horizontal=(v,dash)=>{ctx.save();ctx.strokeStyle=dcaLabColor("--dca-classic","#ef6b35");ctx.globalAlpha=.55;ctx.setLineDash(dash);ctx.beginPath();ctx.moveTo(x0,Y(v));ctx.lineTo(x1,Y(v));ctx.stroke();ctx.restore()};horizontal(.45,[5,4]);horizontal(1.20,[5,4]);dcaLabLine(ctx,rows,X,Y,r=>.45*r.k,dcaLabColor("--dca-refit","#9a7cff"),1,[2,4]);dcaLabLine(ctx,rows,X,Y,r=>1.20*r.k,dcaLabColor("--dca-refit","#9a7cff"),1,[2,4]);dcaLabLine(ctx,rows,X,Y,"ahrClassic",dcaLabColor("--dca-classic","#ef6b35"),2);dcaLabLine(ctx,rows,X,Y,"ahrRefit",dcaLabColor("--dca-refit","#9a7cff"),2);dcaLabXTicks(ctx,rows,X,w,h,tx);dcaAhrPlot={sim,rows,x0,x1,pw,X};canvas.setAttribute("aria-label",`${rows[0].m} 至 ${rows.at(-1).m} AHR999 经典与新拟合指数曲线`);const L=rows.at(-1),meta=$("dcaAhrChartMeta");if(meta)meta.textContent=`经典 ${L.ahrClassic.toFixed(3)} · 新拟合 ${L.ahrRefit.toFixed(3)} · shift ×${L.k.toFixed(3)}`
}
function dcaHoldingsTooltipAt(ev){if(!dcaHoldingsPlot)return;const shell=$("dcaHoldingsChartShell"),tip=$("dcaHoldingsTooltip"),p=dcaHoldingsPlot,rect=shell.getBoundingClientRect(),px=Math.max(p.x0,Math.min(p.x1,ev.clientX-rect.left)),idx=Math.max(0,Math.min(p.rows.length-1,Math.round((px-p.x0)/p.pw*(p.rows.length-1)))),r=p.rows[idx],left=Math.max(7,Math.min(shell.clientWidth-195,p.X(idx)+12));tip.innerHTML=`<b>${r.m} · BTC $${Math.round(r.price).toLocaleString("en-US")}</b><div><span>平价 DCA</span><strong>${r.btcA.toFixed(4)}</strong></div><div><span>AHR999 经典</span><strong>${r.btcB.toFixed(4)}</strong></div><div><span>新拟合</span><strong>${r.btcC.toFixed(4)}</strong></div><div><span>连续加权</span><strong>${r.btcD.toFixed(4)}</strong></div>`;tip.style.left=left+"px";tip.style.top="10px";tip.classList.add("on");tip.setAttribute("aria-hidden","false")}
function dcaAhrTooltipAt(ev){if(!dcaAhrPlot)return;const shell=$("dcaAhrChartShell"),tip=$("dcaAhrTooltip"),p=dcaAhrPlot,rect=shell.getBoundingClientRect(),px=Math.max(p.x0,Math.min(p.x1,ev.clientX-rect.left)),idx=Math.max(0,Math.min(p.rows.length-1,Math.round((px-p.x0)/p.pw*(p.rows.length-1)))),r=p.rows[idx],left=Math.max(7,Math.min(shell.clientWidth-202,p.X(idx)+12));tip.innerHTML=`<b>${r.m} · BTC $${Math.round(r.price).toLocaleString("en-US")}</b><div><span>经典值</span><strong>${r.ahrClassic.toFixed(3)}</strong></div><div><span>新拟合值</span><strong>${r.ahrRefit.toFixed(3)}</strong></div><div><span>新拟合边界</span><strong>${(.45*r.k).toFixed(3)} / ${(1.2*r.k).toFixed(3)}</strong></div><div><span>连续倍数</span><strong>${r.smoothMult.toFixed(2)}×</strong></div>`;tip.style.left=left+"px";tip.style.top="10px";tip.classList.add("on");tip.setAttribute("aria-hidden","false")}
function hideDcaHoldingsTooltip(){const t=$("dcaHoldingsTooltip");if(t){t.classList.remove("on");t.setAttribute("aria-hidden","true")}}
function hideDcaAhrTooltip(){const t=$("dcaAhrTooltip");if(t){t.classList.remove("on");t.setAttribute("aria-hidden","true")}}
function renderDcaLabLegend(){const el=$("dcaLabLegend");if(!el)return;const item=(color,name)=>`<span class="legend-item" style="color:${color}"><i class="legend-swatch"></i>${name}</span>`;el.innerHTML=item("var(--dca-uniform)","平价 DCA")+item("var(--dca-classic)","AHR999 经典")+item("var(--dca-refit)","新拟合")+item("var(--dca-smooth)","连续加权")+(dcaLabView==="net"?`<span class="legend-item" style="color:var(--text-tertiary)">虚线 起始净值 1.00×</span>`:dcaLabView==="buy"?`<span class="legend-item" style="color:var(--text-tertiary)">虚线 月基准</span>`:"")}
function renderDcaLab(){const sec=$("dcalab");if(!sec)return;const monthlyEl=$("dcaLabMonthly"),p=dcaLabParams();for(const [id,v] of [["dcaLabFx",p.fx],["dcaLabFee",p.feePct]]){const el=$(id);if(el&&document.activeElement!==el)el.value=v}if(monthlyEl&&document.activeElement!==monthlyEl)monthlyEl.value=p.monthly;renderDcaLabStarts();const sim=dcaLabSimulate();renderDcaLabCards(sim);renderDcaLabAudit(sim);renderDcaRolling();renderDcaLabRules(sim);renderDcaLabLegend();const live=$("dcaLabChartLive"),badge=$("freshDcaLab");if(live)live.textContent=sim?`${sim.path[0].m} 起 · ${sim.path.length} 期 · 承诺 ${dcaLabCny(sim.last.inv)}`:"历史不足 · 无法回测";setFresh("freshDcaLab","定投回测");renderDcaHistoryNote();drawDcaHoldingsChart();drawDcaAhrChart();drawDcaLabDetailChart()}
function hideDcaLabTooltip(){const t=$("dcaLabTooltip");if(t){t.classList.remove("on");t.setAttribute("aria-hidden","true")}}
function drawDcaLabDetailChart(){
  const canvas=$("dcaLabChart"),shell=$("dcaLabChartShell"),empty=$("dcaLabEmpty"),base=dcaLabChartSetup(canvas,shell,empty,240);if(!base){dcaLabPlot=null;return}const{sim,w,h,ctx}=base,rows=sim.path,n=rows.length,x0=54,x1=w-12,y0=16,y1=h-26,pw=x1-x0,ph=y1-y0,grid=cssv("--border-subtle")||"rgba(127,127,127,.18)",tx=cssv("--text-tertiary")||"#8e8e93",colors={A:dcaLabColor("--dca-uniform","#3b82f6"),B:dcaLabColor("--dca-classic","#ef6b35"),C:dcaLabColor("--dca-refit","#9a7cff"),D:dcaLabColor("--dca-smooth","#16b887")};let slot=0,X;if(dcaLabView==="buy"){slot=pw/n;X=i=>x0+i*slot+slot/2}else X=i=>x0+(n<2?0:i/(n-1)*pw);
  const hline=(yy,label)=>{ctx.strokeStyle=grid;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x0,Math.round(yy)+.5);ctx.lineTo(x1,Math.round(yy)+.5);ctx.stroke();ctx.fillStyle=tx;ctx.textAlign="right";ctx.fillText(label,x0-6,yy)},dash=(yy,color)=>{ctx.save();ctx.strokeStyle=color;ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(x0,yy);ctx.lineTo(x1,yy);ctx.stroke();ctx.restore()};
  if(dcaLabView==="net"){const vals=rows.flatMap(r=>[r.navA,r.navB,r.navC,r.navD]).concat(1);let lo=Math.min(...vals),hi=Math.max(...vals),pad=(hi-lo)*.12||.1;lo=Math.max(0,lo-pad);hi+=pad;const Y=v=>y1-(v-lo)/(hi-lo)*ph;for(let i=0;i<=4;i++){const v=hi-(hi-lo)*i/4;hline(Y(v),v.toFixed(2)+"×")}if(lo<1&&hi>1)dash(Y(1),tx);dcaLabLine(ctx,rows,X,Y,"navA",colors.A,1.7);dcaLabLine(ctx,rows,X,Y,"navB",colors.B,2.1);dcaLabLine(ctx,rows,X,Y,"navC",colors.C,1.5,[5,3]);dcaLabLine(ctx,rows,X,Y,"navD",colors.D,2)}
  else if(dcaLabView==="dd"){const hi=Math.max(sim.ddA.max,sim.ddB.max,sim.ddC.max,sim.ddD.max,.05)*1.14,Y=v=>y0+v/hi*ph;for(let i=0;i<=4;i++){const v=hi*i/4;hline(Y(v),v===0?"0%":"−"+(v*100).toFixed(0)+"%")}const arr=(a,color,width,d=[])=>{ctx.save();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineJoin="round";ctx.lineCap="round";ctx.setLineDash(d);ctx.beginPath();a.forEach((v,i)=>{const xx=X(i),yy=Y(v);i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy)});ctx.stroke();ctx.restore()};arr(sim.ddA.s,colors.A,1.7);arr(sim.ddB.s,colors.B,2.1);arr(sim.ddC.s,colors.C,1.5,[5,3]);arr(sim.ddD.s,colors.D,2)}
  else{const hi=Math.max(sim.p.monthly,...rows.flatMap(r=>[r.spendB,r.spendC,r.spendD]))*1.12,Y=v=>y1-v/hi*ph,bw=Math.max(2,Math.min(12,slot*.54));for(let i=0;i<=4;i++){const v=hi*(1-i/4);hline(Y(v),"¥"+Math.round(v).toLocaleString("en-US"))}dash(Y(sim.p.monthly),colors.A);rows.forEach((r,i)=>{const xx=X(i),yb=Y(r.spendB),yd=Y(r.spendD);ctx.save();ctx.globalAlpha=.58;ctx.fillStyle=colors.B;ctx.fillRect(xx-bw,Math.min(yb,y1),bw,Math.max(0,y1-yb));ctx.restore();ctx.strokeStyle=colors.C;ctx.lineWidth=1;ctx.strokeRect(xx-bw+.5,Math.min(yb,y1)+.5,Math.max(1,bw-1),Math.max(0,y1-yb-1));ctx.fillStyle=colors.D;ctx.fillRect(xx+1,Math.min(yd,y1),bw,Math.max(0,y1-yd))})}
  dcaLabXTicks(ctx,rows,X,w,h,tx);dcaLabPlot={sim,rows,x0,x1,pw,X,view:dcaLabView};canvas.setAttribute("aria-label",`${rows[0].m} 至 ${rows.at(-1).m} 四种定投策略${dcaLabView==="net"?"净值":dcaLabView==="dd"?"回撤":"每期投入"}图表`)
}
function dcaLabDetailTooltipAt(ev){if(!dcaLabPlot)return;const shell=$("dcaLabChartShell"),tip=$("dcaLabTooltip"),p=dcaLabPlot,rect=shell.getBoundingClientRect(),px=Math.max(p.x0,Math.min(p.x1,ev.clientX-rect.left)),idx=Math.max(0,Math.min(p.rows.length-1,Math.round((px-p.x0)/p.pw*(p.rows.length-1)))),r=p.rows[idx],left=Math.max(7,Math.min(shell.clientWidth-205,p.X(idx)+12));let body;if(p.view==="buy")body=`<div><span>月基准</span><strong>${dcaLabCny(p.sim.p.monthly)}</strong></div><div><span>经典 / 新拟合</span><strong>${dcaLabCny(r.spendB)} / ${dcaLabCny(r.spendC)}</strong></div><div><span>连续加权</span><strong>${dcaLabCny(r.spendD)} · ${r.smoothMult.toFixed(2)}×</strong></div>`;else if(p.view==="dd")body=`<div><span>平价</span><strong>−${(p.sim.ddA.s[idx]*100).toFixed(1)}%</strong></div><div><span>经典 / 新拟合</span><strong>−${(p.sim.ddB.s[idx]*100).toFixed(1)}% / −${(p.sim.ddC.s[idx]*100).toFixed(1)}%</strong></div><div><span>连续</span><strong>−${(p.sim.ddD.s[idx]*100).toFixed(1)}%</strong></div>`;else body=`<div><span>平价</span><strong>${r.navA.toFixed(3)}×</strong></div><div><span>经典 / 新拟合</span><strong>${r.navB.toFixed(3)}× / ${r.navC.toFixed(3)}×</strong></div><div><span>连续</span><strong>${r.navD.toFixed(3)}×</strong></div>`;tip.innerHTML=`<b>${r.m} · BTC $${Math.round(r.price).toLocaleString("en-US")}</b>${body}`;tip.style.left=left+"px";tip.style.top="12px";tip.classList.add("on");tip.setAttribute("aria-hidden","false")}
function initDcaLab(){
  const section=$("dcalab");if(!section||section.dataset.ready)return;section.dataset.ready="1";const cached=dcaLabReadCache();if(cached){dcaLabMonths=cached.data.rows;dcaLabSource="cache";dcaPublishHealth({fetchedAt:Math.min(Date.now(),+cached.ts||0)})}
  section.querySelectorAll("[data-dcalab-view]").forEach(btn=>btn.addEventListener("click",()=>{dcaLabView=btn.dataset.dcalabView;section.querySelectorAll("[data-dcalab-view]").forEach(x=>{const on=x===btn;x.classList.toggle("active",on);x.setAttribute("aria-pressed",on?"true":"false")});hideDcaLabTooltip();renderDcaLabLegend();drawDcaLabDetailChart()}));section.querySelectorAll("[data-dcaroll-months]").forEach(btn=>btn.addEventListener("click",()=>setDcaRollMonths(btn.dataset.dcarollMonths)));
  const bind=(id,move,hide)=>{const c=$(id);if(!c)return;c.addEventListener("pointermove",move,{passive:true});c.addEventListener("pointerdown",move,{passive:true});c.addEventListener("pointerleave",hide,{passive:true})};bind("dcaHoldingsChart",dcaHoldingsTooltipAt,hideDcaHoldingsTooltip);bind("dcaAhrChart",dcaAhrTooltipAt,hideDcaAhrTooltip);bind("dcaLabChart",dcaLabDetailTooltipAt,hideDcaLabTooltip);bind("dcaRollChart",dcaRollTooltipAt,hideDcaRollTooltip);
  const redraw=()=>requestAnimationFrame(()=>{drawDcaHoldingsChart();drawDcaAhrChart();drawDcaLabDetailChart();drawDcaRollChart()});["dcaDetailPanel","dcaRollingPanel"].forEach(id=>{const d=$(id);if(d)d.addEventListener("toggle",()=>{if(d.open)redraw()})});if("ResizeObserver"in window){dcaLabResizeObserver=new ResizeObserver(redraw);["dcaHoldingsChartShell","dcaAhrChartShell","dcaLabChartShell","dcaRollChartShell"].forEach(id=>{const el=$(id);if(el)dcaLabResizeObserver.observe(el)})}else window.addEventListener("resize",redraw,{passive:true});renderDcaLab();refreshDcaLab(false)
}

/* Read-only review of dated purchases. Never writes the ledger or holdings. */
const REVIEW_HISTORY_KEY='btc_personal_review_daily_v1';
const REVIEW_HISTORY={rows:[],fetchedAt:0,busy:false,error:''};
const REVIEW_OPTIONS={fx:null,feePct:0};
function reviewSettings(){return{fx:REVIEW_OPTIONS.fx??Math.max(.01,+S.fx||7.1),feePct:REVIEW_OPTIONS.feePct};}
function reviewNormalizeDaily(input,now=Date.now()){
  const today=Math.floor(now/864e5)*86400,map=new Map(),conflicts=new Set();
  for(const r of Array.isArray(input)?input:[]){const raw=Array.isArray(r)?+r[0]:+r?.time,t=raw>1e12?raw/1000:raw,p=Array.isArray(r)?+r[4]:+r?.close;
    if(!(t>0&&t<today&&t%86400===0&&Number.isFinite(p)&&p>0))continue;
    if(map.has(t)&&map.get(t)!==p)conflicts.add(t);else map.set(t,p);
  }
  return [...map].filter(([t])=>!conflicts.has(t)).sort((a,b)=>a[0]-b[0]).map(([time,close])=>({time,close}));
}
function reviewSignals(rows){
  const result=new Map();let inverse=0;
  rows.forEach((r,i)=>{inverse+=1/r.close;if(i>=200)inverse-=1/rows[i-200].close;
    if(i<199||r.time-rows[i-199].time!==199*86400)return;
    const days=ahrCoinDays(r.time*1000),value=r.close*r.close*inverse/200/Math.pow(10,AHR_A0*Math.log10(days)+AHR_B0);
    if(Number.isFinite(value)&&value>0)result.set(r.time,value);
  });return result;
}
function reviewMultiplier(v){return v<.45?4:v<1.2?1.5:v<5?.4:0;}
function reviewLedgerSnapshot(){
  const candidates=[];
  try{const raw=JSON.parse(localStorage.getItem(DCA_LEDGER_KEY)||'null');if(raw&&typeof raw==='object')candidates.push(raw);}catch(e){}
  if(S.dcaLedger&&typeof S.dcaLedger==='object')candidates.push(S.dcaLedger);
  const raw=candidates.sort((a,b)=>(+b.updatedAt||0)-(+a.updatedAt||0))[0];
  if(!raw)return null;
  const state=dcaLedgerSanitize(raw);if(!dcaLedgerHasData(state))return null;
  const funds=state.baseline.btc>0||state.baseline.usdt>0||state.baseline.usdc>0||state.baseline.totalCny>0;
  const baseAt=dcaLabDate(raw.baseline?.at);
  const initialRate=+(raw.baseline?.legacyRate||raw.baseline?.cnyRate||raw.settings?.defaultRate);
  const invalid=!Array.isArray(raw.orders)||(raw.orders||[]).some(r=>!r||!r.id||!['btc','c2c'].includes(r.type)||!['USDT','USDC'].includes(r.coin))||
    ((state.baseline.usdt>0||state.baseline.usdc>0)&&!(Number.isFinite(initialRate)&&initialRate>0))||
    (funds&&(baseAt==null||state.orders.some(r=>r.at<baseAt)));
  return{state,derived:deriveDcaLedger(state),invalid};
}
function reviewReadPurchases(fx=reviewSettings().fx,now=Date.now()){
  const ledger=reviewLedgerSnapshot(),rows=[],excluded=[],today=Math.floor(now/864e5)*864e5;
  const input=ledger?ledger.state.orders.filter(r=>r.type==='btc'):(Array.isArray(S.log)?S.log:[]).filter(r=>!r?.dcaLedgerId&&r?.source!=='dca-ledger');
  const ids=new Map();input.forEach((r,i)=>{const id=String(ledger?r.id:r?.v25Id||'row-'+i);ids.set(id,(ids.get(id)||0)+1);});
  const baseline=ledger?+ledger.state.baseline.btc||0:Math.max(0,(+S.hd?.d||0)-input.reduce((s,r)=>s+(+r?.b||0),0));
  let costIssue=!!ledger?.invalid;
  if(ledger){
    const pool={USDT:+ledger.state.baseline.usdt||0,USDC:+ledger.state.baseline.usdc||0};
    [...ledger.state.orders].sort((a,b)=>a.at-b.at).forEach(r=>{
      if(!(Number.isFinite(r.at)&&r.at>0&&r.at<=now))costIssue=true;
      if(r.type==='c2c'){if(!(r.stable>0&&r.cny>0))costIssue=true;pool[r.coin]+=r.stable;}
      else{if(pool[r.coin]+1e-8<r.spent)costIssue=true;pool[r.coin]-=r.spent;}
    });
    if(new Set(ledger.state.orders.map(r=>r.id)).size!==ledger.state.orders.length)costIssue=true;
  }
  input.forEach((r,i)=>{
    const id=String(ledger?r.id:r?.v25Id||'row-'+i),ts=+(ledger?r.at:r?.ts),btc=+(ledger?r.btc:r?.b);
    const allocation=ledger?ledger.derived.alloc.get(r.id):null,cny=ledger?+allocation?.cny:+r?.a;
    const rate=ledger?r.spent>0?cny/r.spent:NaN:fx;
    let reason='';
    if(ids.get(id)>1)reason='重复记录标识';
    else if(!(Number.isFinite(ts)&&ts>0&&ts<=now))reason='成交时间缺失或异常';
    else if(ts>=today)reason='当日尚未收盘';
    else if(![btc,cny,rate].every(v=>Number.isFinite(v)&&v>0))reason='金额、数量或汇率缺失';
    if(reason){excluded.push({id,reason});return;}
    rows.push({id,ts,day:Math.floor(ts/864e5)*86400,btc,cny,fx:rate});
  });
  rows.sort((a,b)=>a.ts-b.ts);
  return{rows,excluded,baseline,costIssue,source:ledger?'完整账本':'轻量记录',usesLedger:!!ledger,total:input.length};
}
function reviewCompare(source,daily,options=reviewSettings()){
  const rows=source.rows||[],history=reviewNormalizeDaily(daily),prices=new Map(history.map(r=>[r.time,r.close])),signals=reviewSignals(history);
  const total=rows.reduce((s,r)=>s+r.cny,0),actualBtc=rows.reduce((s,r)=>s+r.btc,0);
  const result={source,total,actualBtc,avgCny:actualBtc>0?total/actualBtc:null,ordinary:null,ahr:null,missingPrices:[],missingSignals:[],end:history.at(-1)||null};
  if(!rows.length)return result;
  for(const r of rows){if(!prices.has(r.day))result.missingPrices.push(r.day);if(!signals.has(r.day-86400))result.missingSignals.push(r.day);}
  if(source.costIssue||result.missingPrices.length||!Number.isFinite(options.fx)||!(options.fx>0&&options.fx<=100)||!Number.isFinite(options.feePct)||!(options.feePct>=0&&options.feePct<=5))return result;
  let ordinary=0,ahrBtc=0,cash=0;
  const path=[];
  for(const r of rows){
    const close=prices.get(r.day),q=r.cny*(1-options.feePct/100)/r.fx/close;
    ordinary+=q;
    if(!result.missingSignals.length){
      cash+=r.cny;const spend=Math.min(cash,r.cny*reviewMultiplier(signals.get(r.day-86400)));
      ahrBtc+=spend*(1-options.feePct/100)/r.fx/close;cash-=spend;
    }
    path.push({day:r.day,cny:r.cny,actual:r.btc,ordinary:q});
  }
  result.ordinary={btc:ordinary,cash:0};
  if(!result.missingSignals.length)result.ahr={btc:ahrBtc,cash};
  result.path=path;
  if(result.end){const value=btc=>btc*result.end.close*options.fx;
    result.actualValue=value(actualBtc);result.ordinary.value=value(ordinary);
    if(result.ahr)result.ahr.value=value(ahrBtc)+cash;
  }
  return result;
}
function reviewAvailableHistory(){
  const merged=new Map(REVIEW_HISTORY.rows.map(r=>[r.time,r]));
  // The normal, more recent market fetch may correct a previously cached close.
  // Read raw closes: normalizedDaily() may substitute a current/manual quote.
  reviewNormalizeDaily(DAILY).forEach(r=>{if(!merged.has(r.time)||lastFullAt>REVIEW_HISTORY.fetchedAt)merged.set(r.time,r);});
  return reviewNormalizeDaily([...merged.values()]);
}
function reviewLoadHistory(){
  if(REVIEW_HISTORY.rows.length)return;
  try{const c=JSON.parse(localStorage.getItem(REVIEW_HISTORY_KEY)||'null');if(c?.schema===1){REVIEW_HISTORY.rows=reviewNormalizeDaily(c.rows);REVIEW_HISTORY.fetchedAt=+c.ts||0;}}catch(e){}
}
async function refreshPersonalReview(){
  if(REVIEW_HISTORY.busy)return;
  const source=reviewReadPurchases();if(!source.rows.length){renderPersonalReview();return;}
  REVIEW_HISTORY.busy=true;REVIEW_HISTORY.error='';renderPersonalReview();
  try{
    const end=Math.floor(Date.now()/864e5)*864e5-1;
    let cursor=Math.max(Date.UTC(2017,7,17),source.rows[0].day*1000-200*864e5),pages=0;
    const collected=[];
    while(cursor<end&&pages++<12){
      const batch=await binanceFetch(`/api/v3/klines?symbol=BTCUSDT&interval=1d&startTime=${cursor}&endTime=${end}&limit=1000`,9000);
      if(!Array.isArray(batch))throw Error('history');
      if(!batch.length)break;
      const clean=reviewNormalizeDaily(batch.map(r=>({time:+r[0]/1000,close:+r[4]})));
      if(!clean.length)throw Error('invalid history');collected.push(...clean);
      const next=clean.at(-1).time*1000+864e5;if(next<=cursor)throw Error('history did not advance');
      cursor=next;if(batch.length<1000)break;
    }
    if(!collected.length)throw Error('empty history');
    const merged=new Map(reviewAvailableHistory().map(r=>[r.time,r]));collected.forEach(r=>merged.set(r.time,r));
    REVIEW_HISTORY.rows=reviewNormalizeDaily([...merged.values()]);REVIEW_HISTORY.fetchedAt=Date.now();
    try{localStorage.setItem(REVIEW_HISTORY_KEY,JSON.stringify({schema:1,ts:REVIEW_HISTORY.fetchedAt,rows:REVIEW_HISTORY.rows}));}catch(e){REVIEW_HISTORY.error='历史可用，但未能保存缓存';}
  }catch(e){REVIEW_HISTORY.error='历史获取失败；已有数据保留，不补造缺失价格';}
  finally{REVIEW_HISTORY.busy=false;renderPersonalReview();}
}
function setPersonalReviewOptions(){
  const fx=+$('personalReviewFx').value,fee=+$('personalReviewFee').value;
  if(!(Number.isFinite(fx)&&fx>0&&fx<=100&&Number.isFinite(fee)&&fee>=0&&fee<=5)){ntf('汇率需在 0–100 之间，参考费率为 0–5%');return;}
  REVIEW_OPTIONS.fx=fx;REVIEW_OPTIONS.feePct=fee;renderPersonalReview();
}
function renderPersonalReview(){
  const panel=$('personalReview'),box=$('personalReviewContent');if(!panel||!box||!panel.open)return;
  reviewLoadHistory();const options=reviewSettings(),source=reviewReadPurchases(options.fx),r=reviewCompare(source,reviewAvailableHistory(),options);
  const refresh=$('personalReviewRefresh');if(refresh){refresh.disabled=REVIEW_HISTORY.busy;refresh.textContent=REVIEW_HISTORY.busy?'更新中':'更新历史';}
  for(const [id,value] of [['personalReviewFx',options.fx],['personalReviewFee',options.feePct]]){const el=$(id);if(el&&el!==document.activeElement)el.value=value;}
  const money=n=>'¥'+Math.round(n).toLocaleString('zh-CN'),btc=n=>n.toFixed(6)+' BTC',day=n=>new Date(n*1000).toISOString().slice(0,10);
  const messages=[`${source.source} · 纳入 ${source.rows.length}/${source.total} 笔已收盘记录`];
  if(source.baseline>0)messages.push(`历史基线 ${btc(source.baseline)} 不参与比较`);
  if(source.excluded.length){const groups={};source.excluded.forEach(x=>groups[x.reason]=(groups[x.reason]||0)+1);messages.push(Object.entries(groups).map(([k,v])=>`${k} ${v} 笔`).join('；'));}
  if(source.costIssue)messages.push('完整账本存在缺项、资金来源或基线日期异常，暂停成本与参考组计算，请先核对原账本');
  if(REVIEW_HISTORY.error)messages.push(REVIEW_HISTORY.error);
  if(r.missingPrices.length)messages.push(`${new Set(r.missingPrices).size} 个成交日缺少收盘价，暂停所有参考组计算`);
  else if(r.missingSignals.length)messages.push(`${new Set(r.missingSignals).size} 个成交日前缺少连续 200 日历史，AHR999 参考暂不计算`);
  $('personalReviewCoverage').textContent=messages.join(' · ');
  if(!source.rows.length){box.innerHTML='<p class="data-note">暂无可复盘的已收盘买入记录。请先在原账本记录真实成交日期、投入金额和 BTC 数量；这里不会补造历史。</p>';return;}
  const card=(name,value,detail)=>`<article class="hold"><div class="hold-lbl">${name}</div><b class="review-value num">${value}</b><p class="data-note">${detail}</p></article>`;
  const extra=b=>`${r.actualBtc>=b?'多':'少'} ${Math.round(Math.abs(r.actualBtc-b)*1e8).toLocaleString('zh-CN')} sats`;
  box.innerHTML='<div class="review-grid">'+
    card('实际已记录买入',btc(r.actualBtc),source.costIssue?'成本待核对，不展示估算为真实成本':`成本 ${money(r.total)} · ${money(r.avgCny)}/BTC`)+
    card('同日普通买入参考',r.ordinary?btc(r.ordinary.btc):source.costIssue?'账本待核对':'等待历史',r.ordinary?`实际比参考${extra(r.ordinary.btc)} · 参考现金 ¥0`:'相同日期、相同每笔金额，按当日收盘价计算')+
    card('AHR999 经典参考',r.ahr?btc(r.ahr.btc):'暂不可比',r.ahr?`参考剩余现金 ${money(r.ahr.cash)} · 仅使用此前已知信号`:'前一日信号决定本次倍数；历史不足不计算')+'</div>'+
    (r.ordinary?`<p class="data-note">参考估值日 ${day(r.end.time)} · 估值汇率 ${options.fx}：实际所买 BTC ${money(r.actualValue)}，普通参考 ${money(r.ordinary.value)}${r.ahr?'，AHR999 参考（含现金）'+money(r.ahr.value):''}。这不是你的全部持仓估值。</p>`:'')+
    (r.path?`<details><summary>逐笔对照（最近 ${Math.min(20,r.path.length)} 笔）</summary><div class="review-table"><table><thead><tr><th>UTC 日期</th><th>投入 CNY</th><th>实际 BTC</th><th>普通参考 BTC</th></tr></thead><tbody>${r.path.slice(-20).reverse().map(p=>`<tr><td>${day(p.day)}</td><td>${money(p.cny)}</td><td>${p.actual.toFixed(6)}</td><td>${p.ordinary.toFixed(6)}</td></tr>`).join('')}</tbody></table></div></details>`:'');
}
function initPersonalReview(){
  const panel=$('personalReview');if(!panel||panel.dataset.ready)return;panel.dataset.ready='1';
  panel.addEventListener('toggle',()=>{if(!panel.open)return;renderPersonalReview();});
}

/* A download request is not proof that a backup reached the user's Files app. */
const BACKUP_RECEIPT_KEY='btc_backup_receipt_v1';
function backupCanonical(value){
  if(Array.isArray(value))return value.map(backupCanonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,backupCanonical(value[k])]));
  return value;
}
function backupPersonalSnapshot(){
  let ledger=S.dcaLedger||null;
  try{const local=JSON.parse(localStorage.getItem(DCA_LEDGER_KEY)||'null');if(local&&(!ledger||(+local.updatedAt||0)>=(+ledger.updatedAt||0)))ledger=local;}catch(e){}
  // Exclude live prices, market caches and export timestamps from reminders.
  const state={log:S.log||[],hd:S.hd||{},bud:S.bud||{},m21:S.m21||{},execution:S.executionV25||null,dcaLedger:ledger};
  return backupCanonical(state);
}
function backupSignature(snapshot=backupPersonalSnapshot()){
  // Change detection only, not a cryptographic integrity or security guarantee.
  const text=JSON.stringify(snapshot);let hash=2166136261;
  for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619);}
  return text.length+':'+(hash>>>0).toString(16);
}
function backupReceipt(){try{const r=JSON.parse(localStorage.getItem(BACKUP_RECEIPT_KEY)||'null');return r?.schema===1?r:{};}catch(e){return{};}}
function backupRecordGenerated(signature){
  const previous=backupReceipt();
  try{localStorage.setItem(BACKUP_RECEIPT_KEY,JSON.stringify({...previous,schema:1,pending:{signature,at:Date.now()}}));return true;}catch(e){return false;}
}
function backupReminder(now=Date.now()){
  const snapshot=backupPersonalSnapshot(),signature=backupSignature(snapshot),receipt=backupReceipt(),b=snapshot.dcaLedger?.baseline||{},h=snapshot.hd;
  const hasData=!!(snapshot.log.length||snapshot.dcaLedger?.orders?.length||b.btc>0||b.usdt>0||b.usdc>0||b.totalCny>0||h.d>0||h.l>0||h.ibit>0);
  const pending=receipt.pending?.signature===signature,confirmed=receipt.confirmed;
  if(!hasData)return{need:false,pending:false,text:'暂无个人流水或持仓需要备份。'};
  if(pending)return{need:true,pending:true,text:'备份文件已生成，请保存到「文件」后确认。'};
  if(!confirmed)return{need:true,pending:false,text:'尚无已确认保存的备份，建议导出 JSON。'};
  if(confirmed.signature!==signature)return{need:true,pending:false,text:'个人数据已变化，建议导出新的备份。'};
  const days=Math.max(0,Math.floor((now-confirmed.at)/864e5));
  return{need:now-confirmed.at>BACKUP_REMIND_MS,pending:false,text:`上次确认保存 ${days} 天前 · 换机或清理浏览器前请再次备份。`};
}
function confirmSavedBackup(){
  const r=backupReceipt(),signature=backupSignature();
  if(!r.pending||r.pending.signature!==signature){ntf('数据已变化，请重新导出备份');renderBackupHint();return false;}
  if(!confirm('请确认 JSON 备份已经保存到「文件」或其他安全位置。网站无法自动检查下载是否保存成功。'))return false;
  try{localStorage.setItem(BACKUP_RECEIPT_KEY,JSON.stringify({schema:1,confirmed:{signature,at:Date.now()}}));renderBackupHint();ntf('已记录你的保存确认');return true;}catch(e){ntf('确认记录保存失败，请保留已下载的 JSON 文件');return false;}
}
function renderBackupStatus(){
  const state=backupReminder(),banner=$('backupBanner'),text=$('backupText'),note=$('backupStatusNote'),button=$('backupConfirm');
  if(banner)banner.classList.toggle('on',state.need);
  if(text)text.textContent=state.text;
  if(note)note.textContent=state.text;
  if(button)button.hidden=!state.pending;
}

/* Presentation-only home views. Never write S, trading rules or the ledger. */
let focusAhrModel="refit",focusAhrRange=90,focusFrame=0,focusAhrPlot=null,focusPricePlot=null,focusLayoutReady=false;
const focusHistoryRequest={busy:false,full:false,error:"",recovery:[],base:null};
const focusDrawErrors={};
const FOCUS_CHARTS={ahr:{svg:"homeAhrChart",date:"homeAhrReadDate",value:"homeAhrReadValue",empty:"homeAhrEmpty",message:"homeAhrEmptyText",feedback:"homeAhrFeedback"},price:{svg:"priceSparkGraphic",date:"homePriceReadDate",value:"homePriceReadValue",empty:"homePriceEmpty",message:"homePriceEmptyText",feedback:"homePriceFeedback"}};
const FOCUS_DAY=86400;
const FOCUS_VIEW_KEY="btc_focus_view_v1";
let focusView={version:1,model:"refit",range:90,folds:{}};
// Viewing preferences have their own key; never serialize the ledger or S here.
function restoreFocusView(){
  let saved;try{saved=JSON.parse(localStorage.getItem(FOCUS_VIEW_KEY))}catch(e){}
  focusView={version:1,model:"refit",range:90,folds:{}};
  if(saved&&saved.version===1){
    if(["refit","classic"].includes(saved.model))focusView.model=saved.model;
    if([30,90,365,730,1460,0].includes(saved.range))focusView.range=saved.range;
    document.querySelectorAll(".module-fold").forEach(el=>{
      const key=el.dataset.module,value=saved.folds&&saved.folds[key];
      if(typeof value==="boolean"){focusView.folds[key]=value;el.open=value}
    });
  }
  focusAhrModel=focusView.model;focusAhrRange=focusView.range;
}
function saveFocusView(){
  focusView.model=focusAhrModel;focusView.range=focusAhrRange;
  try{localStorage.setItem(FOCUS_VIEW_KEY,JSON.stringify(focusView))}catch(e){}
}
function bindFocusFold(el){
  if(el.dataset.focusBound)return;el.dataset.focusBound="true";
  let previous=el.open;
  el.addEventListener("toggle",()=>{
    if(el.open!==previous){previous=el.open;focusView.folds[el.dataset.module]=el.open;saveFocusView()}
    if(el.open)requestAnimationFrame(()=>window.dispatchEvent(new Event("resize")));
  });
}
function focusText(id,value){const el=document.getElementById(id);if(el&&el.textContent!==String(value))el.textContent=value}
function focusMoney(value){return Number.isFinite(value)&&value>0?"$"+Math.round(value).toLocaleString("en-US"):"--"}
function focusDay(time){return new Date(time*1000).toISOString().slice(0,10)}
function focusHistoryRows(){
  const raw=typeof DAILY==="undefined"?[]:DAILY;
  // A local history retry is presentation-only. A normal data refresh takes
  // authority again when it replaces DAILY; no quote, formula or ledger writes.
  if(focusHistoryRequest.recovery.length&&focusHistoryRequest.base===raw)return focusHistoryRequest.recovery;
  focusHistoryRequest.recovery=[];return raw;
}
function focusSetBusy(button,busy){
  if(!button)return;button.disabled=busy;button.setAttribute("aria-busy",String(busy));button.classList.toggle("is-loading",busy);
}
function focusHistoryStatus(){
  const busy=focusHistoryRequest.busy||focusHistoryRequest.full;
  for(const [kind,ids] of Object.entries(FOCUS_CHARTS)){
    const svg=document.getElementById(ids.svg);if(!svg)continue;
    const ready=svg.dataset.ready==="true"&&!focusDrawErrors[kind],empty=document.getElementById(ids.empty),feedback=document.getElementById(ids.feedback);
    if(empty)empty.hidden=ready;
    const error=focusDrawErrors[kind]||focusHistoryRequest.error;
    focusText(ids.message,busy?"正在获取日线历史…":error|| (kind==="ahr"?"连续日线不足，暂不能计算历史指数":"价格历史尚未就绪"));
    if(feedback){feedback.hidden=!ready||!error;const label=feedback.querySelector("span");if(label)label.textContent=error+" · 保留原图"}
    document.querySelectorAll(`[data-focus-retry="${kind}"]`).forEach(button=>{focusSetBusy(button,busy);button.textContent=busy?"更新中":focusDrawErrors[kind]?"重试绘图":"重试历史"});
  }
}
function focusRefreshStarted(){focusHistoryRequest.full=true;focusHistoryRequest.error="";focusHistoryStatus()}
function focusRefreshFinished(failed=false){
  focusHistoryRequest.full=false;
  const h=typeof HEALTH!=="undefined"&&HEALTH["均线"];
  if(failed||!h||h.status!=="ok")focusHistoryRequest.error="日线未更新";
  else focusHistoryRequest.error="";
  focusHistoryStatus();queueFocusCharts();
}
async function retryFocusChart(kind){
  if(!FOCUS_CHARTS[kind]||focusHistoryRequest.busy||focusHistoryRequest.full)return;
  if(focusDrawErrors[kind]){delete focusDrawErrors[kind];renderFocusCharts();return}
  focusHistoryRequest.busy=true;focusHistoryRequest.error="";focusHistoryStatus();
  const base=typeof DAILY==="undefined"?null:DAILY;
  try{
    const raw=await fetchBtcDailyCandles(),rows=focusAhrHistory(raw),previous=focusAhrHistory(focusHistoryRows());
    if(rows.length<2||previous.length&&rows.at(-1).time<previous.at(-1).time)throw new Error("incomplete history");
    if(base===DAILY){focusHistoryRequest.recovery=raw;focusHistoryRequest.base=base}
  }catch(e){focusHistoryRequest.error="日线获取失败，可稍后重试"}
  finally{focusHistoryRequest.busy=false;renderFocusCharts();focusHistoryStatus()}
}
function focusPaint(kind,draw){
  const svg=document.getElementById(FOCUS_CHARTS[kind].svg);
  try{draw();delete focusDrawErrors[kind];return true}
  catch(e){
    focusDrawErrors[kind]="图表暂无法显示";
    if(svg)svg.setAttribute("hidden","");
    if(kind==="ahr")focusAhrPlot=null;else focusPricePlot=null;
    console.warn("图表绘制失败",kind,e);return false;
  }finally{focusHistoryStatus()}
}

// Read unmodified completed candles: normalizedDaily replaces the latest close
// with the current quote, so it must not be used for a closing-index history.
function focusDailyRows(raw,now=Date.now()){
  const today=Math.floor(now/864e5)*FOCUS_DAY,map=new Map();
  for(const row of Array.isArray(raw)?raw:[]){
    if(!Array.isArray(row))continue;
    const stamp=Number(row[0]),time=Math.floor((stamp>1e12?stamp/1000:stamp)/FOCUS_DAY)*FOCUS_DAY,close=Number(row[4]);
    if(Number.isFinite(time)&&time>0&&time<today&&Number.isFinite(close)&&close>0)map.set(time,{time,close});
  }
  // V26.0.6：用内置的 Bitview 完整日线（2010-08 起）补足更早的历史，「全部」才是真正的全部
  if(map.size&&typeof CYCLE_SEED==="object"&&CYCLE_SEED&&Array.isArray(CYCLE_SEED.rows)){
    for(const r of CYCLE_SEED.rows){
      const time=Math.floor(+r.time/FOCUS_DAY)*FOCUS_DAY,close=+r.close;
      if(time>0&&time<today&&close>0&&!map.has(time))map.set(time,{time,close});
    }
  }
  return [...map.values()].sort((a,b)=>a.time-b.time);
}
function focusAhrHistory(raw,model="refit",now=Date.now()){
  const rows=focusDailyRows(raw,now),out=[];let windowRows=[],inverse=0,previous=0;
  for(const row of rows){
    if(previous&&row.time-previous!==FOCUS_DAY){windowRows=[];inverse=0}
    previous=row.time;windowRows.push(row);inverse+=1/row.close;
    if(windowRows.length>200)inverse-=1/windowRows.shift().close;
    if(windowRows.length<200)continue;
    const age=ahrCoinDays(row.time*1000),pl=Math.pow(10,AHR_A*Math.log10(age)+AHR_B),k=ahrShift(row.time*1000);
    const value=row.close*row.close/((200/inverse)*pl)/(model==="classic"?k:1);
    if(Number.isFinite(value)&&value>0)out.push({time:row.time,value,low:.45,high:1.2});
  }
  return out;
}
function focusAhrSnapshot(a,model="refit",now=Date.now()){
  if(!a||!Number.isFinite(+a.v)||!(+a.v>0))return null;
  const k=ahrShift(now),classic=Number.isFinite(+a.c)&&+a.c>0?+a.c:+a.v/k;
  const value=model==="classic"?classic:+a.v,scale=1,priceK=model==="classic"?k:1;
  const thresholds=[.45,1,1.2],basis=+a.dma*(+a.pl);
  const prices=Number.isFinite(basis)&&basis>0?thresholds.map(x=>Math.sqrt(x*priceK*basis)):[null,null,null];
  return{value,classic,k,scale,thresholds,prices,zone:value<.45*scale?0:value<1.2*scale?1:value<5*scale?2:3};
}
function setFocusAhrModel(model){
  if(!["refit","classic"].includes(model))return;
  if(focusAhrPlot)focusAhrPlot.selected=false;
  focusAhrModel=model;saveFocusView();renderFocusAhr(S.ahr);
}
function setFocusAhrRange(days){
  if(![30,90,365,730,1460,0].includes(+days))return;
  if(focusAhrPlot)focusAhrPlot.selected=false;
  focusAhrRange=+days;saveFocusView();renderFocusAhrChart();
}
function renderFocusAhr(a){
  const value=document.getElementById("ahrBig"),zone=document.getElementById("ahrZone");if(!value||!zone)return;
  document.querySelectorAll("[data-focus-model]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.focusModel===focusAhrModel)));
  focusText("homeAhrModelName",focusAhrModel==="classic"?"2018 经典":"2026 新拟合");
  const snap=focusAhrSnapshot(a,focusAhrModel),ladder=document.getElementById("ahrLadder"),cursor=document.getElementById("ahrCur");
  if(!snap){
    value.textContent="--";zone.textContent="等待数据";value.style.color=zone.style.color="var(--text-secondary)";
    for(const id of ["ahrC","ahrPL","ahrDMA","ahrShiftNote"])focusText(id,"--");
    const band=document.getElementById("homeAhrSpectrum");if(band)band.setAttribute("aria-label","等待估值数据");
    if(ladder)ladder.innerHTML="";if(cursor)cursor.hidden=true;renderFocusAhrChart();return;
  }
  const labels=["深度低估","长期低估","估值偏热","高估风险"],colors=["var(--market-positive)","var(--market-positive-emphasis)","var(--market-caution)","var(--market-negative)"];
  value.textContent=snap.value.toFixed(3);value.style.color=colors[snap.zone];zone.textContent=labels[snap.zone];zone.style.color=colors[snap.zone];
  focusText("ahrC",snap.classic.toFixed(3));focusText("ahrPL",focusMoney(+a.pl));focusText("ahrDMA",focusMoney(+a.dma));focusText("ahrShiftNote","×"+snap.k.toFixed(3));
  const lo=.1*snap.scale,hi=14*snap.scale,position=v=>100*(Math.log(Math.max(lo,Math.min(hi,v)))-Math.log(lo))/(Math.log(hi)-Math.log(lo));
  const spectrum=document.getElementById("homeAhrSpectrum"),edges=[lo,.45*snap.scale,1.2*snap.scale,5*snap.scale,hi];
  if(spectrum){spectrum.setAttribute("aria-label",`${labels[snap.zone]}，指数 ${snap.value.toFixed(3)}，当前模型 ${focusAhrModel==="classic"?"经典":"新拟合"}`);[...spectrum.children].forEach((el,i)=>el.style.flex=String(position(edges[i+1])-position(edges[i])))}
  if(cursor){cursor.hidden=false;cursor.style.left=position(snap.value)+"%"}
  const lbl=document.getElementById("ahrLbls");if(lbl)lbl.innerHTML=labels.map((label,i)=>`<span>${label}<br>${i===0?"&lt; "+edges[1].toFixed(2):i===3?"≥ "+edges[3].toFixed(2):edges[i].toFixed(2)+"–"+edges[i+1].toFixed(2)}</span>`).join("");
  if(ladder)ladder.innerHTML=["深度低估边界","周期中轴","低估区上沿"].map((label,i)=>`<article class="focus-boundary"><small>${label}</small><b class="num">${focusMoney(snap.prices[i])}</b><span>AHR ${snap.thresholds[i].toFixed(2)}</span></article>`).join("");
  renderFocusAhrChart();
}
function focusSvgNode(svg,tag,attrs,text){
  const el=document.createElementNS("http://www.w3.org/2000/svg",tag);
  Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,String(v)));
  if(text!=null)el.textContent=text;svg.appendChild(el);return el;
}
function focusLinePath(rows,x,y,key){
  return rows.map((r,i)=>`${i===0||(r.time!=null&&rows[i-1].time!=null&&r.time-rows[i-1].time>FOCUS_DAY)?"M":"L"}${x(r,i).toFixed(2)},${y(r[key]).toFixed(2)}`).join(" ");
}
function focusPlot(kind){return kind==="ahr"?focusAhrPlot:focusPricePlot}
function focusReadLabel(kind,row,index,selected){
  if(kind==="ahr")return `${selected?"":"日线收盘 · "}${focusDay(row.time)}`;
  if(row.current)return row.manual?"手动试算价":"当前参考价";
  if(row.time==null)return selected?`缓存样本 ${index+1}`:"最近缓存样本";
  return `${focusDay(row.time)} · 收盘`;
}
function focusChartRead(kind,index=null){
  const p=focusPlot(kind);if(!p)return;
  const selected=index!=null,i=selected?Math.max(0,Math.min(p.rows.length-1,index)):p.rows.length-1,row=p.rows[i],ids=FOCUS_CHARTS[kind];
  p.index=i;p.selected=selected;
  focusText(ids.date,focusReadLabel(kind,row,i,selected));focusText(ids.value,kind==="ahr"?row.value.toFixed(3):focusMoney(row.value));
  p.cross.setAttribute("visibility",selected?"visible":"hidden");
  if(selected){const px=p.geometry.x(row,i);p.rule.setAttribute("x1",px);p.rule.setAttribute("x2",px);p.point.setAttribute("cx",px);p.point.setAttribute("cy",p.geometry.y(row.value))}
}
function focusChartPointer(kind,event){
  const p=focusPlot(kind);if(!p)return;
  const rect=p.svg.getBoundingClientRect();if(!(rect.width>80))return;
  const {left,right,width}=p.geometry,px=(event.clientX-rect.left)*width/rect.width,fraction=Math.max(0,Math.min(1,(px-left)/(right-left)));
  const first=p.rows[0],last=p.rows.at(-1),index=first.time==null?Math.round(fraction*(p.rows.length-1)):focusAhrNearest(p.rows,first.time+fraction*(last.time-first.time));
  focusChartRead(kind,index);
}
function focusChartKey(kind,event){
  const p=focusPlot(kind);if(!p)return;
  const targets={ArrowLeft:p.index-1,ArrowRight:p.index+1,Home:0,End:p.rows.length-1,Escape:null};
  if(!Object.prototype.hasOwnProperty.call(targets,event.key))return;
  event.preventDefault();focusChartRead(kind,targets[event.key]);
}
function focusChartCross(stage,g,color){
  const cross=focusSvgNode(stage,"g",{visibility:"hidden","pointer-events":"none"});
  const rule=focusSvgNode(cross,"line",{x1:g.left,x2:g.left,y1:g.top,y2:g.bottom,stroke:"var(--text-tertiary)","stroke-width":1,"stroke-dasharray":"3 3"});
  const point=focusSvgNode(cross,"circle",{r:4,fill:color,stroke:"var(--surface-0)","stroke-width":2});
  return {cross,rule,point};
}
function focusBindChart(kind){
  const p=focusPlot(kind),svg=p.svg;
  svg.onpointerdown=e=>focusChartPointer(kind,e);svg.onpointermove=e=>focusChartPointer(kind,e);
  svg.onpointerup=e=>{if(e.pointerType!=="mouse")focusChartRead(kind)};
  svg.onpointerleave=()=>focusChartRead(kind);svg.onpointercancel=()=>focusChartRead(kind);
  svg.onkeydown=e=>focusChartKey(kind,e);svg.onfocus=()=>focusChartRead(kind,focusPlot(kind)?.index);svg.onblur=()=>focusChartRead(kind);
}
function focusRestoreRead(kind,previous){
  const p=focusPlot(kind),old=previous?.selected&&previous.rows[previous.index];
  const index=old&&old.time!=null?p.rows.findIndex(r=>r.time===old.time):-1;
  focusChartRead(kind,index>=0?index:null);focusBindChart(kind);
}
function focusDrawChart(svg,rows,options){
  if(!svg||rows.length<2)return;
  const target=svg,width=target.getBoundingClientRect().width;if(!(width>80)){focusPricePlot=null;return}
  svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
  const height=options.height||136,left=2,right=42,top=9,bottom=height-23;
  const values=rows.map(r=>r.value);
  let min=Math.min(...values),max=Math.max(...values),span=max-min;
  if(!(span>0))span=Math.max(1,max*.03);
  min-=span*.12;max+=span*.12;
  const first=rows[0],last=rows.at(-1),dated=first.time!=null&&last.time>first.time;
  const x=(r,i)=>left+(dated?(r.time-first.time)/(last.time-first.time):i/(rows.length-1))*(width-left-right);
  const y=v=>bottom-(v-min)/(max-min)*(bottom-top);
  for(const v of [min,(min+max)/2,max]){
    focusSvgNode(svg,"line",{x1:left,x2:width-right,y1:y(v),y2:y(v),stroke:"var(--border-subtle)","stroke-width":1,"stroke-dasharray":"2 4"});
    focusSvgNode(svg,"text",{x:width-2,y:y(v)+4,"text-anchor":"end",fill:"var(--text-tertiary)","font-size":11},"$"+(v/1000).toFixed(1)+"K");
  }
  const pdefs=focusSvgNode(svg,"defs",{}),pgrad=focusSvgNode(pdefs,"linearGradient",{id:"focusPriceFade",x1:0,y1:0,x2:0,y2:1});
  focusSvgNode(pgrad,"stop",{offset:0,"stop-color":"var(--text-primary)","stop-opacity":.08});focusSvgNode(pgrad,"stop",{offset:1,"stop-color":"var(--text-primary)","stop-opacity":0});
  const pline=focusLinePath(rows,x,y,"value");
  focusSvgNode(svg,"path",{d:pline+` L${x(last,rows.length-1).toFixed(2)},${bottom} L${x(first,0).toFixed(2)},${bottom} Z`,fill:"url(#focusPriceFade)"});
  focusSvgNode(svg,"path",{d:pline,fill:"none",stroke:"var(--text-primary)","stroke-width":1.75,"stroke-linecap":"round","stroke-linejoin":"round"});
  focusSvgNode(svg,"circle",{cx:x(last,rows.length-1),cy:y(last.value),r:8,fill:"var(--brand-ink)","fill-opacity":.18});
  focusSvgNode(svg,"circle",{cx:x(last,rows.length-1),cy:y(last.value),r:3.5,fill:"var(--brand-ink)",stroke:"var(--surface-0)","stroke-width":1.5});
  for(const [row,i,anchor] of [[first,0,"start"],[last,rows.length-1,"end"]])focusSvgNode(svg,"text",{x:x(row,i),y:height-4,"text-anchor":anchor,fill:"var(--text-tertiary)","font-size":10},row.time==null?(i?"最近":"较早"):focusDay(row.time).slice(5));
  const geometry={width,height,left,right:width-right,top,bottom,x,y},cross=focusChartCross(svg,geometry,"var(--text-primary)"),previous=focusPricePlot;
  // Commit only after every SVG node was built successfully.
  target.replaceChildren(...svg.children);target.setAttribute("viewBox",`0 0 ${width} ${height}`);
  focusPricePlot={svg:target,rows,geometry,...cross,index:rows.length-1};focusRestoreRead("price",previous);
}
// AHR has its own valuation geometry; both charts share reading and recovery.
function focusAhrChartRows(raw,model,range,now=Date.now()){
  const today=Math.floor(now/864e5)*FOCUS_DAY;
  return focusAhrHistory(raw,model,now).filter(r=>range===0||r.time>=today-range*FOCUS_DAY).map(r=>({...r,risk:r.high*5/1.2}));
}
function focusAhrGeometry(rows,width,range){
  const height=236,left=4,right=width-48,top=12,bottom=208,log=range===0||range>90;
  const values=rows.flatMap(r=>[r.value,r.low,r.high]);
  const min=log?Math.min(...values)*.72:0,max=Math.max(...values)*(log?1.3:1.14);
  const transform=v=>log?Math.log(v):v,lo=transform(min),span=transform(max)-lo;
  const x=r=>left+(r.time-rows[0].time)/(rows.at(-1).time-rows[0].time)*(right-left);
  const y=v=>bottom-(transform(v)-lo)/span*(bottom-top);
  return{width,height,left,right,top,bottom,min,max,log,x,y};
}
function focusAhrSegments(rows){
  const segments=[];
  for(const row of rows){const group=segments.at(-1);if(!group||row.time-group.at(-1).time>FOCUS_DAY)segments.push([row]);else group.push(row)}
  return segments;
}
function focusAhrBandPath(rows,geometry,lower,upper){
  const {x,y,min,max}=geometry,point=(r,key)=>`${x(r).toFixed(2)},${y(Math.max(min,Math.min(max,typeof key==="number"?key:r[key]))).toFixed(2)}`;
  return focusAhrSegments(rows).filter(s=>s.length>1).map(s=>"M"+s.map(r=>point(r,upper)).join(" L")+" L"+[...s].reverse().map(r=>point(r,lower)).join(" L")+" Z").join(" ");
}
function focusAhrNearest(rows,time){
  let lo=0,hi=rows.length-1;
  while(lo<hi){const mid=(lo+hi)>>1;if(rows[mid].time<time)lo=mid+1;else hi=mid}
  return lo>0&&time-rows[lo-1].time<rows[lo].time-time?lo-1:lo;
}
function focusAhrReadPoint(index=null){
  focusChartRead("ahr",index);
}
function focusAhrPointer(event){
  focusChartPointer("ahr",event);
}
function focusAhrKey(event){
  focusChartKey("ahr",event);
}
function drawFocusAhrChart(svg,rows){
  const width=svg.getBoundingClientRect().width;if(!(width>80)){focusAhrPlot=null;return}
  const target=svg;svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
  // V25.1.13：去掉右侧刻度栏，图形占满宽度；只保留分界线与一条走势线
  const g=focusAhrGeometry(rows,width+34,focusAhrRange);g.width=width;
  const {left,right,top,bottom,min,max,x,y}=g,last=rows.at(-1);
  const defs=focusSvgNode(svg,"defs",{}),clip=focusSvgNode(defs,"clipPath",{id:"focusAhrPlotClip"});
  focusSvgNode(clip,"rect",{x:left,y:top,width:right-left,height:bottom-top});
  const zoneColor=last.value<last.low?"var(--market-positive)":last.value<last.high?"var(--market-positive-emphasis)":last.value<last.risk?"var(--market-caution)":"var(--market-negative)";
  // V26.0.9：背景按估值分区着色；走势线随所在分区变色
  const plot=focusSvgNode(svg,"g",{"clip-path":"url(#focusAhrPlotClip)"});
  const clampY=v=>Math.max(top,Math.min(bottom,v)),yRisk=clampY(y(last.risk)),yHigh=clampY(y(last.high)),yLow=clampY(y(last.low));
  const bands=[[top,yRisk,"var(--market-negative)",.07],[yRisk,yHigh,"var(--market-caution)",.07],[yHigh,yLow,"var(--market-positive-emphasis)",.06],[yLow,bottom,"var(--market-positive)",.11]];
  for(const [a,b,c,o] of bands)if(b-a>.5)focusSvgNode(plot,"rect",{x:left,y:a,width:right-left,height:b-a,style:`fill:${c};fill-opacity:${o}`});
  const span=Math.max(1,bottom-top),f=v=>((v-top)/span).toFixed(4);
  const lineGrad=focusSvgNode(defs,"linearGradient",{id:"focusAhrLine",gradientUnits:"userSpaceOnUse",x1:0,y1:top,x2:0,y2:bottom});
  [[0,"var(--market-negative)"],[f(yRisk),"var(--market-negative)"],[f(yRisk),"var(--market-caution)"],[f(yHigh),"var(--market-caution)"],[f(yHigh),"var(--market-positive-emphasis)"],[f(yLow),"var(--market-positive-emphasis)"],[f(yLow),"var(--market-positive)"],[1,"var(--market-positive)"]]
    .forEach(([o,c])=>focusSvgNode(lineGrad,"stop",{offset:o,style:`stop-color:${c}`}));
  const line=focusLinePath(rows,x,y,"value");
  const marks=[["low","深度低估","var(--market-positive)"],["high","低估区上沿","var(--market-caution)"],["risk","高估风险","var(--market-negative)"]];
  for(const [key,,color] of marks)focusSvgNode(plot,"path",{d:focusLinePath(rows,x,y,key),fill:"none",stroke:color,"stroke-opacity":.6,"stroke-width":1,"stroke-dasharray":"2 4"});
  focusSvgNode(plot,"path",{d:line,fill:"none",stroke:"url(#focusAhrLine)","stroke-width":2,"stroke-linejoin":"round","stroke-linecap":"round"});
  for(const [key,name,color] of marks){
    const v=last[key];if(!(v>min&&v<max))continue;const py=y(v);if(py<top+14)continue;
    focusSvgNode(svg,"text",{x:left+2,y:py-6,fill:color,"font-size":12,"font-weight":600,stroke:"var(--surface-0)","stroke-width":4,"stroke-linejoin":"round","paint-order":"stroke"},`${key==="low"?"0.45":key==="high"?"1.2":"5"}  ${name}`);
  }
  for(const fraction of [0,.5,1]){
    const time=rows[0].time+Math.round((last.time-rows[0].time)*fraction/FOCUS_DAY)*FOCUS_DAY,px=x({time});
    focusSvgNode(svg,"text",{x:px,y:g.height-5,"text-anchor":fraction===0?"start":fraction===1?"end":"middle",fill:"var(--text-tertiary)","font-size":11},focusAhrRange>0&&focusAhrRange<=90?focusDay(time).slice(5):focusDay(time).slice(0,7));
  }
  focusSvgNode(svg,"circle",{cx:x(last),cy:y(last.value),r:9,fill:zoneColor,"fill-opacity":.18});
  focusSvgNode(svg,"circle",{cx:x(last),cy:y(last.value),r:4,fill:zoneColor,stroke:"var(--surface-0)","stroke-width":2});
  const cross=focusChartCross(svg,g,"var(--text-primary)"),previous=focusAhrPlot;
  target.replaceChildren(...svg.children);target.setAttribute("viewBox",`0 0 ${width} ${g.height}`);
  focusAhrPlot={svg:target,rows,geometry:g,...cross,index:rows.length-1};focusRestoreRead("ahr",previous);
}
function renderFocusAhrChart(){
  const svg=document.getElementById("homeAhrChart"),empty=document.getElementById("homeAhrEmpty");if(!svg)return;
  document.querySelectorAll("[data-focus-range]").forEach(b=>b.setAttribute("aria-pressed",String(+b.dataset.focusRange===focusAhrRange)));
  const rows=focusAhrChartRows(focusHistoryRows(),focusAhrModel,focusAhrRange);
  const ready=rows.length>=2;
  svg.dataset.ready=String(ready);
  // SVGElement does not reflect the HTMLElement.hidden property. Change the
  // attribute itself before measuring, otherwise [hidden] keeps its width zero.
  if(ready)svg.removeAttribute("hidden");else svg.setAttribute("hidden","");
  if(empty)empty.hidden=ready;
  if(!ready){focusAhrPlot=null;delete focusDrawErrors.ahr;svg.replaceChildren();svg.setAttribute("aria-label","AHR999 历史数据不足");focusText("homeAhrReadDate","收盘指数");focusText("homeAhrReadValue","--");focusText("homeAhrChartMeta","需连续200日日线计算历史；当前数据不足，未绘制曲线。");focusHistoryStatus();return}
  const first=rows[0],last=rows.at(-1);
  // The latest close remains readable while its tab is temporarily offscreen.
  focusText("homeAhrReadDate",`日线收盘 · ${focusDay(last.time)}`);focusText("homeAhrReadValue",last.value.toFixed(3));
  focusText("homeAhrChartMeta",`${focusDay(first.time)} — ${focusDay(last.time)} · ${focusAhrRange>0&&focusAhrRange<=90?"线性":"对数"}坐标 · 按住查看任一日`);
  focusText("homeAhrChartHint",`按住查看，松开恢复最新 · 固定分界 0.45 / 1.2 · UTC`);
  svg.setAttribute("aria-label",`${focusAhrModel==="classic"?"经典":"新拟合"} AHR999历史，${focusDay(last.time)}收盘值 ${last.value.toFixed(3)}，共${rows.length}日`);
  focusPaint("ahr",()=>drawFocusAhrChart(svg,rows));
}
function renderFocusPrice(){
  const svg=document.getElementById("priceSparkGraphic");if(!svg)return;
  const today=Math.floor(Date.now()/864e5)*FOCUS_DAY;
  let rows=focusDailyRows(focusHistoryRows()).filter(r=>r.time>=today-30*FOCUS_DAY).map(r=>({time:r.time,value:r.close}));
  let sampled=false;
  if(rows.length<2){rows=(S.spark30||[]).filter(v=>Number.isFinite(+v)&&+v>0).slice(-30).map(v=>({time:null,value:+v}));sampled=true}
  if(!sampled&&rows.length&&Number.isFinite(S.price)&&S.price>0)rows.push({time:today,value:S.price,current:true,manual:!!S.manualPrice});
  const manual=document.getElementById("homeManualPrice");if(manual)manual.hidden=!S.manualPrice;
  svg.dataset.ready=String(rows.length>=2);
  if(rows.length<2){focusPricePlot=null;delete focusDrawErrors.price;svg.replaceChildren();svg.setAttribute("hidden","");svg.setAttribute("aria-label","价格历史尚未就绪");focusText("homePriceChartMeta","价格历史尚未就绪");focusText("pc30Value","--");focusText("homePriceReadDate","价格 · USD");focusText("homePriceReadValue","--");focusHistoryStatus();return}
  svg.removeAttribute("hidden");
  const first=rows[0],last=rows.at(-1),pct=(last.value/first.value-1)*100,chip=document.getElementById("pc30");
  if(chip){chip.className="chip num "+(pct>=0?"chip-up":"chip-down");const label=chip.querySelector("i");if(label)label.textContent=sampled?"样本区间":first.time<=today-30*FOCUS_DAY?"30 日":"区间"}
  focusText("pc30Value",(pct>=0?"+":"")+pct.toFixed(1)+"%");
  focusText("homePriceChartMeta",sampled?"缓存趋势 · 原始样本未提供日期":`${focusDay(first.time)} — ${focusDay(last.time)} · 日线${S.manualPrice?"与手动试算价":"与当前价"}`);
  focusText("homePriceReadDate",focusReadLabel("price",last,rows.length-1,false));focusText("homePriceReadValue",focusMoney(last.value));
  svg.setAttribute("role","img");svg.removeAttribute("aria-hidden");svg.setAttribute("aria-label",sampled?"BTC缓存价格走势，未提供日期":`BTC价格走势，${focusDay(first.time)}至${focusDay(last.time)}`);
  focusPaint("price",()=>focusDrawChart(svg,rows,{height:126}));
}
function renderFocusPlan(){
  const card=document.getElementById("homePlan"),progress=document.getElementById("homePlanProgress");if(!card)return;
  const view=executionView(),ready=view.ready&&Number.isFinite(view.total);
  card.dataset.issue=String(!ready);focusText("homePlanUsed",ready?"¥"+view.total.toLocaleString("zh-CN",{maximumFractionDigits:2}):"待核对");
  focusText("homePlanTarget","月计划 ¥2,000");
  if(progress){progress.hidden=!ready;progress.value=ready?Math.min(2000,view.total):0}
  focusText("homePlanNote",ready?`${mstr()} · 已记录投入${view.total>2000?"超过计划 ¥"+(view.total-2000).toLocaleString("zh-CN"):"，剩余 ¥"+view.left.toLocaleString("zh-CN")} · 本机账本`:"账本或预算有待核对，请打开计划与记录。");
}
function sectionLanding(id){return [...document.querySelectorAll(".module-fold")].find(el=>el.dataset.module===id)||document.getElementById(id)}
function revealFocusSection(el){
  if(!el)return;
  for(let node=el;node;node=node.parentElement)if(node.tagName==="DETAILS")node.open=true;
}
function focusOpenSection(id){
  const el=document.getElementById(id);if(!el)return;
  const owner=tabOf(id);if(owner)setTab(owner,true);
  revealFocusSection(el);closeIndicatorNav(false);
  requestAnimationFrame(()=>{scrollSectionToAppTop(el,stillMode()?"auto":"smooth");try{history.replaceState(null,"",location.pathname+location.search+"#"+id)}catch(e){}});
}
function queueFocusCharts(){
  if(focusFrame||document.visibilityState==="hidden")return;
  focusFrame=requestAnimationFrame(()=>{focusFrame=0;renderFocusCharts()});
}
function renderFocusCharts(){
  for(const [kind,render] of [["price",renderFocusPrice],["ahr",renderFocusAhrChart]]){
    try{render()}catch(e){focusPaint(kind,()=>{throw e})}
  }
}
function resumeFocusCharts(){
  if(focusFrame){cancelAnimationFrame(focusFrame);focusFrame=0}
  if(document.visibilityState!=="hidden")queueFocusCharts();
}
function initFocusLayout(){
  if(focusLayoutReady)return;focusLayoutReady=true;
  renderFocusAhr(S.ahr);renderFocusPlan();
  window.addEventListener("resize",queueFocusCharts,{passive:true});window.addEventListener("themechange",queueFocusCharts);
  window.addEventListener("pageshow",resumeFocusCharts,{passive:true});window.addEventListener("orientationchange",resumeFocusCharts,{passive:true});
  document.addEventListener("visibilitychange",resumeFocusCharts,{passive:true});
  document.querySelectorAll(".module-fold").forEach(bindFocusFold);
  if(typeof ResizeObserver!=="undefined"){
    const widths=new WeakMap(),observer=new ResizeObserver(entries=>{
      for(const entry of entries){const width=entry.contentRect.width,old=widths.get(entry.target);widths.set(entry.target,width);if(width>80&&(old==null||Math.abs(width-old)>.5))queueFocusCharts()}
    });
    for(const id of ["ahr","today"]){const el=document.getElementById(id);if(el)observer.observe(el)}
  }
}

/* Update diagnostics are memory-only: never modify ledger, preferences or backups. */
const APP_UPDATE = {server:null,worker:null,controller:null,checkedAt:0,busy:false,applying:false,ready:false,status:"尚未核对",detail:"手动核对不会刷新页面。",pending:null};
function updateBuild(text){
  const m=String(text).match(/\b(?:BUILD_ID|SW_BUILD)\s*=\s*["'](\d+\.\d+\.\d+-\d{8})["']/);
  return m?m[1]:null;
}
function compareAppBuild(a,b){
  const parse=x=>/^\d+\.\d+\.\d+-\d{8}$/.test(x||"")?x.split(/[.-]/).map(Number):null;
  const aa=parse(a),bb=parse(b);if(!aa||!bb)return null;
  for(let i=0;i<aa.length;i++)if(aa[i]!==bb[i])return aa[i]>bb[i]?1:-1;
  return 0;
}
function updateVerdict(page,server,worker){
  const cmp=compareAppBuild(server,page);
  if(cmp===null)return {ready:false,status:"无法识别版本",detail:"站点未返回有效构建号；不执行更新。"};
  if(cmp<0)return {ready:false,status:"站点返回旧版",detail:"当前页面较新。请检查 VPS 同步或 CDN 缓存，不要回退页面。"};
  if(server!==worker)return {ready:false,status:"发布尚未配齐",detail:"index.html 与 sw.js 版本不一致或无法核对，请完成同步后重试。"};
  return {ready:cmp>0,status:cmp>0?"有新版可用":"页面与站点一致",detail:cmp>0?"确认后再更新；不会自动刷新。":"这里只核对当前域名返回的文件，不代表 GitHub 或 VPS 源文件已同步。"};
}
async function fetchUpdateFile(file){
  const url=new URL(file,location.href);
  url.searchParams.set("_btc_update",Date.now()+"-"+Math.random().toString(36).slice(2));
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{
    const response=await fetch(url.toString(),{cache:"no-store",signal:controller.signal,redirect:"error"});
    if(!response.ok)throw new Error("HTTP "+response.status);
    return await response.text();
  }finally{clearTimeout(timer)}
}
function workerVersion(worker,timeout=1800){
  if(!worker||typeof MessageChannel==="undefined")return Promise.resolve(null);
  return new Promise(resolve=>{
    const channel=new MessageChannel();let done=false;
    const finish=value=>{if(done)return;done=true;clearTimeout(timer);channel.port1.close();channel.port2.close();resolve(value)};
    const timer=setTimeout(()=>finish(null),timeout);
    channel.port1.onmessage=event=>finish(compareAppBuild(event.data?.build,BUILD_ID)===null?null:event.data.build);
    try{worker.postMessage({type:"BTC_GET_VERSION"},[channel.port2])}catch(_){finish(null)}
  });
}
function renderAppUpdate(){
  const s=APP_UPDATE,put=(id,value)=>{const el=$(id);if(el)el.textContent=value};
  put("updatePageBuild",BUILD_ID);put("updateServerBuild",s.server||"未确认");
  put("updateWorkerBuild",s.worker||"未确认");
  put("updateControllerBuild",s.controller||("serviceWorker"in navigator&&navigator.serviceWorker.controller?"旧缓存程序不支持核对":"未控制当前页面"));
  put("updateStatus",s.status);put("updateDetail",s.detail);
  put("updateCheckedAt",s.checkedAt?"检查于 "+new Date(s.checkedAt).toLocaleTimeString("zh-CN"):"尚未检查");
  const check=$("updateCheckBtn"),apply=$("updateApplyBtn");
  if(check)check.disabled=s.busy||s.applying;
  if(apply){apply.disabled=!s.ready||s.busy||s.applying;apply.textContent=s.applying?"正在准备…":"确认更新"}
  const banner=$("updateBanner");if(banner)banner.classList.toggle("on",s.ready);
  put("updateText",`有新版本 ${String(s.server||"").split("-")[0]}。点按「更新」安装。`);
  if(typeof renderHealthRuntime==="function")renderHealthRuntime();
}
function inspectAppUpdate(){
  if(APP_UPDATE.pending)return APP_UPDATE.pending;
  if(!/^https?:$/.test(location.protocol)){APP_UPDATE.status="本地文件不检查更新";renderAppUpdate();return Promise.resolve(APP_UPDATE)}
  APP_UPDATE.busy=true;APP_UPDATE.ready=false;APP_UPDATE.status="正在核对";renderAppUpdate();
  APP_UPDATE.pending=(async()=>{
    try{
      const [html,sw,controller]=await Promise.all([fetchUpdateFile("./index.html"),fetchUpdateFile("./sw.js"),workerVersion(navigator.serviceWorker?.controller)]);
      APP_UPDATE.server=updateBuild(html);APP_UPDATE.worker=updateBuild(sw);APP_UPDATE.controller=controller;
      Object.assign(APP_UPDATE,updateVerdict(BUILD_ID,APP_UPDATE.server,APP_UPDATE.worker));
      if(compareAppBuild(controller,APP_UPDATE.server)===1){
        APP_UPDATE.ready=false;APP_UPDATE.status="缓存版本高于站点";APP_UPDATE.detail="站点可能回退或尚未同步；不自动降级，请先检查部署。";
      }else if(!APP_UPDATE.ready&&APP_UPDATE.status==="页面与站点一致"&&navigator.serviceWorker?.controller&&controller!==BUILD_ID){
        APP_UPDATE.ready=true;APP_UPDATE.status="页面已更新，缓存待同步";APP_UPDATE.detail="确认后同步缓存程序并重载页面，不清除个人数据。";
      }
    }catch(_){
      APP_UPDATE.server=null;APP_UPDATE.worker=null;APP_UPDATE.ready=false;
      APP_UPDATE.status=navigator.onLine===false?"设备离线":"版本核对失败";
      APP_UPDATE.detail="没有用历史缓存冒充检查结果；保留当前页面，稍后重试。";
    }finally{APP_UPDATE.checkedAt=Date.now();APP_UPDATE.busy=false;APP_UPDATE.pending=null;renderAppUpdate()}
    return APP_UPDATE;
  })();
  return APP_UPDATE.pending;
}
async function waitUpdateWorker(reg,expected){
  const deadline=Date.now()+15000;
  while(Date.now()<deadline){
    for(const candidate of [reg.waiting,reg.active]){
      if(candidate&&await workerVersion(candidate)===expected)return candidate;
    }
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  throw new Error("缓存程序尚未准备好，请稍后重试");
}
async function applyAppUpdate(){
  if(APP_UPDATE.applying)return;
  if(!confirm("更新会重新加载页面。请先保存未提交的输入；建议先导出个人 JSON 并确认已保存。\n不会清除持仓、账本或预算。继续核对并更新？"))return;
  APP_UPDATE.applying=true;renderAppUpdate();
  try{
    const s=await inspectAppUpdate();if(!s.ready)throw new Error(s.status);
    const expected=s.server;
    if("serviceWorker"in navigator&&location.protocol==="https:"){
      const reg=await navigator.serviceWorker.register("./sw.js",{scope:"./",updateViaCache:"none"});
      await reg.update();
      const worker=await waitUpdateWorker(reg,expected);
      // Recheck deployment immediately before activation; never activate a different build.
      const [html,sw]=await Promise.all([fetchUpdateFile("./index.html"),fetchUpdateFile("./sw.js")]);
      if(updateBuild(html)!==expected||updateBuild(sw)!==expected)throw new Error("发布内容已变化，请重新核对");
      if(worker===reg.waiting){
        worker.postMessage({type:"BTC_ACTIVATE_UPDATE",build:expected});
        const deadline=Date.now()+10000;
        while(await workerVersion(navigator.serviceWorker.controller)!==expected){
          if(Date.now()>deadline)throw new Error("缓存切换尚未确认，请稍后重试");
          await new Promise(resolve=>setTimeout(resolve,200));
        }
      }
    }
    const url=new URL(location.href);url.searchParams.set("v",expected);url.searchParams.delete("_build");location.replace(url.toString());
  }catch(error){APP_UPDATE.ready=false;APP_UPDATE.status="未执行页面刷新";APP_UPDATE.detail=error.message||"更新失败，请稍后重试"}
  finally{APP_UPDATE.applying=false;renderAppUpdate()}
}
async function registerAppWorker(){
  if(!("serviceWorker"in navigator)||location.protocol!=="https:")return;
  try{
    const checked=await inspectAppUpdate();
    if(checked.server!==checked.worker||compareAppBuild(checked.server,BUILD_ID)===null||compareAppBuild(checked.server,BUILD_ID)<0||compareAppBuild(checked.controller,checked.server)===1)return;
    const reg=await navigator.serviceWorker.register("./sw.js",{scope:"./",updateViaCache:"none"});
    await reg.update();
  }catch(_){HEALTH_RUNTIME.swState="注册失败"}
  // No automatic reload or skipWaiting. Older clients may keep using their existing worker.
  runRuntimeDiagnostics();
}
function appUpdateReport(){
  const s=APP_UPDATE;
  return [`页面构建：${BUILD_ID}`,`站点页面：${s.server||"未确认"}`,`站点缓存程序：${s.worker||"未确认"}`,`当前缓存程序：${s.controller||"未确认"}`,`版本核对：${s.status}`,`检查时间：${s.checkedAt?new Date(s.checkedAt).toISOString():"尚未检查"}`].join("\n");
}

/* Observed changes only. Independent from trading records and retrospective charts. */
const CHANGE_JOURNAL_KEY="btc_change_journal_v1",CHANGE_JOURNAL_LIMIT=200;
const CHANGE_STREAMS={classic:"AHR999 经典",refit:"AHR999 新拟合",cost:"成本结构"};
const CHANGE_ZONES=["深度低估","长期低估","估值偏热","高估风险"];
const CHANGE_COSTS=["EXPANSION","STH_TEST","COMPRESSION","DELEVERAGING","CAPITULATION","RECLAIM"];
const CHANGE_VALUE_KEYS=["price","index","dma200","low","high","risk","sth","tmm","c50","f5","f2","p95","p99","p995","realized","profitPct"];
let changeMemory={schema:1,baselines:{},events:[],savedAt:0},changeQueue=Promise.resolve(),changeStorageNote="等待有效观察",changeFilter="all",changeShown=20;
function changeSnapshot(raw,now=Date.now()){
  if(!raw||!Object.hasOwn(CHANGE_STREAMS,raw.stream)||!Number.isFinite(raw.at)||raw.at<=0||raw.at>now+1000)return null;
  if(typeof raw.rules!=="string"||!raw.rules.length||raw.rules.length>150||!/^\d+\.\d+\.\d+-\d{8}$/.test(raw.build||""))return null;
  if(raw.stream==="cost"?!CHANGE_COSTS.includes(raw.state):!Number.isInteger(raw.state)||raw.state<0||raw.state>3)return null;
  const values={};for(const key of CHANGE_VALUE_KEYS)if(typeof raw.values?.[key]==="number"&&Number.isFinite(raw.values[key])&&raw.values[key]>=0)values[key]=raw.values[key];
  if(!(values.price>0)||raw.stream!=="cost"&&!(values.index>0&&values.dma200>0&&values.low>0&&values.high>values.low&&values.risk>values.high))return null;
  const sources=Array.isArray(raw.sources)?raw.sources.map(s=>({name:String(s?.name||"").slice(0,60),day:String(s?.day||""),status:String(s?.status||"").slice(0,20)})):[];
  if(!sources.length||sources.length>4||sources.some(s=>!s.name||!/^\d{4}-\d{2}-\d{2}$/.test(s.day)||!Number.isFinite(Date.parse(s.day+"T00:00:00Z"))||new Date(s.day+"T00:00:00Z").toISOString().slice(0,10)!==s.day||s.day>new Date(now).toISOString().slice(0,10)))return null;
  const quoteAt=Number.isFinite(raw.quoteAt)&&raw.quoteAt>0&&raw.quoteAt<=raw.at?raw.quoteAt:null;
  return {stream:raw.stream,at:raw.at,quoteAt,build:raw.build,rules:raw.rules,state:raw.state,values,sources};
}
function changeRead(raw,now=Date.now()){
  if(raw==null)return {schema:1,baselines:{},events:[],savedAt:0};
  const data=typeof raw==="string"?JSON.parse(raw):raw;
  if(data?.schema!==1||!data.baselines||!Array.isArray(data.events))throw Error("变化记录格式异常");
  const baselines={};for(const key of Object.keys(CHANGE_STREAMS)){const snap=changeSnapshot(data.baselines[key],now);if(snap&&snap.stream===key)baselines[key]=snap;}
  const events=data.events.map(e=>{
    if(!e||!["zone","cost","revision"].includes(e.type)||typeof e.id!=="string"||e.id.length>250)return null;
    const before=changeSnapshot(e.before,now),after=changeSnapshot(e.after,now);
    if(!before||!after||before.stream!==after.stream||after.at<=before.at)return null;
    return {id:e.id,type:e.type,before,after,fields:Array.isArray(e.fields)?e.fields.filter(k=>CHANGE_VALUE_KEYS.includes(k)):[]};
  }).filter(Boolean).sort((a,b)=>a.after.at-b.after.at).slice(-CHANGE_JOURNAL_LIMIT);
  return {schema:1,baselines,events,savedAt:Number.isFinite(data.savedAt)?data.savedAt:0};
}
function changeMerge(a,b){
  const out=changeRead(a);b=changeRead(b);
  for(const [key,snap] of Object.entries(b.baselines))if(!out.baselines[key]||snap.at>out.baselines[key].at)out.baselines[key]=snap;
  out.events=[...new Map([...out.events,...b.events].map(e=>[e.id,e])).values()].sort((x,y)=>x.after.at-y.after.at).slice(-CHANGE_JOURNAL_LIMIT);
  out.savedAt=Math.max(out.savedAt,b.savedAt);return out;
}
function changeAdvance(store,batch,now=Date.now()){
  const next=changeRead(store,now);let added=0;
  for(const raw of batch){
    const after=changeSnapshot(raw,now);if(!after)continue;
    const before=next.baselines[after.stream];
    if(before&&after.at<=before.at)continue;
    if(before?.quoteAt&&after.quoteAt&&after.quoteAt<before.quoteAt)continue;
    const compatible=before&&before.rules===after.rules&&before.sources.map(s=>s.name).join("|")===after.sources.map(s=>s.name).join("|");
    if(compatible&&after.sources.some((s,i)=>s.day<before.sources[i].day))continue;
    const append=(type,fields=[])=>{
      const id=[after.stream,type,before.at,after.at].join(":");
      if(!next.events.some(e=>e.id===id)){next.events.push({id,type,before,after,fields});added++;}
    };
    if(compatible){
      if(before.state!==after.state)append(after.stream==="cost"?"cost":"zone");
      const sameDays=before.sources.every((s,i)=>s.day===after.sources[i].day);
      const keys=after.stream==="cost"?["sth","tmm","c50","f5","f2","p95","p99","p995","realized"]:["dma200"];
      const fields=keys.filter(k=>before.values[k]>0&&after.values[k]>0&&Math.abs(after.values[k]/before.values[k]-1)>=.001);
      if(sameDays&&fields.length)append("revision",fields);
    }
    // First observation, different formula/source coverage: establish a baseline, not a crossing.
    next.baselines[after.stream]=after;
  }
  next.events=next.events.sort((a,b)=>a.after.at-b.after.at).slice(-CHANGE_JOURNAL_LIMIT);
  return {store:next,added};
}
function changeLiveReady(now=Date.now()){
  return !S.manualPrice&&!S.tweak&&!fetchInFlight&&navigator.onLine!==false&&HEALTH_RUNTIME.online!==false&&HEALTH_RUNTIME.priceConsensus?.status!=="conflict"&&Number.isFinite(S.price)&&S.price>0&&lastTickAt>0&&now>=lastTickAt&&now-lastTickAt<=staleLimit("价格");
}
function changeCaptureAhr(now=Date.now()){
  if(!changeLiveReady(now)||!S.ahr)return [];
  const q=healthQuality("AHR999");if(!["ok","fallback","cache"].includes(q.status)||q.weight<.75||!q.dataDay)return [];
  const batch=[];
  for(const stream of ["classic","refit"]){
    const snap=focusAhrSnapshot(S.ahr,stream==="classic"?"classic":"refit",now);if(!snap)continue;
    batch.push({stream,at:now,quoteAt:lastTickAt,build:BUILD_ID,rules:`ahr-zones-v2-fixed:${AHR_A0},${AHR_B0};${AHR_A},${AHR_B}`,state:snap.zone,
      values:{price:S.price,index:snap.value,dma200:S.ahr.dma,low:.45*snap.scale,high:1.2*snap.scale,risk:5*snap.scale},sources:[{name:"200日成本 / 站内AHR999",day:q.dataDay,status:q.status}]});
  }
  return batch;
}
function changeCaptureCost(state,input,now=Date.now()){
  if(!changeLiveReady(now)||!input?.trusted||!CHANGE_COSTS.includes(state))return null;
  const sources=input.sources.filter(s=>s.valid);if(sources.length<2||sources.some(s=>s.kind!=="good"))return null;
  const values={price:input.spot};for(const k of CHANGE_VALUE_KEYS)if(k!=="price"&&input[k]!=null)values[k]=input[k];
  return {stream:"cost",at:now,quoteAt:lastTickAt,build:BUILD_ID,rules:"cost-state-v25-hysteresis-2-3-6",state,values,sources:sources.map(s=>({name:s.name,day:s.day,status:"及时"}))};
}
function changeObserve(batch){
  if(!batch.length)return changeQueue;
  // Snapshots are copied before acquiring a lock, so later UI changes cannot mutate evidence.
  batch=batch.map(s=>changeSnapshot(s)).filter(Boolean);if(!batch.length)return changeQueue;
  changeQueue=changeQueue.then(async()=>{
    const process=()=>{
      let persisted;try{persisted=changeRead(localStorage.getItem(CHANGE_JOURNAL_KEY));}
      catch(_){changeMemory=changeAdvance(changeMemory,batch).store;changeStorageNote="存储不可读或格式异常；仅本页暂存，原记录未覆盖";return;}
      const base=changeMerge(persisted,changeMemory),result=changeAdvance(base,batch);changeMemory=result.store;
      const unsaved=result.added||changeMemory.events.some(e=>!persisted.events.some(x=>x.id===e.id));
      if(unsaved||!persisted.savedAt||Date.now()-persisted.savedAt>=300000){
        try{const saved={...changeMemory,savedAt:Date.now()};localStorage.setItem(CHANGE_JOURNAL_KEY,JSON.stringify(saved));changeMemory=saved;changeStorageNote="本机已保存 · 最多200条";}
        catch(_){changeStorageNote="保存失败；新记录仅本页暂存，请导出";}
      }else changeStorageNote="观察中 · 基线最多每5分钟保存，事件即时保存";
    };
    if(!navigator.locks?.request){changeMemory=changeAdvance(changeMemory,batch).store;changeStorageNote="不支持跨页面协调；仅本页暂存，请导出";}
    else{
      const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),2500);
      try{await navigator.locks.request(CHANGE_JOURNAL_KEY,{mode:"exclusive",signal:ctl.signal},process);}
      catch(_){changeMemory=changeAdvance(changeMemory,batch).store;changeStorageNote="协调未完成；仅本页暂存，请稍后观察或导出";}
      finally{clearTimeout(timer);}
    }
    renderChangeJournal();
  }).catch(()=>{changeStorageNote="本次记录未完成，不影响行情或账本";renderChangeJournal()});
  return changeQueue;
}
function collectImportantChanges(){
  try{
    const batch=changeCaptureAhr();
    if(moduleIsReady("coststate")){
      const input=costStructureInput(),result=costStructureClassify(input,costStateRead()?.state||"");
      const snap=changeCaptureCost(result.state,input);if(snap)batch.push(snap);
    }
    return changeObserve(batch);
  }catch(_){return Promise.resolve();}
}
function changeStateName(snap){return snap.stream==="cost"?(COST_STATE_META[snap.state]?.label||snap.state):CHANGE_ZONES[snap.state]}
function changeTitle(event){return event.type==="revision"?"同数据日输入变化 · 待核对":`${changeStateName(event.before)} → ${changeStateName(event.after)}`}
function changeEvidence(snap){
  const labels={price:"BTC 价格",index:"指数",dma200:"200日成本",low:"深度低估边界",high:"低估区上沿",risk:"高估边界",sth:"STH",tmm:"TMM",c50:"C50",f5:"F5",f2:"F2",p95:"p95",p99:"p99",p995:"p99.5",realized:"实现均价",profitPct:"获利筹码占比"};
  return `<p>价格与成本单位：USD${snap.quoteAt?" · 行情更新 "+esc(new Date(snap.quoteAt).toLocaleString("zh-CN")):""}</p><dl>${Object.entries(snap.values).map(([k,v])=>`<dt>${labels[k]||esc(k)}</dt><dd>${Number(v).toLocaleString("en-US",{maximumFractionDigits:["index","low","high","risk"].includes(k)?5:2})}${k==="profitPct"?"%":""}</dd>`).join("")}</dl><p>${snap.sources.map(s=>`${esc(s.name)} · UTC数据日 ${esc(s.day)} · ${esc(s.status)}`).join("<br>")}</p><p>构建 ${esc(snap.build)}<br>口径 ${esc(snap.rules)}</p>`;
}
function renderChangeJournal(){
  const panel=$("changeJournal"),note=$("changeJournalStatus"),latest=Math.max(0,...Object.values(changeMemory.baselines).map(s=>s.at));
  if(note)note.textContent=changeStorageNote+(latest?" · 最近有效观察 "+new Date(latest).toLocaleString("zh-CN"):"");
  if(!panel?.open)return;
  const list=$("changeJournalList"),all=changeMemory.events.slice().reverse().filter(e=>changeFilter==="all"||(changeFilter==="revision"?e.type==="revision":e.after.stream===changeFilter));
  if(list)list.innerHTML=all.length?all.slice(0,changeShown).map(e=>`<details class="change-event"><summary><span><small>${esc(CHANGE_STREAMS[e.after.stream])} · ${esc(new Date(e.after.at).toLocaleString("zh-CN"))}</small><b>${esc(changeTitle(e))}</b></span></summary><p>发现时间，不是实际穿越时刻；与上次有效观察 ${esc(new Date(e.before.at).toLocaleString("zh-CN"))} 比较。${e.after.at-e.before.at>86400000?"两次观察间隔超过1天，期间路径未知。":""}${e.type==="revision"?" 同数据日输入相邻变化至少0.1%；可能与数据源或处理口径有关，不代表已确认源数据修订。":""}</p><div class="change-evidence"><section><b>上次依据</b>${changeEvidence(e.before)}</section><section><b>本次依据</b>${changeEvidence(e.after)}</section></div></details>`).join(""):'<p>暂无符合条件的变化。首次有效观察只建立基线；不会补造历史事件。</p>';
  const more=$("changeJournalMore");if(more)more.hidden=all.length<=changeShown;
  const count=$("changeJournalCount");if(count)count.textContent=`${all.length} 条记录`;
}
function filterChangeJournal(value){changeFilter=["all","classic","refit","cost","revision"].includes(value)?value:"all";changeShown=20;renderChangeJournal()}
async function exportChangeJournal(){
  await changeQueue;
  try{
    const data={app:"BTC-CHANGES",schema:1,build:BUILD_ID,exportedAt:new Date().toISOString(),note:"本机观察记录；不是交易指令，不是连续市场历史。与个人账本备份分开保存。",journal:changeMemory};
    const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download=`btc-change-journal-${new Date().toISOString().slice(0,10)}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);ntf("记录文件已生成，请保存到「文件」");
  }catch(_){ntf("记录导出失败，请稍后重试");}
}
function initChangeJournal(){
  try{changeMemory=changeRead(localStorage.getItem(CHANGE_JOURNAL_KEY));changeStorageNote=changeMemory.savedAt?"已读取本机记录 · 最多200条":"等待首个有效观察";}catch(_){changeStorageNote="存储不可读或格式异常；不会自动覆盖";}
  $("changeJournal")?.addEventListener("toggle",()=>{if($("changeJournal").open)renderChangeJournal()});
  window.addEventListener("storage",event=>{if(event.key===CHANGE_JOURNAL_KEY&&event.newValue){try{changeMemory=changeMerge(changeMemory,changeRead(event.newValue));renderChangeJournal()}catch(_){}}});
  renderChangeJournal();
}
const changeOriginalStatusCommit=commitStatusSnapshot;
commitStatusSnapshot=function(...args){const out=changeOriginalStatusCommit(...args);collectImportantChanges();return out;};
const changeOriginalCostCommit=costStateCommit;
costStateCommit=function(state,input){const out=changeOriginalCostCommit(state,input);try{const snap=changeCaptureCost(state,input);if(snap)changeObserve([snap]);}catch(_){}return out;};

/* Read-only cycle comparison. Daily reference prices, not OHLC extremes or trading signals. */
const CYCLE_DAY=86400,CYCLE_TTL=6*3600e3,CYCLE_KEY="btc_cycle_daily_v1";
const CYCLE_URL="https://api.blockchain.info/charts/market-price?timespan=all&sampled=false&metadata=false&cors=true&format=json";
const CYCLE_SOURCES=[{name:"Bitview / BRK",url:"https://bitview.space/api/series/bulk?index=day1&series=date,price_close&start=2010-08-18"},{name:"Blockchain.com",url:CYCLE_URL}];
let cycleProvider="",cycleOrigin="",cycleFailures=[];
// Explicit retrospective windows. Halving boundaries misclassify the March 2024 ATH.
const CYCLE_STARTS=["2010-08-18","2012-01-01","2016-01-01","2020-01-01","2024-01-01"].map(d=>Date.parse(d+"T00:00:00Z")/1000);
const CYCLE_LABELS=["2011周期","2013周期","2017周期","2021周期","2024起"];
const CYCLE_COLORS=["#6c84df","#c97842","#398e84","#ae4167","#885cc8"];
let cycleRows=[],cycleFetchedAt=0,cycleAttemptAt=0,cycleBusy=false,cycleError="",cycleMemoryOnly=false,cycleScale="log",cycleHidden=new Set(),cycleModel=[],cyclePlot=null,cycleCursor=null,cycleFrame=0,cycleStarted=false;
function cycleNormalize(raw,now=Date.now()){
  if(typeof raw==="string"){try{raw=JSON.parse(raw)}catch(_){return []}}
  if(Array.isArray(raw)&&raw.length===2&&Array.isArray(raw[0]?.data)&&Array.isArray(raw[1]?.data)){
    const [dates,prices]=raw;
    if(dates.index!=="day1"||prices.index!=="day1"||dates.start!==prices.start||dates.end!==prices.end||dates.data.length!==prices.data.length)return [];
    raw=dates.data.map((d,i)=>({x:/^\d{4}-\d{2}-\d{2}$/.test(d)?Date.parse(d+"T00:00:00Z")/1000:NaN,y:prices.data[i]}));
  }
  const today=Math.floor(now/864e5)*CYCLE_DAY,map=new Map();
  for(const r of Array.isArray(raw)?raw:Array.isArray(raw?.values)?raw.values:[]){
    const stamp=Number(r?.x??r?.time),close=Number(r?.y??r?.close),time=Math.floor(stamp/CYCLE_DAY)*CYCLE_DAY;
    if(Number.isFinite(stamp)&&time>=CYCLE_STARTS[0]&&time<today&&Number.isFinite(close)&&close>0)map.set(time,{time,close});
  }
  return [...map.values()].sort((a,b)=>a.time-b.time);
}
function cycleValid(rows,now=Date.now()){
  if(!Array.isArray(rows)||rows.length<1000||rows[0].time>CYCLE_STARTS[0]+7*CYCLE_DAY||rows.at(-1).time<Math.min(now/1000,CYCLE_STARTS[4])-31*CYCLE_DAY)return false;
  return rows.every((r,i)=>Number.isFinite(r.close)&&r.close>0&&Number.isFinite(r.time)&&(!i||r.time>rows[i-1].time));
}
function cycleBuild(rows,quote=null,now=Date.now()){
  const today=Math.floor(now/864e5)*CYCLE_DAY;
  return CYCLE_STARTS.map((start,i)=>{
    const end=CYCLE_STARTS[i+1]||today,current=i===4,samples=rows.filter(r=>r.time>=start&&r.time<end);
    if(samples.length<2)return {id:i,current,missing:true};
    const peak=samples.reduce((a,b)=>b.close>a.close?b:a),after=samples.filter(r=>r.time>=peak.time),low=after.reduce((a,b)=>b.close<a.close?b:a);
    const endpoint=current?after.at(-1):low,points=after.filter(r=>r.time<=endpoint.time).map(r=>({...r,day:(r.time-peak.time)/CYCLE_DAY,ratio:r.close/peak.close,live:false}));
    const validQuote=current&&quote&&Number.isFinite(quote.close)&&quote.close>0&&Number.isFinite(quote.time)&&quote.time<=now/1000&&now/1000-quote.time<=180&&quote.time>endpoint.time+CYCLE_DAY;
    if(validQuote)points.push({time:quote.time,close:quote.close,day:(quote.time-peak.time)/CYCLE_DAY,ratio:quote.close/peak.close,live:true});
    let missingDays=0;for(let n=1;n<samples.length;n++)missingDays+=Math.max(0,Math.round((samples[n].time-samples[n-1].time)/CYCLE_DAY)-1);
    const expectedLast=(current?today:end)-CYCLE_DAY,edgeGap=samples[0].time>start+CYCLE_DAY||samples.at(-1).time<expectedLast-CYCLE_DAY;
    const last=points.at(-1);
    return {id:i,current,missing:false,peak,low,last,points,days:Math.floor(last.day),missingDays,incomplete:edgeGap||missingDays>0,abovePeak:last.ratio>1,stale:current&&today-samples.at(-1).time>3*CYCLE_DAY};
  });
}
function cycleQuote(now=Date.now()){
  if(S.manualPrice||S.tweak||fetchInFlight||navigator.onLine===false||HEALTH_RUNTIME.online===false||HEALTH_RUNTIME.priceConsensus?.status==="conflict"||!(S.price>0)||!Number.isFinite(S.price)||!(lastTickAt>0)||now<lastTickAt||now-lastTickAt>180000)return null;
  return {time:lastTickAt/1000,close:S.price};
}
function cycleDate(t){return new Date(t*1000).toISOString().slice(0,10)}
function cycleMoney(n){return "$"+n.toLocaleString("en-US",{maximumFractionDigits:n<10?2:0})}
function cyclePercent(r){return (r>1?"+":"")+((r-1)*100).toFixed(1)+"%"}
function cycleDuration(c){
  if(c.missing)return '<small class="cycle-duration">数据不足</small>';
  return `<small class="cycle-duration${c.current?" is-running":""}"><span>${c.current?"进行中":"到低点"}</span><strong>${c.days} 天</strong></small>`;
}
function cycleActive(){const fold=$("cycleDrawdownFold"),el=$("cycleDrawdown");return !!(fold?.open&&el?.getClientRects().length&&document.visibilityState!=="hidden")}
function cycleQueue(){if(!cycleStarted||cycleFrame||!cycleActive())return;cycleFrame=requestAnimationFrame(()=>{cycleFrame=0;renderCycleDrawdown()})}
function setCycleScale(scale){if(!["log","linear"].includes(scale))return;cycleScale=scale;renderCycleDrawdown()}
function toggleCycle(id){if(!Number.isInteger(id)||id<0||id>4)return;cycleHidden.has(id)?cycleHidden.delete(id):cycleHidden.add(id);renderCycleDrawdown()}
function cycleReadCache(){
  try{const data=JSON.parse(localStorage.getItem(CYCLE_KEY));if(data?.schema!==1||!CYCLE_SOURCES.some(s=>s.name===data.source)||!(data.ts>0)||data.ts>Date.now())return;const rows=cycleNormalize(data.rows);if(cycleValid(rows)&&(!cycleRows.length||rows.at(-1).time>=cycleRows.at(-1).time)){cycleRows=rows;cycleFetchedAt=data.ts;cycleProvider=data.source;cycleOrigin="本机缓存";}}catch(_){}
}
function cycleReadSeed(){
  if(typeof CYCLE_SEED==="undefined"||!CYCLE_SOURCES.some(s=>s.name===CYCLE_SEED.source))return;
  const rows=cycleNormalize(CYCLE_SEED.rows);
  if(cycleValid(rows)&&(!cycleRows.length||rows.at(-1).time>cycleRows.at(-1).time)){cycleRows=rows;cycleFetchedAt=0;cycleProvider=CYCLE_SEED.source;cycleOrigin="内置真实快照";}
}
async function refreshCycleDrawdown(force=false){
  if(cycleBusy)return;
  if(!force&&cycleRows.length&&Date.now()-cycleFetchedAt<CYCLE_TTL){renderCycleDrawdown();return}
  if(!force&&Date.now()-cycleAttemptAt<300000)return;
  if(navigator.onLine===false){cycleError="离线，保留已有历史";renderCycleDrawdown();return}
  cycleBusy=true;cycleAttemptAt=Date.now();cycleError="";cycleFailures=[];renderCycleDrawdown();
  try{
    let loaded=false;
    for(const source of CYCLE_SOURCES){
      try{
        const rows=cycleNormalize(await tryFetch(source.url,12000));
        if(!cycleValid(rows))throw Error("coverage");
        if(cycleRows.length&&rows.at(-1).time<cycleRows.at(-1).time)throw Error("regressed");
        cycleRows=rows;cycleFetchedAt=Date.now();cycleMemoryOnly=false;cycleProvider=source.name;cycleOrigin="在线历史";
        try{localStorage.setItem(CYCLE_KEY,JSON.stringify({schema:1,source:source.name,ts:cycleFetchedAt,rows}))}catch(_){cycleMemoryOnly=true}
        loaded=true;break;
      }catch(error){cycleFailures.push(source.name+"："+(error?.message==="coverage"?"格式或覆盖不足":error?.message==="regressed"?"日期早于现有历史":"请求失败"))}
    }
    if(!loaded)throw Error("all sources failed");
  }catch(_){cycleError=cycleRows.length?"历史更新失败，保留上次数据":"历史获取失败，请点更新重试"}
  finally{cycleBusy=false;renderCycleDrawdown()}
}
function renderCycleDrawdown(){
  if(!$("cycleDrawdown"))return;
  cycleModel=cycleBuild(cycleRows,cycleQuote());
  const latest=cycleRows.at(-1),stale=latest&&Date.now()/1000-latest.time>3*CYCLE_DAY;
  $("cycleDataStatus").textContent=cycleBusy?"历史更新中…":cycleError|| (latest?(stale?"历史较旧 · ":"历史截至 ")+cycleDate(latest.time):"等待历史数据");
  const refresh=$("cycleRefresh");refresh.disabled=cycleBusy;refresh.textContent=cycleBusy?"更新中":"更新";refresh.setAttribute("aria-busy",String(cycleBusy));
  document.querySelectorAll("[data-cycle-scale]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.cycleScale===cycleScale)));
  $("cycleSource").textContent=latest?`${cycleProvider||"历史数据"} · ${cycleOrigin||"本页数据"} · ${cycleProvider==="Bitview / BRK"?"USD 日收盘价":"USD 日参考价"} · ${cycleDate(cycleRows[0].time)} — ${cycleDate(latest.time)}（UTC） · 历史每6小时检查${cycleMemoryOnly?" · 缓存未保存，本页暂存":""}。${cycleFailures.length?cycleFailures.join("；")+"。":""}虚线端点为有效站内报价，不改写历史。`:"数据未就绪时不显示示例收益或模拟历史。";
  $("cycleCards").innerHTML=cycleModel.map(c=>{
    const header=`<div class="cycle-card-head"><button type="button" onclick="toggleCycle(${c.id})" aria-pressed="${!cycleHidden.has(c.id)}" aria-label="切换第${c.id+1}期曲线"><i></i>第 ${c.id+1} 期 · ${CYCLE_LABELS[c.id]}</button>${cycleDuration(c)}</div>`;
    if(c.missing)return `<article class="cycle-card" style="--cycle-color:${CYCLE_COLORS[c.id]}">${header}<p class="cycle-warning">本期历史缺失，暂不计算。</p></article>`;
    return `<article class="cycle-card${c.current?" is-current":""}" style="--cycle-color:${CYCLE_COLORS[c.id]}">${header}<div class="cycle-endpoints"><div><span>日参考顶部</span><strong>${cycleMoney(c.peak.close)}</strong><small>${cycleDate(c.peak.time)}</small></div><div><span>${c.current?(c.last.live?"站内报价":"最新日参考价"):"历史日参考低点"}</span><strong>${cycleMoney(c.last.close)}</strong><small>${cycleDate(c.last.time)}${c.last.live?" "+new Date(c.last.time*1000).toISOString().slice(11,16)+" UTC":""}</small></div></div><div class="cycle-track"></div><div class="cycle-result"><b>${cyclePercent(c.last.ratio)}</b><span>${c.last.ratio.toFixed(4)} × 顶部价格</span></div>${c.current?`<p class="cycle-warning">已观测日参考低点 ${cycleMoney(c.low.close)} · ${cycleDate(c.low.time)} · ${cyclePercent(c.low.close/c.peak.close)}；不是已确认底部。${c.abovePeak?"现价高于日参考顶部，等待日数据更新。":""}${!c.last.live?"当前无有效即时点，仅展示日数据。":""}</p>`:""}${c.incomplete?`<p class="cycle-warning">${c.missingDays?`窗口缺 ${c.missingDays} 个日样本；`:"窗口边界覆盖不足；"}端点仅为已有样本极值，缺口不补画。</p>`:""}</article>`;
  }).join("");
  drawCycleChart();
}
function cyclePath(points,x,y,live=false){
  let prev=null;return points.map(r=>{const move=!prev||r.day-prev.day>1.5||r.live&&!live;const out=(move?"M":"L")+x(r.day).toFixed(2)+","+y(r.ratio).toFixed(2);prev=r;return out}).join(" ");
}
function drawCycleChart(){
  const svg=$("cycleChart"),available=cycleModel.filter(c=>!c.missing&&!cycleHidden.has(c.id)),empty=$("cycleEmpty");
  if(!available.length){svg.setAttribute("hidden","");svg.innerHTML="";cyclePlot=null;empty.hidden=false;empty.textContent=cycleRows.length?"所有曲线已隐藏，点下方周期名称恢复。":cycleBusy?"正在获取历史价格…":cycleError||"等待有效历史数据；不使用模拟曲线。";$("cycleReadout").textContent="暂无可查看曲线";return}
  empty.hidden=true;svg.removeAttribute("hidden");
  const points=available.flatMap(c=>c.points),maxDay=Math.max(30,...points.map(r=>r.day)),xMax=Math.ceil(maxDay/50)*50,minRatio=Math.min(...points.map(r=>r.ratio)),maxRatio=Math.max(1,...points.map(r=>r.ratio));
  const yMin=cycleScale==="log"?Math.pow(2,Math.floor(Math.log2(minRatio))):0,yMax=maxRatio<=1?1:cycleScale==="log"?Math.pow(2,Math.ceil(Math.log2(maxRatio))):Math.ceil(maxRatio*4)/4;
  const x=d=>68+d/xMax*554,y=r=>20+(cycleScale==="log"?(Math.log(yMax)-Math.log(r))/(Math.log(yMax)-Math.log(yMin)||1):(yMax-r)/(yMax-yMin||1))*280;
  const ticks=cycleScale==="log"?Array.from({length:Math.round(Math.log2(yMax/yMin))+1},(_,i)=>yMax/2**i):Array.from({length:5},(_,i)=>yMax*(4-i)/4);
  let out="";for(const tick of ticks){const py=y(tick);out+=`<line x1="68" x2="622" y1="${py}" y2="${py}" stroke="currentColor" opacity=".15"/><text x="57" y="${py+6}" text-anchor="end" fill="currentColor" font-size="19">${Number(tick.toPrecision(3))}</text>`}
  for(let i=0;i<=4;i++){const day=Math.round(xMax*i/4),px=x(day);out+=`<text x="${px}" y="334" text-anchor="${i===4?"end":i===0?"start":"middle"}" fill="currentColor" font-size="19">${day}</text>`}
  for(const c of available){const color=CYCLE_COLORS[c.id],daily=c.points.filter(r=>!r.live);out+=`<path d="${cyclePath(daily,x,y)}" stroke="${color}" stroke-width="${c.current?3.5:2.5}" fill="none" stroke-linejoin="round" stroke-linecap="round"/>`;
    if(c.last.live){const previous=daily.at(-1);if(c.last.day-previous.day<=2)out+=`<path d="M${x(previous.day)},${y(previous.ratio)} L${x(c.last.day)},${y(c.last.ratio)}" stroke="${color}" stroke-width="2.5" stroke-dasharray="6 5" fill="none"/>`}
    out+=`<circle cx="${x(c.last.day)}" cy="${y(c.last.ratio)}" r="5" fill="${color}"/>`;
  }
  out+='<g id="cycleCrosshair"></g>';svg.innerHTML=out;svg.setAttribute("aria-label","周期顶部回撤对比，"+(cycleScale==="log"?"对数":"线性")+"纵轴；用左右方向键查看，数据见下方周期卡片");
  cyclePlot={available,xMax,x,y};if(cycleCursor!=null)cycleReadAt(Math.min(cycleCursor,xMax));else $("cycleReadout").textContent="点按曲线查看；周期名称可隐藏／显示曲线。虚线为站内报价。";
}
function cycleReadAt(day){
  if(!cyclePlot)return;cycleCursor=Math.max(0,Math.min(cyclePlot.xMax,Math.round(day)));
  const fragments=[];for(const c of cyclePlot.available){const r=c.points.reduce((a,b)=>Math.abs(b.day-cycleCursor)<Math.abs(a.day-cycleCursor)?b:a);if(Math.abs(r.day-cycleCursor)>.55)continue;fragments.push(`第${c.id+1}期 ${cycleDate(r.time)}：${r.ratio.toFixed(4)}× / ${cyclePercent(r.ratio)}${r.live?"（站内报价）":""}`)}
  $("cycleReadout").textContent=`第 ${cycleCursor} 天 · `+(fragments.join("；")||"该日无样本（不插值）");
  const marker=$("cycleCrosshair"),px=cyclePlot.x(cycleCursor);if(marker)marker.innerHTML=`<line x1="${px}" x2="${px}" y1="20" y2="300" stroke="currentColor" opacity=".35" stroke-dasharray="4 4"/>`;
}
function initCycleDrawdown(){
  if(cycleStarted)return;cycleStarted=true;cycleReadSeed();cycleReadCache();
  const fold=$("cycleDrawdownFold"),svg=$("cycleChart");if(!fold||!svg)return;
  const resume=()=>{if(!cycleActive())return;cycleQueue();refreshCycleDrawdown(false)};
  fold.addEventListener("toggle",resume);window.addEventListener("tab-navigation",resume);window.addEventListener("pageshow",resume);document.addEventListener("visibilitychange",resume);window.addEventListener("online",resume);window.addEventListener("offline",cycleQueue);
  svg.addEventListener("pointerdown",e=>{if(!cyclePlot)return;const rect=svg.getBoundingClientRect();if(rect.width>0)cycleReadAt(((e.clientX-rect.left)*640/rect.width-68)/554*cyclePlot.xMax)},{passive:true});
  svg.addEventListener("keydown",e=>{if(!cyclePlot||!["ArrowLeft","ArrowRight","Home","End"].includes(e.key))return;e.preventDefault();cycleReadAt(e.key==="Home"?0:e.key==="End"?cyclePlot.xMax:(cycleCursor||0)+(e.key==="ArrowLeft"?-1:1))});
  // Reuse the existing quote rendering lifecycle without changing pricing or ledger logic.
  const original=renderPriceSpark;renderPriceSpark=function(...args){const result=original.apply(this,args);cycleQueue();return result};
  setInterval(resume,60000);renderCycleDrawdown();resume();
}


function initLthPulse(){const sec=$("lthpulse");if(!sec||sec.dataset.ready)return;sec.dataset.ready="1";const cached=lthPulseReadCache();if(cached){lthPulseData=cached.data;lthPulseSource="cache"}renderLthPulse();refreshLthPulse(false)}
function custodyValid(d){
  if(!d||d.schema!==1||!(+d.ts>0)||!d.fees||!d.mempool||!d.difficulty)return false;
  return [d.fees.fastestFee,d.fees.halfHourFee,d.mempool.count,d.mempool.vsize,d.difficulty.progressPercent,d.difficulty.remainingBlocks].every(v=>Number.isFinite(+v)&&+v>=0)&&Number.isFinite(+d.difficulty.difficultyChange);
}
function custodyNormalize(fees,mempool,difficulty){
  const d={schema:1,ts:Date.now(),fees:{fastestFee:+fees.fastestFee,halfHourFee:+fees.halfHourFee,hourFee:+fees.hourFee,economyFee:+fees.economyFee,minimumFee:+fees.minimumFee},mempool:{count:+mempool.count,vsize:+mempool.vsize,total_fee:+mempool.total_fee},difficulty:{progressPercent:+difficulty.progressPercent,difficultyChange:+difficulty.difficultyChange,estimatedRetargetDate:+difficulty.estimatedRetargetDate,remainingBlocks:+difficulty.remainingBlocks}};return custodyValid(d)?d:null;
}
function custodyReadCache(){try{const c=JSON.parse(localStorage.getItem(CUSTODY_CACHE_KEY));return c&&custodyValid(c.data)?c:null}catch(e){return null}}
function renderCustodyWindow(){
  const d=custodyData;if(!custodyValid(d)||!$("custodyFast"))return;const fast=+d.fees.fastestFee,half=+d.fees.halfHourFee,mb=+d.mempool.vsize/1e6,callout=$("custodyCallout");let title,sub,kind;
  if(half<=2&&mb<=100){title="低费率操作窗口";sub="当前链上费用较低，适合提币、归集或整理 UTXO。";kind="good"}
  else if(half<=5&&mb<=200){title="费用尚可 · 可按需操作";sub="内存池处于中等负载；不紧急的 UTXO 整理可以继续观察。";kind="warn"}
  else{title="链上较拥堵 · 非紧急操作可等待";sub="当前费率或内存池负载偏高，发送前请再次核对钱包估算。";kind="warn"}
  callout.className=`custody-callout ${kind}`;$("custodyState").textContent=title;$("custodySub").textContent=sub;$("custodyFast").textContent=fast.toFixed(fast<10?2:1).replace(/0+$/,"").replace(/\.$/,"");$("custodyHalfHour").textContent=half.toFixed(half<10?2:1).replace(/0+$/,"").replace(/\.$/,"");$("custodyMempool").textContent=mb.toFixed(1)+" MB";$("custodyMempoolSub").textContent=`约 ${Math.round(+d.mempool.count).toLocaleString("zh-CN")} 笔待确认`;
  const change=+d.difficulty.difficultyChange;$("custodyDifficulty").textContent=`${change>=0?"+":""}${change.toFixed(2)}%`;$("custodyDifficulty").style.color=change>=0?"var(--market-positive)":"var(--market-caution)";$("custodyDifficultySub").textContent=`进度 ${(+d.difficulty.progressPercent).toFixed(1)}% · 剩 ${Math.round(+d.difficulty.remainingBlocks)} 块`;
  const age=Date.now()-(+d.ts||0),source=custodySource==="api"?"Bitview 实时 API":custodySource==="cache"?"Bitview · 本机缓存":"Bitview · 内置快照";$("custodySource").textContent=`${source} · ${cacheAge(+d.ts)}`;const stale=age>30*60*1000,status=stale?"自托管数据滞后":custodySource==="api"?"操作窗口已同步":custodySource==="cache"?"操作窗口缓存可用":"操作窗口内置快照";markModuleHealth("自托管窗口",status,stale?"bad":custodySource==="api"?"good":"warn",+d.ts);setFresh("freshCustody","自托管窗口");
}
async function refreshCustodyWindow(force=false){
  if(custodyLoading)return;const cached=custodyReadCache();if(!force&&cached&&Date.now()-(+cached.ts||0)<CUSTODY_CACHE_TTL)return;custodyLoading=true;markModuleHealth("自托管窗口","链上费用同步中","warn",null);setFresh("freshCustody","自托管窗口");
  try{const [fees,mempool,difficulty]=await Promise.all([tryFetch(CUSTODY_API.fees,10000),tryFetch(CUSTODY_API.mempool,10000),tryFetch(CUSTODY_API.difficulty,10000)]),d=custodyNormalize(fees,mempool,difficulty);if(!custodyValid(d))throw new Error("bad custody window");custodyData=d;custodySource="api";try{localStorage.setItem(CUSTODY_CACHE_KEY,JSON.stringify({ts:Date.now(),data:d}))}catch(e){}renderCustodyWindow();if(force)ntf("自托管操作窗口已更新")}
  catch(e){if(!custodyValid(custodyData)&&cached){custodyData=cached.data;custodySource="cache"}renderCustodyWindow();if(force)ntf("链上费用暂不可用 · 已保留当前快照")}finally{custodyLoading=false}
}
function initCustodyWindow(){const sec=$("custody");if(!sec||sec.dataset.ready)return;sec.dataset.ready="1";const cached=custodyReadCache();if(cached){custodyData=cached.data;custodySource="cache"}renderCustodyWindow();refreshCustodyWindow(false)}
function floorClamp(n,a,b){return Math.max(a,Math.min(b,n))}
function floorMoney(n){return n>0?"$"+Math.round(n).toLocaleString("en-US"):"--"}
function floorMoneyShort(n){
  if(!(n>0))return"--";
  if(n>=1e6)return"$"+(n/1e6).toFixed(n>=1e7?0:1)+"M";
  if(n>=1e3)return"$"+(n/1e3).toFixed(n>=1e5?0:1)+"K";
  return"$"+Math.round(n);
}
function floorPctText(value,base){
  if(!(value>0&&base>0))return"等待价格";
  const p=(value/base-1)*100;
  return`${p>=0?"高于":"低于"} ${Math.abs(p).toFixed(1)}%`;
}
function floorSetStatus(text,kind="warn"){
  const latest=floorRows&&floorRows.at(-1),loading=/同步中|加载中/.test(text);markModuleHealth("UTXO底价",text,kind,loading?null:latest&&latest[0]);
  setFresh("freshFloor","UTXO底价");
}
function floorSourceLabel(){
  const latest=floorRows.at(-1),day=latest&&latest[0]||"未知日期";
  const ageDays=day!=="未知日期"?Math.max(0,Math.round((Date.now()-Date.parse(String(day)+"T00:00:00Z"))/86400000)):null;
  const ageTxt=ageDays==null?"":`（距今 ${ageDays} 天）`;
  if(floorSource==="live")return`Bitview 链上日线 · 截至 ${day}`;
  if(floorSource==="stale")return`数据已过期 · 截至 ${day} · 正在重新获取`;
  if(floorSource==="cache")return`本机缓存 · 截至 ${day}${ageTxt} · 后台尝试更新`;
  return`内置历史快照 · 截至 ${day}${ageTxt} · 后台尝试更新`;
}
function floorPositionPct(spot,row){
  const cost=row[2],f5=row[3],f2=row[4];
  if(spot<=f2)return floorClamp(4+20*spot/f2,1,24);
  if(spot<=f5)return 24+24*(spot-f2)/Math.max(1,f5-f2);
  if(spot<=cost)return 48+24*(spot-f5)/Math.max(1,cost-f5);
  return 72+28*floorClamp(Math.log(spot/cost)/Math.log(2),0,1);
}
function renderFloorSummary(){
  const row=floorRows.at(-1),spotEl=$("floorSpot");
  if(!row){floorSetStatus(floorLoading?"链上同步中":"暂无底价数据","warn");return}
  if(!spotEl)return;
  const spot=S.price>0?S.price:row[1],cost=row[2],f5=row[3],f2=row[4];
  spotEl.textContent=floorMoney(spot);$("floorCost").textContent=floorMoney(cost);$("floorF5").textContent=floorMoney(f5);$("floorF2").textContent=floorMoney(f2);
  const toSpot=v=>{const p=(v/spot-1)*100;return"距现价 "+(p>=0?"+":"−")+Math.abs(p).toFixed(1)+"%"};
  $("floorSpotGap").textContent="C50 "+toSpot(cost);
  $("floorCostGap").textContent=spot>=cost?"现价位于结构锚上方":"现价已进入成本锚下方";
  $("floorF5Gap").textContent=toSpot(f5);
  $("floorF2Gap").textContent=toSpot(f2);
  let text,color;
  if(spot<f2){text="尾部事件区 · 已低于 2% 线";color="var(--signal-info)"}
  else if(spot<f5){text="深度压力区 · 2%–5%";color="var(--market-positive-emphasis)"}
  else if(spot<cost){text="第一价值区 · 5%–中位成本";color="var(--brand-ink)"}
  else{text="结构锚上方 · 尚未进入底价带";color="var(--text-primary)"}
  const pos=floorPositionPct(spot,row),label=$("floorPositionText"),track=$("floorSpectrum");
  label.textContent=text;label.style.color=color;$("floorPointer").style.left=pos.toFixed(1)+"%";
  track.setAttribute("aria-label",`${text}；现价 ${floorMoney(spot)}，中位成本 ${floorMoney(cost)}，5%底价 ${floorMoney(f5)}，2%底价 ${floorMoney(f2)}`);
  $("floorSourceText").textContent=floorSourceLabel();
  // 数据时效分级（对齐 deep loss 的 3 天阈值）：fAge 单位为天数。
  const fLatest=floorRows.at(-1),fDay=fLatest&&fLatest[0]||null,
        fAge=fDay?Math.max(0,Math.round((Date.now()-Date.parse(String(fDay)+"T00:00:00Z"))/86400000)):Infinity;
  let floorStateText, floorStateKind;
  if(floorSource==="stale"){floorStateText="数据过期";floorStateKind="bad"}
  else if(fAge>3){floorStateText=floorSource==="live"?"数据滞后":floorSource==="cache"?"缓存较旧":"快照较旧";floorStateKind="bad"}
  else if(floorSource==="live"){floorStateText="链上已同步";floorStateKind="good"}
  else if(floorSource==="cache"){floorStateText="缓存可用";floorStateKind=fAge>1?"warn":"good"}
  else{floorStateText="历史快照";floorStateKind=fAge>1?"warn":"good"}
  floorSetStatus(floorStateText,floorStateKind);
  if(moduleIsReady("coststate"))renderCostStructureState();
}
function floorVisibleRows(){
  if(floorRange==="ALL"||floorRows.length<2)return floorRows;
  const days=floorRange==="1Y"?365:1461,last=Date.parse(floorRows.at(-1)[0]+"T00:00:00Z"),cut=last-days*86400000;
  return floorRows.filter(r=>Date.parse(r[0]+"T00:00:00Z")>=cut);
}
function floorCss(name,fallback){
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()||fallback;
}
function floorDrawBand(ctx,rows,xFor,yFor,upper,lower,color){
  if(rows.length<2)return;ctx.beginPath();
  rows.forEach((r,i)=>{const x=xFor(i),y=yFor(r[upper]);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});
  for(let i=rows.length-1;i>=0;i--)ctx.lineTo(xFor(i),yFor(rows[i][lower]));
  ctx.closePath();ctx.fillStyle=color;ctx.fill();
}
function floorDrawLine(ctx,rows,xFor,yFor,col,color,width,latestSpot){
  ctx.beginPath();let started=false;
  rows.forEach((r,i)=>{
    const v=col===1&&i===rows.length-1&&latestSpot>0?latestSpot:+r[col];
    if(!(v>0))return;const x=xFor(i),y=yFor(v);started?ctx.lineTo(x,y):ctx.moveTo(x,y);started=true;
  });
  ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineJoin="round";ctx.lineCap="round";ctx.stroke();
}
function drawFloorChart(){
  const canvas=$("floorChart"),shell=$("floorChartShell"),rows=floorVisibleRows();if(!canvas||!shell||!rows.length)return;
  const rect=shell.getBoundingClientRect(),w=Math.max(300,Math.round(rect.width)),h=Math.max(260,Math.round(rect.height)),dpr=Math.min(2,window.devicePixelRatio||1);
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr)}
  const ctx=canvas.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  const pad={l:15,r:w<500?54:66,t:18,b:30},plotW=w-pad.l-pad.r,plotH=h-pad.t-pad.b,spot=S.price>0?S.price:rows.at(-1)[1];
  let min=Infinity,max=-Infinity;
  for(let i=0;i<rows.length;i++){const r=rows[i],last=i===rows.length-1;
    for(let c=1;c<=4;c++){const v=(c===1&&last)?spot:+r[c];if(v>0){if(v<min)min=v;if(v>max)max=v}}}
  if(!(min<Infinity&&max>min))return;
  min*=.84;max*=1.16;
  const logMin=Math.log(min),logMax=Math.log(max),yFor=v=>pad.t+(logMax-Math.log(Math.max(v,min)))/(logMax-logMin)*plotH;
  const t0=Date.parse(rows[0][0]+"T00:00:00Z"),t1=Date.parse(rows.at(-1)[0]+"T00:00:00Z"),tSpan=Math.max(1,t1-t0);
  const xs=new Array(rows.length);
  for(let i=0;i<rows.length;i++){const t=Date.parse(rows[i][0]+"T00:00:00Z");xs[i]=pad.l+(Number.isFinite(t)?(t-t0)/tSpan:i/Math.max(1,rows.length-1))*plotW}
  const xFor=i=>xs[i];
  const dark=(document.documentElement.dataset.theme!=="light"),grid=dark?"rgba(255,255,255,.075)":"rgba(15,15,18,.08)",muted=floorCss("--text-tertiary","#85858b"),tx=floorCss("--text-primary","#fff"),btc=floorCss("--brand-ink","#f7931a"),green=floorCss("--market-positive-emphasis","#7bd88f"),blue=floorCss("--signal-info","#4a9eff");
  ctx.font="11px -apple-system,BlinkMacSystemFont,sans-serif";ctx.textBaseline="middle";ctx.fillStyle=muted;ctx.strokeStyle=grid;ctx.lineWidth=1;
  const ticks=[100,200,300,500,700,1000,1700,2700,4100,6500,10000,16000,26000,40000,65000,100000,140000,200000,300000,500000].filter(v=>v>=min&&v<=max);
  ticks.forEach(v=>{const y=Math.round(yFor(v))+.5;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke();ctx.textAlign="left";ctx.fillText(floorMoneyShort(v),w-pad.r+7,y)});
  const years=[];rows.forEach((r,i)=>{const y=r[0].slice(0,4);if(!years.length||years.at(-1).year!==y)years.push({year:y,i})});
  const yearStep=Math.max(1,Math.ceil(years.length/(w<500?5:8)));years.forEach((v,i)=>{if(i%yearStep&&i!==years.length-1)return;const x=Math.round(xFor(v.i))+.5;ctx.beginPath();ctx.moveTo(x,pad.t);ctx.lineTo(x,h-pad.b);ctx.stroke();ctx.textAlign=i===years.length-1?"right":"center";ctx.fillText(v.year,i===years.length-1?Math.min(x,w-pad.r):x,h-13)});
  floorDrawBand(ctx,rows,xFor,yFor,2,3,dark?"rgba(247,147,26,.055)":"rgba(247,147,26,.07)");
  floorDrawBand(ctx,rows,xFor,yFor,3,4,dark?"rgba(50,213,131,.055)":"rgba(0,160,80,.055)");
  floorDrawLine(ctx,rows,xFor,yFor,4,blue,1.45,spot);
  floorDrawLine(ctx,rows,xFor,yFor,3,green,1.55,spot);
  floorDrawLine(ctx,rows,xFor,yFor,2,btc,1.65,spot);
  floorDrawLine(ctx,rows,xFor,yFor,1,tx,2.05,spot);
  const latest=rows.at(-1);[[latest[4],blue],[latest[3],green],[latest[2],btc],[spot,tx]].forEach(([v,c])=>{ctx.beginPath();ctx.arc(xFor(rows.length-1),yFor(v),2.4,0,Math.PI*2);ctx.fillStyle=c;ctx.fill()});
  floorPlot={rows,xs,x0:pad.l,x1:w-pad.r,plotW,shellW:w,shellH:h};
}
function floorTooltipAt(ev){
  const tip=$("floorTooltip"),canvas=$("floorChart"),shell=$("floorChartShell");if(!tip||!floorPlot)return;
  const rect=canvas.getBoundingClientRect(),x=ev.clientX-rect.left,y=ev.clientY-rect.top;
  if(x<floorPlot.x0||x>floorPlot.x1){floorHideTooltip();return}
  const rows=floorPlot.rows,xs=floorPlot.xs;let lo=0,hi=xs.length-1;
  while(lo<hi){const mid=(lo+hi)>>1;if(xs[mid]<x)lo=mid+1;else hi=mid}
  const prev=Math.max(0,lo-1),i=Math.abs(xs[lo]-x)<Math.abs(xs[prev]-x)?lo:prev,r=rows[i],spot=i===rows.length-1&&S.price>0?S.price:r[1];
  tip.innerHTML=`<b>${r[0]}</b><div><span>BTC 价格</span><strong>${floorMoney(spot)}</strong></div><div><span>中位成本</span><strong>${floorMoney(r[2])}</strong></div><div><span>5% 底价</span><strong>${floorMoney(r[3])}</strong></div><div><span>2% 底价</span><strong>${floorMoney(r[4])}</strong></div>`;
  tip.classList.add("on");tip.setAttribute("aria-hidden","false");
  const tw=184,th=116;tip.style.left=floorClamp(x+13,8,shell.clientWidth-tw-8)+"px";tip.style.top=floorClamp(y-th/2,8,shell.clientHeight-th-8)+"px";
}
function floorHideTooltip(){const tip=$("floorTooltip");if(tip){tip.classList.remove("on");tip.setAttribute("aria-hidden","true")}}
function floorQuantile(sorted,q){
  if(!sorted.length)return null;const pos=(sorted.length-1)*q,lo=Math.floor(pos),hi=Math.ceil(pos),t=pos-lo;
  return sorted[lo]+(sorted[hi]-sorted[lo])*t;
}
function floorInsertSorted(sorted,value){
  let lo=0,hi=sorted.length;while(lo<hi){const mid=(lo+hi)>>1;if(sorted[mid]<value)lo=mid+1;else hi=mid}sorted.splice(lo,0,value);
}
function floorBuildRows(dates,prices,costs){
  const n=Math.min(dates.length,prices.length,costs.length),ratios=[],rows=[];
  for(let i=0;i<n;i++){
    const day=String(dates[i]||"").slice(0,10),price=+prices[i],cost=+costs[i];if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!(price>0&&cost>0))continue;
    if(ratios.length>=365){const q5=floorQuantile(ratios,.05),q2=floorQuantile(ratios,.02);rows.push([day,price,cost,Math.round(cost*q5*100)/100,Math.round(cost*q2*100)/100])}
    floorInsertSorted(ratios,price/cost);
  }
  if(rows.length<1000)throw new Error("insufficient floor history");return rows;
}
const FLOOR_MAX_AGE_DAYS=45;
function floorRowsFresh(rows){
  if(!Array.isArray(rows)||rows.length<=1000)return false;
  const last=rows.at(-1);if(!last||!last[0])return false;
  const ts=Date.parse(String(last[0])+"T00:00:00Z");
  return Number.isFinite(ts)&&Date.now()-ts<=FLOOR_MAX_AGE_DAYS*86400000;
}
function floorReadCache(){
  try{const c=JSON.parse(localStorage.getItem(FLOOR_CACHE_KEY));return c&&floorRowsFresh(c.rows)?c:null}catch(e){return null}
}
function floorReadStaleCache(){
  try{const c=JSON.parse(localStorage.getItem(FLOOR_CACHE_KEY)),rows=c&&c.rows,last=Array.isArray(rows)&&rows.at(-1),ts=last&&last[0]?Date.parse(String(last[0])+"T00:00:00Z"):NaN;return c&&Array.isArray(rows)&&rows.length>1000&&Number.isFinite(ts)&&Date.now()-ts>FLOOR_MAX_AGE_DAYS*86400000?c:null}catch(e){return null}
}
async function floorFetchSeries(url,signal){
  const r=await fetch(url,{signal,cache:"no-store"});if(!r.ok)throw new Error("floor source unavailable");
  const j=await r.json();if(!j||!Array.isArray(j.data))throw new Error("bad floor series");return j;
}
async function refreshFloorModel(force=false){
  if(floorLoading)return;
  const cached=floorReadCache();
  if(!force&&cached&&Date.now()-(+cached.ts||0)<FLOOR_CACHE_TTL)return;
  floorLoading=true;floorSetStatus("链上同步中","warn");
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),14000);
  try{
    const [dates,prices,costs]=await Promise.all([floorFetchSeries(FLOOR_API.date,controller.signal),floorFetchSeries(FLOOR_API.price,controller.signal),floorFetchSeries(FLOOR_API.cost,controller.signal)]);
    floorRows=floorBuildRows(dates.data,prices.data,costs.data);floorSource="live";floorStamp=costs.stamp||prices.stamp||new Date().toISOString();
    try{localStorage.setItem(FLOOR_CACHE_KEY,JSON.stringify({ts:Date.now(),stamp:floorStamp,rows:floorRows}))}catch(e){}
    renderFloorSummary();drawFloorChart();if(force)ntf("UTXO 底价带已更新");
  }catch(e){
    renderFloorSummary();drawFloorChart();if(force)ntf("链上源暂不可用 · 已保留当前底价数据");
  }finally{clearTimeout(timer);floorLoading=false;renderFloorSummary()}
}
function initFloorModel(){
  const section=$("floor");if(!section||section.dataset.ready)return;section.dataset.ready="1";
  const cached=floorReadCache(),stale=cached?null:floorReadStaleCache();
  if(cached){floorRows=cached.rows;floorStamp=cached.stamp||"";floorSource="cache"}
  else if(stale){floorRows=stale.rows;floorStamp=stale.stamp||"";floorSource="stale"}
  renderFloorSummary();drawFloorChart();
  document.querySelectorAll("[data-floor-range]").forEach(b=>b.addEventListener("click",()=>{floorRange=b.dataset.floorRange;document.querySelectorAll("[data-floor-range]").forEach(x=>x.classList.toggle("active",x===b));floorHideTooltip();drawFloorChart()}));
  const canvas=$("floorChart");canvas.addEventListener("pointermove",floorTooltipAt,{passive:true});canvas.addEventListener("pointerdown",floorTooltipAt,{passive:true});canvas.addEventListener("pointerleave",floorHideTooltip,{passive:true});
  if("ResizeObserver"in window){floorResizeObserver=new ResizeObserver(()=>requestAnimationFrame(drawFloorChart));floorResizeObserver.observe($("floorChartShell"))}else window.addEventListener("resize",drawFloorChart,{passive:true});
  refreshFloorModel(false);
}
function powerClamp(n,a,b){return Math.max(a,Math.min(b,n))}
function powerDay(ts){return new Date(ts*1000).toISOString().slice(0,10)}
function powerModelAt(ts){
  const days=Math.max(1,Math.floor((+ts-POWER_GENESIS_TS)/86400)),logD=Math.log10(days);
  return{days,fair:10**(POWER_FAIR_A+POWER_FAIR_B*logD),support:10**(POWER_SUPPORT_A+POWER_SUPPORT_B*logD),resistance:10**(POWER_RESIST_A+POWER_RESIST_B*logD)}
}
function powerNormalize(raw){
  const seen=new Map(),src=raw&&Array.isArray(raw.prices)?raw.prices:raw&&Array.isArray(raw.values)?raw.values:[];
  src.forEach(x=>{const time=Math.floor(+(x&&(x.time??x.x))),close=+(x&&(x.USD??x.y));if(time>POWER_GENESIS_TS&&close>0&&Number.isFinite(close)){const day=Math.floor(time/86400)*86400,prev=seen.get(day);if(!prev||time>prev.sourceTime)seen.set(day,{time:day,close,sourceTime:time})}});
  return[...seen.values()].map(x=>({time:x.time,close:x.close})).sort((a,b)=>a.time-b.time);
}
function powerValid(rows){
  if(!Array.isArray(rows)||rows.length<=1000)return false;
  if(!(rows[0]&&rows[0].time<Date.UTC(2012,0,1)/1000))return false;
  const last=rows.at(-1);
  if(!(last&&last.time>Date.now()/1000-45*86400))return false;
  const step=Math.max(1,Math.floor(rows.length/50));
  for(let i=0;i<rows.length;i+=step){const x=rows[i];if(!(x&&+x.time>POWER_GENESIS_TS&&+x.close>0))return false}
  return true;
}
function powerReadCache(){
  try{const c=JSON.parse(localStorage.getItem(POWER_HISTORY_CACHE_KEY));return c&&powerValid(c.rows)?{ts:+c.ts||0,rows:c.rows,provider:c.provider||"mempool.space"}:null}catch(e){return null}
}
function powerSetStatus(text,kind="warn"){const last=powerHistory&&powerHistory.at(-1),loading=/同步中|加载中/.test(text),ts=last&&(+last.time<1e12?+last.time*1000:+last.time);markModuleHealth("幂律历史",text,kind,loading?null:ts);setFresh("freshPower","幂律历史")}
let _pcrCache=null,_pcrKey="";
function powerChartRows(){
  const valid=powerValid(powerHistory),
        src=valid?powerHistory:null,
        key=`${valid?1:0}|${valid?powerHistory.length:DAILY.length}|${valid&&powerHistory.length?powerHistory.at(-1).time:0}|${S.price||0}|${Math.floor(Date.now()/86400000)}`;
  if(_pcrKey===key&&_pcrCache)return _pcrCache;
  const base=src||normalizedDaily().map(x=>({time:+x.time,close:+x.close})),seen=new Map();
  base.forEach(x=>{const t=Math.floor(+x.time/86400)*86400;if(+x.time>POWER_GENESIS_TS&&+x.close>0)seen.set(t,{time:t,close:+x.close})});
  const now=Math.floor(Date.now()/86400000)*86400;if(S.price>0)seen.set(now,{time:now,close:+S.price});
  _pcrCache=[...seen.values()].sort((a,b)=>a.time-b.time);_pcrKey=key;
  return _pcrCache;
}
function powerCurrentSpot(rows){
  return S.price>0?+S.price:rows.length?+rows.at(-1).close:0;
}
function powerAheadText(spot,model){
  if(!(spot>0&&model&&model.days>0))return{main:"--",sub:"支撑线达到现价所需时间"};
  const targetDays=10**((Math.log10(spot)-POWER_SUPPORT_A)/POWER_SUPPORT_B),days=Math.ceil(targetDays-model.days);
  if(days<=0)return{main:"已触及",sub:"现价已位于幂律支撑附近或下方"};
  const months=Math.floor(days/30.4375),main=months<1?"<1 个月":months+" 个月";
  return{main,sub:`约 ${days} 天后支撑线达到当前价格`};
}
function renderPowerLaw(){
  if(!$("powerFair"))return;const rows=powerChartRows(),spot=powerCurrentSpot(rows),now=Math.floor(Date.now()/86400000)*86400,m=powerModelAt(now);
  $("powerFair").textContent=floorMoney(m.fair);$("powerSupport").textContent=floorMoney(m.support);$("powerResistance").textContent=floorMoney(m.resistance);$("powerNow").textContent=floorMoney(spot);
  const dev=spot>0?(spot/m.fair-1)*100:null,devEl=$("powerDeviation");devEl.textContent=Number.isFinite(dev)?(dev>=0?"+":"")+dev.toFixed(1)+"%":"--";devEl.style.color=Number.isFinite(dev)?dev<=0?"var(--market-positive-emphasis)":"var(--market-negative)":"var(--text-tertiary)";
  $("powerDeviationSub").textContent=Number.isFinite(dev)?`${dev<=0?"低于":"高于"}公允价值 ${Math.abs(dev).toFixed(1)}%`:"等待价格";
  const ahead=powerAheadText(spot,m);$("powerAhead").textContent=ahead.main;$("powerAheadSub").textContent=ahead.sub;
  const _pLo=Math.log10(Math.max(1e-9,m.support)),_pHi=Math.log10(Math.max(1e-9,m.resistance)),
        raw=spot>0&&_pHi>_pLo?(Math.log10(spot)-_pLo)/(_pHi-_pLo)*100:0,
        pos=powerClamp(raw,0,100),
        position=raw<0?"低于支撑":raw<10?"贴近支撑":raw<40?"区间下部":raw<65?"公允附近":raw<90?"区间上部":raw<=100?"接近阻力":"高于阻力";
  $("powerPositionText").textContent=`${position} · ${raw.toFixed(1)}%`;$("powerPositionPointer").style.left=pos.toFixed(1)+"%";$("powerPositionTrack").setAttribute("aria-label",`${position}；区间位置 ${raw.toFixed(1)}%；支撑 ${floorMoney(m.support)}，公允 ${floorMoney(m.fair)}，阻力 ${floorMoney(m.resistance)}`);
  const last=rows.at(-1),provider=powerProvider||"mempool.space",source=powerSource==="live"?`${provider} 全历史`:powerSource==="cache"?`${provider} · 本机缓存`:"本机已有行情";
  $("powerSourceText").textContent=`${source}${last?` · 截至 ${powerDay(last.time)}`:""} · 模型每日自动前移`;
  powerSetStatus(powerSource==="live"?"历史已同步":powerSource==="cache"?"缓存可用":"模型可用",powerSource==="live"?"good":"warn");drawPowerChart();
}
function powerMoneyAxis(n){
  if(n>=1e6)return"$"+(n/1e6).toFixed(n>=1e7?0:1).replace(/\.0$/,"")+"M";
  if(n>=1e3)return"$"+(n/1e3).toFixed(n>=1e5?0:1).replace(/\.0$/,"")+"K";
  if(n>=1)return"$"+Math.round(n);
  return"$"+n.toFixed(n>=.1?1:2);
}
function powerDrawLine(ctx,rows,xFor,yFor,key,color,width){
  ctx.beginPath();let started=false;rows.forEach(r=>{const v=+r[key];if(!(v>0))return;const x=xFor(r.time),y=yFor(v);started?ctx.lineTo(x,y):ctx.moveTo(x,y);started=true});ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineJoin="round";ctx.lineCap="round";ctx.stroke();
}
function drawPowerChart(){
  const canvas=$("powerChart"),shell=$("powerChartShell"),rows=powerChartRows();if(!canvas||!shell)return;
  const rect=shell.getBoundingClientRect(),w=Math.max(300,Math.round(rect.width)),h=Math.max(280,Math.round(rect.height)),dpr=Math.min(2,window.devicePixelRatio||1);
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr)}
  const ctx=canvas.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  const pad={l:w<500?60:72,r:14,t:18,b:34},plotW=w-pad.l-pad.r,plotH=h-pad.t-pad.b,start=Date.UTC(2010,7,18)/1000,end=POWER_END_TS,dayAt=t=>Math.max(1,(t-POWER_GENESIS_TS)/86400),logMinX=Math.log10(dayAt(start)),logMaxX=Math.log10(dayAt(end)),xFor=t=>pad.l+(Math.log10(dayAt(t))-logMinX)/(logMaxX-logMinX)*plotW;
  const endModel=powerModelAt(end),maxLog=Math.max(7,Math.ceil(Math.log10(endModel.resistance))),minLog=-2,yFor=v=>pad.t+(maxLog-Math.log10(Math.max(10**minLog,v)))/(maxLog-minLog)*plotH;
  const dark=(document.documentElement.dataset.theme!=="light"),grid=dark?"rgba(255,255,255,.075)":"rgba(15,15,18,.085)",muted=floorCss("--text-tertiary","#85858b"),tx=floorCss("--text-primary","#fff"),support="#30d158",fair="#0a84ff",resistance="#ff453a";
  ctx.font="11px -apple-system,BlinkMacSystemFont,sans-serif";ctx.textBaseline="middle";ctx.strokeStyle=grid;ctx.lineWidth=1;ctx.fillStyle=muted;
  for(let e=minLog;e<=maxLog;e++){const v=10**e,y=Math.round(yFor(v))+.5;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke();ctx.textAlign="right";ctx.fillText(powerMoneyAxis(v),pad.l-7,y)}
  const yearList=(w<500?[2011,2014,2019,2023,2028,2035]:[2011,2012,2014,2016,2019,2023,2028,2035]);
  yearList.forEach((year,i)=>{const ts=Date.UTC(year,0,1)/1000,x=Math.round(xFor(ts))+.5;ctx.beginPath();ctx.moveTo(x,pad.t);ctx.lineTo(x,h-pad.b);ctx.stroke();ctx.textAlign=i===0?"left":i===yearList.length-1?"right":"center";ctx.fillText(String(year),x,h-13)});
  ctx.save();ctx.beginPath();ctx.rect(pad.l,pad.t,plotW,plotH);ctx.clip();
  const model=[];for(let i=0;i<=180;i++){const logD=logMinX+(logMaxX-logMinX)*i/180,ts=POWER_GENESIS_TS+10**logD*86400,m=powerModelAt(ts);model.push({time:ts,...m})}
  ctx.beginPath();model.forEach((r,i)=>{const x=xFor(r.time),y=yFor(r.resistance);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});for(let i=model.length-1;i>=0;i--)ctx.lineTo(xFor(model[i].time),yFor(model[i].support));ctx.closePath();const band=ctx.createLinearGradient(0,pad.t,0,h-pad.b);band.addColorStop(0,dark?"rgba(191,90,242,.055)":"rgba(191,90,242,.065)");band.addColorStop(.58,dark?"rgba(48,209,88,.035)":"rgba(48,160,88,.04)");band.addColorStop(1,dark?"rgba(255,69,58,.045)":"rgba(255,69,58,.05)");ctx.fillStyle=band;ctx.fill();
  powerDrawLine(ctx,model,xFor,yFor,"resistance",resistance,1.7);powerDrawLine(ctx,model,xFor,yFor,"fair",fair,1.8);powerDrawLine(ctx,model,xFor,yFor,"support",support,1.7);
  const visible=rows.filter(r=>r.time>=start&&r.time<=end&&r.close>0);powerDrawLine(ctx,visible,xFor,yFor,"close",tx,2.15);
  const last=visible.at(-1);if(last){ctx.beginPath();ctx.arc(xFor(last.time),yFor(last.close),3,0,Math.PI*2);ctx.fillStyle=tx;ctx.fill();ctx.beginPath();ctx.arc(xFor(last.time),yFor(last.close),6,0,Math.PI*2);ctx.strokeStyle=dark?"rgba(255,255,255,.22)":"rgba(0,0,0,.16)";ctx.lineWidth=1;ctx.stroke()}
  ctx.restore();ctx.save();ctx.translate(11,pad.t+plotH/2);ctx.rotate(-Math.PI/2);ctx.textAlign="center";ctx.fillStyle=muted;ctx.font="11px -apple-system,BlinkMacSystemFont,sans-serif";ctx.fillText("USD · LOG",0,0);ctx.restore();
  powerPlot={rows:rows.filter(r=>r.time>=start&&r.time<=end),x0:pad.l,x1:w-pad.r,plotW,logMinX,logMaxX,shellW:w,shellH:h};$("powerLive").textContent="全历史 · 双对数坐标 · 模型延伸至 2035";
}
function powerNearestRow(rows,time){
  if(!rows.length)return null;let lo=0,hi=rows.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(rows[mid].time<time)lo=mid+1;else hi=mid}const a=rows[lo],b=rows[Math.max(0,lo-1)];return!b||Math.abs(a.time-time)<Math.abs(b.time-time)?a:b;
}
function powerTooltipAt(ev){
  const tip=$("powerTooltip"),canvas=$("powerChart"),shell=$("powerChartShell");if(!tip||!powerPlot)return;
  const rect=canvas.getBoundingClientRect(),x=ev.clientX-rect.left,y=ev.clientY-rect.top;if(x<powerPlot.x0||x>powerPlot.x1){powerHideTooltip();return}
  const logD=powerPlot.logMinX+(x-powerPlot.x0)/powerPlot.plotW*(powerPlot.logMaxX-powerPlot.logMinX),time=Math.floor((POWER_GENESIS_TS+10**logD*86400)/86400)*86400,row=powerNearestRow(powerPlot.rows,time),hasPrice=row&&Math.abs(row.time-time)<=10*86400,m=powerModelAt(time),day=powerDay(time);
  tip.innerHTML=`<b>${day}</b><div><span>BTC 价格</span><strong>${hasPrice?floorMoney(row.close):"--"}</strong></div><div><span>公允回归</span><strong>${floorMoney(m.fair)}</strong></div><div><span>支撑</span><strong>${floorMoney(m.support)}</strong></div><div><span>阻力</span><strong>${floorMoney(m.resistance)}</strong></div>`;
  tip.classList.add("on");tip.setAttribute("aria-hidden","false");$("powerLive").textContent=`${day} · ${hasPrice?`BTC ${floorMoney(row.close)} · `:""}公允 ${floorMoney(m.fair)}`;
  const tw=196,th=126;tip.style.left=powerClamp(x+13,8,shell.clientWidth-tw-8)+"px";tip.style.top=powerClamp(y-th/2,8,shell.clientHeight-th-8)+"px";
}
function powerHideTooltip(){const tip=$("powerTooltip");if(tip){tip.classList.remove("on");tip.setAttribute("aria-hidden","true")}if($("powerLive"))$("powerLive").textContent="全历史 · 双对数坐标 · 模型延伸至 2035"}
async function refreshPowerHistory(force=false){
  if(powerLoading)return;const cached=powerReadCache();
  if(!force&&cached&&Date.now()-cached.ts<POWER_HISTORY_CACHE_TTL){if(!powerHistory.length){powerHistory=cached.rows;powerProvider=cached.provider;powerSource="cache";renderPowerLaw()}return}
  powerLoading=true;powerSetStatus("历史同步中","warn");
  try{
    let rows=null,provider="";try{rows=powerNormalize(await tryFetch(POWER_HISTORY_URL,20000));provider="mempool.space"}catch(e){rows=null}
    if(!powerValid(rows)){rows=powerNormalize(await tryFetch(POWER_HISTORY_FALLBACK_URL,20000));provider="Blockchain.com"}
    if(!powerValid(rows))throw new Error("bad power history");
    powerHistory=rows;powerProvider=provider;powerSource="live";try{localStorage.setItem(POWER_HISTORY_CACHE_KEY,JSON.stringify({ts:Date.now(),rows,provider}))}catch(e){}
    renderPowerLaw();if(force)ntf("幂律全历史价格已更新");
  }catch(e){
    if(!powerHistory.length&&cached){powerHistory=cached.rows;powerProvider=cached.provider;powerSource="cache"}renderPowerLaw();powerSetStatus(powerHistory.length?"保留缓存":"模型可用","warn");if(force)ntf("全历史价格暂不可用 · 已保留幂律模型");
  }finally{powerLoading=false}
}
function lazySection(id,fn){
  const el=$(id);if(!el)return;
  if(!("IntersectionObserver"in window)){el.dataset.lazyVisible="1";fn();return}
  const io=new IntersectionObserver(es=>{
    if(es.some(e=>e.isIntersecting)){io.disconnect();el.dataset.lazyVisible="1";try{fn()}catch(e){try{console.warn("模块初始化失败 "+id,e)}catch(_){}}}
  },{rootMargin:"320px 0px"});
  io.observe(el);
}
function initPowerLaw(){
  const section=$("powerlaw");if(!section||section.dataset.ready)return;section.dataset.ready="1";const cached=powerReadCache();if(cached){powerHistory=cached.rows;powerProvider=cached.provider;powerSource="cache"}
  renderPowerLaw();const canvas=$("powerChart");canvas.addEventListener("pointermove",powerTooltipAt,{passive:true});canvas.addEventListener("pointerdown",powerTooltipAt,{passive:true});canvas.addEventListener("pointerleave",powerHideTooltip,{passive:true});
  if("ResizeObserver"in window){powerResizeObserver=new ResizeObserver(()=>requestAnimationFrame(drawPowerChart));powerResizeObserver.observe($("powerChartShell"))}else window.addEventListener("resize",drawPowerChart,{passive:true});
  refreshPowerHistory(false);
}
function miningNormalize(d){
  const hashrates=[],difficulty=[],seenHash=new Map(),seenDiff=new Map();
  (d&&Array.isArray(d.hashrates)?d.hashrates:[]).forEach(x=>{const time=Math.floor(+x.timestamp),avgHashrate=+x.avgHashrate;if(time>0&&avgHashrate>0&&Number.isFinite(avgHashrate))seenHash.set(time,{timestamp:time,avgHashrate})});
  (d&&Array.isArray(d.difficulty)?d.difficulty:[]).forEach(x=>{const time=Math.floor(+(x.time||x.timestamp)),height=Math.floor(+x.height),value=+x.difficulty,adjustment=+x.adjustment;if(time>0&&value>0&&Number.isFinite(value))seenDiff.set(time,{time,height:Number.isFinite(height)?height:0,difficulty:value,adjustment:adjustment>0&&Number.isFinite(adjustment)?adjustment:null})});
  [...seenHash.values()].sort((a,b)=>a.timestamp-b.timestamp).forEach(x=>hashrates.push(x));
  [...seenDiff.values()].sort((a,b)=>a.time-b.time).forEach(x=>difficulty.push(x));
  return{hashrates,difficulty,currentHashrate:+(d&&d.currentHashrate)||0,currentDifficulty:+(d&&d.currentDifficulty)||0};
}
function miningValid(d){
  if(!d||!Array.isArray(d.hashrates)||!Array.isArray(d.difficulty)||d.hashrates.length<8||d.difficulty.length<2)return false;
  if(!(+(d.currentHashrate)>0&&+(d.currentDifficulty)>0))return false;
  return d.hashrates.filter(x=>+(x&&x.timestamp)>0&&+(x&&x.avgHashrate)>0).length>=8&&d.difficulty.filter(x=>+(x&&(x.time||x.timestamp))>0&&+(x&&x.difficulty)>0).length>=2;
}
function miningReadCache(){
  try{const c=JSON.parse(localStorage.getItem(MINING_CACHE_KEY));if(c&&miningValid(c.data))return{ts:+c.ts||0,data:miningNormalize(c.data)}}catch(e){}
  return null;
}
function miningSetStatus(text,kind="warn"){const last=miningData&&miningData.hashrates&&miningData.hashrates.at(-1),loading=/同步中|加载中/.test(text),ts=last&&+last.timestamp*1000;markModuleHealth("矿业趋势",text,kind,loading?null:ts);setFresh("freshMining","矿业趋势")}
function miningRangeText(){return({"3M":"3月","1Y":"1年","3Y":"3年","ALL":"全周期"})[miningRange]||"1年"}
function miningFilterRows(rows,includePrev=false){
  if(miningRange==="ALL"||rows.length<2)return rows;
  const days=({"3M":92,"1Y":365,"3Y":1095})[miningRange]||365,last=rows.at(-1).time,cut=last-days*86400;
  const out=rows.filter(x=>x.time>=cut);
  if(includePrev&&out.length&&out[0].time>cut){const prev=rows.filter(x=>x.time<cut).at(-1);if(prev)out.unshift({...prev,time:cut})}
  return out;
}
function miningShapeSample(rows,maxPoints=220){
  if(rows.length<=maxPoints)return rows;
  const out=[rows[0]],buckets=Math.max(1,Math.floor((maxPoints-2)/2)),span=(rows.length-2)/buckets;
  for(let i=0;i<buckets;i++){const from=1+Math.floor(i*span),to=Math.min(rows.length-1,1+Math.floor((i+1)*span));if(to<=from)continue;let low=rows[from],high=rows[from];for(let j=from+1;j<to;j++){if(rows[j].value<low.value)low=rows[j];if(rows[j].value>high.value)high=rows[j]}if(low.time<=high.time){out.push(low);if(high!==low)out.push(high)}else{out.push(high);if(high!==low)out.push(low)}}
  const last=rows.at(-1);if(out.at(-1)!==last)out.push(last);return out;
}
function miningPayload(){
  if(!miningData)return{hash:[],difficulty:[]};
  const hash=miningShapeSample(miningFilterRows(miningData.hashrates.map(x=>({time:+x.timestamp,value:+x.avgHashrate/1e18})).filter(x=>x.time>0&&x.value>0)));
  const difficulty=miningFilterRows(miningData.difficulty.map(x=>({time:+x.time,value:+x.difficulty/1e12,adjustment:x.adjustment,height:x.height})).filter(x=>x.time>0&&x.value>0),true);
  return{hash,difficulty};
}
function miningHashText(eh){if(!(eh>0))return"--";return eh>=1000?(eh/1000).toFixed(eh>=10000?1:2)+" ZH/s":Math.round(eh).toLocaleString("en-US")+" EH/s"}
function miningDiffText(t){if(!(t>0))return"--";return t.toFixed(t>=100?2:t>=10?3:4)+" T"}
function miningPctText(v){return Number.isFinite(v)?(v>=0?"+":"")+v.toFixed(1)+"%":"--"}
function miningMultipleText(v){if(!(v>0)||!Number.isFinite(v))return"--";if(v<1000)return"×"+v.toFixed(v>=100?0:v>=10?1:2);const e=Math.floor(Math.log10(v)),m=v/10**e,sup=String(e).replace(/\d/g,d=>"⁰¹²³⁴⁵⁶⁷⁸⁹"[+d]);return`×${m.toFixed(2)}·10${sup}`}
function miningSeriesChange(rows){return rows.length>1&&rows[0].value>0?(rows.at(-1).value/rows[0].value-1)*100:null}
function miningPaintChange(el,v,rows){if(!el)return;const ratio=rows&&rows.length>1&&rows[0].value>0?rows.at(-1).value/rows[0].value:null;el.textContent=miningRange==="ALL"?miningMultipleText(ratio):miningPctText(v);el.style.color=Number.isFinite(v)?v>=0?"var(--market-positive)":"var(--market-negative)":"var(--text-tertiary)"}
function miningRestoreHashReadout(rows){
  const last=rows.at(-1);$("miningHashLatest").textContent=last?miningHashText(last.value):"--";$("miningHashLive").textContent=last?`${miningRangeText()} · 周均算力 · 截至 ${chartDay(last.time)}`:"等待算力历史";
}
function miningRestoreDiffReadout(rows){
  const last=rows.at(-1);$("miningDiffLive").textContent=last?`${miningRangeText()} · 难度阶梯 · 截至 ${chartDay(last.time)}`:"等待难度历史";
}
function makeMiningCharts(){
  if(!ensureVendor())return false;const LC=LightweightCharts,t=chartTheme(),base={autoSize:true,layout:{background:{type:LC.ColorType.Solid,color:t.surface||t.card},textColor:t.tx2,fontFamily:getComputedStyle(document.body).fontFamily,attributionLogo:true},grid:{vertLines:{color:t.div},horzLines:{color:t.div}},rightPriceScale:{borderColor:t.div,scaleMargins:{top:.13,bottom:.12}},timeScale:{borderColor:t.div,timeVisible:false,secondsVisible:false,rightOffset:2,barSpacing:8,minBarSpacing:1,lockVisibleTimeRangeOnResize:true},crosshair:{mode:LC.CrosshairMode.Normal}};
  if(!miningHashChart){
    miningHashChart=LC.createChart($("miningHashChart"),{...base,localization:{locale:"zh-CN",priceFormatter:miningHashText}});
    miningHashSeries=miningHashChart.addSeries(LC.AreaSeries,{lineColor:t.blue,topColor:"rgba(74,158,255,.28)",bottomColor:"rgba(74,158,255,.015)",lineWidth:2,priceLineVisible:true,lastValueVisible:true,priceFormat:{type:"custom",minMove:1,formatter:miningHashText}});
    miningHashChart.subscribeCrosshairMove(p=>{if(!p.time){miningRestoreHashReadout(miningPayload().hash);return}const v=p.seriesData.get(miningHashSeries);if(v)$("miningHashLive").textContent=`${chartDay(+p.time)} · 周均 ${miningHashText(v.value)}`});
  }
  if(!miningDiffChart){
    miningDiffChart=LC.createChart($("miningDiffChart"),{...base,localization:{locale:"zh-CN",priceFormatter:miningDiffText}});
    miningDiffSeries=miningDiffChart.addSeries(LC.LineSeries,{color:t.btc,lineWidth:2,lineType:LC.LineType.WithSteps,priceLineVisible:true,lastValueVisible:true,priceFormat:{type:"custom",minMove:.01,formatter:miningDiffText}});
    miningDiffChart.subscribeCrosshairMove(p=>{if(!p.time){miningRestoreDiffReadout(miningPayload().difficulty);return}const v=p.seriesData.get(miningDiffSeries);if(v)$("miningDiffLive").textContent=`${chartDay(+p.time)} · ${miningDiffText(v.value)}`});
  }
  return true;
}
function renderMiningCharts(){
  const hashEmpty=$("miningHashEmpty"),diffEmpty=$("miningDiffEmpty"),d=miningPayload(),range=miningRangeText();
  const changeLabel=miningRange==="ALL"?"全周期增长":range+"变化";$("miningHashRangeLabel").textContent=changeLabel;$("miningDiffRangeLabel").textContent=changeLabel;
  if(!d.hash.length||!d.difficulty.length){
    hashEmpty.classList.add("on");diffEmpty.classList.add("on");hashEmpty.textContent="算力趋势暂不可用。点按「更新」重试。";diffEmpty.textContent="难度趋势暂不可用。点按「更新」重试。";miningSetStatus("暂不可用","bad");return;
  }
  if(!makeMiningCharts()){hashEmpty.classList.add("on");diffEmpty.classList.add("on");hashEmpty.textContent=diffEmpty.textContent="图表组件加载失败";miningSetStatus("图表不可用","bad");return}
  hashEmpty.classList.remove("on");diffEmpty.classList.remove("on");miningHashSeries.setData(d.hash);miningDiffSeries.setData(d.difficulty);
  const hashKey=`${miningRange}|${d.hash.length}|${d.hash.at(-1).time}`,diffKey=`${miningRange}|${d.difficulty.length}|${d.difficulty.at(-1).time}`;
  if(hashKey!==miningHashDataKey){miningHashDataKey=hashKey;miningHashChart.timeScale().fitContent()}
  if(diffKey!==miningDiffDataKey){miningDiffDataKey=diffKey;miningDiffChart.timeScale().fitContent()}
  const hashNow=miningData.currentHashrate/1e18||d.hash.at(-1).value,diffNow=miningData.currentDifficulty/1e12||d.difficulty.at(-1).value,lastDiff=miningData.difficulty.at(-1),adjust=lastDiff&&Number.isFinite(lastDiff.adjustment)?(lastDiff.adjustment-1)*100:null;
  $("miningHashNow").textContent=miningHashText(hashNow);$("miningDiffNow").textContent=miningDiffText(diffNow);miningPaintChange($("miningHashChange"),miningSeriesChange(d.hash),d.hash);miningPaintChange($("miningDiffChange"),miningSeriesChange(d.difficulty),d.difficulty);
  $("miningDiffAdjust").textContent=miningPctText(adjust);$("miningDiffAdjust").style.color=Number.isFinite(adjust)?adjust>=0?"var(--market-positive)":"var(--market-negative)":"var(--text-tertiary)";
  miningRestoreHashReadout(d.hash);miningRestoreDiffReadout(d.difficulty);
  const source=miningSource==="live"?"mempool.space 实时":miningSource==="cache"?"mempool.space · 本机缓存":"mempool.space",hashDay=chartDay(d.hash.at(-1).time),diffDay=chartDay(d.difficulty.at(-1).time);
  $("miningHashSource").textContent=`${source} · 算力截至 ${hashDay}`;$("miningDiffSource").textContent=`${source} · 难度截至 ${diffDay}`;miningSetStatus(miningSource==="live"?"已同步":"缓存可用",miningSource==="live"?"good":"warn");
}
async function refreshMiningTrends(force=false){
  if(miningLoading)return;const cached=miningReadCache();
  if(!force&&cached&&Date.now()-cached.ts<MINING_CACHE_TTL){if(!miningData){miningData=cached.data;miningSource="cache";renderMiningCharts()}return}
  miningLoading=true;miningSetStatus("同步中","warn");
  try{
    let raw=null;try{raw=await tryFetch(MINING_API_URL,14000)}catch(e){raw=null}
    if(!miningValid(raw))raw=await tryFetch(MINING_FALLBACK_URL,14000);
    if(!miningValid(raw))throw new Error("bad mining history");
    miningData=miningNormalize(raw);miningSource="live";try{localStorage.setItem(MINING_CACHE_KEY,JSON.stringify({ts:Date.now(),data:miningData}))}catch(e){}
    renderMiningCharts();if(force)ntf("算力与难度趋势已更新");
  }catch(e){
    if(!miningData&&cached){miningData=cached.data;miningSource="cache"}
    if(miningData){renderMiningCharts();miningSetStatus("保留缓存","warn")}else renderMiningCharts();
    if(force)ntf("矿业趋势暂不可用 · 已保留现有数据");
  }finally{miningLoading=false}
}
function initMiningTrends(){
  const section=$("mining");if(!section||section.dataset.ready)return;section.dataset.ready="1";
  document.querySelectorAll("[data-mining-range]").forEach(b=>b.addEventListener("click",()=>{miningRange=b.dataset.miningRange;document.querySelectorAll("[data-mining-range]").forEach(x=>x.classList.toggle("active",x===b));renderMiningCharts()}));
  const cached=miningReadCache();if(cached){miningData=cached.data;miningSource="cache";renderMiningCharts()}
  refreshMiningTrends(false);
}
function holderNormalize(raw){
  if(!Array.isArray(raw)||raw.length!==1+HOLDER_COHORTS.length*4)return null;
  const last=i=>{const a=raw[i]&&raw[i].data;return Array.isArray(a)&&a.length?+a.at(-1):NaN},day=String(raw[0]&&raw[0].data&&raw[0].data.at(-1)||"");
  const n=HOLDER_COHORTS.length,rows=HOLDER_COHORTS.map((c,i)=>({...c,total:last(1+i),changes:{_24h:last(1+n+i),_1w:last(1+n*2+i),_1m:last(1+n*3+i)}}));
  return{schema:1,day,stamp:String(raw[0]&&raw[0].stamp||""),rows};
}
function holderValid(d){
  if(!d||d.schema!==1||!/^\d{4}-\d{2}-\d{2}$/.test(String(d.day||""))||!Array.isArray(d.rows)||d.rows.length!==HOLDER_COHORTS.length)return false;
  const total=d.rows.reduce((s,r)=>s+(Number.isFinite(+r.total)?+r.total:0),0);
  return total>19e6&&total<21e6&&d.rows.every((r,i)=>r&&r.key===HOLDER_COHORTS[i].key&&+r.total>=0&&["_24h","_1w","_1m"].every(k=>Number.isFinite(+(r.changes&&r.changes[k]))));
}
function holderReadCache(){
  try{const c=JSON.parse(localStorage.getItem(HOLDER_CACHE_KEY));if(c&&holderValid(c.data))return{ts:+c.ts||0,data:c.data}}catch(e){}
  return null;
}
function holderReadHistory(){
  try{
    const raw=JSON.parse(localStorage.getItem(HOLDER_HISTORY_KEY));if(!raw||typeof raw!=="object"||Array.isArray(raw))return{};
    const clean={};Object.keys(raw).filter(day=>/^\d{4}-\d{2}-\d{2}$/.test(day)).sort().slice(-HOLDER_HISTORY_DAYS).forEach(day=>{
      const src=raw[day];if(!src||typeof src!=="object"||Array.isArray(src))return;
      const row={};HOLDER_DISPLAY_COHORTS.forEach(c=>{const v=+src[c.key];if(Number.isFinite(v))row[c.key]=v});
      if(Object.keys(row).length===HOLDER_DISPLAY_COHORTS.length)clean[day]=row;
    });
    return clean;
  }catch(e){return{}}
}
function holderWriteHistory(data){
  if(!holderValid(data)||holderHistory[data.day])return false;
  const rows=holderDisplayRows(data.rows,"_24h"),snapshot={};rows.forEach(r=>{snapshot[r.key]=r.delta});
  if(Object.keys(snapshot).length!==HOLDER_DISPLAY_COHORTS.length)return false;
  const next={...holderHistory,[data.day]:snapshot},days=Object.keys(next).filter(day=>/^\d{4}-\d{2}-\d{2}$/.test(day)).sort();
  while(days.length>HOLDER_HISTORY_DAYS)delete next[days.shift()];
  try{localStorage.setItem(HOLDER_HISTORY_KEY,JSON.stringify(next));holderHistory=next;return true}catch(e){return false}
}
function holderSetStatus(text,kind="warn"){const loading=/同步中|加载中/.test(text);markModuleHealth("持币群体",text,kind,loading?null:holderData&&holderData.day);setFresh("freshHolders","持币群体")}
function holderPeriodText(){return HOLDER_PERIOD_LABEL[holderPeriod]||"1日"}
function holderTotalText(v){
  const a=Math.abs(+v||0);if(a>=1e6)return(a/1e6).toFixed(a>=10e6?1:2)+"M BTC";if(a>=1e3)return(a/1e3).toFixed(a>=100e3?1:2)+"K BTC";return a.toFixed(a>=100?0:a>=10?1:2)+" BTC";
}
function holderDeltaText(v){
  const n=+v||0,a=Math.abs(n),sign=n>0?"+":n<0?"−":"",body=a>=1000?Math.round(a).toLocaleString("en-US"):a>=100?a.toFixed(0):a>=10?a.toFixed(1):a>=1?a.toFixed(2):a.toFixed(5);return sign+body+" BTC";
}
function holderRateText(delta,total){
  const base=+total;if(!(base>0))return"--";const p=(+delta||0)/base*100,a=Math.abs(p);if(a>0&&a<.0001)return"≈0.0000%";const digits=a>=1?2:a>=.1?3:4;return(p>0?"+":"")+p.toFixed(digits)+"%";
}
function holderRelText(v){
  const p=(+v||0)*100,a=Math.abs(p);if(a>0&&a<.0001)return"≈0.0000%";const digits=a>=1?2:a>=.1?3:4;return(p>0?"+":"")+p.toFixed(digits)+"%";
}
function holderSignedNumber(v){
  const n=+v||0,a=Math.abs(n),body=a>=1000?Math.round(a).toLocaleString("en-US"):a>=100?a.toFixed(0):a>=10?a.toFixed(1):a.toFixed(2);return(n>0?"+":n<0?"−":"")+body;
}
function holderTone(v){return v>1e-8?"up":v<-1e-8?"down":"flat"}
function holderEsc(s){return String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}
function holderDisplayRows(rawRows,period=holderPeriod){
  const byKey=new Map(rawRows.map(r=>[r.key,r]));
  return HOLDER_DISPLAY_COHORTS.map(c=>{
    const parts=c.members.map(k=>byKey.get(k)).filter(Boolean);
    const supply=parts.reduce((s,r)=>s+(+r.total||0),0),delta=parts.reduce((s,r)=>s+(+(r.changes&&r.changes[period])||0),0);
    return{...c,total:supply,supply,delta,rel:supply>0?delta/supply:0};
  });
}
function aggregateCamps(cohortData){
  const totalSupply=Object.values(cohortData).reduce((s,d)=>s+(+d.supply||0),0);
  return CAMPS.map(c=>{
    const members=c.cohorts.map(id=>cohortData[id]).filter(Boolean),delta=members.reduce((s,m)=>s+m.delta,0),supply=members.reduce((s,m)=>s+m.supply,0);
    return{...c,delta,supply,pct:totalSupply>0?supply/totalSupply:0,rel:supply>0?delta/supply:0};
  });
}
function holderMean(a){return a.length?a.reduce((s,v)=>s+v,0)/a.length:0}
function holderStddev(a){
  if(!a.length)return 0;const mu=holderMean(a);return Math.sqrt(a.reduce((s,v)=>s+(v-mu)*(v-mu),0)/a.length);
}
function dominantCohort(cohortData,history){
  const scored=Object.entries(cohortData).map(([id,d])=>{
    const h=(history[id]||[]).filter(Number.isFinite).slice(-90);
    if(h.length<HOLDER_HISTORY_MIN_DAYS)return{id,score:Math.abs(d.delta/d.supply),mode:"rel"};
    const mu=holderMean(h),sigma=holderStddev(h),z=sigma>0?(d.delta-mu)/sigma:0,percentile=Math.round(h.filter(v=>v<=d.delta).length/h.length*100);
    return{id,score:Math.abs(z),z,percentile,mode:"z"};
  });
  return scored.sort((a,b)=>b.score-a.score)[0]||null;
}
function holderHistorySeries(beforeDay){
  const out={};HOLDER_DISPLAY_COHORTS.forEach(c=>{out[c.key]=[]});
  Object.keys(holderHistory).filter(day=>!beforeDay||day<beforeDay).sort().slice(-90).forEach(day=>{
    const row=holderHistory[day]||{};HOLDER_DISPLAY_COHORTS.forEach(c=>{const v=+row[c.key];if(Number.isFinite(v))out[c.key].push(v)});
  });
  return out;
}
function detectMigrationPairs(ordered){
  const pairs=[];
  for(let i=0;i<ordered.length-1;i++){
    const a=ordered[i],b=ordered[i+1];if(Math.sign(a.delta)===Math.sign(b.delta))continue;
    const lo=Math.min(Math.abs(a.delta),Math.abs(b.delta)),hi=Math.max(Math.abs(a.delta),Math.abs(b.delta));
    if(hi===0||lo/hi<.60)continue;
    if(hi<.0002*Math.min(a.supply,b.supply))continue;
    pairs.push({from:a.delta<0?a:b,to:a.delta>0?a:b,net:a.delta+b.delta,ratio:lo/hi,offset:i,offsetAmount:lo});
  }
  return pairs;
}
function holderSparkSvg(id){
  const values=Object.keys(holderHistory).sort().slice(-90).map(day=>+(holderHistory[day]||{})[id]).filter(Number.isFinite);if(values.length<14)return"";
  let sum=0;const cum=values.map(v=>sum+=v),lo=Math.min(0,...cum),hi=Math.max(0,...cum),span=Math.max(1e-9,hi-lo),x=i=>i/(cum.length-1)*60,y=v=>1+(hi-v)/span*14,y0=y(0);let paths="";
  for(let i=1;i<cum.length;i++){
    const av=cum[i-1],bv=cum[i],ax=x(i-1),bx=x(i),ay=y(av),by=y(bv);
    if(av*bv<0){
      const t=Math.abs(av)/(Math.abs(av)+Math.abs(bv)),zx=ax+(bx-ax)*t;
      paths+=`<path class="${av>0?"pos":"neg"}" d="M${ax.toFixed(2)} ${ay.toFixed(2)}L${zx.toFixed(2)} ${y0.toFixed(2)}"/><path class="${bv>0?"pos":"neg"}" d="M${zx.toFixed(2)} ${y0.toFixed(2)}L${bx.toFixed(2)} ${by.toFixed(2)}"/>`;
    }else{
      const cls=av>0||bv>0?"pos":av<0||bv<0?"neg":"flat";paths+=`<path class="${cls}" d="M${ax.toFixed(2)} ${ay.toFixed(2)}L${bx.toFixed(2)} ${by.toFixed(2)}"/>`;
    }
  }
  return`<svg class="holder-spark" viewBox="0 0 60 16" aria-hidden="true" focusable="false"><path class="zero" d="M0 ${y0.toFixed(2)}H60"/>${paths}</svg>`;
}
function holderRenderCamp(camp){
  const cap=camp.id.charAt(0).toUpperCase()+camp.id.slice(1),card=$("holderCamp"+cap),delta=$("holderCamp"+cap+"Delta"),sub=$("holderCamp"+cap+"Sub");if(!card||!delta||!sub)return;
  delta.textContent=holderDeltaText(camp.delta);delta.style.color=camp.delta>0?"var(--market-positive)":camp.delta<0?"var(--market-negative)":"var(--text-secondary)";
  sub.textContent=`相对 ${holderRelText(camp.rel)} · 存量占比 ${(camp.pct*100).toFixed(2)}%`;card.setAttribute("aria-label",`${camp.name}，净变化 ${holderDeltaText(camp.delta)}，相对变化 ${holderRelText(camp.rel)}，存量占比 ${(camp.pct*100).toFixed(2)}%`);
}
function holderRenderDominant(rows){
  const rangeEl=$("holderDominantRange"),deltaEl=$("holderDominantDelta"),modeEl=$("holderDominantMode");if(!rangeEl||!deltaEl||!modeEl)return;
  const cohortData=Object.fromEntries(rows.map(r=>[r.key,r])),dominant=dominantCohort(cohortData,holderHistorySeries(holderData&&holderData.day));if(!dominant)return;
  const row=cohortData[dominant.id];rangeEl.textContent=row.range;rangeEl.style.color=row.delta>0?"var(--market-positive)":row.delta<0?"var(--market-negative)":"var(--text-primary)";
  if(dominant.mode==="z"){
    const z=Math.abs(dominant.z)<.05?0:dominant.z;deltaEl.textContent=`z = ${z>=0?"+":""}${z.toFixed(1)}（90日分位 ${dominant.percentile}%） · ${holderPeriodText()} ${holderDeltaText(row.delta)}`;modeEl.textContent="按历史波动标准化排序";
  }else{
    deltaEl.textContent=`${holderPeriodText()} ${holderDeltaText(row.delta)} · ${row.name}`;modeEl.textContent="样本不足 30 日，按相对变化率排序";
  }
  deltaEl.style.color=row.delta>0?"var(--market-positive)":row.delta<0?"var(--market-negative)":"var(--text-secondary)";
}
function holderScrollTo(id){
  const el=$(id);if(!el)return;const reduce=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;el.scrollIntoView({behavior:reduce?"auto":"smooth",block:"center"});
}
function holderRenderDistribution(rows,supply){
  const el=$("holderDistribution");if(!el)return;
  el.innerHTML=rows.map((r,i)=>{const share=supply>0?r.supply/supply*100:0;return`<button type="button" style="width:${share.toFixed(4)}%" aria-label="${holderEsc(r.range)}，占当前供应 ${share.toFixed(2)}%，点按定位" title="${holderEsc(r.range)} · ${share.toFixed(2)}%" onclick="holderScrollTo('holderCohort${i}')"></button>`}).join("");
}
function toggleHolderCustody(btn){
  if(!btn)return;const id=btn.getAttribute("aria-controls");if(!id)return;const note=$(id);if(!note)return;const open=note.hidden;note.hidden=!open;btn.setAttribute("aria-expanded",open?"true":"false");
}
function holderRenderConservation(rawRows){
  const el=$("holderConservation"),text=$("holderConservationText");if(!el||!text)return;
  const days=HOLDER_PERIOD_DAYS[holderPeriod]||1,expected=HOLDER_SUBSIDY*HOLDER_BLOCKS_PER_DAY*days,actual=rawRows.reduce((s,r)=>s+r.delta,0),dev=expected>0?Math.abs(actual-expected)/expected:Infinity,kind=dev<.15?"good":dev<=.40?"warn":"bad",note=kind==="warn"?" · 档位合并可能有损":kind==="bad"?" · 数据源异常，建议刷新":"";
  el.className="holder-conservation "+kind;text.textContent=`校验 Σ ${holderSignedNumber(actual)} / 理论 ${holderSignedNumber(expected)} · 偏差 ${(dev*100).toFixed(1)}%${note}`;
}
function renderHolderCohorts(){
  const box=$("holderRows");if(!box)return;
  if(!holderValid(holderData)){
    box.innerHTML='<div class="holder-empty">持币群体数据暂不可用<button class="btn ghost sm holder-empty-act" type="button" onclick="refreshHolderCohorts(true)">重新获取</button></div>';
    const meta=$("holderMeta"),distribution=$("holderDistribution"),check=$("holderConservationText");if(meta)meta.textContent="等待地址余额快照";if(distribution)distribution.innerHTML="";if(check)check.textContent="等待供应守恒校验";holderSetStatus("暂不可用","bad");return;
  }
  const rawRows=holderData.rows.map(r=>({...r,delta:+r.changes[holderPeriod]})),rows=holderDisplayRows(holderData.rows),supply=rawRows.reduce((s,r)=>s+r.total,0),cohortData=Object.fromEntries(rows.map(r=>[r.key,r])),maxAbs=Math.max(1,...rows.map(r=>Math.abs(r.delta))),maxRel=Math.max(1e-12,...rows.map(r=>Math.abs(r.rel))),pairs=detectMigrationPairs(rows),pairByOffset=new Map(pairs.map(p=>[p.offset,p]));
  aggregateCamps(cohortData).forEach(holderRenderCamp);holderRenderDominant(rows);holderRenderDistribution(rows,supply);
  let html="";
  rows.forEach((r,i)=>{
    const tone=holderTone(r.delta),share=r.total/supply*100,relWidth=tone==="flat"?0:Math.max(1.5,Math.min(49,Math.abs(r.rel)/maxRel*49)),absWidth=tone==="flat"?0:Math.max(1.5,Math.min(49,Math.abs(r.delta)/maxAbs*49)),custody=r.key==="gte10k",spark=holderSparkSvg(r.key);
    html+=`<article class="holder-row${custody?" has-custody":""}" id="holderCohort${i}" aria-label="${holderEsc(r.range)}，当前 ${holderEsc(holderTotalText(r.total))}，${holderEsc(holderPeriodText())}变化 ${holderEsc(holderDeltaText(r.delta))}">${custody?'<button class="holder-custody-badge" type="button" aria-controls="holderCustodyNote" aria-expanded="false" onclick="toggleHolderCustody(this)">托管</button>':""}<div class="holder-range"><div class="holder-range-head"><b class="num">${holderEsc(r.range)}</b><span class="holder-spark-slot">${spark}</span></div><span>${holderEsc(r.name)}</span></div><div class="holder-total"><b class="num">${holderEsc(holderTotalText(r.total))}</b><span>占供应 ${share.toFixed(2)}%</span></div><div class="holder-change ${tone}"><div class="holder-change-top"><b class="num">${holderEsc(holderDeltaText(r.delta))}</b><span class="num">${holderEsc(holderRateText(r.delta,r.total))}</span></div><div class="holder-flow-rails" aria-hidden="true"><div class="holder-flow-track rel"><i class="holder-flow-fill ${tone}" style="width:${relWidth.toFixed(2)}%"></i></div><div class="holder-flow-track abs"><i class="holder-flow-fill ${tone}" style="width:${absWidth.toFixed(2)}%"></i></div></div></div>${custody?'<div class="holder-custody-note" id="holderCustodyNote" hidden>该档以交易所冷钱包与 ETF 托管地址为主，增减多为申购赎回的会计结果，不代表持有人主动买卖方向。</div>':""}</article>`;
    const pair=pairByOffset.get(i);if(pair)html+=`<div class="holder-migration" aria-label="疑似相邻档位跨档迁移"><span>疑似跨档迁移 · 抵消 ${holderEsc(holderSignedNumber(pair.offsetAmount).replace(/^[+−]/,""))} BTC · 净额 ${holderEsc(holderDeltaText(pair.net))}</span></div>`;
  });
  box.innerHTML=html;holderRenderConservation(rawRows);
  const age=Math.max(0,Date.now()-Date.parse(holderData.day+"T23:59:59Z")),stale=age>3*86400000,source=holderSource==="live"?"Bitview 在线":holderSource==="cache"?"Bitview · 本机缓存":"Bitview";
  const meta=$("holderMeta"),sourceText=$("holderSourceText");if(meta)meta.textContent=`数据日 ${holderData.day} UTC · ${holderPeriodText()}滚动变化`;if(sourceText)sourceText.textContent=`${source} · 7组显示 / 9档原始 · 合计 ${holderTotalText(supply)}`;
  holderSetStatus(stale?(holderSource==="live"?"数据滞后":"缓存较旧"):holderSource==="live"?"已同步":"缓存可用",stale?"bad":holderSource==="live"?"good":"warn");
}
async function refreshHolderCohorts(force=false){
  if(holderLoading)return;const cached=holderReadCache();
  if(!force&&cached&&Date.now()-cached.ts<HOLDER_CACHE_TTL){if(!holderData){holderData=cached.data;holderSource="cache";renderHolderCohorts()}return}
  holderLoading=true;holderSetStatus("同步中","warn");
  try{
    const totals=HOLDER_COHORTS.map(c=>c.series+"_supply"),changes=["24h","1w","1m"].flatMap(p=>HOLDER_COHORTS.map(c=>c.series+"_supply_delta_"+p)),url=new URL(HOLDER_API_URL);url.searchParams.set("index","day1");url.searchParams.set("series",["date",...totals,...changes].join(","));url.searchParams.set("start","-1");
    const data=holderNormalize(await tryFetch(url.toString(),20000));if(!holderValid(data))throw new Error("bad holder cohorts");
    holderData=data;holderSource="live";try{localStorage.setItem(HOLDER_CACHE_KEY,JSON.stringify({ts:Date.now(),data}))}catch(e){}
    holderWriteHistory(data);
    renderHolderCohorts();if(force)ntf("持币群体数据已更新");
  }catch(e){
    if(!holderData&&cached){holderData=cached.data;holderSource="cache"}
    if(holderData){renderHolderCohorts();holderSetStatus("保留缓存","warn")}else renderHolderCohorts();
    if(force)ntf("持币群体暂不可用 · 已保留现有数据");
  }finally{holderLoading=false}
}
function initHolderCohorts(){
  const section=$("holders");if(!section||section.dataset.ready)return;section.dataset.ready="1";
  holderHistory=holderReadHistory();
  document.querySelectorAll("[data-holder-period]").forEach(b=>b.addEventListener("click",()=>{holderPeriod="_"+b.dataset.holderPeriod;document.querySelectorAll("[data-holder-period]").forEach(x=>{const on=x===b;x.classList.toggle("active",on);x.setAttribute("aria-pressed",on?"true":"false")});renderHolderCohorts()}));
  const cached=holderReadCache();if(cached){holderData=cached.data;holderSource="cache";renderHolderCohorts()}
  refreshHolderCohorts(false);
}
function deepLossRowValid(r){
  if(!r||!/^\d{4}-\d{2}-\d{2}$/.test(String(r.day||"")))return false;
  const values=[r.supply,r.loss,r.p20,r.p30,r.p40,r.p50,r.p80].map(Number);if(!values.every(Number.isFinite))return false;
  if(!(values[0]>19e6&&values[0]<21e6)||values.slice(1).some(v=>v<0||v>values[0]*1.001))return false;
  return values.slice(1).every((v,i,a)=>i===0||v<=a[i-1]+1)&&Number.isFinite(+r.priceLow)&&Number.isFinite(+r.priceAth)&&+r.priceLow>0&&+r.priceAth>=+r.priceLow;
}
function deepLossValid(d){
  if(!d||d.schema!==1||!Array.isArray(d.rows)||!d.rows.length||d.rows.length>400||!d.rows.every(deepLossRowValid))return false;
  return d.rows.every((r,i)=>i===0||String(r.day)>String(d.rows[i-1].day));
}
function pickSeries(raw,name,idx){
  if(!Array.isArray(raw))return null;
  const byName=raw.find(x=>x&&(x.series===name||x.name===name||x.id===name));
  let arr=byName&&byName.data;
  if(!Array.isArray(arr)||!arr.length){
    if(raw.some(x=>x&&(x.series||x.name||x.id)))return null;
    arr=raw[idx]&&raw[idx].data;
  }
  return Array.isArray(arr)&&arr.length?arr:null;
}
function deepLossNormalize(raw){
  if(!Array.isArray(raw))return null;
  const arrays=DEEP_LOSS_SERIES.map((name,idx)=>pickSeries(raw,name,idx));if(arrays.some(a=>a===null))return null;
  if(!arrays[0].every(v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||""))))return null;
  const n=arrays[0].length;if(arrays.some(a=>a.length!==n))return null;
  const rows=arrays[0].map((day,i)=>({day:String(day||""),supply:+arrays[1][i],loss:+arrays[2][i],p20:+arrays[3][i],p30:+arrays[4][i],p40:+arrays[5][i],p50:+arrays[6][i],p80:+arrays[7][i],priceLow:+arrays[8][i],priceAth:+arrays[9][i]}));
  const todayUTC=new Date().toISOString().slice(0,10);
  while(rows.length>1&&rows.at(-1).day>=todayUTC)rows.pop();
  if(rows.length&&rows.at(-1).day>=todayUTC)return null;
  const dateSeries=raw.find(x=>x&&(x.series==="date"||x.name==="date"||x.id==="date"));
  const data={schema:1,stamp:String(dateSeries&&dateSeries.stamp||raw[0]&&raw[0].stamp||""),rows};return deepLossValid(data)?data:null;
}
function deepLossReadCache(){
  try{const c=JSON.parse(localStorage.getItem(DEEP_LOSS_CACHE_KEY));if(c&&deepLossValid(c.data))return{ts:+c.ts||0,data:c.data}}catch(e){}
  return null;
}
function deepLossSetStatus(text,kind="warn"){const last=deepLossData&&deepLossData.rows&&deepLossData.rows.at(-1),loading=/同步中|加载中/.test(text);markModuleHealth("深度亏损",text,kind,loading?null:last&&last.day);setFresh("freshDeepLoss","深度亏损")}
function deepLossSetText(id,text){const el=$(id);if(el)el.textContent=text}
function deepLossBtcText(v){
  const n=Math.max(0,+v||0);if(n>=1e6)return(n/1e6).toFixed(n>=10e6?1:2)+"M BTC";if(n>=1e3)return(n/1e3).toFixed(n>=100e3?1:2)+"K BTC";if(n>=100)return n.toFixed(0)+" BTC";if(n>=10)return n.toFixed(1)+" BTC";return n.toFixed(n>0?2:0)+" BTC";
}
function deepLossDeltaText(v){
  if(!Number.isFinite(+v))return"--";const n=+v,a=Math.abs(n),body=a>=1e6?(a/1e6).toFixed(2)+"M":a>=1e3?(a/1e3).toFixed(a>=100e3?1:2)+"K":a>=100?a.toFixed(0):a>=10?a.toFixed(1):a.toFixed(2);return(n>0?"+":n<0?"−":"")+body+" BTC";
}
function deepLossThreshold(row,pct){
  const ath=+((row||{}).priceAth);
  return Number.isFinite(ath)&&ath>0?ath*(1-pct/100):NaN;
}
function deepLossPossible(row,pct){
  const t=deepLossThreshold(row,pct),low=+((row||{}).priceLow);
  return Number.isFinite(t)&&Number.isFinite(low)?low<=t:true;
}
function deepLossGapText(row,pct){
  const t=deepLossThreshold(row,pct),low=+((row||{}).priceLow);
  if(!Number.isFinite(t)||!Number.isFinite(low)||low<=0)return"--";
  const gap=(t/low-1)*100;
  return gap>=0?`已进入可能区间`:`再跌 ${Math.abs(gap).toFixed(gap>-10?2:1)}% 触发`;
}
function deepLossUsdText(v){
  return Number.isFinite(+v)?"$"+Math.round(+v).toLocaleString("en-US"):"--";
}
function deepLossReference(rows,days){
  if(!Array.isArray(rows)||!rows.length)return null;
  const current=rows.at(-1),curTs=Date.parse(current.day+"T00:00:00Z");
  if(!Number.isFinite(curTs))return null;
  const target=curTs-days*86400000,tol=(days<=1?1:3)*86400000;
  let ref=null;
  for(const row of rows){const ts=Date.parse(row.day+"T00:00:00Z");if(!Number.isFinite(ts))continue;if(ts<=target)ref=row;else break}
  if(!ref)return null;
  const refTs=Date.parse(ref.day+"T00:00:00Z");
  return Math.abs(refTs-target)<=tol?ref:null;
}
function deepLossSparkMarkup(rows,key){
  const values=(Array.isArray(rows)?rows:[]).slice(-90).map(r=>r&&r.supply>0?+r[key]/+r.supply*100:NaN).filter(Number.isFinite);if(values.length<2)return'<span class="loss-spark-empty">历史样本不足</span>';
  const lo=Math.min(...values),hi=Math.max(...values),rawSpan=hi-lo,span=Math.max(1e-9,rawSpan),points=values.map((v,i)=>`${(i/(values.length-1)*100).toFixed(2)},${(rawSpan<1e-9?13:2+(hi-v)/span*22).toFixed(2)}`).join(" ");
  return`<svg class="loss-spark" viewBox="0 0 100 26" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path class="base" d="M0 24H100"/><polyline class="line" points="${points}"/></svg>`;
}
function renderDeepLoss(){
  const section=$("lossdepth");if(!section)return;
  if(!deepLossValid(deepLossData)){deepLossSetStatus("暂不可用","bad");deepLossSetText("lossHeroLabel","深度亏损数据暂不可用");deepLossSetText("lossHeroValue","--");deepLossSetText("lossHeroShare","--");return}
  const rows=deepLossData.rows,current=rows.at(-1),thin=rows.length<30,ref1=deepLossReference(rows,1),ref30=thin?null:deepLossReference(rows,30),deepest=[...DEEP_LOSS_LEVELS].reverse().find(level=>current[level.key]>.5)||null;
  const scaleMax=Math.max(6,Math.min(100,current.supply>0?(+current.loss||0)/current.supply*100:100));
  DEEP_LOSS_LEVELS.forEach(level=>{
    const value=+current[level.key]||0,
          share=current.supply>0?value/current.supply*100:0,
          possible=deepLossPossible(current,level.pct),
          blocked=!possible&&value<=.5,
          card=$("lossCard"+level.pct),valueEl=$("lossValue"+level.pct),
          shareEl=$("lossShare"+level.pct),changeEl=$("lossChange"+level.pct),
          bar=$("lossBar"+level.pct),spark=$("lossSpark"+level.pct);
    if(card){
      card.classList.toggle("active",!!deepest&&deepest.pct===level.pct);
      card.classList.toggle("impossible",blocked);
    }
    if(valueEl)valueEl.textContent=blocked?"当前不可能触及":deepLossBtcText(value);
    if(shareEl)shareEl.textContent=blocked
      ?`需跌破 ${deepLossUsdText(deepLossThreshold(current,level.pct))}`
      :`占供应 ${share.toFixed(2)}%`;
    if(changeEl){
      if(blocked){changeEl.textContent=deepLossGapText(current,level.pct)}
      else{
        const d1=ref1?value-(+ref1[level.key]||0):NaN,
              d30=ref30?value-(+ref30[level.key]||0):NaN;
        changeEl.textContent=thin
          ?`1日 ${deepLossDeltaText(d1)}`
          :`1日 ${deepLossDeltaText(d1)} · 30日 ${deepLossDeltaText(d30)}`;
      }
    }
    if(bar)bar.style.width=blocked?"0%":Math.max(0,Math.min(100,share/scaleMax*100)).toFixed(2)+"%";
    if(spark){
      spark.innerHTML=blocked
        ?`<span class="loss-spark-empty">现价尚未高到能让这一档出现</span>`
        :(thin
          ?`<span class="loss-spark-empty">${rows.length} 日样本 · 轨迹待累积</span>`
          :deepLossSparkMarkup(rows,level.key));
    }
  });
  if(deepest){
    const value=+current[deepest.key]||0,share=value/current.supply*100,multiple=1/(1-deepest.pct/100);
    deepLossSetText("lossHeroLabel",`≥${deepest.pct}% 深度亏损供应`);deepLossSetText("lossHeroValue",deepLossBtcText(value));deepLossSetText("lossHeroShare",`占供应 ${share.toFixed(2)}%`);
    const nextBlocked=DEEP_LOSS_LEVELS.find(l=>!deepLossPossible(current,l.pct));
    const nextText=nextBlocked
      ?` 下一档 ≥${nextBlocked.pct}% 需跌破 ${deepLossUsdText(deepLossThreshold(current,nextBlocked.pct))} · ${deepLossGapText(current,nextBlocked.pct)}。`
      :" 四档均已进入数学可能区间。";
    deepLossSetText("lossHeroContext",`当前四档中最深的非零门槛 · 对应 UTXO 成本价至少约为现价 ${multiple.toFixed(2)} 倍。${nextText}`);
  }
  else{deepLossSetText("lossHeroLabel","四档深度亏损供应均为 0");deepLossSetText("lossHeroValue","0 BTC");deepLossSetText("lossHeroShare","占供应 0.00%");deepLossSetText("lossHeroContext","当前没有成本亏损达到 30% 或以上的未花费 UTXO。")}
  deepLossSetText("lossAllSupply",`${deepLossBtcText(current.loss)} · ${(current.loss/current.supply*100).toFixed(2)}%`);deepLossSetText("loss20Supply",`${deepLossBtcText(current.p20)} · ${(current.p20/current.supply*100).toFixed(2)}%`);deepLossSetText("lossDataDay",`数据日 ${current.day} UTC · 轨道满标 ${scaleMax.toFixed(2)}%`);
  const alert=$("lossWhaleAlert"),candidate=+current.p80||0,triggerPrice=deepLossThreshold(current,80),possible=deepLossPossible(current,80);if(alert)alert.className="loss-alert "+(possible?"watch":"clear");
  if(!possible){deepLossSetText("lossWhaleStatus","未触发");deepLossSetText("lossWhaleValue",`日低 $${Math.round(current.priceLow).toLocaleString("en-US")} > 极限 ${deepLossUsdText(triggerPrice)}`);deepLossSetText("lossWhaleNote",`任何 UTXO 成本都不超过历史最高 $${Math.round(current.priceAth).toLocaleString("en-US")}；当前价位下 ≥80% 浮亏在数学上不可能存在。需跌破 ${deepLossUsdText(triggerPrice)} 才进入可能区间。`)}
  else{deepLossSetText("lossWhaleStatus","待逐笔确认");deepLossSetText("lossWhaleValue",`日低 $${Math.round(current.priceLow).toLocaleString("en-US")} ≤ 极限 ${deepLossUsdText(triggerPrice)}`);deepLossSetText("lossWhaleNote",`数学触发条件已经具备；当前 ≥80% 浮亏候选 ${deepLossBtcText(candidate)}。本面板只统计未花费 UTXO，≥1,000 BTC 同笔转移的实现亏损需后端逐笔扫描确认。`)}
  const age=Math.max(0,Date.now()-Date.parse(current.day+"T23:59:59Z")),stale=age>3*86400000,source=deepLossSource==="live"?"Bitview 在线":deepLossSource==="cache"?"Bitview · 本机缓存":"内置安全快照";deepLossSetText("lossSourceText",`${source} · ${rows.length} 日序列 · 最后更新 ${current.day}`);
  deepLossSetStatus(
    stale?(deepLossSource==="live"?"数据滞后":deepLossSource==="cache"?"缓存较旧":"快照较旧")
         :(deepLossSource==="live"?"已同步":deepLossSource==="cache"?"缓存可用":"内置快照"),
    stale?"bad":deepLossSource==="live"?"good":"warn"
  );
}
async function refreshDeepLoss(force=false){
  if(deepLossLoading)return;const cached=deepLossReadCache();
  if(!force&&cached&&Date.now()-cached.ts<DEEP_LOSS_CACHE_TTL){if(deepLossSource!=="cache"){deepLossData=cached.data;deepLossSource="cache";renderDeepLoss()}return}
  if(!force&&deepLossFailAt&&Date.now()-deepLossFailAt<DEEP_LOSS_RETRY_COOLDOWN)return;
  deepLossLoading=true;deepLossSetStatus("同步中","warn");
  try{
    const url=new URL(DEEP_LOSS_API_URL);url.searchParams.set("index","day1");url.searchParams.set("series",DEEP_LOSS_SERIES.join(","));url.searchParams.set("start","-91");const data=deepLossNormalize(await tryFetch(url.toString(),20000));if(!deepLossValid(data))throw new Error("bad deep loss supply");
    deepLossData=data;deepLossSource="live";deepLossFailAt=0;try{localStorage.setItem(DEEP_LOSS_CACHE_KEY,JSON.stringify({ts:Date.now(),data}))}catch(e){}renderDeepLoss();if(force)ntf("深度亏损供应已更新");
  }catch(e){
    deepLossFailAt=Date.now();
    let fallback;
    if(cached){deepLossData=cached.data;deepLossSource="cache";fallback="cache"}
    else if(deepLossValid(deepLossData)){fallback=deepLossSource==="snapshot"?"snapshot":"keep"}
    else{deepLossData=DEEP_LOSS_SEED;deepLossSource="snapshot";fallback="snapshot"}
    renderDeepLoss();
    if(fallback==="snapshot")deepLossSetStatus("解析失败 · 用快照","bad");
    else deepLossSetStatus(fallback==="cache"?"刷新失败 · 用缓存":"刷新失败 · 沿用上次","warn");
    if(force)ntf("深度亏损数据暂不可用 · 已保留现有数据");
  }finally{deepLossLoading=false}
}
function initDeepLoss(){
  const section=$("lossdepth");if(!section||section.dataset.ready)return;section.dataset.ready="1";renderDeepLoss();const cached=deepLossReadCache();if(cached){deepLossData=cached.data;deepLossSource="cache";renderDeepLoss()}refreshDeepLoss(false);
}
const DCA_LEDGER_KEY="btc_dca_ledger_v1";
function dcaLedgerNum(v){return Number.isFinite(+v)?+v:0}
function dcaLedgerSafeOrder(o){
  if(!o||!["c2c","btc"].includes(o.type))return null;
  const base={id:String(o.id||`${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`),type:o.type,at:Math.max(0,dcaLedgerNum(o.at)),coin:o.coin==="USDC"?"USDC":"USDT",note:String(o.note||"").slice(0,300)};
  if(o.type==="c2c")return{...base,cny:Math.max(0,dcaLedgerNum(o.cny)),stable:Math.max(0,dcaLedgerNum(o.stable)),provider:String(o.provider||"C2C").slice(0,40)};
  return{...base,spent:Math.max(0,dcaLedgerNum(o.spent)),price:Math.max(0,dcaLedgerNum(o.price)),btc:Math.max(0,dcaLedgerNum(o.btc)),strategy:["base","pull","ext"].includes(o.strategy)?o.strategy:"base",cold:o.cold===true};
}
function dcaLedgerSanitize(x){
  if(!x||typeof x!=="object")return null;
  const b=x.baseline||{},s=x.settings||{},legacyRate=Math.max(.01,dcaLedgerNum(b.legacyRate)||dcaLedgerNum(b.cnyRate)||dcaLedgerNum(s.defaultRate)||7.1),hasTotal=Object.prototype.hasOwnProperty.call(b,"totalCny"),legacyTotal=Math.max(0,dcaLedgerNum(b.btc))*Math.max(0,dcaLedgerNum(b.avgPrice))*legacyRate;
  return{schema:2,baseline:{at:/^\d{4}-\d{2}-\d{2}$/.test(String(b.at||""))?String(b.at):new Date().toISOString().slice(0,10),btc:Math.max(0,dcaLedgerNum(b.btc)),totalCny:Math.max(0,hasTotal?dcaLedgerNum(b.totalCny):legacyTotal),usdt:Math.max(0,dcaLedgerNum(b.usdt)),usdc:Math.max(0,dcaLedgerNum(b.usdc)),legacyRate},orders:(Array.isArray(x.orders)?x.orders:[]).map(dcaLedgerSafeOrder).filter(Boolean).slice(0,2000),settings:{fallbackFx:Math.max(.01,dcaLedgerNum(s.fallbackFx)||dcaLedgerNum(s.defaultRate)||legacyRate||7.1)},updatedAt:Math.max(0,dcaLedgerNum(x.updatedAt))};
}
function readDcaLedger(){
  const candidates=[];
  try{const own=dcaLedgerSanitize(JSON.parse(localStorage.getItem(DCA_LEDGER_KEY)||"null"));if(own)candidates.push(own)}catch(e){}
  const host=dcaLedgerSanitize(S.dcaLedger);if(host)candidates.push(host);
  return candidates.sort((a,b)=>(+b.updatedAt||0)-(+a.updatedAt||0))[0]||null;
}
function dcaLedgerHasData(state){const b=state&&state.baseline;return!!(state&&(state.orders.length||b&&(b.btc>0||b.totalCny>0||b.usdt>0||b.usdc>0)))}
function dcaLedgerRateAt(state,at=Infinity,coin="USDT",fallback=Math.max(.01,+S.fx||7.1)){
  let rate=fallback;(state.orders||[]).filter(o=>o.type==="c2c"&&o.coin===coin&&o.at<=at&&o.stable>0).sort((a,b)=>a.at-b.at).forEach(o=>{rate=o.cny/o.stable});return rate;
}
function deriveDcaLedger(state){
  if(!state)return null;
  const b=state.baseline,events=[...state.orders].sort((a,c)=>a.at-c.at),currentRate=Math.max(.01,+S.fx||state.settings.fallbackFx||7.1),baseRate=b.legacyRate||currentRate,pools={USDT:{qty:b.usdt,cost:b.usdt*baseRate,last:baseRate},USDC:{qty:b.usdc,cost:b.usdc*baseRate,last:baseRate}},alloc=new Map();
  let btc=b.btc,btcCostCny=b.totalCny;
  events.forEach(o=>{const p=pools[o.coin];if(o.type==="c2c"){const unit=o.stable>0?o.cny/o.stable:p.last,deficit=Math.max(0,-p.qty),available=Math.max(0,o.stable-deficit);p.qty+=o.stable;p.cost+=available*unit;if(p.qty<=0)p.cost=0;p.last=unit;return}const avg=p.qty>0?p.cost/p.qty:p.last||currentRate,covered=Math.max(0,Math.min(p.qty,o.spent)),cost=covered*avg+Math.max(0,o.spent-covered)*(p.last||avg);p.qty-=o.spent;p.cost=Math.max(0,p.cost-covered*avg);if(p.qty<=0)p.cost=0;btc+=o.btc;btcCostCny+=cost;alloc.set(o.id,{cny:cost,rate:o.spent>0?cost/o.spent:avg})});
  const btcCostUsd=btcCostCny/currentRate,avgCny=btc>0?btcCostCny/btc:0,avgUsd=btc>0?btcCostUsd/btc:0,value=btc*Math.max(0,+S.price||0)*currentRate;
  return{btc,btcCostCny,btcCostUsd,avgCny,avgUsd,value,pnl:value-btcCostCny,pnlPct:btcCostCny>0?(value/btcCostCny-1)*100:0,pools,alloc,currentRate,pending:events.filter(o=>o.type==="btc"&&!o.cold).length};
}
function dcaLedgerView(){const state=readDcaLedger();return dcaLedgerHasData(state)?{state,derived:deriveDcaLedger(state)}:null}
function writeDcaLedger(state){state.updatedAt=Date.now();localStorage.setItem(DCA_LEDGER_KEY,JSON.stringify(state));S.dcaLedger=state}
function syncDcaLedgerToMain(persist=true){
  if(!executionStorageOK)return null;
  const view=dcaLedgerView();if(!view)return null;
  const {state,derived:d}=view,generated=state.orders.filter(o=>o.type==="btc").map(o=>{const a=d.alloc.get(o.id)||{cny:o.spent*dcaLedgerRateAt(state,o.at,o.coin,d.currentRate)},dt=new Date(o.at),mo=dt.getFullYear()+"年"+(dt.getMonth()+1)+"月";return{ts:o.at,dt:dt.toLocaleString("zh-CN",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}),t:o.strategy,a:Math.round(a.cny*100)/100,p:o.price,b:o.btc,mo,tp:null,cold:o.cold,source:"dca-ledger",dcaLedgerId:o.id}}),old=(Array.isArray(S.log)?S.log:[]).filter(x=>x&&x.source!=="dca-ledger"&&!x.dcaLedgerId);
  S.log=[...generated.map(r=>executionResolve(r,S.executionV25&&S.executionV25.bindings)),...old].sort((a,b)=>(+b.ts||0)-(+a.ts||0));S.hd={d:0,dc:0,dcCny:0,l:0,lc:0,lcCny:0,costSchema:2,ibit:0,gridLo:0,gridHi:0,goal:300000,...S.hd,d:d.btc,dc:d.avgUsd,dcCny:d.btcCostCny,costSchema:2};S.dcaLedger=state;
  const month=mstr(),bud={base:0,pull:0,ext:0};generated.filter(x=>x.mo===month).forEach(x=>{bud[x.t]=(bud[x.t]||0)+(+x.a||0)});S.month=month;S.bud=bud;
  if(S.executionV25)executionProject();if(persist)saveState();return view;
}
function renderLedgerSyncState(){
  const view=dcaLedgerView(),note=$("ledgerSyncNote"),btn=$("quickBuyBtn"),fields=[$("la"),$("ltype"),$("lp")];
  if(view){if(note){note.classList.add("synced");note.innerHTML=`已同步完整 DCA 账本 · ${view.derived.btc.toFixed(6)} BTC · 人民币成本 ¥${Math.round(view.derived.btcCostCny).toLocaleString("zh-CN")} <a href="./dca.html">打开账本</a>`}if(btn)btn.textContent="打开完整 DCA 账本";fields.forEach(x=>{if(x)x.disabled=true});if($("ledgerModalNote"))$("ledgerModalNote").textContent="DCA 持仓与人民币成本由完整账本管理；本窗口只编辑一次性仓位及其他持仓。"}
  else{if(note){note.classList.remove("synced");note.innerHTML='主站轻量账本 · 可手工记录人民币买入 <a href="./dca.html">打开完整 DCA 账本</a>'}if(btn)btn.textContent="买入";fields.forEach(x=>{if(x)x.disabled=false});if($("ledgerModalNote"))$("ledgerModalNote").textContent="人民币总成本用于计算真实持仓均价。"}
}
function setDcaLedgerCold(id,cold){
  const state=readDcaLedger(),o=state&&state.orders.find(x=>x.id===id&&x.type==="btc");if(!o)return false;o.cold=cold;try{writeDcaLedger(state);syncDcaLedgerToMain(false);saveState();return true}catch(e){return false}
}
function logTimestamp(l,i){if(+l.ts>0)return+l.ts;const mo=String(l.mo||"").match(/(\d{4})年(\d{1,2})月/),n=String(l.dt||"").match(/\d+/g)||[];if(mo&&n.length>=2){const y=+mo[1],m=+n[0]||+mo[2],d=+n[1]||1,h=+n[2]||12,mi=+n[3]||0,ts=new Date(y,m-1,d,h,mi).getTime();if(ts>0)return ts}return Date.now()-i*86400000}
function personalCurveData(){
  const ledger=dcaLedgerView(),fx=Math.max(.01,+S.fx||7.1);let logs,baseline;
  if(ledger){const {state,derived}=ledger;logs=state.orders.filter(o=>o.type==="btc").map((o,i)=>{const a=derived.alloc.get(o.id)||{cny:o.spent*dcaLedgerRateAt(state,o.at,o.coin,derived.currentRate)};return{...o,time:Math.floor(o.at/1000),a:+a.cny||0,b:+o.btc||0,p:+o.price||0}}).filter(l=>l.time>0&&l.b>0).sort((a,b)=>a.time-b.time);baseline={time:Math.floor(Date.parse(state.baseline.at+"T12:00:00")/1000),btc:+state.baseline.btc||0,cny:+state.baseline.totalCny||0}}
  else{logs=S.log.map((l,i)=>({...l,time:Math.floor(logTimestamp(l,i)/1000),a:+l.a||0,b:+l.b||0,p:+l.p||0})).filter(l=>l.time>0&&l.a>0&&l.b>0).sort((a,b)=>a.time-b.time);const loggedBtc=logs.reduce((s,l)=>s+l.b,0),loggedCny=logs.reduce((s,l)=>s+l.a,0),first=logs.length?Math.floor(logs[0].time/86400)*86400-86400:Math.floor(Date.now()/86400000)*86400;baseline={time:first,btc:Math.max(0,(+S.hd.d||0)-loggedBtc),cny:Math.max(0,(+S.hd.dcCny||0)-loggedCny)}}
  if(!logs.length&&!(baseline.btc>0||baseline.cny>0))return null;
  const today=Math.floor(Date.now()/86400000)*86400,startDay=Math.floor((baseline.time||logs[0].time)/86400)*86400,px=normalizedDaily().map(d=>({time:d.time,close:d.close})).filter(p=>p.time>=startDay),extra=[{time:startDay,close:(logs[0]&&logs[0].p)||S.price||1},...logs.map(l=>({time:Math.floor(l.time/86400)*86400,close:l.p||S.price||1})),{time:today,close:S.price||(px.at(-1)&&px.at(-1).close)||(logs.at(-1)&&logs.at(-1).p)||1}];
  const byTime=new Map(px.map(p=>[p.time,p]));extra.forEach(p=>{if(!byTime.has(p.time)||p.time===today)byTime.set(p.time,p)});const prices=[...byTime.values()].sort((a,b)=>a.time-b.time);
  let invested=baseline.cny||0,btc=baseline.btc||0,li=0;const invest=[],value=[];prices.forEach(p=>{while(li<logs.length&&logs[li].time<p.time+86400){invested+=logs[li].a;btc+=logs[li].b;li++}if(invested>0||btc>0){invest.push({time:p.time,value:invested});value.push({time:p.time,value:btc*p.close*fx})}});while(li<logs.length){invested+=logs[li].a;btc+=logs[li].b;li++}
  const spot=S.price||(prices.at(-1)&&prices.at(-1).close)||0;if(value.length&&value.at(-1).time===today){invest.at(-1).value=invested;value.at(-1).value=btc*spot*fx}else{invest.push({time:today,value:invested});value.push({time:today,value:btc*spot*fx})}
  const available=value.map(x=>x.time),group=new Map();logs.forEach(l=>{const day=Math.floor(l.time/86400)*86400,time=available.find(t=>t>=day)||available.at(-1),g=group.get(time)||{amount:0,count:0};g.amount+=l.a;g.count++;group.set(time,g)});const markers=[...group.entries()].sort((a,b)=>a[0]-b[0]).map(([time,g])=>({time,position:"belowBar",color:"#4a9eff",shape:"arrowUp",text:g.count>1?`¥${Math.round(g.amount)} · ${g.count}笔`:`¥${Math.round(g.amount)}`}));if(baseline.btc>0)markers.unshift({time:available.find(t=>t>=startDay)||available[0],position:"belowBar",color:"#f7931a",shape:"circle",text:"历史基线"});
  return{logs,count:logs.length+(baseline.btc>0?1:0),invest,value,markers,invested,btc,market:btc*spot*fx,source:ledger?"dca-ledger":"main"};
}
function makePersonalChart(){
  if(personalChart||!ensureVendor())return;const LC=LightweightCharts,t=chartTheme();personalChart=LC.createChart($("personalChart"),{autoSize:true,layout:{background:{type:LC.ColorType.Solid,color:t.card},textColor:t.tx2,fontFamily:getComputedStyle(document.body).fontFamily,attributionLogo:true},grid:{vertLines:{color:t.div},horzLines:{color:t.div}},rightPriceScale:{borderColor:t.div,scaleMargins:{top:.12,bottom:.12}},timeScale:{borderColor:t.div,timeVisible:false,secondsVisible:false,rightOffset:2,barSpacing:8,minBarSpacing:1,lockVisibleTimeRangeOnResize:true},crosshair:{mode:LC.CrosshairMode.Normal},localization:{locale:"zh-CN",priceFormatter:v=>shortCny(v)}});personalSeries={value:personalChart.addSeries(LC.AreaSeries,{lineColor:t.gn,topColor:"rgba(0,200,5,.28)",bottomColor:"rgba(0,200,5,.02)",lineWidth:2,priceLineVisible:true,lastValueVisible:true}),invest:personalChart.addSeries(LC.LineSeries,{color:t.tx2,lineWidth:2,lineStyle:LC.LineStyle.Dashed,priceLineVisible:false,lastValueVisible:true})};personalChart.subscribeCrosshairMove(p=>{if(!p.time){$("personalChartLive").textContent=personalDefaultLabel;return}const v=p.seriesData.get(personalSeries.value),i=p.seriesData.get(personalSeries.invest);if(v&&i)$("personalChartLive").textContent=`${chartDay(+p.time)} · 市值 ${shortCny(v.value)} · 投入 ${shortCny(i.value)}`})
}
function renderPersonalChart(){
  renderPersonalReview();renderBackupHint();
  const zone=$("personal");if(zone&&!zone.open)return;const d=personalCurveData(),empty=$("personalChartEmpty");if(!d){personalDataKey="";if(personalMarkers)personalMarkers.setMarkers([]);empty.classList.add("on");$("personalInvest").textContent=$("personalValue").textContent=$("personalPnl").textContent="--";personalDefaultLabel="记录买入后生成";$("personalChartLive").textContent=personalDefaultLabel;return}if(!ensureVendor()){empty.classList.add("on");empty.textContent="图表组件加载失败";return}empty.classList.remove("on");makePersonalChart();personalSeries.value.setData(d.value);personalSeries.invest.setData(d.invest);if(!personalMarkers)personalMarkers=LightweightCharts.createSeriesMarkers(personalSeries.value,d.markers);else personalMarkers.setMarkers(d.markers);const key=`${d.source}|${d.count}|${d.value.length}|${(d.value[0]||{}).time||0}`;if(key!==personalDataKey){personalDataKey=key;personalChart.timeScale().fitContent()}const pnl=d.invested>0?(d.market/d.invested-1)*100:0;rollNum($("personalInvest"),d.invested,shortCny);rollNum($("personalValue"),d.market,shortCny);rollNum($("personalPnl"),pnl,x=>(x>=0?"+":"")+x.toFixed(1)+"%");$("personalPnl").style.color=pnl>=0?"var(--market-positive)":"var(--market-negative)";personalDefaultLabel=`${d.count} 条成本事件 · ${d.btc.toFixed(5)} BTC`;$("personalChartLive").textContent=personalDefaultLabel;
}
function fmtUsdB(n){if(n==null||!isFinite(n))return"--";return(n>=0?"+":"-")+"$"+(Math.abs(n)/1e9>=10?(Math.abs(n)/1e9).toFixed(1):(Math.abs(n)/1e9).toFixed(2))+"B"}
function stableStats(ser){
  if(!ser||ser.length<2)return null;
  const last=ser.at(-1),
    prev=ser.at(-2),
    first=ser[Math.max(0,ser.length-8)];
  return{last,d1:last-prev,d7:last-first}
}
function combinedStableStats(){
  const ua=datedStableSeries(S.stbU,S.stbUDated,S.stbTs&&S.stbTs.u),ca=datedStableSeries(S.stbC,S.stbCDated,S.stbTs&&S.stbTs.c),um=new Map(ua.map(x=>[x.day,x.value])),cm=new Map(ca.map(x=>[x.day,x.value])),caps=[...um.keys()].filter(day=>cm.has(day)).sort().map(day=>um.get(day)+cm.get(day)),st=stableStats(caps);
  return st?{d1:st.d1,d7:st.d7,last:st.last}:null
}
function liqStateFn(d7){
  if(d7>=5e9)return{t:"明显扩张",c:"up"};
  if(d7>=1e9)return{t:"温和扩张",c:"up"};
  if(d7<=-5e9)return{t:"明显收缩",c:"down"};
  if(d7<=-1e9)return{t:"温和收缩",c:"down"};
  return{t:"中性",c:"neutral"};
}
function stableDailyAlerts(){
  const out=[];
  [
    ["USDT",stableStats(S.stbU)],
    ["USDC",stableStats(S.stbC)]
  ].forEach(([sym,st])=>{
    if(st&&Math.abs(st.d1)>=STABLE_FLOW_THRESHOLD){
      out.push({sym,d1:st.d1,d7:st.d7,last:st.last});
    }
  });
  return out.sort((a,b)=>Math.abs(b.d1)-Math.abs(a.d1));
}
function yDomain(values){
  const min=Math.min(...values),max=Math.max(...values),range=max-min||max*0.02,pad=range*0.08;
  return[min-pad,max+pad]
}
function sparkY(value,domain,h){const ratio=Math.max(0,Math.min(1,(value-domain[0])/(domain[1]-domain[0]||1)));return h-2-ratio*(h-4)}
function sparkPath(ser,w,h){
  if(!ser||ser.length<2)return"";
  const domain=yDomain(ser);
  return ser.map((v,i)=>`${(i/(ser.length-1)*w).toFixed(1)},${sparkY(v,domain,h).toFixed(1)}`).join(" ")
}
function renderPriceDelta24(value){
  const chip=$("pc24"),out=$("pc24Value");if(!chip||!out)return;
  const up=+value>=0;chip.className=`chip num ${up?"chip-up":"chip-down"}`;
  out.textContent=(up?"+":"")+(+value).toFixed(2)+"%";
}
var ZONE_DEFS=[
  {n:"深度低估",t:0.45,v:"--zone-1",tint:"--zone-1-tint"},
  {n:"长期低估",t:1.20,v:"--zone-2",tint:"--zone-2-tint"},
  {n:"估值偏热",t:5.00,v:"--zone-3",tint:"--zone-3-tint"},
  {n:"高估风险",t:14.0,v:"--zone-4",tint:"--zone-4-tint"}
];
var ZONE_LO=0.10, SVGNS="http://www.w3.org/2000/svg";
function zoneIndexOf(v,k){return v<0.45*k?0:v<1.20*k?1:v<5.00*k?2:3}
function cssv(n){return getComputedStyle(document.documentElement).getPropertyValue(n).trim()}
function svgEl(t,a){var e=document.createElementNS(SVGNS,t);for(var k in a)e.setAttribute(k,a[k]);return e}

/* 分区边界价格：P = sqrt(T * k * hm * pl)，与 ahrHistorySeries 同常量同窗口 */
function ahrBandSeries(n){
  var rows=normalizedDaily();
  if(!rows||rows.length<200)return[];
  var out=[],inverse=0,GEN=Date.UTC(2009,0,3);
  for(var i=0;i<rows.length;i++){
    inverse+=1/rows[i].close;
    if(i>=200)inverse-=1/rows[i-200].close;
    if(i<199)continue;
    var hm=200/inverse;
    var dg=Math.floor((rows[i].time*1000-GEN)/864e5);
    if(dg<=0)continue;
    var pl=Math.pow(10,AHR_A*Math.log10(dg)+AHR_B);
    var k=ahrShift(rows[i].time*1000),base=hm*pl;
    if(!isFinite(base)||base<=0)continue;
    out.push({time:rows[i].time,b:[Math.sqrt(0.45*k*base),Math.sqrt(1.20*k*base),Math.sqrt(5.00*k*base)]});
  }
  return out.slice(-(n||30));
}

function renderZoneScale(){
  var svg=$("zoneScaleSvg"),nm=$("zoneName"),av=$("zoneAhr");
  if(!svg)return;
  var v=S.ahr&&Number.isFinite(+S.ahr.v)?+S.ahr.v:NaN;
  if(!(v>0)){svg.innerHTML="";if(nm)nm.textContent="等待数据";if(av)av.textContent="--";return}
  var W=svg.getBoundingClientRect().width,H=38;
  if(!W)return;
  var k=ahrShift(),zi=zoneIndexOf(v,k);
  svg.setAttribute("viewBox","0 0 "+W+" "+H);
  var col=function(i){return cssv(ZONE_DEFS[i].v)};
  var aIdle=cssv("--zone-seg-idle")||".30",aLive=cssv("--zone-seg-live")||".74";
  var stops=[ZONE_LO,0.45,1.20,5.00,14.0],L=Math.log10;
  var lo=L(stops[0]),hi=L(stops[4]);
  var px=function(x){return((L(x)-lo)/(hi-lo))*W};
  var TY=13,TH=8,g="";
  for(var i=0;i<4;i++){
    var a=px(stops[i]),b=px(stops[i+1]),act=i===zi;
    g+='<rect x="'+a+'" y="'+TY+'" width="'+Math.max(0,b-a)+'" height="'+TH+
       '" fill="'+col(i)+'" fill-opacity="'+(act?aLive:aIdle)+'"/>';
    g+='<text x="'+((a+b)/2)+'" y="'+(TY+TH+13)+'" text-anchor="middle" class="zone-seg-label" fill="'+
       (act?col(i):"var(--ink-faint)")+'">'+ZONE_DEFS[i].n+'</text>';
  }
  for(var j=1;j<4;j++)
    g+='<rect x="'+(px(stops[j])-0.75)+'" y="'+TY+'" width="1.5" height="'+TH+'" fill="var(--surface-1)"/>';
  var cx=Math.max(3,Math.min(W-3,px(Math.max(ZONE_LO,Math.min(14,v/k)))));
  g+='<path d="M'+cx+','+(TY-2.5)+' L'+(cx-4)+','+(TY-9.5)+' L'+(cx+4)+','+(TY-9.5)+' Z" fill="'+col(zi)+'"/>';
  g+='<rect x="'+(cx-1.25)+'" y="'+(TY-1)+'" width="2.5" height="'+(TH+2)+'" fill="'+col(zi)+'"/>';
  svg.innerHTML=g;
  var root=document.documentElement;
  root.style.setProperty("--st",col(zi));
  root.style.setProperty("--st-tint",cssv(ZONE_DEFS[zi].tint));
  if(nm){
    var ph=$("intelPhase")?($("intelPhase").textContent||"").trim():"";
    if(ph==="等待历史"||ph==="等待对比"||ph==="--")ph="";
    nm.textContent=ZONE_DEFS[zi].n+(ph?" · "+ph:"");
  }
  if(av)av.textContent="AHR "+v.toFixed(3);
}

function renderPriceSpark(){
  if(typeof renderFocusPrice==="function")return renderFocusPrice();
  var svg=$("priceSparkGraphic"),wrap=svg&&svg.parentElement;
  var chip=$("pc30"),out=$("pc30Value");
  var base=(S.spark30||[]).filter(function(x){return x>0}).slice(-30);
  if(!svg||!wrap||base.length<2){
    if(svg)svg.innerHTML="";
    if(out)out.textContent="--";
    renderZoneScale();return;
  }
  var ser=base.slice();
  if(S.price>0)ser[ser.length-1]=S.price;
  var r=wrap.getBoundingClientRect(),W=r.width,H=r.height;
  if(!W||!H){renderZoneScale();return}
  svg.setAttribute("viewBox","0 0 "+W+" "+H);
  svg.innerHTML="";

  var up=ser[ser.length-1]>=ser[0],pct=(ser[ser.length-1]/ser[0]-1)*100;
  var AX=24,BOT=H-AX,PADR=5,dom=yDomain(ser);
  var span=(dom[1]-dom[0])||1;
  var X=function(i){return(i/(ser.length-1))*(W-PADR)};
  var Y=function(v){return BOT-6-((v-dom[0])/span)*(BOT-20)};

  var bands=ahrBandSeries(30),last=bands.length?bands[bands.length-1].b:null;
  var bandA=cssv("--zone-band-a")||".15";
  var zc=function(i){return cssv(ZONE_DEFS[i].v)};

  /* 1 分区色带（全宽，坐在轴线上） */
  if(last){
    var prev=BOT;
    for(var i=0;i<4;i++){
      var yb=i<3?Math.max(0,Math.min(BOT,Y(last[i]))):0;
      if(prev-yb>0.5)
        svg.appendChild(svgEl("rect",{x:0,y:yb,width:W,height:prev-yb,
          fill:zc(i),"fill-opacity":bandA}));
      prev=yb;
      if(prev<=0)break;
    }
  }
  /* 2 轴线 */
  svg.appendChild(svgEl("line",{x1:0,y1:BOT,x2:W,y2:BOT,
    stroke:"var(--rule)","stroke-width":1}));
  /* 3+4 可见边界与标注（边界不参与 y 域） */
  if(last)for(var b=0;b<3;b++){
    var by=Y(last[b]);
    if(by<12||by>BOT-10)continue;
    var t=svgEl("text",{x:0,y:by+3.2,fill:zc(b)});
    t.setAttribute("class","spark-ref-label");
    t.textContent=ZONE_DEFS[b].n+" "+(last[b]/1000).toFixed(1)+"K";
    svg.appendChild(t);
    var lw=t.getComputedTextLength?t.getComputedTextLength():70;
    svg.appendChild(svgEl("line",{x1:lw+9,y1:by,x2:W,y2:by,stroke:zc(b),
      "stroke-opacity":".62","stroke-width":1,"stroke-dasharray":"2 4"}));
  }
  /* 5 价格线 */
  var pts=ser.map(function(v,i){return X(i).toFixed(2)+","+Y(v).toFixed(2)}).join(" ");
  svg.appendChild(svgEl("polyline",{points:pts,fill:"none",stroke:"var(--ink-1)",
    "stroke-width":1.6,"stroke-linecap":"round","stroke-linejoin":"round"}));
  /* 6 末端点 */
  svg.appendChild(svgEl("circle",{cx:X(ser.length-1),cy:Y(ser[ser.length-1]),
    r:3.4,fill:"var(--st)"}));
  /* 7 时间轴 */
  var dstr=function(i){var d=new Date();d.setDate(d.getDate()-(ser.length-1-i));
    return("0"+(d.getMonth()+1)).slice(-2)+"."+("0"+d.getDate()).slice(-2)};
  [[0,"start"],[10,"middle"],[20,"middle"],[ser.length-1,"end"]].forEach(function(q){
    var i=q[0],an=q[1];
    if(i>=ser.length)return;
    var tx=svgEl("text",{x:an==="start"?0:an==="end"?W:X(i),y:BOT+15,"text-anchor":an});
    tx.setAttribute("class","spark-axis-label");
    tx.textContent=dstr(i);
    svg.appendChild(tx);
  });

  if(chip)chip.className="chip num "+(up?"chip-up":"chip-down");
  if(out)out.textContent=(pct>=0?"+":"")+pct.toFixed(1)+"%";
  renderZoneScale();
}


/* ═══════════ 恐惧贪婪指数走势 V23.3 ═══════════ */
/* 色带采用本站风险语义（贪婪=风险=红），与常见 FGI 配色相反但与全站一致 */
var FGI_ZONES=[
  {lo:0,  hi:25, n:"极度恐惧", v:"--zone-1"},
  {lo:25, hi:50, n:"恐惧",     v:"--zone-2"},
  {lo:50, hi:55, n:"中性",     v:null},
  {lo:55, hi:75, n:"贪婪",     v:"--zone-3"},
  {lo:75, hi:101,n:"极度贪婪", v:"--zone-4"}
];
var FGI_RANGES=[
  {k:"30",  t:"30天", d:30},   {k:"60",  t:"60天", d:60},
  {k:"90",  t:"90天", d:90},   {k:"365", t:"1年",  d:365},
  {k:"1095",t:"3年",  d:1095}, {k:"all", t:"全部", d:1e9}
];
var FGI_FULL_KEY="btc_fgi_full_v1", FGI_FULL_TTL=12*3600*1000;
var FGI_RANGE_KEY="btc_fgi_range_v1";
var FGI_FULL=null, fgiFullState="idle";   // idle | loading | ok | fail
var fgiRange="90";
try{var _r=localStorage.getItem(FGI_RANGE_KEY);
  if(_r&&FGI_RANGES.some(function(x){return x.k===_r}))fgiRange=_r}catch(e){}

function fgiZoneOf(v){
  for(var i=0;i<FGI_ZONES.length;i++)
    if(v>=FGI_ZONES[i].lo&&v<FGI_ZONES[i].hi)return FGI_ZONES[i];
  return FGI_ZONES[FGI_ZONES.length-1];
}
function fgiZoneColor(z){return z.v?cssv(z.v):"var(--ink-faint)"}

/* 稠密打包：按天对齐存值，缺失为 null。3000+ 天约 12KB */
function fgiPack(rows){
  if(!rows||!rows.length)return null;
  var map={},i;
  for(i=0;i<rows.length;i++)map[rows[i].day]=rows[i].value;
  var cur=new Date(rows[0].day+"T00:00:00Z"),
      end=new Date(rows[rows.length-1].day+"T00:00:00Z"),out=[];
  while(cur<=end){
    var k=cur.toISOString().slice(0,10);
    out.push(map[k]==null?null:map[k]);
    cur.setUTCDate(cur.getUTCDate()+1);
  }
  return {s:rows[0].day,v:out};
}
function fgiUnpack(p){
  if(!p||!p.v||!p.v.length)return [];
  var cur=new Date(p.s+"T00:00:00Z"),out=[],i;
  for(i=0;i<p.v.length;i++){
    if(p.v[i]!=null)out.push({day:cur.toISOString().slice(0,10),value:p.v[i]});
    cur.setUTCDate(cur.getUTCDate()+1);
  }
  return out;
}

/* 366 天以内用主流程已有的 METRIC_HISTORY.fgi；更长才惰性拉全量 */
function fgiBase(){
  var short=(METRIC_HISTORY&&METRIC_HISTORY.fgi)||[];
  if(FGI_FULL&&FGI_FULL.length>short.length){
    var map={},i;
    for(i=0;i<FGI_FULL.length;i++)map[FGI_FULL[i].day]=FGI_FULL[i].value;
    for(i=0;i<short.length;i++)map[short[i].day]=short[i].value;   // 短序列更新
    return Object.keys(map).sort().map(function(d){return {day:d,value:map[d]}});
  }
  return short.slice();
}

async function ensureFgiFull(){
  if(fgiFullState==="loading"||fgiFullState==="ok")return;
  try{
    var c=JSON.parse(localStorage.getItem(FGI_FULL_KEY)||"null");
    if(c&&c.ts&&Date.now()-c.ts<FGI_FULL_TTL&&c.p){
      FGI_FULL=fgiUnpack(c.p);
      if(FGI_FULL.length){fgiFullState="ok";renderFgiChart();return}
    }
  }catch(e){}
  fgiFullState="loading"; renderFgiChart();
  try{
    var j=await tryFetch("https://api.alternative.me/fng/?limit=0&format=json",14000);
    var rows=(j&&j.data||[]).map(function(x){
      return {day:dayFromTs((+x.timestamp||0)*1000),value:+x.value};
    }).filter(function(x){return x.day&&Number.isFinite(x.value)})
      .sort(function(a,b){return a.day<b.day?-1:1});
    if(!rows.length)throw new Error("empty");
    FGI_FULL=rows; fgiFullState="ok";
    try{localStorage.setItem(FGI_FULL_KEY,
      JSON.stringify({ts:Date.now(),p:fgiPack(rows)}))}catch(e){}
  }catch(e){ fgiFullState="fail" }
  renderFgiChart();
}

/* 长区间降采样：分桶取均值，目标 ~600 点 */
function fgiDownsample(rows,target){
  if(rows.length<=target)return rows;
  var step=rows.length/target,out=[],i,j;
  for(i=0;i<target;i++){
    var a=Math.floor(i*step),b=Math.min(rows.length,Math.floor((i+1)*step));
    if(b<=a)b=a+1;
    var sum=0,n=0;
    for(j=a;j<b;j++){sum+=rows[j].value;n++}
    out.push({day:rows[Math.floor((a+b-1)/2)].day,value:sum/n});
  }
  return out;
}

function renderFgiTabs(){
  var box=$("fgiTabs"); if(!box)return;
  box.innerHTML=FGI_RANGES.map(function(r){
    return '<button type="button" role="tab" data-k="'+r.k+'" aria-selected="'+
      (r.k===fgiRange)+'">'+r.t+'</button>';
  }).join("");
  Array.prototype.forEach.call(box.querySelectorAll("button"),function(b){
    b.onclick=function(){
      fgiRange=b.dataset.k;
      try{localStorage.setItem(FGI_RANGE_KEY,fgiRange)}catch(e){}
      renderFgiTabs(); renderFgiChart();
      if(fgiNeedsFull())ensureFgiFull();
    };
  });
}
function fgiNeedsFull(){
  var r=FGI_RANGES.filter(function(x){return x.k===fgiRange})[0];
  return !!r&&r.d>366;
}

function renderFgiChart(){
  mirrorFgiFreshBadge();
  var svg=$("fgiChartSvg"),wrap=svg&&svg.parentElement;
  var note=$("fgiNote"),lab=$("fgiNowLabel"),val=$("fgiNowVal"),
      dot=$("fgiNowDot"),stat=$("fgiRangeStat");
  if(!svg||!wrap)return;
  var all=fgiBase();
  if(!all.length){
    svg.innerHTML="";
    if(note)note.textContent="等待 FGI 数据";
    return;
  }
  var r=FGI_RANGES.filter(function(x){return x.k===fgiRange})[0]||FGI_RANGES[2];
  var rows=r.d>=1e9?all.slice():all.slice(-r.d);
  var needFull=r.d>366;
  if(needFull&&fgiFullState!=="ok"){
    if(note)note.textContent=fgiFullState==="loading"?"正在载入完整历史…":
      (fgiFullState==="fail"?"完整历史载入失败 · 已回退到近 366 天":"");
  }else if(note){
    note.textContent="共 "+rows.length+" 天 · "+rows[0].day+" → "+rows[rows.length-1].day;
  }
  var cur=all[all.length-1],z=fgiZoneOf(cur.value),zc=fgiZoneColor(z);
  if(lab){lab.textContent=z.n;lab.style.color=zc}
  if(val){val.textContent=Math.round(cur.value);val.style.color=zc}
  if(dot)dot.style.background=zc;
  if(stat){
    var vs=rows.map(function(x){return x.value});
    stat.textContent="区间 "+Math.round(Math.min.apply(null,vs))+" – "+
      Math.round(Math.max.apply(null,vs));
  }

  var W=wrap.getBoundingClientRect().width,H=wrap.getBoundingClientRect().height;
  if(!W||!H)return;
  svg.setAttribute("viewBox","0 0 "+W+" "+H);
  svg.innerHTML="";
  var AX=24,BOT=H-AX,PADR=5;
  var pts=fgiDownsample(rows,600);
  var X=function(i){return (i/Math.max(1,pts.length-1))*(W-PADR)};
  var Y=function(v){return BOT-6-(v/100)*(BOT-18)};   // FGI 有界 0-100，无需定域

  /* 1 情绪分区色带 */
  FGI_ZONES.forEach(function(z2){
    if(!z2.v)return;
    var y1=Y(Math.min(100,z2.hi)),y0=Y(z2.lo);
    svg.appendChild(svgEl("rect",{x:0,y:y1,width:W,height:Math.max(0,y0-y1),
      fill:cssv(z2.v),"fill-opacity":cssv("--zone-band-a")||".15"}));
  });
  /* 2 轴线 */
  svg.appendChild(svgEl("line",{x1:0,y1:BOT,x2:W,y2:BOT,
    stroke:"var(--rule)","stroke-width":1}));
  /* 3 分界线 25 / 50 / 75 */
  [25,50,75].forEach(function(g){
    var y=Y(g);
    var t=svgEl("text",{x:0,y:y-4,fill:"var(--ink-faint)"});
    t.setAttribute("class","fgi-gl"); t.textContent=g;
    svg.appendChild(t);
    var lw=t.getComputedTextLength?t.getComputedTextLength():14;
    svg.appendChild(svgEl("line",{x1:lw+7,y1:y,x2:W,y2:y,
      stroke:"var(--rule)","stroke-width":1,"stroke-dasharray":"2 4"}));
  });
  /* 4 指数曲线 */
  var d=pts.map(function(x,i){return X(i).toFixed(2)+","+Y(x.value).toFixed(2)}).join(" ");
  svg.appendChild(svgEl("polyline",{points:d,fill:"none",stroke:"var(--ink-1)",
    "stroke-width":pts.length>400?1.1:1.5,
    "stroke-linecap":"round","stroke-linejoin":"round"}));
  /* 5 末端点 */
  svg.appendChild(svgEl("circle",{cx:X(pts.length-1),
    cy:Y(pts[pts.length-1].value),r:3.2,fill:zc}));
  /* 6 时间轴 */
  var ticks=[[0,"start"],[Math.floor(pts.length/3),"middle"],
             [Math.floor(pts.length*2/3),"middle"],[pts.length-1,"end"]];
  ticks.forEach(function(q){
    var i=q[0],an=q[1];
    if(i<0||i>=pts.length)return;
    var t=svgEl("text",{x:an==="start"?0:an==="end"?W:X(i),y:BOT+15,
      "text-anchor":an});
    t.setAttribute("class","fgi-ax");
    t.textContent=(Date.parse(pts[pts.length-1].day)-Date.parse(pts[0].day)>200*864e5)?pts[i].day.slice(0,7):pts[i].day.slice(5);
    svg.appendChild(t);
  });
}

/* 接入渲染链与重绘钩子 */
if(typeof renderFunds==="function"){
  var __rf=renderFunds;
  renderFunds=function(){
    var out=__rf.apply(this,arguments);
    try{renderFgiTabs();renderFgiChart();if(fgiNeedsFull())ensureFgiFull()}catch(e){}
    return out;
  };
}



/* ═══════════ 明暗主题切换 V23.8 ═══════════ */
var THEME_KEY="btc_theme_v1";
function currentTheme(){return document.documentElement.dataset.theme==="light"?"light":"dark"}
function paintThemeToggle(){
  var b=$("themeToggle"); if(!b)return;
  var dark=currentTheme()==="dark";
  var lab=b.querySelector(".tt-label");
  if(lab)lab.textContent=dark?"夜晚":"白天";
  b.setAttribute("aria-pressed",dark?"true":"false");
  b.setAttribute("aria-label",dark?"当前夜晚模式，点按切换到白天":"当前白天模式，点按切换到夜晚");
  var meta=$("themeColorMeta");
  if(meta)meta.setAttribute("content",dark?"#090c11":"#f4f4f6");
}
function applyTheme(t,pin){
  document.documentElement.dataset.theme=t;
  document.documentElement.style.colorScheme=t;
  void document.body.offsetHeight;
  if(pin){window.__themePinned=true;
    try{localStorage.setItem(THEME_KEY,t)}catch(e){}}
  paintThemeToggle();
  window.dispatchEvent(new Event("themechange"));
}
function initThemeToggle(){
  var b=$("themeToggle"); if(!b)return;
  paintThemeToggle();
  b.addEventListener("click",function(){
    applyTheme(currentTheme()==="dark"?"light":"dark",true);
  });
  try{
    window.matchMedia("(prefers-color-scheme: light)").addEventListener("change",function(e){
      if(!window.__themePinned)applyTheme(e.matches?"light":"dark",false);
    });
  }catch(e){}
}
window.addEventListener("themechange",function(){
  requestAnimationFrame(function(){
    try{renderPriceSpark()}catch(e){}
    try{renderZoneScale()}catch(e){}
    try{renderFgiChart()}catch(e){}
  });
});
if(document.readyState==="loading")
  document.addEventListener("DOMContentLoaded",initThemeToggle);
else initThemeToggle();

var __heroRedrawT=null;
function heroRedraw(){
  if(__heroRedrawT)clearTimeout(__heroRedrawT);
  __heroRedrawT=setTimeout(function(){
    try{renderPriceSpark()}catch(e){}
    try{renderFgiChart()}catch(e){}
  },120);
}
window.addEventListener("resize",heroRedraw);
window.addEventListener("orientationchange",heroRedraw);
function renderStableAlert(){
  const el=$("stableAlert"),alerts=stableDailyAlerts();
  if(!el)return;
  if(!alerts.length){
    el.className="liq-alert-box";
    el.innerHTML="";
    return;
  }
  const hasUp=alerts.some(a=>a.d1>0),
    hasDown=alerts.some(a=>a.d1<0),
    state=hasUp&&hasDown?"mixed":hasDown?"down":"up";
  const lines=alerts.map(a=>{
    const dir=a.d1>=0?"增加":"减少";
    return `${a.sym} 最新日市值${dir} <strong>${fmtUsdB(a.d1)}</strong>`;
  }).join("<br>");
  el.className=`liq-alert-box on ${state}`;
  el.innerHTML=
    `<span class="liq-alert-mark" aria-hidden="true"></span>`+
    `<span class="liq-alert-copy"><b>稳定币最新日异动<span class="liq-threshold">超过 $1B</span></b>`+
    `<span>${lines}</span></span>`;
}
function liqRow(sym,ser){
  const st=stableStats(ser);
  if(!st)return`<div class="liq-row"><div class="liq-sym">${esc(sym)}</div><div class="liq-cap-sm">数据不足</div></div>`;
  const alerting=Math.abs(st.d1)>=STABLE_FLOW_THRESHOLD,
    up=st.d1>=0,
    col=up?"var(--market-positive)":"var(--market-negative)",
    pts=sparkPath(ser,100,26),
    badge=alerting?'<span class="liq-alert">超过 $1B</span>':"";
  const ts=S.stbTs&&S.stbTs[sym==="USDT"?"u":"c"];
  return `<div class="liq-row${alerting?" alerting":""}" style="${alerting?`color:${col}`:""}">`+
    `<div><div class="liq-sym">${esc(sym)}</div><div class="liq-cap-sm">最新日${ts?" · "+esc(formatDataDay(ts)):""}</div></div>`+
    `<svg class="liq-spark" viewBox="0 0 100 26" preserveAspectRatio="none">`+
    `<polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`+
    `<div class="liq-nums">`+
    `<div class="liq-d7" style="color:${col}">${fmtUsdB(st.d1)}${badge}</div>`+
    `<div class="liq-mc">7日 ${fmtUsdB(st.d7)} · 市值 $${(st.last/1e9).toFixed(1)}B</div>`+
    `</div></div>`
}
function renderStableCombined(){
  const st=combinedStableStats();
  if(!st){
    $("liqBig").textContent="--";
    $("liqRows").innerHTML='<div class="liq-row"><div class="liq-cap-sm">刷新后自动计算</div></div>';
    const alert=$("stableAlert");
    if(alert){alert.className="liq-alert-box";alert.innerHTML=""}
    return
  }
  const s=liqStateFn(st.d7);
  $("liqCard").className="liq-card "+(s.c==="up"?"up":s.c==="down"?"down":"");
  $("liqBig").textContent=fmtUsdB(st.d7);
  $("liqBig").style.color=st.d7>=0?"var(--market-positive)":"var(--market-negative)";
  $("liqState").textContent=s.t;
  $("liqState").className="liq-state "+(s.c==="up"?"up":s.c==="down"?"down":"");
  $("liqTotal").textContent="$"+(st.last/1e9).toFixed(1)+"B";
  renderStableAlert();
  $("liqRows").innerHTML=liqRow("USDT",S.stbU)+liqRow("USDC",S.stbC);
  renderAction()
}
function toggleTweak(){setTweak(!S.tweak,false)}function setTweak(on,silent){S.tweak=!!on;for(let i=0;i<DM.length;i++)$(`d${i}`).disabled=!S.tweak;document.querySelectorAll(".chips .chip").forEach(b=>b.disabled=!S.tweak);$("tweakBtn").textContent=S.tweak?"微调 ON":"微调 OFF";$("tweakBtn").classList.toggle("on",S.tweak);saveState();if(!silent)ntf(S.tweak?"已开启指标微调":"已锁定实时指标")}
function renderMA(){const el=$("maList"),m=S.mas;if(!m||!m.m51){el.innerHTML='<div class="log-empty">刷新后自动计算</div>';return}const rows=[["MA51","短期趋势",m.m51],["MA120","中期趋势",m.m120],["MA250","长期趋势·锚点成分",m.m250],["MA850","超长期趋势",m.m850]];el.innerHTML=rows.map(r=>{const dd=(S.price-r[2])/r[2]*100;let pill,pc="";if(dd>2)pill=`<span class="pill wait">上方 +${dd.toFixed(1)}%</span>`;else if(dd>=-2){pill='<span class="pill fire">接近均线</span>';pc="color:var(--signal-info)"}else{pill=`<span class="pill opportunity">已跌破 ${Math.abs(dd).toFixed(1)}%</span>`;pc="color:var(--signal-info)"}return `<div class="trig"><div class="trig-pct">${r[0]}</div><div class="trig-price num" style="${pc}">$${Math.round(r[2]).toLocaleString()}<span style="font-size:11px;color:var(--text-tertiary);font-weight:500"> ${r[1]}</span></div>${pill}</div>`}).join("")}
function m21Btc(v){const n=Math.max(0,+v||0),digits=n>=1?4:n>=.01?6:8;return n.toLocaleString("en-US",{minimumFractionDigits:0,maximumFractionDigits:digits})}
function m21Duration(months){if(months===0)return"已达成";if(!(months>0&&Number.isFinite(months)))return"--";if(months<12)return months+"个月";const y=Math.floor(months/12),m=months%12;return y+"年"+(m?m+"个月":"")}
function setM21Target(v){const target=+v;if(!M21_TARGETS.includes(target))return;S.m21.target=target;saveState();render21M()}
function setM21Monthly(){const input=$("m21Monthly"),v=Math.max(1,Math.min(1e9,+(input&&input.value)||S.m21.monthly||1000));S.m21.monthly=Math.round(v*100)/100;if(input)input.value=S.m21.monthly;saveState();render21M();ntf("21M 月度测算已更新")}
function render21M(){
  const root=$("twentyone");if(!root)return;
  const held=Math.max(0,(+S.hd.d||0)+(+S.hd.l||0)),target=M21_TARGETS.includes(+S.m21.target)?+S.m21.target:.1,monthly=Math.max(1,+S.m21.monthly||1000),price=Math.max(0,+S.price||0),fx=Math.max(.01,+S.fx||7.1),sats=Math.round(held*1e8),share=held/M21_SUPPLY*100,ratio=target>0?held/target:0,pct=Math.min(100,Math.max(0,ratio*100)),remaining=Math.max(0,target-held),filled=held>0?Math.min(21,Math.ceil(Math.min(1,ratio)*21)):0;
  $("m21Btc").textContent=m21Btc(held)+" BTC";
  $("m21Sats").textContent=sats.toLocaleString("en-US")+" sats";
  $("m21Share").textContent=held>0?`占 2100 万枚上限的 ${share<1e-9?share.toExponential(2):share.toFixed(10).replace(/0+$/,"").replace(/\.$/,"")}%`:`录入持仓后计算 2100 万分之一占比`;
  $("m21Monthly").value=monthly;
  document.querySelectorAll("[data-m21-target]").forEach(btn=>{const on=+btn.dataset.m21Target===target;btn.classList.toggle("active",on);btn.setAttribute("aria-pressed",on?"true":"false")});
  $("m21TargetLabel").textContent=m21Btc(target)+" BTC 永久仓 · 21 格进度";
  $("m21StackPct").textContent=pct.toFixed(1)+"%";
  const stack=$("m21Stack");stack.setAttribute("aria-label",`${m21Btc(target)} BTC 永久仓目标已完成 ${pct.toFixed(1)}%`);stack.innerHTML=Array.from({length:21},(_,i)=>{const rank=(2-Math.floor(i/7))*7+i%7,on=rank<filled;return `<span class="m21-brick${on?" on":""}" aria-hidden="true"></span>`}).join("");
  $("m21StackLeft").textContent=remaining>0?`还差 ${m21Btc(remaining)} BTC · ${Math.round(remaining*1e8).toLocaleString("en-US")} sats`:`永久仓目标已达成${held>target?` · 超出 ${m21Btc(held-target)} BTC`:""}`;
  const ledger=dcaLedgerView(),buyCount=ledger?ledger.state.orders.filter(o=>o.type==="btc").length:S.log.length;$("m21BuyCount").textContent=`累计定投 ${buyCount} 笔`;
  $("m21Milestones").innerHTML=M21_TARGETS.map(t=>{const p=Math.min(100,t>0?held/t*100:0),left=Math.max(0,t-held),done=held>=t;return `<div class="m21-milestone"><small>${done?"已达成":"长期里程碑"}</small><b class="num">${m21Btc(t)} BTC</b><span class="num">${done?`已超过 ${m21Btc(held-t)} BTC`:`还差 ${m21Btc(left)} BTC`}</span><div class="m21-mini-track"><div class="m21-mini-fill" style="width:${p.toFixed(2)}%"></div></div></div>`}).join("");
  const scenarios=[{m:.5,label:"价格 −50%",tone:""},{m:1,label:"当前价格",tone:" current"},{m:1.5,label:"价格 +50%",tone:""}];
  $("m21Scenarios").innerHTML=scenarios.map(s=>{const scenarioPrice=price*s.m,btcMonth=scenarioPrice>0?monthly/fx/scenarioPrice:0,months=remaining<=0?0:btcMonth>0?Math.ceil(remaining/btcMonth):null,monthSats=Math.round(btcMonth*1e8);return `<div class="m21-scenario${s.tone}"><small>${s.label}</small><b class="num">${scenarioPrice>0?"$"+Math.round(scenarioPrice).toLocaleString("en-US"):"等待价格"}</b><strong class="num">${m21Duration(months)}</strong><span class="num">按 ¥${monthly.toLocaleString("zh-CN")}/月 · 约 ${monthSats>0?monthSats.toLocaleString("en-US"):"--"} sats/月</span></div>`}).join("")
}
function upG(){const p=S.price,g=Math.max(1,+S.hd.goal||300000),pct=Math.min(100,p/g*100);$("goalLabel").textContent="BTC长期价格目标 $"+Math.round(g).toLocaleString();$("gb").style.width=pct+"%";rollNum($("gp"),pct,x=>x.toFixed(1)+"%");$("gr2").textContent="当前价格进度 · 距目标还差 $"+Math.max(0,g-p).toLocaleString()}
function logB(){
  if(dcaLedgerView()){location.href="./dca.html";return}
  ensureMonth(false);
  const view=executionView(),a=Number($("la").value),type=$("ltype").value,price=Number($("lp").value)||S.price;
  if(!view.ready){ntf("请先核对预算和存储状态");return}
  if(!Object.hasOwn(EXEC_LIMITS,type)||!Number.isFinite(a)||a<=0||Math.abs(a-executionRound(a))>.00001){ntf("请输入有效金额，最多两位小数");return}
  if(!Number.isFinite(price)||price<=0){ntf("请输入实际成交价格");return}
  if(!Number.isFinite(+S.fx)||+S.fx<=0){ntf("请先在持仓设置中核对有效汇率");return}
  if(view.bud[type]+a>EXEC_LIMITS[type]+.005||view.total+a>2000.005){ntf("超出本月预算上限");return}
  const choice=type==="base"?null:$("executionSlot").value;
  if(type!=="base"&&choice!=="manual"&&!TR.some(t=>t.k===type&&String(t.p)===choice)){ntf("请明确选择档位或计划外买入");return}
  if(choice&&choice!=="manual"&&a>executionSlotRemaining(Number(choice))+.005){ntf("超过本档剩余额度，请核对归属");return}
  const audit=executionAudit("成交登记时"),now=Date.now(),btc=a/(S.fx||7.1)/price;
  if(!executionCommit(()=>{
    S.log.unshift({v25Id:executionId(),ts:now,dt:new Date(now).toLocaleString("zh-CN",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}),t:type,a,p:price,b:btc,mo:mstr(),tp:choice&&choice!=="manual"?Number(choice):null,executionChoice:choice,executionAudit:audit,cold:false});
    S.hd.dcCny=Math.max(0,+S.hd.dcCny||0)+a;S.hd.d=Math.max(0,+S.hd.d||0)+btc;
    S.hd.dc=S.hd.d>0?S.hd.dcCny/(Math.max(.01,+S.fx||7.1)*S.hd.d):0;S.hd.costSchema=2;
  }))return;
  executionRefresh();upH2();renderPersonalChart();$("la").value="";ntf("已记账；没有发起交易，记得核对提币");
}
function rl2(){renderExecutionReview();const summary=$("coldSummary");if(!S.log.length){$("lb2").innerHTML='<div class="log-empty">暂无记录</div>';summary.className="cold-summary ok";summary.innerHTML="<span>冷钱包提币状态</span><b>暂无记录</b>";return}const pending=S.log.filter(l=>l.cold!==true).length;summary.className="cold-summary "+(pending?"":"ok");summary.innerHTML=`<span>冷钱包提币状态</span><b>${pending?`${pending} 笔待确认`:"全部已确认"}</b>`;const tm={base:["基","li-base","基础定投"],pull:["回","li-pull","回撤加仓"],ext:["极","li-ext","极端预备金"]};$("lb2").innerHTML=S.log.slice(0,30).map((l,i)=>{const r=Object.prototype.hasOwnProperty.call(tm,l.t)?tm[l.t]:["·","",""];return `<div class="log-row"><div class="log-icon ${r[1]}">${r[0]}</div><div class="log-main"><div class="log-t1">${r[2]}${l.tp!=null?` · 跌${Math.round(l.tp*100)}%档`:""}</div><div class="log-t2 num">${esc(l.dt)} · $${Number(l.p).toLocaleString()} · ${(l.b*1000).toFixed(2)}‰ BTC</div></div><div class="log-side"><div class="log-amt num">¥${esc(l.a)}</div><button class="cold-btn ${l.cold===true?"done":""}" onclick="toggleCold(${i})">${l.cold===true?"✓ 已提冷钱包":"待确认提币"}</button></div></div>`}).join("")}
function toggleCold(i){const l=S.log[i];if(!l)return;const next=l.cold!==true;if(l.dcaLedgerId){if(!setDcaLedgerCold(l.dcaLedgerId,next)){ntf("完整账本更新失败");return}}else{l.cold=next;saveState()}rl2();renderAction();ntf(next?"已标记提至冷钱包":"已恢复为待确认提币")}
function clr(){if(dcaLedgerView()){if(confirm("完整 DCA 账本已启用。为防止主站与账本口径分裂，请到完整账本中删除或编辑流水。"))location.href="./dca.html";return}if(!confirm("确认清空所有买入记录、本月预算执行额和本月回撤档位状态？持仓数量不会回退，个人成本曲线会保留持仓基线。"))return;S.log=[];S.bud={base:0,pull:0,ext:0};saveState();upB();rl2();renderPersonalChart();trig();ntf("已清空")}
function upHigh(){if(!(S.price>0)){ntf("实时价格就绪后再锚定");return}S.rh=S.price;S.rhManual=true;$("rh").value=S.price;updateAnchorMode();saveState();trig();ntf("锚点已锁定 $"+S.price.toLocaleString())}
function resetMonthBudget(){
  const view=executionProject();upB();renderExecutionReview();
  if(view.issues.length){ntf(view.issues.join("；"));return}
  ntf("预算已按实际流水核对；不会清零已执行金额");
}
let modalReturnFocus=null;
function oe(){const h=S.hd,synced=!!dcaLedgerView();modalReturnFocus=document.activeElement;[$("ed0").value,$("ed1").value,$("ed2").value,$("ed3").value,$("ed5").value,$("ed6").value,$("ed7").value,$("ed8").value]=[h.d,h.dcCny,h.l,h.lcCny,h.ibit,h.gridLo,h.gridHi,h.goal];$("ed0").disabled=$("ed1").disabled=synced;$("ed4").value=S.fx||7.1;renderLedgerSyncState();$("em").style.display="flex";requestAnimationFrame(()=>(synced?$("ed2"):$("ed0")).focus())}
function ce(){const m=$("em"),finish=()=>{m.style.display="none";m.classList.remove("closing");if(modalReturnFocus&&modalReturnFocus.focus)modalReturnFocus.focus();modalReturnFocus=null};if(stillMode()){finish();return}m.classList.add("closing");setTimeout(finish,200)}
function se(){const synced=!!dcaLedgerView(),old=S.hd,fx=Math.max(.01,+$("ed4").value||7.1),d=synced?+old.d||0:Math.max(0,+$("ed0").value||0),dcCny=synced?Math.max(0,+old.dcCny||0):Math.max(0,+$("ed1").value||0),l=Math.max(0,+$("ed2").value||0),lcCny=Math.max(0,+$("ed3").value||0);S.fx=fx;S.hd={d,dc:d>0?dcCny/(fx*d):0,dcCny,l,lc:l>0?lcCny/(fx*l):0,lcCny,costSchema:2,ibit:Math.max(0,+$("ed5").value||0),gridLo:Math.max(0,+$("ed6").value||0),gridHi:Math.max(0,+$("ed7").value||0),goal:Math.max(1,+$("ed8").value||300000)};if(synced)syncDcaLedgerToMain(false);saveState();upH2();upG();renderPersonalChart();ce();ntf("持仓与目标已更新")}
function sst(id,tx,cl){const e=$(id);if(e){e.textContent=tx;e.style.color=cl}}
function fmtPriceK(v){if(!(v>0))return"--";return v>=1000000?"$"+(v/1000000).toFixed(2)+"M":"$"+(v/1000).toFixed(1)+"K"}
function renderHalvingProgress(hv){
  const fill=$("halvingProgress"),pctEl=$("halvingPct"),blocksEl=$("halvingBlocks");if(!fill||!pctEl||!blocksEl)return 0;
  if(!(hv>0)){fill.style.width="0%";pctEl.textContent="本轮已完成 --";blocksEl.textContent="剩余 -- 区块";return 0}
  const approx=Math.round(hv*144),saved=+S.sigs.hb||0,blocks=saved>0&&Math.abs(saved-approx)<=144?saved:approx,pct=Math.max(0,Math.min(100,(1-blocks/210000)*100));
  fill.style.width=pct.toFixed(1)+"%";pctEl.textContent=`本轮已完成 ${pct.toFixed(1)}%`;blocksEl.textContent=`剩余 ${Math.max(0,blocks).toLocaleString()} 区块`;return blocks;
}
function renderLthNupl(v){
  const cursor=$("lthCursor");
  if(!Number.isFinite(v)){sst("ss7","等待数据","var(--text-tertiary)");if(cursor)cursor.style.left="33.33%";return}
  const state=v<-.3?["深度投降 · 极端浮亏","var(--market-negative)"]:v<0?["整体浮亏 · 警戒","var(--market-negative)"]:v<.1?["警戒区 · 接近盈亏线","var(--market-caution)"]:v<.25?["利润收窄 · 接近警戒","var(--market-caution)"]:v<.5?["盈利健康","var(--market-positive-emphasis)"]:["利润丰厚","var(--market-positive)"];
  sst("ss7",state[0],state[1]);
  if(cursor){const pos=(Math.max(-.5,Math.min(1,v))+.5)/1.5*100;cursor.style.left=pos.toFixed(2)+"%";cursor.style.background=state[1]}
}
function renderLthPsil(value,previous,price=null,day=""){
  const v=finiteValue(value),prev=finiteValue(previous),out=$("lthPsilValue"),delta=$("lthPsilDelta"),stateEl=$("lthPsilState"),priceEl=$("lthPsilPrice"),dayEl=$("lthPsilDay");
  if(v==null||v<0||v>100){if(out)out.textContent="--";if(delta)delta.textContent="--";if(stateEl){stateEl.textContent="等待链上数据";stateEl.style.color="var(--text-tertiary)"}return}
  const state=lthPsilState(v);if(out){out.textContent=v.toFixed(2)+"%";out.style.color=state[1]}if(stateEl){stateEl.textContent=state[0];stateEl.style.color=state[1]}if(delta){delta.textContent=prev==null?"--":signed(v-prev,2,"pp");delta.style.color=prev==null?"var(--text-tertiary)":v>prev?"var(--market-caution)":v<prev?"var(--market-positive)":"var(--text-secondary)"}if(priceEl&&price>0)priceEl.textContent=lthPsilMoney(price);if(dayEl&&day)dayEl.textContent="数据日 "+day;
}
function renderPuellMarket(value){
  const v=finiteValue(value),out=$("puellMarket");
  if(!out)return;
  if(v==null||v<=0){
    out.textContent="--";
    sst("ssPuell","等待数据","var(--text-tertiary)");
    return;
  }
  out.textContent=v.toFixed(2);
  const state=
    v<.5?["矿工收入低迷","var(--market-positive)"]:
    v<1?["低于年均","var(--market-positive-emphasis)"]:
    v<2?["收入正常","var(--text-secondary)"]:
    v<4?["收入偏热","var(--market-caution)"]:
         ["周期过热","var(--market-negative)"];
  sst("ssPuell",state[0],state[1]);
  out.style.color=state[1];
}
function sig(persist=true,render=true){
  const lthRaw=$("slth").value,lth=lthRaw===""?null:+lthRaw,curp=S.price,lo=+$("slo").value||0,hi=+$("shi").value||0,bl=+$("sbl").value||0,wm=+$("swm").value||0,sp=+$("ssp").value||0,hv=+$("shv").value||0,pb=+$("spb").value||0,pu=+$("spu").value||0;
  if(lo&&hi){const bel=curp<lo,abv=curp>hi,span=Math.max(1,hi-lo),pos=Math.min(100,Math.max(0,(curp-lo)/span*100)),labelPos=Math.min(78,Math.max(22,pos)),pcm=Math.round(Math.min(100,Math.max(0,(hi-curp)/span*100)));sst("ss0",bel?"全网亏损":abv?"全面盈利":`约${pcm}%承压`,bel?"var(--market-positive)":abv?"var(--text-secondary)":pcm>60?"var(--market-negative)":"var(--market-caution)");$("sloFmt").textContent=fmtPriceK(lo);$("shiFmt").textContent=fmtPriceK(hi);$("minerDot").style.left=pos.toFixed(1)+"%";$("minerNow").style.left=labelPos.toFixed(1)+"%";$("minerNow").textContent="当前 "+fmtPriceK(curp)}
  if(bl){const r=curp/bl;sst("ss1",r<1?"极低估":r<1.5?`${r.toFixed(2)}x 合理`:r<2.5?`${r.toFixed(2)}x 偏高`:`${r.toFixed(2)}x 高估`,r<1?"var(--market-positive)":r<1.5?"var(--market-warning)":r<2.5?"var(--market-caution)":"var(--market-negative)")}
  if(wm){const r=curp/wm;sst("ss2",r<1?"历史底部区":r<1.5?`${r.toFixed(2)}x 正常`:r<2.5?`${r.toFixed(2)}x 偏高`:`${r.toFixed(2)}x 高估`,r<1?"var(--market-positive)":r<1.5?"var(--market-warning)":r<2.5?"var(--market-caution)":"var(--market-negative)")}
  if(sp)sst("ss3",sp<.97?"深度投降 买入":sp<1?"轻度投降":sp<1.05?"获利了结":"顶部信号",sp<.97?"var(--market-positive)":sp<1?"var(--market-warning)":sp<1.05?"var(--text-secondary)":"var(--market-negative)");
  let hb=0;if(hv){sst("ss4",hv+" 天"+(hv>500?" · 尚早":hv>180?" · 接近":" · 冲刺"),hv>500?"var(--text-secondary)":hv>180?"var(--market-warning)":"var(--market-positive)");hb=renderHalvingProgress(hv)}else renderHalvingProgress(0);
  if(pb)sst("ss5",pb<10?"可能性很低":pb<25?"可能性偏低":pb<40?"可能性中等":"可能性偏高",pb<10?"var(--market-positive)":pb<25?"var(--market-warning)":pb<40?"var(--market-caution)":"var(--market-negative)");
  if(pu)sst("ss6",pu<20?"可能性很低":pu<40?"可能性偏低":pu<60?"五五开":pu<80?"可能性偏高":"可能性很高",pu<20?"var(--market-negative)":pu<40?"var(--market-caution)":pu<60?"var(--text-secondary)":"var(--market-positive)");
  renderLthNupl(lth);
  S.sigs={lo,hi,bl,wm,sp,hv,hb,pb,pu,lth};if(persist)saveState();if(render)renderAction();
}
function rSig(){const m={lo:"slo",hi:"shi",bl:"sbl",wm:"swm",sp:"ssp",hv:"shv",pb:"spb",pu:"spu",lth:"slth"};Object.keys(m).forEach(k=>{const e=$(m[k]);if(e&&S.sigs&&S.sigs[k]!=null)e.value=S.sigs[k]});sig()}
function pre(t){const offset=[-4,2,0,3,-2,4,-1];DM.forEach((_,i)=>$(`d${i}`).value=Math.max(0,Math.min(100,t+offset[i])));calc()}
function ntf(msg){$("nf").textContent=msg;$("nf").classList.add("on");clearTimeout(ntfTimer);ntfTimer=setTimeout(()=>$("nf").classList.remove("on"),2300)}
function ensureMonth(notify=true){
  const changed=S.month!==mstr();executionProject();if(!changed)return false;
  const cm=$("cm");if(cm)cm.textContent=S.month;saveState();
  if($("b0"))upB();if($("actionTitle"))renderAction();
  if(notify)ntf("新月份 "+S.month+" · 已按本月流水汇总");return true;
}
async function tickPrice(){
  if(document.visibilityState==="hidden"||navigator.onLine===false||priceTickInFlight||fetchInFlight)return;
  ensureMonth(true);
  priceTickInFlight=true;
  const refreshEpoch=priceRefreshEpoch;
  try{
    const t=await fetchSpotTicker(6000),p=t.price,c=t.change24h;
    if(refreshEpoch!==priceRefreshEpoch||fetchInFlight)return;
    if(p>0){
      const prevP=+$("bp").dataset.rv||parsePrice($("bp").value)||S.price;
      S.manualPrice=false;S.price=Math.round(p);
      flashPrice(Math.sign(S.price-prevP));
      rollInput($("bp"),S.price);
      if(document.activeElement!==$("lp"))$("lp").value=S.price;
      if(Number.isFinite(c))renderPriceDelta24(c);
      lastTickAt=Date.now();
      pingDot();fireSweep(sweepTarget("hero"));
      renderPriceTick();
      renderFunds();commitStatusSnapshot(false,false);renderDailyChanges();
      if(!fetchInFlight)$("lupdated").textContent=(lastTickAt?"价格"+cacheAge(lastTickAt)+"更新":"等待价格")+(lastFullAt?" · 指标"+cacheAge(lastFullAt)+"更新":"");
    }
  }catch(e){
    if(refreshEpoch===priceRefreshEpoch&&!fetchInFlight)setLiveStatus("",S.manualPrice?"报价更新失败 · 当前为手动试算":lastTickAt?`价格 ${cacheAge(lastTickAt)} · 更新失败`:"报价暂不可用。点按刷新图标重试。");
  }finally{priceTickInFlight=false}
}
function handleVisibilityChange(){
  if(document.visibilityState==="hidden"){persistIndicatorHistory(true);saveState();return}
  APP_SAFE_TOP_CACHE=null;
  syncStandaloneSafeArea(true);
  setStandaloneTabLayout(ACTIVE_TAB);
  ensureMonth(true);
  if(!lastFullAt||Date.now()-lastFullAt>=CACHE_TTL)fetchLive(true);
  else tickPrice();
  const powerSec=$("powerlaw"),miningSec=$("mining"),holderSec=$("holders"),floorSec=$("floor"),costBasisSec=$("costbasis"),capitalizedSec=$("capitalized"),psilSec=$("lthpsil"),lthSec=$("lthpulse"),custodySec=$("custody");
  if(document.body.dataset.bitviewOverviewReady)refreshBitviewOverview(false);
  if(powerSec&&powerSec.dataset.ready)refreshPowerHistory(false);
  if(miningSec&&miningSec.dataset.ready)refreshMiningTrends(false);
  if(holderSec&&holderSec.dataset.ready)refreshHolderCohorts(false);
  if(costBasisSec&&costBasisSec.dataset.ready)refreshCostBasisPrice(false);
  if(capitalizedSec&&capitalizedSec.dataset.ready)refreshCapitalizedPrice(false);
  if(psilSec&&psilSec.dataset.ready)refreshLthPsil(false);
  if(lthSec&&lthSec.dataset.ready)refreshLthPulse(false);
  if(custodySec&&custodySec.dataset.ready)refreshCustodyWindow(false);
  const lossSec=$("lossdepth");if(lossSec&&lossSec.dataset.ready)refreshDeepLoss(false);
  if(floorSec&&floorSec.dataset.ready){refreshBitviewFloor(false);refreshFloorModel(false)}
}
window.addEventListener("pagehide",()=>{persistIndicatorHistory(true);saveState()},{passive:true});
window.addEventListener("orientationchange",()=>{
  APP_SAFE_TOP_CACHE=null;
  setTimeout(()=>{
    syncStandaloneSafeArea(true);
    setStandaloneTabLayout(ACTIVE_TAB);
    if(isStandaloneApp())resetStandaloneTabTop();
  },80);
},{passive:true});
try{
  if(window.visualViewport)window.visualViewport.addEventListener("resize",()=>{APP_SAFE_TOP_CACHE=null},{passive:true});
}catch(e){}
window.addEventListener("storage",e=>{if(e.key!==DCA_LEDGER_KEY)return;try{syncDcaLedgerToMain(false);upB();upH2();rl2();renderPersonalChart();trig();saveState();ntf("完整 DCA 账本已同步")}catch(err){try{console.warn("DCA 账本同步失败",err)}catch(_){}}});
const fetchLiveCore=fetchLive;
fetchLive=async function(force=false){
  if(fetchInFlight)return;
  fetchInFlight=true;
  priceRefreshEpoch++;
  const healthSyncStarted=Date.now();
  const refreshBtn=$("refreshBtn");focusSetBusy(refreshBtn,true);focusRefreshStarted();
  let failed=false;
  try{
    return await fetchLiveCore(force);
  }catch(e){
    failed=true;
    console.error("数据刷新中断",e);
    setLiveStatus("","刷新中断。点按刷新图标重试。");
  }finally{
    fetchInFlight=false;
    if(!failed&&typeof collectImportantChanges==="function")collectImportantChanges();
    if(force){HEALTH_RUNTIME.lastSyncAt=Date.now();HEALTH_RUNTIME.lastSyncDuration=Date.now()-healthSyncStarted;HEALTH_RUNTIME.lastSyncOk=coreHealthInfo().ready}
    focusSetBusy(refreshBtn,false);
    sweepCollect=false;
    FALLBACK_HEALTH={};
    if(progActive)progDone();
    renderHealth();
    focusRefreshFinished(failed);
  }
};
try{if("scrollRestoration" in history)history.scrollRestoration="manual"}catch(e){}
const TAB_KEY="btc_active_tab_v1";
const TAB_DEFS=[
  {id:"now",label:"行情",secs:["today","ahr","tributeEntry","homeLadder","homeFoot"]},
  {id:"value",label:"分析",secs:["analysisIntro","todayCard","cycleDrawdown","valuation","decision","powerlaw","floor","radar","liquidity","ma","healthPanel"]},
  {id:"chain",label:"链上",secs:["chainIntro","cycleBottom","cycleTop","costbasis","coststate","capitalized","lthpsil","lthchips","lthpulse","holders","distribution","lossdepth","mining","market"]},
  {id:"mine",label:"我的",secs:["mineIntro","homePlan","personal","twentyone","dcalab","custody"]}
];
const SEC_TAB={};TAB_DEFS.forEach(t=>t.secs.forEach(id=>SEC_TAB[id]=t.id));
SEC_TAB.plan="mine";SEC_TAB.holding="mine";
let ACTIVE_TAB=TAB_DEFS[0].id;
let sectionNavRefresh=null;
let NAV_DOCK_JUMP_UNTIL=0;
function tabOf(id){return SEC_TAB[id]||""}
function tabLanding(id){return typeof sectionLanding==="function"?sectionLanding(id):document.getElementById(id)}
function isStandaloneApp(){
  try{
    return !!((window.matchMedia&&window.matchMedia("(display-mode: standalone)").matches)||
      window.navigator.standalone===true);
  }catch(e){return false}
}
let APP_SAFE_TOP_CACHE=null;
function appSafeTopInset(force=false){
  if(!isStandaloneApp())return 0;
  if(!force&&Number.isFinite(APP_SAFE_TOP_CACHE))return APP_SAFE_TOP_CACHE;
  let measured=0;
  try{
    const probe=document.createElement("div");
    probe.setAttribute("aria-hidden","true");
    probe.style.cssText="position:fixed;left:0;top:0;width:1px;height:0;padding-top:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none;z-index:-1";
    document.body.appendChild(probe);
    const cs=getComputedStyle(probe);
    measured=Math.max(
      parseFloat(cs.paddingTop)||0,
      probe.getBoundingClientRect().height||0,
      window.visualViewport?Math.max(0,window.visualViewport.offsetTop||0):0
    );
    probe.remove();
  }catch(e){}
  if(measured<24){
    try{
      const sw=Math.min(screen.width||innerWidth,screen.height||innerHeight);
      const sh=Math.max(screen.width||innerWidth,screen.height||innerHeight);
      const ratio=sw>0?sh/sw:0;
      if(ratio>2.05)measured=sw>=420?59:47;
      else measured=20;
    }catch(e){measured=47}
  }
  APP_SAFE_TOP_CACHE=Math.max(0,measured);
  return APP_SAFE_TOP_CACHE;
}
function syncStandaloneSafeArea(force=false){
  const root=document.documentElement,standalone=isStandaloneApp();
  root.classList.toggle("pwa-standalone",standalone);
  if(!standalone){
    root.classList.remove("pwa-nonhome","pwa-tab-reset");
    root.style.removeProperty("--pwa-runtime-safe-top");
    return 0;
  }
  if(force)APP_SAFE_TOP_CACHE=null;
  const inset=appSafeTopInset(force);
  root.style.setProperty("--pwa-runtime-safe-top",Math.max(24,inset)+"px");
  return inset;
}
function setStandaloneTabLayout(tabId){
  const root=document.documentElement;
  if(!isStandaloneApp()){
    root.classList.remove("pwa-nonhome","pwa-tab-reset");
    return;
  }
  syncStandaloneSafeArea(false);
  root.classList.toggle("pwa-nonhome",tabId!=="now");
}
function resetStandaloneTabTop(){
  if(!isStandaloneApp())return;
  const root=document.documentElement;
  root.classList.add("pwa-tab-reset");
  try{if("scrollRestoration" in history)history.scrollRestoration="manual"}catch(e){}
  const reset=()=>{
    try{window.scrollTo({top:0,left:0,behavior:"auto"})}
    catch(e){window.scrollTo(0,0)}
  };
  reset();
  requestAnimationFrame(()=>requestAnimationFrame(reset));
  setTimeout(reset,100);
  setTimeout(reset,280);
  setTimeout(()=>root.classList.remove("pwa-tab-reset"),420);
}
function appSectionTopOffset(force=false){
  if(isStandaloneApp())return appSafeTopInset(force)+22;
  // 电脑大屏导航在顶部，定位时留出导航高度
  return window.matchMedia&&matchMedia("(min-width:1024px)").matches?100:18;
}
function correctSectionTop(el,forceSafe=false){
  if(!el)return;
  const wanted=appSectionTopOffset(forceSafe);
  const actual=el.getBoundingClientRect().top;
  const delta=actual-wanted;
  if(Math.abs(delta)<=2)return;
  try{window.scrollBy({top:delta,left:0,behavior:"auto"})}
  catch(e){window.scrollBy(0,delta)}
}
function scrollSectionToAppTop(el,behavior){
  if(!el)return;
  if(typeof revealFocusSection==="function")revealFocusSection(el);
  const mode=behavior||"auto";
  try{el.scrollIntoView({block:"start",inline:"nearest",behavior:mode})}
  catch(e){
    const y=el.getBoundingClientRect().top+window.scrollY-appSectionTopOffset(true);
    window.scrollTo(0,Math.max(0,y));
  }
  const settle=()=>correctSectionTop(el,true);
  if(mode==="smooth"){
    setTimeout(settle,420);
    setTimeout(settle,620);
  }else{
    requestAnimationFrame(()=>requestAnimationFrame(settle));
    setTimeout(settle,140);
  }
}
function keepDockVisibleForTabNavigation(){
  NAV_DOCK_JUMP_UNTIL=Date.now()+600;
  const dock=document.querySelector(".nav-dock");
  if(dock)dock.classList.remove("scroll-hidden")
}
function initTabs(){
  const w=document.querySelector(".w");if(!w)return;
  syncStandaloneSafeArea(true);
  // Accordion wrappers inherit the tab of their existing module; their IDs remain deep-linkable.
  let pending=[],last=TAB_DEFS[0].id;
  [...w.children].forEach(el=>{
    if(el.classList.contains("aurum-hero")||el.classList.contains("nav-dock")||
       el.classList.contains("tab-bar")||el.classList.contains("section-nav"))return;
    const t=tabOf(el.dataset.module||el.id||"");
    if(t){el.dataset.tab=t;last=t;pending.forEach(x=>x.dataset.tab=t);pending=[]}
    else pending.push(el);
  });
  pending.forEach(x=>x.dataset.tab=last);
  document.querySelectorAll(".section-nav a").forEach(a=>{
    a.dataset.tabOwner=a.dataset.section?tabOf(a.dataset.section):"value";  // AHR 专页链接归入估值
  });
  let start=TAB_DEFS[0].id;
  const hash=(location.hash||"").replace(/^#/,"");
  if(hash&&tabOf(hash))start=tabOf(hash);
  // Without an explicit deep link, always open the two core indicators.
  setTab(start,true);
  setStandaloneTabLayout(start);
  requestAnimationFrame(()=>{
    if(start==="now"&&!hash){if(isStandaloneApp())resetStandaloneTabTop();return}
    const target=(hash&&tabOf(hash)===start&&document.getElementById(hash))
      ?document.getElementById(hash)
      :(TAB_DEFS.find(t=>t.id===start)?.secs.map(tabLanding).find(el=>el&&el.offsetParent!==null));
    if(hash&&target&&target.tagName==="DETAILS")target.open=true;
    if(isStandaloneApp()&&!hash){
      // Home Screen PWA: one safe padding belongs to the active non-home page.
      // Never restore a stale middle-of-card scroll position.
      setStandaloneTabLayout(start);
      resetStandaloneTabTop();
    }else if(target){
      // Normal Safari and explicit hash deep links keep the existing precise section navigation.
      scrollSectionToAppTop(target,"auto");
    }
  });
  const bar=$("tabBar");
  if(bar)bar.addEventListener("keydown",e=>{
    if(e.key!=="ArrowLeft"&&e.key!=="ArrowRight")return;
    const btns=[...bar.querySelectorAll("button[data-tab]")];
    const i=btns.indexOf(document.activeElement);
    if(i<0)return;
    e.preventDefault();
    const j=(i+(e.key==="ArrowRight"?1:-1)+btns.length)%btns.length;
    btns[j].focus();setTab(btns[j].dataset.tab);
  });
}
function setTab(id,silent){
  if(!TAB_DEFS.some(t=>t.id===id))id=TAB_DEFS[0].id;
  const w=document.querySelector(".w");if(!w)return;
  // 点击分区属于程序定位，不应触发“向下滑动隐藏底栏”。
  if(!silent)keepDockVisibleForTabNavigation();
  ACTIVE_TAB=id;
  setStandaloneTabLayout(id);
  // BTC 价格与今日情报是「今日」首页头部；其余分区直接从自己的第一张指标卡开始。
  const isToday=id==="now",hero=document.querySelector(".aurum-hero");
  if(hero){hero.style.display=isToday?"":"none";hero.setAttribute("aria-hidden",isToday?"false":"true")}
    if(isToday)requestAnimationFrame(function(){try{renderPriceSpark()}catch(e){}try{renderFgiTabs();renderFgiChart()}catch(e){}});
  // divider 归属它后面的板块；分区内第一条分隔线要藏起来，否则顶部会多一道横线
  let seen=false;
  [...w.children].forEach(el=>{
    const t=el.dataset.tab;if(!t)return;
    const on=t===id;
    if(el.classList.contains("divider")){el.style.display=(on&&seen)?"":"none";return}
    el.style.display=on?"":"none";
    if(on)seen=true;
  });
  document.querySelectorAll(".tab-bar button").forEach(b=>{
    const on=b.dataset.tab===id;
    b.classList.toggle("active",on);
    if(on)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current");
  });
  const def=TAB_DEFS.find(t=>t.id===id);
  if($("indicatorTabLabel"))$("indicatorTabLabel").textContent=(def?def.label:"指标")+" · 指标浏览";
  if($("indicatorActiveLabel")){
    const n=document.querySelectorAll(".indicator-links a[data-section]").length;
    $("indicatorActiveLabel").textContent="浏览全部 "+n+" 个模块";
    if($("indicatorCount"))$("indicatorCount").textContent=String(n);
  }
  if(!silent)closeIndicatorNav(false);
  try{localStorage.setItem(TAB_KEY,id)}catch(e){}
  if(!silent){
    try{history.replaceState(null,"",location.pathname+location.search)}catch(e){}
    // iPhone Home Screen PWA uses a real top spacer for value / chain / mine.
    // Therefore the correct coordinate is always scrollY=0; never force the first card
    // into the visual viewport where the translucent iOS status bar can cover it.
    const first=id==="now"?null:(def&&def.secs.map(tabLanding).find(el=>el&&el.offsetParent!==null));
    const prev=document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior="auto";
    if(isStandaloneApp()){
      setStandaloneTabLayout(id);
      resetStandaloneTabTop();
    }else if(id==="now"){
      window.scrollTo(0,0);
    }else if(first){
      // Normal Safari is intentionally unchanged.
      scrollSectionToAppTop(first,"auto");
    }else{
      window.scrollTo(0,0);
    }
    document.documentElement.style.scrollBehavior=prev;
    try{window.dispatchEvent(new Event("tab-navigation"))}catch(e){}
  }
  // 隐藏期间容器尺寸为 0，图表需要重新测量；resize 覆盖所有 ResizeObserver 型图表
  requestAnimationFrame(()=>{
    try{window.dispatchEvent(new Event("resize"))}catch(e){}
    if(sectionNavRefresh)try{sectionNavRefresh()}catch(e){}
    [moduleIsReady("decision")&&typeof renderDecisionChart==="function"?renderDecisionChart:null,
     moduleIsReady("powerlaw")&&typeof drawPowerChart==="function"?drawPowerChart:null,
     moduleIsReady("floor")&&typeof drawFloorChart==="function"?drawFloorChart:null,
     moduleIsReady("capitalized")&&typeof drawCapitalizedChart==="function"?drawCapitalizedChart:null,
     moduleIsReady("lthpsil")&&typeof drawLthPsilChart==="function"?drawLthPsilChart:null,
     typeof renderPersonalChart==="function"?renderPersonalChart:null,
     moduleIsReady("floor")&&typeof renderFloorSummary==="function"?renderFloorSummary:null
    ].forEach(f=>{if(f)try{f()}catch(e){}});
    if(id!=="now"&&def&&!isStandaloneApp()){
      const first=def.secs.map(tabLanding).find(el=>el&&el.offsetParent!==null);
      if(first)setTimeout(()=>correctSectionTop(first,true),80);
    }
  });
}
function filterIndicatorNav(value){
  const q=String(value||"").trim().toLocaleLowerCase("zh-CN");
  let shown=0;
  document.querySelectorAll(".indicator-links a").forEach(a=>{
    const hay=(a.textContent+" "+(a.dataset.keywords||"")).toLocaleLowerCase("zh-CN");
    const on=!q||hay.includes(q);a.hidden=!on;if(on&&a.dataset.section)shown++;
  });
  if($("indicatorEmpty"))$("indicatorEmpty").hidden=shown>0;
  if($("indicatorCount"))$("indicatorCount").textContent=String(shown);
}
function setIndicatorNav(open,returnFocus){
  const dock=document.querySelector(".nav-dock"),trigger=$("indicatorTrigger");if(!dock)return;
  if(open)dock.classList.remove("scroll-hidden");
  dock.classList.toggle("indicators-open",!!open);
  if(trigger)trigger.setAttribute("aria-expanded",open?"true":"false");
  if(open){
    filterIndicatorNav($("indicatorSearch")?$("indicatorSearch").value:"");
    requestAnimationFrame(()=>{if($("indicatorSearch"))$("indicatorSearch").focus({preventScroll:true})});
  }else{
    if($("indicatorSearch"))$("indicatorSearch").value="";filterIndicatorNav("");
    if(returnFocus!==false&&trigger)requestAnimationFrame(()=>trigger.focus({preventScroll:true}));
  }
}
function toggleIndicatorNav(){
  const dock=document.querySelector(".nav-dock");setIndicatorNav(!(dock&&dock.classList.contains("indicators-open")),true);
}
function closeIndicatorNav(returnFocus){setIndicatorNav(false,returnFocus)}
function initIndicatorNav(){
  const search=$("indicatorSearch");if(search)search.addEventListener("input",e=>filterIndicatorNav(e.target.value));
  document.addEventListener("keydown",e=>{
    const dock=document.querySelector(".nav-dock");if(!dock||!dock.classList.contains("indicators-open"))return;
    if(e.key==="Escape"){e.preventDefault();closeIndicatorNav(true);return}
    if(e.key!=="Tab")return;
    const panel=$("sectionNav");if(!panel)return;
    const focusable=[...panel.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])')]
      .filter(el=>!el.hidden&&el.getClientRects().length);
    if(!focusable.length){e.preventDefault();return}
    const first=focusable[0],last=focusable[focusable.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
  });
}
function initSectionNav(){
  const links=[...document.querySelectorAll(".section-nav a[data-section]")];
  if(!links.length)return;

  let raf=0,current="";

  const bar=$("indicatorLinks")||links[0].parentElement;
  const reveal=el=>{
    const dock=document.querySelector(".nav-dock");if(!bar||!el||!dock||!dock.classList.contains("indicators-open"))return;
    try{el.scrollIntoView({block:"nearest",inline:"nearest",behavior:stillMode()?"auto":"smooth"})}catch(e){}
  };

  const setActive=id=>{
    if(id===current)return;
    current=id;
    links.forEach(a=>{
      const on=a.dataset.section===id;
      a.classList.toggle("active",on);
      if(on){
        a.setAttribute("aria-current","page");reveal(a);
        const label=(a.querySelector("b")||a).textContent.trim();
        if($("indicatorActiveLabel"))$("indicatorActiveLabel").textContent="当前 · "+label;
      }
      else a.removeAttribute("aria-current");
    });
  };

  links.forEach(a=>{
    a.addEventListener("click",e=>{
      e.preventDefault();
      const id=a.dataset.section,owner=a.dataset.tabOwner||tabOf(id),sec=document.getElementById(id);
      if(owner&&owner!==ACTIVE_TAB)setTab(owner,true);
      if(sec&&sec.tagName==="DETAILS")sec.open=true;
      closeIndicatorNav(false);setActive(id);
      requestAnimationFrame(()=>{
        if(sec)scrollSectionToAppTop(sec,stillMode()?"auto":"smooth");
        try{history.replaceState(null,"",location.pathname+location.search+"#"+id)}catch(_){}
      });
    });
  });

  const update=()=>{
    raf=0;
    const probe=window.scrollY+Math.min(window.innerHeight*.32,240);
    const live=links.filter(a=>{const sec=document.getElementById(a.dataset.section);return sec&&sec.offsetParent!==null});
    if(!live.length)return;
    let id=live[0].dataset.section;
    const firstSec=document.getElementById(id);
    if(ACTIVE_TAB==="now"&&firstSec&&probe<firstSec.offsetTop){
      current="";links.forEach(a=>{a.classList.remove("active");a.removeAttribute("aria-current")});
      if($("indicatorActiveLabel"))$("indicatorActiveLabel").textContent="今日概览";
      return;
    }

    live.forEach(a=>{
      const sec=document.getElementById(a.dataset.section);
      if(sec&&sec.offsetTop<=probe)id=a.dataset.section;
    });

    if(window.innerHeight+window.scrollY>=document.documentElement.scrollHeight-24){
      id=live.at(-1).dataset.section;
    }

    setActive(id);
  };

  window.addEventListener("scroll",()=>{
    if(!raf)raf=requestAnimationFrame(update);
  },{passive:true});

  window.addEventListener("resize",update,{passive:true});
  sectionNavRefresh=()=>{current="";update()};
  update();
}
function initAutoHideDock(){
  const dock=document.querySelector(".nav-dock");if(!dock||dock.dataset.autoHideReady)return;
  dock.dataset.autoHideReady="1";
  let lastY=Math.max(0,window.scrollY),travel=0,raf=0;
  const show=()=>{dock.classList.remove("scroll-hidden");travel=0};
  const update=()=>{
    raf=0;
    const y=Math.max(0,window.scrollY),delta=y-lastY;lastY=y;
    if(Date.now()<NAV_DOCK_JUMP_UNTIL){show();return}
    if(dock.classList.contains("indicators-open")||y<72){show();return}
    if(Math.abs(delta)<1)return;
    if(delta>0){
      travel=travel<0?delta:travel+delta;
      if(travel>=24)dock.classList.add("scroll-hidden");
    }else{
      travel=travel>0?delta:travel+delta;
      if(travel<=-10)show();
    }
  };
  window.addEventListener("scroll",()=>{if(!raf)raf=requestAnimationFrame(update)},{passive:true});
  window.addEventListener("tab-navigation",()=>{lastY=Math.max(0,window.scrollY);show()},{passive:true});
  // 只在「切换分区后的保护期」内重置基准；平时不重置，否则电脑滚轮向上时导航不会出现
  const releaseTabJump=()=>{if(!NAV_DOCK_JUMP_UNTIL)return;NAV_DOCK_JUMP_UNTIL=0;lastY=Math.max(0,window.scrollY);travel=0};
  window.addEventListener("touchstart",releaseTabJump,{passive:true});
  window.addEventListener("wheel",releaseTabJump,{passive:true});
  window.addEventListener("pageshow",()=>{lastY=Math.max(0,window.scrollY);if(lastY<72)show()},{passive:true});
  dock.addEventListener("focusin",show);
}
function initPersonalLazy(){
  initPersonalReview();
  const zone=$("personal");if(!zone||zone.dataset.lazyReady)return;zone.dataset.lazyReady="1";
  zone.addEventListener("toggle",()=>{if(!zone.open)return;trig(false,false);upH2();rl2();renderPersonalChart()});
  if(zone.open){trig(false,false);upH2();rl2();renderPersonalChart()}
}
function initModalA11y(){
  const modal=$("em");if(!modal)return;modal.addEventListener("click",e=>{if(e.target===modal)ce()});
  document.addEventListener("keydown",e=>{if(modal.style.display!=="flex")return;if(e.key==="Escape"){e.preventDefault();ce();return}if(e.key!=="Tab")return;const items=[...modal.querySelectorAll("button,input,select,[tabindex]:not([tabindex='-1'])")].filter(x=>!x.disabled&&x.offsetParent!==null);if(!items.length)return;const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}})
}
function init(){
  initChangeJournal();
  try{const u=new URL(location.href);
  if(u.searchParams.has("v")||u.searchParams.has("_build")||u.searchParams.has("_head")){
    u.searchParams.delete("v");u.searchParams.delete("_build");u.searchParams.delete("_head");
    history.replaceState(null,"",u.pathname+(u.search||"")+u.hash)}}catch(e){}
  injectManifest();
  buildUI();
  arrangeDashboard();
  executionInit();
  try{syncDcaLedgerToMain(false)}catch(e){try{console.warn("DCA 账本载入失败",e)}catch(_){}}
  if($("heroDate")){const day=statusDay();$("heroDate").textContent=day.slice(5).replace("-"," · ");$("heroDate").setAttribute("aria-label","UTC 日期 "+day)}
  renderBgKeyState();
  initHealthCenter();
  $("buildBadge").textContent=BUILD_LABEL;
  const monthChanged=ensureMonth(false);if(monthChanged)setTimeout(()=>ntf("新月份 "+S.month+" · 预算已按本月流水汇总"),600);
  $("cm").textContent=S.month;$("bp").value=S.price>0?fmtPrice(S.price):"";$("rh").value=S.rh>0?S.rh:"";$("lp").value=S.price>0?S.price:"";
  S.dims.forEach((v,i)=>$(`d${i}`).value=v);
  restoreMetricHistoryCache();
  // Restore folds before tab/hash navigation; a deep link can still reveal its target.
  if(typeof restoreFocusView==="function")restoreFocusView();
  initTabs();
  initPriceHint();
  calc();upB();trig();upH2();upG();rl2();rSig();renderMA();if(S.ahr)renderAhr(S.ahr);renderPriceSpark();renderFunds();renderDailyChanges();updateAnchorMode();initBitviewOverview();initDecisionControls();lazySection("decision",renderDecisionChart);lazySection("powerlaw",initPowerLaw);lazySection("floor",()=>{initBitviewFloor();initFloorModel()});lazySection("coststate",initCostStructureState);lazySection("mining",initMiningTrends);lazySection("holders",initHolderCohorts);lazySection("costbasis",initCostBasisPrice);lazySection("capitalized",initCapitalizedPrice);lazySection("lthpsil",initLthPsil);lazySection("lthpulse",initLthPulse);lazySection("lossdepth",initDeepLoss);lazySection("custody",initCustodyWindow);lazySection("dcalab",initDcaLab);initPersonalLazy();initModalA11y();
  try{renderStableCombined()}catch(e){console.error("稳定币卡片初始化失败",e)}
  setTweak(!!S.tweak,true);initIndicatorNav();initSectionNav();initAutoHideDock();
  if(typeof initFocusLayout==="function")initFocusLayout();
  if(typeof initCycleDrawdown==="function")initCycleDrawdown();
  const c=readCache(false),stale=c||readCache(true);
  if(stale){
    lastTickAt=stale.ts||0;restoreCacheHealth(stale);const core=coreHealthInfo();lastFullAt=core.ready?stale.successAt||stale.ts||0:0;applyLive(stale.data);renderHealth();
    setLiveStatus(core.ready?"ok":"",`${c?"缓存":"本机快照"} ${cacheAge(stale.ts)} · 核心 ${core.reliable}/7 · 后台更新`);
    setTimeout(()=>fetchLive(true),c?260:90);
  }else fetchLive(true);
  renderBitviewOverview();
  setTimeout(()=>{if($("lupdated").textContent==="等待加载")fetchLive(true)},800);
  if(!priceTimer)priceTimer=setInterval(tickPrice,60000);
  if(!fullTimer)fullTimer=setInterval(()=>{if(document.visibilityState==="visible"&&!fetchInFlight)fetchLive(true)},CACHE_TTL);
  document.addEventListener("visibilitychange",handleVisibilityChange,{passive:true});
  runWhenNetworkIdle(requestPersistentStorage,1400,12000);
  runWhenNetworkIdle(registerAppWorker,1800,15000);
  runWhenNetworkIdle(async()=>{await checkAppUpdate();renderHealth()},2200,16000);setTimeout(cleanupLegacyKeys,3200);setTimeout(renderBackupHint,1200);
  setTimeout(()=>{if(!BOOT_PAINTED){BOOT_PAINTED=true;document.body.classList.remove("booting")}},6000);
  try{window.addEventListener("themechange",()=>{
    if(personalChart){personalChart.remove();personalChart=null;personalSeries=null;personalMarkers=null;personalDataKey=""}
    if(decisionChart){decisionChart.remove();decisionChart=null;decisionSeries=null;decisionMarkers=null;decisionDataKey=""}
    if(miningHashChart){miningHashChart.remove();miningHashChart=null;miningHashSeries=null;miningHashDataKey=""}
    if(miningDiffChart){miningDiffChart.remove();miningDiffChart=null;miningDiffSeries=null;miningDiffDataKey=""}
    if(moduleIsReady("decision"))renderDecisionChart();
    if(moduleIsReady("powerlaw"))drawPowerChart();
    if(moduleIsReady("floor"))drawFloorChart();
    if(moduleIsReady("costbasis"))drawCostBasisChart();
    if(moduleIsReady("capitalized"))drawCapitalizedChart();
    if(moduleIsReady("mining"))renderMiningCharts();
    if(moduleIsReady("dcalab"))renderDcaLab();
    if($("personal")&&$("personal").open)renderPersonalChart();
  })}catch(e){}
}
init();
let _errNtfAt=0;
function reportRuntimeError(tag,raw){const msg=String(raw==null?"未知":(raw&&raw.message)||raw).slice(0,80);if(/^Script error\.?$/.test(msg))return;try{console.warn(tag,raw)}catch(_){}const now=Date.now();if(now-_errNtfAt<120000)return;_errNtfAt=now;try{ntf(tag+" · "+msg)}catch(_){}}
window.addEventListener("error",e=>reportRuntimeError("运行异常",e&&(e.error||e.message)));
window.addEventListener("unhandledrejection",e=>reportRuntimeError("异步异常",e&&e.reason));

