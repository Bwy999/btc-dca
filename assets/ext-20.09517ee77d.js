
(function(){
  "use strict";
  // V26.3.1：状态栏磨砂底。只在内容滚到状态栏下面时出现；颜色取当前页面背景。
  var el=document.createElement("div");el.className="status-scrim";el.setAttribute("aria-hidden","true");document.body.appendChild(el);
  function tint(){var c=getComputedStyle(document.body).backgroundColor||"rgb(242,242,247)",m=c.match(/[\d.]+/g);if(m)el.style.setProperty("--scrim-bg","rgba("+m[0]+","+m[1]+","+m[2]+",.8)")}
  function onScroll(){el.classList.toggle("on",(window.scrollY||document.documentElement.scrollTop)>4)}
  tint();onScroll();window.addEventListener("scroll",onScroll,{passive:true});window.addEventListener("themechange",tint);
  new MutationObserver(tint).observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]});
})();
