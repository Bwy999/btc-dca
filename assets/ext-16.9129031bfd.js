
(function(){
  "use strict";
  // V26.3：首页「今日结论」——AHR999 分区 + 顶底区间 + 牛市后期风控，合成一句话与对应的执行提示。
  function $(id){return document.getElementById(id)}
  function E(){return window.BTC_LANG==="en"}
  var card=null;
  function ensure(){
    if(card)return card;var hero=$("heroAhr");if(!hero)return null;
    var host=hero.closest("section")||hero.parentElement;if(!host)return null;
    card=document.createElement("section");card.className="today-verdict";card.id="todayVerdict";card.setAttribute("aria-label","今日结论");
    card.innerHTML='<div class="tv-head"><h2>今日结论</h2><small id="tvDate"></small></div><p class="tv-main" id="tvMain">计算中…</p><span class="tv-act" id="tvAct"><i></i><span>--</span></span>'
      +'<div class="tv-chips"><button class="tv-chip" type="button" data-go="ahr"><small>AHR999</small><b id="tvAhr">--</b></button><button class="tv-chip" type="button" data-go="tb"><small>顶底区间</small><b id="tvTb">--</b></button><button class="tv-chip" type="button" data-go="risk"><small>牛市风控</small><b id="tvRisk">--</b></button></div>'
      +'<p class="tv-note">按本站规则汇总，不构成投资建议。</p>';
    host.insertAdjacentElement("afterend",card);
    card.addEventListener("click",function(e){var b=e.target.closest("[data-go]");if(!b)return;var g=b.dataset.go;
      if(g==="ahr"){var t=$("ahr");if(t)t.scrollIntoView({behavior:"smooth",block:"start"});return}
      try{setTab("chain")}catch(x){}var d=document.querySelector('details[data-module=lthpsil]');if(d)d.open=true;
      setTimeout(function(){var t=$(g==="risk"?"ctRisk":"cycleThermo");if(t)t.scrollIntoView({behavior:"smooth",block:"start"})},250)});
    return card;
  }
  function paint(){
    if(!ensure())return;var en=E();
    var ahr=parseFloat(($("ahrBig")||{}).textContent),zone=(($("ahrZone")||{}).textContent||"").trim();
    var TB=window.__TB||null;
    var tbTxt=!TB?"--":TB.zone==="bottom"?(en?"Bottom zone":"底部区"):TB.zone==="topStrong"?(en?"Top · strong":"顶部区 · 强"):TB.zone==="top"?(en?"Top zone":"顶部区"):(en?"Neutral":"中性区间");
    var rkTxt=!TB?"--":TB.risk==="fired"?(en?"Prompted":"已提示"):TB.risk==="watch"?(en?"Watching":"监控中"):(en?"Inactive":"未启动");
    var act,color;
    if(TB&&TB.risk==="fired"){act=en?"Risk prompt: follow your reduce plan":"风控已提示：按预设计划减仓";color="var(--market-negative)"}
    else if(TB&&(TB.zone==="top"||TB.zone==="topStrong")){act=en?"Top zone: pause extra buys, prepare your exit plan":"顶部区域：暂停加仓，准备风控";color="var(--market-caution)"}
    else if((TB&&TB.zone==="bottom")||(Number.isFinite(ahr)&&ahr<0.45)){act=en?"Bottom area: extra buys per your plan":"底部区域：可按计划加大定投";color="var(--market-positive)"}
    else if(Number.isFinite(ahr)&&ahr<=1.2){act=en?"Keep your regular DCA":"按计划定投";color="var(--market-positive-emphasis)"}
    else if(Number.isFinite(ahr)){act=en?"Valuation high: slow down DCA":"估值偏高：放慢定投";color="var(--market-caution)"}
    else{act=en?"Waiting for data":"等待数据";color="var(--text-tertiary)"}
    var parts=[];if(zone&&zone!=="等待数据"&&zone!=="Waiting for data")parts.push(zone);if(TB)parts.push(tbTxt);if(TB&&TB.risk!=="off")parts.push((en?"risk ":"风控")+rkTxt);
    $("tvMain").textContent=parts.length?parts.join(" · "):(en?"Calculating…":"计算中…");
    var a=$("tvAct");a.style.color=color;a.querySelector("span").textContent=act;
    $("tvAhr").textContent=Number.isFinite(ahr)?ahr.toFixed(3):"--";
    $("tvTb").textContent=TB?tbTxt+" · "+Math.round(TB.score):"--";
    $("tvRisk").textContent=rkTxt;
    $("tvDate").textContent=new Date().toISOString().slice(0,10);
  }
  document.addEventListener("tb:update",paint);
  setInterval(paint,15000);setTimeout(paint,1200);
})();
