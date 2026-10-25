
(function(){
  "use strict";
  // V26.8：长期持有者币龄销毁（Bitview lth_coindays_destroyed_sum_24h，按 UTC 日）+ BTC 价格
  var KEY="btc_lth_cdd_v1",TTL=6*3600*1000,API="https://bitview.space/api/series/bulk",SPAN=1100;
  var data=null,loading=false,failed=false,range=180,hover=-1;
  function $(id){return document.getElementById(id)}
  function en(){return window.BTC_LANG==="en"}
  function css(n,f){var v=getComputedStyle(document.documentElement).getPropertyValue(n).trim();return v||f}
  function zh(v){if(!(v>=0))return "--";if(v>=1e8)return (v/1e8).toFixed(2)+"亿";if(v>=1e4)return Math.round(v/1e4).toLocaleString("en-US")+"万";return Math.round(v).toLocaleString("en-US")}
  function cmp(v){if(!(v>=0))return "--";if(v>=1e9)return (v/1e9).toFixed(2)+"B";if(v>=1e6)return (v/1e6).toFixed(1)+"M";if(v>=1e3)return (v/1e3).toFixed(0)+"K";return Math.round(v)+""}
  function num(v){return en()?cmp(v):zh(v)}
  function usd(v){return v>=1e3?"$"+(v/1e3).toFixed(v>=1e5?0:1)+"K":"$"+Math.round(v)}
  function addDay(d,n){var t=new Date(d+"T00:00:00Z");t.setUTCDate(t.getUTCDate()+n);return t.toISOString().slice(0,10)}
  function valid(d){return d&&/^\d{4}-\d{2}-\d{2}$/.test(d.day0||"")&&Array.isArray(d.cdd)&&Array.isArray(d.px)&&d.cdd.length===d.px.length&&d.cdd.length>120}
  function readCache(){try{var c=JSON.parse(localStorage.getItem(KEY));if(c&&valid(c.data))return c}catch(e){}return null}
  function q95(a){var b=a.filter(function(v){return v>=0}).sort(function(x,y){return x-y});if(!b.length)return NaN;return b[Math.min(b.length-1,Math.floor(b.length*.95))]}
  function stats(){var n=data.cdd.length,last=n-1,yr=data.cdd.slice(Math.max(0,n-365));return {line:q95(yr),last:data.cdd[last],day:addDay(data.day0,last)}}
  function badge(){
    var b=$("freshLthCdd");if(!b)return;var t,c;
    if(data){var day=stats().day,age=(Date.now()-Date.parse(day+"T00:00:00Z"))/864e5;if(age>3){t=(en()?"Stale · ":"滞后 · ")+day.slice(5);c="warn"}else{t=(en()?"Data date · ":"数据日 · ")+day.slice(5);c="good"}}
    else if(loading){t=en()?"Syncing":"同步中";c="warn"}else if(failed){t=en()?"Unavailable":"暂不可用";c="bad"}else{t=en()?"Waiting for data":"等待数据";c="warn"}
    b.textContent=t;b.className="fresh-badge "+c;
  }
  function labels(){
    var E=en(),set=function(id,z,e){var x=$(id);if(x)x.textContent=E?e:z};
    set("cddLastLabel","最新一天","Latest day");set("cddLineLabel","异动线 · 近 1 年 95% 分位","Spike line · 1y 95th pct");
    set("cddLegCdd","每日币龄销毁","Daily coin-days destroyed");set("cddLegPx","BTC 价格","BTC price");set("cddLegLine","异动线","Spike line");set("cddLegHit","超过异动线","Above the line");
    document.querySelectorAll("[data-cdd-range]").forEach(function(b){b.setAttribute("aria-pressed",+b.dataset.cddRange===range?"true":"false");b.classList.toggle("active",+b.dataset.cddRange===range);if(E)b.textContent={90:"3M",180:"6M",365:"1Y",1095:"3Y"}[b.dataset.cddRange]});
  }
  function render(){
    badge();labels();
    var empty=$("cddEmpty"),cv=$("cddCanvas");if(!cv)return;
    if(!data){if(empty){empty.hidden=false;empty.textContent=loading?(en()?"Syncing…":"同步中…"):failed?(en()?"Unavailable":"暂不可用"):(en()?"Waiting for data":"等待数据")}var c0=cv.getContext("2d");c0.clearRect(0,0,cv.width,cv.height);return}
    if(empty)empty.hidden=true;
    var st=stats(),L=$("cddLast"),T=$("cddLine");if(L){L.textContent=num(st.last);L.classList.toggle("hot",st.last>=st.line)}if(T)T.textContent=num(st.line);
    draw(st);
  }
  function draw(st){
    var cv=$("cddCanvas"),box=cv.parentElement,W=box.clientWidth,H=box.clientHeight;if(!W||!H)return;
    var dpr=Math.min(3,window.devicePixelRatio||1);cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);
    var c=cv.getContext("2d");c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,W,H);
    var n=data.cdd.length,s0=Math.max(0,n-range),cdd=data.cdd.slice(s0),px=data.px.slice(s0),m=cdd.length;
    var padL=44,padR=48,padT=10,padB=22,pw=W-padL-padR,ph=H-padT-padB;
    var maxC=0;cdd.forEach(function(v){if(v>maxC)maxC=v});var srt=cdd.slice().sort(function(a,b){return a-b}),p98=srt[Math.floor(srt.length*.98)]||0;var cap=Math.max(st.line*2.4,p98*1.15);var clipped=maxC>cap*1.25;if(clipped)maxC=cap;maxC=Math.max(maxC,st.line)*1.08||1;
    var pmin=Infinity,pmax=0;px.forEach(function(v){if(v>0){pmin=Math.min(pmin,v);pmax=Math.max(pmax,v)}});var lmin=Math.log(pmin*.97),lmax=Math.log(pmax*1.03);
    var X=function(i){return padL+(m>1?i/(m-1):0)*pw},YC=function(v){return padT+ph-(Math.min(v,maxC)/maxC)*ph},YP=function(v){return padT+ph-(Math.log(v)-lmin)/(lmax-lmin)*ph};
    var FONT=css("--font-sans","-apple-system,system-ui,sans-serif"),tx3=css("--text-tertiary","#888"),grid=css("--border-subtle","rgba(0,0,0,.08)"),brand=css("--brand","#f7931a"),red=css("--market-negative","#e5484d");
    c.font="10px "+FONT;c.fillStyle=tx3;c.strokeStyle=grid;c.lineWidth=1;
    // 网格与左轴（币龄销毁）
    c.textAlign="right";c.textBaseline="middle";
    for(var g=0;g<=3;g++){var v=maxC/1.08*g/3,y=YC(v);c.beginPath();c.moveTo(padL,y+.5);c.lineTo(padL+pw,y+.5);c.stroke();c.fillText(num(v),padL-6,y)}
    // 右轴（价格，对数）
    c.textAlign="left";[pmin,Math.sqrt(pmin*pmax),pmax].forEach(function(v){c.fillText(usd(v),padL+pw+6,YP(v))});
    // 横轴日期
    c.textAlign="center";c.textBaseline="alphabetic";var lastLab=-99;
    for(var i=0;i<m;i++){var d=addDay(data.day0,s0+i);var mark=range>400?(d.slice(5)==="01-01"):(d.slice(8)==="01");if(!mark)continue;var x=X(i);if(x-lastLab<44)continue;lastLab=x;
      var lab=range>400?d.slice(0,4):(en()?["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+d.slice(5,7)-1]:(+d.slice(5,7))+"月");c.fillText(lab,x,H-6)}
    // 价格线（灰）
    c.strokeStyle=tx3;c.globalAlpha=.75;c.lineWidth=1.2;c.beginPath();var st0=false;
    for(i=0;i<m;i++){if(!(px[i]>0))continue;var y2=YP(px[i]);if(!st0){c.moveTo(X(i),y2);st0=true}else c.lineTo(X(i),y2)}c.stroke();c.globalAlpha=1;
    // 币龄销毁（橙色面积 + 线）
    c.beginPath();c.moveTo(X(0),YC(0));for(i=0;i<m;i++)c.lineTo(X(i),YC(Math.max(0,cdd[i])));c.lineTo(X(m-1),YC(0));c.closePath();
    c.fillStyle=brand;c.globalAlpha=.12;c.fill();c.globalAlpha=1;
    c.strokeStyle=brand;c.lineWidth=1.4;c.lineJoin="round";c.beginPath();for(i=0;i<m;i++){var yy=YC(Math.max(0,cdd[i]));if(i)c.lineTo(X(i),yy);else c.moveTo(X(i),yy)}c.stroke();
    // 异动线（红色虚线）
    var yl=YC(st.line);c.strokeStyle=red;c.lineWidth=1.2;c.setLineDash([5,4]);c.beginPath();c.moveTo(padL,yl);c.lineTo(padL+pw,yl);c.stroke();c.setLineDash([]);
    // 超过异动线：红圈（连续几天只圈最高的一天）
    c.lineWidth=1.8;c.strokeStyle=red;
    for(i=0;i<m;i++){if(!(cdd[i]>=st.line))continue;var a=i;while(i+1<m&&cdd[i+1]>=st.line)i++;var best=a;for(var k=a;k<=i;k++)if(cdd[k]>cdd[best])best=k;c.beginPath();c.arc(X(best),YC(cdd[best]),5,0,Math.PI*2);c.stroke();if(cdd[best]>maxC){var ax=X(best),ay=YC(cdd[best])-8;c.fillStyle=red;c.beginPath();c.moveTo(ax,ay-6);c.lineTo(ax-4,ay);c.lineTo(ax+4,ay);c.closePath();c.fill()}}
    // 按住时的读数
    var live=$("cddLive");
    if(hover>=0&&hover<m){var hx=X(hover);c.strokeStyle=tx3;c.lineWidth=1;c.beginPath();c.moveTo(hx+.5,padT);c.lineTo(hx+.5,padT+ph);c.stroke();
      c.fillStyle=brand;c.beginPath();c.arc(hx,YC(cdd[hover]),3.5,0,Math.PI*2);c.fill();
      if(live)live.textContent=addDay(data.day0,s0+hover)+" · "+num(cdd[hover])+(en()?" coin-days":" 币天")+" · "+(px[hover]>0?"$"+Math.round(px[hover]).toLocaleString("en-US"):"--")}
    else if(live)live.textContent="";
    draw.map={padL:padL,pw:pw,m:m};
  }
  async function bulk(name){
    var u=new URL(API);u.searchParams.set("index","day1");u.searchParams.set("series","date,"+name);u.searchParams.set("start",String(-SPAN));
    return typeof tryFetch==="function"?await tryFetch(u.toString(),20000):await (await fetch(u.toString())).json();
  }
  async function load(force){
    var c=readCache();if(c&&!data)data=c.data;
    if(!force&&c&&Date.now()-c.ts<TTL){render();return}
    if(loading)return;loading=true;failed=false;render();
    try{
      var r=await Promise.all([bulk("lth_coindays_destroyed_sum_24h"),bulk("price")]);
      var dates=r[0]&&r[0][0]&&r[0][0].data,cdd=r[0]&&r[0][1]&&r[0][1].data,pd=r[1]&&r[1][0]&&r[1][0].data,pv=r[1]&&r[1][1]&&r[1][1].data;
      if(!Array.isArray(dates)||!Array.isArray(cdd)||dates.length!==cdd.length)throw new Error("bad cdd");
      var pm={};if(Array.isArray(pd)&&Array.isArray(pv))pd.forEach(function(d,i){pm[d]=+pv[i]});
      // 最后一天还没走完（当天 UTC），不计入
      var today=new Date().toISOString().slice(0,10),end=dates.length;while(end>0&&dates[end-1]>=today)end--;
      var d={day0:dates[0],cdd:cdd.slice(0,end).map(function(v){return +v>=0?+v:0}),px:dates.slice(0,end).map(function(x){return pm[x]>0?pm[x]:0})};
      if(!valid(d))throw new Error("bad cdd");
      data=d;try{localStorage.setItem(KEY,JSON.stringify({ts:Date.now(),data:d}))}catch(e){}
    }catch(e){if(!data)failed=true}
    finally{loading=false;render()}
  }
  function init(){
    var sec=$("lthCdd");if(!sec)return;
    sec.addEventListener("click",function(e){var b=e.target.closest&&e.target.closest("[data-cdd-range]");if(!b)return;range=+b.dataset.cddRange;hover=-1;render()});
    var cv=$("cddCanvas");
    var pick=function(ev){if(!data||!draw.map)return;var r=cv.getBoundingClientRect(),x=(ev.touches?ev.touches[0].clientX:ev.clientX)-r.left,mm=draw.map;var i=Math.round((x-mm.padL)/mm.pw*(mm.m-1));hover=Math.max(0,Math.min(mm.m-1,i));draw(stats())};
    var clear=function(){hover=-1;if(data)draw(stats())};
    cv.addEventListener("pointermove",pick);cv.addEventListener("pointerdown",pick);cv.addEventListener("pointerleave",clear);cv.addEventListener("touchend",clear,{passive:true});
    var started=false,go=function(){if(started)return;started=true;load(false)};
    if("IntersectionObserver" in window){var io=new IntersectionObserver(function(es){if(es.some(function(x){return x.isIntersecting})){io.disconnect();go()}},{rootMargin:"600px 0px"});io.observe(sec)}else go();
    if(typeof window.refreshLthPulse==="function"){var orig=window.refreshLthPulse;window.refreshLthPulse=function(f){if(f)load(true);return orig.apply(this,arguments)}}
    var rt=0;window.addEventListener("resize",function(){clearTimeout(rt);rt=setTimeout(function(){if(data)render()},150)},{passive:true});
    window.addEventListener("themechange",function(){if(data)render()});
    if("ResizeObserver" in window){new ResizeObserver(function(){if(data)render()}).observe(cv.parentElement)}
    render();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
