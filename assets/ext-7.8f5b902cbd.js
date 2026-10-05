
(function(){
  "use strict";
  // 预测市场：让 % 紧跟在数字后面
  var ctx=null;
  function place(){["spb","spu"].forEach(function(id){
    var i=document.getElementById(id);if(!i)return;var w=i.parentNode,u=w&&w.querySelector(".prob-unit");if(!u)return;
    var v=String(i.value||"");if(!v){u.style.display="none";return}
    var cs=getComputedStyle(i);ctx=ctx||document.createElement("canvas").getContext("2d");
    ctx.font=cs.fontWeight+" "+cs.fontSize+" "+cs.fontFamily;
    var x=(parseFloat(cs.paddingLeft)||0)+(parseFloat(cs.borderLeftWidth)||0)+ctx.measureText(v).width+3;
    u.style.display="";u.style.left=x+"px";u.style.fontSize=Math.round(parseFloat(cs.fontSize)*.5)+"px";
  })}
  ["spb","spu"].forEach(function(id){var i=document.getElementById(id);if(i)i.addEventListener("input",place)});
  var orig=window.sig;if(typeof orig==="function")window.sig=function(){var r=orig.apply(this,arguments);try{place()}catch(e){}return r};
  setInterval(place,2000);place();
})();
