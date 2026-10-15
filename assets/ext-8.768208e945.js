
(function(){
  "use strict";
  // V25.1.23：周期底部 / 顶部探索
  // 数据优先级：Bitview / BRK 公开序列 → Coin Metrics 社区接口（仅在 Bitview 未提供时）→ 本站按公开公式计算。
  // 只清点经验阈值是否触发，不做预测；缺失的数据显示「暂不可用」，不估算填补。
  var BV="https://bitview.space/api/series/bulk",URPD="https://bitview.space/api/urpd/all?agg=lin1000&weight=raw";
  var CM="https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&metrics=CapMVRVCur,SplyCur,PriceUSD&frequency=1d&start_time=2010-08-01&page_size=10000";
  var KEY="btc_cycle_signals_v4",TTL=6*3600*1000,DAYMS=864e5,SPAN="2010-07-18";
  var state={hist:null,ts:0,src:{},loading:false,note:""},inited=false;
  function $(id){return document.getElementById(id)}
  function isDay(d){return /^\d{4}-\d{2}-\d{2}$/.test(String(d||""))}
  function dts(d){var t=Date.parse(String(d)+"T00:00:00Z");return Number.isFinite(t)?t:null}
  function fmtMoney(v){return v>0?"$"+Math.round(v).toLocaleString("en-US"):"--"}
  function getJson(url,ms){
    var ctl=typeof AbortController==="function"?new AbortController():null,timer=setTimeout(function(){if(ctl)ctl.abort()},ms||20000);
    return fetch(url,{cache:"no-store",signal:ctl?ctl.signal:undefined}).then(function(r){if(!r.ok)throw new Error("HTTP "+r.status);return r.json()}).finally(function(){clearTimeout(timer)});
  }
  function bulk(series){
    var u=new URL(BV);u.searchParams.set("index","day1");u.searchParams.set("series",series.join(","));u.searchParams.set("start",SPAN);
    return getJson(u.toString(),25000).then(function(raw){
      var d=pickSeries(raw,"date",0);if(!Array.isArray(d)||!d.length)throw new Error("no dates");
      var out={date:d};
      series.slice(1).forEach(function(n,i){var a=pickSeries(raw,n,i+1);if(!Array.isArray(a)||!a.some(function(v){return +v>0||+v<0}))throw new Error("missing "+n);out[n]=a});
      return out;
    });
  }
  function toMap(cols,name){var m={};cols.date.forEach(function(d,i){var v=+cols[name][i];if(isDay(d)&&Number.isFinite(v))m[d]=v});return m}

  // ---------- 数据装载 ----------
  async function load(){
    var src={},maps={};
    // 1. Bitview 已验证序列。每个序列单独请求：一次请求的数据点过多时，Bitview 会拒绝整个请求。
    var CORE=["price","sth_realized_price","true_market_mean","lth_supply_in_loss_share","lth_sopr_1w","lth_coindays_destroyed_sum_1w"];
    var got=await Promise.all(CORE.map(function(n){return bulk(["date",n]).then(function(c){maps[n]=toMap(c,n);return true}).catch(function(){return false})}));
    src.core=got.some(Boolean)?"Bitview":null;
    // 2. 已实现价格：Bitview → Coin Metrics（MVRV 反推）
    var cm=null;
    try{var rp=await bulk(["date","realized_price"]);maps.realized=toMap(rp,"realized_price");src.realized="Bitview"}
    catch(e){
      try{cm=await loadCM();maps.realized=cm.realized;src.realized="Coin Metrics";if(!maps.price){maps.price=cm.price;src.core=src.core||"Coin Metrics"}}catch(e2){}
    }
    // 3. 流通供应量（用于 MVRV-Z）：Bitview → Coin Metrics → 按出块进度估算
    try{var sp=await bulk(["date","circulating_supply"]);maps.supply=toMap(sp,"circulating_supply");src.supply="Bitview"}
    catch(e){
      try{if(!cm)cm=await loadCM();maps.supply=cm.supply;src.supply="Coin Metrics"}
      catch(e2){maps.supply=null;src.supply="按出块进度估算"}
    }
    // 盈利供应占比（百分数）历史
    try{var ps=await bulk(["date","supply_in_profit_share"]);maps.profit=toMap(ps,"supply_in_profit_share");src.profit="Bitview"}catch(e){maps.profit=null}
    // 4. Puell Multiple：Bitview → 本站按发行量公式计算
    try{var pu=await bulk(["date","puell_multiple"]);maps.puell=toMap(pu,"puell_multiple");src.puell="Bitview"}
    catch(e){maps.puell=null;src.puell="本站计算"}
    // 价格兜底：本站日线
    if(maps.price&&Object.keys(maps.price).length)src.price=src.price||"Bitview";
    if(!maps.price||!Object.keys(maps.price).length){
      maps.price={};
      try{normalizedDaily().forEach(function(r){maps.price[new Date(r.time*1000).toISOString().slice(0,10)]=r.close})}catch(e){}
      src.price="本站日线";
    }
    return {maps:maps,src:src};
  }
  async function loadCM(){
    var j=await getJson(CM,25000),rows=Array.isArray(j&&j.data)?j.data:[],realized={},supply={},price={};
    rows.forEach(function(r){
      var d=String(r.time||"").slice(0,10),mv=+r.CapMVRVCur,s=+r.SplyCur,p=+r.PriceUSD;
      if(!isDay(d))return;
      if(p>0)price[d]=p;
      if(p>0&&mv>0)realized[d]=p/mv;
      if(s>0)supply[d]=s;
    });
    if(!Object.keys(realized).length)throw new Error("cm empty");
    return {realized:realized,supply:supply,price:price};
  }

  // ---------- 计算 ----------
  var HALVINGS=[["2009-01-03",0,50],["2012-11-28",210000,25],["2016-07-09",420000,12.5],["2020-05-11",630000,6.25],["2024-04-20",840000,3.125],["2028-04-15",1050000,1.5625]];
  function subsidyOn(d){var s=50;for(var i=0;i<HALVINGS.length;i++)if(d>=HALVINGS[i][0])s=HALVINGS[i][2];return s}
  function estSupply(d){
    var t=dts(d),h=0;
    for(var i=0;i<HALVINGS.length-1;i++){
      var a=dts(HALVINGS[i][0]),b=dts(HALVINGS[i+1][0]);
      if(t<=b||i===HALVINGS.length-2){h=HALVINGS[i][1]+(t-a)/(b-a)*(HALVINGS[i+1][1]-HALVINGS[i][1]);if(t>b)h=HALVINGS[i+1][1]+(t-b)/DAYMS*144;break}
    }
    var sup=0,left=Math.max(0,h);
    for(var k=0;k<34&&left>0;k++){var n=Math.min(210000,left);sup+=n*50/Math.pow(2,k);left-=n}
    return sup;
  }
  function pctile(arr,p){var a=arr.filter(function(v){return Number.isFinite(v)}).sort(function(x,y){return x-y});if(!a.length)return null;var i=(a.length-1)*p,lo=Math.floor(i),hi=Math.ceil(i);return a[lo]+(a[hi]-a[lo])*(i-lo)}
  function episodes(days,flags){
    var out=[],lastOn=-1e15;
    for(var i=0;i<days.length;i++){if(!flags[i])continue;var t=dts(days[i]);if(t-lastOn>120*DAYMS)out.push(days[i].slice(0,7));lastOn=t}
    return out;
  }
  function streak(flags){var n=0;for(var i=flags.length-1;i>=0&&flags[i];i--)n++;return n}

  function build(loaded){
    var M=loaded.maps,days=Object.keys(M.price||{}).filter(isDay).sort(),price=days.map(function(d){return M.price[d]});
    var col=function(m){return days.map(function(d){return m&&Number.isFinite(m[d])?m[d]:null})};
    var rp=col(M.realized),sth=col(M.sth_realized_price),tmm=col(M.true_market_mean),psil=col(M.lth_supply_in_loss_share),lsopr=col(M.lth_sopr_1w),lcdd=col(M.lth_coindays_destroyed_sum_1w);
    var supply=days.map(function(d){return M.supply&&M.supply[d]>0?M.supply[d]:estSupply(d)});
    // MVRV 与 MVRV-Z（扩展窗口标准差）
    var mvrv=days.map(function(d,i){return rp[i]>0?price[i]/rp[i]:null}),z=[],n=0,mean=0,m2=0;
    days.forEach(function(d,i){
      var mc=price[i]*supply[i];if(!(mc>0)){z.push(null);return}
      n++;var dl=mc-mean;mean+=dl/n;m2+=dl*(mc-mean);
      var sd=n>30?Math.sqrt(m2/(n-1)):0;
      z.push(rp[i]>0&&sd>0?(mc-rp[i]*supply[i])/sd:null);
    });
    // Puell：Bitview 优先，否则按每日发行价值 / 365 日均值计算
    var puell;
    if(M.puell)puell=col(M.puell);
    else{
      var iss=days.map(function(d,i){return price[i]*subsidyOn(d)*144}),sum=0;puell=[];
      iss.forEach(function(v,i){sum+=v;if(i>=365)sum-=iss[i-365];puell.push(i>=364?v/(sum/365):null)});
    }
    // Pi Cycle：111 日均线 / (2 × 350 日均线)
    var pi=[],s111=0,s350=0;
    price.forEach(function(p,i){s111+=p;s350+=p;if(i>=111)s111-=price[i-111];if(i>=350)s350-=price[i-350];pi.push(i>=349?(s111/111)/(2*s350/350):null)});
    // 幂律阻力
    var res=days.map(function(d){try{return powerModelAt(dts(d)/1000).resistance}catch(e){return null}});
    // AHR999（与首页同一模型与分界）
    var ahrMap={};
    try{focusAhrHistory(DAILY,typeof focusAhrModel==="string"?focusAhrModel:"refit").forEach(function(r){ahrMap[new Date(r.time*1000).toISOString().slice(0,10)]=r.value})}catch(e){}
    var ahr=days.map(function(d){return Number.isFinite(ahrMap[d])?ahrMap[d]:null});
    var profit=col(M.profit);if(pctile(profit,.99)>1.5)profit=profit.map(function(v){return v==null?null:v/100});
    var psilTop=pctile(psil,.99);if(psilTop!=null&&psilTop>1.5)psil=psil.map(function(v){return v==null?null:v/100});
    return {profit:profit,days:days,price:price,rp:rp,sth:sth,tmm:tmm,psil:psil,lsopr:lsopr,lcdd:lcdd,mvrv:mvrv,z:z,puell:puell,pi:pi,res:res,ahr:ahr,src:loaded.src,
      psilP90:pctile(psil,.9),cddP95:pctile(lcdd,.95)};
  }

  function lastIdx(arr){for(var i=arr.length-1;i>=0;i--)if(arr[i]!=null&&Number.isFinite(arr[i]))return i;return -1}
  function pctTxt(v){return(v>=0?"+":"−")+Math.abs(v).toFixed(1)+"%"}
  // 统一产出一行信号
  function sig(o){return o}
  function evaluate(H){
    var spot=+S.price>0?+S.price:null,B=[],T=[],D=H.days;
    function seriesSignal(def){
      var i=lastIdx(def.arr);
      if(i<0)return {id:def.id,cat:def.cat,name:def.name,thr:def.thrText,state:"na",val:"暂不可用",dist:"数据未取得",close:0,desc:def.desc,hist:[],src:def.src,day:""};
      var v=def.live!=null?def.live:def.arr[i],flags=D.map(function(_,k){var x=def.arr[k];return x!=null&&def.test(x,k)});
      var on=def.test(v,i,true),close=Math.max(0,Math.min(1,def.close(v))),near=!on&&close>=.85;
      return {id:def.id,cat:def.cat,name:def.name,thr:def.thrText,state:on?"on":near?"near":"off",val:def.fmt(v),dist:on?(streak(flags)>1?"已持续 "+streak(flags)+" 天":"已触发"):def.distText(v),close:close,desc:def.desc,hist:episodes(D,flags),src:def.src,day:D[i]};
    }
    var ip=lastIdx(H.price),p=spot||H.price[ip];
    // ---- 底部 ----
    B.push(seriesSignal({id:"mvrv",cat:"估值",name:"MVRV 跌破 1",thrText:"MVRV < 1",arr:H.mvrv,live:H.rp[lastIdx(H.rp)]>0&&spot?spot/H.rp[lastIdx(H.rp)]:null,
      test:function(x){return x<1},close:function(x){return 1-(x-1)/1.5},fmt:function(x){return x.toFixed(2)},distText:function(x){return "现价需跌 "+Math.abs((1/x-1)*100).toFixed(1)+"%"},
      desc:"现价低于全网平均持币成本（已实现价格），全网整体浮亏。历史上集中出现在熊市末段。与 NUPL < 0、MVRV-Z < 0 等价，因此只计一次。",src:H.src.realized||"--"}));
    B.push(seriesSignal({id:"sth",cat:"成本",name:"跌破短期持有者成本",thrText:"现价 < STH 实现价格",arr:H.price.map(function(x,k){return H.sth[k]>0?x/H.sth[k]:null}),live:spot&&H.sth[lastIdx(H.sth)]>0?spot/H.sth[lastIdx(H.sth)]:null,
      test:function(x){return x<1},close:function(x){return 1-(x-1)/.5},fmt:function(x){return fmtMoney(H.sth[lastIdx(H.sth)])},distText:function(x){return "现价需跌 "+Math.abs((1/x-1)*100).toFixed(1)+"%"},
      desc:"现价跌破持币不足 150 天的短期持有者平均成本，新进资金整体浮亏。熊市里常持续数月，牛市回调也可能短暂触发。",src:H.src.core||"--"}));
    B.push(seriesSignal({id:"tmm",cat:"成本",name:"跌破活跃市场成本",thrText:"现价 < True Market Mean",arr:H.price.map(function(x,k){return H.tmm[k]>0?x/H.tmm[k]:null}),live:spot&&H.tmm[lastIdx(H.tmm)]>0?spot/H.tmm[lastIdx(H.tmm)]:null,
      test:function(x){return x<1},close:function(x){return 1-(x-1)/.5},fmt:function(x){return fmtMoney(H.tmm[lastIdx(H.tmm)])},distText:function(x){return "现价需跌 "+Math.abs((1/x-1)*100).toFixed(1)+"%"},
      desc:"现价跌破活跃投资者的资本成本中枢（True Market Mean），比短期持有者成本更深一层。",src:H.src.core||"--"}));
    B.push(seriesSignal({id:"psil",cat:"长期持有者",name:"长期筹码大面积浮亏",thrText:"LTH 亏损供应 ≥ 历史 90% 分位",arr:H.psil,
      test:function(x){return H.psilP90!=null&&x>=H.psilP90},close:function(x){return H.psilP90?x/H.psilP90:0},fmt:function(x){return (x*100).toFixed(1)+"%"},distText:function(x){return "阈值 "+(H.psilP90*100).toFixed(1)+"%"},
      desc:"长期持有者（≥150 天）中处于浮亏的供应占比进入历史前 10% 高位，耐心资金也普遍承压，常见于投降阶段。阈值按全历史分位计算，含事后信息。",src:H.src.core||"--"}));
    B.push(seriesSignal({id:"lsopr",cat:"长期持有者",name:"长期持有者亏损卖出",thrText:"LTH SOPR（周）< 1",arr:H.lsopr,
      test:function(x){return x<1},close:function(x){return 1-(x-1)/.5},fmt:function(x){return x.toFixed(3)},distText:function(x){return "高于 1 约 "+((x-1)*100).toFixed(1)+"%"},
      desc:"长期持有者最近一周卖出的筹码整体亏损，说明连长期资金也在割肉离场。",src:H.src.core||"--"}));
    B.push(seriesSignal({id:"puellLow",cat:"矿工",name:"矿工收入枯竭",thrText:"Puell Multiple < 0.5",arr:H.puell,
      test:function(x){return x<.5},close:function(x){return 1-(x-.5)/1},fmt:function(x){return x.toFixed(2)},distText:function(x){return "需再降 "+((1-.5/x)*100).toFixed(0)+"%"},
      desc:"矿工每日发行收入低于一年均值的一半，弱势矿工被迫出清。"+(H.src.puell==="本站计算"?"Bitview 未提供该序列时按「每日发行价值 ÷ 365 日均值」计算，不含手续费。":""),src:H.src.puell||"--"}));
    B.push(seriesSignal({id:"ahrLow",cat:"估值",name:"AHR999 深度低估",thrText:"AHR999 < 0.45",arr:H.ahr,live:(function(){try{var s=focusAhrSnapshot(S.ahr,focusAhrModel);return s?s.value:null}catch(e){return null}})(),
      test:function(x){return x<.45},close:function(x){return 1-(x-.45)/.75},fmt:function(x){return x.toFixed(3)},distText:function(x){return "现价需跌 "+((1-Math.sqrt(.45/x))*100).toFixed(1)+"%"},
      desc:"AHR999 进入深度低估区，与首页使用同一模型和分界。",src:"本站计算"}));
    (function(){
      var f=null;try{if(bitviewFloorValid(bitviewFloorData))f=bitviewFloorData}catch(e){}
      if(!f||!(p>0)){B.push({id:"bedrock",cat:"底价",name:"触及共识底价",thr:"现价 ≤ Bedrock p95",state:"na",val:"暂不可用",dist:"数据未取得",close:0,desc:"现价触及 Bitview 十模型共识底价的 95% 分位。",hist:[],src:"Bitview",day:""});return}
      var lv=+f.levels.p95,on=p<=lv,gap=(lv/p-1)*100;
      B.push({id:"bedrock",cat:"底价",name:"触及共识底价",thr:"现价 ≤ Bedrock p95",state:on?"on":gap>-10?"near":"off",val:fmtMoney(lv),dist:on?"已触发":"现价需跌 "+Math.abs(gap).toFixed(1)+"%",close:Math.max(0,Math.min(1,1+gap/40)),desc:"现价触及 Bitview 十模型共识底价的 95% 分位。底价模型只保存最新一天，因此不列历史触发。",hist:null,src:"Bitview",day:f.sourceDate||""});
    })();
    // ---- 顶部 ----
    T.push(seriesSignal({id:"z",cat:"估值",name:"MVRV-Z 过热",thrText:"MVRV-Z > 7",arr:H.z,
      test:function(x){return x>7},close:function(x){return x/7},fmt:function(x){return x.toFixed(2)},distText:function(x){return "距 7 还差 "+(7-x).toFixed(2)},
      desc:"市值高于已实现市值的幅度超过历史波动的 7 倍，历史上对应主要周期顶部区域。"+(H.src.supply==="按出块进度估算"?"流通量按出块进度估算，误差约千分之几。":"")+"当前 MVRV "+(lastIdx(H.mvrv)>=0?H.mvrv[lastIdx(H.mvrv)].toFixed(2):"--")+"。",src:(H.src.realized||"--")+" · 本站计算"}));
    T.push(seriesSignal({id:"ahrHigh",cat:"估值",name:"AHR999 高估风险",thrText:"AHR999 ≥ 5",arr:H.ahr,live:(function(){try{var s=focusAhrSnapshot(S.ahr,focusAhrModel);return s?s.value:null}catch(e){return null}})(),
      test:function(x){return x>=5},close:function(x){return x/5},fmt:function(x){return x.toFixed(3)},distText:function(x){return "现价需涨 "+((Math.sqrt(5/x)-1)*100).toFixed(0)+"%"},
      desc:"AHR999 进入高估风险区，与首页使用同一模型和分界。",src:"本站计算"}));
    T.push(seriesSignal({id:"puellHigh",cat:"矿工",name:"矿工收入暴增",thrText:"Puell Multiple > 4",arr:H.puell,
      test:function(x){return x>4},close:function(x){return x/4},fmt:function(x){return x.toFixed(2)},distText:function(x){return "需升至当前 "+(4/x).toFixed(1)+" 倍"},
      desc:"矿工每日发行收入达到一年均值的 4 倍以上，历史上出现在牛市狂热期。",src:H.src.puell||"--"}));
    T.push(seriesSignal({id:"pi",cat:"价格结构",name:"Pi Cycle 顶部交叉",thrText:"111 日均线 ≥ 2 × 350 日均线",arr:H.pi,
      test:function(x){return x>=1},close:function(x){return x},fmt:function(x){return (x*100).toFixed(0)+"%"},distText:function(x){return "差距 "+((1-x)*100).toFixed(0)+"%"},
      desc:"短期均线追上长期均线的两倍，代表涨速异常。曾在 2013、2017、2021 年 4 月附近触发，但 2021 年 11 月的高点没有触发。数值为 111 日均线占 2 × 350 日均线的比例。",src:H.src.price+" · 本站计算"}));
    T.push(seriesSignal({id:"power",cat:"价格结构",name:"触及幂律阻力",thrText:"现价 ≥ 幂律阻力线",arr:H.price.map(function(x,k){return H.res[k]>0?x/H.res[k]:null}),live:(function(){try{return spot?spot/powerModelAt(Date.now()/1000).resistance:null}catch(e){return null}})(),
      test:function(x){return x>=1},close:function(x){return x},fmt:function(x){try{return fmtMoney(powerModelAt(Date.now()/1000).resistance)}catch(e){return "--"}},distText:function(x){return "现价需涨 "+((1/x-1)*100).toFixed(0)+"%"},
      desc:"现价触及长期幂律模型的阻力线（与分析页幂律走廊同一模型）。",src:"本站计算"}));
    T.push(seriesSignal({id:"cdd",cat:"长期持有者",name:"老筹码集中卖出",thrText:"LTH 周 CDD ≥ 历史 95% 分位",arr:H.lcdd,
      test:function(x){return H.cddP95!=null&&x>=H.cddP95},close:function(x){return H.cddP95?x/H.cddP95:0},fmt:function(x){return (x/1e6).toFixed(1)+"M"},distText:function(x){return "阈值 "+(H.cddP95/1e6).toFixed(1)+"M"},
      desc:"长期持有者一周内销毁的币天数进入历史前 5% 高位，代表沉睡已久的老筹码集中移动，常见于牛市派发期。阈值按全历史分位计算，含事后信息。",src:H.src.core||"--"}));
    if(H.profit&&lastIdx(H.profit)>=0){T.push(seriesSignal({id:"profit",cat:"长期持有者",name:"盈利筹码极端集中",thrText:"盈利供应 > 95%",arr:H.profit,
      test:function(x){return x>.95},close:function(x){return x/.95},fmt:function(x){return (x*100).toFixed(1)+"%"},distText:function(x){return "距 95% 还差 "+((.95-x)*100).toFixed(1)+" 点"},
      desc:"成本低于现价的流通供应占比超过 95%，几乎所有持币者都在盈利，市场整体获利丰厚。",src:"Bitview"}))}
    else (function(){
      var share=profitShare(p);
      if(share==null){T.push({id:"profit",cat:"长期持有者",name:"盈利筹码极端集中",thr:"盈利供应 > 95%",state:"na",val:"暂不可用",dist:"数据未取得",close:0,desc:"超过 95% 的流通筹码处于盈利。",hist:null,src:"Bitview URPD",day:""});return}
      var on=share>.95;
      T.push({id:"profit",cat:"长期持有者",name:"盈利筹码极端集中",thr:"盈利供应 > 95%",state:on?"on":share>.9?"near":"off",val:(share*100).toFixed(1)+"%",dist:on?"已触发":"距 95% 还差 "+((.95-share)*100).toFixed(1)+" 点",close:share/.95,desc:"按 Bitview 全网筹码分布（URPD）计算成本低于现价的供应占比。超过 95% 说明几乎所有持币者都在盈利，市场整体获利丰厚。筹码分布只取最新一天，因此不列历史触发。",hist:null,src:"Bitview URPD",day:urpdDay||""});
    })();
    var ORD={bottom:["估值","成本","底价","长期持有者","矿工"],top:["估值","价格结构","长期持有者","矿工"]};
    var sortBy=function(list,ord){return list.map(function(x,i){return[x,i]}).sort(function(a,b){return(ord.indexOf(a[0].cat)-ord.indexOf(b[0].cat))||(a[1]-b[1])}).map(function(x){return x[0]})};
    return {bottom:sortBy(B,ORD.bottom),top:sortBy(T,ORD.top)};
  }

  // 盈利供应占比：读筹码分布模块已缓存的 URPD，没有则单独请求一次
  var urpdCache=null,urpdDay="";
  function profitShare(p){
    if(!(p>0))return null;
    var b=urpdCache;
    if(!b){try{var c=JSON.parse(localStorage.getItem("btc_dist_v1")||"null");if(c&&Array.isArray(c.data)){b=c.data;urpdDay=c.day||""}}catch(e){}}
    if(!b||!b.length)return null;
    var rows=b.map(function(x){return[+x.price_floor,+x.supply]}).filter(function(x){return x[0]>=0&&x[1]>0}).sort(function(a,c){return a[0]-c[0]});
    var w=0;for(var i=1;i<rows.length;i++){var d=rows[i][0]-rows[i-1][0];if(d>0&&(!w||d<w))w=d}w=w||1000;
    var tot=0,prof=0;rows.forEach(function(r){tot+=r[1];var f=Math.max(0,Math.min(1,(p-r[0])/w));prof+=r[1]*f});
    return tot>0?prof/tot:null;
  }
  async function ensureUrpd(){
    try{var c=JSON.parse(localStorage.getItem("btc_dist_v1")||"null");if(c&&Array.isArray(c.data)&&c.data.length&&Date.now()-(+c.ts||0)<TTL){urpdCache=c.data;urpdDay=c.day||"";return}}catch(e){}
    try{var j=await getJson(URPD,15000);if(j&&Array.isArray(j.buckets)&&j.buckets.length){urpdCache=j.buckets;urpdDay=j.date||""}}catch(e){}
  }

  // ---------- 渲染 ----------
  function esc2(t){return typeof esc==="function"?esc(t):String(t)}
  function renderKind(kind,list){
    var P=kind==="bottom"?"csBottom":"csTop",on=list.filter(function(x){return x.state==="on"}).length,near=list.filter(function(x){return x.state==="near"}).length,na=list.filter(function(x){return x.state==="na"}).length,valid=list.length-na;
    var count=$(P+"Count");count.textContent=on+" / "+valid;count.classList.toggle("on",on>0);
    $(P+"CountSub").textContent=(kind==="bottom"?"个底部信号已触发":"个顶部信号已触发")+(near?" · "+near+" 个接近":"")+(na?" · "+na+" 个暂缺数据":"");
    $(P+"Heat").innerHTML=list.map(function(x){return '<i class="'+x.state+'"></i>'}).join("");
    var html="",lastCat="";
    list.forEach(function(x){
      if(x.cat!==lastCat){html+='<div class="cs-group">'+esc2(x.cat)+'</div>';lastCat=x.cat}
      var hist=x.hist==null?"":'<p class="cs-hist">历史触发：'+(x.hist.length?x.hist.map(function(h){return "<b>"+h+"</b>"}).join(" · "):"在可得数据范围内未触发")+'</p>';
      html+='<details class="cs-row" data-id="'+x.id+'" data-state="'+x.state+'"><summary><span class="cs-dot"></span><span class="cs-main"><b>'+esc2(x.name)+'</b><small>'+esc2(x.thr)+'</small></span><span class="cs-val"><b>'+esc2(x.val)+'</b><small>'+esc2(x.dist)+'</small></span></summary>'+
        '<div class="cs-body"><div class="cs-bar"><i style="width:'+(Math.max(.03,Math.min(1,x.close))*100).toFixed(0)+'%"></i></div><p>'+esc2(x.desc)+'</p>'+hist+'<p class="cs-src">来源 · '+esc2(x.src)+(x.day?' · 数据日 '+esc2(x.day):'')+'</p></div></details>';
    });
    var keep={};document.querySelectorAll("#"+P+"List details[open]").forEach(function(d){keep[d.dataset.id]=1});
    $(P+"List").innerHTML=html||'<p class="cs-empty">暂无可用数据</p>';
    document.querySelectorAll("#"+P+"List details[data-id]").forEach(function(d){if(keep[d.dataset.id])d.open=true});
    var live=document.querySelector('small[data-fold-live="'+(kind==="bottom"?"cbottom":"ctop")+'"]');
    if(live&&valid){live.textContent=on+" / "+valid+" 已触发"+(near?" · "+near+" 个接近":"");live.classList.add("live")}
  }
  function badge(day,kind){
    var ok=state.hist&&state.hist.days.length,last=ok?state.hist.days[state.hist.days.length-1]:null,age=last?Math.floor((Date.now()-dts(last))/DAYMS):999;
    ["freshCycleBottom","freshCycleTop"].forEach(function(id){var e=$(id);if(!e)return;
      if(state.loading&&!ok){e.textContent="同步中";e.className="fresh-badge warn";return}
      if(!ok){e.textContent=state.note||"暂不可用";e.className="fresh-badge bad";return}
      e.textContent=(age>3?"滞后 · ":"数据日 · ")+last.slice(5);e.className="fresh-badge "+(age>3?"warn":"good");
    });
  }
  function render(){
    if(!state.hist){badge();return}
    var r;try{r=evaluate(state.hist)}catch(e){state.note="计算失败";badge();return}
    renderKind("bottom",r.bottom);renderKind("top",r.top);badge();
  }

  // ---------- 刷新与缓存 ----------
  function saveCache(){
    // 只缓存计算所需的列，数值四舍五入，控制体积
    try{
      var H=state.hist,r=function(a,k){return a.map(function(v){return v==null?null:+v.toPrecision(k)})};
      localStorage.setItem(KEY,JSON.stringify({v:4,ts:state.ts,src:H.src,days:H.days,price:r(H.price,7),rp:r(H.rp,7),sth:r(H.sth,7),tmm:r(H.tmm,7),psil:r(H.psil,5),profit:r(H.profit||[],4),lsopr:r(H.lsopr,5),lcdd:r(H.lcdd,5),z:r(H.z,4),puell:r(H.puell,4),pi:r(H.pi,4),res:r(H.res,6),psilP90:H.psilP90,cddP95:H.cddP95}));
    }catch(e){}
  }
  function readCache(){
    try{var c=JSON.parse(localStorage.getItem(KEY)||"null");if(!c||c.v!==4||!Array.isArray(c.days)||!c.days.length)return false;
      c.mvrv=c.price.map(function(p,i){return c.rp[i]>0?p/c.rp[i]:null});
      var ahrMap={};try{focusAhrHistory(DAILY,focusAhrModel).forEach(function(r){ahrMap[new Date(r.time*1000).toISOString().slice(0,10)]=r.value})}catch(e){}
      c.ahr=c.days.map(function(d){return Number.isFinite(ahrMap[d])?ahrMap[d]:null});
      state.hist=c;state.ts=+c.ts||0;return true}catch(e){return false}
  }
  async function refresh(force){
    if(state.loading)return;
    if(!force&&state.hist&&Date.now()-state.ts<TTL){render();return}
    state.loading=true;badge();
    try{
      var loaded=await load();await ensureUrpd();
      var H=build(loaded);
      if(!H.days.length)throw new Error("no data");
      state.hist=H;state.ts=Date.now();state.note="";saveCache();
      if(force&&typeof ntf==="function")ntf("周期底部 / 顶部探索已更新");
    }catch(e){
      state.note=state.hist?"更新失败，保留已有数据":"暂不可用";
      if(force&&typeof ntf==="function")ntf("周期信号暂不可用 · 已保留当前数据");
    }finally{state.loading=false;render()}
  }
  window.refreshCycleSignals=function(force){return refresh(!!force)};
  function init(){
    if(inited)return;inited=true;
    readCache();ensureUrpd().then(render);render();refresh(false);
    document.addEventListener("visibilitychange",function(){if(document.visibilityState==="visible")refresh(false)});
    var orig=window.renderPriceSpark,tick=0;if(typeof orig==="function")window.renderPriceSpark=function(){var r=orig.apply(this,arguments);if(state.hist&&!tick){tick=setTimeout(function(){tick=0;var sec=$("cycleBottom");if(sec&&sec.offsetParent!==null||$("cycleTop")&&$("cycleTop").offsetParent!==null)try{render()}catch(e){}},1500)}return r};
  }
  if(typeof lazySection==="function"){lazySection("cycleBottom",init);lazySection("cycleTop",init)}
})();
