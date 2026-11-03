
(function(){
  "use strict";
  // V27.9：持币成本分位带——全网每枚币的成本从低到高排队，第 X% 位置的成本（Bitview cost_basis_by_coin_pXX）
  var API="https://bitview.space/api/series/bulk",KEY="btc_cost_bands_v1",TTL=6*3600*1000,PCT=[5,10,15,20,25,30,35,40,45,50,55,60,65,70,75,80,85,90,95];
  var D=null,L=null,range=365,hover=-1,map=null,loading=false,failed=false;
  function $(id){return document.getElementById(id)}
  function en(){return window.BTC_LANG==="en"}
  function css(n,f){var v=getComputedStyle(document.documentElement).getPropertyValue(n).trim();return v||f}
  function nm(p){return p===50?"cost_basis_by_coin_median":"cost_basis_by_coin_p"+p}
  function usd(v){return !(v>0)?"--":v>=1e3?"$"+(v/1e3).toFixed(v>=1e5?0:1)+"K":"$"+Math.round(v)}
  function get(u){return typeof tryFetch==="function"?tryFetch(u,25000):fetch(u).then(function(r){return r.json()})}
  function url(names,start){var u=new URL(API);u.searchParams.set("index","day1");u.searchParams.set("series",["date"].concat(names).join(","));u.searchParams.set("start",String(start));return u.toString()}
  async function load(){
    try{var c=JSON.parse(localStorage.getItem(KEY));if(c&&c.D&&c.L){D=c.D;L=c.L;if(Date.now()-c.ts<TTL){render();return}}}catch(e){}
    if(loading)return;loading=true;render();
    try{
      var r=await get(url(["price",nm(10),nm(25),nm(50),nm(75),nm(90)],-1100)),days=r[0].data,col=function(k){return r[k].data.map(function(x){return x==null?null:+x})};
      var d={d:days,p:col(1),b10:col(2),b25:col(3),b50:col(4),b75:col(5),b90:col(6)};
      var r2=await get(url(PCT.map(nm),-1)),l={day:r2[0].data[r2[0].data.length-1],v:PCT.map(function(_,k){var a=r2[k+1].data;return +a[a.length-1]})};
      if(!(d.d.length>30)||!l.v.some(function(x){return x>0}))throw 0;
      D=d;L=l;failed=false;try{localStorage.setItem(KEY,JSON.stringify({ts:Date.now(),D:D,L:L}))}catch(e){}
    }catch(e){if(!D)failed=true}
    finally{loading=false;render()}
  }
  function spot(){var s=(typeof S!=="undefined"&&S&&S.price>0)?S.price:null;if(s)return s;if(D)for(var i=D.p.length-1;i>=0;i--)if(D.p[i]>0)return D.p[i];return null}
  function pctOf(price){
    // 现价在成本队列里的位置：在相邻两个分位之间按对数插值
    if(!L||!(price>0))return null;var v=L.v,lo=-1;
    for(var k=0;k<v.length;k++){if(v[k]>0&&v[k]<=price)lo=k}
    if(lo<0)return v[0]>price?"<5":null;if(lo===v.length-1)return ">95";
    var a=v[lo],b=v[lo+1];if(!(b>a))return PCT[lo];var t=a>0?Math.log(price/a)/Math.log(b/a):(price-a)/(b-a);return Math.round(PCT[lo]+5*Math.max(0,Math.min(1,t)));
  }
  function badge(){var b=$("freshCostBands");if(!b)return;var t,c;
    if(L&&L.day){var age=(Date.now()-Date.parse(L.day+"T00:00:00Z"))/864e5;t=(age>3?(en()?"Stale · ":"滞后 · "):(en()?"Data date · ":"数据日 · "))+L.day.slice(5);c=age>3?"warn":"good"}
    else if(loading){t=en()?"Syncing":"同步中";c="warn"}else if(failed){t=en()?"Unavailable":"暂不可用";c="bad"}else{t=en()?"Waiting for data":"等待数据";c="warn"}
    b.textContent=t;b.className="fresh-badge "+c}
  function render(){
    badge();var E=en(),set=function(id,z,e){var x=$(id);if(x)x.textContent=E?e:z};
    set("cbPosL","现价高于","Price is above");set("cbMedL","中位成本","Median cost");set("cbMidL","中间 50% 成本","Middle 50%");
    set("cbL80","中间 80% 的币","Middle 80%");set("cbL50","中间 50% 的币","Middle 50%");set("cbLmed","中位成本","Median cost");set("cbLpx","价格","Price");
    document.querySelectorAll("[data-cb-range]").forEach(function(b){var on=+b.dataset.cbRange===range;b.setAttribute("aria-pressed",on?"true":"false");b.classList.toggle("active",on);if(E)b.textContent=b.dataset.cbRange==="365"?"1Y":"3Y"});
    var em=$("cbEmpty");if(!D||!L){if(em){em.hidden=false;em.textContent=loading?(E?"Syncing…":"同步中…"):failed?(E?"Unavailable":"暂不可用"):(E?"Waiting for data":"等待数据")}return}
    if(em)em.hidden=true;
    var px=spot(),pc=pctOf(px),med=L.v[9];
    var k2=function(v){return !(v>0)?"--":v>=1e4?"$"+Math.round(v/1e3)+"K":v>=1e3?"$"+(v/1e3).toFixed(1)+"K":"$"+Math.round(v)};
    $("cbPos").innerHTML=pc==null?"--":pc+'%<small class="cb-sub">'+(E?"of coins' cost":"的持币成本")+'</small>';
    $("cbMed").innerHTML=k2(med)+(px>0&&med>0?'<small class="cb-sub">'+(E?"price "+((px/med-1)>=0?"+":"−"):((px/med-1)>=0?"现价高 ":"现价低 "))+Math.abs((px/med-1)*100).toFixed(0)+"%"+'</small>':"");
    $("cbMid").innerHTML=k2(L.v[4])+"–"+k2(L.v[14])+'<small class="cb-sub">'+(E?"25th–75th pct":"第 25–75 分位")+'</small>';
    draw();
  }
  function draw(){
    var cv=$("cbCanvas");if(!cv||!D)return;var box=cv.parentElement,W=box.clientWidth,H=box.clientHeight;if(!W||!H)return;
    var n=D.d.length,s0=Math.max(0,n-range),idx=[];for(var i=s0;i<n;i++)idx.push(i);var cnt=idx.length;
    var dpr=Math.min(3,window.devicePixelRatio||1);cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);var c=cv.getContext("2d");c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,W,H);
    var padL=44,padR=10,padT=8,padB=20,pw=W-padL-padR,ph=H-padT-padB,lo=Infinity,hi=0;
    idx.forEach(function(k){[D.p[k],D.b10[k],D.b90[k]].forEach(function(v){if(v>0){lo=Math.min(lo,v);hi=Math.max(hi,v)}})});lo*=.9;hi*=1.08;
    var X=function(q){return padL+(cnt>1?q/(cnt-1):0)*pw},Y=function(v){return padT+ph-(Math.log(v)-Math.log(lo))/(Math.log(hi)-Math.log(lo))*ph};
    var FONT=css("--font-sans","-apple-system,system-ui,sans-serif"),tx3=css("--text-tertiary","#888"),grid=css("--border-subtle","rgba(0,0,0,.08)"),brand=css("--brand","#f7931a"),ink=css("--text-primary","#111");
    c.font="10px "+FONT;c.fillStyle=tx3;c.strokeStyle=grid;c.lineWidth=1;c.textAlign="right";c.textBaseline="middle";
    for(var g=0;g<=3;g++){var v=Math.exp(Math.log(lo)+(Math.log(hi)-Math.log(lo))*g/3),y=Math.round(Y(v))+.5;c.beginPath();c.moveTo(padL,y);c.lineTo(padL+pw,y);c.stroke();c.fillText(usd(v),padL-5,y)}
    c.textAlign="center";c.textBaseline="alphabetic";var last=-99,MN=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],yr=range>400;
    idx.forEach(function(k,q){var dd=D.d[k];if(yr?dd.slice(5)!=="01-01":dd.slice(8)!=="01")return;var xx=X(q);if(xx-last<40)return;last=xx;c.fillText(yr?dd.slice(0,4):(en()?MN[+dd.slice(5,7)-1]:(+dd.slice(5,7))+"月"),xx,H-5)});
    var band=function(a,b,alpha){c.beginPath();var st=false;idx.forEach(function(k,q){var v=D[a][k];if(!(v>0))return;if(!st){c.moveTo(X(q),Y(v));st=true}else c.lineTo(X(q),Y(v))});
      for(var q=cnt-1;q>=0;q--){var v2=D[b][idx[q]];if(v2>0)c.lineTo(X(q),Y(v2))}c.closePath();c.globalAlpha=alpha;c.fillStyle=brand;c.fill();c.globalAlpha=1};
    band("b90","b10",.14);band("b75","b25",.3);
    var line=function(key,col,w,a){c.strokeStyle=col;c.lineWidth=w;c.globalAlpha=a;c.lineJoin="round";c.beginPath();var st=false;idx.forEach(function(k,q){var v=D[key][k];if(!(v>0))return;if(!st){c.moveTo(X(q),Y(v));st=true}else c.lineTo(X(q),Y(v))});c.stroke();c.globalAlpha=1};
    line("b50",brand,1.6,1);line("p",ink,1.3,.85);
    var lv=$("cbLive");
    if(hover>=0&&hover<cnt){var k=idx[hover],hx=X(hover);c.strokeStyle=tx3;c.lineWidth=1;c.beginPath();c.moveTo(hx+.5,padT);c.lineTo(hx+.5,padT+ph);c.stroke();
      if(lv)lv.textContent=D.d[k]+(en()?" · price ":" · 价格 ")+usd(D.p[k])+(en()?" · median ":" · 中位成本 ")+usd(D.b50[k])+(en()?" · middle 50% ":" · 中间 50% ")+usd(D.b25[k])+"–"+usd(D.b75[k])}
    else if(lv)lv.textContent="";
    map={padL:padL,pw:pw,cnt:cnt};
  }
  function init(){
    var sec=$("costBands");if(!sec)return;
    sec.addEventListener("click",function(e){var b=e.target.closest&&e.target.closest("[data-cb-range]");if(!b)return;range=+b.dataset.cbRange;hover=-1;render()});
    var cv=$("cbCanvas"),pick=function(ev){if(!D||!map)return;var r=cv.getBoundingClientRect(),x=(ev.touches?ev.touches[0].clientX:ev.clientX)-r.left;hover=Math.max(0,Math.min(map.cnt-1,Math.round((x-map.padL)/map.pw*(map.cnt-1))));draw()};
    cv.addEventListener("pointermove",pick);cv.addEventListener("pointerdown",pick);cv.addEventListener("pointerleave",function(){hover=-1;draw()});cv.addEventListener("touchend",function(){hover=-1;draw()},{passive:true});
    var started=false,go=function(){if(started)return;started=true;load()};
    if("IntersectionObserver" in window){var io=new IntersectionObserver(function(es){if(es.some(function(x){return x.isIntersecting})){io.disconnect();go()}},{rootMargin:"600px 0px"});io.observe(sec.closest("details")||sec)}else go();
    window.addEventListener("resize",function(){if(D)draw()},{passive:true});window.addEventListener("themechange",function(){if(D)render()});
    setInterval(function(){if(D&&document.visibilityState==="visible")render()},60000);
    render();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
