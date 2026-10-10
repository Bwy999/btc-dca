
(function(){
  "use strict";
  // V26 Beta 25：底栏选中「液滴」——滑动到选中的分区，移动时像液体一样拉伸回弹。
  var bar=document.getElementById("tabBar");if(!bar)return;
  var lens=document.createElement("span");lens.className="tab-lens";lens.setAttribute("aria-hidden","true");lens.innerHTML="<i></i>";bar.insertBefore(lens,bar.firstChild);
  var last=null;
  function place(anim){
    var a=bar.querySelector(".tab.active")||bar.querySelector('.tab[aria-current="page"]');
    if(!a||!a.offsetWidth){lens.style.opacity="0";return}
    var x=a.offsetLeft,w=a.offsetWidth;lens.style.opacity="1";lens.style.width=w+"px";lens.style.transform="translateX("+x+"px)";
    if(anim&&last&&last!==a){var i=lens.firstChild;i.classList.remove("morph");void i.offsetWidth;i.classList.add("morph")}
    last=a;
  }
  var orig=window.setTab;if(typeof orig==="function")window.setTab=function(){var r=orig.apply(this,arguments);requestAnimationFrame(function(){place(true)});return r};
  bar.addEventListener("pointerdown",function(e){var t=e.target.closest&&e.target.closest(".tab");if(t&&t.classList.contains("active"))lens.classList.add("press")});
  ["pointerup","pointercancel","pointerleave"].forEach(function(n){bar.addEventListener(n,function(){lens.classList.remove("press")})});
  var rt=0;window.addEventListener("resize",function(){clearTimeout(rt);rt=setTimeout(function(){place(false)},80)},{passive:true});
  lens.style.transition="none";place(false);requestAnimationFrame(function(){requestAnimationFrame(function(){lens.style.transition="";place(false)})});
  setTimeout(function(){place(false)},600);
})();
