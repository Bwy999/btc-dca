
(function(){
  "use strict";
  // V25.1.18：分析页折叠标题显示实时摘要；数据未就绪时保留原说明
  function txt(id){var e=document.getElementById(id);var t=e?String(e.textContent||"").trim():"";return t&&!/^(--|—|等待|数据缺失|暂不可用|加载|同步)/.test(t)?t:""}
  var RULES={
    value:function(){var sc=txt("scoreNum"),z=txt("sz");return sc&&/\d/.test(sc)?sc+" 分"+(z?" · "+z:""):""},
    cycle:function(){var p=txt("phaseName"),d=txt("phaseDays");return p&&!/识别|建立/.test(p)?p+(d&&/\d/.test(d)?" · "+d:""):""},
    trend:function(){var t=txt("decisionDistance"),p=txt("powerPositionText");var a=[];if(t&&/\d/.test(t))a.push("相对 200 日趋势 "+t);if(p)a.push("幂律"+p.split("·")[0].trim());return a.join(" · ")},
    floor:function(){var s=txt("bitFloorState");return s?s.split("·")[0].trim():""},
    miner:function(){var p=txt("puellMarket");return p&&/\d/.test(p)?"Puell "+p:""},
    fund:function(){var v=txt("fgiValue"),st=txt("fgiState");return v&&/\d/.test(v)?"恐惧贪婪 "+v+(st?" · "+st:""):""},
    cost:function(){var v=txt("costBasisSth"),g=txt("costBasisSthGap");return v&&/\d/.test(v)?"STH "+v+(g&&/\d/.test(g)?" · "+g:""):""},
    state:function(){var v=txt("costStateName");return v&&!/等待|核对/.test(v)?v:""},
    lth:function(){var c=txt("lthChipsNow"),p=txt("lthPsilValue");if(c&&/\d/.test(c))return"筹码集中度 "+c;return p&&/\d/.test(p)?"LTH_PSIL "+p:""},
    holders:function(){var r=txt("holderDominantRange");return r&&!/^--/.test(r)?"主导迁移 "+r:""},
    dist:function(){var v=txt("lossHeroValue"),l=txt("lossHeroLabel");return v&&/\d/.test(v)?(l?l.replace(/供应$/,""):"深度亏损")+" "+v:""}
  };
  var SRC={value:["scoreNum","sz"],cycle:["phaseName","phaseDays"],trend:["decisionDistance","powerPositionText"],floor:["bitFloorState"],miner:["puellMarket"],fund:["fgiValue","fgiState"],cost:["costBasisSth","costBasisSthGap"],state:["costStateName"],lth:["lthChipsNow","lthPsilValue"],holders:["holderDominantRange"],dist:["lossHeroValue","lossHeroLabel"]};
  function paint(key){
    var el=document.querySelector('small[data-fold-live="'+key+'"]');if(!el)return;
    var v="";try{v=RULES[key]()}catch(e){}
    el.textContent=v||el.dataset.foldDefault;el.classList.toggle("live",!!v);
  }
  Object.keys(SRC).forEach(function(key){
    paint(key);
    if(!("MutationObserver"in window))return;
    var mo=new MutationObserver(function(){paint(key)});
    SRC[key].forEach(function(id){var e=document.getElementById(id);if(e)mo.observe(e,{childList:true,characterData:true,subtree:true})});
  });
})();
