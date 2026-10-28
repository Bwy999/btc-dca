
(function(){
  "use strict";
  // V27.4：长期持有者每月持仓变化（Bitview lth_supply_delta_1m，按月：每月最后一天的 30 天净变化；当月为最近 30 天）
  var KEY="btc_lth_monthly_v1",TTL=6*3600*1000,API="https://bitview.space/api/series/bulk";
  // 3 月 / 1 年：按天显示（每天的 30 天净变化）；3 年 / 5 年 / 全部：按月显示
  var data=null,loading=false,failed=false,range=66,hover=-1,map=null,daily=null,dLoading=false,dFailed=false,DKEY="btc_lth_daily_v1";
  function $(id){return document.getElementById(id)}
  function en(){return window.BTC_LANG==="en"}
  function css(n,f){var v=getComputedStyle(document.documentElement).getPropertyValue(n).trim();return v||f}
  function fmt(v,sign){if(!isFinite(v))return "--";var a=Math.abs(v),t;
    if(en())t=a>=1e6?(a/1e6).toFixed(2)+"M":a>=1e3?(a/1e3).toFixed(a>=1e5?0:1)+"K":Math.round(a)+"";
    else t=a>=1e4?(a/1e4).toFixed(a>=1e6?0:1)+"万":Math.round(a).toLocaleString("en-US");
    t=t.replace(/\.0(?=万|K|M)/,"");return (sign?(v>0?"+":v<0?"−":""):(v<0?"−":""))+t}
  function usd(v){return v>=1e3?"$"+(v/1e3).toFixed(v>=1e5?0:1)+"K":"$"+Math.round(v)}
  function valid(d){return d&&Array.isArray(d.m)&&Array.isArray(d.v)&&Array.isArray(d.p)&&d.m.length===d.v.length&&d.m.length>24}
  function readCache(){try{var c=JSON.parse(localStorage.getItem(KEY));if(c&&valid(c.data))return c}catch(e){}return null}
  function badge(){var b=$("freshLthMonthly");if(!b)return;var t,c;
    if(data){var d=data.day||"",age=d?(Date.now()-Date.parse(d+"T00:00:00Z"))/864e5:0;if(d&&age>3){t=(en()?"Stale · ":"滞后 · ")+d.slice(5);c="warn"}else{t=(en()?"Data date · ":"数据日 · ")+(d?d.slice(5):data.m[data.m.length-1].slice(2,7));c="good"}}
    else if(loading){t=en()?"Syncing":"同步中";c="warn"}else if(failed){t=en()?"Unavailable":"暂不可用";c="bad"}else{t=en()?"Waiting for data":"等待数据";c="warn"}
    b.textContent=t;b.className="fresh-badge "+c}
  function labels(){var E=en(),set=function(id,z,e){var x=$(id);if(x)x.textContent=E?e:z};
    set("mchgNowLabel","最近 30 天","Last 30 days");set("mchgPrevLabel","上月","Last month");set("mchgYearLabel","近 12 个月合计","Past 12 months");
    set("mchgLegAdd","增持","Added");set("mchgLegCut","减持","Reduced");set("mchgLegPx","BTC 价格","BTC price");
    document.querySelectorAll("[data-mchg-range]").forEach(function(b){var on=+b.dataset.mchgRange===range;b.setAttribute("aria-pressed",on?"true":"false");b.classList.toggle("active",on);if(E)b.textContent={"-90":"3M","-365":"1Y",36:"3Y",66:"5Y",999:"All"}[b.dataset.mchgRange]})}
  function kpi(id,v){var e=$(id);if(!e)return;e.innerHTML=isFinite(v)?fmt(v,true)+'<span class="mchg-u">BTC</span>':"--";e.classList.toggle("up",v>0);e.classList.toggle("dn",v<0)}
  function render(){
    badge();labels();var cv=$("mchgCanvas"),empty=$("mchgEmpty");if(!cv)return;
    if(!data){if(empty){empty.hidden=false;empty.textContent=loading?(en()?"Syncing…":"同步中…"):failed?(en()?"Unavailable":"暂不可用"):(en()?"Waiting for data":"等待数据")}return}
    if(empty)empty.hidden=true;
    var n=data.v.length;kpi("mchgNow",data.v[n-1]);kpi("mchgPrev",data.v[n-2]);
    var y=0;for(var i=Math.max(0,n-12);i<n;i++)y+=data.v[i]||0;
    // 近 12 个月合计 = 12 个完整月的月末 30 天变化之和（约等于一年的净变化）
    kpi("mchgYear",y);draw();
  }
  function draw(){
    var cv=$("mchgCanvas"),box=cv.parentElement,W=box.clientWidth,H=box.clientHeight;if(!W||!H||!data)return;
    var dpr=Math.min(3,window.devicePixelRatio||1);cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);
    var c=cv.getContext("2d");c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,W,H);
    var dly=range<0,src=dly?daily:data;
    if(dly&&!src){loadDaily();src=daily;if(!src){var lv=$("mchgLive");if(lv)lv.textContent=dFailed?(en()?"Daily data unavailable":"日度数据暂不可用"):(en()?"Loading daily data…":"正在读取日度数据…");return}}
    var span=dly?-range:range,N=src.v.length,s0=Math.max(0,N-span),v=src.v.slice(s0),p=src.p.slice(s0),m=src.m.slice(s0),cnt=v.length;
    var padL=46,padR=48,padT=10,padB=22,pw=W-padL-padR,ph=H-padT-padB;
    var mx=0;v.forEach(function(x){if(isFinite(x))mx=Math.max(mx,Math.abs(x))});
    // 整齐的刻度：每格 1 / 1.5 / 2 / 2.5 / 3 / 4 / 5 / 6 / 8 × 10ⁿ，上下各两格
    var raw=(mx||1)/2,mag=Math.pow(10,Math.floor(Math.log10(raw))),f=raw/mag,step=[1,1.5,2,2.5,3,4,5,6,8,10].find(function(x){return f<=x})*mag;mx=step*2*1.04;
    var pmin=Infinity,pmax=0;p.forEach(function(x){if(x>0){pmin=Math.min(pmin,x);pmax=Math.max(pmax,x)}});var lmin=Math.log(pmin*.9),lmax=Math.log(pmax*1.1);
    var bw=pw/cnt,X=function(i){return padL+i*bw},Y=function(x){return padT+ph/2-(x/mx)*(ph/2)},YP=function(x){return padT+ph-(Math.log(x)-lmin)/(lmax-lmin)*ph};
    var FONT=css("--font-sans","-apple-system,system-ui,sans-serif"),tx3=css("--text-tertiary","#888"),grid=css("--border-subtle","rgba(0,0,0,.08)"),up=css("--market-positive","#18a058"),dn=css("--market-negative","#e5484d");
    c.font="10px "+FONT;c.fillStyle=tx3;c.strokeStyle=grid;c.lineWidth=1;c.textAlign="right";c.textBaseline="middle";
    [-2,-1,0,1,2].forEach(function(g){var val=step*g,yy=Y(val);c.beginPath();c.moveTo(padL,Math.round(yy)+.5);c.lineTo(padL+pw,Math.round(yy)+.5);c.stroke();c.fillText(fmt(val,false),padL-6,yy)});
    c.textAlign="left";if(pmax>0)[pmin,Math.sqrt(pmin*pmax),pmax].forEach(function(x){c.fillText(usd(x),padL+pw+6,YP(x))});
    c.textAlign="center";c.textBaseline="alphabetic";var last=-99;
    var MN=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    for(var i=0;i<cnt;i++){
      if(dly){if(m[i].slice(8,10)!=="01")continue}else if(m[i].slice(5,7)!=="01")continue;
      var xx=X(i)+bw/2;if(xx-last<40)continue;last=xx;
      c.fillText(dly?(en()?MN[+m[i].slice(5,7)-1]:(+m[i].slice(5,7))+"月"):m[i].slice(0,4),xx,H-6)}
    // 柱：增持绿、减持红
    var gap=bw>6?1:bw>3?.5:0;
    for(i=0;i<cnt;i++){var val2=v[i];if(!isFinite(val2)||!val2)continue;var y0=Y(0),y1=Y(val2),col=val2>0?up:dn;
      c.globalAlpha=hover===i?1:.78;c.fillStyle=col;c.fillRect(X(i)+gap/2,Math.min(y0,y1),Math.max(1,bw-gap),Math.abs(y1-y0))}
    c.globalAlpha=1;
    // 零线
    c.strokeStyle=tx3;c.globalAlpha=.6;c.beginPath();c.moveTo(padL,Math.round(Y(0))+.5);c.lineTo(padL+pw,Math.round(Y(0))+.5);c.stroke();c.globalAlpha=1;
    // 价格线
    c.strokeStyle=css("--text-secondary","#555");c.globalAlpha=.7;c.lineWidth=1.4;c.lineJoin="round";c.beginPath();var st=false;
    for(i=0;i<cnt;i++){if(!(p[i]>0))continue;var px=X(i)+bw/2,py=YP(p[i]);if(!st){c.moveTo(px,py);st=true}else c.lineTo(px,py)}c.stroke();c.globalAlpha=1;
    var live=$("mchgLive");
    if(hover>=0&&hover<cnt){if(live)live.textContent=(dly?m[hover]+(en()?" · 30-day ":" · 30 天 "):m[hover].slice(0,7)+" · ")+fmt(v[hover],true)+" BTC · "+(p[hover]>0?"$"+Math.round(p[hover]).toLocaleString("en-US"):"--")}else if(live)live.textContent="";
    map={padL:padL,bw:bw,cnt:cnt};
  }
  function loadDaily(){
    if(dLoading||daily)return;
    try{var c=JSON.parse(localStorage.getItem(DKEY));if(c&&valid(c.data)){daily=c.data;if(Date.now()-c.ts<TTL){draw();return}}}catch(e){}
    dLoading=true;dFailed=false;
    var u=function(name){var x=new URL(API);x.searchParams.set("index","day1");x.searchParams.set("series","date,"+name);x.searchParams.set("start","-400");return x.toString()};
    var get=function(url){return typeof tryFetch==="function"?tryFetch(url,20000):fetch(url).then(function(r){return r.json()})};
    Promise.all([get(u("lth_supply_delta_1m")),get(u("price"))]).then(function(r){
      var dm=r[0][0].data,dv=r[0][1].data,pm=r[1][0].data,pv=r[1][1].data,P={},today=new Date().toISOString().slice(0,10);pm.forEach(function(d,i){P[d]=+pv[i]});
      var d={m:[],v:[],p:[]};dm.forEach(function(x,i){var val=dv[i];if(x>=today||val==null||!isFinite(+val))return;d.m.push(x);d.v.push(+val);d.p.push(P[x]||0)});
      if(!valid(d))throw new Error("bad daily");daily=d;try{localStorage.setItem(DKEY,JSON.stringify({ts:Date.now(),data:d}))}catch(e){}
    }).catch(function(){if(!daily)dFailed=true}).then(function(){dLoading=false;draw()});
  }
  async function bulk(name){var u=new URL(API);u.searchParams.set("index","month1");u.searchParams.set("series","date,"+name);u.searchParams.set("start","0");
    return typeof tryFetch==="function"?await tryFetch(u.toString(),20000):await (await fetch(u.toString())).json()}
  async function load(force){
    var c=readCache();if(c&&!data)data=c.data;
    if(!force&&c&&Date.now()-c.ts<TTL){render();return}
    if(loading)return;loading=true;failed=false;render();
    try{
      var r=await Promise.all([bulk("lth_supply_delta_1m"),bulk("price")]);
      var dm=r[0][0].data,dv=r[0][1].data,pm=r[1][0].data,pv=r[1][1].data,P={};pm.forEach(function(d,i){P[d]=+pv[i]});
      var d={m:[],v:[],p:[],day:String(r[0][1].stamp||"").slice(0,10)};
      dm.forEach(function(x,i){var val=dv[i];if(val==null||!isFinite(+val))return;d.m.push(x);d.v.push(+val);d.p.push(P[x]||0)});
      if(!valid(d))throw new Error("bad lth monthly");
      data=d;try{localStorage.setItem(KEY,JSON.stringify({ts:Date.now(),data:d}))}catch(e){}
    }catch(e){if(!data)failed=true}
    finally{loading=false;render()}
  }
  function init(){
    var sec=$("lthMonthly");if(!sec)return;
    sec.addEventListener("click",function(e){var b=e.target.closest&&e.target.closest("[data-mchg-range]");if(!b)return;range=+b.dataset.mchgRange;hover=-1;render()});
    var cv=$("mchgCanvas");
    var pick=function(ev){if(!data||!map)return;var r=cv.getBoundingClientRect(),x=(ev.touches?ev.touches[0].clientX:ev.clientX)-r.left;hover=Math.max(0,Math.min(map.cnt-1,Math.floor((x-map.padL)/map.bw)));draw()};
    var clear=function(){hover=-1;if(data)draw()};
    cv.addEventListener("pointermove",pick);cv.addEventListener("pointerdown",pick);cv.addEventListener("pointerleave",clear);cv.addEventListener("touchend",clear,{passive:true});
    var started=false,go=function(){if(started)return;started=true;load(false)};
    if("IntersectionObserver" in window){var io=new IntersectionObserver(function(es){if(es.some(function(x){return x.isIntersecting})){io.disconnect();go()}},{rootMargin:"600px 0px"});io.observe(sec.closest("details")||sec)}else go();
    var rt=0;window.addEventListener("resize",function(){clearTimeout(rt);rt=setTimeout(function(){if(data)render()},150)},{passive:true});
    window.addEventListener("themechange",function(){if(data)render()});
    if("ResizeObserver" in window){new ResizeObserver(function(){if(data)draw()}).observe(cv.parentElement)}
    render();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
