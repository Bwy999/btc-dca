
(function(){
  "use strict";
  var PLAIN=["价格低于深度低估线，处在历史少见的便宜区间。","价格低于长期估值模型，处在历史偏便宜的区间。","价格高于长期估值模型，处在偏贵的区间。","价格远高于长期估值模型，处在历史高估区间。"];
  function el(id){return document.getElementById(id)}
  function paint(){
    var snap=null;try{snap=S.ahr&&focusAhrSnapshot(S.ahr,focusAhrModel)}catch(e){}
    var model=el("heroAhrModel"),plain=el("heroAhrPlain"),deepK=el("heroAhrDeepK"),deep=el("heroAhrDeep");
    if(model)model.textContent=focusAhrModel==="classic"?"经典":"新拟合";
    if(!plain||!deep)return;
    if(!snap){plain.textContent="等待 AHR999 数据";deep.textContent="--";return}
    plain.textContent=PLAIN[snap.zone];
    var line=+snap.prices[0],p=+S.price;
    if(line>0&&p>0){
      var v=(line/p-1)*100;
      deepK.textContent=p>line?"距深度低估线":"已低于深度低估线";
      deep.innerHTML="$"+Math.round(line).toLocaleString("en-US")+" <span>· "+(v>=0?"+":"−")+Math.abs(v).toFixed(1)+"%</span>";
    }else deep.textContent="--";
  }
  // V25.1.16：估值氛围色 + 一次性开场编排 + 价格跳动反馈
  var ZONE_C=["var(--market-positive)","var(--market-positive-emphasis)","var(--market-caution)","var(--market-negative)"];
  var t0=Date.now(),introDone=false,lastP=0,flashT=0;
  function aura(){
    var snap=null;try{snap=S.ahr&&focusAhrSnapshot(S.ahr,focusAhrModel)}catch(e){}
    var hero=el("today"),a=el("heroAura");if(!hero||!a)return snap;
    if(snap){hero.style.setProperty("--hero-zone",ZONE_C[snap.zone]);a.classList.add("on")}else a.classList.remove("on");
    return snap;
  }
  function intro(snap){
    if(introDone)return;
    if(Date.now()-t0>6000||document.visibilityState==="hidden"){introDone=true;return}
    if(!snap||!(+S.price>0))return;
    introDone=true;
    if(window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches)return;
    var hero=el("today"),cur=el("ahrCur"),lad=el("homeLadder");
    hero.classList.add("intro");if(lad)lad.classList.add("intro");
    if(cur&&cur.style.left){var target=cur.style.left;cur.style.transition="none";cur.style.left="0%";void cur.offsetWidth;setTimeout(function(){cur.style.transition="";cur.style.left=target},380)}
    setTimeout(function(){hero.classList.remove("intro");if(lad)lad.classList.remove("intro")},2800);
  }
  function flash(){
    var p=+S.price,inp=el("bp");if(!(p>0)||!inp)return;
    if(lastP&&p!==lastP&&!S.manualPrice&&document.activeElement!==inp){
      inp.classList.remove("tick-up","tick-down");void inp.offsetWidth;inp.classList.add(p>lastP?"tick-up":"tick-down");
      clearTimeout(flashT);flashT=setTimeout(function(){inp.classList.remove("tick-up","tick-down")},650);
    }
    lastP=p;
  }
  function after(kind){try{paint()}catch(e){}try{intro(aura())}catch(e){}if(kind==="price")try{flash()}catch(e){}}
  window.renderFocusAhr=(function(orig){return typeof orig==="function"?function(){var r=orig.apply(this,arguments);after("ahr");return r}:orig})(window.renderFocusAhr);
  window.renderPriceSpark=(function(orig){return typeof orig==="function"?function(){var r=orig.apply(this,arguments);after("price");return r}:orig})(window.renderPriceSpark);
  try{var fb=el("homeFootBuild");if(fb)fb.textContent="V"+BUILD_ID.split("-")[0]+" · 构建 "+BUILD_ID.split("-")[1].replace(/(\d{4})(\d{2})(\d{2})/,"$1-$2-$3")}catch(e){}
  // 大屏布局按当前分区切换
  function markTab(id){document.documentElement.dataset.tab=id||ACTIVE_TAB||"now"}
  window.setTab=(function(orig){return typeof orig==="function"?function(id){var r=orig.apply(this,arguments);try{markTab(ACTIVE_TAB)}catch(e){}return r}:orig})(window.setTab);
  try{markTab(ACTIVE_TAB)}catch(e){}
  after("init");
})();
