
(function(){
  "use strict";
  // 预测市场：让 % 紧跟在数字后面
  var ctx=null;
  function place(){["spb","spu"].forEach(function(id){
    var i=document.getElementById(id);if(!i)return;var w=i.parentNode,u=w&&w.querySelector(".prob-unit");if(!u)return;
    var v=String(i.value||"");if(!v){u.style.display="none";return}
    var cs=getComputedStyle(i);
    // V26.9.3：用页面里的隐藏文字测宽（字体、字距、等宽数字都与输入框一致），iPhone 上 % 不再压住数字
    if(!ctx){ctx=document.createElement("span");ctx.setAttribute("aria-hidden","true");ctx.style.cssText="position:absolute;left:-9999px;top:0;visibility:hidden;white-space:pre";document.body.appendChild(ctx)}
    ["fontFamily","fontSize","fontWeight","fontStyle","letterSpacing","fontVariantNumeric","fontFeatureSettings","fontStretch"].forEach(function(k){ctx.style[k]=cs[k]});
    ctx.textContent=v;
    var x=(parseFloat(cs.paddingLeft)||0)+(parseFloat(cs.borderLeftWidth)||0)+ctx.getBoundingClientRect().width+4;
    u.style.display="";u.style.left=x+"px";u.style.fontSize=Math.round(parseFloat(cs.fontSize)*.5)+"px";
  })}
  ["spb","spu"].forEach(function(id){var i=document.getElementById(id);if(i)i.addEventListener("input",place)});
  var orig=window.sig;if(typeof orig==="function")window.sig=function(){var r=orig.apply(this,arguments);try{place()}catch(e){}return r};
  setInterval(place,2000);place();
})();
