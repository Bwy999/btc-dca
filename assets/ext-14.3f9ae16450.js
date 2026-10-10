
(function(){
  "use strict";
  // V26.3：顶底区间。门槛 = 过去 48 个月的分位（至少 24 个有效月），每月只用当时已知数据。
  //  5 类指标先在类内平均，再合成综合分（0–100）：
  //   估值利润：MVRV、NUPL、LTH NUPL、Reserve Risk、获利筹码占比、PSIL（取反）
  //   短期情绪：STH NUPL；矿工：Puell；老币行为：1 年以上老币月度重新流通；趋势：Pi Cycle（111 日均线 ÷ 350 日均线×2）
  //  底部区：综合分 ≤ 25。顶部区：Reserve Risk 分位 ≥ 75；若 Pi Cycle 或老币放量也 ≥ 75，记为「强」。
  var KEY="btc_bitview_topbottom_v1",TTL=12*3600*1000,W=48,MIN=24,inited=false,M=null;
  var SER_A=["date","lth_nupl","lth_supply_in_loss_share","utxos_over_1y_old_transfer_volume_sum_1m","price","nupl","sth_nupl","supply_in_profit_share","reserve_risk"];
  var SER_B=["date","mvrv","puell_multiple","price_sma_111d","price_sma_350d_x2"];
  var FAMS=[["value",["mvrv","mnupl","nupl","rrl","sip","psilInv"],"估值利润","Valuation"],["sth",["snupl"],"短期情绪","Short-term"],["miner",["puell"],"矿工","Miners"],["old",["rev"],"老币行为","Old coins"],["trend",["pi"],"趋势","Trend"]];
  function $(id){return document.getElementById(id)}
  function E(){return window.BTC_LANG==="en"}
  function num(v){if(v==null||v==="")return null;v=+v;return Number.isFinite(v)?v:null}
  function pt(v){return v==null?"--":(v>=0?"+":"")+(v*100).toFixed(0)+"%"}
  var P=null;
  function rp(a,i){if(i+1<MIN)return null;var lo=Math.max(0,i-W+1),n=0,c=0;for(var j=lo;j<=i;j++){c++;if(a[j]<=a[i])n++}return n/c*100}
  function rpCol(a){var out=[];for(var i=0;i<a.length;i++){if(a[i]==null){out.push(null);continue}var n=0,c=0;for(var j=Math.max(0,i-W+1);j<=i;j++){if(a[j]==null)continue;c++;if(a[j]<=a[i])n++}out.push(c>=MIN?n/c*100:null)}return out}
  function prep(){
    var col=function(k){return M.map(function(r){return r[k]})};
    P={};["mvrv","mnupl","nupl","rrl","sip","psil","snupl","puell","rev","pi"].forEach(function(k){P[k]=rpCol(col(k))});
    P.psilInv=P.psil.map(function(v){return v==null?null:100-v});
  }
  function evalAt(i){
    var fam={},vals=[];
    FAMS.forEach(function(f){var xs=f[1].map(function(k){return P[k][i]}).filter(function(v){return v!=null});fam[f[0]]=xs.length?xs.reduce(function(a,b){return a+b},0)/xs.length:null;if(fam[f[0]]!=null)vals.push(fam[f[0]])});
    var score=vals.length>=3?vals.reduce(function(a,b){return a+b},0)/vals.length:null;
    if(score==null)return null;
    var rr=P.rrl[i],pi=P.pi[i],rev=P.rev[i];
    var top=rr!=null&&rr>=75,strong=top&&((pi||0)>=75||(rev||0)>=75);
    return{score:score,fam:fam,rr:rr,pi:pi,rev:rev,bottom:score<=25.0001,top:top,strong:strong,r:M[i]};
  }
  async function fetchCols(ser,start){
    var url=bitviewBulkUrl(ser,start).replace("index=day1","index=month1"),raw=await tryFetch(url,15000),out={};
    var cols=ser.map(function(n,i){return pickSeries(raw,n,i)});if(!cols.every(Array.isArray))throw new Error("bad");
    for(var i=0;i<cols[0].length;i++){var m=String(cols[0][i]).slice(0,7);if(!/^\d{4}-\d{2}$/.test(m))continue;var o={};ser.forEach(function(n,k){if(k)o[n]=num(cols[k][i])});out[m]=o}
    return out;
  }
  async function load(){
    var c=null;try{c=JSON.parse(localStorage.getItem(KEY)||"null")}catch(e){}
    if(c&&c.rows&&c.rows.length){M=c.rows;prep();render()}
    if(c&&Date.now()-c.ts<TTL)return;
    try{
      var A=await fetchCols(SER_A,"2012-01-01"),B=await fetchCols(SER_B,"2012-01-01").catch(function(){return {}});
      var rows=Object.keys(A).sort().map(function(m){var a=A[m],b=B[m]||{};
        return{m:m,nupl:a.lth_nupl,psil:a.lth_supply_in_loss_share,rev:a.utxos_over_1y_old_transfer_volume_sum_1m,price:a.price,mnupl:a.nupl,snupl:a.sth_nupl,sip:a.supply_in_profit_share,
          rrl:a.reserve_risk>0?Math.log10(a.reserve_risk):null,mvrv:b.mvrv,puell:b.puell_multiple,pi:b.price_sma_111d>0&&b.price_sma_350d_x2>0?b.price_sma_111d/b.price_sma_350d_x2:null}}).filter(function(r){return r.price>0&&r.nupl!=null});
      if(rows.length<36)throw new Error("short");
      M=rows;prep();try{localStorage.setItem(KEY,JSON.stringify({ts:Date.now(),rows:rows}))}catch(e){}
      render();
    }catch(e){if(!M){$("ctHeadline").textContent=E()?"Unavailable":"暂不可用";$("ctDetail").textContent=E()?"Bitview monthly history could not be loaded; it will retry.":"Bitview 月度历史暂时无法读取，稍后自动重试。";var f=$("ctFresh");f.textContent=E()?"Unavailable":"暂不可用";f.className="fresh-badge warn"}}
  }
  function famColor(v){return v==null?"var(--text-tertiary)":v<=25?"var(--market-positive)":v>=75?"var(--market-negative)":v>=60?"var(--market-caution)":"var(--text-secondary)"}
  function render(){
    if(!M||!P)return;var en=E(),i=M.length-1,v=evalAt(i);if(!v)return;
    var st=$("ctStatus");st.className="ct-status"+(v.bottom?" bottom":v.top?" top":"");
    $("ctHeadline").textContent=v.bottom?(en?"Bottom zone":"底部区"):v.top?(v.strong?(en?"Top zone · strong":"顶部区 · 强"):(en?"Top zone":"顶部区")):(en?"Neutral":"中性区间");
    $("ctDetail").textContent=v.bottom?(en?"Composite ≤ 25. Past bottoms all landed in this zone.":"综合分 ≤ 25。历史底部都出现在这一区间。"):v.top?(en?"Reserve Risk high. Can appear months before the top; pair with risk control below.":"Reserve Risk 处在高位。可能提前数月出现，配合下方风控使用。"):(en?"Neither zone is active this month.":"本月不在底部区，也不在顶部区。");
    $("ctNeedle").style.left=Math.max(2,Math.min(98,v.score)).toFixed(1)+"%";
    $("ctNow").textContent=(en?"Composite ":"综合分 ")+Math.round(v.score);
    $("tbFams").innerHTML=FAMS.map(function(f){var x=v.fam[f[0]];return '<div class="tb-fam"><span>'+(en?f[3]:f[2])+'</span><i><b style="width:'+(x==null?0:x.toFixed(0))+'%;background:'+famColor(x)+'"></b></i><em style="color:'+famColor(x)+'">'+(x==null?"--":Math.round(x))+'</em></div>'}).join("");
    var ok=function(b){return b?'<b class="tb-ok">✓</b>':'<b class="tb-no">—</b>'};
    $("tbTop").innerHTML='<div class="tb-top-title">'+(en?"Top zone":"顶部区")+'<small>'+(en?"Reserve Risk ≥ 75th pct · strong if Pi Cycle or old coins also ≥ 75":"Reserve Risk ≥ 75% 分位 · Pi Cycle 或老币放量也 ≥ 75 为「强」")+'</small></div>'
      +'<div class="tb-top-row">'+ok(v.top)+'<span>Reserve Risk</span><em>'+(v.rr==null?"--":Math.round(v.rr)+"%")+'</em></div>'
      +'<div class="tb-top-row">'+ok((v.pi||0)>=75)+'<span>Pi Cycle</span><em>'+(v.pi==null?"--":Math.round(v.pi)+"%")+'</em></div>'
      +'<div class="tb-top-row">'+ok((v.rev||0)>=75)+'<span>'+(en?"Old coins moving":"老币放量")+'</span><em>'+(v.rev==null?"--":Math.round(v.rev)+"%")+'</em></div>';
    // 历史：连续同类月份合并为一段
    var eps=[],cur=null;
    for(var k=0;k<M.length;k++){var e=evalAt(k);var t=e?(e.bottom?"b":e.top?(e.strong?"T":"t"):null):null;
      if(t&&cur&&(cur.t===t||(cur.t!=="b"&&t!=="b"))&&cur.end===k-1){cur.end=k;if(t==="T")cur.t="T"}else if(t){cur={t:t,start:k,end:k};eps.push(cur)}else cur=null}
    var fw=function(k,n){return k+n<M.length?M[k+n].price/M[k].price-1:null};
    var html='<div class="ct-row h"><span>'+(en?"Months":"月份")+'</span><span>'+(en?"Zone":"区间")+'</span><span>'+(en?"+3M":"3 个月后")+'</span><span>'+(en?"+6M":"6 个月后")+'</span></div>';
    eps.slice().reverse().forEach(function(p){var a=M[p.start].m,b=M[p.end].m;
      html+='<div class="ct-row"><span>'+a+(b!==a?" – "+b:"")+'</span><span class="'+(p.t==="b"?"t-b":"t-t")+'">'+(p.t==="b"?(en?"Bottom":"底部区"):p.t==="T"?(en?"Top · strong":"顶部区 · 强"):(en?"Top":"顶部区"))+'</span><span>'+pt(fw(p.start,3))+'</span><span>'+pt(fw(p.start,6))+'</span></div>'});
    $("ctHistory").innerHTML=html;
    var f=$("ctFresh");if(f){f.textContent=(en?"Month · ":"月度 · ")+v.r.m;f.className="fresh-badge good"}
    window.__TB={zone:v.bottom?"bottom":v.top?(v.strong?"topStrong":"top"):"neutral",score:v.score,month:v.r.m,risk:"off"};
    try{risk()}catch(e){}
    try{document.dispatchEvent(new CustomEvent("tb:update"))}catch(e){}
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
    if(window.__TB)window.__TB.risk=!cur.late?"off":cur.armed?"watch":"fired";if(window.__TB&&cur.late&&cur.armed)window.__TB.dd=cur.dd;
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
    try{var zs=[];for(var q=0;q<n;q++){var ev=evalAt(q);zs.push(ev?(ev.bottom?"b":ev.top?(ev.strong?"T":"t"):"n"):"n")}
      window.__TBM={rows:M.map(function(r){return{m:r.m,price:r.price}}),zone:zs,risk:evs.map(function(e){return e.k})};
      document.dispatchEvent(new CustomEvent("tbm:update"))}catch(e){}
    try{var H=[];for(var q=0;q<n;q++){var ev2=evalAt(q);H.push({m:M[q].m,price:M[q].price,zone:ev2?(ev2.bottom?"b":ev2.top?"t":"n"):null,prompt:false})}
      evs.forEach(function(e){if(H[e.k])H[e.k].prompt=true});window.__TBHist=H;document.dispatchEvent(new CustomEvent("tb:hist"))}catch(e){}
  }
  function init(){if(inited)return;inited=true;load()}
  if(typeof lazySection==="function")lazySection("cycleThermo",init);else init();
  setTimeout(init,2500);  // 首页「今日结论」需要这份结果
  document.addEventListener("toggle",function(e){if(e.target&&e.target.open&&e.target.querySelector&&e.target.querySelector("#cycleThermo"))init()},true);
})();
