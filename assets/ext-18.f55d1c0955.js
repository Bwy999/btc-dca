
(function(){
  "use strict";
  // V26.3：首页「今日结论」——AHR999 分区 + 顶底区间 + 牛市后期风控，合成一句话与对应的执行提示。
  function $(id){return document.getElementById(id)}
  function E(){return window.BTC_LANG==="en"}
  var card=null;
  function ensure(){
    if(card)return card;var hero=$("heroAhr");if(!hero)return null;
    var host=document.getElementById("today")||hero.closest(".aurum-hero")||hero.closest("section")||hero.parentElement;if(!host)return null;
    card=document.createElement("section");card.className="today-verdict";card.id="todayVerdict";card.setAttribute("aria-label","今日结论");
    card.innerHTML='<div class="tv-head"><h2>今日结论</h2><small id="tvDate"></small></div><p class="tv-main" id="tvMain">计算中…</p><span class="tv-act" id="tvAct"><i></i><span>--</span></span>'
      +'<div class="tv-chips"><button class="tv-chip" type="button" data-go="ahr"><small>AHR999</small><b id="tvAhr">--</b></button><button class="tv-chip" type="button" data-go="tb"><small>顶底区间</small><b id="tvTb">--</b></button><button class="tv-chip" type="button" data-go="risk"><small>牛市风控</small><b id="tvRisk">--</b></button></div>'
      +'<div class="tv-why" id="tvWhy" hidden></div>'
      +'<p class="tv-note">按本站规则汇总，不构成投资建议。</p>';
    card.dataset.tab="now";  // 只属于「行情」分区，切换到其他分区时随首页大卡片一起隐藏
    host.insertAdjacentElement("afterend",card);
    if(host.style.display==="none")card.style.display="none";
    card.addEventListener("click",function(e){var b=e.target.closest("[data-go]");if(!b)return;var g=b.dataset.go;
      var MOD={costBands:["chain","costBands"],ageCost:["chain","ageCost"],lthMonthly:["chain","lthMonthly"],stable:["value","stableX"]};
      if(MOD[g]){try{setTab(MOD[g][0])}catch(x){}setTimeout(function(){var t=$(MOD[g][1]);if(!t)return;var d=t.closest("details");if(d)d.open=true;setTimeout(function(){t.scrollIntoView({behavior:"smooth",block:"start"})},120)},250);return}
      if(g==="ahr"){var t=$("ahr");if(t)t.scrollIntoView({behavior:"smooth",block:"start"});return}
      try{setTab("value")}catch(x){}var d=document.querySelector('details[data-module=cycleZones]');if(d)d.open=true;
      setTimeout(function(){var t=$(g==="risk"?"ctRisk":"cycleThermo");if(t)t.scrollIntoView({behavior:"smooth",block:"start"})},250)});
    return card;
  }
  function paint(){
    if(!ensure())return;var en=E();
    var ab=$("ahrBig"),ahr=parseFloat(ab&&ab.dataset?ab.dataset.ahrRefit:NaN),zk=ab&&ab.dataset?ab.dataset.zoneRefit:"";
    var ZN={deep:["深度低估","Deep value"],value:["长期低估","Long-term value"],warm:["估值偏热","Running warm"],over:["高估风险","Overvalued risk"]},zone=ZN[zk]?ZN[zk][en?1:0]:"";
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
    why(en);
  }
  // V27.10：「依据」——各模块最新结论各一行（读各模块存在本机的数据；还没有就先不显示那一行）
  function rd(k){try{return JSON.parse(localStorage.getItem(k))}catch(e){return null}}
  function usd(v){return !(v>0)?"--":v>=1e3?"$"+(v/1e3).toFixed(v>=1e5?0:1)+"K":"$"+Math.round(v)}
  function wan(v,en){var a=Math.abs(v);return en?(a>=1e6?(a/1e6).toFixed(2)+"M":(a/1e3).toFixed(0)+"K"):(a>=1e4?(a/1e4).toFixed(1)+"万":Math.round(a).toLocaleString("en-US"))}
  function bn(v){var a=Math.abs(v);return (v<0?"−":"+")+"$"+(a>=1e9?(a/1e9).toFixed(1)+"B":(a/1e6).toFixed(0)+"M")}
  function why(en){
    var box=$("tvWhy");if(!box)return;var px=typeof S!=="undefined"&&S&&S.price>0?S.price:null,rows=[];
    var row=function(go,tone,zh,eng){rows.push('<button type="button" class="tv-why-row" data-go="'+go+'"><i class="'+tone+'"></i><span>'+(en?eng:zh)+'</span></button>')};
    var T=window.__TBM;if(T&&T.gTop&&T.gTop.length){var k=T.gTop[T.gTop.length-1];if(k!=null)row("tb",k>=2?"cau":"neu","顶部证据满足 "+k+" / 3"+(k>=2?"，已进入顶部区":"，未进入顶部区"),k+" of 3 top signals"+(k>=2?" — in the top zone":""))}
    var cb=rd("btc_cost_bands_v1");if(cb&&cb.L&&cb.L.v&&px){var v=cb.L.v,P=[5,10,15,20,25,30,35,40,45,50,55,60,65,70,75,80,85,90,95],pc=null;
      for(var i=0;i<v.length-1;i++){if(v[i]>0&&v[i]<=px&&px<v[i+1])pc=Math.round(P[i]+5*Math.log(px/v[i])/Math.log(v[i+1]/v[i]))}if(px>=v[v.length-1])pc=95;
      if(pc!=null)row("costBands",pc>=85?"cau":pc<=40?"pos":"neu","现价高于 "+pc+"% 的持币成本，中位成本 "+usd(v[9]),"Price above "+pc+"% of coins' cost; median cost "+usd(v[9]))}
    var ac=rd("btc_age_cost_v1");if(ac&&ac.D&&ac.D.rows){var m1=ac.D.rows[0];if(m1&&m1.avg>0&&m1.profit!=null)row("ageCost","neu","近 1 个月买入的币 "+Math.round(m1.profit*100)+"% 盈利，平均成本 "+usd(m1.avg),"Coins bought in the last month: "+Math.round(m1.profit*100)+"% in profit, avg cost "+usd(m1.avg))}
    var lm=rd("btc_lth_monthly_v1"),lr=rd("btc_lthsth_d_v1"),part=[],pe=[],lt="neu";
    if(lm&&lm.data&&lm.data.v&&lm.data.v.length){var x=lm.data.v[lm.data.v.length-1];part.push("近 30 天"+(x>=0?"增持 ":"减持 ")+wan(x,false)+" BTC");pe.push("30-day "+(x>=0?"added ":"sold ")+wan(x,true)+" BTC");lt=x>=0?"pos":"neg"}
    if(lr&&lr.data&&lr.data.r&&lr.data.r.length){var r=lr.data.r,n=r.length,pk=0;for(var j=Math.max(0,n-500);j<n;j++)pk=Math.max(pk,r[j]);var off=r[n-1]/pk-1;if(off<-.03){part.push("长短期持仓比率距高点 −"+Math.abs(off*100).toFixed(0)+"%");pe.push("LTH/STH ratio "+Math.abs(off*100).toFixed(0)+"% below its high")}}
    if(part.length)row("lthMonthly",lt,"长期持有者"+part.join("，"),"Long-term holders: "+pe.join("; "));
    var st=rd("btc_stablex_v1"),h=rd("btc_stablex_12h_v1");if(st&&st.data&&st.data.u&&st.data.u.length>31){var d=st.data,m=d.u.length-1,t30=(d.u[m]-d.u[m-30])+(d.c[m]-d.c[m-30]);
      var hot=h&&h.u&&h.c&&Date.now()-Math.min(h.u.t||0,h.c.t||0)<3600*1000?[["USDT",h.u],["USDC",h.c]].filter(function(q){return Math.abs(q[1].d)>=q[1].cap*.003}):[];
      row("stable",t30>0?"pos":"neg","稳定币 30 天 "+bn(t30)+(t30>0?"（扩张）":"（收缩）")+(hot.length?"，12 小时 "+hot.map(function(q){return q[0]+(q[1].d>0?" 异动增发":" 异动赎回")}).join("、"):""),"Stablecoins 30-day "+bn(t30)+(hot.length?"; 12h "+hot.map(function(q){return q[0]+(q[1].d>0?" big mint":" big burn")}).join(", "):""))}
    box.innerHTML=rows.join("");box.hidden=!rows.length;
  }
  document.addEventListener("tb:update",paint);document.addEventListener("ahr:update",paint);
  setInterval(paint,15000);setTimeout(paint,1200);
  // 第一次打开时，这几个模块还没被滑到、没有数据：页面空闲后先让它们在后台读取，「依据」随后补齐
  setTimeout(function(){var w=window.__warm||{};["costBands","ageCost","lthMonthly","lthRatio","stable"].forEach(function(k){try{w[k]&&w[k]()}catch(e){}});[6000,12000,20000].forEach(function(t){setTimeout(paint,t)})},3500);
})();
