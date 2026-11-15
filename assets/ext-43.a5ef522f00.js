
(function(){
  "use strict";
  // V27.7：长期持有者分组成本——各持有时间段的平均成本（实现市值 ÷ 持币量），Bitview 周度数据
  //   ≤10 年 = 全部 − 10 年以上；6 月–10 年 = ≤10 年 − 6 个月以内；6 月–7 年 = 6 月–10 年 − (7–8 年 + 8–10 年)；6 月–5 年 = 6 月–7 年 − (5–6 年 + 6–7 年)
  var KEY="btc_lth_cohort_v1",TTL=12*3600*1000,API="https://bitview.space/api/series/bulk";
  var B=["5y_to_6y","6y_to_7y","7y_to_8y","8y_to_10y","10y_to_12y","12y_to_15y","over_15y"];
  var LINES=[{k:"l10",zh:"≤10 年",en:"≤10y",c:"var(--text-primary)"},{k:"a5",zh:"6 月–5 年",en:"6m–5y",c:"#e8890c"},{k:"a7",zh:"6 月–7 年",en:"6m–7y",c:"#4466ee"},{k:"a10",zh:"6 月–10 年",en:"6m–10y",c:"#12a170"}];
  var D=null,range=0,hover=-1,map=null,loading=false,failed=false,off={};
  function $(id){return document.getElementById(id)}
  function en(){return window.BTC_LANG==="en"}
  function css(n,f){var v=getComputedStyle(document.documentElement).getPropertyValue(n).trim();return v||f}
  function col(c){return c.indexOf("var(")===0?css(c.slice(4,-1),"#111"):c}
  function usd(v){return !(v>0)?"—":v>=1e4?"$"+(v/1e3).toFixed(1)+"K":v>=1e3?"$"+(v/1e3).toFixed(2)+"K":"$"+Math.round(v)}
  function get(u){return typeof tryFetch==="function"?tryFetch(u,30000):fetch(u).then(function(r){return r.json()})}
  async function load(){
    try{var c=JSON.parse(localStorage.getItem(KEY));if(c&&c.D&&c.D.d){D=c.D;if(Date.now()-c.ts<TTL){render();return}}}catch(e){}
    if(loading)return;loading=true;render();
    try{
      var names=["date","price","realized_cap","circulating_supply","age_under_6m_realized_cap","age_under_6m_supply"];B.forEach(function(b){names.push("age_"+b+"_realized_cap","age_"+b+"_supply")});
      var u=new URL(API);u.searchParams.set("index","week1");u.searchParams.set("series",names.join(","));u.searchParams.set("start","2013-01-01");
      var r=await get(u.toString()),col_=function(n){var k=names.indexOf(n);return r[k].data.map(function(x){return x==null?NaN:+x})};
      var d=r[0].data,px=col_("price"),rc=col_("realized_cap"),sp=col_("circulating_supply"),r6=col_("age_under_6m_realized_cap"),s6=col_("age_under_6m_supply");
      var b={};B.forEach(function(x){b[x]={r:col_("age_"+x+"_realized_cap"),s:col_("age_"+x+"_supply")}});
      var o={d:d,p:px,l10:[],a10:[],a7:[],a5:[]};
      for(var i=0;i<d.length;i++){
        var oR=b["10y_to_12y"].r[i]+b["12y_to_15y"].r[i]+b["over_15y"].r[i],oS=b["10y_to_12y"].s[i]+b["12y_to_15y"].s[i]+b["over_15y"].s[i];
        if(!isFinite(oR)){oR=0;oS=0}
        var R10=rc[i]-oR,S10=sp[i]-oS,Ra=R10-r6[i],Sa=S10-s6[i],R7=Ra-(b["7y_to_8y"].r[i]||0)-(b["8y_to_10y"].r[i]||0),S7=Sa-(b["7y_to_8y"].s[i]||0)-(b["8y_to_10y"].s[i]||0),
            R5=R7-(b["5y_to_6y"].r[i]||0)-(b["6y_to_7y"].r[i]||0),S5=S7-(b["5y_to_6y"].s[i]||0)-(b["6y_to_7y"].s[i]||0);
        var q=function(R,S){return S>1e3&&R>0?R/S:null};
        o.l10.push(q(R10,S10));o.a10.push(q(Ra,Sa));o.a7.push(q(R7,S7));o.a5.push(q(R5,S5));
      }
      if(d.length<50||o.l10[d.length-1]==null)throw 0;
      D=o;failed=false;try{localStorage.setItem(KEY,JSON.stringify({ts:Date.now(),D:D}))}catch(e){}
    }catch(e){if(!D)failed=true}
    finally{loading=false;render()}
  }
  function last(a){for(var i=a.length-1;i>=0;i--)if(a[i]>0)return a[i];return null}
  function badge(){var b=$("freshLthCohort");if(!b)return;var t,c;
    if(D){var day=D.d[D.d.length-1],age=(Date.now()-Date.parse(day+"T00:00:00Z"))/864e5;t=(age>10?(en()?"Stale · ":"滞后 · "):(en()?"Data date · ":"数据日 · "))+day.slice(5);c=age>10?"warn":"good"}
    else if(loading){t=en()?"Syncing":"同步中";c="warn"}else if(failed){t=en()?"Unavailable":"暂不可用";c="bad"}else{t=en()?"Waiting for data":"等待数据";c="warn"}
    b.textContent=t;b.className="fresh-badge "+c}
  function render(){
    badge();var E=en(),em=$("lcEmpty");
    document.querySelectorAll("[data-lc-range]").forEach(function(x){var on=+x.dataset.lcRange===range;x.setAttribute("aria-pressed",on?"true":"false");x.classList.toggle("active",on);if(E)x.textContent={52:"1Y",156:"3Y",0:"All"}[x.dataset.lcRange]});
    if(!D){if(em){em.hidden=false;em.textContent=loading?(E?"Syncing…":"同步中…"):failed?(E?"Unavailable":"暂不可用"):(E?"Waiting for data":"等待数据")}return}
    if(em)em.hidden=true;
    var px=typeof S!=="undefined"&&S&&S.price>0?S.price:last(D.p);
    $("lcLegend").innerHTML=LINES.map(function(l){var v=last(D[l.k]);return '<button type="button" class="'+(off[l.k]?'off':'')+'" data-lc-line="'+l.k+'" style="--c:'+l.c+'"><span><i></i>'+(E?l.en:l.zh)+'</span><b>'+usd(v)+'</b></button>'}).join("");
    var vs=LINES.map(function(l){return last(D[l.k])}).filter(function(v){return v>0}),mx=Math.max.apply(null,vs),mn=Math.min.apply(null,vs);
    $("lcSpread").innerHTML=(E?"Lines spread ":"四条线相差 ")+'<b>'+((mx/mn-1)*100).toFixed(0)+'%</b>'+(px?(E?" · price vs 6m–5y ":" · 现价比 6 月–5 年成本 ")+'<b>'+((px/last(D.a5)-1)>=0?"+":"−")+Math.abs((px/last(D.a5)-1)*100).toFixed(0)+'%</b>':"");
    draw();
  }
  function draw(){
    var cv=$("lcCanvas");if(!cv||!D)return;var box=cv.parentElement,W=box.clientWidth,H=box.clientHeight;if(!W||!H)return;
    var n=D.d.length,s0=range?Math.max(0,n-range):0,cnt=n-s0;
    var dpr=Math.min(3,window.devicePixelRatio||1);cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);var c=cv.getContext("2d");c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,W,H);
    var padL=46,padR=8,padT=8,padB=20,pw=W-padL-padR,ph=H-padT-padB,lo=Infinity,hi=0;
    for(var i=s0;i<n;i++){[D.p[i]].concat(LINES.map(function(l){return D[l.k][i]})).forEach(function(v){if(v>0){lo=Math.min(lo,v);hi=Math.max(hi,v)}})}
    lo*=.85;hi*=1.12;var L0=Math.log(lo),L1=Math.log(hi);
    var X=function(k){return padL+(cnt>1?(k-s0)/(cnt-1):0)*pw},Y=function(v){return padT+ph-(Math.log(v)-L0)/(L1-L0)*ph};
    var FONT=css("--font-sans","-apple-system,system-ui,sans-serif"),tx3=css("--text-tertiary","#888"),grid=css("--border-subtle","rgba(0,0,0,.08)");
    c.font="10px "+FONT;c.fillStyle=tx3;c.strokeStyle=grid;c.lineWidth=1;c.textAlign="right";c.textBaseline="middle";
    for(var e=Math.ceil(Math.log10(lo));e<=Math.floor(Math.log10(hi));e++){var v=Math.pow(10,e),y=Math.round(Y(v))+.5;c.beginPath();c.moveTo(padL,y);c.lineTo(padL+pw,y);c.stroke();c.fillText(usd(v).replace(".0K","K").replace(".00K","K"),padL-5,y)}
    if(Math.floor(Math.log10(hi))-Math.ceil(Math.log10(lo))<1){[lo*1.1,Math.sqrt(lo*hi),hi/1.1].forEach(function(v){var y=Math.round(Y(v))+.5;c.beginPath();c.moveTo(padL,y);c.lineTo(padL+pw,y);c.stroke();c.fillText(usd(v),padL-5,y)})}
    c.textAlign="center";c.textBaseline="alphabetic";var lastX=-99,yrs=(Date.parse(D.d[n-1])-Date.parse(D.d[s0]))/864e5>730;
    for(i=s0;i<n;i++){var dd=D.d[i],nd=D.d[i-1];if(!nd)continue;var nm=yrs?dd.slice(0,4)!==nd.slice(0,4):dd.slice(5,7)!==nd.slice(5,7);if(!nm)continue;var xx=X(i);if(xx-lastX<(yrs?36:40))continue;lastX=xx;c.fillText(yrs?dd.slice(0,4):(en()?["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+dd.slice(5,7)-1]:(+dd.slice(5,7))+"月"),xx,H-5)}
    var line=function(arr,color,w,a){c.strokeStyle=color;c.lineWidth=w;c.globalAlpha=a;c.lineJoin="round";c.beginPath();var st=false;for(var k=s0;k<n;k++){var v=arr[k];if(!(v>0)){st=false;continue}if(!st){c.moveTo(X(k),Y(v));st=true}else c.lineTo(X(k),Y(v))}c.stroke();c.globalAlpha=1};
    line(D.p,css("--text-tertiary","#999"),1.2,.75);
    LINES.slice().reverse().forEach(function(l){if(!off[l.k])line(D[l.k],col(l.c),1.8,1)});
    var lv=$("lcLive");
    if(hover>=s0&&hover<n){var hx=X(hover);c.strokeStyle=tx3;c.lineWidth=1;c.beginPath();c.moveTo(hx+.5,padT);c.lineTo(hx+.5,padT+ph);c.stroke();
      if(lv)lv.textContent=D.d[hover]+" · "+(en()?"price ":"价格 ")+usd(D.p[hover])+" · "+LINES.map(function(l){return (en()?l.en:l.zh)+" "+usd(D[l.k][hover])}).join(" · ")}
    else if(lv)lv.textContent="";
    map={padL:padL,pw:pw,s0:s0,cnt:cnt};
  }
  function init(){
    var sec=$("lthCohort");if(!sec)return;
    sec.addEventListener("click",function(e){var b=e.target.closest&&e.target.closest("[data-lc-range]");if(b){range=+b.dataset.lcRange;hover=-1;render();return}
      var l=e.target.closest&&e.target.closest("[data-lc-line]");if(l){off[l.dataset.lcLine]=!off[l.dataset.lcLine];render()}});
    var cv=$("lcCanvas"),pick=function(ev){if(!D||!map)return;var r=cv.getBoundingClientRect(),x=(ev.touches?ev.touches[0].clientX:ev.clientX)-r.left;hover=map.s0+Math.max(0,Math.min(map.cnt-1,Math.round((x-map.padL)/map.pw*(map.cnt-1))));draw()};
    cv.addEventListener("pointermove",pick);cv.addEventListener("pointerdown",pick);cv.addEventListener("pointerleave",function(){hover=-1;draw()});cv.addEventListener("touchend",function(){hover=-1;draw()},{passive:true});
    var started=false,go=function(){if(started)return;started=true;load()};
    if("IntersectionObserver" in window){var io=new IntersectionObserver(function(es){if(es.some(function(x){return x.isIntersecting})){io.disconnect();go()}},{rootMargin:"600px 0px"});io.observe(sec.closest("details")||sec)}else go();
    window.addEventListener("resize",function(){if(D)draw()},{passive:true});window.addEventListener("themechange",function(){if(D)render()});
    if("ResizeObserver" in window)new ResizeObserver(function(){if(D)draw()}).observe(cv.parentElement);
    render();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
