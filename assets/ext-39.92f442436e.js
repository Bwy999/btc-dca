
(function(){
  "use strict";
  // V27.11：Bitview 稀有度总等级（rarity_meter_level：0 = 正常；负数 = 罕见低位，如 2022-06 为 −4；正数 = 罕见高位）
  function load(){
    var u="https://bitview.space/api/series/bulk?index=day1&series=date,rarity_meter_level,rarity_meter_score&start=-3";
    (typeof tryFetch==="function"?tryFetch(u,12000):fetch(u).then(function(r){return r.json()})).then(function(r){
      var d=r[0].data,l=r[1].data,i=d.length-1;while(i>0&&l[i]==null)i--;
      window.__rarity={day:d[i],level:+l[i]||0,score:+r[2].data[i]||0};
      if(typeof renderBitviewOverview==="function")try{renderBitviewOverview()}catch(e){}
    }).catch(function(){});
  }
  setTimeout(load,5000);setInterval(function(){if(document.visibilityState==="visible")load()},6*3600*1000);
})();
