
(function(){
  "use strict";
  // V26.7：持币地址分布（Bitview / BRK 地址余额分组：地址数与持币量，按 UTC 日）
  var KEY="btc_addr_dist_v1",TTL=6*3600*1000,API="https://bitview.space/api/series/bulk";
  var BANDS=[
    {k:"under_1k_sats",lo:0,label:"<0.00001"},
    {k:"1k_sats_to_10k_sats",lo:1e-5,label:"0.00001–0.0001"},
    {k:"10k_sats_to_100k_sats",lo:1e-4,label:"0.0001–0.001"},
    {k:"100k_sats_to_1m_sats",lo:1e-3,label:"0.001–0.01"},
    {k:"1m_sats_to_10m_sats",lo:1e-2,label:"0.01–0.1"},
    {k:"10m_sats_to_1btc",lo:.1,label:"0.1–1"},
    {k:"1btc_to_10btc",lo:1,label:"1–10"},
    {k:"10btc_to_100btc",lo:10,label:"10–100"},
    {k:"100btc_to_1k_btc",lo:100,label:"100–1K"},
    {k:"1k_btc_to_10k_btc",lo:1e3,label:"1K–10K"},
    {k:"10k_btc_to_100k_btc",lo:1e4,label:"10K–100K"},
    {k:"over_100k_btc",lo:1e5,label:"≥100K"}
  ];
  var data=null,loading=false,failed=false,unit="btc";
  function $(id){return document.getElementById(id)}
  function en(){return window.BTC_LANG==="en"}
  function valid(d){
    if(!d||!/^\d{4}-\d{2}-\d{2}$/.test(String(d.day||""))||!Array.isArray(d.rows)||d.rows.length!==BANDS.length)return false;
    var sup=0;for(var i=0;i<d.rows.length;i++){var r=d.rows[i];if(!r||!(r.count>=0)||!(r.supply>=0))return false;sup+=r.supply}
    return sup>19e6&&sup<21.1e6;
  }
  function readCache(){try{var c=JSON.parse(localStorage.getItem(KEY));if(c&&valid(c.data))return c}catch(e){}return null}
  function compact(v,digits){
    if(!(v>=0))return "--";
    if(v>=1e12)return (v/1e12).toFixed(v>=1e13?1:2)+"T";
    if(v>=1e9)return (v/1e9).toFixed(v>=1e11?0:v>=1e10?1:2)+"B";
    if(v>=1e6)return (v/1e6).toFixed(v>=1e8?0:v>=1e7?1:2)+"M";
    if(v>=1e5)return Math.round(v/1e3)+"K";
    if(v>=1e4)return (v/1e3).toFixed(1)+"K";
    return Math.round(v).toLocaleString("en-US");
  }
  function st(){try{return typeof S!=="undefined"?S:null}catch(e){return null}}
  function price(){var x=st(),p=x&&+x.price;return p>0?p:0}
  function held(){var x=st(),h=x&&x.hd;return h?Math.max(0,(+h.d||0)+(+h.l||0)):0}
  function badge(){
    var b=$("freshWalletDist");if(!b)return;
    var t,c;
    if(data){var ms=Date.parse(data.day+"T00:00:00Z"),age=(Date.now()-ms)/864e5,md=data.day.slice(5);
      if(age>3){t=(en()?"Stale · ":"滞后 · ")+md;c="warn"}else{t=(en()?"Data date · ":"数据日 · ")+md;c="good"}}
    else if(loading){t=en()?"Syncing":"同步中";c="warn"}
    else if(failed){t=en()?"Unavailable":"暂不可用";c="bad"}
    else{t=en()?"Waiting for data":"等待数据";c="warn"}
    b.textContent=t;b.className="fresh-badge fold-date "+c;
  }
  // 中文用「万 / 亿」，英文用 K / M
  function zh(v){
    if(!(v>=0))return "--";
    if(v>=1e8)return (v/1e8).toFixed(v>=1e9?1:2)+"亿";
    if(v>=1e7)return Math.round(v/1e4).toLocaleString("en-US")+"万";
    if(v>=1e4)return (v/1e4).toFixed(v>=1e5?0:1)+"万";
    return Math.round(v).toLocaleString("en-US");
  }
  function num(v){return en()?compact(v):zh(v)}
  function pct(v){return v<=0?"0%":v<0.01?"<0.01%":v<1?v.toFixed(2)+"%":v<10?v.toFixed(1)+"%":v.toFixed(1)+"%"}
  function render(){
    badge();
    var box=$("hdRows");if(!box)return;
    var E2=en();
    var hb=$("hdHeadBand"),ha=$("hdHeadAddr"),hh=$("hdHeadHold");if(hb)hb.textContent=E2?"Balance · BTC":"余额 · BTC";if(ha)ha.textContent=E2?"Addresses":"地址数量";if(hh)hh.textContent=E2?"Holdings":"持币量";
    document.querySelectorAll("[data-hd-unit]").forEach(function(x){x.setAttribute("aria-pressed",x.dataset.hdUnit===unit?"true":"false")});
    if(!data){box.innerHTML='<div class="hd-empty">'+(loading?(E2?"Syncing…":"同步中…"):failed?(E2?"Unavailable":"暂不可用"):(E2?"Waiting for data":"等待数据"))+'</div>';return}
    var p=price(),usd=unit==="usd"&&p>0,rows=data.rows;
    var maxA=0,maxS=0,totA=0,totS=0;rows.forEach(function(r){maxA=Math.max(maxA,r.count);maxS=Math.max(maxS,r.supply);totA+=r.count;totS+=r.supply});
    var h=held(),you=-1;if(h>0){for(var i=BANDS.length-1;i>=0;i--){if(h>=BANDS[i].lo){you=i;break}}}
    var sv=function(v){return usd?"$"+compact(v*p):num(v)};
    var html=rows.map(function(r,i){
      var wa=maxA>0?Math.max(r.count>0?1:0,r.count/maxA*100):0,ws=maxS>0?Math.max(r.supply>0?1:0,r.supply/maxS*100):0;
      return '<div class="hd-row'+(i===you?' is-you':'')+'"><span class="hd-band">'+BANDS[i].label+(i===you?'<em class="hd-you">'+(E2?"You":"你")+'</em>':'')+'</span>'+
        '<span class="hd-cell hd-a" title="'+(r.count/totA*100).toFixed(2)+'%"><i style="width:'+wa.toFixed(2)+'%"></i><b>'+num(r.count)+'</b></span>'+
        '<span class="hd-cell hd-s" title="'+(r.supply/totS*100).toFixed(2)+'%"><i style="width:'+ws.toFixed(2)+'%"></i><b>'+sv(r.supply)+'</b></span></div>';
    }).join("");
    html+='<div class="hd-row hd-total"><span class="hd-band">'+(E2?"Total":"合计")+'</span><span class="hd-cell hd-a"><b>'+num(totA)+'</b></span><span class="hd-cell hd-s"><b>'+sv(totS)+'</b></span></div>';
    box.innerHTML=html;
  }
  async function load(force){
    var c=readCache();
    if(c&&!data){data=c.data}
    if(!force&&c&&Date.now()-c.ts<TTL){render();return}
    if(loading)return;loading=true;failed=false;render();
    try{
      var names=["date"];BANDS.forEach(function(b){names.push("addrs_"+b.k+"_addr_count")});BANDS.forEach(function(b){names.push("addrs_"+b.k+"_supply")});
      var u=new URL(API);u.searchParams.set("index","day1");u.searchParams.set("series",names.join(","));u.searchParams.set("start","-1");
      var raw=typeof tryFetch==="function"?await tryFetch(u.toString(),20000):await (await fetch(u.toString())).json();
      var last=function(i){var a=raw&&raw[i]&&raw[i].data;return Array.isArray(a)&&a.length?a[a.length-1]:NaN};
      var n=BANDS.length,d={day:String(last(0)||""),rows:BANDS.map(function(b,i){return {key:b.k,count:+last(1+i),supply:+last(1+n+i)}})};
      if(!valid(d))throw new Error("bad address distribution");
      data=d;try{localStorage.setItem(KEY,JSON.stringify({ts:Date.now(),data:d}))}catch(e){}
    }catch(e){if(!data)failed=true}
    finally{loading=false;render()}
  }
  function init(){
    var sec=$("walletDist");if(!sec)return;
    sec.addEventListener("click",function(e){var b=e.target.closest&&e.target.closest("[data-hd-unit]");if(!b)return;unit=b.dataset.hdUnit;render()});
    var started=false,go=function(){if(started)return;started=true;load(false)};
    if("IntersectionObserver" in window){var io=new IntersectionObserver(function(es){if(es.some(function(x){return x.isIntersecting})){io.disconnect();go()}},{rootMargin:"600px 0px"});io.observe(sec.closest("details")||sec)}else go();
    // 跟随持币群体的「更新」按钮一起刷新
    if(typeof window.refreshHolderCohorts==="function"){var orig=window.refreshHolderCohorts;window.refreshHolderCohorts=function(f){if(f)load(true);return orig.apply(this,arguments)}}
    // 现价变化时刷新 USD 列
    setInterval(function(){if(data&&unit==="usd")render()},30000);
    // 持仓改动后更新「你在这一档」
    var lastHeld=-1;setInterval(function(){var h=held();if(h!==lastHeld){lastHeld=h;if(data)render()}},3000);
    render();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
