
(function(){
  "use strict";
  // V27.7：长/短期持有者持仓比率 = lth_supply ÷ sth_supply（Bitview）。1 年 / 3 年按天，全部按月
  var API="https://bitview.space/api/series/bulk",KD="btc_lthsth_d_v1",KM="btc_lthsth_m_v1",TTL=6*3600*1000;
  var Dd=null,Dm=null,range=365,hover=-1,map=null,loadingD=false,loadingM=false,failed=false;
  function $(id){return document.getElementById(id)}
  function en(){return window.BTC_LANG==="en"}
  function css(n,f){var v=getComputedStyle(document.documentElement).getPropertyValue(n).trim();return v||f}
  function readJSON(k){try{return JSON.parse(localStorage.getItem(k))}catch(e){return null}}
  function get(url){return typeof tryFetch==="function"?tryFetch(url,25000):fetch(url).then(function(r){return r.json()})}
  function url(index,start){var u=new URL(API);u.searchParams.set("index",index);u.searchParams.set("series","date,lth_supply,sth_supply,price");u.searchParams.set("start",String(start));return u.toString()}
  function parse(r,dropToday){var d=r[0].data,l=r[1].data,s=r[2].data,p=r[3].data,today=new Date().toISOString().slice(0,10),o={d:[],r:[],p:[]};
    d.forEach(function(x,i){if(dropToday&&x>=today)return;var a=+l[i],b=+s[i];if(!(a>0&&b>0))return;o.d.push(x);o.r.push(a/b);o.p.push(+p[i]||0)});return o}
  function ok(o){return o&&Array.isArray(o.d)&&o.d.length>30&&o.d.length===o.r.length}
  async function loadD(force){var c=readJSON(KD);if(c&&ok(c.data)){Dd=c.data;if(!force&&Date.now()-c.ts<TTL)return}
    if(loadingD)return;loadingD=true;try{var o=parse(await get(url("day1",-1100)),true);if(!ok(o))throw 0;Dd=o;try{localStorage.setItem(KD,JSON.stringify({ts:Date.now(),data:o}))}catch(e){}}catch(e){if(!Dd)failed=true}finally{loadingD=false}}
  async function loadM(){var c=readJSON(KM);if(c&&ok(c.data)){Dm=c.data;if(Date.now()-c.ts<TTL)return}
    if(loadingM)return;loadingM=true;try{var o=parse(await get(url("month1","2011-01-01")),false);if(!ok(o))throw 0;Dm=o;try{localStorage.setItem(KM,JSON.stringify({ts:Date.now(),data:o}))}catch(e){}}catch(e){}finally{loadingM=false}}
  function badge(){var b=$("freshLthRatio");if(!b)return;var t,c;
    if(Dd){var day=Dd.d[Dd.d.length-1],age=(Date.now()-Date.parse(day+"T00:00:00Z"))/864e5;if(age>3){t=(en()?"Stale · ":"滞后 · ")+day.slice(5);c="warn"}else{t=(en()?"Data date · ":"数据日 · ")+day.slice(5);c="good"}}
    else if(loadingD){t=en()?"Syncing":"同步中";c="warn"}else if(failed){t=en()?"Unavailable":"暂不可用";c="bad"}else{t=en()?"Waiting for data":"等待数据";c="warn"}
    b.textContent=t;b.className="fresh-badge "+c}
  function labels(){var E=en(),set=function(id,z,e){var x=$(id);if(x)x.textContent=E?e:z};
    set("lrNowL","当前比率","Current ratio");set("lrPeakL","本轮高点","Cycle high");set("lrOffL","距高点","From high");set("lrLegR","长/短期持仓比率","LTH / STH supply");set("lrLegP","BTC 价格","BTC price");
    document.querySelectorAll("[data-lr-range]").forEach(function(b){var on=+b.dataset.lrRange===range;b.setAttribute("aria-pressed",on?"true":"false");b.classList.toggle("active",on);if(E)b.textContent={365:"1Y",1095:"3Y",0:"All"}[b.dataset.lrRange]})}
  function render(){
    badge();labels();var empty=$("lrEmpty");
    if(!Dd){if(empty){empty.hidden=false;empty.textContent=loadingD?(en()?"Syncing…":"同步中…"):failed?(en()?"Unavailable":"暂不可用"):(en()?"Waiting for data":"等待数据")}return}
    if(empty)empty.hidden=true;
    var n=Dd.r.length,now=Dd.r[n-1],pk=0,pi=n-1;for(var i=Math.max(0,n-500);i<n;i++)if(Dd.r[i]>pk){pk=Dd.r[i];pi=i}
    $("lrNow").textContent=now.toFixed(2);
    $("lrPeak").innerHTML=pk.toFixed(2)+'<small>'+Dd.d[pi]+'</small>';
    var off=now/pk-1,o=$("lrOff");o.textContent=(off>=0?"+":"−")+Math.abs(off*100).toFixed(1)+"%";o.style.color=off<-.001?"var(--market-negative)":"";
    draw();
  }
  function draw(){
    var cv=$("lrCanvas");if(!cv||!Dd)return;var box=cv.parentElement,W=box.clientWidth,H=box.clientHeight;if(!W||!H)return;
    var src=range===0?(Dm||Dd):Dd;if(range===0&&!Dm)loadM().then(function(){if(range===0)draw()});
    var span=range===0?src.d.length:range,s0=Math.max(0,src.d.length-span),d=src.d.slice(s0),r=src.r.slice(s0),p=src.p.slice(s0),cnt=d.length,mon=range===0&&src===Dm;
    var dpr=Math.min(3,window.devicePixelRatio||1);cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);var c=cv.getContext("2d");c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,W,H);
    var padL=34,padR=48,padT=10,padB=22,pw=W-padL-padR,ph=H-padT-padB;
    var rmin=Infinity,rmax=0;r.forEach(function(x){rmin=Math.min(rmin,x);rmax=Math.max(rmax,x)});var pad=(rmax-rmin)*.08||.1;rmin-=pad;rmax+=pad;
    var pmin=Infinity,pmax=0;p.forEach(function(x){if(x>0){pmin=Math.min(pmin,x);pmax=Math.max(pmax,x)}});var lmin=Math.log(pmin*.92),lmax=Math.log(pmax*1.08);
    var X=function(i){return padL+(cnt>1?i/(cnt-1):0)*pw},Y=function(v){return padT+ph-(v-rmin)/(rmax-rmin)*ph},YP=function(v){return padT+ph-(Math.log(v)-lmin)/(lmax-lmin)*ph};
    var FONT=css("--font-sans","-apple-system,system-ui,sans-serif"),tx3=css("--text-tertiary","#888"),grid=css("--border-subtle","rgba(0,0,0,.08)"),brand=css("--brand","#f7931a");
    c.font="10px "+FONT;c.fillStyle=tx3;c.strokeStyle=grid;c.lineWidth=1;c.textAlign="right";c.textBaseline="middle";
    for(var g=0;g<=3;g++){var v=rmin+(rmax-rmin)*g/3,y=Math.round(Y(v))+.5;c.beginPath();c.moveTo(padL,y);c.lineTo(padL+pw,y);c.stroke();c.fillText(v.toFixed(1),padL-5,y)}
    c.textAlign="left";if(pmax>0){[pmin,Math.sqrt(pmin*pmax),pmax].forEach(function(x){c.fillText(x>=1e3?"$"+Math.round(x/1e3)+"K":"$"+Math.round(x),padL+pw+5,YP(x))})}
    c.textAlign="center";c.textBaseline="alphabetic";var last=-99,MN=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],yearly=range!==365;
    for(var i2=0;i2<cnt;i2++){var dd=d[i2];if(mon?dd.slice(5,7)!=="01":(yearly?dd.slice(5)!=="01-01":dd.slice(8)!=="01"))continue;var xx=X(i2);if(xx-last<40)continue;last=xx;
      c.fillText(yearly?dd.slice(0,4):(en()?MN[+dd.slice(5,7)-1]:(+dd.slice(5,7))+"月"),xx,H-6)}
    c.strokeStyle=css("--text-secondary","#555");c.globalAlpha=.65;c.lineWidth=1.3;c.lineJoin="round";c.beginPath();var st=false;
    for(i2=0;i2<cnt;i2++){if(!(p[i2]>0))continue;var py=YP(p[i2]);if(!st){c.moveTo(X(i2),py);st=true}else c.lineTo(X(i2),py)}c.stroke();c.globalAlpha=1;
    c.strokeStyle=brand;c.lineWidth=1.8;c.beginPath();for(i2=0;i2<cnt;i2++){var yy=Y(r[i2]);if(i2)c.lineTo(X(i2),yy);else c.moveTo(X(i2),yy)}c.stroke();
    var lv=$("lrLive");
    if(hover>=0&&hover<cnt){var hx=X(hover);c.strokeStyle=tx3;c.lineWidth=1;c.beginPath();c.moveTo(hx+.5,padT);c.lineTo(hx+.5,padT+ph);c.stroke();c.fillStyle=brand;c.beginPath();c.arc(hx,Y(r[hover]),3.5,0,Math.PI*2);c.fill();
      if(lv)lv.textContent=(mon?d[hover].slice(0,7):d[hover])+(en()?" · ratio ":" · 比率 ")+r[hover].toFixed(2)+" · $"+Math.round(p[hover]).toLocaleString("en-US")}
    else if(lv)lv.textContent="";
    map={padL:padL,pw:pw,cnt:cnt};
  }
  function init(){
    var sec=$("lthRatio");if(!sec)return;
    sec.addEventListener("click",function(e){var b=e.target.closest&&e.target.closest("[data-lr-range]");if(!b)return;range=+b.dataset.lrRange;hover=-1;render()});
    var cv=$("lrCanvas"),pick=function(ev){if(!Dd||!map)return;var rc=cv.getBoundingClientRect(),x=(ev.touches?ev.touches[0].clientX:ev.clientX)-rc.left;hover=Math.max(0,Math.min(map.cnt-1,Math.round((x-map.padL)/map.pw*(map.cnt-1))));draw()};
    cv.addEventListener("pointermove",pick);cv.addEventListener("pointerdown",pick);cv.addEventListener("pointerleave",function(){hover=-1;draw()});cv.addEventListener("touchend",function(){hover=-1;draw()},{passive:true});
    var started=false,go=function(){if(started)return;started=true;render();loadD(false).then(render)};
    if("IntersectionObserver" in window){var io=new IntersectionObserver(function(es){if(es.some(function(x){return x.isIntersecting})){io.disconnect();go()}},{rootMargin:"600px 0px"});io.observe(sec.closest("details")||sec)}else go();
    var rt=0;window.addEventListener("resize",function(){clearTimeout(rt);rt=setTimeout(function(){if(Dd)draw()},150)},{passive:true});
    window.addEventListener("themechange",function(){if(Dd)render()});
    if("ResizeObserver" in window)new ResizeObserver(function(){if(Dd)draw()}).observe(cv.parentElement);
    render();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
