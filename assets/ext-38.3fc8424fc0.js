
(function(){
  "use strict";
  // V27.9：各币龄的持币成本——按持有时间分 6 组：持币量、平均成本（实现市值 ÷ 持币量）、盈利占比；点一组看它的成本分布（URPD）
  var KEY="btc_age_cost_v1",TTL=6*3600*1000,API="https://bitview.space/api/series/bulk";
  var G=[
    {k:"m1",zh:"1 个月内",en:"< 1 month",b:["under_1h","1h_to_1d","1d_to_1w","1w_to_1m"]},
    {k:"m6",zh:"1–6 个月",en:"1–6 months",b:["1m_to_2m","2m_to_3m","3m_to_4m","4m_to_5m","5m_to_6m"]},
    {k:"y1",zh:"6–12 个月",en:"6–12 months",b:["6m_to_9m","9m_to_1y"]},
    {k:"y2",zh:"1–2 年",en:"1–2 years",b:["1y_to_18m","18m_to_2y"]},
    {k:"y5",zh:"2–5 年",en:"2–5 years",b:["2y_to_3y","3y_to_4y","4y_to_5y"]},
    {k:"old",zh:"5 年以上",en:"5+ years",b:["5y_to_6y","6y_to_7y","7y_to_8y","8y_to_10y","10y_to_12y","12y_to_15y","over_15y"]}
  ];
  var BANDS=[].concat.apply([],G.map(function(g){return g.b}));
  var D=null,sel="m6",dist={},hover=-1,map=null,loading=false,failed=false;
  function $(id){return document.getElementById(id)}
  function en(){return window.BTC_LANG==="en"}
  function css(n,f){var v=getComputedStyle(document.documentElement).getPropertyValue(n).trim();return v||f}
  function get(u){return typeof tryFetch==="function"?tryFetch(u,25000):fetch(u).then(function(r){return r.json()})}
  function usd(v){return !(v>0)?"--":v>=1e3?"$"+(v/1e3).toFixed(v>=1e5?0:1)+"K":"$"+Math.round(v)}
  function btc(v){return !(v>=0)?"--":en()?(v>=1e6?(v/1e6).toFixed(2)+"M":v>=1e3?(v/1e3).toFixed(0)+"K":Math.round(v)):(v>=1e4?(v/1e4).toFixed(v>=1e6?0:1)+"万":Math.round(v).toLocaleString("en-US"))}
  async function cols(suffix){var u=new URL(API);u.searchParams.set("index","day1");u.searchParams.set("series",["date"].concat(BANDS.map(function(b){return "age_"+b+"_"+suffix})).join(","));u.searchParams.set("start","-1");
    var r=await get(u.toString()),o={day:r[0].data[r[0].data.length-1]};BANDS.forEach(function(b,i){var a=r[i+1].data;o[b]=+a[a.length-1]});return o}
  async function load(){
    try{var c=JSON.parse(localStorage.getItem(KEY));if(c&&c.D){D=c.D;if(Date.now()-c.ts<TTL){render();return}}}catch(e){}
    if(loading)return;loading=true;render();
    try{var s=await cols("supply"),rc=await cols("realized_cap"),pf=await cols("supply_in_profit");
      var rows=G.map(function(g){var sp=0,cap=0,pr=0;g.b.forEach(function(b){sp+=s[b]||0;cap+=rc[b]||0;pr+=pf[b]||0});return {k:g.k,supply:sp,avg:sp>0?cap/sp:null,profit:sp>0?pr/sp:null}});
      var tot=rows.reduce(function(a,r){return a+r.supply},0);if(!(tot>15e6&&tot<22e6))throw 0;
      D={day:s.day,rows:rows};failed=false;try{localStorage.setItem(KEY,JSON.stringify({ts:Date.now(),D:D}))}catch(e){}
    }catch(e){if(!D)failed=true}
    finally{loading=false;render();loadDist(sel)}
  }
  async function urpd(band){
    // 新版队列名 age_*；旧版 utxos_*_old
    var tries=["age_"+band,"utxos_"+band+"_old"];
    for(var i=0;i<tries.length;i++){try{var j=await get("https://bitview.space/api/urpd/"+tries[i]+"?agg=lin1000");if(j&&j.buckets)return j}catch(e){}}
    throw new Error("urpd "+band);
  }
  async function loadDist(k){
    if(dist[k])return draw();var g=G.find(function(x){return x.k===k});if(!g)return;
    var em=$("acEmpty");if(em){em.hidden=false;em.textContent=en()?"Syncing…":"同步中…"}
    try{var parts=await Promise.all(g.b.map(urpd)),acc={},close=0;
      parts.forEach(function(j){close=+j.close||close;(j.buckets||[]).forEach(function(r){var f=Math.round(+r.price_floor);acc[f]=(acc[f]||0)+(+r.supply||0)})});
      var keys=Object.keys(acc).map(Number).sort(function(a,b){return a-b});dist[k]={x:keys,y:keys.map(function(x){return acc[x]}),close:close};
      if(em)em.hidden=true;
    }catch(e){if(em){em.hidden=false;em.textContent=en()?"Unavailable":"暂不可用"}}
    draw();
  }
  function badge(){var b=$("freshAgeCost");if(!b)return;var t,c;
    if(D&&D.day){var age=(Date.now()-Date.parse(D.day+"T00:00:00Z"))/864e5;t=(age>3?(en()?"Stale · ":"滞后 · "):(en()?"Data date · ":"数据日 · "))+D.day.slice(5);c=age>3?"warn":"good"}
    else if(loading){t=en()?"Syncing":"同步中";c="warn"}else if(failed){t=en()?"Unavailable":"暂不可用";c="bad"}else{t=en()?"Waiting for data":"等待数据";c="warn"}
    b.textContent=t;b.className="fresh-badge "+c}
  function render(){
    badge();var E=en(),box=$("acTable");if(!box)return;
    if(!D){box.innerHTML='<div class="hd-empty">'+(loading?(E?"Syncing…":"同步中…"):failed?(E?"Unavailable":"暂不可用"):(E?"Waiting for data":"等待数据"))+'</div>';$("acDetail").hidden=true;return}
    var px=(typeof S!=="undefined"&&S&&S.price>0)?S.price:null,tot=D.rows.reduce(function(a,r){return a+r.supply},0);
    box.innerHTML='<div class="ac-row ac-head"><span>'+(E?"Held for":"持有时间")+'</span><span>'+(E?"Coins":"持币量")+'</span><span>'+(E?"Avg cost":"平均成本")+'</span><span>'+(E?"In profit":"盈利占比")+'</span></div>'
      +D.rows.map(function(r,i){var g=G[i],gap=px&&r.avg?px/r.avg-1:null;
        return '<button type="button" class="ac-row'+(r.k===sel?' on':'')+'" data-ac="'+r.k+'"><b>'+(E?g.en:g.zh)+'</b><span>'+btc(r.supply)+'<em>'+(tot>0?(r.supply/tot*100).toFixed(1)+"%":"")+'</em></span><span>'+usd(r.avg)+(gap==null?'':'<em class="'+(gap>=0?'up':'dn')+'">'+(E?"price ":"现价 ")+(gap>=0?"+":"−")+Math.abs(gap*100).toFixed(0)+'%</em>')+'</span><span class="'+(r.profit>=.5?'up':'dn')+'">'+(r.profit==null?"--":Math.round(r.profit*100)+"%")+'</span></button>'}).join("");
    $("acDetail").hidden=false;draw();
  }
  function draw(){
    var g=G.find(function(x){return x.k===sel}),r=D&&D.rows.find(function(x){return x.k===sel}),E=en();if(!g||!r)return;
    $("acDetName").textContent=(E?g.en:g.zh)+(E?" · cost distribution":" · 成本分布");
    $("acDetSub").textContent=(E?"avg cost ":"平均成本 ")+usd(r.avg)+(r.profit==null?"":(E?" · ":" · ")+Math.round(r.profit*100)+(E?"% in profit":"% 盈利"));
    var cv=$("acCanvas"),d=dist[sel];if(!cv)return;var box=cv.parentElement,W=box.clientWidth,H=box.clientHeight;if(!W||!H)return;
    var dpr=Math.min(3,window.devicePixelRatio||1);cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);var c=cv.getContext("2d");c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,W,H);if(!d)return;
    var px=(typeof S!=="undefined"&&S&&S.price>0)?S.price:d.close,xmax=Math.max(px*1.6,d.x.filter(function(x,i){return d.y[i]>0}).slice(-1)[0]||0);xmax=Math.min(xmax,Math.max(px*2.2,130000));
    var pts=d.x.map(function(x,i){return [x,d.y[i]]}).filter(function(p){return p[0]<=xmax}),ymax=0;pts.forEach(function(p){ymax=Math.max(ymax,p[1])});ymax=ymax*1.1||1;
    var padL=40,padR=8,padT=8,padB=20,pw=W-padL-padR,ph=H-padT-padB,X=function(v){return padL+v/xmax*pw},Y=function(v){return padT+ph-v/ymax*ph};
    var FONT=css("--font-sans","-apple-system,system-ui,sans-serif"),tx3=css("--text-tertiary","#888"),grid=css("--border-subtle","rgba(0,0,0,.08)"),up=css("--market-positive","#18a058"),dn=css("--market-negative","#e5484d"),ink=css("--text-primary","#111");
    c.font="10px "+FONT;c.fillStyle=tx3;c.strokeStyle=grid;c.lineWidth=1;c.textAlign="right";c.textBaseline="middle";
    for(var q=0;q<=2;q++){var vv=ymax/1.1*q/2,yy=Math.round(Y(vv))+.5;c.beginPath();c.moveTo(padL,yy);c.lineTo(padL+pw,yy);c.stroke();c.fillText(btc(vv),padL-5,yy)}
    c.textAlign="center";c.textBaseline="alphabetic";var stp=xmax>150000?50000:xmax>60000?20000:10000;for(var t=0;t<=xmax;t+=stp)c.fillText(usd(t)==="--"?"$0":usd(t),X(t),H-5);
    var bw=Math.max(1,pw/(xmax/1000)-.6);pts.forEach(function(p,i){c.fillStyle=p[0]+500<px?up:dn;c.globalAlpha=hover===i?1:.75;c.fillRect(X(p[0]),Y(p[1]),bw,padT+ph-Y(p[1]))});c.globalAlpha=1;
    var xp=X(px);c.strokeStyle=ink;c.setLineDash([4,3]);c.beginPath();c.moveTo(xp+.5,padT);c.lineTo(xp+.5,padT+ph);c.stroke();c.setLineDash([]);c.fillStyle=ink;c.textAlign=xp>W-60?"right":"left";c.fillText((E?"price ":"现价 ")+usd(px),xp+(xp>W-60?-4:4),padT+9);
    var lv=$("acLive");if(lv)lv.textContent=hover>=0&&pts[hover]?usd(pts[hover][0])+"–"+usd(pts[hover][0]+1000)+" · "+btc(pts[hover][1])+" BTC":"";
    map={pts:pts,X:X,xmax:xmax,padL:padL,pw:pw};
  }
  function init(){
    var sec=$("ageCost");if(!sec)return;
    sec.addEventListener("click",function(e){var b=e.target.closest&&e.target.closest("[data-ac]");if(!b)return;sel=b.dataset.ac;hover=-1;render();loadDist(sel)});
    var cv=$("acCanvas"),pick=function(ev){if(!map)return;var r=cv.getBoundingClientRect(),x=(ev.touches?ev.touches[0].clientX:ev.clientX)-r.left,v=(x-map.padL)/map.pw*map.xmax,best=-1,bd=Infinity;map.pts.forEach(function(p,i){var dd=Math.abs(p[0]+500-v);if(dd<bd){bd=dd;best=i}});hover=best;draw()};
    cv.addEventListener("pointermove",pick);cv.addEventListener("pointerdown",pick);cv.addEventListener("pointerleave",function(){hover=-1;draw()});
    if("ResizeObserver" in window)new ResizeObserver(function(){if(D)draw()}).observe(cv.parentElement);   // V27.9.1：折叠打开后补画
    var started=false,go=function(){if(started)return;started=true;load()};(window.__warm=window.__warm||{})[sec.id]=go;
    if("IntersectionObserver" in window){var io=new IntersectionObserver(function(es){if(es.some(function(x){return x.isIntersecting})){io.disconnect();go()}},{rootMargin:"600px 0px"});io.observe(sec.closest("details")||sec)}else go();
    window.addEventListener("resize",function(){if(D)draw()},{passive:true});window.addEventListener("themechange",function(){if(D)render()});
    setInterval(function(){if(D&&document.visibilityState==="visible")render()},60000);
    render();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
