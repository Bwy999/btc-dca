
(function(){
  "use strict";
  // V27.12：美国现货比特币 ETF 每日净流入 / 流出，单独列出 IBIT（贝莱德）与 FBTC（富达）。
  // 数据：TFTC「The Commoner Bitcoin ETF Tracker」公开文件（CC BY 4.0，需署名），每个交易日收盘后更新一次。
  var URL_ALL="https://www.tftc.io/bitcoin-etf-flows/data.json",KEY="btc_etf_flows_v1",TTL=3*3600*1000;
  var D=null,sel="t",gran="d",range=91,hover=-1,map=null,loading=false,failed=false;
  function $(id){return document.getElementById(id)}
  function en(){return window.BTC_LANG==="en"}
  function css(n,f){var v=getComputedStyle(document.documentElement).getPropertyValue(n).trim();return v||f}
  function m$(v,sign){if(v==null||!isFinite(v))return "—";var a=Math.abs(v),s=v<0?"−":(sign&&v>0?"+":"");return s+"$"+(a>=1e9?(a/1e9).toFixed(2)+"B":a>=1e6?(a/1e6).toFixed(a>=1e8?0:1)+"M":a>=1e3?Math.round(a/1e3)+"K":"0")}
  function cls(v){return v>0?"up":v<0?"dn":""}
  function ok(o){return o&&Array.isArray(o.d)&&o.d.length>20&&o.d.length===o.t.length&&o.i&&o.f&&o.p}
  function pack(j){var o={ts:Date.now(),thru:j.updatedThrough||"",d:[],t:[],i:[],f:[],p:[],aum:null};
    (j.days||[]).forEach(function(x){if(!x||!x.date||typeof x.netFlowUsd!=="number")return;var e=x.perEtfUsd||{},num=function(v){return typeof v==="number"?Math.round(v):null};
      o.d.push(x.date);o.t.push(Math.round(x.netFlowUsd));o.i.push(num(e.IBIT));o.f.push(num(e.FBTC));o.p.push(+x.btcCloseUsd||0);if(x.totalNetAssetsUsd>0)o.aum=Math.round(x.totalNetAssetsUsd)});
    return o}
  function load(){
    var c=null;try{c=JSON.parse(localStorage.getItem(KEY))}catch(e){}
    if(ok(c)){D=c;if(Date.now()-c.ts<TTL)return Promise.resolve()}
    if(loading)return Promise.resolve();loading=true;
    var ctl=("AbortController" in window)?new AbortController():null,tm=setTimeout(function(){if(ctl)ctl.abort()},25000);
    return fetch(URL_ALL,{cache:"no-cache",signal:ctl?ctl.signal:undefined}).then(function(r){if(!r.ok)throw new Error(r.status);return r.json()}).then(function(j){var o=pack(j);if(!ok(o))throw new Error("shape");D=o;failed=false;try{localStorage.setItem(KEY,JSON.stringify(o))}catch(e){}})
      .catch(function(){failed=!D}).then(function(){clearTimeout(tm);loading=false});
  }
  // V27.12.1：按日 / 按周 / 按月。每个柱子是一个「桶」：一天、一周（周一起）或一个自然月
  function bkey(date,g){return g==="m"?date.slice(0,7):g==="w"?"w"+Math.floor((Date.parse(date+"T00:00:00Z")/864e5+3)/7):date}
  function buckets(arr,g){var out=[],b=null;for(var i=0;i<D.d.length;i++){var k=bkey(D.d[i],g);if(!b||b.k!==k){b={k:k,d:D.d[i],v:null,p:D.p[i]};out.push(b)}if(arr[i]!=null)b.v=(b.v||0)+arr[i];b.p=D.p[i]||b.p}return out}
  function sumB(B,k){var s=0,c=0;for(var i=Math.max(0,B.length-k);i<B.length;i++)if(B[i].v!=null){s+=B[i].v;c++}return c?s:null}
  function streak(B){var i=B.length-1;while(i>=0&&B[i].v==null)i--;if(i<0||!B[i].v)return 0;var sg=B[i].v>0?1:-1,c=0;for(;i>=0;i--){if(B[i].v==null)continue;if((B[i].v>0?1:B[i].v<0?-1:0)!==sg)break;c++}return sg*c}
  // 图上要画的柱子：按日看又选了很长的时间段时，自动按周合并，免得柱子细到看不见
  function bars(){var g=gran,cut=range?new Date(Date.parse(D.d[D.d.length-1]+"T00:00:00Z")-range*864e5).toISOString().slice(0,10):"",f=function(x){return x.d>=cut};
    var L=buckets(D[sel],g).filter(f);if(g==="d"&&L.length>270){g="w";L=buckets(D[sel],g).filter(f)}
    return {list:L,g:g}}
  function draw(){
    var cv=$("etfCv");if(!cv||!D)return;var box=cv.parentElement,W=box.clientWidth,Hh=box.clientHeight;if(!W||!Hh)return;
    var dpr=Math.min(3,window.devicePixelRatio||1);cv.width=Math.round(W*dpr);cv.height=Math.round(Hh*dpr);var c=cv.getContext("2d");c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,W,Hh);
    var B=bars(),L=B.list,cnt=L.length;if(!cnt)return;
    var padL=46,padR=42,padT=8,padB=18,pw=W-padL-padR,ph=Hh-padT-padB,mx=0;L.forEach(function(b){if(b.v!=null)mx=Math.max(mx,Math.abs(b.v))});
    var raw=(mx||1)/2,mag=Math.pow(10,Math.floor(Math.log10(raw))),f=raw/mag,step=[1,1.5,2,2.5,3,4,5,6,8,10].find(function(x){return f<=x})*mag;mx=step*2*1.04;
    var pmin=Infinity,pmax=0;L.forEach(function(b){if(b.p>0){pmin=Math.min(pmin,b.p);pmax=Math.max(pmax,b.p)}});var lmin=Math.log(pmin*.94),lmax=Math.log(pmax*1.06);
    var bw=pw/cnt,X=function(i){return padL+i*bw},Y=function(v){return padT+ph/2-(v/mx)*(ph/2)},YP=function(x){return padT+ph-(Math.log(x)-lmin)/(lmax-lmin)*ph};
    var FONT=css("--font-sans","-apple-system,system-ui,sans-serif"),tx3=css("--text-tertiary","#888"),grid=css("--border-subtle","rgba(0,0,0,.08)"),up=css("--market-positive","#18a058"),dn=css("--market-negative","#e5484d");
    c.font="9px "+FONT;c.fillStyle=tx3;c.strokeStyle=grid;c.lineWidth=1;c.textAlign="right";c.textBaseline="middle";
    [-2,-1,0,1,2].forEach(function(g){var yy=Math.round(Y(step*g))+.5;c.beginPath();c.moveTo(padL,yy);c.lineTo(padL+pw,yy);c.stroke();c.fillText(g?m$(step*g):"0",padL-5,yy)});
    c.textAlign="left";if(pmax>0){c.fillText("$"+Math.round(pmax/1e3)+"K",padL+pw+5,YP(pmax));c.fillText("$"+Math.round(pmin/1e3)+"K",padL+pw+5,YP(pmin));c.fillText("BTC",padL+pw+5,padT+ph/2)}
    c.textAlign="center";c.textBaseline="alphabetic";var last=-99,prevM="",MN=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],long=(Date.parse(L[cnt-1].d)-Date.parse(L[0].d))/864e5>400;
    for(var q=0;q<cnt;q++){var dd=L[q].d,mk=long?dd.slice(0,4):dd.slice(0,7);if(mk===prevM)continue;var first=prevM==="";prevM=mk;if(first)continue;var xx=X(q)+bw/2;if(xx-last<38)continue;last=xx;
      c.fillText(long?dd.slice(0,4):(en()?MN[+dd.slice(5,7)-1]:(+dd.slice(5,7))+"月"),xx,Hh-4)}
    for(q=0;q<cnt;q++){var v=L[q].v;if(v==null||!v)continue;var y0=Y(0),y1=Y(v);c.globalAlpha=hover===q?1:.8;c.fillStyle=v>0?up:dn;c.fillRect(X(q)+(bw>3?.5:0),Math.min(y0,y1),Math.max(.7,bw-(bw>3?1:0)),Math.max(1,Math.abs(y1-y0)))}
    c.globalAlpha=1;c.strokeStyle=css("--text-primary","#111");c.lineWidth=1.6;c.lineJoin="round";c.beginPath();var st=false;
    for(q=0;q<cnt;q++){if(!(L[q].p>0))continue;var px=X(q)+bw/2,py=YP(L[q].p);if(!st){c.moveTo(px,py);st=true}else c.lineTo(px,py)}c.stroke();
    var lv=$("etfLive"),h=hover>=0&&hover<cnt?hover:cnt-1,b=L[h];
    if(lv)lv.textContent=(B.g==="m"?b.d.slice(0,7):b.d)+(B.g==="w"?(en()?" week":" 当周"):B.g==="m"?(en()?" month":" 当月"):"")+" · "+m$(b.v,true)+" · BTC $"+Math.round(b.p).toLocaleString("en-US");
    map={padL:padL,bw:bw,cnt:cnt};
  }
  function render(){
    var box=$("etfX");if(!box)return;var E=en();
    if(!D){box.innerHTML='<div class="stx-empty">'+(failed?(E?"ETF flow data unavailable":"ETF 资金流数据暂时读不到"):(E?"Loading…":"正在读取…"))+'</div>';return}
    var G=gran,cur=buckets(D[sel],G),lastB=cur[cur.length-1];
    var headTxt=G==="d"?lastB.d.slice(5)+(E?" session":" 当日净流入 / 流出"):G==="w"?(E?"This week (from "+lastB.d.slice(5)+")":"本周（"+lastB.d.slice(5)+" 起）净流入 / 流出"):(E?lastB.d.slice(0,7):(+lastB.d.slice(5,7))+" 月净流入 / 流出");
    var la=G==="d"?(E?"5d ":"近 5 日 "):G==="w"?(E?"Last wk ":"上周 "):(E?"Last mo ":"上月 "),lb=G==="d"?(E?"1m ":"近 1 月 "):G==="w"?(E?"4 wks ":"近 4 周 "):(E?"3 mos ":"近 3 月 ");
    var tile=function(k,name,sub){var Bk=buckets(D[k],G),m=Bk.length,v=Bk[m-1].v,a=G==="d"?sumB(Bk,5):(m>1?Bk[m-2].v:null),b=sumB(Bk,G==="d"?21:G==="w"?4:3);
      return '<button type="button" class="etf-tile'+(sel===k?' on':'')+'" data-etf-sel="'+k+'"><small>'+name+'<i>'+sub+'</i></small><b class="'+cls(v)+'">'+m$(v,true)+'</b>'
        +'<span>'+la+'<em class="'+cls(a)+'">'+m$(a,true)+'</em></span><span>'+lb+'<em class="'+cls(b)+'">'+m$(b,true)+'</em></span></button>'};
    var sk=streak(cur),unit=G==="d"?(E?" days":" 个交易日"):G==="w"?(E?" weeks":" 周"):(E?" months":" 个月");
    var skTxt=Math.abs(sk)>=2?(E?(Math.abs(sk)+" straight"+unit+" of "+(sk>0?"inflow":"outflow")):("连续 "+Math.abs(sk)+unit+"净"+(sk>0?"流入":"流出"))):"";
    var gtabs='<div class="stx-seg etf-gran" role="group">'+[["d",E?"Daily":"按日"],["w",E?"Weekly":"按周"],["m",E?"Monthly":"按月"]].map(function(x){return '<button type="button" class="'+(x[0]===G?'on':'')+'" data-etf-gran="'+x[0]+'">'+x[1]+'</button>'}).join("")+'</div>';
    var cum=D.t.reduce(function(a,b){return a+b},0);
    var tabs='<div class="stx-seg" role="group">'+[[91,E?"3M":"3月"],[183,E?"6M":"6月"],[365,E?"1Y":"1年"],[0,E?"All":"全部"]].map(function(x){return '<button type="button" class="'+(x[0]===range?'on':'')+'" data-etf-range="'+x[0]+'">'+x[1]+'</button>'}).join("")+'</div>';
    box.innerHTML=gtabs+'<div class="etf-head"><span>'+headTxt+'</span>'+(skTxt?'<em class="'+cls(sk)+'">'+skTxt+'</em>':'')+'</div>'
      +'<div class="etf-tiles">'+tile("t",E?"All ETFs":"全部 ETF","")+tile("i","IBIT",E?"BlackRock":"贝莱德")+tile("f","FBTC",E?"Fidelity":"富达")+'</div>'
      +tabs+'<span class="stx-live" id="etfLive"></span>'
      +'<div class="stx-chart"><canvas id="etfCv" aria-label="ETF 每日净流入流出与 BTC 价格"></canvas></div>'
      +'<div class="stx-foot"><span>'+(E?"Cumulative net inflow ":"上市以来累计净流入 ")+'<b>'+m$(cum)+'</b>'+(D.aum?(E?" · AUM ":" · 总规模 ")+'<b>'+m$(D.aum)+'</b>':'')+'</span>'
      +'<a href="https://www.tftc.io/bitcoin-etf-flows" target="_blank" rel="noopener">'+(E?"Data: TFTC · The Commoner Bitcoin ETF Tracker (CC BY 4.0)":"数据：TFTC · The Commoner Bitcoin ETF Tracker（CC BY 4.0）")+'</a></div>';
    draw();
  }
  function init(){
    var box=$("etfX");if(!box)return;
    box.addEventListener("click",function(e){var t=e.target.closest&&e.target.closest("[data-etf-sel]");if(t){sel=t.dataset.etfSel;hover=-1;render();return}
      var g=e.target.closest&&e.target.closest("[data-etf-gran]");if(g){gran=g.dataset.etfGran;if(gran==="m"&&range&&range<183)range=365;hover=-1;render();return}
      var b=e.target.closest&&e.target.closest("[data-etf-range]");if(b){range=+b.dataset.etfRange;hover=-1;render()}});
    var pick=function(ev){if(!ev.target||ev.target.id!=="etfCv"||!map)return;var r=ev.target.getBoundingClientRect(),x=ev.clientX-r.left;hover=Math.max(0,Math.min(map.cnt-1,Math.floor((x-map.padL)/map.bw)));draw()};
    box.addEventListener("pointermove",pick);box.addEventListener("pointerdown",pick);box.addEventListener("pointerleave",function(){hover=-1;if(D)draw()});
    var started=false,go=function(){if(started)return;started=true;render();load().then(render)};(window.__warm=window.__warm||{}).etf=go;
    if("IntersectionObserver" in window){var io=new IntersectionObserver(function(es){if(es.some(function(x){return x.isIntersecting})){io.disconnect();go()}},{rootMargin:"600px 0px"});io.observe(box.closest("details")||box)}else go();
    if("ResizeObserver" in window){var lastW=0;new ResizeObserver(function(){var w=box.clientWidth;if(w&&w!==lastW){lastW=w;if(D)draw()}}).observe(box)}
    window.addEventListener("themechange",function(){if(D)render()});
    document.addEventListener("visibilitychange",function(){if(started&&document.visibilityState==="visible"&&D&&Date.now()-D.ts>TTL)load().then(render)});
    render();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
