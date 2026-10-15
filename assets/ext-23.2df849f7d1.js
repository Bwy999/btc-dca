
(function(){
  "use strict";
  // V26.4：指标明细（替代七维估值评分）。与「顶底区间」同一份 Bitview 月度数据、同一种 4 年分位，按 5 类排列。
  var FAMS=[["value","估值利润","Valuation",[["mvrv","MVRV","MVRV"],["mnupl","NUPL","NUPL"],["nupl","LTH NUPL","LTH NUPL"],["rrl","Reserve Risk","Reserve Risk"],["sip","获利筹码","Supply in profit"],["psil","LTH_PSIL（越高越便宜）","LTH_PSIL (higher = cheaper)"]]],
    ["sth","短期情绪","Short-term",[["snupl","STH NUPL","STH NUPL"]]],["miner","矿工","Miners",[["puell","Puell Multiple","Puell Multiple"]]],
    ["old","老币行为","Old coins",[["rev","1 年以上老币月度重新流通","1Y+ revived supply (month)"]]],["trend","趋势","Trend",[["pi","Pi Cycle（111 日 ÷ 350 日×2）","Pi Cycle (111D ÷ 2×350D)"]]]];
  function E(){return window.BTC_LANG==="en"}
  function fmt(k,v){if(v==null)return"--";if(k==="rrl")return Math.pow(10,v).toExponential(2);if(k==="sip"||k==="psil")return v.toFixed(1)+"%";if(k==="rev")return v>=1e6?(v/1e6).toFixed(2)+"M":(v/1e3).toFixed(0)+"K";if(k==="pi")return v.toFixed(2)+"×";return v.toFixed(2)}
  function col(p){return p==null?"var(--text-tertiary)":p<=25?"var(--market-positive)":p>=75?"var(--market-negative)":p>=60?"var(--market-caution)":"var(--text-secondary)"}
  function render(){
    var D=window.__TBD,box=document.getElementById("indicatorDetail");if(!D||!box)return;var en=E();
    box.innerHTML=FAMS.map(function(f){var fs=D.fam[f[0]];
      return '<div class="ind-fam"><div class="ind-fam-h"><b>'+(en?f[2]:f[1])+'</b><em style="color:'+col(fs)+'">'+(fs==null?"--":Math.round(fs))+'</em></div>'+f[3].map(function(r){var x=D.ind[r[0]]||{},p=x.p;
        return '<div class="ind-row"><span>'+(en?r[2]:r[1])+'</span><i><u style="width:'+(p==null?0:Math.round(p))+'%;background:'+col(r[0]==="psil"&&p!=null?100-p:p)+'"></u></i><b>'+fmt(r[0],x.v)+'</b></div>'}).join("")+'</div>'}).join("")
      +'<p class="ind-note">'+(en?"Bars show each metric's percentile over the past 4 years (month "+D.month+"). Group scores feed the top and bottom zones. LTH_PSIL counts in reverse.":"条形为过去 4 年分位（月度 "+D.month+"）。各类分数用于「顶底区间」；LTH_PSIL 方向相反（越高越便宜）。")+'</p>';
    var s=document.getElementById("imSummary");if(s)s.textContent=(en?"Valuation ":"估值利润 ")+Math.round(D.fam.value)+(en?" · Short-term ":" · 短期情绪 ")+Math.round(D.fam.sth);
  }
  document.addEventListener("tb:update",function(){render();try{if(typeof renderCostStructureState==="function")renderCostStructureState()}catch(e){}try{if(typeof calc==="function")calc(false,false)}catch(e){}try{if(typeof trig==="function")trig(false,false)}catch(e){}});
  render();
  // 定投执行：隐藏只适用于旧「回撤价位」规则的下一档距离
  var nd=document.getElementById("costNextDistance");if(nd&&nd.parentElement)nd.parentElement.style.display="none";
})();
