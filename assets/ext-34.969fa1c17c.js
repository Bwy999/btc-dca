
(function(){
  "use strict";
  // V27.6：稳定币流动性（USDT / USDC）
  //   日度：DefiLlama 每日流通市值（与原模块同一来源）；BTC 价格：Bitview 日度
  //   12 小时：CoinGecko 近 2 天逐小时市值，取最新与 12 小时前之差；变化 ≥ 市值 0.3% 记为「异动」
  var KEY="btc_stablex_v1",TTL=6*3600*1000,K12="btc_stablex_12h_v1",T12=5*60*1000,SPAN=1100;
  var D=null,H=null,range=365,hover={u:-1,c:-1},maps={},loading=false;
  function $(id){return document.getElementById(id)}
  function en(){return window.BTC_LANG==="en"}
  function css(n,f){var v=getComputedStyle(document.documentElement).getPropertyValue(n).trim();return v||f}
  function b$(v,sign){if(!isFinite(v))return "--";var a=Math.abs(v),t=a>=1e9?"$"+(a/1e9).toFixed(a>=1e10?1:2)+"B":"$"+(a/1e6).toFixed(0)+"M";return (v<0?"−":(sign&&v>0?"+":""))+t}
  function pct(v){return isFinite(v)?(v>=0?"+":"−")+Math.abs(v*100).toFixed(1)+"%":"--"}
  function ax(v){var a=Math.abs(v),t=a>=1e9?"$"+(+(a/1e9).toFixed(1))+"B":"$"+Math.round(a/1e6)+"M";return (v<0?"−":"+")+t}
  function get(url,ms){return typeof tryFetch==="function"?tryFetch(url,ms||12000):fetch(url).then(function(r){return r.json()})}
  function readJSON(k){try{return JSON.parse(localStorage.getItem(k))}catch(e){return null}}
  function llama(id){return get("https://stablecoins.llama.fi/stablecoincharts/all?stablecoin="+id,15000).then(function(r){
      if(!Array.isArray(r))throw new Error("llama");var out={};r.forEach(function(x){var t=+x.date,v=x.totalCirculatingUSD&&x.totalCirculatingUSD.peggedUSD;if(t&&v>0)out[new Date(t*1000).toISOString().slice(0,10)]=+v});return out})}
  function btc(){var u=new URL("https://bitview.space/api/series/bulk");u.searchParams.set("index","day1");u.searchParams.set("series","date,price");u.searchParams.set("start",String(-SPAN));
    return get(u.toString(),15000).then(function(r){var d=r[0].data,v=r[1].data,o={};d.forEach(function(x,i){if(v[i]>0)o[x]=+v[i]});return o})}
  async function loadDaily(force){
    var c=readJSON(KEY);if(c&&c.data&&c.data.days&&c.data.days.length>60){D=c.data;if(!force&&Date.now()-c.ts<TTL)return}
    if(loading)return;loading=true;
    try{
      var r=await Promise.all([llama(1),llama(2),btc().catch(function(){return {}})]);
      var days=Object.keys(r[0]).filter(function(d){return r[1][d]>0}).sort();days=days.slice(-SPAN);
      if(days.length<60)throw new Error("short");
      var d={days:days,u:days.map(function(x){return r[0][x]}),c:days.map(function(x){return r[1][x]}),p:days.map(function(x){return r[2][x]||0})};
      // 价格缺失时沿用前一天
      for(var i=1;i<d.p.length;i++)if(!(d.p[i]>0))d.p[i]=d.p[i-1];
      D=d;try{localStorage.setItem(KEY,JSON.stringify({ts:Date.now(),data:d}))}catch(e){}
    }catch(e){}
    finally{loading=false}
  }
  // V27.6.1：近 1 天 = 5 分钟一个点；供应量 = 市值 ÷ 价格（去掉稳定币价格在 0.999–1.001 之间波动带来的「假变化」）
  function cg(id){return get("https://api.coingecko.com/api/v3/coins/"+id+"/market_chart?vs_currency=usd&days=1",12000).then(function(r){
      var mc=(r&&r.market_caps)||[],pr=(r&&r.prices)||[],pts=[];
      for(var i=0;i<mc.length;i++){var p=pr[i];if(!p||Math.abs(p[0]-mc[i][0])>120000)continue;var px=+p[1],cap=+mc[i][1];if(!(px>.97&&px<1.03)||!(cap>1e9))continue;pts.push([mc[i][0],cap/px])}
      if(pts.length<100)throw new Error("cg few");
      var last=pts[pts.length-1],t0=last[0]-12*3600*1000,base=null;
      for(var j=pts.length-1;j>=0;j--){if(pts[j][0]<=t0){base=pts[j];break}}
      if(!base||last[0]-base[0]>13*3600*1000)throw new Error("cg window");
      var d=last[1]-base[1];if(Math.abs(d)>last[1]*.05)throw new Error("cg jump");
      return {d:d,cap:last[1],t:last[0],from:base[0]}})}
  var h12err=false;
  async function load12(force){
    var c=readJSON(K12);if(c&&c.u&&c.c){H=c;if(!force&&Date.now()-c.ts<T12)return}
    try{var r=await Promise.all([cg("tether"),cg("usd-coin")]);H={ts:Date.now(),u:r[0],c:r[1]};h12err=false;try{localStorage.setItem(K12,JSON.stringify(H))}catch(e){}}catch(e){h12err=true}
  }
  // 12 小时数据的「年龄」：按 CoinGecko 最后一个数据点的时间算，超过 60 分钟视为滞后，不再判断异动
  function h12Age(){if(!H||!H.u||!H.c)return Infinity;return (Date.now()-Math.min(H.u.t||0,H.c.t||0))/60000}
  function hm(t){var d=new Date(t);return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0")}
  function fmtAge(m){return m>=1440?(m/1440).toFixed(1)+(en()?" days":" 天"):m>=90?Math.round(m/60)+(en()?" h":" 小时"):Math.round(m)+(en()?" min":" 分钟")}
  function chg(arr,i,n){return i-n>=0?arr[i]-arr[i-n]:NaN}
  function impact(arr){
    // 30 天净变化 ≥ 市值 3% 的日子 = 增发期；≤ −1% = 赎回期；看之后 30 天 BTC 涨跌
    var up=[],dn=[],n=D.days.length;
    for(var i=30;i<n-30;i++){var c=chg(arr,i,30)/arr[i-30],r=D.p[i+30]/D.p[i]-1;if(!(D.p[i]>0)||!isFinite(r))continue;if(c>=.03)up.push(r);else if(c<=-.01)dn.push(r)}
    var avg=function(a){return a.length?a.reduce(function(x,y){return x+y},0)/a.length:NaN},win=function(a){return a.length?a.filter(function(x){return x>0}).length/a.length:NaN};
    return {up:avg(up),upw:win(up),upn:up.length,dn:avg(dn),dnw:win(dn),dnn:dn.length};
  }
  function draw(key){
    var cv=$("stxCv_"+key);if(!cv||!D)return;var box=cv.parentElement,W=box.clientWidth,Hh=box.clientHeight;if(!W||!Hh)return;
    var dpr=Math.min(3,window.devicePixelRatio||1);cv.width=Math.round(W*dpr);cv.height=Math.round(Hh*dpr);var c=cv.getContext("2d");c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,W,Hh);
    var arr=D[key],n=D.days.length,s0=Math.max(30,n-range),idx=[];for(var i=s0;i<n;i++)idx.push(i);var cnt=idx.length;
    var vals=idx.map(function(i){return chg(arr,i,30)}),pr=idx.map(function(i){return D.p[i]});
    var padL=44,padR=42,padT=8,padB=18,pw=W-padL-padR,ph=Hh-padT-padB,mx=0;vals.forEach(function(v){if(isFinite(v))mx=Math.max(mx,Math.abs(v))});
    var raw=(mx||1)/2,mag=Math.pow(10,Math.floor(Math.log10(raw))),f=raw/mag,step=[1,1.5,2,2.5,3,4,5,6,8,10].find(function(x){return f<=x})*mag;mx=step*2*1.04;
    var pmin=Infinity,pmax=0;pr.forEach(function(x){if(x>0){pmin=Math.min(pmin,x);pmax=Math.max(pmax,x)}});var lmin=Math.log(pmin*.92),lmax=Math.log(pmax*1.08);
    var bw=pw/cnt,X=function(i){return padL+i*bw},Y=function(v){return padT+ph/2-(v/mx)*(ph/2)},YP=function(x){return padT+ph-(Math.log(x)-lmin)/(lmax-lmin)*ph};
    var FONT=css("--font-sans","-apple-system,system-ui,sans-serif"),tx3=css("--text-tertiary","#888"),grid=css("--border-subtle","rgba(0,0,0,.08)"),up=css("--market-positive","#18a058"),dn=css("--market-negative","#e5484d");
    c.font="9px "+FONT;c.fillStyle=tx3;c.strokeStyle=grid;c.lineWidth=1;c.textAlign="right";c.textBaseline="middle";
    [-2,-1,0,1,2].forEach(function(g){var yy=Math.round(Y(step*g))+.5;c.beginPath();c.moveTo(padL,yy);c.lineTo(padL+pw,yy);c.stroke();c.fillText(g?ax(step*g):"0",padL-5,yy)});
    c.textAlign="left";if(pmax>0){c.fillText("$"+Math.round(pmax/1e3)+"K",padL+pw+5,YP(pmax));c.fillText("$"+Math.round(pmin/1e3)+"K",padL+pw+5,YP(pmin))}
    c.textAlign="center";c.textBaseline="alphabetic";var last=-99,MN=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    for(var q=0;q<cnt;q++){var dd=D.days[idx[q]];if(dd.slice(8)!=="01")continue;if(range>400&&dd.slice(5,7)!=="01")continue;var xx=X(q)+bw/2;if(xx-last<38)continue;last=xx;
      c.fillText(range>400?dd.slice(0,4):(en()?MN[+dd.slice(5,7)-1]:(+dd.slice(5,7))+"月"),xx,Hh-4)}
    for(q=0;q<cnt;q++){var v=vals[q];if(!isFinite(v)||!v)continue;var y0=Y(0),y1=Y(v);c.globalAlpha=hover[key]===q?1:.78;c.fillStyle=v>0?up:dn;c.fillRect(X(q),Math.min(y0,y1),Math.max(.6,bw-(bw>3?.4:0)),Math.abs(y1-y0))}
    c.globalAlpha=.75;c.strokeStyle=css("--text-secondary","#555");c.lineWidth=1.3;c.lineJoin="round";c.beginPath();var st=false;
    for(q=0;q<cnt;q++){if(!(pr[q]>0))continue;var px=X(q)+bw/2,py=YP(pr[q]);if(!st){c.moveTo(px,py);st=true}else c.lineTo(px,py)}c.stroke();c.globalAlpha=1;
    var lv=$("stxLive_"+key);if(lv){var h=hover[key];lv.textContent=h>=0&&h<cnt?D.days[idx[h]]+" · "+(en()?"30-day ":"30 天 ")+b$(vals[h],true)+" · BTC $"+Math.round(pr[h]).toLocaleString("en-US"):""}
    maps[key]={padL:padL,bw:bw,cnt:cnt};
  }
  function render(){
    var box=$("stableX");if(!box)return;var E=en();
    if(!D){box.innerHTML='<div class="stx-empty">'+(loading?(E?"Syncing…":"同步中…"):(E?"Waiting for data":"等待数据"))+'</div>';return}
    var n=D.days.length-1,age=h12Age(),fresh=age<=60;
    // 「现在」的供应量：12 小时数据新鲜时用它（5 分钟级），否则用日度最后一天
    var nowU=fresh?H.u.cap:D.u[n],nowC=fresh?H.c.cap:D.c[n];
    var mis=fresh?Math.max(Math.abs(H.u.cap/D.u[n]-1),Math.abs(H.c.cap/D.c[n]-1)):0;
    var back=function(arr,now,k){return n-k>=0?now-arr[n-k]:NaN};
    var tot=function(i){return D.u[i]+D.c[i]},t30=back(D.u,nowU,30)+back(D.c,nowC,30),p30=(chg(D.u,n-30,30)+chg(D.c,n-30,30)),t7=back(D.u,nowU,7)+back(D.c,nowC,7),t90=back(D.u,nowU,90)+back(D.c,nowC,90),cap=nowU+nowC;
    var rate=t30/(cap-t30),dir=rate>=.01?"x":rate<=-.005?"s":"f",acc=Math.abs(t30)>Math.abs(p30)*1.15?"a":Math.abs(t30)<Math.abs(p30)*.85?"d":"";
    var tag=(dir==="x"?(E?"Expanding":"扩张"):dir==="s"?(E?"Contracting":"收缩"):(E?"Flat":"持平"))+(dir!=="f"&&acc?(acc==="a"?(E?" · faster":" · 加速"):(E?" · slower":" · 放缓")):""),tc=dir==="x"?"var(--market-positive)":dir==="s"?"var(--market-negative)":"var(--text-secondary)";
    var cls=function(v){return v>0?"up":v<0?"dn":""};
    var chip=function(name,h){if(!h)return '<span class="stx-chip">'+name+' --</span>';var hot=fresh&&Math.abs(h.d)>=h.cap*.003,c=h.d>=0?"var(--market-positive)":"var(--market-negative)";
      return '<span class="stx-chip'+(hot?' hot':'')+'" style="--c:'+c+'">'+name+' <b class="'+cls(h.d)+'">'+b$(h.d,true)+'</b>'+(hot?'<em>'+(E?(h.d>0?"Big mint":"Big burn"):(h.d>0?"异动增发":"异动赎回"))+'</em>':'')+'</span>'};
    var coin=function(key,name){var a=D[key],now=key==="u"?nowU:nowC,v30=back(a,now,30),im=impact(a);
      return '<div class="stx-coin"><div class="stx-coin-h"><b>'+name+'</b><span><strong class="'+cls(v30)+'">'+b$(v30,true)+'</strong>'+(E?"30 days · cap ":"30 天 · 市值 ")+b$(now)+'</span></div>'
        +'<span class="stx-live" id="stxLive_'+key+'"></span><div class="stx-chart"><canvas id="stxCv_'+key+'" aria-label="'+name+' 30 天净变化与 BTC 价格"></canvas></div>'
        +'<div class="stx-impact">'+cell(E?"After mint phases (30d ≥ +3%), BTC 30 days later":"增发期（30 天 ≥ +3%）后 30 天 BTC",im.up,im.upw,im.upn,"var(--market-positive)")+cell(E?"After redeem phases (30d ≤ −1%), BTC 30 days later":"赎回期（30 天 ≤ −1%）后 30 天 BTC",im.dn,im.dnw,im.dnn,"var(--market-negative)")+'</div></div>'};
    var cell=function(label,avg,win,cnt,c){return '<div style="--c:'+c+'">'+label+'<b>'+(isFinite(avg)?(E?"avg ":"平均 ")+pct(avg):"--")+'</b><small>'+(cnt?(E?Math.round(win*100)+"% of "+cnt+" days rose":"共 "+cnt+" 天，"+Math.round(win*100)+"% 上涨"):(E?"No samples":"暂无样本"))+'</small></div>'};
    box.innerHTML='<div class="stx-hero"><div class="stx-big '+cls(t30)+'">'+b$(t30,true)+'<small>'+(E?"30-day net change (USDT + USDC)":"近 30 天净变化（USDT + USDC）")+'</small></div><span class="stx-tag" style="--c:'+tc+'">'+tag+'</span></div>'
      +'<div class="stx-12h"><span>'+(E?"12 hours":"12 小时")+'</span>'+chip("USDT",H&&H.u)+chip("USDC",H&&H.c)+'</div>'
      +'<div class="stx-fresh'+(fresh?'':' warn')+'">'+(!H?(h12err?(E?"12-hour data unavailable":"12 小时数据暂不可用"):(E?"Loading 12-hour data…":"正在读取 12 小时数据…")):fresh?(E?"Updated ":"更新于 ")+hm(Math.min(H.u.t,H.c.t))+(E?" · every 5 min":" · 每 5 分钟"):(E?"Stale by ":"已滞后 ")+fmtAge(age)+(E?", no spike check":"，不做异动判断"))+(mis>.015?'<span class="stx-mis">'+(E?" · Sources differ by ":" · 两个数据源相差 ")+(mis*100).toFixed(1)+'%</span>':'')+'</div>'
      +'<div class="stx-tri"><div><small>'+(E?"7 days":"7 天")+'</small><b class="'+cls(t7)+'">'+b$(t7,true)+'</b></div><div><small>'+(E?"30 days":"30 天")+'</small><b class="'+cls(t30)+'">'+b$(t30,true)+'</b></div><div><small>'+(E?"90 days":"90 天")+'</small><b class="'+cls(t90)+'">'+b$(t90,true)+'</b></div></div>'
      +'<div class="stx-bar"><div class="stx-leg"><span><i style="background:var(--market-positive)"></i>'+(E?"30d net mint":"30 天净增发")+'</span><span><i style="background:var(--market-negative)"></i>'+(E?"30d net redeem":"30 天净赎回")+'</span><span><i style="background:var(--text-secondary);height:2px"></i>'+(E?"BTC price":"BTC 价格")+'</span></div>'
      +'<div class="range-tabs" role="group" aria-label="时间范围">'+[[90,E?"3M":"3月"],[365,E?"1Y":"1年"],[1095,E?"3Y":"3年"]].map(function(x){return '<button class="range-btn'+(x[0]===range?' active':'')+'" type="button" data-stx-range="'+x[0]+'" aria-pressed="'+(x[0]===range)+'">'+x[1]+'</button>'}).join("")+'</div></div>'
      +coin("u","USDT")+coin("c","USDC");
    draw("u");draw("c");
  }
  function init(){
    var box=$("stableX");if(!box)return;
    box.addEventListener("click",function(e){var b=e.target.closest&&e.target.closest("[data-stx-range]");if(!b)return;range=+b.dataset.stxRange;hover={u:-1,c:-1};render()});
    var pick=function(ev){var cv=ev.target;if(!cv||!cv.id||cv.id.indexOf("stxCv_")!==0||!D)return;var key=cv.id.slice(6),m=maps[key];if(!m)return;var r=cv.getBoundingClientRect(),x=(ev.touches?ev.touches[0].clientX:ev.clientX)-r.left;hover[key]=Math.max(0,Math.min(m.cnt-1,Math.floor((x-m.padL)/m.bw)));draw(key)};
    box.addEventListener("pointermove",pick);box.addEventListener("pointerdown",pick);box.addEventListener("pointerleave",function(){hover={u:-1,c:-1};draw("u");draw("c")});
    var started=false,go=function(){if(started)return;started=true;render();loadDaily(false).then(render);load12(false).then(render)};
    if("IntersectionObserver" in window){var io=new IntersectionObserver(function(es){if(es.some(function(x){return x.isIntersecting})){io.disconnect();go()}},{rootMargin:"600px 0px"});io.observe(box.closest("details")||box)}else go();
    setInterval(function(){if(started&&document.visibilityState==="visible")load12(false).then(render)},5*60*1000);
    document.addEventListener("visibilitychange",function(){if(started&&document.visibilityState==="visible")load12(false).then(render)});
    var rt=0;window.addEventListener("resize",function(){clearTimeout(rt);rt=setTimeout(function(){if(D){draw("u");draw("c")}},150)},{passive:true});
    window.addEventListener("themechange",function(){if(D)render()});
    render();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
