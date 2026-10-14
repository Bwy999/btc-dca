
(function(){
  "use strict";
  // V26.3：分析页数据化解读。每个模块配「历史位置 + 信号之后 BTC 怎么走」，数据为 Bitview 月度序列（2012 年起）。
  var KEY="btc_bitview_analysis_ins_v1",TTL=12*3600*1000,rows=null,loading=false;
  var SER=["date","price","mvrv","sth_nupl","price_sma_200w_ratio"];
  function $(id){return document.getElementById(id)}
  function host(mod,id){var d=document.querySelector('details[data-module="'+mod+'"]');if(!d)return null;var w=$(id);if(!w){w=document.createElement("div");w.className="ins-wrap";w.id=id;w.innerHTML='<div class="ins-pos"></div><div class="ins-sig"></div>';d.appendChild(w)}return w}
  function series(k){return rows.filter(function(r){return r[k]!=null&&r.price>0}).map(function(r){return{day:r.m+"-01",value:r[k],price:r.price}})}
  function render(){
    if(!rows||!window.BTCInsight)return;var I=BTCInsight;
    var defs=[
      ["todayCard","insValue","mvrv",{lo:"低估",loEn:"Cheap",hi:"高估",hiEn:"Expensive",fmt:function(v){return v.toFixed(2)}},function(a,b){return a>=1&&b<1},6,"MVRV 跌破 1 之后","After MVRV falls below 1","跌破 1 · 间隔 ≥6 月","Falls below 1 · ≥6 months apart"],
      ["cycleDrawdown","insDraw","dd",{lo:"深度回撤",loEn:"Deep drawdown",hi:"接近新高",hiEn:"Near high",fmt:function(v){return (v*100).toFixed(0)+"%"}},function(a,b){return a>-0.7&&b<=-0.7},12,"回撤超过 70% 之后","After a drawdown beyond 70%","距最高月线 ≤ −70% · 间隔 ≥12 月","≤ −70% from the high · ≥12 months apart"],
      ["decision","insTrend","r200",{lo:"低于均线",loEn:"Below MA",hi:"远高于均线",hiEn:"Far above MA",fmt:function(v){return v.toFixed(2)+"×"}},function(a,b){return a>=1&&b<1},6,"跌破 200 周均线之后","After price falls below the 200-week MA","价格 ÷ 200 周均线 < 1 · 间隔 ≥6 月","Price ÷ 200-week MA < 1 · ≥6 months apart"],
      ["liquidity","insSth","snupl",{lo:"短期恐慌",loEn:"Short-term fear",hi:"短期亢奋",hiEn:"Short-term euphoria",fmt:function(v){return v.toFixed(2)}},function(a,b){return a>-0.25&&b<=-0.25},3,"短期持有者恐慌之后","After short-term holders capitulate","STH NUPL ≤ −0.25 · 间隔 ≥3 月","STH NUPL ≤ −0.25 · ≥3 months apart"]];
    defs.forEach(function(d){
      var w=host(d[0],d[1]);if(!w)return;var R=series(d[2]);if(R.length<36){w.innerHTML="";return}
      I.positionCard(w.querySelector(".ins-pos"),R,d[3]);
      var ev=I.events(R,d[4],d[5]);
      I.signalCard(w.querySelector(".ins-sig"),R,ev,{step:30.4,title:d[6],titleEn:d[7],rule:d[8],ruleEn:d[9]});
    });
  }
  async function load(){
    if(loading)return;var c=null;try{c=JSON.parse(localStorage.getItem(KEY)||"null")}catch(e){}
    if(c&&c.rows&&c.rows.length){rows=c.rows;render();if(Date.now()-c.ts<TTL)return}
    loading=true;
    try{
      var url=bitviewBulkUrl(SER,"2012-01-01").replace("index=day1","index=month1"),raw=await tryFetch(url,15000);
      var cols=SER.map(function(n,i){return pickSeries(raw,n,i)});if(!cols.every(Array.isArray))throw new Error("bad");
      var out=[],hi=0,num=function(v){if(v==null||v==="")return null;v=+v;return Number.isFinite(v)?v:null};
      for(var i=0;i<cols[0].length;i++){var m=String(cols[0][i]).slice(0,7),p=num(cols[1][i]);if(!/^\d{4}-\d{2}$/.test(m)||!(p>0))continue;hi=Math.max(hi,p);
        out.push({m:m,price:p,mvrv:num(cols[2][i]),snupl:num(cols[3][i]),r200:num(cols[4][i]),dd:p/hi-1})}
      if(out.length<36)throw new Error("short");
      rows=out;try{localStorage.setItem(KEY,JSON.stringify({ts:Date.now(),rows:rows}))}catch(e){}
      render();
    }catch(e){}finally{loading=false}
  }
  var orig=window.setTab;if(typeof orig==="function")window.setTab=function(t){var r=orig.apply(this,arguments);if(t==="value")load();return r};
  document.addEventListener("toggle",function(e){var d=e.target;if(d&&d.open&&/^(todayCard|cycleDrawdown|decision|liquidity)$/.test(d.dataset&&d.dataset.module||""))load()},true);
})();
