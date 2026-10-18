
(function(){
  "use strict";
  // V26.5 Beta 2：数字占位（--、--%、$-- 等）统一显示为骨架条；文字变化后自动恢复
  var RX=/^(?:[$¥]?\s?--(?:\.--)?\s?(?:%|×|x|BTC|sat\/vB|EH\/s|T)?|--\/--|等待数据|计算中…|Waiting for data|Calculating…)$/;
  var SEL="b,strong,.num,.v,.cc-k b,.tbg2-center b,.fund-value,.hold-val,.m21-sats";
  var raf=0;
  function scan(){raf=0;document.querySelectorAll(SEL).forEach(function(e){if(e.children.length>1)return;var t=(e.textContent||"").trim();var on=RX.test(t);if(on!==e.classList.contains("sk-wait"))e.classList.toggle("sk-wait",on)})}
  function queue(){if(!raf)raf=requestAnimationFrame(scan)}
  try{new MutationObserver(queue).observe(document.body,{subtree:true,childList:true,characterData:true})}catch(e){}
  document.addEventListener("DOMContentLoaded",queue);setTimeout(queue,800);
})();
