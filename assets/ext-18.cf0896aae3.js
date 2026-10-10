
(function(){
  "use strict";
  // V26.3：信号联动定投回测（我的 → 定投策略对比）。按月线收盘成交，不计手续费。
  //  普通定投：每月 1 份。
  //  信号定投：每月 1 份；底部区当月 2 份；顶部区当月 0.5 份；牛市风控提示当月卖出持仓的 1/3 换成现金；
  //           现金在之后的底部区里分 6 个月投回。
  var start="2018",built=false;
  function $(id){return document.getElementById(id)}
  function E(){return window.BTC_LANG==="en"}
  function fmtUsd(v){return "$"+Math.round(v).toLocaleString("en-US")}
  function fmtBtc(v){return v.toFixed(v<1?4:2)+" BTC"}
  function pct(v){return (v>=0?"+":"")+(v*100).toFixed(0)+"%"}
  function sim(D,s,signal,mode){
    var btc=0,cash=0,inv=0,step=0,risk=new Set(D.risk),last=D.rows[D.rows.length-1].price;mode=mode||"all";
    for(var k=s;k<D.rows.length;k++){var p=D.rows[k].price,z=D.zone[k];
      var units=signal&&mode!=="sell"?(z==="b"?2:(z==="t"||z==="T")?0.5:1):1,amt=100*units;inv+=amt;btc+=amt/p;
      if(signal&&mode!=="units"){
        if(risk.has(k)){var sell=btc/3;btc-=sell;cash+=sell*p;step=0}
        if(z==="b"&&cash>0){if(!step)step=cash/6;var use=Math.min(cash,step);cash-=use;btc+=use/p}else if(z!=="b")step=0;
      }}
    var val=btc*last+cash;return{inv:inv,val:val,ret:val/inv-1,btc:btc,cash:cash,per:val/inv*10000};
  }
  function ensure(){
    if(built&&$("sigDca"))return $("sigDca");var d=document.querySelector('details[data-module="dcalab"]');if(!d)return null;
    var w=document.createElement("div");w.className="sigdca";w.id="sigDca";
    w.innerHTML='<h3>信号联动定投</h3><p class="sd-sub">用「顶底区间」和「牛市后期风控」调节每月定投，与普通定投比较。</p>'
      +'<div class="range-tabs sd-starts" role="group" aria-label="回测起点"><button class="range-btn" type="button" data-sd="2014">2014 起</button><button class="range-btn active" type="button" data-sd="2018" aria-pressed="true">2018 起</button><button class="range-btn" type="button" data-sd="2020">2020 起</button><button class="range-btn" type="button" data-sd="2022">2022 起</button></div>'
      +'<div class="sd-table" id="sdTable"></div><p class="sd-verdict" id="sdVerdict"></p><p class="sd-sub" id="sdWhy"></p>'
      +'<ul class="sd-rules"><li>普通定投：每月 1 份（100 美元）。</li><li>信号定投：底部区 2 份，顶部区 0.5 份；风控提示当月卖出 1/3，现金在之后的底部区分 6 个月投回。</li><li>按月线收盘成交，不计手续费；规则是看过历史后设定的，结果偏乐观，仅供参考。</li></ul>';
    var sum=d.querySelector("summary");if(sum&&sum.nextSibling)d.insertBefore(w,sum.nextSibling);else d.appendChild(w);
    w.addEventListener("click",function(e){var b=e.target.closest("[data-sd]");if(!b)return;start=b.dataset.sd;w.querySelectorAll("[data-sd]").forEach(function(x){var on=x===b;x.classList.toggle("active",on);x.setAttribute("aria-pressed",on?"true":"false")});render()});
    built=true;return w;
  }
  function render(){
    var D=window.__TBM;if(!D||!D.rows||D.rows.length<24)return;if(!ensure())return;var en=E();
    var s=D.rows.findIndex(function(r){return r.m>=start+"-01"});if(s<0)return;
    var a=sim(D,s,false),b=sim(D,s,true);
    var row=function(k,x,y,f,better){var bx=better(x,y),by=better(y,x);return '<div class="sd-tr"><span>'+k+'</span><span>'+(bx?'<b>':'')+f(x)+(bx?'</b>':'')+'</span><span>'+(by?'<b>':'')+f(y)+(by?'</b>':'')+'</span></div>'};
    var hi=function(x,y){return x>y*1.001},none=function(){return false};
    $("sdTable").innerHTML='<div class="sd-tr"><span></span><span>'+(en?"Regular DCA":"普通定投")+'</span><span>'+(en?"Signal DCA":"信号定投")+'</span></div>'
      +row(en?"Invested":"投入",a.inv,b.inv,fmtUsd,none)
      +row(en?"Value now":"现在价值",a.val,b.val,fmtUsd,hi)
      +row(en?"Return":"收益率",a.ret,b.ret,pct,hi)
      +row(en?"Per $10K invested":"每 1 万美元变成",a.per,b.per,fmtUsd,hi)
      +row(en?"BTC held":"持有 BTC",a.btc,b.btc,fmtBtc,none)
      +row(en?"Cash":"现金",a.cash,b.cash,fmtUsd,none);
    var diff=b.per/a.per-1;
    $("sdVerdict").textContent=en?("From "+start+": each $10K in signal DCA is worth "+pct(diff)+" vs regular DCA."):("从 "+start+" 年起：信号定投每 1 万美元的最终价值，比普通定投 "+(diff>=0?"多 ":"少 ")+Math.abs(diff*100).toFixed(0)+"%。");
    $("sdVerdict").style.color=diff>=0?"var(--market-positive)":"var(--market-negative)";
    var u=sim(D,s,true,"units").per/a.per-1,sl=sim(D,s,true,"sell").per/a.per-1;
    $("sdWhy").textContent=en?("Where it comes from: adjusting monthly units alone "+pct(u)+"; selling on risk prompts and rebuying in bottom zones alone "+pct(sl)+". Small rule changes move these numbers a lot."):("来源：只调每月份数 "+pct(u)+"；只做风控卖出、底部买回 "+pct(sl)+"。规则细节稍有不同，结果差别很大。");
  }
  document.addEventListener("tbm:update",render);
  document.addEventListener("toggle",function(e){if(e.target&&e.target.open&&e.target.dataset&&e.target.dataset.module==="dcalab")render()},true);
  var orig=window.setTab;if(typeof orig==="function")window.setTab=function(t){var r=orig.apply(this,arguments);if(t==="mine")setTimeout(render,50);return r};
})();
