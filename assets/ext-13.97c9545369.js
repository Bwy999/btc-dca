
(function(){
  "use strict";
  // V26.1.3：沉睡 1 年以上的币重新流通量（Revived Supply 1y+）。
  // 数据：Bitview utxos_over_1y_old_transfer_volume_sum_24h（持有 ≥365 天的 UTXO 每日被花费量，BTC）。
  var COHORT={"1y":{series:"utxos_over_1y_old_transfer_volume_sum_24h",days:365,zh:"1 年",en:"1Y"},"6m":{series:"utxos_over_6m_old_transfer_volume_sum_24h",days:182,zh:"6 个月",en:"6M"}};
  var cohort="1y";try{var sc=localStorage.getItem("btc_revived_cohort_v1");if(COHORT[sc])cohort=sc}catch(e){}
  var KEY0="btc_bitview_revived_v3_",TTL=6*3600*1000;
  
  var data=null,range=0,hover=-1,loading=false,inited=false,p95=null,seriesName=null;
  function $(id){return document.getElementById(id)}
  function css(n,f){var v=getComputedStyle(document.documentElement).getPropertyValue(n).trim();return v||f}
  function fmt(v){var a=Math.abs(v);return a>=1e6?(v/1e6).toFixed(2)+"M":a>=1e4?(v/1e3).toFixed(0)+"K":a>=1e3?(v/1e3).toFixed(1)+"K":Math.round(v).toLocaleString("en-US")}
  async function fetchSeries(name){
    var raw=await tryFetch(bitviewBulkUrl(["date",name],"2011-01-01"),15000),d=pickSeries(raw,"date",0),v=pickSeries(raw,name,1);
    if(!Array.isArray(d)||!Array.isArray(v))throw new Error("no "+name);
    var m={},vals=[];for(var i=0;i<Math.min(d.length,v.length);i++){var x=+v[i];if(/^\d{4}-\d{2}-\d{2}$/.test(String(d[i]))&&Number.isFinite(x)&&x>=0){m[d[i]]=x;vals.push(x)}}
    if(vals.length<100)throw new Error("short "+name);
    // 若数值明显是聪（sats），换算成 BTC
    vals.sort(function(a,b){return a-b});var med=vals[vals.length>>1];
    if(med>2e7)for(var k in m)m[k]=m[k]/1e8;
    return m;
  }

  function labels(){
    var C=COHORT[cohort],en=window.BTC_LANG==="en",t=$("revivedTitle"),sub=$("revivedSub"),src=$("revivedSource"),cv=$("revivedChart");
    if(t)t.textContent=en?"Revived supply "+C.en+"+":"沉睡 "+C.zh+"以上的币重新流通";
    if(sub)sub.textContent=en?"Total BTC that had not moved for at least "+(cohort==="1y"?"1 year":"6 months")+" and then moved again. A rise means old coins are moving together, as is common in bull-market distribution; a low value means long-term holders are staying put."
      :"至少 "+C.zh+"未移动、之后重新转出的 BTC 总量。数值升高说明老币在集中移动，常见于牛市分配阶段；数值低说明长期持有者按兵不动。";
    if(src)src.textContent=en?"Data from Bitview (Bitcoin Research Kit): BTC spent from UTXOs held at least "+C.days+" days, counted per UTC day. For cycle observation only; not in the 7-factor score."
      :"数据来自 Bitview（Bitcoin Research Kit）：持有至少 "+C.days+" 天的 UTXO 被花费的数量，按 UTC 日统计。仅作周期观察，不计入七维评分。";
    if(cv)cv.setAttribute("aria-label",en?"Revived supply "+C.en+"+ and BTC price history":"沉睡 "+C.zh+"以上的币重新流通量与 BTC 价格历史");
    document.querySelectorAll("[data-rv-cohort]").forEach(function(x){var on=x.dataset.rvCohort===cohort;x.classList.toggle("active",on);x.setAttribute("aria-pressed",on?"true":"false")});
  }
  async function load(force){
    if(loading)return;var KEY=KEY0+cohort,c=null;try{c=JSON.parse(localStorage.getItem(KEY)||"null")}catch(e){}
    data=null;p95=null;labels();
    if(c&&Array.isArray(c.rows)&&c.rows.length){data=c.rows;seriesName=c.name;stats();draw()}else{var em0=$("revivedEmpty");if(em0){em0.hidden=false;em0.textContent=window.BTC_LANG==="en"?"Syncing full history…":"正在同步完整历史…"}clearStats();draw()}
    if(!force&&c&&Date.now()-c.ts<TTL)return;
    loading=true;
    try{
      var want=cohort,used=COHORT[want].series,m=await fetchSeries(used);
      if(want!==cohort)return;
      var price={};try{var raw=await tryFetch(bitviewBulkUrl(["date","price"],"2011-01-01"),15000),d=pickSeries(raw,"date",0),v=pickSeries(raw,"price",1);for(var j=0;j<Math.min(d.length,v.length);j++)if(+v[j]>0)price[d[j]]=+v[j]}catch(e){}
      var days=Object.keys(m).sort(),rows=[],win=[],sum=0;
      for(var q=0;q<days.length;q++){var dv=m[days[q]];win.push(dv);sum+=dv;if(win.length>7)sum-=win.shift();rows.push([days[q],+dv.toFixed(2),+sum.toFixed(2),price[days[q]]?+price[days[q]].toPrecision(7):null])}
      data=rows;seriesName=used;
      try{localStorage.setItem(KEY0+want,JSON.stringify({ts:Date.now(),rows:rows,name:used}))}catch(e){}
      stats();
    }catch(e){
      if(!data){var em=$("revivedEmpty");if(em)em.textContent="Bitview 暂未提供该序列，稍后自动重试。";var f=$("revivedFresh");if(f){f.textContent="暂不可用";f.className="fresh-badge warn"}}
    }finally{loading=false;draw()}
  }
  function clearStats(){["revivedDay","revived30","revivedPct"].forEach(function(id){var e=$(id);if(e){e.textContent="--";e.style.color=""}})}
  function stats(){
    if(!data||!data.length)return;
    var last=data[data.length-1],n=data.length,s30=0;for(var i=Math.max(0,n-30);i<n;i++)s30+=data[i][1];
    // 30 日合计的历史分位（只用 2012 年以后，避免早期数据稀少）
    var hist=[],acc=0,w=[];for(var j=0;j<n;j++){w.push(data[j][1]);acc+=data[j][1];if(w.length>30)acc-=w.shift();if(w.length===30&&data[j][0]>="2012-01-01")hist.push(acc)}
    var sorted=hist.slice().sort(function(a,b){return a-b}),lo=0,hi=sorted.length;while(lo<hi){var mid=(lo+hi)>>1;if(sorted[mid]<=s30)lo=mid+1;else hi=mid}
    var pct=sorted.length?Math.round(lo/sorted.length*100):null;
    var s7=data.map(function(r){return r[2]}).filter(function(x){return x>0}).sort(function(a,b){return a-b});p95=s7.length?s7[Math.floor(s7.length*.95)]:null;
    $("revivedDay").textContent=fmt(last[1]);$("revivedDayNote").textContent="BTC · "+last[0].slice(5);
    $("revived30").textContent=fmt(s30);$("revived30Note").textContent="BTC · 日均 "+fmt(s30/30);
    var pe=$("revivedPct");pe.textContent=pct==null?"--":pct+"%";pe.style.color=pct==null?"":pct>=90?"var(--market-negative)":pct>=70?"var(--market-caution)":"var(--text-primary)";
    $("revivedPctNote").textContent=pct==null?"--":pct>=90?"老币大规模移动":pct>=70?"老币移动偏多":pct<=30?"老币按兵不动":"处于常见范围";
    var f=$("revivedFresh");if(f){var age=Math.round((Date.now()-Date.parse(last[0]+"T00:00:00Z"))/864e5);f.textContent=(age>3?"滞后 · ":"数据日 · ")+last[0].slice(5);f.className="fresh-badge "+(age>3?"warn":"good")}
  }
  function view(){if(!data)return[];if(!range)return data;var cut=new Date(Date.now()-range*864e5).toISOString().slice(0,10);return data.filter(function(r){return r[0]>=cut})}
  function draw(){
    var cv=$("revivedChart"),shell=$("revivedShell"),em=$("revivedEmpty");if(!cv||!shell)return;
    var rows=view().filter(function(r){return r[2]>0});if(rows.length<2){if(em)em.hidden=false;return}if(em)em.hidden=true;
    var w=Math.max(260,shell.clientWidth),h=Math.max(200,shell.clientHeight),dpr=Math.min(2,window.devicePixelRatio||1);
    cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr);var ctx=cv.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    var L=44,R=52,T=10,B=24,PW=w-L-R,PH=h-T-B;
    var vs=rows.map(function(r){return r[2]}),vlo=Math.log10(Math.max(1,Math.min.apply(null,vs))),vhi=Math.log10(Math.max.apply(null,vs));if(vhi-vlo<.5)vlo=vhi-.5;
    var ps=rows.map(function(r){return r[3]}).filter(Boolean),plo=ps.length?Math.log10(Math.min.apply(null,ps)):0,phi=ps.length?Math.log10(Math.max.apply(null,ps)):1;if(phi-plo<.2){plo-=.1;phi+=.1}
    var X=function(i){return L+i/(rows.length-1)*PW},Y=function(v){return T+(1-(Math.log10(Math.max(1,v))-vlo)/(vhi-vlo))*PH},YP=function(p){return T+(1-(Math.log10(p)-plo)/(phi-plo))*PH};
    var tert=css("--text-tertiary","#8a8a93"),grid=css("--border-subtle","rgba(0,0,0,.08)");
    ctx.font="11px -apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif";ctx.textBaseline="middle";ctx.lineWidth=1;
    var mults=vhi-vlo<1.6?[1,2,5]:[1],lastTy=1e9;
    for(var k=Math.floor(vlo);k<=Math.ceil(vhi);k++)mults.forEach(function(mu){var v=mu*Math.pow(10,k),lv=Math.log10(v);if(lv<vlo||lv>vhi)return;var y=Math.round(Y(v))+.5;if(Math.abs(lastTy-y)<16)return;lastTy=y;ctx.strokeStyle=grid;ctx.beginPath();ctx.moveTo(L,y);ctx.lineTo(w-R,y);ctx.stroke();ctx.fillStyle=tert;ctx.textAlign="right";ctx.fillText(fmt(v),L-6,y)});
    if(p95&&Math.log10(p95)>vlo&&Math.log10(p95)<vhi){var yp=Math.round(Y(p95))+.5;ctx.strokeStyle=css("--market-caution","#d97706");ctx.globalAlpha=.75;ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(L,yp);ctx.lineTo(w-R,yp);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1}
    ctx.textAlign="left";var lastY=1e9,fp=function(p){return p>=1e3?"$"+(+(p/1e3).toPrecision(3))+"K":"$"+(+p.toPrecision(2))};
    for(var e=Math.floor(plo);e<=Math.ceil(phi);e++){[1,3].forEach(function(m){var p=m*Math.pow(10,e),lp=Math.log10(p);if(lp<plo||lp>phi)return;var y=YP(p);if(Math.abs(lastY-y)<14)return;lastY=y;ctx.fillStyle=tert;ctx.fillText(fp(p),w-R+6,y)})}
    if(ps.length){ctx.strokeStyle="rgba(142,142,150,.7)";ctx.lineWidth=1.2;ctx.beginPath();var st=false;rows.forEach(function(r,i){if(!r[3])return;var x=X(i),y=YP(r[3]);st?ctx.lineTo(x,y):ctx.moveTo(x,y);st=true});ctx.stroke()}
    ctx.strokeStyle="#7c6cf0";ctx.lineWidth=1.5;ctx.lineJoin="round";ctx.beginPath();rows.forEach(function(r,i){var x=X(i),y=Y(r[2]);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke();
    ctx.fillStyle=tert;ctx.textBaseline="alphabetic";[0,.5,1].forEach(function(f){var i=Math.round(f*(rows.length-1));ctx.textAlign=f===0?"left":f===1?"right":"center";ctx.fillText(range&&range<=182?rows[i][0].slice(5):range&&range<=365?rows[i][0].slice(0,7):rows[i][0].slice(0,4),X(i),h-6)});
    var tip=$("revivedTip");
    if(hover>=0&&hover<rows.length){var r=rows[hover],x=X(hover);ctx.strokeStyle=css("--text-primary","#111");ctx.globalAlpha=.35;ctx.beginPath();ctx.moveTo(x,T);ctx.lineTo(x,T+PH);ctx.stroke();ctx.globalAlpha=1;
      ctx.fillStyle="#7c6cf0";ctx.beginPath();ctx.arc(x,Y(r[2]),3.5,0,Math.PI*2);ctx.fill();
      tip.innerHTML=r[0]+"<b>"+fmt(r[2])+" BTC</b>"+(window.BTC_LANG==="en"?"7-day total · that day ":"7 日合计 · 当日 ")+fmt(r[1])+(r[3]?"<br>BTC $"+Math.round(r[3]).toLocaleString("en-US"):"");tip.classList.add("on");tip.style.left=Math.max(4,Math.min(w-140,x-66))+"px"}
    else if(tip)tip.classList.remove("on");
    cv._rows=rows;cv._geom={L:L,PW:PW};
  }
  function bind(){
    var sec=$("revived1y");if(!sec)return;
    sec.querySelectorAll("[data-rv-range]").forEach(function(b){b.addEventListener("click",function(){range=+b.dataset.rvRange;sec.querySelectorAll("[data-rv-range]").forEach(function(x){var on=x===b;x.classList.toggle("active",on);x.setAttribute("aria-pressed",on?"true":"false")});hover=-1;draw()})});
    sec.querySelectorAll("[data-rv-cohort]").forEach(function(b){b.addEventListener("click",function(){if(b.dataset.rvCohort===cohort)return;cohort=b.dataset.rvCohort;try{localStorage.setItem("btc_revived_cohort_v1",cohort)}catch(e){}hover=-1;loading=false;load(false)})});
    var cv=$("revivedChart");
    var move=function(e){var g=cv._geom,rows=cv._rows;if(!g||!rows)return;var rect=cv.getBoundingClientRect(),f=(e.clientX-rect.left-g.L)/g.PW;hover=Math.max(0,Math.min(rows.length-1,Math.round(f*(rows.length-1))));draw()};
    cv.addEventListener("pointerdown",move);cv.addEventListener("pointermove",function(e){if(e.pointerType==="mouse"||e.buttons)move(e)});
    ["pointerup","pointerleave","pointercancel"].forEach(function(t){cv.addEventListener(t,function(){hover=-1;draw()})});
    var rt=0;window.addEventListener("resize",function(){clearTimeout(rt);rt=setTimeout(draw,120)},{passive:true});
    window.addEventListener("themechange",draw);
  }
  function init(){if(inited)return;inited=true;bind();load(false)}
  if(typeof window.refreshLthPsil==="function"){var _rp=window.refreshLthPsil;window.refreshLthPsil=function(){var r=_rp.apply(this,arguments);if(arguments[0])load(true);return r}}
  if(typeof lazySection==="function")lazySection("revived1y",init);else init();
  document.addEventListener("toggle",function(e){if(e.target&&e.target.open&&e.target.querySelector&&e.target.querySelector("#revived1y"))setTimeout(draw,60)},true);
})();
