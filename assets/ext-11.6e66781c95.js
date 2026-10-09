
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
  function clearStats(){["revivedPct","rvState"].forEach(function(id){var e=$(id);if(e){e.textContent="--";e.style.color=""}});var b=$("rvSig");if(b)b.hidden=true}
  var events=[];
  function fwd(i,n){var r=data[i],t=data[i+n];return r&&t&&r[3]&&t[3]?t[3]/r[3]-1:null}
  function med(a){if(!a.length)return null;var b=a.slice().sort(function(x,y){return x-y}),m=b.length>>1;return b.length%2?b[m]:(b[m-1]+b[m])/2}
  function pctTxt(v){return v==null?"--":(v>=0?"+":"")+(v*100).toFixed(1)+"%"}
  function cell(id,arr){var e=$(id);if(!e)return;if(!arr.length){e.innerHTML="--";return}var m=med(arr),up=arr.filter(function(x){return x>0}).length/arr.length,E=window.BTC_LANG==="en";
    e.innerHTML='<b style="color:'+(m>=0?"var(--market-positive)":"var(--market-negative)")+'">'+pctTxt(m)+'</b><small>'+(E?"median · up ":"中位数 · 上涨 ")+Math.round(up*100)+'%'+(E?" · n=":" · 样本 ")+arr.length+'</small>'}
  function stats(){
    if(!data||!data.length)return;
    var E=window.BTC_LANG==="en",last=data[data.length-1],n=data.length,s30=0;for(var i=Math.max(0,n-30);i<n;i++)s30+=data[i][1];
    // 30 日合计的历史分位（2012 年起）
    var hist=[],acc=0,w=[];for(var j=0;j<n;j++){w.push(data[j][1]);acc+=data[j][1];if(w.length>30)acc-=w.shift();if(w.length===30&&data[j][0]>="2012-01-01")hist.push(acc)}
    var sorted=hist.slice().sort(function(a,b){return a-b}),lo=0,hi=sorted.length;while(lo<hi){var mid=(lo+hi)>>1;if(sorted[mid]<=s30)lo=mid+1;else hi=mid}
    var pct=sorted.length?Math.round(lo/sorted.length*100):null;
    var s7=data.filter(function(r){return r[0]>="2012-01-01"&&r[2]>0}).map(function(r){return r[2]}).sort(function(a,b){return a-b});p95=s7.length?s7[Math.floor(s7.length*.95)]:null;
    var pe=$("revivedPct");pe.textContent=pct==null?"--":pct+"%";pe.style.color=pct==null?"":pct>=90?"var(--market-negative)":pct>=70?"var(--market-caution)":"";
    var fw=(pct==null?0:pct)+"%";$("rvFill").style.width=fw;$("rvKnob").style.left=fw;
    $("rvState").textContent=pct==null?"--":pct>=90?(E?"Old coins moving en masse":"老币大规模移动"):pct>=70?(E?"Old coins moving more than usual":"老币移动偏多"):pct<=30?(E?"Old coins staying put":"老币按兵不动"):(E?"Within the usual range":"处于常见范围");
    $("rvPosNote").textContent=E?"30-day total "+fmt(s30)+" BTC · daily avg "+fmt(s30/30)+" · percentile since 2012":"近 30 日合计 "+fmt(s30)+" BTC · 日均 "+fmt(s30/30)+" · 2012 年以来分位";
    $("rvDayNote").textContent=E?"Latest day ("+last[0]+"): "+fmt(last[1])+" BTC revived; 7-day total "+fmt(last[2])+" BTC.":"最近一日（"+last[0]+"）重新流通 "+fmt(last[1])+" BTC；7 日合计 "+fmt(last[2])+" BTC。";
    // 信号：7 日合计首次突破 95% 分位（与上一次信号相隔 ≥30 天）
    events=[];var lastEv=-1e9;
    for(var q=1;q<n;q++){var r=data[q];if(r[0]<"2012-01-01"||!p95)continue;if(r[2]>p95&&data[q-1][2]<=p95&&q-lastEv>=30){events.push(q);lastEv=q}}
    var H=[30,90,180],sig={},base={};
    H.forEach(function(h){sig[h]=events.map(function(q){return fwd(q,h)}).filter(function(x){return x!=null});base[h]=[];for(var q=0;q<n;q++)if(data[q][0]>="2012-01-01"){var v=fwd(q,h);if(v!=null)base[h].push(v)}});
    var box=$("rvSig");if(box){box.hidden=events.length<3;
      H.forEach(function(h){cell("rvS"+h,sig[h]);cell("rvB"+h,base[h])});
      var le=events.length?data[events[events.length-1]]:null,lr=events.length?fwd(events[events.length-1],30):null;
      $("rvSigRule").textContent=E?"A signal = the 7-day total first crossing its historical 95th percentile ("+fmt(p95||0)+" BTC), at least 30 days after the previous one":"7 日合计首次突破历史 95% 分位（"+fmt(p95||0)+" BTC）记为一次信号，两次信号至少相隔 30 天";
      $("rvSigNote").textContent=le?(E?events.length+" signals since 2012. Latest: "+le[0]+(lr!=null?" (BTC "+pctTxt(lr)+" over the next 30 days)":" (30 days not yet passed)")+". Compare the two columns: if the signal column is clearly weaker, old-coin selling has tended to weigh on price. Past results do not guarantee the future."
        :"2012 年以来共 "+events.length+" 次信号。最近一次："+le[0]+(lr!=null?"（之后 30 天 BTC "+pctTxt(lr)+"）":"（还未满 30 天）")+"。对比两列：若「信号之后」明显弱于「任意一天」，说明老币集中卖出往往压制价格。历史表现不代表未来。"):"--";}
    var f=$("revivedFresh");if(f){var age=Math.round((Date.now()-Date.parse(last[0]+"T00:00:00Z"))/864e5);f.textContent=(age>3?(E?"Stale · ":"滞后 · "):(E?"Data date · ":"数据日 · "))+last[0].slice(5);f.className="fresh-badge "+(age>3?"warn":"good")}
  }
  function view(){if(!data)return[];if(!range)return data;var cut=new Date(Date.now()-range*864e5).toISOString().slice(0,10);return data.filter(function(r){return r[0]>=cut})}
  function draw(){
    // V26.1.9：上方是 BTC 价格（像普通行情图），下方是「老币卖出量」柱子（像成交量）。
    // 柱子与价格线按同一标准着色：灰 = 正常，橙 = 偏多（高于历史 80% 分位），红 = 大量（高于 95% 分位）。
    var cv=$("revivedChart"),shell=$("revivedShell"),em=$("revivedEmpty");if(!cv||!shell)return;
    var all=view().filter(function(r){return r[3]>0});if(all.length<14){if(em)em.hidden=false;return}if(em)em.hidden=true;
    var w=Math.max(260,shell.clientWidth),h=Math.max(240,shell.clientHeight),dpr=Math.min(2,window.devicePixelRatio||1);
    cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr);var ctx=cv.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    // 按范围合并成周（或两周）柱
    var step=all.length>2600?14:all.length>220?7:1,bk=[];
    for(var i=0;i<all.length;i+=step){var seg=all.slice(i,i+step),sum=0;seg.forEach(function(r){sum+=r[1]});var lastR=seg[seg.length-1];bk.push({day:seg[0][0],end:lastR[0],price:lastR[3],sum:sum,v7:sum*7/seg.length})}
    var s7=data.filter(function(r){return r[0]>="2012-01-01"&&r[2]>0}).map(function(r){return r[2]}).sort(function(a,b){return a-b});
    var p80=s7.length?s7[Math.floor(s7.length*.8)]:Infinity,P95=s7.length?s7[Math.floor(s7.length*.95)]:Infinity;
    var lvl=function(v){return v>=P95?2:v>=p80?1:0},COL=["rgba(142,142,150,.55)","#f0a43a","#e5533d"],LINE=["#8e8e96","#f0a43a","#e5533d"];
    var L=8,R=56,T=10,B=22,GAP=12,PW=w-L-R,PH=Math.round((h-T-B-GAP)*.64),VH=h-T-B-GAP-PH,VY=T+PH+GAP;
    var X=function(k){return L+(bk.length===1?PW/2:k/(bk.length-1)*PW)};
    var pr=bk.map(function(b){return b.price}),plo=Math.log10(Math.min.apply(null,pr)),phi=Math.log10(Math.max.apply(null,pr));if(phi-plo<.15){plo-=.08;phi+=.08}
    var YP=function(p){return T+(1-(Math.log10(p)-plo)/(phi-plo))*PH};
    var vmax=Math.max.apply(null,bk.map(function(b){return b.v7}))||1,YV=function(v){return VY+VH-Math.min(1,v/vmax)*VH};
    var tert=css("--text-tertiary","#8a8a93"),grid=css("--border-subtle","rgba(0,0,0,.08)"),E=window.BTC_LANG==="en";
    ctx.font="11px -apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif";ctx.textBaseline="middle";ctx.textAlign="left";
    // 价格刻度（右侧）
    var lastY=1e9,fp=function(p){return p>=1e3?"$"+(+(p/1e3).toPrecision(3))+"K":"$"+(+p.toPrecision(2))};
    for(var e=Math.floor(plo);e<=Math.ceil(phi);e++)[1,2,5].forEach(function(m){var p=m*Math.pow(10,e),lp=Math.log10(p);if(lp<plo||lp>phi)return;var y=YP(p);if(Math.abs(lastY-y)<22)return;lastY=y;ctx.strokeStyle=grid;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(L,Math.round(y)+.5);ctx.lineTo(L+PW,Math.round(y)+.5);ctx.stroke();ctx.fillStyle=tert;ctx.fillText(fp(p),L+PW+6,y)});
    // 分区标签
    ctx.fillStyle=tert;ctx.font="600 10px -apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif";ctx.textBaseline="top";
    ctx.fillText(E?"BTC price":"BTC 价格",L+2,T+1);ctx.fillText(E?"Old coins moved (per week)":"老币卖出量（每周）",L+2,VY-1);
    // 价格线：按当周老币卖出量着色
    ctx.lineWidth=2;ctx.lineJoin="round";ctx.lineCap="round";
    for(var k=1;k<bk.length;k++){ctx.strokeStyle=LINE[lvl(bk[k].v7)];ctx.beginPath();ctx.moveTo(X(k-1),YP(bk[k-1].price));ctx.lineTo(X(k),YP(bk[k].price));ctx.stroke()}
    // 柱子
    var bw=Math.max(1,Math.min(10,PW/bk.length*.72));
    bk.forEach(function(b,k){ctx.fillStyle=COL[lvl(b.v7)];var y=YV(b.v7);ctx.fillRect(X(k)-bw/2,y,bw,VY+VH-y)});
    // 95% 分位参考线
    if(P95<vmax){var yr=Math.round(YV(P95))+.5;ctx.strokeStyle="#e5533d";ctx.globalAlpha=.6;ctx.setLineDash([3,3]);ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(L,yr);ctx.lineTo(L+PW,yr);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;ctx.fillStyle="#e5533d";ctx.textBaseline="middle";ctx.font="10px -apple-system,sans-serif";ctx.fillText(E?"95th pct":"95% 分位",L+PW+6,yr)}
    ctx.fillStyle=tert;ctx.textBaseline="middle";ctx.font="10px -apple-system,sans-serif";ctx.fillText(fmt(vmax),L+PW+6,VY+4);
    // 时间轴
    ctx.font="11px -apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif";ctx.textBaseline="alphabetic";ctx.fillStyle=tert;
    [0,.5,1].forEach(function(f){var k=Math.round(f*(bk.length-1)),d=bk[k].end;ctx.textAlign=f===0?"left":f===1?"right":"center";ctx.fillText(range&&range<=182?d.slice(5):range&&range<=365?d.slice(0,7):d.slice(0,4),X(k),h-6)});
    // 按住查看
    var tip=$("revivedTip");
    if(hover>=0&&hover<bk.length){var b=bk[hover],x=X(hover),lv=lvl(b.v7);ctx.strokeStyle=css("--text-primary","#111");ctx.globalAlpha=.3;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,T);ctx.lineTo(x,VY+VH);ctx.stroke();ctx.globalAlpha=1;
      ctx.fillStyle=LINE[lv];ctx.beginPath();ctx.arc(x,YP(b.price),4,0,Math.PI*2);ctx.fill();
      var lvTxt=E?["Normal","Above usual","Heavy selling"][lv]:["正常","偏多","大量卖出"][lv];
      tip.innerHTML=(step>1?b.day+" – "+b.end:b.end)+"<b>BTC $"+Math.round(b.price).toLocaleString("en-US")+"</b>"+(E?"Old coins moved ":"老币卖出 ")+fmt(b.sum)+" BTC<br>"+lvTxt;tip.classList.add("on");tip.style.left=Math.max(4,Math.min(w-150,x-70))+"px"}
    else if(tip)tip.classList.remove("on");
    cv._rows=bk;cv._geom={L:L,PW:PW};
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
