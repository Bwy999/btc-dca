
(function(){
  "use strict";
  // V25.1.12：LTH 筹码集中度 ±10%
  // 数据：Bitview / BRK 公开 URPD（cohort=lth，每 $1,000 一档）+ Bitview 日收盘价。
  // 每日值 = 成本落在 [收盘价×0.9, 收盘价×1.1] 内的 LTH 供应 / LTH 总供应。只读，不参与评分。
  var API="https://bitview.space/api/urpd/lth",Q="?agg=lin1000&weight=raw";
  var KEY="btc_lth_chips_v1",TTL=6*3600*1000,DAYS=365,BAND=0.10,CONC=3,NAME="LTH筹码集中";
  var state={rows:{},latest:null,ts:0},range=365,loading=false,plot=null,resizeObs=null,lastNote="";
  function $(id){return document.getElementById(id)}
  function money(v){return v>0?"$"+Math.round(v).toLocaleString("en-US"):"--"}
  function shortMoney(v){return v>=1e3?"$"+(v/1e3).toFixed(1)+"K":money(v)}
  function isDay(d){return /^\d{4}-\d{2}-\d{2}$/.test(String(d||""))}
  function dayTs(d){var t=Date.parse(String(d)+"T00:00:00Z");return Number.isFinite(t)?t:null}
  function ageDays(d){var t=dayTs(d);return t?Math.floor((Date.now()-t)/864e5):999}

  function read(){
    try{var c=JSON.parse(localStorage.getItem(KEY)||"null");if(c&&c.v===1&&c.rows&&typeof c.rows==="object"){state.rows=c.rows;state.latest=c.latest&&isDay(c.latest.day)&&Array.isArray(c.latest.b)?c.latest:null;state.ts=+c.ts||0}}catch(e){}
  }
  function write(){
    var days=Object.keys(state.rows).sort();if(days.length>DAYS+30)days.slice(0,days.length-DAYS-30).forEach(function(d){delete state.rows[d]});
    try{localStorage.setItem(KEY,JSON.stringify({v:1,ts:state.ts,rows:state.rows,latest:state.latest}))}catch(e){}
  }
  function getJson(url,ms){
    var ctl=typeof AbortController==="function"?new AbortController():null,timer=setTimeout(function(){if(ctl)ctl.abort()},ms||12000);
    return fetch(url,{cache:"no-store",signal:ctl?ctl.signal:undefined}).then(function(r){if(!r.ok)throw new Error("HTTP "+r.status);return r.json()}).finally(function(){clearTimeout(timer)});
  }
  // 压缩成 [下沿, 供应]，并推断档宽
  function compact(j){
    var b=j&&Array.isArray(j.buckets)?j.buckets:[],out=[];
    for(var i=0;i<b.length;i++){var pf=+b[i].price_floor,s=+b[i].supply;if(Number.isFinite(pf)&&pf>=0&&s>0)out.push([pf,s])}
    out.sort(function(a,c){return a[0]-c[0]});
    var w=0;for(var k=1;k<out.length;k++){var d=out[k][0]-out[k-1][0];if(d>0&&(!w||d<w))w=d}
    return out.length?{b:out,w:w||1000}:null;
  }
  function measure(cb,price){
    if(!cb||!(price>0))return null;
    var lo=price*(1-BAND),hi=price*(1+BAND),w=cb.w,total=0,inBand=0;
    for(var i=0;i<cb.b.length;i++){
      var a=cb.b[i][0],s=cb.b[i][1],z=a+w;total+=s;
      var ov=Math.min(hi,z)-Math.max(lo,a);if(ov>0)inBand+=s*Math.min(1,ov/w);
    }
    return total>0?{c:inBand/total*100,btc:inBand,total:total,lo:lo,hi:hi}:null;
  }
  function priceMap(){
    return getJson(bitviewBulkUrl(["date","price"],"-"+(DAYS+40)),20000).then(function(raw){
      var d=pickSeries(raw,"date",0),p=pickSeries(raw,"price",1),m={};
      if(Array.isArray(d)&&Array.isArray(p))for(var i=0;i<Math.min(d.length,p.length);i++)if(isDay(d[i])&&+p[i]>0)m[d[i]]=+p[i];
      return m;
    });
  }
  function rowsInRange(){
    var days=Object.keys(state.rows).sort(),cut=new Date(Date.now()-range*864e5).toISOString().slice(0,10);
    return days.filter(function(d){return d>=cut}).map(function(d){var r=state.rows[d];return{day:d,c:+r.c,p:+r.p}});
  }

  function setStatus(text,kind,day){
    if(typeof markModuleHealth==="function")markModuleHealth(NAME,text,kind,/^(计算中|同步中|加载中)/.test(text)?null:(day?dayTs(day):null));
    if(typeof setFresh==="function")setFresh("freshLthChips",NAME);
  }
  function render(){
    var days=Object.keys(state.rows).sort(),last=days.length?days[days.length-1]:null;
    // 当前值：最新一天的 LTH 分布 × 实时价格
    var spot=+S.price>0?+S.price:(last?+state.rows[last].p:0),cb=state.latest?{b:state.latest.b,w:state.latest.w}:null,m=measure(cb,spot);
    if(m){
      $("lthChipsNow").textContent=m.c.toFixed(2)+"%";
      $("lthChipsNowSub").textContent="分布日 "+state.latest.day+" · "+(+S.price>0?"按实时价":"按收盘价");
      $("lthChipsBand").textContent=shortMoney(m.lo)+"–"+shortMoney(m.hi);
      $("lthChipsBandSub").textContent="现价 "+money(spot)+" 上下 10%";
      $("lthChipsBtc").textContent=m.btc>=1e5?(m.btc/1e6).toFixed(2)+"M BTC":m.btc>=1e3?(m.btc/1e3).toFixed(1)+"K BTC":Math.round(m.btc)+" BTC";
      $("lthChipsBtcSub").textContent="占 LTH 总供应 "+(m.total/1e6).toFixed(2)+"M 的 "+m.c.toFixed(1)+"%";
    }
    if(days.length>1){
      var cur=+state.rows[last].c,ref=null,cutDay=new Date(dayTs(last)-30*864e5).toISOString().slice(0,10);
      for(var i=days.length-1;i>=0;i--)if(days[i]<=cutDay){ref=+state.rows[days[i]].c;break}
      $("lthChips30").textContent=ref==null?"--":((cur-ref>=0?"+":"−")+Math.abs(cur-ref).toFixed(2)+" 点");
      var vals=days.map(function(d){return +state.rows[d].c}),below=vals.filter(function(v){return v<=cur}).length;
      $("lthChipsRank").textContent="百分点 · 近 "+days.length+" 日分位 "+Math.round(below/vals.length*100)+"%";
    }
    var age=last?ageDays(last):999,n=days.length;
    if(loading)setStatus("计算中 "+n+"/"+DAYS,"warn");
    else if(!n)setStatus(lastNote||"等待数据","warn");
    else setStatus(age>3?"数据滞后":lastNote==="live"?"实时已同步":"缓存可用",age>3?"bad":lastNote==="live"?"good":"warn",last);
    $("lthChipsSource").textContent="数据源 · Bitview / BRK · LTH URPD"+(last?" · 截至 "+last+" · 已算 "+n+" 日":"");
    draw();
  }

  function draw(){
    var canvas=$("lthChipsChart"),shell=$("lthChipsChartShell"),empty=$("lthChipsEmpty");if(!canvas||!shell)return;
    var rows=rowsInRange();
    if(rows.length<2){if(empty){empty.hidden=false;empty.textContent=loading?"正在逐日计算 LTH 筹码分布… 已完成 "+Object.keys(state.rows).length+" 日":"历史暂不可用。点按「更新」重试。"}plot=null;return}
    if(empty)empty.hidden=true;
    var w=Math.max(280,shell.clientWidth),h=Math.max(250,shell.clientHeight),dpr=Math.min(2,window.devicePixelRatio||1);
    canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);canvas.style.width=w+"px";canvas.style.height=h+"px";
    var ctx=canvas.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    var css=getComputedStyle(document.documentElement),grid=css.getPropertyValue("--border-subtle").trim()||"rgba(127,127,127,.18)",tx3=css.getPropertyValue("--text-tertiary").trim()||"#8e8e93",brand=css.getPropertyValue("--brand-ink").trim()||"#f7931a";
    var x0=40,x1=w-54,y0=14,y1=h-27,pw=x1-x0,ph=y1-y0;
    var cmax=0;rows.forEach(function(r){if(r.c>cmax)cmax=r.c});
    var step=cmax>20?5:cmax>8?2:1,top=Math.max(step*2,Math.ceil(cmax*1.12/step)*step);
    var pl=Infinity,ph2=-Infinity;rows.forEach(function(r){if(r.p>0){pl=Math.min(pl,r.p);ph2=Math.max(ph2,r.p)}});
    var lo=Math.log10(pl),hi=Math.log10(ph2),pad=Math.max(.03,(hi-lo)*.12);lo-=pad;hi+=pad;
    var x=function(i){return x0+i/(rows.length-1)*pw},yc=function(v){return y1-v/top*ph},yp=function(v){return y1-(Math.log10(v)-lo)/(hi-lo)*ph};
    ctx.font="11px system-ui,-apple-system,sans-serif";ctx.lineWidth=1;ctx.textBaseline="middle";
    for(var v=0;v<=top+1e-9;v+=step){var yy=Math.round(yc(v))+.5;ctx.strokeStyle=grid;ctx.beginPath();ctx.moveTo(x0,yy);ctx.lineTo(x1,yy);ctx.stroke();ctx.fillStyle=tx3;ctx.textAlign="right";ctx.fillText(v+"%",x0-6,yy)}
    [0,0.5,1].forEach(function(f){var val=Math.pow(10,lo+(hi-lo)*(1-f)*0.9+(hi-lo)*0.05);ctx.fillStyle=tx3;ctx.textAlign="left";ctx.fillText(shortMoney(val),x1+6,yp(val))});
    var tickN=w<430?3:5;for(var t=0;t<tickN;t++){var idx=Math.round(t/(tickN-1)*(rows.length-1));ctx.fillStyle=tx3;ctx.textAlign=t===0?"left":t===tickN-1?"right":"center";ctx.textBaseline="bottom";ctx.fillText(rows[idx].day.slice(2,7).replace("-","/"),x(idx),h-4)}
    ctx.textBaseline="middle";
    var line=function(get,color,width){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineJoin="round";ctx.lineCap="round";ctx.beginPath();rows.forEach(function(r,i){var yy=get(r);i?ctx.lineTo(x(i),yy):ctx.moveTo(x(i),yy)});ctx.stroke()};
    line(function(r){return yp(r.p)},tx3,1.3);
    line(function(r){return yc(r.c)},brand,1.8);
    var lastR=rows[rows.length-1];ctx.fillStyle=brand;ctx.beginPath();ctx.arc(x(rows.length-1),yc(lastR.c),3.5,0,Math.PI*2);ctx.fill();
    plot={rows:rows,x0:x0,x1:x1,pw:pw,x:x};
    canvas.setAttribute("aria-label",rows[0].day+" 至 "+lastR.day+"，LTH 筹码集中度与 BTC 价格历史，最新 "+lastR.c.toFixed(2)+"%");
  }
  function tipAt(ev){
    if(!plot)return;var shell=$("lthChipsChartShell"),tip=$("lthChipsTooltip"),rect=shell.getBoundingClientRect(),px=Math.max(plot.x0,Math.min(plot.x1,ev.clientX-rect.left)),i=Math.max(0,Math.min(plot.rows.length-1,Math.round((px-plot.x0)/plot.pw*(plot.rows.length-1)))),r=plot.rows[i],left=Math.max(7,Math.min(shell.clientWidth-192,plot.x(i)+12));
    tip.innerHTML="<b>"+r.day+"</b><div><span>集中度</span><strong>"+r.c.toFixed(2)+"%</strong></div><div><span>BTC 收盘</span><strong>"+money(r.p)+"</strong></div><div><span>区间</span><strong>"+shortMoney(r.p*.9)+"–"+shortMoney(r.p*1.1)+"</strong></div>";
    tip.style.left=left+"px";tip.style.top="12px";tip.classList.add("on");tip.setAttribute("aria-hidden","false");
  }
  function hideTip(){var tip=$("lthChipsTooltip");if(tip){tip.classList.remove("on");tip.setAttribute("aria-hidden","true")}}

  async function refresh(force){
    if(loading)return;
    var days=Object.keys(state.rows).sort(),fresh=Date.now()-state.ts<TTL;
    if(!force&&fresh&&days.length>=DAYS-5&&state.latest){render();return}
    loading=true;render();
    var fails=0,done=0;
    try{
      var list=await getJson(API+"/dates?weight=raw",12000).catch(function(){return null});
      if(!Array.isArray(list)||!list.length)throw new Error("dates");
      list=list.filter(isDay).sort();var wanted=list.slice(-DAYS),latestDay=wanted[wanted.length-1];
      var prices=await priceMap();
      // 最新分布（用于实时值）
      if(force||!state.latest||state.latest.day!==latestDay){
        var lj=await getJson(API+"/"+latestDay+Q,15000),lc=compact(lj);
        if(lc){state.latest={day:latestDay,b:lc.b,w:lc.w};if(prices[latestDay]){var lm=measure(lc,prices[latestDay]);if(lm)state.rows[latestDay]={c:+lm.c.toFixed(4),p:prices[latestDay]}}}
      }
      var todo=wanted.filter(function(d){return !state.rows[d]&&prices[d]}).reverse();
      var next=0;
      var worker=async function(){
        while(next<todo.length&&fails<6){
          var d=todo[next++];
          try{var cb=compact(await getJson(API+"/"+d+Q,15000)),mm=measure(cb,prices[d]);if(mm){state.rows[d]={c:+mm.c.toFixed(4),p:prices[d]};fails=0}}
          catch(e){fails++}
          if(++done%12===0){write();render()}
        }
      };
      var pool=[];for(var k=0;k<CONC;k++)pool.push(worker());await Promise.all(pool);
      state.ts=Date.now();lastNote=fails>=6?"部分历史暂不可用":"live";write();
      if(force&&typeof ntf==="function")ntf(fails>=6?"LTH 筹码集中度部分更新":"LTH 筹码集中度已更新");
    }catch(e){
      lastNote=Object.keys(state.rows).length?"缓存可用":"历史暂不可用";
      if(force&&typeof ntf==="function")ntf("LTH 筹码集中度暂不可用 · 已保留当前数据");
    }finally{loading=false;render()}
  }
  window.refreshLthChips=function(force){return refresh(!!force)};
  window.initLthChips=function(){
    var sec=$("lthchips");if(!sec||sec.dataset.ready)return;sec.dataset.ready="1";
    read();if(Object.keys(state.rows).length){lastNote="cache";render()}
    sec.querySelectorAll("[data-lthchips-range]").forEach(function(btn){btn.addEventListener("click",function(){range=+btn.dataset.lthchipsRange;sec.querySelectorAll("[data-lthchips-range]").forEach(function(x){var on=x===btn;x.classList.toggle("active",on);x.setAttribute("aria-pressed",on?"true":"false")});hideTip();draw()})});
    var canvas=$("lthChipsChart");canvas.addEventListener("pointermove",tipAt,{passive:true});canvas.addEventListener("pointerdown",tipAt,{passive:true});canvas.addEventListener("pointerleave",hideTip,{passive:true});
    if("ResizeObserver"in window){resizeObs=new ResizeObserver(function(){requestAnimationFrame(draw)});resizeObs.observe($("lthChipsChartShell"))}else window.addEventListener("resize",draw,{passive:true});
    window.addEventListener("themechange",draw);
    document.addEventListener("visibilitychange",function(){if(document.visibilityState==="visible"&&sec.dataset.ready)refresh(false)});
    // 实时价变化时只重算「当前集中度」
    var orig=window.renderPriceSpark;if(typeof orig==="function")window.renderPriceSpark=function(){var r=orig.apply(this,arguments);try{if(state.latest)render()}catch(e){}return r};
    refresh(false);
  };
  if(typeof markModuleHealth==="function")markModuleHealth(NAME,"进入模块后加载","warn",null);
  if(typeof lazySection==="function")lazySection("lthchips",window.initLthChips);
})();
