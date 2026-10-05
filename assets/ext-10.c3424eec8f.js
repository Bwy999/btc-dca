
(function(){
  "use strict";
  // V26.0.13：首页减半倒计时。读取已有的减半数据（剩余天数、剩余区块），按每块 10 分钟估算日期。
  var shown=false,lastDays=null;
  function paint(){
    var box=document.getElementById("halvingHero"),inp=document.getElementById("shv");if(!box||!inp)return;
    var days=+inp.value;if(!(days>0)){box.hidden=true;return}
    var saved=S&&S.sigs?+S.sigs.hb||0:0,approx=Math.round(days*144),blocks=saved>0&&Math.abs(saved-approx)<=144?saved:approx;
    var pct=Math.max(0,Math.min(100,(1-blocks/210000)*100)),eta=new Date(Date.now()+blocks*600*1000);
    box.hidden=false;
    document.getElementById("hhPct").textContent=pct.toFixed(1)+"%";
    document.getElementById("hhBlocks").textContent=blocks.toLocaleString("en-US");
    document.getElementById("hhDate").textContent="预计 "+eta.getUTCFullYear()+" 年 "+(eta.getUTCMonth()+1)+" 月";document.getElementById("hhDate").title="按每块 10 分钟估算";
    var arc=document.getElementById("hhArc"),off=(314.16*(1-pct/100)).toFixed(2);
    if(!shown){shown=true;requestAnimationFrame(function(){requestAnimationFrame(function(){arc.style.strokeDashoffset=off})})}else arc.style.strokeDashoffset=off;
    var d=Math.round(days),el=document.getElementById("hhDays");
    if(lastDays===null&&!(window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches)){
      var t0=performance.now(),from=Math.max(0,d+180);lastDays=d;
      (function step(now){var k=Math.min(1,(now-t0)/1100),e=1-Math.pow(1-k,3);el.textContent=Math.round(from+(d-from)*e).toLocaleString("en-US");if(k<1)requestAnimationFrame(step)})(t0);
    }else{lastDays=d;el.textContent=d.toLocaleString("en-US")}
  }
  var orig=window.sig;if(typeof orig==="function")window.sig=function(){var r=orig.apply(this,arguments);try{paint()}catch(e){}return r};
  try{paint()}catch(e){}
  setTimeout(function(){try{paint()}catch(e){}},1500);
})();
