
(function(){
  "use strict";
  // V27.2：本月信号定投（与「定投策略对比」里的信号定投同一套规则）
  //   每月预算 = 1 份。底部区 2 份（多出的 1 份从储备金拿，不够就有多少拿多少）；中性 1 份；顶部区 0.5 份（另一半存进储备金）。
  //   牛市后期风控当月：提示卖出现货持仓的 1/3，所得可手动加进储备金。
  function $(id){return document.getElementById(id)}
  function en(){return window.BTC_LANG==="en"}
  function st(){try{return typeof S!=="undefined"?S:null}catch(e){return null}}
  function yuan(v){return "¥"+Math.round(v).toLocaleString("en-US")}
  function plan(){var x=st();if(!x)return null;if(!x.sigPlan||typeof x.sigPlan!=="object")x.sigPlan={};var p=x.sigPlan;if(!(p.budget>0))p.budget=2000;if(!/^\d{4}-\d{2}$/.test(p.start||""))p.start=null;if(!isFinite(p.adj))p.adj=0;return p}
  function save(){try{if(typeof saveState==="function")saveState()}catch(e){}}
  function zoneName(z){return z==="b"?(en()?"Bottom zone":"底部区"):(z==="t"||z==="T")?(en()?"Top zone":"顶部区"):(en()?"Neutral":"中性区间")}
  function held(){var x=st(),h=x&&x.hd;return h?Math.max(0,(+h.d||0)+(+h.l||0)):0}
  function spent(){try{var v=typeof executionView==="function"?executionView():null;return v&&v.ready&&isFinite(v.total)?v.total:null}catch(e){return null}}
  var ICON={down:'<path d="M12 4v11"/><path d="M7.5 11 12 15.5 16.5 11"/><path d="M6 20h12"/>',up:'<path d="M12 20V9"/><path d="M7.5 13 12 8.5 16.5 13"/><path d="M6 4h12"/>',
    shield:'<path d="M12 3.5 5.5 6v5.6c0 4 2.8 7 6.5 8.4 3.7-1.4 6.5-4.4 6.5-8.4V6z"/><path d="m9.3 12 2 2 3.6-3.8"/>',vault:'<rect x="3.5" y="5" width="17" height="14" rx="3"/><circle cx="12" cy="12" r="3.2"/><path d="M12 8.8V7.5M12 16.5v-1.3M15.2 12h1.3M7.5 12h1.3"/>',
    plus:'<circle cx="12" cy="12" r="8.5"/><path d="M12 8.5v7M8.5 12h7"/>'};
  function ic(n,c){return '<span class="sp-ic" style="--c:'+c+'" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+ICON[n]+'</svg></span>'}
  function budgetChip(B){var h=$("dcaIntro");if(!h)return;var c=h.querySelector(".sp-budget");if(!c){c=document.createElement("button");c.type="button";c.className="sp-budget";c.dataset.sp="budget";h.appendChild(c)}c.innerHTML=(en()?"Monthly ":"每月 ")+"<b>"+yuan(B)+"</b>"}
  function render(){
    var box=$("sigPlan"),D=window.__TBM,p=plan();if(!box)return;
    if(!D||!D.rows||!D.rows.length||!p){box.removeAttribute("data-z");box.innerHTML='<div class="sp-card sp-empty">'+(en()?"Waiting for data":"等待数据")+'</div>';return}
    var E2=en(),n=D.rows.length,k=n-1,m=D.rows[k].m,B=p.budget,risk=new Set(D.risk||[]);
    if(!p.start){p.start=m;save()}
    budgetChip(B);
    var s0=D.rows.findIndex(function(r){return r.m>=p.start});if(s0<0)s0=k;
    var res=+p.adj||0;
    for(var i=s0;i<k;i++){var zz=D.zone[i];if(zz==="t"||zz==="T")res+=B/2;else if(zz==="b"){res-=Math.max(0,Math.min(res,B))}}
    res=Math.max(0,res);
    var z=D.zone[k]||"n",zk=z==="b"?"b":(z==="t"||z==="T")?"t":"n",amt,save2=0,from=0,verdict,sub,zname,zc;
    if(zk==="b"){from=Math.min(res,B);amt=B+from;zname=E2?"Bottom zone":"底部区";zc="var(--sg)";verdict=E2?"Bottom zone, double up":"底部区，加倍投入";sub=from>0?(E2?"Budget "+yuan(B)+" + reserve "+yuan(from):"本月预算 "+yuan(B)+" ＋ 储备金 "+yuan(from)):(E2?"Reserve is empty, invest the budget":"储备金为 0，先投本月预算")}
    else if(zk==="t"){amt=B/2;save2=B/2;zname=E2?"Top zone":"顶部区";zc="var(--so)";verdict=E2?"Top zone, invest half":"顶部区，减半投入";sub=E2?"Put "+yuan(save2)+" into the reserve":"另 "+yuan(save2)+" 存进储备金"}
    else{amt=B;zname=E2?"Neutral":"中性区间";zc="var(--sb)";verdict=E2?"Neutral, invest as planned":"中性区间，照常投入";sub=E2?"No adjustment this month":"信号不加不减"}
    var r=risk.has(k),h=held(),sp=spent(),done=sp==null?0:Math.max(0,sp),pct=amt>0?Math.min(1,done/amt):0;
    var C=2*Math.PI*84,L=Math.max(.01,C*pct);
    var tier=function(key,x,label,a,c){return '<div class="sp-tier'+(zk===key?' on':'')+'" style="--c:'+c+'"><b>'+x+'</b><span>'+label+'</span><i>'+yuan(a)+'</i></div>'};
    var meter=function(v,c){var x=v==null?0:Math.max(0,Math.min(100,v));return '<span class="sp-meter" style="--c:'+c+'"><u style="width:'+x.toFixed(1)+'%"></u><s></s></span>'};
    var gb=D.gBottom&&D.gBottom[k],gt=D.gTop&&D.gTop[k],mm=+m.slice(5,7);
    box.dataset.z=zk;
    box.innerHTML='<div class="sp-card sp-hero">'
      +'<div class="sp-top"><span class="sp-month">'+(E2?["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][mm-1]+" "+m.slice(0,4):m.slice(0,4)+" 年 "+mm+" 月")+'</span><span class="sp-tags"><span class="sp-tag" style="--c:'+zc+'"><i></i>'+zname+'</span>'+(r?'<span class="sp-tag" style="--c:var(--sr)"><i></i>'+(E2?"Risk control":"风控")+'</span>':'')+'</span></div>'
      +'<div class="sp-ring"><svg viewBox="0 0 200 200" aria-hidden="true" style="color:var(--z)"><defs><linearGradient id="spRingG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".55"/><stop offset="1" stop-color="currentColor"/></linearGradient></defs>'
      +'<circle cx="100" cy="100" r="84" fill="none" stroke="color-mix(in srgb,var(--z) 14%,var(--border-subtle))" stroke-width="9"/>'
      +'<circle cx="100" cy="100" r="84" fill="none" stroke="url(#spRingG)" style="color:var(--z)" stroke-width="9" stroke-linecap="round" stroke-dasharray="'+L.toFixed(1)+' '+C.toFixed(1)+'" transform="rotate(-90 100 100)"/></svg>'
      +'<div class="sp-ringtxt"><small>'+(E2?"To invest":"本月应投")+'</small><b><em>¥</em>'+Math.round(amt).toLocaleString("en-US")+'</b><span>'+(sp==null?(E2?"Records unavailable":"记录待核对"):(pct>=1?(E2?"Done":"已完成"):(E2?"Invested ":"已投 ")+yuan(done)+" / "+Math.round(pct*100)+"%"))+'</span></div></div>'
      +'<div class="sp-verdict">'+verdict+'</div><div class="sp-vsub">'+sub+'</div>'
      +'<div class="sp-tiers">'+tier("b","×2",E2?"Bottom":"底部区",B*2,"var(--sg)")+tier("n","×1",E2?"Neutral":"中性",B,"var(--sb)")+tier("t","×0.5",E2?"Top":"顶部区",B/2,"var(--so)")+'</div>'
      +'</div>'
      +'<div class="sp-h2">'+(E2?"Signals":"依据")+'</div><div class="sp-card sp-list">'
      +'<div class="sp-row">'+ic("down","var(--sg)")+'<span class="sp-lab">'+(E2?"Bottom signal":"底部信号")+'<em>'+(E2?"Doubles above 75":"过 75 加倍")+'</em></span>'+meter(gb,"var(--sg)")+'<b'+(gb>=75?' style="color:var(--sg)"':'')+'>'+(gb==null?"--":Math.round(gb))+'</b></div>'
      +'<div class="sp-row">'+ic("up","var(--so)")+'<span class="sp-lab">'+(E2?"Top signal":"顶部信号")+'<em>'+(E2?"Halves above 75":"过 75 减半")+'</em></span>'+meter(gt,"var(--so)")+'<b'+(gt>=75?' style="color:var(--so)"':'')+'>'+(gt==null?"--":Math.round(gt))+'</b></div>'
      +'<div class="sp-row">'+ic("shield","var(--sr)")+'<span class="sp-lab">'+(E2?"Late-bull risk control":"牛市后期风控")+(r?'<em style="color:var(--sr)">'+(E2?"Sell 1/3 of spot into the reserve":"卖出现货的 1/3 放进储备金")+(h>0?(E2?" · about ":"，约 ")+(h/3).toFixed(4)+" BTC":"")+'</em>':'')+'</span><b class="'+(r?'':'mute')+'"'+(r?' style="color:var(--sr)"':'')+'>'+(r?(E2?"Fired":"已启动"):(E2?"Off":"未启动"))+'</b></div>'
      +'</div>'
      +'<div class="sp-h2">'+(E2?"Money":"资金")+'</div><div class="sp-card sp-list">'
      +'<button type="button" class="sp-row" data-sp="adj">'+ic("vault","var(--sv)")+'<span class="sp-lab">'+(E2?"Reserve":"储备金")+'</span><b>'+yuan(res)+(save2?' → '+yuan(res+save2):from?' → '+yuan(res-from):'')+'</b></button>'
      +'<button type="button" class="sp-row" data-sp="rec">'+ic("plus","var(--sb)")+'<span class="sp-lab">'+(E2?"Record this month":"记录本月投入")+'</span><b class="link">'+(E2?"Record":"记录")+'</b></button>'
      +'</div>';
  }
  function init(){
    var box=$("sigPlan");if(!box)return;
    var onClick=function(e){var b=e.target.closest&&e.target.closest("[data-sp]");if(!b)return;
      if(b.dataset.sp==="budget"){var p0=plan(),t0=window.prompt(en()?"Monthly budget in ¥ (1 unit)":"每月预算（元）：底部区投 2 倍，顶部区投一半","" + p0.budget);if(t0==null)return;var v0=Math.round(+String(t0).replace(/[^\d.]/g,""));if(v0>=100){p0.budget=v0;save();render()}return}
      if(b.dataset.sp==="rec"){try{setTab("mine");if(typeof focusOpenSection==="function")focusOpenSection("personal")}catch(_){}return}
      if(b.dataset.sp==="adj"){var p=plan(),cur=+p.adj||0,t=window.prompt(en()?"Add to (or subtract from, with −) the reserve, in ¥":"储备金调整（元）：输入要加入的金额，减少用负数。例如风控卖出所得、手动存入。","");if(t==null)return;var v=+String(t).replace(/[^\d.\-]/g,"");if(isFinite(v)&&v!==0){p.adj=cur+v;save();render()}}};
    box.addEventListener("click",onClick);var hd=$("dcaIntro");if(hd)hd.addEventListener("click",onClick);
    document.addEventListener("tbm:update",render);
    setInterval(function(){if(document.documentElement.dataset.tab==="dca")render()},30000);
    var warm=function(){if(!window.__TBM&&typeof window.__tbmInit==="function")try{window.__tbmInit()}catch(e){}};
    var orig=window.setTab;if(typeof orig==="function")window.setTab=function(t){var r=orig.apply(this,arguments);if(t==="dca"){warm();render()}return r};
    if(document.documentElement.dataset.tab==="dca")warm();
    render();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
