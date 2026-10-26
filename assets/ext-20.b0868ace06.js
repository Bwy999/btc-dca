
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
    w.innerHTML='<h3>信号定投 · AHR999 定投 · 普通定投</h3><p class="sd-sub">用「顶底区间」和「牛市后期风控」调节每月定投，与普通定投比较。</p>'
      +'<div class="range-tabs sd-starts" role="group" aria-label="回测起点"><button class="range-btn" type="button" data-sd="2014">2014 起</button><button class="range-btn active" type="button" data-sd="2018" aria-pressed="true">2018 起</button><button class="range-btn" type="button" data-sd="2020">2020 起</button><button class="range-btn" type="button" data-sd="2022">2022 起</button></div>'
      +'<div class="sd-table" id="sdTable"></div><p class="sd-verdict" id="sdVerdict"></p><p class="sd-sub" id="sdWhy"></p>'
      +'<ul class="sd-rules"><li>普通定投：每月 1 份（100 美元）。</li><li>信号定投：底部区 2 份，顶部区 0.5 份；风控提示当月卖出 1/3，现金在之后的底部区分 6 个月投回。</li><li>按月线收盘成交，不计手续费；规则是看过历史后设定的，结果偏乐观，仅供参考。</li></ul>';
    var sum=d.querySelector("summary");if(sum&&sum.nextSibling)d.insertBefore(w,sum.nextSibling);else d.appendChild(w);
    w.addEventListener("click",function(e){var b=e.target.closest("[data-sd]");if(!b)return;start=b.dataset.sd;w.querySelectorAll("[data-sd]").forEach(function(x){var on=x===b;x.classList.toggle("active",on);x.setAttribute("aria-pressed",on?"true":"false")});render()});
    built=true;return w;
  }
  // V26.9.3：AHR999 定投（经典 AHR999，与「定投策略对比」原规则相同：<0.45 → 4 份，0.45–1.2 → 1.5 份，1.2–5 → 0.4 份，>5 → 0 份）
  function ahrMap(){try{if(typeof dcaLabMonths==="undefined"||!dcaLabMonths.length)return null;var m={};dcaLabMonths.forEach(function(r){if(r&&r.m&&isFinite(r.ahrClassic))m[r.m]=r.ahrClassic});return m}catch(e){return null}}
  function mult(){try{var x=window.S&&S.dcaLab&&S.dcaLab.mult;if(Array.isArray(x)&&x.length===4)return x}catch(e){}try{var y=S.dcaLab.mult;if(Array.isArray(y)&&y.length===4)return y}catch(e){}return [4,1.5,.4,0]}
  function simAhr(D,s,A){
    var btc=0,inv=0,last=D.rows[D.rows.length-1].price,M=mult(),miss=0;
    for(var k=s;k<D.rows.length;k++){var p=D.rows[k].price,a=A[D.rows[k].m];
      if(!isFinite(a)){miss++;a=1}
      var units=a<.45?M[0]:a<1.2?M[1]:a<5?M[2]:M[3],amt=100*units;inv+=amt;btc+=amt/p}
    var val=btc*last;return{inv:inv,val:val,ret:inv>0?val/inv-1:0,btc:btc,cash:0,per:inv>0?val/inv*10000:0,miss:miss};
  }
  function render(){
    var D=window.__TBM;if(!D||!D.rows||D.rows.length<24)return;if(!ensure())return;var en=E();
    var s=D.rows.findIndex(function(r){return r.m>=start+"-01"});if(s<0)return;
    if(en){var h=$("sigDca").querySelector("h3");if(h)h.textContent="Signal vs AHR999 vs regular DCA";$("sigDca").querySelectorAll("[data-sd]").forEach(function(x){x.textContent=x.dataset.sd})}
    var A=ahrMap();
    if(!A){try{if(typeof initDcaLab==="function")initDcaLab();if(typeof refreshDcaLab==="function")refreshDcaLab(false)}catch(e){}}
    var a=sim(D,s,false),b=sim(D,s,true),c=A?simAhr(D,s,A):null;
    a.coin=a.btc/a.inv*10000;b.coin=b.btc/b.inv*10000;if(c)c.coin=c.btc/c.inv*10000;
    var cols=[a,c,b],best=function(get){var v=cols.map(function(x){return x?get(x):-Infinity}),m=Math.max.apply(null,v);return v.map(function(x){return x>=m*0.999&&isFinite(x)})};
    var row=function(k,get,f,hl){var bb=hl?best(get):[0,0,0];return '<div class="sd-tr sd-3"><span>'+k+'</span>'+cols.map(function(x,i){return '<span>'+(bb[i]?'<b>':'')+(x?f(get(x)):'--')+(bb[i]?'</b>':'')+'</span>'}).join("")+'</div>'};
    var btc3=function(v){return v.toFixed(3)};
    $("sdTable").innerHTML='<div class="sd-tr sd-3 sd-th"><span></span><span>'+(en?"Regular":"普通定投")+'</span><span>AHR999</span><span>'+(en?"Signal":"信号定投")+'</span></div>'
      +row(en?"Invested":"投入",function(x){return x.inv},fmtUsd,false)
      +row(en?"Value now":"现在价值",function(x){return x.val},fmtUsd,true)
      +row(en?"Return":"收益率",function(x){return x.ret},pct,true)
      +row(en?"$10K → value":"每万美元变成",function(x){return x.per},fmtUsd,true)
      +row(en?"BTC held":"持有 BTC",function(x){return x.btc},btc3,false)
      +row(en?"$10K → BTC":"每万美元买到 BTC",function(x){return x.coin},btc3,true)
      +row(en?"Cash":"现金",function(x){return x.cash},fmtUsd,false);
    var v=$("sdVerdict");
    if(c){
      var dr=b.ret-c.ret,dc=b.coin/c.coin-1;
      v.innerHTML=(en?("From "+start+", signal vs AHR999 DCA: return "+pct(b.ret)+" vs "+pct(c.ret)+"; BTC per $10K "+btc3(b.coin)+" vs "+btc3(c.coin)+" ("+(dc>=0?"+":"−")+Math.abs(dc*100).toFixed(1)+"%)."):
        ("从 "+start+" 年起，信号定投对比 AHR999 定投：<br>收益率 "+pct(b.ret)+" 对 "+pct(c.ret)+"（"+(dr>=0?"高 ":"低 ")+Math.abs(dr*100).toFixed(0)+" 个百分点）；<br>每 1 万美元买到 "+btc3(b.coin)+" 对 "+btc3(c.coin)+" BTC（币本位"+(dc>=0?"多 ":"少 ")+Math.abs(dc*100).toFixed(1)+"%）。"));
      v.style.color=(dr>=0&&dc>=0)?"var(--market-positive)":(dr<0&&dc<0)?"var(--market-negative)":"var(--text-primary)";
    }else{v.textContent=en?"Loading AHR999 history…":"正在读取 AHR999 历史…";v.style.color="var(--text-tertiary)"}
  }
  // AHR999 月度历史读到后再画一次
  var tries=0,poll=setInterval(function(){tries++;if(ahrMap()){clearInterval(poll);render()}else if(tries>90)clearInterval(poll)},2000);
  document.addEventListener("tbm:update",render);
  document.addEventListener("toggle",function(e){if(e.target&&e.target.open&&e.target.dataset&&e.target.dataset.module==="dcalab")render()},true);
  var orig=window.setTab;if(typeof orig==="function")window.setTab=function(t){var r=orig.apply(this,arguments);if(t==="mine")setTimeout(render,50);return r};
})();
