
(function(){
  "use strict";
  // V26 Beta 20：统一的「数据化解读」组件——历史位置 + 信号之后 BTC 怎么走。
  // rows：[{day,value,price}]，按日连续。全部在浏览器内用已同步的 Bitview 历史计算。
  var EN=function(){return window.BTC_LANG==="en"};
  function med(a){if(!a.length)return null;var b=a.slice().sort(function(x,y){return x-y}),m=b.length>>1;return b.length%2?b[m]:(b[m-1]+b[m])/2}
  function pt(v){return v==null?"--":(v>=0?"+":"")+(v*100).toFixed(1)+"%"}
  function fwd(rows,i,n){var a=rows[i],b=rows[i+n];return a&&b&&a.price>0&&b.price>0?b.price/a.price-1:null}
  // —— V26.4.5：日历工具。日度按 UTC 日、月度按自然月编号；尚未结束的当天 / 当月不参与事件与收益 ——
  function dayNum(d){return Math.floor(Date.parse(String(d).slice(0,10)+"T00:00:00Z")/864e5)}
  function monNum(d){d=String(d);return (+d.slice(0,4))*12+(+d.slice(5,7))-1}
  function keyOf(unit){return unit==="month"?monNum:dayNum}
  function nowKey(unit){return keyOf(unit)(new Date().toISOString().slice(0,10))}
  function isNum(v){return typeof v==="number"&&isFinite(v)}
  var KCACHE=typeof WeakMap==="function"?new WeakMap():null;
  function keys(rows,unit){var c=KCACHE&&KCACHE.get(rows);if(c&&c.unit===unit)return c;var f=keyOf(unit),K=rows.map(function(r){return f(r.day)}),map=new Map();K.forEach(function(k,i){map.set(k,i)});c={unit:unit,K:K,map:map};if(KCACHE)KCACHE.set(rows,c);return c}
  // 后续收益：按真实日历匹配目标日 / 目标月；目标缺失、价格无效或观察期未结束时为缺失
  function fwdDate(rows,i,h,unit){var c=keys(rows,unit),t=c.K[i]+h;if(t>=nowKey(unit))return null;var j=c.map.get(t);if(j==null)return null;var a=rows[i],b=rows[j];return a&&b&&a.price>0&&b.price>0?b.price/a.price-1:null}
  // 滚动阈值：每一期只用发生前 win 期（不含本期）的有效值，n ≥ minN 才可用；分位 = 排序后第 floor(n·q) 个
  function rollingThresholds(rows,o){
    var c=keys(rows,o.unit),K=c.K,thr=new Array(rows.length).fill(null),win=[],sorted=[],lo=0;
    function ins(v){var a=0,b=sorted.length;while(a<b){var m=(a+b)>>1;if(sorted[m]<v)a=m+1;else b=m}sorted.splice(a,0,v)}
    function del(v){var a=0,b=sorted.length;while(a<b){var m=(a+b)>>1;if(sorted[m]<v)a=m+1;else b=m}if(a<sorted.length&&sorted[a]===v)sorted.splice(a,1)}
    for(var i=0;i<rows.length;i++){
      while(lo<i&&K[lo]<K[i]-o.win){if(isNum(rows[lo].value))del(rows[lo].value);lo++}
      var n=sorted.length;if(n>=o.minN)thr[i]=sorted[Math.min(n-1,Math.floor(n*o.q))];
      if(isNum(rows[i].value))ins(rows[i].value);
    }
    return thr;
  }
  // 升破事件：前一期低于前一期自己的门槛、本期达到或高于本期门槛；两期在日历上必须连续；间隔按日历计算
  function rollingEvents(rows,o){
    var c=keys(rows,o.unit),K=c.K,thr=rollingThresholds(rows,o),now=nowKey(o.unit),ev=[],lastK=-1e9,first=-1;
    for(var i=0;i<rows.length;i++){if(first<0&&thr[i]!=null)first=i;
      if(i<1||K[i]>=now||K[i]-K[i-1]!==1||thr[i]==null||thr[i-1]==null)continue;
      var a=rows[i-1].value,b=rows[i].value;if(!isNum(a)||!isNum(b))continue;
      if(a<thr[i-1]&&b>=thr[i]&&K[i]-lastK>=o.gap){ev.push(i);lastK=K[i]}}
    return{events:ev,thr:thr,first:first,current:thr[thr.length-1]};
  }
  // 固定门槛的穿越事件（如跌破 0、跌破 1）：同样要求日历连续、排除未结束的本期
  function crossEvents(rows,cross,gap,unit){var c=keys(rows,unit),K=c.K,now=nowKey(unit),ev=[],lastK=-1e9;
    for(var i=1;i<rows.length;i++){if(K[i]>=now||K[i]-K[i-1]!==1)continue;var a=rows[i-1].value,b=rows[i].value;if(!isNum(a)||!isNum(b))continue;if(cross(a,b)&&K[i]-lastK>=gap){ev.push(i);lastK=K[i]}}return ev}
  function percentile(rows,v){var n=0;for(var i=0;i<rows.length;i++)if(rows[i].value<=v)n++;return rows.length?n/rows.length*100:null}
  function quant(rows,q){var a=rows.map(function(r){return r.value}).sort(function(x,y){return x-y});return a.length?a[Math.min(a.length-1,Math.floor(a.length*q))]:null}
  function events(rows,cross,gap){var ev=[],last=-1e9;for(var i=1;i<rows.length;i++)if(cross(rows[i-1].value,rows[i].value)&&i-last>=gap){ev.push(i);last=i}return ev}
  function cell(arr){if(!arr.length)return "--";var m=med(arr),up=arr.filter(function(x){return x>0}).length/arr.length,E=EN();
    return '<b style="color:'+(m>=0?"var(--market-positive)":"var(--market-negative)")+'">'+pt(m)+'</b><small>'+(E?"up ":"上涨 ")+Math.round(up*100)+"% · n="+arr.length+"</small>"}
  // 信号回测卡
  function horizons(o){return o.unit==="month"?[1,3,6]:[30,90,180]}
  function hLabel(h,o,E){return o.unit==="month"?(E?"After "+h+(h>1?" months":" month"):h+" 个月后"):(E?"After "+h+" days":h+" 天后")}
  // 每个期限独立的信号样本与同期基准（基准从门槛可用之后开始）
  function forwardSets(rows,ev,o){var unit=o.unit||"day",start=Math.max(0,o.baseStart||0),out={};
    horizons(o).forEach(function(h){var sg=[],bs=[];ev.forEach(function(i){var v=fwdDate(rows,i,h,unit);if(v!=null)sg.push(v)});for(var i=start;i<rows.length;i++){var v=fwdDate(rows,i,h,unit);if(v!=null)bs.push(v)}out[h]={sig:sg,base:bs}});return out}
  function verdictText(sets,o,E){
    var H=horizons(o),m=H[1],l=H[2],S=sets[m],L=sets[l],u=o.unit==="month"?(E?" mo":" 个月"):(E?" days":" 天");
    if(S.sig.length<5||L.sig.length<5)return E?"Too few samples to judge (n="+S.sig.length+" / "+L.sig.length+"); raw statistics only.":"样本不足，暂不判断（n="+S.sig.length+" / "+L.sig.length+"），仅列出原始统计。";
    if(o.abs){var sa=S.sig.map(Math.abs),ba=S.base.map(Math.abs),r=med(sa)/med(ba);return r>=1.2?(E?"Moves were larger after the signal (±"+(med(sa)*100).toFixed(0)+"% vs ±"+(med(ba)*100).toFixed(0)+"%); direction unclear.":"历史观察：信号之后波动明显更大（±"+(med(sa)*100).toFixed(0)+"%，平时 ±"+(med(ba)*100).toFixed(0)+"%），方向不确定。"):(E?"Moves after the signal were similar to usual.":"历史观察：信号之后的波动和平时差别不大。")}
    var sm=med(S.sig),bm=med(S.base),sl=med(L.sig),bl=med(L.base),d1=sm-bm,d2=sl-bl,c1=(E?" ("+m+u+" "+pt(sm)+" vs "+pt(bm)+")":"（"+m+u+" "+pt(sm)+"，平时 "+pt(bm)+"）");
    if(d1>.03&&d2>.03)return E?"Historical observation: BTC did better than usual after the signal"+c1+".":"历史观察：信号之后 BTC 表现好于平时"+c1+"。";
    if(d1<-.03&&d2<-.03)return E?"Historical observation: BTC did worse than usual after the signal"+c1+"; not a buy signal on its own.":"历史观察：信号之后 BTC 表现反而不如平时"+c1+"，不能单独作为抄底依据。";
    var c2=E?" ("+m+u+" "+pt(sm)+" vs "+pt(bm)+"; "+l+u+" "+pt(sl)+" vs "+pt(bl)+")":"（"+m+u+" "+pt(sm)+"，平时 "+pt(bm)+"；"+l+u+" "+pt(sl)+"，平时 "+pt(bl)+"）";
    if(d1*d2<0&&Math.max(Math.abs(d1),Math.abs(d2))>.03)return E?"Mixed: the two horizons point different ways"+c2+".":"结论不一致：两个期限的方向相反"+c2+"。";
    if(d1>=0&&d2>=0)return E?"Slightly better than usual; the gap is small"+c2+".":"略好于平时，但差距不大"+c2+"。";
    if(d1<=0&&d2<=0)return E?"Slightly worse than usual; the gap is small"+c2+".":"略差于平时，但差距不大"+c2+"。";
    return E?"Little difference from usual"+c2+".":"和平时差别不大"+c2+"。";
  }
  function signalCard(el,rows,ev,o){
    if(!el)return;if(ev.length<2){el.innerHTML="";return}
    var E=EN(),sets=forwardSets(rows,ev,o),head='<div class="rv-tr rv-th" role="row"><span></span><span>'+(E?"After signal (median)":"信号之后（中位数）")+'</span><span>'+(E?"Same period, any day":"同期任意一天")+'</span></div>',body="";
    horizons(o).forEach(function(h){body+='<div class="rv-tr" role="row"><span>'+hLabel(h,o,E)+'</span><span>'+cell(sets[h].sig)+'</span><span>'+cell(sets[h].base)+'</span></div>'});
    if(o.abs){var hm=horizons(o)[1],ac=function(a){return a.length?'<b>±'+(med(a.map(Math.abs))*100).toFixed(0)+'%</b><small>'+(E?"typical size":"涨跌幅中位数")+'</small>':"--"};
      body+='<div class="rv-tr" role="row"><span>'+(o.unit==="month"?(E?hm+"-month swing":hm+" 个月波动"):(E?hm+"-day swing":hm+" 天波动"))+'</span><span>'+ac(sets[hm].sig)+'</span><span>'+ac(sets[hm].base)+'</span></div>'}
    var le=rows[ev[ev.length-1]],samp=o.unit==="month"?(E?" · monthly samples ("+(o.sample||"one reading per month")+")":" · 按月抽样（"+(o.sampleZh||"每月一个读数")+"）"):"";
    var note=verdictText(sets,o,E)+(E?" "+ev.length+" signals · latest "+le.day.slice(0,o.unit==="month"?7:10)+samp+" · windows overlap; the up-share is not a probability.":"共 "+ev.length+" 次 · 最近 "+le.day.slice(0,o.unit==="month"?7:10)+samp+" · 观察窗口可能重叠，上涨占比不是未来上涨概率。");
    el.innerHTML='<div class="psil-hist rv-sig"><div class="ph-head"><span>'+(E?o.titleEn:o.title)+'<small>'+(E?o.ruleEn:o.rule)+'</small></span></div><div class="rv-table" role="table">'+head+body+'</div><p class="ph-note">'+note+'</p></div>';
  }
  // 历史位置卡（进度条 0 → 100 分位）
  function positionCard(el,rows,o){
    if(!el||!rows.length){if(el)el.innerHTML="";return}
    var E=EN(),last=rows[rows.length-1],p=Math.round(percentile(rows,last.value)),hi=rows[0],lo=rows[0];
    rows.forEach(function(r){if(r.value>hi.value)hi=r;if(r.value<lo.value)lo=r});
    var y0=rows[0].day.slice(0,4),f=o.fmt||function(v){return v.toFixed(2)};
    el.innerHTML='<div class="psil-hist"><div class="ph-head"><span>'+(E?"Historical position":"历史位置")+'<small>'+(E?"Higher than "+p+"% of days since "+y0:"高于 "+y0+" 年以来 "+p+"% 的日子")+'</small></span><b class="num" style="color:'+(p>=90||p<=10?"var(--market-caution)":"")+'">'+p+'%</b></div>'
      +'<div class="ph-track" aria-hidden="true"><i class="ph-fill" style="width:'+p+'%;background:'+(o.grad||"linear-gradient(90deg,#ffc56b,#f7931a)")+'"></i><span class="ph-knob" style="left:'+p+'%"></span></div>'
      +'<div class="ph-ends"><span>'+(E?o.loEn:o.lo)+'</span><span style="color:#d9800f;font-weight:650">'+(E?"Now ":"当前 ")+f(last.value)+'</span><span>'+(E?o.hiEn:o.hi)+'</span></div>'
      +'<p class="ph-note">'+(E?"High "+f(hi.value)+" · "+hi.day.slice(0,7)+"   Low "+f(lo.value)+" · "+lo.day.slice(0,7):"最高 "+f(hi.value)+" · "+hi.day.slice(0,7)+"　最低 "+f(lo.value)+" · "+lo.day.slice(0,7))+'</p></div>';
  }
  window.BTCInsight={rollingEvents:rollingEvents,rollingThresholds:rollingThresholds,crossEvents:crossEvents,fwdDate:fwdDate,forwardSets:forwardSets,verdictText:verdictText,horizons:horizons,signalCard:signalCard,positionCard:positionCard,events:events,quant:quant};

  // —— LTH_PSIL：大面积浮亏（升破历史 90% 分位）之后 ——
  function psil(){
    var d=typeof lthPsilData!=="undefined"?lthPsilData:null;if(!d||!Array.isArray(d.series)||d.series.length<365)return;
    var rows=d.series.filter(function(r){return r.price>0});
    var R=rollingEvents(rows,{unit:"day",win:1461,q:.9,minN:730,gap:60}),T=R.current;
    signalCard(document.getElementById("psilSig"),rows,R.events,{unit:"day",baseStart:R.first,title:"大面积浮亏之后",titleEn:"After deep LTH losses",
      rule:"升破此前 4 年的 90% 分位（每天只用当天之前的数据）· 间隔 ≥60 天"+(T!=null?" · 现在 "+T.toFixed(1)+"%":""),ruleEn:"Crosses above the 90th pct of the prior 4 years (only data before that day) · ≥60 days apart"+(T!=null?" · now "+T.toFixed(1)+"%":"")});
  }
  ["renderLthPsilModule"].forEach(function(n){var o=window[n];if(typeof o!=="function")return;window[n]=function(){var r=o.apply(this,arguments);try{psil()}catch(e){}return r}});
  try{psil()}catch(e){}

  // —— LTH NUPL：整体转为浮亏（跌破 0）之后 ——
  function nupl(){
    var raw=window.__lthNuplRows;if(!Array.isArray(raw)||raw.length<365)return;
    var rows=raw.filter(function(r){return r[0]>="2012-01-01"&&r[2]>0}).map(function(r){return{day:r[0],value:+r[1],price:+r[2]}});
    positionCard(document.getElementById("nuplPos"),rows,{lo:"深度浮亏",loEn:"Deep loss",hi:"利润丰厚",hiEn:"Rich profit",fmt:function(v){return v.toFixed(3)},grad:"linear-gradient(90deg,#e5533d,#f0a43a 40%,#3fb37f)"});
    var ev=crossEvents(rows,function(a,b){return a>=0&&b<0},90,"day");
    signalCard(document.getElementById("nuplSig"),rows,ev,{unit:"day",title:"整体转为浮亏之后",titleEn:"After LTH turn to a loss",
      rule:"跌破 0 · 间隔 ≥90 天",ruleEn:"Falls below 0 · ≥90 days apart"});
  }
  document.addEventListener("nupl:data",function(){try{nupl()}catch(e){}});
  try{nupl()}catch(e){}
})();
