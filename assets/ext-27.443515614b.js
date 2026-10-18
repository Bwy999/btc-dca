
(function(){
  "use strict";
  // V26.5.1：同一张折叠卡里，数据日与前一个相同就不再显示
  var raf=0;
  function dedupe(){raf=0;document.querySelectorAll(".module-fold").forEach(function(f){var seen={};f.querySelectorAll(".head-status .fresh-badge").forEach(function(b){var t=(b.textContent||"").trim(),ok=b.classList.contains("good"),hide=ok&&!!seen[t];b.classList.toggle("dup-date",hide);if(ok&&!hide)seen[t]=1})})}
  function queue(){if(!raf)raf=requestAnimationFrame(dedupe)}
  function init(){var mo=new MutationObserver(queue);document.querySelectorAll(".head-status .fresh-badge").forEach(function(b){mo.observe(b,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:["class"]})});dedupe()}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
