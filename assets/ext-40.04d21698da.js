
(function(){
  "use strict";
  // V27.11：周期时钟——减半后第几天；历史顶部窗口（减半后 526–548 天：2017、2021、2025 三轮）与底部窗口（777–924 天）
  var HALVINGS=[["2012-11-28",210000],["2016-07-09",420000],["2020-05-11",630000],["2024-04-20",840000]],NEXT_H=1050000,TOP=[526,548],BOT=[777,924],SPAN=1460;
  function $(id){return document.getElementById(id)}
  function en(){return window.BTC_LANG==="en"}
  function days(a,b){return Math.floor((b-Date.parse(a+"T00:00:00Z"))/864e5)}
  function ensure(){
    var c=$("cycleClock");if(c)return c;var host=$("radar");if(!host)return null;
    c=document.createElement("section");c.className="sec cclock";c.id="cycleClock";c.setAttribute("aria-label","周期时钟");
    c.innerHTML='<div class="module-head"><div class="module-title-row"><h2 class="sec-title" id="ccTitle">周期时钟</h2></div></div>'
      +'<div class="cc-big"><b id="ccDay">--</b><span id="ccSub"></span></div>'
      +'<div class="cc-bar" id="ccBar"><i class="cc-top"></i><i class="cc-bot"></i><i class="cc-now" id="ccNow"></i></div>'
      +'<div class="cc-ticks"><span>0</span><span id="ccT1">1年</span><span id="ccT2">2年</span><span id="ccT3">3年</span><span id="ccT4">4年</span></div>'
      +'<div class="cc-legend"><span class="k-top"><i></i><em id="ccLt">顶部窗口</em></span><span class="k-bot"><i></i><em id="ccLb">底部窗口</em></span><span class="k-now"><i></i><em id="ccLn">今天</em></span></div>'
      +'<div class="cc-rows" id="ccRows"></div>';
    host.insertAdjacentElement("afterend",c);
    var top=c.querySelector(".cc-top"),bot=c.querySelector(".cc-bot");
    top.style.left=(TOP[0]/SPAN*100)+"%";top.style.width=((TOP[1]-TOP[0])/SPAN*100)+"%";
    bot.style.left=(BOT[0]/SPAN*100)+"%";bot.style.width=((BOT[1]-BOT[0])/SPAN*100)+"%";
    return c;
  }
  function paint(){
    var c=ensure();if(!c)return;var E=en(),h=HALVINGS[HALVINGS.length-1],now=Date.now(),d=days(h[0],now);
    $("ccTitle").textContent=E?"Cycle clock":"周期时钟";
    $("ccDay").textContent=E?"Day "+d+" after the halving":"减半后第 "+d+" 天";
    var st=d<TOP[0]?(E?(TOP[0]-d)+" days to the historical top window":"距历史顶部窗口还有 "+(TOP[0]-d)+" 天")
      :d<=TOP[1]?(E?"Inside the historical top window":"正处在历史顶部窗口")
      :d<BOT[0]?(E?(BOT[0]-d)+" days to the historical bottom window":"距历史底部窗口还有 "+(BOT[0]-d)+" 天")
      :d<=BOT[1]?(E?"Inside the historical bottom window ("+(BOT[1]-d)+" days left)":"正处在历史底部窗口（还剩 "+(BOT[1]-d)+" 天）")
      :(E?"Past the historical bottom window":"已过历史底部窗口");
    $("ccSub").textContent=st;
    $("ccNow").style.left=Math.min(100,d/SPAN*100)+"%";
    [["ccT1","1年","1y"],["ccT2","2年","2y"],["ccT3","3年","3y"],["ccT4","4年","4y"],["ccLt","顶部窗口","Top window"],["ccLb","底部窗口","Bottom window"],["ccLn","今天","Today"]].forEach(function(x){var e=$(x[0]);if(e)e.textContent=E?x[2]:x[1]});
    // 下次减半：有 Bitview 区块高度就按「剩余区块 × 10 分钟」估，否则按 4 年估
    var hgt=window.__bvSync&&window.__bvSync.height>0?window.__bvSync.height:null,eta=hgt?now+(NEXT_H-hgt)*600000:Date.parse(h[0]+"T00:00:00Z")+1461*864e5,left=Math.max(0,Math.round((eta-now)/864e5));
    var etaS=new Date(eta).toISOString().slice(0,7);
    var rows=[[E?"Past tops (2017 / 21 / 25)":"历次顶部（2017 / 21 / 25）",E?"day 526 / 548 / 534":"第 526 / 548 / 534 天"],
      [E?"Past lows (2018 / 22 / 26)":"历次低点（2018 / 22 / 26）",E?"day 889 / 924 / 801":"第 889 / 924 / 801 天"],
      [E?"Next halving":"下次减半",(E?"about ":"约 ")+etaS+(E?" · in "+left+" days":" · 还剩 "+left+" 天")+(hgt?(E?" (by block height)":"（按区块高度估算）"):"")]];
    $("ccRows").innerHTML=rows.map(function(r){return '<div class="cc-row"><span>'+r[0]+'</span><b>'+r[1]+'</b></div>'}).join("");
  }
  function start(){paint();setInterval(paint,60000)}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",function(){setTimeout(start,800)});else setTimeout(start,800);
})();
