
(function(){
  "use strict";
  var DAY=864e5, ROW=44, STALE_DAYS=3;
  var filter="all", selected="", raf=0;
  var GROUP={
    ahr:{label:"AHR999",v:"--lad-ahr"},
    cost:{label:"链上成本",v:"--lad-cost"},
    cap:{label:"资本化价格",v:"--lad-cap"},
    floor:{label:"底价模型",v:"--lad-floor"},
    model:{label:"幂律模型",v:"--lad-model"}
  };
  function el(id){return document.getElementById(id)}
  function money(n){return "$"+Math.round(n).toLocaleString("en-US")}
  function short(n){return n>=1e6?"$"+(n/1e6).toFixed(2)+"M":"$"+(n/1e3).toFixed(1)+"K"}
  function gap(p,spot){var v=(p/spot-1)*100;return (v>=0?"+":"−")+Math.abs(v).toFixed(1)+"%"}
  function ageOf(day){var t=Date.parse(String(day)+"T00:00:00Z");return Number.isFinite(t)?Math.floor((Date.now()-t)/DAY):999}
  function safe(fn){try{return fn()}catch(e){return null}}

  // 资本化价格：优先用模块已加载的完整历史，其次本机缓存，最后只取最近 7 日的轻量请求
  var CAP_KEY="btc_ladder_cap_v1",CAP_TTL=6*3600*1000,capLatest=null,capLoading=false;
  function capOk(r){return !!(r&&/^\d{4}-\d{2}-\d{2}$/.test(String(r.day))&&[r.sth,r.lth,r.all].every(function(v){return Number.isFinite(+v)&&+v>0}))}
  function capLight(){try{var c=JSON.parse(localStorage.getItem(CAP_KEY)||"null");return c&&capOk(c.row)?c:null}catch(e){return null}}
  function capRow(){
    var best=null;
    function take(r){if(capOk(r)&&(!best||r.day>best.day))best=r}
    safe(function(){if(capitalizedValid(capitalizedData))take(capitalizedData.series[capitalizedData.series.length-1])});
    safe(function(){var c=capitalizedReadCache();if(c)take(c.data.series[c.data.series.length-1])});
    var l=capLight();if(l)take(l.row);
    if(capLatest)take(capLatest);
    return best;
  }
  function capFresh(){
    var t=0;
    safe(function(){var c=capitalizedReadCache();if(c)t=Math.max(t,+c.ts||0)});
    var l=capLight();if(l)t=Math.max(t,+l.ts||0);
    return t>0&&Date.now()-t<CAP_TTL;
  }
  function refreshCap(force){
    if(capLoading||(!force&&capFresh())||navigator.onLine===false)return;
    capLoading=true;
    Promise.resolve().then(function(){return tryFetch(bitviewBulkUrl(BITVIEW_CAPITALIZED_SERIES,"-7"),12000)}).then(function(raw){
      var d=capitalizedNormalize(raw),r=d&&d.series[d.series.length-1];
      if(!capOk(r))return;
      capLatest=r;
      try{localStorage.setItem(CAP_KEY,JSON.stringify({ts:Date.now(),row:r}))}catch(e){}
      queue();
    }).catch(function(){}).then(function(){capLoading=false});
  }

  // 只读取页面已有对象；任一来源缺失就跳过，不补造数值。
  function collect(){
    var out=[];
    function add(id,g,name,price,day,desc,calc){
      price=+price;
      if(Number.isFinite(price)&&price>0)out.push({id:id,g:g,name:name,price:price,day:day||"",desc:desc,calc:!!calc});
    }
    safe(function(){
      var s=S.ahr&&focusAhrSnapshot(S.ahr,focusAhrModel),q=healthQuality("AHR999");
      if(!s||!s.prices[0])return;
      add("ahr045","ahr","AHR 深度低估线",s.prices[0],q.dataDay,"首页所选 AHR999 模型等于 0.45 时对应的价格，现价跌破即进入深度低估区。");
      add("ahr12","ahr","AHR 低估区上沿",s.prices[2],q.dataDay,"首页所选 AHR999 模型等于 1.2 时对应的价格，现价低于它即处于长期低估区。");
    });
    safe(function(){
      if(!bitviewOverviewValid(bitviewOverviewData))return;
      var o=bitviewOverviewData;
      add("active","cost","Active Price",o.active,o.day,"仍在交易的活跃资金平均成本，最贴近当下市场的成本线。");
      add("tmm","cost","True Market Mean",o.trueMean,o.day,"剔除长期休眠币后，活跃市场的资本成本中枢。");
      add("sth","cost","STH 实现价格",o.sth,o.day,"持币不足 150 天（Bitview 口径）的短期持有者平均链上成本，常作牛熊分界的观察线。");
    });
    safe(function(){
      var r=capRow();if(!r)return;
      add("capsth","cap","STH 资本化价",r.sth,r.day,"短期持有者群体的资本化价格（Bitview / BRK），反映短期筹码的资本成本中枢。");
      add("caplth","cap","LTH 资本化价",r.lth,r.day,"长期持有者群体的资本化价格（Bitview / BRK），反映长期筹码的资本成本中枢。");
      add("capall","cap","全市场资本化价",r.all,r.day,"全市场的资本化价格（Bitview / BRK），反映所有持币者的资本成本中枢。");
    });
    safe(function(){
      var r=Array.isArray(floorRows)&&floorRows[floorRows.length-1];
      if(!r)return;
      add("c50","cost","C50 中位成本",r[2],r[0],"全网 UTXO 按 BTC 加权的中位成本，底价带的结构锚。");
      add("f5","floor","F5 压力底",r[3],r[0],"C50 乘以历史价格/成本比的 5% 分位，常见压力底。");
      add("f2","floor","F2 压力底",r[4],r[0],"C50 乘以历史价格/成本比的 2% 分位，极端压力底。");
    });
    safe(function(){
      if(!bitviewFloorValid(bitviewFloorData))return;
      var f=bitviewFloorData;
      add("p95","floor","Bedrock p95",f.levels.p95,f.sourceDate,"Bitview 十组模型共识底价的 95% 分位，近期风险线。");
      add("p99","floor","Bedrock p99",f.levels.p99,f.sourceDate,"十模型共识底价的 99% 分位，核心底部区。");
      add("p995","floor","Bedrock p99.5",f.levels.p995,f.sourceDate,"十模型共识底价的 99.5% 分位，深度压力区。");
    });
    safe(function(){
      var m=powerModelAt(Math.floor(Date.now()/DAY)*86400),today=statusDay();
      add("pl","model","幂律支撑",m.support,today,"长期幂律模型的历史底部线，按日期自动前移。",true);
      add("fair","model","幂律公允价",m.fair,today,"长期幂律回归线，代表模型意义上的公允价格。",true);
    });
    return out;
  }

  // 现价下方 6% 宽度内至少 3 条线，视为支撑密集带
  function cluster(levels,spot){
    var below=levels.filter(function(l){return l.price<spot}).sort(function(a,b){return a.price-b.price}),best=null;
    below.forEach(function(a){
      var inside=below.filter(function(b){return b.price>=a.price&&b.price<=a.price*1.06});
      if(inside.length>=3&&(!best||inside.length>best.length))best=inside;
    });
    return best?{lo:best[0].price,hi:best[best.length-1].price,n:best.length}:null;
  }
  function staleText(l){return !l.calc&&!!l.day&&ageOf(l.day)>STALE_DAYS}
  // 标签防重叠：按理想位置分组，组内等距排列并以理想位置的平均值居中
  function relax(items,gapPx,minY,maxY){
    var groups=[];
    items.forEach(function(it){
      groups.push({list:[it],sum:it.want});
      for(;;){
        var g=groups[groups.length-1],n=g.list.length,start=g.sum/n-(n-1)*gapPx/2;
        start=Math.max(minY,Math.min(maxY-(n-1)*gapPx,start));g.start=start;
        var prev=groups[groups.length-2];
        if(prev&&prev.start+prev.list.length*gapPx>start){prev.list=prev.list.concat(g.list);prev.sum+=g.sum;groups.pop();continue}
        break;
      }
    });
    groups.forEach(function(g){g.list.forEach(function(it,k){it.y=g.start+k*gapPx})});
    return items;
  }
  function render(){
    raf=0;
    var box=el("homeLadder");
    if(!box||box.offsetParent===null)return;
    var spot=+S.price,all=collect(),svg=el("ladderSvg"),rows=el("ladderRows"),chart=el("ladderChart"),empty=el("ladderEmpty");
    document.querySelectorAll("[data-lad-filter]").forEach(function(b){b.setAttribute("aria-pressed",String(b.dataset.ladFilter===filter))});
    if(!(spot>0)||!all.length){
      svg.innerHTML="";rows.innerHTML="";empty.hidden=false;
      el("ladderLead").textContent="等待价格与成本数据。";el("ladderOff").innerHTML="";el("ladderDetail").innerHTML="";
      el("ladderStatus").textContent="等待数据";return;
    }
    empty.hidden=true;
    var lo=spot*0.6,hi=spot*1.35,match=function(l){return filter==="all"||l.g===filter};
    var inRange=all.filter(function(l){return l.price>=lo&&l.price<=hi});
    var shown=inRange.filter(match);

    // 一句话结论
    var below=all.filter(function(l){return l.price<spot}).sort(function(a,b){return b.price-a.price})[0];
    var above=all.filter(function(l){return l.price>spot}).sort(function(a,b){return a.price-b.price})[0];
    var cl=cluster(inRange,spot),pct=function(p){return Math.abs((p/spot-1)*100).toFixed(1)+"%"};
    var lead=below?"最近的支撑是 <b>"+esc(below.name)+"</b>，低 "+pct(below.price):"现价已低于全部关键位";
    if(cl)lead+="；最厚的一层在 <b>"+short(cl.lo)+"–"+short(cl.hi)+"</b>，"+cl.n+" 条线重叠";
    else if(above)lead+="；上方最近是 <b>"+esc(above.name)+"</b>，高 "+pct(above.price);
    el("ladderLead").innerHTML=lead+"。";

    // 几何
    var W=Math.max(300,chart.clientWidth||340),AX=46,LX=92,GAP=36;
    var items=shown.map(function(l){return{l:l,price:l.price}}).concat([{spot:true,price:spot}]).sort(function(a,b){return b.price-a.price});
    var H=Math.max(300,items.length*GAP+20),TOP=10+GAP/2,BOT=H-10-GAP/2;
    chart.style.height=H+"px";svg.setAttribute("viewBox","0 0 "+W+" "+H);svg.setAttribute("height",H);
    var prices=items.map(function(i){return i.price}),pmax=Math.max.apply(null,prices)*1.015,pmin=Math.min.apply(null,prices)*0.985;
    if(!(pmax>pmin)){pmax=spot*1.05;pmin=spot*0.95}
    var y=function(p){return TOP+(pmax-p)/(pmax-pmin)*(BOT-TOP)};
    // 左轴按真实价格比例；右侧标签等距排列，用细连线对应
    items.forEach(function(it,i){it.want=y(it.price);it.y=items.length>1?TOP+i*(BOT-TOP)/(items.length-1):(TOP+BOT)/2});
    if(!items.some(function(i){return i.l&&i.l.id===selected}))selected=((items.find(function(i){return i.l&&i.price<spot})||items.find(function(i){return i.l})||{}).l||{}).id||"";

    var g='<defs><linearGradient id="ladDensity" gradientUnits="userSpaceOnUse" x1="0" y1="'+TOP+'" x2="0" y2="'+BOT+'">';
    // 支撑密度光带：每个价位按 ±1.2% 的高斯核叠加
    var levels=items.filter(function(i){return i.l}),steps=48;
    for(var s=0;s<=steps;s++){
      var py=TOP+(BOT-TOP)*s/steps,pp=pmax-(pmax-pmin)*s/steps,d=0;
      levels.forEach(function(i){var z=(i.price/pp-1)/0.012;d+=Math.exp(-0.5*z*z)});
      g+='<stop offset="'+(s/steps).toFixed(3)+'" style="stop-color:var(--lad-floor);stop-opacity:'+Math.min(.95,d*.42).toFixed(3)+'"/>';
    }
    g+='</linearGradient></defs>';
    // 相对现价的百分比刻度
    for(var k=-60;k<=60;k+=10){
      if(!k)continue;var tp=spot*(1+k/100);if(tp<pmin||tp>pmax)continue;var ty=y(tp);if(Math.abs(ty-y(spot))<14)continue;
      g+='<line x1="'+(AX-5)+'" x2="'+(AX+5)+'" y1="'+ty.toFixed(1)+'" y2="'+ty.toFixed(1)+'" style="stroke:var(--border-subtle)"/>';
      g+='<text x="'+(AX-12)+'" y="'+(ty+4).toFixed(1)+'" style="fill:var(--text-tertiary);font-size:11px;text-anchor:end;font-variant-numeric:tabular-nums">'+(k>0?"+":"−")+Math.abs(k)+'%</text>';
    }
    g+='<line x1="'+AX+'" x2="'+AX+'" y1="'+(TOP-12)+'" y2="'+(BOT+12)+'" style="stroke:var(--border-subtle);stroke-width:1"/>';
    g+='<g class="lad-glow"><rect x="'+(AX-9)+'" y="'+TOP+'" width="18" height="'+(BOT-TOP)+'" rx="9" style="fill:url(#ladDensity);opacity:.32"/>';
    g+='<rect x="'+(AX-3)+'" y="'+TOP+'" width="6" height="'+(BOT-TOP)+'" rx="3" style="fill:url(#ladDensity)"/></g>';
    // 现价线横贯整个图表
    var sy=y(spot).toFixed(1);
    g+='<line x1="'+(AX-26)+'" x2="'+AX+'" y1="'+sy+'" y2="'+sy+'" style="stroke:var(--lad-spot);stroke-width:1.5;stroke-linecap:round"/>';
    var html="",dots="",hot="";
    items.forEach(function(it){
      var ly=it.y.toFixed(1),dy=it.want.toFixed(1),top='style="top:'+(it.y-16).toFixed(1)+'px"';
      if(it.spot){
        hot+='<path d="M'+AX+' '+dy+' C '+(AX+14)+' '+dy+', '+(LX-8)+' '+ly+', '+LX+' '+ly+'" style="fill:none;stroke:var(--lad-spot);stroke-width:1.5;opacity:.85"/>';
        html+='<div class="lad-row spot" '+top+'><span class="lad-name"><b>'+(S.manualPrice?"手动试算价":"现价")+'</b></span><span class="lad-val"><b>'+money(spot)+'</b><small></small></span></div>';
        return;
      }
      var l=it.l,col="var("+GROUP[l.g].v+")",st=staleText(l);
      var on=l.id===selected,curve='<path d="M'+AX+' '+dy+' C '+(AX+14)+' '+dy+', '+(LX-8)+' '+ly+', '+LX+' '+ly+'" style="fill:none;stroke:'+col+';stroke-width:'+(on?1.75:1)+';opacity:'+(on?.95:.32)+'"/>';
      if(on)hot+=curve;else g+=curve;
      dots+='<circle cx="'+AX+'" cy="'+dy+'" r="'+(on?5:3.5)+'" style="fill:'+col+';stroke:var(--surface-0);stroke-width:'+(on?2:1.5)+'"/>';
      html+='<button type="button" class="lad-row" data-lad-id="'+esc(l.id)+'" aria-pressed="'+(l.id===selected)+'" aria-label="'+esc(l.name)+' '+money(l.price)+' '+gap(l.price,spot)+(st?' 数据滞后':'')+'" '+top+'>'+
        '<span class="lad-name"><i style="background:'+col+'"></i><b>'+esc(l.name)+'</b>'+(st?'<em title="数据滞后"></em>':'')+'</span>'+
        '<span class="lad-val"><b>'+money(l.price)+'</b><small>'+gap(l.price,spot)+'</small></span></button>';
    });
    g+=hot+dots+'<circle cx="'+AX+'" cy="'+sy+'" r="11" style="fill:var(--lad-spot);opacity:.16"/><circle cx="'+AX+'" cy="'+sy+'" r="5" style="fill:var(--lad-spot);stroke:var(--surface-0);stroke-width:2"/>';
    svg.innerHTML=g;rows.innerHTML=html;

    // 图外的线
    el("ladderOff").innerHTML=all.filter(function(l){return(l.price>hi||l.price<lo)&&match(l)}).sort(function(a,b){return b.price-a.price}).map(function(l){
      return '<button type="button" data-lad-id="'+esc(l.id)+'"><span><i style="background:var('+GROUP[l.g].v+')"></i>'+esc(l.name)+' <em>'+(l.price>hi?"↑ 图表上方":"↓ 图表下方")+'</em></span><span>'+short(l.price)+' · '+gap(l.price,spot)+'</span></button>'}).join("");

    // 详情
    var d=all.find(function(l){return l.id===selected});
    if(d){
      var v=(d.price/spot-1)*100,a=ageOf(d.day),st2=staleText(d);
      el("ladderDetail").innerHTML='<div class="dh"><b><i style="background:var('+GROUP[d.g].v+')"></i>'+esc(d.name)+'</b><small>'+GROUP[d.g].label+'</small></div>'+
        '<div class="dp"><b>'+money(d.price)+'</b><span>现价需'+(v<0?"下跌":"上涨")+' '+Math.abs(v).toFixed(1)+'% 触及</span></div>'+
        '<p>'+esc(d.desc)+'</p>'+
        '<p class="day'+(st2?" warn":"")+'">'+(d.calc?"模型按日期计算":(!d.day?"数据日期未知":(st2?"数据日 "+esc(d.day)+" · 已滞后 "+a+" 天，等待更新":"数据日 "+esc(d.day)+" · 及时")))+'</p>';
    }else el("ladderDetail").innerHTML="";

    var staleN=all.filter(staleText).length,status=el("ladderStatus");
    status.textContent=all.length+" 条线"+(staleN?" · "+staleN+" 条滞后":" · 数据及时");
    status.className="lad-status"+(staleN?" warn":"");
  }

  function queue(){if(!raf)raf=requestAnimationFrame(render)}

  // 交互：事件委托，筛选与选中只影响本模块
  el("homeLadder").addEventListener("click",function(e){
    var f=e.target.closest("[data-lad-filter]"),r=e.target.closest("[data-lad-id]");
    if(f){filter=f.dataset.ladFilter;queue();return}
    if(r){selected=r.dataset.ladId;queue()}
  });

  // 在已有渲染函数之后顺带刷新本模块；原逻辑不变
  ["renderBitviewOverview","renderBitviewFloor","renderFloorSummary","renderAhr","renderPriceSpark","setTab","setFocusAhrModel","renderCapitalizedPrice"].forEach(function(n){
    var orig=window[n];if(typeof orig!=="function")return;
    window[n]=function(){var r=orig.apply(this,arguments);queue();return r};
  });
  window.addEventListener("themechange",queue);
  window.addEventListener("resize",queue,{passive:true});

  // 首页也需要底价数据：先用本机缓存，再在空闲时按各自的缓存周期更新
  safe(function(){
    var c=floorReadCache();
    if(c&&floorSource==="snapshot"){floorRows=c.rows;floorStamp=c.stamp||"";floorSource="cache"}
    bitviewFloorRestore();
  });
  function refreshSources(){
    if(document.visibilityState==="hidden")return;
    safe(function(){refreshBitviewFloor(false)});
    safe(function(){refreshFloorModel(false)});
    refreshCap(false);
  }
  runWhenNetworkIdle(refreshSources,2500,15000);
  document.addEventListener("visibilitychange",function(){if(document.visibilityState==="visible"){refreshSources();queue()}});
  queue();
})();
