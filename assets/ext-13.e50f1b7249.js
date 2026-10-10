
(function(){
  "use strict";
  // V26 Beta 20：统一的「数据化解读」组件——历史位置 + 信号之后 BTC 怎么走。
  // rows：[{day,value,price}]，按日连续。全部在浏览器内用已同步的 Bitview 历史计算。
  var EN=function(){return window.BTC_LANG==="en"};
  function med(a){if(!a.length)return null;var b=a.slice().sort(function(x,y){return x-y}),m=b.length>>1;return b.length%2?b[m]:(b[m-1]+b[m])/2}
  function pt(v){return v==null?"--":(v>=0?"+":"")+(v*100).toFixed(1)+"%"}
  function fwd(rows,i,n){var a=rows[i],b=rows[i+n];return a&&b&&a.price>0&&b.price>0?b.price/a.price-1:null}
  function percentile(rows,v){var n=0;for(var i=0;i<rows.length;i++)if(rows[i].value<=v)n++;return rows.length?n/rows.length*100:null}
  function quant(rows,q){var a=rows.map(function(r){return r.value}).sort(function(x,y){return x-y});return a.length?a[Math.min(a.length-1,Math.floor(a.length*q))]:null}
  function events(rows,cross,gap){var ev=[],last=-1e9;for(var i=1;i<rows.length;i++)if(cross(rows[i-1].value,rows[i].value)&&i-last>=gap){ev.push(i);last=i}return ev}
  function cell(arr){if(!arr.length)return "--";var m=med(arr),up=arr.filter(function(x){return x>0}).length/arr.length,E=EN();
    return '<b style="color:'+(m>=0?"var(--market-positive)":"var(--market-negative)")+'">'+pt(m)+'</b><small>'+(E?"up ":"上涨 ")+Math.round(up*100)+"% · n="+arr.length+"</small>"}
  // 信号回测卡
  function signalCard(el,rows,ev,o){
    if(!el)return;if(ev.length<2){el.innerHTML="";return}
    var step=o.step||1,F=function(i,h){return fwd(rows,i,Math.round(h/step))};
    var E=EN(),H=[30,90,180],head='<div class="rv-tr rv-th" role="row"><span></span><span>'+(E?"After signal (median)":"信号之后（中位数）")+'</span><span>'+(E?"Any day":"任意一天")+'</span></div>',body="";
    H.forEach(function(h){var sg=ev.map(function(i){return F(i,h)}).filter(function(x){return x!=null}),bs=[];for(var i=0;i<rows.length;i++){var v=F(i,h);if(v!=null)bs.push(v)}
      body+='<div class="rv-tr" role="row"><span>'+(E?"After "+h+" days":h+" 天后")+'</span><span>'+cell(sg)+'</span><span>'+cell(bs)+'</span></div>'});
    if(o.abs){var sa=ev.map(function(i){return F(i,90)}).filter(function(x){return x!=null}).map(Math.abs),ba=[];for(var q=0;q<rows.length;q++){var vv=F(q,90);if(vv!=null)ba.push(Math.abs(vv))}
      var ac=function(a){return a.length?'<b>±'+(med(a)*100).toFixed(0)+'%</b><small>'+(E?"typical size":"涨跌幅中位数")+'</small>':"--"};
      body+='<div class="rv-tr" role="row"><span>'+(E?"90-day swing":"90 天波动")+'</span><span>'+ac(sa)+'</span><span>'+ac(ba)+'</span></div>'}
    var le=rows[ev[ev.length-1]],lr=F(ev[ev.length-1],30),y0=rows[0].day.slice(0,4);
    var note=E?(ev.length+" signals · latest "+le.day+(lr!=null?" ("+pt(lr)+" in 30 days)":"")+" · better signal column = leans to bottoms, worse = tops"+(ev.length<5?" · few samples":""))
      :("共 "+ev.length+" 次 · 最近 "+le.day+(lr!=null?"（30 天 "+pt(lr)+"）":"")+" · 信号列更好偏底部，更差偏顶部"+(ev.length<5?" · 样本少":""));
    el.innerHTML='<div class="psil-hist rv-sig"><div class="ph-head"><span>'+(E?o.titleEn:o.title)+'<small>'+(E?o.ruleEn:o.rule)+'</small></span></div><div class="rv-table" role="table">'+head+body+'</div><p class="ph-note">'+note+'</p></div>';
  }
  // 历史位置卡（进度条 0 → 100 分位）
  function positionCard(el,rows,o){
    if(!el||!rows.length){if(el)el.innerHTML="";return}
    var E=EN(),last=rows[rows.length-1],p=Math.round(percentile(rows,last.value)),hi=rows[0],lo=rows[0];
    rows.forEach(function(r){if(r.value>hi.value)hi=r;if(r.value<lo.value)lo=r});
    var y0=rows[0].day.slice(0,4),f=o.fmt||function(v){return v.toFixed(2)};
    el.innerHTML='<div class="psil-hist"><div class="ph-head"><span>'+(E?"Historical position":"历史位置")+'<small>'+(E?"Higher than "+p+"% of days since "+y0:"高于 "+y0+" 年以来 "+p+"% 的日子")+'</small></span><b class="num" style="color:'+(p>=90||p<=10?"var(--market-caution)":"")+'">'+p+'%</b></div>'
      +'<div class="ph-track" aria-hidden="true"><i class="ph-fill" style="width:'+p+'%;background:'+(o.grad||"linear-gradient(90deg,#ffc56b,#f7931a)")+'"></i><span class="ph-knob" style="left:'+p+'%"></span></div>'
      +'<div class="ph-ends"><span>'+(E?o.loEn:o.lo)+'</span><span style="color:#d9800f;font-weight:650">'+(E?"Now ":"当前 ")+f(last.value)+'</span><span>'+(E?o.hiEn:o.hi)+'</span></div>'
      +'<p class="ph-note">'+(E?"High "+f(hi.value)+" · "+hi.day.slice(0,7)+"   Low "+f(lo.value)+" · "+lo.day.slice(0,7):"最高 "+f(hi.value)+" · "+hi.day.slice(0,7)+"　最低 "+f(lo.value)+" · "+lo.day.slice(0,7))+'</p></div>';
  }
  window.BTCInsight={signalCard:signalCard,positionCard:positionCard,events:events,quant:quant};

  // —— LTH_PSIL：大面积浮亏（升破历史 90% 分位）之后 ——
  function psil(){
    var d=typeof lthPsilData!=="undefined"?lthPsilData:null;if(!d||!Array.isArray(d.series)||d.series.length<365)return;
    var rows=d.series.filter(function(r){return r.price>0});var T=quant(rows,.9);
    var ev=events(rows,function(a,b){return a<T&&b>=T},60);
    signalCard(document.getElementById("psilSig"),rows,ev,{title:"大面积浮亏之后",titleEn:"After deep LTH losses",
      rule:"升破历史 90% 分位（"+T.toFixed(1)+"%）· 间隔 ≥60 天",ruleEn:"Crosses above the 90th pct ("+T.toFixed(1)+"%) · ≥60 days apart"});
  }
  ["renderLthPsilModule"].forEach(function(n){var o=window[n];if(typeof o!=="function")return;window[n]=function(){var r=o.apply(this,arguments);try{psil()}catch(e){}return r}});
  try{psil()}catch(e){}

  // —— LTH NUPL：整体转为浮亏（跌破 0）之后 ——
  function nupl(){
    var raw=window.__lthNuplRows;if(!Array.isArray(raw)||raw.length<365)return;
    var rows=raw.filter(function(r){return r[0]>="2012-01-01"&&r[2]>0}).map(function(r){return{day:r[0],value:+r[1],price:+r[2]}});
    positionCard(document.getElementById("nuplPos"),rows,{lo:"深度浮亏",loEn:"Deep loss",hi:"利润丰厚",hiEn:"Rich profit",fmt:function(v){return v.toFixed(3)},grad:"linear-gradient(90deg,#e5533d,#f0a43a 40%,#3fb37f)"});
    var ev=events(rows,function(a,b){return a>=0&&b<0},90);
    signalCard(document.getElementById("nuplSig"),rows,ev,{title:"整体转为浮亏之后",titleEn:"After LTH turn to a loss",
      rule:"跌破 0 · 间隔 ≥90 天",ruleEn:"Falls below 0 · ≥90 days apart"});
  }
  document.addEventListener("nupl:data",function(){try{nupl()}catch(e){}});
  try{nupl()}catch(e){}
})();
