
(function(){
  "use strict";
  // V27.2.3：所有「数据日」标签统一写法——正常只写日期「11-05」，滞后「滞后 · 11-01」，月度数据「11 月」
  function norm(t){
    var m;
    if((m=/^(?:数据日|Data date) · (\d{4})-(\d{2})-(\d{2})$/.exec(t)))return m[2]+"-"+m[3];
    if((m=/^(?:数据日|Data date) · (\d{2})-(\d{2})$/.exec(t)))return m[1]+"-"+m[2];
    if((m=/^(?:数据日|Data date) · (\d{4})-(\d{2})$/.exec(t)))return window.BTC_LANG==="en"?["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+m[2]-1]:(+m[2])+" 月";
    if((m=/^(滞后|Stale) · \d{4}-(\d{2})-(\d{2})$/.exec(t)))return m[1]+" · "+m[2]+"-"+m[3];
    if((m=/^(滞后|Stale) · \d{4}-(\d{2})$/.exec(t)))return m[1]+" · "+(window.BTC_LANG==="en"?["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+m[2]-1]:(+m[2])+" 月");
    return null;
  }
  // V27.2.4：只在异常时显示——正常的日期标 is-ok（折叠栏里隐藏，模块里变成淡灰小字）；读取中的标 is-wait（打开后前 15 秒不显示）
  var WAIT=/^(等待数据|同步中|链上同步中|检查中|正在读取|Syncing|Waiting for data|Loading)/;
  function fix(el){if(!el||!el.classList||!el.classList.contains("fresh-badge"))return;var t=(el.textContent||"").trim(),n=norm(t);if(n&&n!==t){el.textContent=n;t=n}
    var ok=/^(\d{2}-\d{2}|\d{1,2} 月|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|刚刚|更新 · 刚刚)$/.test(t)||el.classList.contains("good")&&!/滞后|Stale|不可用|Unavailable/.test(t);
    if(el.classList.contains("is-ok")!==ok)el.classList.toggle("is-ok",ok);
    var w=WAIT.test(t);if(el.classList.contains("is-wait")!==w)el.classList.toggle("is-wait",w)}
  function sweep(){document.querySelectorAll(".fresh-badge").forEach(fix)}
  function start(){
    document.documentElement.classList.add("sg-quiet");setTimeout(function(){document.documentElement.classList.remove("sg-quiet")},15000);
    sweep();
    if(!("MutationObserver" in window))return setInterval(sweep,3000);
    new MutationObserver(function(ms){for(var i=0;i<ms.length;i++){var t=ms[i].target,el=t.nodeType===3?t.parentElement:t;if(el&&el.closest){var b=el.closest(".fresh-badge");if(b)fix(b);else if(ms[i].type==="childList")el.querySelectorAll&&el.querySelectorAll(".fresh-badge").forEach(fix)}}})
      .observe(document.body,{subtree:true,childList:true,characterData:true});
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);else start();
})();
