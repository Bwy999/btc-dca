
(function(){
  "use strict";
  // V27.9：Bitview 同步状态（/api/server/sync）——它算到第几个区块、落后几块、最后一次更新时间。
  // 显示在数据健康中心；Bitview 停更或落后时第一时间看得到。每 10 分钟检查一次（页面可见时）。
  function load(){
    var f=typeof tryFetch==="function"?tryFetch("https://bitview.space/api/server/sync",8000):fetch("https://bitview.space/api/server/sync").then(function(r){return r.json()});
    return f.then(function(j){
      if(!j||!(+j.indexed_height>0))throw new Error("sync");
      window.__bvSync={height:+(j.computed_height||j.indexed_height),tip:+j.tip_height,behind:Math.max(0,+j.blocks_behind||0),ts:+j.last_indexed_at_unix||Date.parse(j.last_indexed_at)/1000||null,at:Date.now()};
    }).catch(function(){window.__bvSync={err:1,at:Date.now()}}).then(function(){if(typeof renderHealthRuntime==="function")try{renderHealthRuntime()}catch(e){}});
  }
  function start(){load();setInterval(function(){if(document.visibilityState==="visible")load()},10*60*1000)}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",function(){setTimeout(start,1500)});else setTimeout(start,1500);
})();
