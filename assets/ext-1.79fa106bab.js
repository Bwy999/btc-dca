
(function(){
  "use strict";
  // V26.4：图表交互统一
  //  1. 手指离开图表后，读数和十字线保留 2 秒再收起（鼠标不受影响）；再次按下会取消收起。
  //  2. 画布上的文字统一使用系统字体（字号、字重保持各图原样）。
  //  图表库（K 线类）自带手势，不参与；滚动页面时浏览器发出的「取消」立即收起，不延迟。
  var HOLD=2000,timers=new Map(),cancelled=new Set(),LWC="#decisionChart,#miningHashChart,#miningDiffChart,#personalChart,#distYAxis";
  function chartOf(t){if(!t||!t.closest)return null;var c=t.closest("canvas");if(!c||c.closest(LWC)||c.matches(LWC))return null;return c}
  function fire(c,init){["pointerup","pointerleave"].forEach(function(t){var ev=new PointerEvent(t,init||{pointerType:"touch",isPrimary:true});ev.__held=true;c.dispatchEvent(ev)})}
  function flush(c){if(!timers.has(c))return;var t=timers.get(c);clearTimeout(t.id);timers.delete(c);fire(c,t.init)}
  window.addEventListener("pointerdown",function(e){var c=chartOf(e.target);timers.forEach(function(_,k){if(k!==c)flush(k)});if(c&&timers.has(c)){clearTimeout(timers.get(c).id);timers.delete(c)}},true);
  window.addEventListener("pointercancel",function(e){var c=chartOf(e.target);if(!c)return;cancelled.add(e.pointerId);if(timers.has(c)){clearTimeout(timers.get(c).id);timers.delete(c)}},true);
  ["pointerup","pointerleave"].forEach(function(type){
    window.addEventListener(type,function(e){
      if(e.pointerType!=="touch"||e.__held)return;var c=chartOf(e.target);if(!c)return;
      if(cancelled.has(e.pointerId)){if(type==="pointerleave")cancelled.delete(e.pointerId);return}
      e.stopImmediatePropagation();
      if(timers.has(c))clearTimeout(timers.get(c).id);
      var init={pointerType:"touch",pointerId:e.pointerId,clientX:e.clientX,clientY:e.clientY,isPrimary:true};
      timers.set(c,{id:setTimeout(function(){timers.delete(c);fire(c,init)},HOLD),init:init});
    },true);
  });
  var P=window.CanvasRenderingContext2D&&CanvasRenderingContext2D.prototype,d=P&&Object.getOwnPropertyDescriptor(P,"font");
  if(d&&d.set&&!P.__fontUnified){P.__fontUnified=true;var STACK='-apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC","Helvetica Neue",system-ui,sans-serif';
    Object.defineProperty(P,"font",{configurable:true,get:d.get,set:function(v){if(typeof v==="string")v=v.replace(/(\d+(?:\.\d+)?px)(\s*\/\s*[\d.]+\w*)?\s+.+$/,"$1 "+STACK);d.set.call(this,v)}})}
})();
