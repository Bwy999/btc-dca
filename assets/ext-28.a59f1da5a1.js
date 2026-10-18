
(function(){
  "use strict";
  // V26.5.3：折叠卡第一个模块的数据日，显示在折叠栏副标题后面
  function init(){
    document.querySelectorAll(".module-fold").forEach(function(f){
      var sec=f.querySelector(":scope>.sec");if(!sec)return;
      var head=sec.querySelector(":scope>:is(.module-head,.capitalized-head,.ct-head):first-child");if(!head)return;
      var list=[].slice.call(head.querySelectorAll(".fresh-badge")).filter(function(x){return x.id!=="freshRadar"&&!x.closest(".price-status")});
      var src=list[0],sum=f.querySelector(":scope>summary>span");if(!src||!sum)return;
      var hs=src.closest(".head-status");if(hs)hs.classList.add("in-summary");else src.classList.add("in-summary-badge");
      head.classList.add("date-in-summary");
      var d=document.createElement("span");d.setAttribute("aria-hidden","true");sum.appendChild(d);
      function sync(){d.textContent=src.textContent;d.className=src.className.replace(/\b(dup-date|in-summary-badge)\b/g,"").trim()+" fold-date"}
      sync();new MutationObserver(sync).observe(src,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:["class"]});
    });
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
