
(function(){
  "use strict";
  // V26.4.6：链上页分组卡片——顶部小格只陈述数据，按含义上色；模块在卡片内展开
  function $(id){return document.getElementById(id)}
  function E(){return window.BTC_LANG==="en"}
  function raw(id){var e=$(id);var t=e?String(e.textContent||"").trim():"";return /\d/.test(t)?t:""}
  var C={good:"var(--market-positive)",warn:"var(--market-caution)",bad:"var(--market-negative)"};
  function tile(card,k,val,tone){var e=document.querySelector('#'+card+' [data-k="'+k+'"] b');if(!e)return;e.textContent=val||"--";e.style.color=tone?C[tone]:""}
  function paint(){
    var en=E(),D=window.__TBD;
    var sth=raw("costBasisSth"),gap=raw("costBasisSthGap").replace(/^(距现价|vs spot)\s*/,""),loss=raw("lossHeroValue").replace(/\s*BTC$/,"");
    var g=parseFloat(gap.replace("−","-"));
    tile("cg_cost","sth",sth);tile("cg_cost","gap",gap,isFinite(g)?(g<0?"good":"bad"):null);tile("cg_cost","loss",loss);
    if(D&&D.ind){var ps=D.ind.psil||{},rv=D.ind.rev||{},pu=D.ind.puell||{};
      tile("cg_holders","psil",ps.v==null?"":ps.v.toFixed(1)+"%",ps.p==null?null:ps.p>=75?"good":ps.p<=25?"warn":null);
      tile("cg_holders","rev",rv.p==null?"":Math.round(rv.p)+(en?"% pct":"% 分位"),rv.p==null?null:rv.p>=75?"warn":null);
      var p=pu.p;tile("cg_miners","puell",pu.v==null?"":pu.v.toFixed(2));tile("cg_miners","pp",p==null?"":Math.round(p)+"%");
      tile("cg_miners","state",p==null?"":p<=25?(en?"Stressed":"承压"):p>=75?(en?"High":"偏高"):(en?"Normal":"常规"),p==null?null:p<=25?"good":p>=75?"bad":null)}
    var ch=raw("lthChipsNow");tile("cg_holders","chips",ch);
  }
  // 分组结论需要成本与深度亏损数据：打开链上页时就开始读取（不必等展开模块）
  var orig=window.setTab;if(typeof orig==="function")window.setTab=function(t){var r=orig.apply(this,arguments);if(t==="chain"){try{initCostBasisPrice()}catch(e){}try{initDeepLoss()}catch(e){}setTimeout(paint,800)}return r};
  document.addEventListener("tb:update",paint);setInterval(paint,10000);setTimeout(paint,1500);
  // V26.6.2：分组摘要的数据来源一变就立即刷新（原来最多要等 10 秒，筹码集中度等会先显示骨架条）
  (function(){var q=0,ids=["costBasisSth", "costBasisSthGap", "lossHeroValue", "lthChipsNow"];function kick(){if(!q)q=setTimeout(function(){q=0;paint()},120)}var mo=new MutationObserver(kick);ids.forEach(function(id){var e=document.getElementById(id);if(e)mo.observe(e,{childList:true,characterData:true,subtree:true})})})();
})();
