
(function(){
  "use strict";
  // V26.0.8：AHR999 当前值在 2011 年以来全部日线中的分位
  var cache={key:"",vals:null,first:0};
  function history(model){
    var raw=typeof DAILY==="undefined"?null:DAILY,last=raw&&raw.length?raw[raw.length-1]:null,key=model+"|"+(raw?raw.length:0)+"|"+(last?last[0]:0);
    if(cache.key===key)return cache;
    var rows=[];try{rows=focusAhrHistory(raw,model)}catch(e){}
    cache={key:key,vals:rows.map(function(r){return r.value}).sort(function(a,b){return a-b}),first:rows.length?rows[0].time:0};
    return cache;
  }
  function color(p){return p<25?"var(--market-positive)":p<50?"var(--market-positive-emphasis)":p<75?"var(--market-caution)":"var(--market-negative)"}
  function paint(){
    var box=document.getElementById("ahrPct");if(!box)return;
    var model=typeof focusAhrModel==="string"?focusAhrModel:"refit",snap=null;
    try{snap=focusAhrSnapshot(S.ahr,model)}catch(e){}
    var h=history(model);
    if(!snap||!(snap.value>0)||!h.vals||h.vals.length<365){box.hidden=true;return}
    var v=snap.value,lo=0,hi=h.vals.length;while(lo<hi){var m=(lo+hi)>>1;if(h.vals[m]<=v)lo=m+1;else hi=m}
    var p=Math.max(0,Math.min(100,lo/h.vals.length*100)),pr=Math.round(p);
    box.hidden=false;box.style.setProperty("--pct-color",color(p));
    document.getElementById("ahrPctVal").textContent=pr+"%";
    var fill=document.getElementById("ahrPctFill");fill.style.width=p+"%";fill.style.setProperty("--pct-bg",(p>0?100/p*100:100)+"%");
    document.getElementById("ahrPctKnob").style.left=p+"%";
    var year=h.first?new Date(h.first*1000).getUTCFullYear():"";
    document.getElementById("ahrPctNote").textContent=(pr<50?"比 "+year+" 年以来 "+(100-pr)+"% 的日子更便宜。":"比 "+year+" 年以来 "+pr+"% 的日子更贵。")+"按"+(model==="classic"?"经典":"新拟合")+"模型计算。";
  }
  ["renderFocusAhr","renderFocusAhrChart","setFocusAhrModel"].forEach(function(n){
    var orig=window[n];if(typeof orig!=="function")return;
    window[n]=function(){var r=orig.apply(this,arguments);try{paint()}catch(e){}return r};
  });
  window.addEventListener("themechange",function(){try{paint()}catch(e){}});
  try{paint()}catch(e){}
})();
