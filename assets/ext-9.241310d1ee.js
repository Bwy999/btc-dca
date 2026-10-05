
(function(){
  "use strict";
  // V26.0.11：长期持有者 NUPL 历史图表。数据：Bitview lth_nupl + price（2011 年起），本机缓存 6 小时。
  var KEY="btc_bitview_lth_nupl_v1",TTL=6*3600*1000,data=null,range=0,loading=false,hover=-1,inited=false;
  function $(id){return document.getElementById(id)}
  function css(n,f){var v=getComputedStyle(document.documentElement).getPropertyValue(n).trim();return v||f}
  function col(raw,name,idx){try{return pickSeries(raw,name,idx)}catch(e){return null}}
  async function series(name){
    var raw=await tryFetch(bitviewBulkUrl(["date",name],"2011-01-01"),15000),d=col(raw,"date",0),v=col(raw,name,1);
    if(!Array.isArray(d)||!Array.isArray(v))throw new Error("no "+name);
    var m={};for(var i=0;i<Math.min(d.length,v.length);i++){var x=+v[i];if(/^\d{4}-\d{2}-\d{2}$/.test(String(d[i]))&&Number.isFinite(x))m[d[i]]=x}
    return m;
  }
  async function load(force){
    if(loading)return;var c=null;try{c=JSON.parse(localStorage.getItem(KEY)||"null")}catch(e){}
    if(c&&Array.isArray(c.rows)&&c.rows.length){data=c.rows;draw()}
    if(!force&&c&&Date.now()-c.ts<TTL)return;
    loading=true;
    try{
      var res=await Promise.all([series("lth_nupl"),series("price")]),n=res[0],p=res[1];
      var rows=Object.keys(n).filter(function(d){return p[d]>0&&n[d]>-1&&n[d]<1}).sort().map(function(d){return[d,+n[d].toFixed(4),+p[d].toPrecision(7)]});
      if(rows.length>100){data=rows;try{localStorage.setItem(KEY,JSON.stringify({ts:Date.now(),rows:rows}))}catch(e){}}
    }catch(e){if(!data){var em=$("nuplEmpty");if(em)em.textContent="历史暂不可用。点按「更新」重试。"}}
    finally{loading=false;draw()}
  }
  function view(){if(!data)return[];if(!range)return data;var cut=new Date(Date.now()-range*864e5).toISOString().slice(0,10);return data.filter(function(r){return r[0]>=cut})}
  function draw(){
    var cv=$("nuplChart"),shell=$("nuplShell"),em=$("nuplEmpty");if(!cv||!shell)return;
    var rows=view();if(rows.length<2){if(em)em.hidden=false;return}if(em)em.hidden=true;
    var w=Math.max(260,shell.clientWidth),h=Math.max(200,shell.clientHeight),dpr=Math.min(2,window.devicePixelRatio||1);
    cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr);var ctx=cv.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    var L=40,R=52,T=10,B=24,PW=w-L-R,PH=h-T-B;
    var vals=rows.map(function(r){return r[1]}),lo=Math.min(-.3,Math.floor(Math.min.apply(null,vals)*10)/10),hi=Math.max(.6,Math.ceil(Math.max.apply(null,vals)*10)/10);
    var pr=rows.map(function(r){return r[2]}),plo=Math.log10(Math.min.apply(null,pr)),phi=Math.log10(Math.max.apply(null,pr));if(phi-plo<.2){plo-=.1;phi+=.1}
    var X=function(i){return L+i/(rows.length-1)*PW},Y=function(v){return T+(1-(v-lo)/(hi-lo))*PH},YP=function(p){return T+(1-(Math.log10(p)-plo)/(phi-plo))*PH};
    var tert=css("--text-tertiary","#8a8a93"),grid=css("--border-subtle","rgba(0,0,0,.08)");
    ctx.font="11px -apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif";ctx.textBaseline="middle";
    // 左轴网格
    var step=(hi-lo)>1.2?.4:.2;ctx.lineWidth=1;
    for(var v=Math.ceil(lo/step)*step;v<=hi+1e-9;v+=step){var y=Math.round(Y(v))+.5;ctx.strokeStyle=grid;ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(L,y);ctx.lineTo(w-R,y);ctx.stroke();ctx.fillStyle=tert;ctx.textAlign="right";ctx.fillText(v.toFixed(1).replace("-","−"),L-6,y)}
    // 分界线：0 盈亏线、0.5 利润丰厚
    [[0,css("--text-secondary","#666"),.55],[.5,css("--market-positive","#0a9d58"),.6],[-.3,css("--market-negative","#dc4b32"),.6]].forEach(function(t){if(t[0]<lo||t[0]>hi)return;var y=Math.round(Y(t[0]))+.5;ctx.globalAlpha=t[2];ctx.strokeStyle=t[1];ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(L,y);ctx.lineTo(w-R,y);ctx.stroke();ctx.globalAlpha=1});ctx.setLineDash([]);
    // 右轴价格刻度
    ctx.textAlign="left";var lastY=1e9,fmtP=function(p){return p>=1e3?"$"+(+(p/1e3).toPrecision(3))+"K":"$"+(+p.toPrecision(2))};
    for(var k=Math.floor(plo);k<=Math.ceil(phi);k++){[1,3].forEach(function(m){var p=m*Math.pow(10,k),lp=Math.log10(p);if(lp<plo||lp>phi)return;var y=YP(p);if(Math.abs(lastY-y)<14)return;lastY=y;ctx.fillStyle=tert;ctx.fillText(fmtP(p),w-R+6,y)})}
    // 价格线
    ctx.strokeStyle="rgba(142,142,150,.75)";ctx.lineWidth=1.2;ctx.beginPath();rows.forEach(function(r,i){var x=X(i),y=YP(r[2]);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke();
    // NUPL 线
    ctx.strokeStyle="#e8973a";ctx.lineWidth=1.75;ctx.lineJoin="round";ctx.beginPath();rows.forEach(function(r,i){var x=X(i),y=Y(r[1]);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke();
    // 横轴年份
    ctx.fillStyle=tert;ctx.textBaseline="alphabetic";[0,.5,1].forEach(function(f){var i=Math.round(f*(rows.length-1));ctx.textAlign=f===0?"left":f===1?"right":"center";ctx.fillText(range&&range<=365?rows[i][0].slice(0,7):rows[i][0].slice(0,4),X(i),h-6)});
    // 按住查看
    var tip=$("nuplTip");
    if(hover>=0&&hover<rows.length){var r=rows[hover],x=X(hover);ctx.strokeStyle=css("--text-primary","#111");ctx.globalAlpha=.35;ctx.beginPath();ctx.moveTo(x,T);ctx.lineTo(x,T+PH);ctx.stroke();ctx.globalAlpha=1;
      ctx.fillStyle="#e8973a";ctx.beginPath();ctx.arc(x,Y(r[1]),3.5,0,Math.PI*2);ctx.fill();
      tip.innerHTML=r[0]+"<b>NUPL "+r[1].toFixed(3)+"</b>BTC $"+Math.round(r[2]).toLocaleString("en-US");tip.classList.add("on");tip.style.left=Math.max(4,Math.min(w-128,x-60))+"px"}
    else if(tip)tip.classList.remove("on");
    cv._rows=rows;cv._geom={L:L,PW:PW};
  }
  function bind(){
    var sec=$("lthNupl");if(!sec)return;
    sec.querySelectorAll("[data-nupl-range]").forEach(function(b){b.addEventListener("click",function(){range=+b.dataset.nuplRange;sec.querySelectorAll("[data-nupl-range]").forEach(function(x){var on=x===b;x.classList.toggle("active",on);x.setAttribute("aria-pressed",on?"true":"false")});hover=-1;draw()})});
    var cv=$("nuplChart");
    var move=function(e){var g=cv._geom,rows=cv._rows;if(!g||!rows)return;var rect=cv.getBoundingClientRect(),f=(e.clientX-rect.left-g.L)/g.PW;hover=Math.max(0,Math.min(rows.length-1,Math.round(f*(rows.length-1))));draw()};
    cv.addEventListener("pointerdown",move);cv.addEventListener("pointermove",function(e){if(e.pointerType==="mouse"||e.buttons)move(e)});
    ["pointerup","pointerleave","pointercancel"].forEach(function(t){cv.addEventListener(t,function(){hover=-1;draw()})});
    var rt=0;window.addEventListener("resize",function(){clearTimeout(rt);rt=setTimeout(draw,120)},{passive:true});
    window.addEventListener("themechange",draw);
  }
  function init(){if(inited)return;inited=true;bind();load(false)}
  window.refreshLthNuplChart=function(){return load(true)};
  // 「长期持有者」模块标题栏的「更新」同时更新本图表
  if(typeof window.refreshLthPsil==="function"){var _rp=window.refreshLthPsil;window.refreshLthPsil=function(){var r=_rp.apply(this,arguments);if(arguments[0])load(true);return r}}
  if(typeof lazySection==="function")lazySection("lthNupl",init);else init();
  document.addEventListener("toggle",function(e){if(e.target&&e.target.open&&e.target.querySelector&&e.target.querySelector("#lthNupl"))setTimeout(draw,60)},true);
})();
