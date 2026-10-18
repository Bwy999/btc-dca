
(function(){
  "use strict";
  // V26.4：指标明细（替代七维估值评分）。与「顶底区间」同一份 Bitview 月度数据、同一种 4 年分位，按 5 类排列。
  var FAMS=[["value","估值利润","Valuation",[["mvrv","MVRV","MVRV"],["mnupl","NUPL","NUPL"],["nupl","LTH NUPL","LTH NUPL"],["rrl","Reserve Risk","Reserve Risk"],["sip","获利筹码","Supply in profit"],["psil","LTH_PSIL","LTH_PSIL"]]],
    ["sth","短期情绪","Short-term",[["snupl","STH NUPL","STH NUPL"]]],["miner","矿工","Miners",[["puell","Puell Multiple","Puell Multiple"]]],
    ["old","老币行为","Old coins",[["rev","老币重新流通","Old coins moved"]]],["trend","趋势","Trend",[["pi","Pi Cycle","Pi Cycle"]]]];
  function E(){return window.BTC_LANG==="en"}
  function fmt(k,v){if(v==null)return"--";if(k==="rrl")return Math.pow(10,v).toExponential(2);if(k==="sip"||k==="psil")return v.toFixed(1)+"%";if(k==="rev")return v>=1e6?(v/1e6).toFixed(2)+"M":(v/1e3).toFixed(0)+"K";if(k==="pi")return v.toFixed(2)+"×";return v.toFixed(2)}
  function col(p){return p==null?"var(--text-tertiary)":p<=25?"var(--market-positive)":p>=75?"var(--market-negative)":p>=60?"var(--market-caution)":"var(--text-secondary)"}
  function render(){
    var D=window.__TBD,box=document.getElementById("indicatorDetail");if(!D||!box)return;var en=E();
    box.innerHTML=FAMS.map(function(f){var fs=D.fam[f[0]];
      return '<div class="ind-fam"><div class="ind-fam-h"><b>'+(en?f[2]:f[1])+'</b><em style="color:'+col(fs)+'">'+(fs==null?"--":Math.round(fs))+'</em></div>'+f[3].map(function(r){var x=D.ind[r[0]]||{},p=x.p;
        var dv=x.v!=null&&x.prev!=null?x.v-x.prev:null,ds="";
        if(dv!=null){if(r[0]==="rrl"){var pc=(Math.pow(10,dv)-1)*100;ds=Math.abs(pc)<0.05?"0":(pc>=0?"+":"−")+Math.abs(pc).toFixed(1)+"%"}
          else{var t=fmt(r[0],Math.abs(dv)).replace(/^[−-]/,"");ds=/^0(\.0+)?(%|K|M|×)?$/.test(t)?"0":(dv>=0?"+":"−")+t}}
        return '<div class="ind-row ind-row2"><span>'+(en?r[2]:r[1])+'</span><i><u style="width:'+(p==null?0:Math.round(p))+'%;background:'+col(r[0]==="psil"&&p!=null?100-p:p)+'"></u></i><em class="ind-p">'+(p==null?"--":Math.round(p)+"%")+'</em><b>'+fmt(r[0],x.v)+'</b><small class="ind-d">'+(ds||"--")+'</small></div>'}).join("")+'</div>'}).join("")
      +'<div class="ind-cols"><span></span><span>'+(en?"4-yr pct":"4 年分位")+'</span><span>'+(en?"Now":"当前")+'</span><span>'+(en?"1M chg":"较上月")+'</span></div>';
    var s=document.getElementById("imSummary");if(s)s.textContent=(en?"Valuation ":"估值利润 ")+Math.round(D.fam.value)+(en?" · Short-term ":" · 短期情绪 ")+Math.round(D.fam.sth);
  }
  document.addEventListener("tb:update",function(){render();try{if(typeof renderCostStructureState==="function")renderCostStructureState()}catch(e){}try{if(typeof calc==="function")calc(false,false)}catch(e){}try{if(typeof trig==="function")trig(false,false)}catch(e){}});
  render();
  // 定投执行：隐藏只适用于旧「回撤价位」规则的下一档距离
  var nd=document.getElementById("costNextDistance");if(nd&&nd.parentElement)nd.parentElement.style.display="none";
})();
