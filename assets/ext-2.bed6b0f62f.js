
(function(){
  "use strict";
  // V26.4.1：图表画布上的文字（筹码分布、减半链条等）在英文模式下也走同一份中英对照表
  var P=window.CanvasRenderingContext2D&&CanvasRenderingContext2D.prototype;if(!P||P.__i18nPatched)return;P.__i18nPatched=true;
  var CJK=/[\u4e00-\u9fff]/,miss=window.__canvasI18nMiss=new Set();
  function tx(t){if(window.BTC_LANG!=="en"||typeof t!=="string"||!CJK.test(t)||typeof window.i18nText!=="function")return t;var r=window.i18nText(t);if(CJK.test(r))miss.add(t);return r}
  ["fillText","strokeText","measureText"].forEach(function(k){var o=P[k];P[k]=function(t){var a=Array.prototype.slice.call(arguments);a[0]=tx(t);return o.apply(this,a)}});
})();
