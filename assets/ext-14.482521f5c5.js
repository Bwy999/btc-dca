
(function(){
  "use strict";
  // V26 Beta 21：周期温度计。规则与 Beta 20 回测一致：
  //  门槛 = 过去 48 个月的分位（至少 24 个月历史），每月只用当时已知数据。
  //  底部区确认：NUPL < 0.15 或 4 年分位 ≤ 15%；并且 [PSIL 分位 ≥ 80% 且较近 3 个月高点回落 > 3pp] 或 [老币月度重新流通分位 ≥ 85%]
  //  派发警示：NUPL 4 年分位 ≥ 85% 且 老币月度重新流通分位 ≥ 85%
  var KEY="btc_bitview_cycle_thermo_v1",TTL=12*3600*1000,W=48,MIN=24,inited=false,M=null;
  var SER=["date","lth_nupl","lth_supply_in_loss_share","utxos_over_1y_old_transfer_volume_sum_1m","price"];
  function $(id){return document.getElementById(id)}
  function E(){return window.BTC_LANG==="en"}
  function rp(a,i){if(i+1<MIN)return null;var lo=Math.max(0,i-W+1),n=0,c=0;for(var j=lo;j<=i;j++){c++;if(a[j]<=a[i])n++}return n/c*100}
  function pt(v){return v==null?"--":(v>=0?"+":"")+(v*100).toFixed(0)+"%"}
  async function load(){
    var c=null;try{c=JSON.parse(localStorage.getItem(KEY)||"null")}catch(e){}
    if(c&&c.rows&&c.rows.length){M=c.rows;render()}
    if(c&&Date.now()-c.ts<TTL)return;
    try{
      var url=bitviewBulkUrl(SER,"2012-01-01").replace("index=day1","index=month1"),raw=await tryFetch(url,15000);
      var cols=SER.map(function(n,i){return pickSeries(raw,n,i)});
      if(!cols.every(Array.isArray))throw new Error("bad");
      var rows=[];for(var i=0;i<cols[0].length;i++){var r={m:String(cols[0][i]).slice(0,7),nupl:+cols[1][i],psil:+cols[2][i],rev:+cols[3][i],price:+cols[4][i]};if(/^\d{4}-\d{2}$/.test(r.m)&&[r.nupl,r.psil,r.rev,r.price].every(Number.isFinite)&&r.price>0)rows.push(r)}
      if(rows.length<36)throw new Error("short");
      M=rows;try{localStorage.setItem(KEY,JSON.stringify({ts:Date.now(),rows:rows}))}catch(e){}
      render();
    }catch(e){if(!M){$("ctHeadline").textContent=E()?"Unavailable":"暂不可用";$("ctDetail").textContent=E()?"Bitview monthly history could not be loaded; it will retry automatically.":"Bitview 月度历史暂时无法读取，稍后自动重试。";var f=$("ctFresh");f.textContent=E()?"Unavailable":"暂不可用";f.className="fresh-badge warn"}}
  }
  function evalAt(i){
    var nu=M.map(function(r){return r.nupl}),ps=M.map(function(r){return r.psil}),rv=M.map(function(r){return r.rev});
    var nr=rp(nu,i),pr=rp(ps,i),rr=rp(rv,i);if(nr==null)return null;
    var mx=Math.max.apply(null,ps.slice(Math.max(0,i-3),i+1)),fall=ps[i]<mx-3;
    var low=nu[i]<0.15||nr<=15,c2=pr>=80&&fall,c3=rr>=85;
    return{nr:nr,pr:pr,rr:rr,fall:fall,low:low,c2:c2,c3:c3,bottom:low&&(c2||c3),top:nr>=85&&rr>=85,r:M[i]};
  }
  function li(on,txt,sub){return '<li class="'+(on?"on":"")+'"><i>'+(on?"✓":"—")+'</i><span>'+txt+(sub?'<small>'+sub+'</small>':'')+'</span></li>'}
  function render(){
    if(!M)return;var en=E(),i=M.length-1,v=evalAt(i);if(!v)return;
    var st=$("ctStatus"),hl=$("ctHeadline"),dt=$("ctDetail");st.className="ct-status"+(v.bottom?" bottom":v.top?" top":"");
    hl.textContent=v.bottom?(en?"Bottom zone confirmed":"底部区确认"):v.top?(en?"Distribution warning":"派发警示"):(en?"No signal":"暂无信号");
    dt.textContent=v.bottom?(en?"Historically 0–6 months from a cycle bottom.":"历史上与周期底部相差 0–6 个月。"):v.top?(en?"Can appear months before the top.":"可能比顶部提前数月出现。"):(en?"Conditions not met this month.":"本月条件未满足。");
    $("ctNeedle").style.left=Math.max(2,Math.min(98,v.nr)).toFixed(1)+"%";
    $("ctNow").textContent=(en?"NUPL 4-year percentile ":"NUPL 4 年分位 ")+Math.round(v.nr)+"% · "+v.r.nupl.toFixed(2);
    $("ctBottom").innerHTML=li(v.low,en?"① NUPL low":"① NUPL 处在低位",(en?"now ":"当前 ")+v.r.nupl.toFixed(2)+(en?" · needs < 0.15 or ≤ 15th pct":" · 需 < 0.15 或分位 ≤ 15%"))
      +li(v.c2,en?"② PSIL high and turning down":"② PSIL 处在高位且开始回落",(en?"pct ":"分位 ")+Math.round(v.pr)+"% · "+v.r.psil.toFixed(1)+"%"+(v.fall?(en?" · falling":" · 已回落"):(en?" · not falling":" · 未回落")))
      +li(v.c3,en?"③ Old coins moving heavily":"③ 老币放量",(en?"monthly pct ":"月度分位 ")+Math.round(v.rr)+"%");
    $("ctTop").innerHTML=li(v.nr>=85,en?"① NUPL in its 4-year high zone":"① NUPL 处在 4 年高位",(en?"pct ":"分位 ")+Math.round(v.nr)+(en?"% · needs ≥ 85%":"% · 需 ≥ 85%"))
      +li(v.rr>=85,en?"② Old coins moving heavily":"② 老币放量",(en?"monthly pct ":"月度分位 ")+Math.round(v.rr)+(en?"% · needs ≥ 85%":"% · 需 ≥ 85%"));
    // 历史：连续同类月份合并为一段
    var eps=[],cur=null;
    for(var k=0;k<M.length;k++){var e=evalAt(k);var t=e?(e.bottom?"b":e.top?"t":null):null;
      if(t&&cur&&cur.t===t&&cur.end===k-1){cur.end=k}else if(t){cur={t:t,start:k,end:k};eps.push(cur)}else cur=null}
    var fw=function(k,n){return k+n<M.length?M[k+n].price/M[k].price-1:null};
    var html='<div class="ct-row h"><span>'+(en?"Months":"月份")+'</span><span>'+(en?"Signal":"信号")+'</span><span>'+(en?"+3M":"3 个月后")+'</span><span>'+(en?"+6M":"6 个月后")+'</span></div>';
    eps.slice().reverse().forEach(function(p){var a=M[p.start].m,b=M[p.end].m;
      html+='<div class="ct-row"><span>'+a+(b!==a?" – "+b:"")+'</span><span class="'+(p.t==="b"?"t-b":"t-t")+'">'+(p.t==="b"?(en?"Bottom zone":"底部区"):(en?"Distribution":"派发警示"))+'</span><span>'+pt(fw(p.start,3))+'</span><span>'+pt(fw(p.start,6))+'</span></div>'});
    $("ctHistory").innerHTML=html;
    var f=$("ctFresh");if(f){f.textContent=(en?"Month · ":"月度 · ")+v.r.m;f.className="fresh-badge good"}
    try{risk()}catch(e){}
  }
  // V26 Beta 22：牛市后期风控——NUPL 确认进入牛市后期后，月线收盘较本轮最高回撤 20% 时提示一次。
  function risk(){
    var en=E(),nu=M.map(function(r){return r.nupl}),n=M.length,nrs=[];for(var i=0;i<n;i++)nrs.push(rp(nu,i));
    var hi=null,hiI=null,armed=false,evs=[],state=[];
    for(var k=0;k<n;k++){var late=false;for(var j=Math.max(0,k-12);j<=k;j++)if((nrs[j]||0)>=85)late=true;
      if(late){if(hi==null||M[k].price>hi){hi=M[k].price;hiI=k;armed=true}var dd=M[k].price/hi-1;
        if(armed&&dd<=-0.2){var mn=Infinity;for(var q=k;q<Math.min(n,k+19);q++)mn=Math.min(mn,M[q].price);evs.push({k:k,hiI:hiI,ratio:M[k].price/hi,after:k+1<n?mn/M[k].price-1:null});armed=false}
        state[k]={late:true,hi:hi,hiI:hiI,dd:dd,armed:armed}}
      else{hi=null;armed=false;state[k]={late:false}}}
    var cur=state[n-1],box=$("ctRisk"),maxNr=0;for(var t=Math.max(0,n-13);t<n;t++)maxNr=Math.max(maxNr,nrs[t]||0);
    var money=function(v){return "$"+Math.round(v).toLocaleString("en-US")};
    box.className="psil-hist ct-risk"+(cur.late?(cur.armed?" watch":" fire"):"");
    if(!cur.late){
      $("crState").textContent=en?"Not active":"未启动";
      $("crSub").textContent=en?"Starts at NUPL 85th pct (12-month high "+Math.round(maxNr)+"%)":"NUPL 达 85% 分位后启动（近 12 月最高 "+Math.round(maxNr)+"%）";
      $("crFill").style.width="0%";$("crKnob").style.left="0%";$("crNow").textContent=en?"Inactive":"未启动";
      $("crNote").textContent=en?"Inactive outside a late bull market.":"仅在牛市后期启动。";
    }else{
      var dd=cur.dd,p=Math.max(0,Math.min(100,-dd/0.2*100));
      $("crFill").style.width=p+"%";$("crKnob").style.left=p+"%";
      $("crNow").textContent=(en?"Now ":"当前 ")+(dd*100).toFixed(1)+"%";
      $("crSub").textContent=(en?"Cycle high monthly close ":"本轮最高月线收盘 ")+money(cur.hi)+" · "+M[cur.hiI].m;
      if(cur.armed){$("crState").textContent=(dd*100).toFixed(1)+"%";
        $("crNote").textContent=en?"Prompt below "+money(cur.hi*0.8)+" (−20%). Fires after the top by design.":"月线收盘低于 "+money(cur.hi*0.8)+"（−20%）时提示。规则必然在顶部之后触发。"}
      else{$("crState").textContent=en?"Triggered":"已提示";
        $("crNote").textContent=en?"20%+ below the cycle high: the point your plan named. Resets on a new high.":"已较本轮高点回撤 20% 以上：按你预设的计划执行。创新高后重置。"}
    }
    var html='<div class="ct-row r4 h"><span>'+(en?"Prompt":"提示月份")+'</span><span>'+(en?"Cycle high":"本轮高点")+'</span><span>'+(en?"Price vs high":"占高点")+'</span><span>'+(en?"Lower within 18M":"之后最低")+'</span></div>';
    evs.slice().reverse().forEach(function(e){html+='<div class="ct-row r4"><span>'+M[e.k].m+'</span><span>'+M[e.hiI].m+'</span><span>'+Math.round(e.ratio*100)+'%</span><span style="color:var(--market-negative)">'+(e.after==null?"--":pt(e.after))+'</span></div>'});
    $("crHistory").innerHTML=html;
  }
  function init(){if(inited)return;inited=true;load()}
  if(typeof lazySection==="function")lazySection("cycleThermo",init);else init();
  document.addEventListener("toggle",function(e){if(e.target&&e.target.open&&e.target.querySelector&&e.target.querySelector("#cycleThermo"))init()},true);
})();
