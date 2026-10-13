
(function(){
  "use strict";
  // V26.3 Beta 4：自上次打开以来。离开页面时记录一份快照；下次打开（间隔 ≥ 1 小时）时，在「今日结论」顶部列出变化。
  var KEY="btc_last_visit_v2",prev=null,shown=false;
  try{prev=JSON.parse(localStorage.getItem(KEY)||"null")}catch(e){}
  function E(){return window.BTC_LANG==="en"}
  function cur(){
    var bp=document.getElementById("bp"),manual=document.getElementById("homeManualPrice");
    if(manual&&!manual.hidden)return null;
    var price=parseFloat(String(bp&&bp.value||"").replace(/[^\d.]/g,"")),ahr=parseFloat((document.getElementById("ahrBig")||{}).textContent),TB=window.__TB;
    var zone=!Number.isFinite(ahr)?"":ahr<0.45?"deep":ahr<1.2?"value":ahr<5?"warm":"over";
    if(!(price>0)||!Number.isFinite(ahr))return null;
    return{ts:Date.now(),price:price,ahr:ahr,zone:zone,tb:TB?TB.zone:null,score:TB?Math.round(TB.score):null,risk:TB?TB.risk:null};
  }
  function save(){var c=cur();if(c){try{localStorage.setItem(KEY,JSON.stringify(c))}catch(e){}}}
  function ago(ms){var h=ms/36e5,en=E();if(h<24)return en?Math.round(h)+" h":Math.round(h)+" 小时";var d=Math.round(h/24);return en?d+(d>1?" days":" day"):d+" 天"}
  var ZN={deep:["深度低估","Deep value"],value:["长期低估","Long-term value"],warm:["估值偏热","Running warm"],over:["高估风险","Overvalued risk"]};
  function zn(k,L){return ZN[k]?ZN[k][L]:""}
  var TBN={bottom:["底部区","Bottom zone"],top:["顶部区","Top zone"],topStrong:["顶部区 · 强","Top · strong"],neutral:["中性区间","Neutral"]};
  var RKN={off:["未启动","inactive"],watch:["监控中","watching"],fired:["已提示","prompted"]};
  function render(){
    if(shown||!prev)return;var c=cur();if(!c||!window.__TB)return;
    var gap=c.ts-prev.ts;if(gap<36e5)return;   // 不到 1 小时不提示
    var card=document.getElementById("todayVerdict");if(!card)return;shown=true;
    var en=E(),L=en?1:0,items=[];
    var dp=c.price/prev.price-1;items.push((en?"Price ":"价格 ")+'<b class="'+(dp>=0?"up":"down")+'">'+(dp>=0?"+":"")+(dp*100).toFixed(1)+"%</b>");
    if(Math.abs(c.ahr-prev.ahr)>=0.01||c.zone!==prev.zone)items.push("AHR999 "+prev.ahr.toFixed(2)+" → <b>"+c.ahr.toFixed(2)+"</b>"+(c.zone!==prev.zone&&ZN[prev.zone]?(en?" (":"（")+zn(prev.zone,L)+" → <b>"+zn(c.zone,L)+"</b>"+(en?")":"）"):""));
    if(prev.tb&&c.tb!==prev.tb)items.push((en?"Zones ":"顶底区间 ")+TBN[prev.tb][L]+" → <b>"+TBN[c.tb][L]+"</b>");
    else if(prev.score!=null&&c.score!=null&&Math.abs(c.score-prev.score)>=5)items.push((en?"Composite ":"综合分 ")+prev.score+" → <b>"+c.score+"</b>");
    if(prev.risk&&c.risk!==prev.risk)items.push((en?"Risk control ":"牛市风控 ")+RKN[prev.risk][L]+" → <b>"+RKN[c.risk][L]+"</b>");
    var big=items.length>1||Math.abs(dp)>=0.05;
    var el=document.createElement("div");el.className="tv-since";el.setAttribute("role","status");
    el.innerHTML='<span>'+(en?"Since you last opened ("+ago(gap)+" ago): ":"距上次打开 "+ago(gap)+"：")+items.join(" · ")+(items.length===1&&!big?(en?" · no zone changes":" · 各项区间没有变化"):"")+'</span><button type="button" aria-label="'+(en?"Close":"关闭")+'">×</button>';
    el.querySelector("button").addEventListener("click",function(){el.remove()});
    var head=card.querySelector(".tv-head");card.insertBefore(el,head?head.nextSibling:card.firstChild);
  }
  document.addEventListener("tb:update",function(){setTimeout(render,300)});
  setTimeout(render,4000);
  document.addEventListener("visibilitychange",function(){if(document.visibilityState==="hidden")save()});
  window.addEventListener("pagehide",save);
  setTimeout(save,90000);  // 停留一分半后也记录，防止异常退出
})();
