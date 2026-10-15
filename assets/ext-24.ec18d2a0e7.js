
(function(){
  "use strict";
  // V26.4：链上页按「成本 · 持有者 · 矿工」分组，每组一句结论（只陈述数据，主结论仍以「顶底区间」为准）
  function $(id){return document.getElementById(id)}
  function E(){return window.BTC_LANG==="en"}
  function txt(id){var e=$(id);var t=e?String(e.textContent||"").trim():"";return /\d/.test(t)?t:""}
  function paint(){
    var en=E(),D=window.__TBD,c=$("cg_cost"),h=$("cg_holders"),m=$("cg_miners");
    var sth=txt("costBasisSth"),gap=txt("costBasisSthGap"),loss=txt("lossHeroValue");
    if(c)c.textContent=sth?((en?"Short-term holder cost ":"短期持有者成本 ")+sth+(gap?" · "+gap:"")+(loss?(en?" · deep-loss supply ":" · 深度亏损筹码 ")+loss:"")):(en?"Waiting for cost data":"等待成本数据");
    if(D&&D.ind){var ps=D.ind.psil||{},rv=D.ind.rev||{},pu=D.ind.puell||{};
      if(h)h.textContent=(en?"LTH supply in loss ":"长期持有者浮亏 ")+(ps.v==null?"--":ps.v.toFixed(1)+"%")+(en?" · old-coin moves at percentile ":" · 老币重新流通处在 ")+(rv.p==null?"--":Math.round(rv.p)+(en?"%":"% 分位"));
      if(m){var p=pu.p,lab=p==null?"":p<=25?(en?"miners under pressure":"矿工承压"):p>=75?(en?"miner revenue high":"矿工收入偏高"):(en?"normal range":"常规区间");m.textContent="Puell "+(pu.v==null?"--":pu.v.toFixed(2))+(en?" · percentile ":" · 处在 ")+(p==null?"--":Math.round(p)+(en?"%":"% 分位"))+(lab?" · "+lab:"")}}
  }
  // 分组结论需要成本与深度亏损数据：打开链上页时就开始读取（不必等展开模块）
  var orig=window.setTab;if(typeof orig==="function")window.setTab=function(t){var r=orig.apply(this,arguments);if(t==="chain"){try{initCostBasisPrice()}catch(e){}try{initDeepLoss()}catch(e){}setTimeout(paint,800)}return r};
  document.addEventListener("tb:update",paint);setInterval(paint,10000);setTimeout(paint,1500);
})();
