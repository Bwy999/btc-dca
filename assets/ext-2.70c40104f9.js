

(function(){
  if(window.DIST_READY)return;window.DIST_READY=true;
  var DAPI="https://bitview.space/api/urpd";
  var DCOHORT="all";
  var DCACHE_KEY="btc_dist_v1";
  var DIST_VIEW_KEY="btc_dist_view_v1";
  var DIST_PAD_L=46,DIST_PAD_R=12,DIST_PAD_T=26,DIST_PAD_B=34;
  var distGeom=null;
  var DTTL=6*3600*1000;
  var distCacheData=null, distSource="snapshot", distDateInfo=null, distResizeObs=null, distPlotCtx=null;
  var distViewMode=readViewMode(),distNeedsFocus=true;
  var stats_total=0;

  function $(id){return document.getElementById(id)}
  var DMoney=typeof floorMoney==="function"?floorMoney:function(n){return n>0?"$"+Math.round(n).toLocaleString("en-US"):"--"};
  var DFmtUsdB=typeof fmtUsdB==="function"?fmtUsdB:function(n){if(n==null||!isFinite(n))return"--";return(n>=0?"+":"-")+"$"+Math.round(Math.abs(n)/1e9)+"B"};
  var DTry=typeof tryFetch==="function"?tryFetch:function(u,m){return fetch(u).then(function(r){if(!r.ok)throw new Error(r.status);return r.json()})};

  function dSet(id,val){var e=$(id);if(e)e.textContent=val}
  function dStatus(text,kind){if(typeof markModuleHealth==="function")markModuleHealth("URPD",text,kind,/同步中|加载中/.test(text)?null:distDateInfo);setFresh("freshDist","URPD")}
  function dAuto(){progStep&&progStep()}

  function nowDateStr(){return new Date().toISOString().slice(0,10)}

  function readViewMode(){
    try{return localStorage.getItem(DIST_VIEW_KEY)==="overview"?"overview":"fine"}catch(e){return"fine"}
  }
  function writeViewMode(mode){try{localStorage.setItem(DIST_VIEW_KEY,mode)}catch(e){}}

  function cacheRead(){
    // 缓存只要结构有效就保留；TTL 只决定“是否需要联网刷新”，不再决定“是否允许显示”。
    // 这样 Bitview 临时不可达时不会把已经有的数据整块清成 --。
    try{
      var c=JSON.parse(localStorage.getItem(DCACHE_KEY));
      if(c&&Array.isArray(c.data)&&c.data.length&&c.day&&c.ts)return c;
    }catch(e){}
    return null;
  }
  function cacheFresh(c){
    return !!(c&&c.ts&&Date.now()-c.ts<DTTL);
  }
  function cacheWrite(day,buckets){
    try{localStorage.setItem(DCACHE_KEY,JSON.stringify({day:day,data:buckets,ts:Date.now()}))}catch(e){}
  }

  function normalizeUrpd(j,fallbackDay){
    var b=(j&&Array.isArray(j.buckets))?j.buckets:[];
    if(!b.length)throw new Error("empty buckets");
    var day=(j&&j.date)||fallbackDay||nowDateStr();
    return {day:day,buckets:b};
  }

  // V24.5.1：优先直接请求“最新 URPD”。
  // BRK 的 /api/urpd/{cohort} 自带 date + buckets，可避免 /dates 成为单点故障。
  // 若 latest 端点失败，再退回 dates -> dated snapshot 的旧路径。
  function fetchUrpd(day){
    var q="?agg=lin1000&weight=raw";
    if(day){
      return DTry(DAPI+"/"+DCOHORT+"/"+day+q,12000).then(function(j){
        return normalizeUrpd(j,day);
      });
    }
    return DTry(DAPI+"/"+DCOHORT+q,12000).then(function(j){
      return normalizeUrpd(j,null);
    }).catch(function(latestErr){
      return DTry(DAPI+"/"+DCOHORT+"/dates?weight=raw",12000).then(function(dates){
        var useDay=(Array.isArray(dates)&&dates.length&&dates[dates.length-1])||nowDateStr();
        return DTry(DAPI+"/"+DCOHORT+"/"+useDay+q,12000).then(function(j){
          return normalizeUrpd(j,useDay);
        });
      });
    });
  }

  function computeStats(buckets,spot){
    var total=0,totRC=0,totPnl=0,below=0,above=0,peak=0,peakIdx=-1,i;
    for(i=0;i<buckets.length;i++){
      var x=buckets[i];
      var s=+x.supply||0, pf=+x.price_floor||0;
      total+=s;
      if(x.realized_cap!=null)totRC+=+x.realized_cap;
      if(x.unrealized_pnl!=null)totPnl+=+x.unrealized_pnl;
      if(spot>0){if(pf<=spot)below+=s;else above+=s}
      if(s>peak){peak=s;peakIdx=i}
    }
    var realized=total>0?totRC/total:0;
    return {
      total:total, realized:realized, pnl:totPnl,
      belowPct:spot>0&&total>0?below/total*100:0,
      abovePct:spot>0&&total>0?above/total*100:0,
      peak:peak, peakIdx:peakIdx,
      spot:spot
    };
  }

  function distNiceUp(v){
    if(!(v>0))return 0;
    var e=Math.pow(10,Math.floor(Math.log10(v))),m=v/e;
    return (m<=1?1:m<=2?2:m<=2.5?2.5:m<=5?5:10)*e;
  }
  function distNiceStep(range,want){
    var raw=range/Math.max(1,want),e=Math.pow(10,Math.floor(Math.log10(raw))),m=raw/e;
    return (m<=1?1:m<=2?2:m<=2.5?2.5:m<=5?5:10)*e;
  }
  function distNiceStepFine(range,want){
    if(!(range>0))return 1;
    var raw=range/Math.max(1,want),e=Math.pow(10,Math.floor(Math.log10(raw))),m=raw/e;
    var k=m<=1?1:m<=1.25?1.25:m<=1.5?1.5:m<=2?2:m<=2.5?2.5:m<=5?5:10;
    return k*e;
  }
  function distSupplyLabel(v){
    if(v>=1e6)return((v/1e6)%1===0?(v/1e6):(v/1e6).toFixed(1))+"M";
    if(v>=1e3)return Math.round(v/1e3)+"K";
    return Math.round(v).toLocaleString("en-US");
  }
  function distPriceLabel(v){
    if(v>=1e6)return"$"+(v/1e6).toFixed(v%1e6?1:0)+"M";
    if(v>=1e3)return"$"+(v/1e3).toFixed(v%1e3?1:0)+"K";
    return"$"+Math.round(v);
  }

  function distBuild(buckets,spot,pw,mode){
    var src=[],i,b,f,c,s;
    for(i=0;i<buckets.length;i++){
      b=buckets[i];f=+b.price_floor||0;s=+b.supply||0;
      if(!(f>0)||!(s>0))continue;                 // 0 成本长尾单独说明，不进主体比例尺
      c=+b.price_ceil;if(!(c>f))c=f+1000;
      src.push({f:f,c:c,s:s});
    }
    if(!src.length)return null;
    var hiRaw=0;for(i=0;i<src.length;i++)if(src[i].c>hiRaw)hiRaw=src[i].c;
    if(spot>0&&spot>hiRaw)hiRaw=spot;
    hiRaw*=1.02;
    var fine=mode==="fine";
    var base=fine?1000:distNiceStep(hiRaw,6);
    var hi=Math.ceil(hiRaw/base)*base;
    var tick=fine?distNiceStepFine(hi,Math.max(8,Math.round(pw/68))):distNiceStep(hi,6);
    if(fine)tick=Math.max(5000,Math.ceil(tick/1000)*1000);
    if(!(hi>0)||!(tick>0))return null;
    // 分箱宽度取 $1000（数据源粒度）的整数倍中的整数档，既让轴标签好读，
    // 也保证每个显示箱正好覆盖若干个完整源箱，不产生拆分误差
    var maxBins=Math.max(20,Math.min(64,Math.round(pw/7))),step=fine?1000:0;
    var LADDER=[1000,2000,2500,5000,10000,20000,25000,50000,100000];
    if(!fine)for(var li=0;li<LADDER.length;li++){if(Math.ceil(hi/LADDER[li])<=maxBins){step=LADDER[li];break}}
    if(!step)step=hi/maxBins;
    var n=Math.max(1,Math.round(hi/step));
    hi=step*n;
    var bins=new Array(n),k;
    for(k=0;k<n;k++)bins[k]={lo:k*step,hi:(k+1)*step,supply:0};
    // 按区间重叠比例摊分，避免源箱跨display箱时整块归错位置
    for(i=0;i<src.length;i++){
      var w=src[i].c-src[i].f;if(!(w>0))w=1;
      var k0=Math.max(0,Math.floor(src[i].f/step)),k1=Math.min(n-1,Math.floor((src[i].c-1e-9)/step));
      for(k=k0;k<=k1;k++){
        var ov=Math.min(src[i].c,bins[k].hi)-Math.max(src[i].f,bins[k].lo);
        if(ov>0)bins[k].supply+=src[i].s*(ov/w);
      }
    }
    var max=0;for(k=0;k<n;k++)if(bins[k].supply>max)max=bins[k].supply;
    var peak=0;for(k=0;k<n;k++)if(bins[k].supply>bins[peak].supply)peak=k;
    return {bins:bins,step:step,axisHi:hi,tick:tick,max:max,peak:peak,fine:fine};
  }

  // 柱底淡出：把颜色转成低透明度同色，避免大色块压住网格
  function distFade(col){
    // Safari / CSS Color 4 兼容：
    // computed custom property 可能返回 rgb(52 185 120)，而不是旧式 rgb(52,185,120)。
    // 旧实现按逗号 split 会得到 NaN，CanvasGradient.addColorStop() 随即抛错，
    // 表现为网格已经画出，但第一根 URPD 柱开始绘制时整段中断。
    col=String(col||"").trim();
    var m=col.replace(/\s/g,"").match(/^#?([0-9a-f]{6})$/i);
    if(m){
      var v=parseInt(m[1],16);
      return"rgba("+((v>>16)&255)+","+((v>>8)&255)+","+(v&255)+",.55)";
    }
    m=col.match(/^rgba?\(([^)]+)\)$/i);
    if(m){
      var nums=m[1].match(/-?\d*\.?\d+%?/g);
      if(nums&&nums.length>=3){
        var ch=function(x){
          var n=parseFloat(x);
          if(!isFinite(n))return NaN;
          if(String(x).indexOf("%")>=0)n=n*2.55;
          return Math.max(0,Math.min(255,Math.round(n)));
        };
        var r=ch(nums[0]),g=ch(nums[1]),b=ch(nums[2]);
        if(isFinite(r)&&isFinite(g)&&isFinite(b))return"rgba("+r+","+g+","+b+",.55)";
      }
    }
    return col;
  }
  function distPeak1k(buckets){
    var W=1000,grid={},i,b,f,c,sp,k0,k1,k,ov,wd,key,best=null;
    for(i=0;i<buckets.length;i++){
      b=buckets[i];f=+b.price_floor||0;sp=+b.supply||0;
      if(!(f>0)||!(sp>0))continue;              // 0 成本长尾不参与
      c=+b.price_ceil;if(!(c>f))c=f+W;
      wd=c-f;
      k0=Math.floor(f/W);k1=Math.floor((c-1e-9)/W);
      for(k=k0;k<=k1;k++){
        ov=Math.min(c,(k+1)*W)-Math.max(f,k*W);
        if(ov>0)grid[k]=(grid[k]||0)+sp*(ov/wd);
      }
    }
    for(key in grid){if(!best||grid[key]>best.supply)best={lo:+key*W,hi:(+key+1)*W,supply:grid[key]}}
    return best;
  }

  function drawDist(ctx,w,h,buckets,stats){
    var spot=stats.spot,i;
    var fine=distViewMode==="fine";
    var padL=DIST_PAD_L,padR=DIST_PAD_R,padT=fine?42:DIST_PAD_T,padB=fine?52:DIST_PAD_B;
    var pw=w-padL-padR,ph=h-padT-padB;
    if(pw<=0||ph<=0)return;

    var model=distBuild(buckets,spot,pw,distViewMode);
    distGeom=null;
    if(!model||!(model.max>0))return;
    var bins=model.bins,n=bins.length,step=model.step,axisHi=model.axisHi,xTick=model.tick;
    var peakX=null,peakTop=0;

    var dpr=window.devicePixelRatio||1;ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,w,h);
    // canvas 上下文跨次绘制会保留状态，必须显式复位，否则首绘与重绘的文字对齐不一致
    ctx.textAlign="left";ctx.textBaseline="alphabetic";ctx.lineWidth=1;ctx.globalAlpha=1;ctx.setLineDash([]);

    var cs=getComputedStyle(document.documentElement);
    var cTx2=cs.getPropertyValue("--text-secondary").trim()||"#a1a1a6",cTx3=cs.getPropertyValue("--text-tertiary").trim()||"#85858b";
    var cDiv=cs.getPropertyValue("--border-subtle").trim()||"#29292d";
    var cGn=cs.getPropertyValue("--market-positive-emphasis").trim()||"#7bd88f",cRd=cs.getPropertyValue("--market-negative").trim()||"#ff5000";
    var cBtc=cs.getPropertyValue("--brand-ink").trim()||"#f7931a";
    var FONT=cs.getPropertyValue("--sf").trim()||"system-ui";

    var xOf=function(p){return padL+Math.max(0,Math.min(1,p/axisHi))*pw};
    // 线性纵轴：等宽分箱之后柱高本身就可比，不再需要平方根压缩
    var yStep=fine?distNiceStepFine(model.max*1.06,10):distNiceStep(distNiceUp(model.max),4);
    var yMax=fine?Math.ceil(model.max*1.06/yStep)*yStep:distNiceUp(model.max);
    var PEAK_BAND=fine?30:15;               // 精细模式给箭头与双行峰值标注留空间
    var plotTop=padT+PEAK_BAND;
    var yOf=function(v){return plotTop+(ph-PEAK_BAND)*(1-Math.max(0,v)/yMax)};

    ctx.font="11px "+FONT;ctx.textBaseline="middle";ctx.textAlign="right";
    for(var gv=yStep;gv<=yMax+1e-6;gv+=yStep){
      var gy=yOf(gv);
      ctx.strokeStyle=cDiv;ctx.globalAlpha=.55;
      ctx.beginPath();ctx.moveTo(padL,gy);ctx.lineTo(padL+pw,gy);ctx.stroke();ctx.globalAlpha=1;
      ctx.fillStyle=cTx3;ctx.fillText(distSupplyLabel(gv),padL-7,gy);
    }
    ctx.strokeStyle=cDiv;ctx.beginPath();ctx.moveTo(padL,padT+ph);ctx.lineTo(padL+pw,padT+ph);ctx.stroke();

    var slot=pw/n,bw=Math.max(1.5,slot-Math.min(2.2,slot*0.22));
    for(i=0;i<n;i++){
      var sv=bins[i].supply;if(!(sv>0))continue;
      var bh=Math.max(1,padT+ph-yOf(sv));
      var bx=padL+slot*i+(slot-bw)/2;
      var by=padT+ph-bh;
      var current=spot>0&&spot>=bins[i].lo&&spot<bins[i].hi;
      var below=spot>0?bins[i].hi<=spot:true;
      var col=current?cTx2:(below?cGn:cRd);
      var g=ctx.createLinearGradient(0,by,0,padT+ph);
      g.addColorStop(0,col);g.addColorStop(1,distFade(col));
      ctx.fillStyle=g;ctx.globalAlpha=i===model.peak?1:.86;
      var rr=Math.min(2.5,bw/2,bh);
      ctx.beginPath();
      if(ctx.roundRect)ctx.roundRect(bx,by,bw,bh,[rr,rr,0,0]);else ctx.rect(bx,by,bw,bh);
      ctx.fill();ctx.globalAlpha=1;
      if(current){ctx.strokeStyle=cBtc;ctx.lineWidth=1.2;ctx.stroke();ctx.lineWidth=1}
      if(i===model.peak){peakX=bx+bw/2;peakTop=by}
    }

    if(peakX!=null&&bins[model.peak].supply>0){
      var pk=bins[model.peak],pkCount=Math.round(pk.supply).toLocaleString("en-US")+" BTC";
      var pkBelow=spot>0?pk.hi<=spot:true,pkCol=pkBelow?cGn:cRd;
      if(fine){
        var toRight=peakX<padL+pw*.67;
        var labelX=toRight?Math.min(padL+pw-108,peakX+48):Math.max(padL+108,peakX-48);
        var labelY=padT+8;
        var priceTitle="$"+Math.round(pk.lo).toLocaleString("en-US")+"–$"+Math.round(pk.hi).toLocaleString("en-US");
        ctx.strokeStyle=pkCol;ctx.lineWidth=1.2;ctx.setLineDash([4,3]);ctx.globalAlpha=.9;
        ctx.beginPath();ctx.moveTo(peakX,Math.max(plotTop+4,peakTop-2));ctx.lineTo(labelX,labelY+13);ctx.lineTo(labelX+(toRight?78:-78),labelY+13);ctx.stroke();
        ctx.setLineDash([]);ctx.globalAlpha=1;
        var ang=Math.atan2((labelY+13)-Math.max(plotTop+4,peakTop-2),labelX-peakX);
        ctx.fillStyle=pkCol;ctx.beginPath();ctx.moveTo(peakX,Math.max(plotTop+4,peakTop-2));ctx.lineTo(peakX+7*Math.cos(ang+.5),Math.max(plotTop+4,peakTop-2)+7*Math.sin(ang+.5));ctx.lineTo(peakX+7*Math.cos(ang-.5),Math.max(plotTop+4,peakTop-2)+7*Math.sin(ang-.5));ctx.closePath();ctx.fill();
        ctx.textAlign=toRight?"left":"right";ctx.textBaseline="alphabetic";ctx.font="italic 800 11px "+FONT;ctx.fillStyle=pkCol;ctx.fillText(priceTitle,labelX+(toRight?4:-4),labelY);
        ctx.font="italic 700 10px "+FONT;ctx.fillText("共计 "+pkCount,labelX+(toRight?4:-4),labelY+12);
      }else{
        var pkTxt=pkCount;ctx.font="bold 11px "+FONT;ctx.textAlign="center";ctx.textBaseline="alphabetic";
        var pkHalf=ctx.measureText(pkTxt).width/2;ctx.fillStyle=pkCol;
        ctx.fillText(pkTxt,Math.max(padL+pkHalf,Math.min(padL+pw-pkHalf,peakX)),Math.max(padT+9,peakTop-5));
      }
    }

    ctx.font="10px "+FONT;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillStyle=cTx3;
    var xStep=xTick;
    for(var xv=xStep;xv<=axisHi+1e-6;xv+=xStep){
      var xx=xOf(xv);
      ctx.strokeStyle=cDiv;ctx.globalAlpha=.4;
      ctx.beginPath();ctx.moveTo(xx,plotTop);ctx.lineTo(xx,padT+ph);ctx.stroke();ctx.globalAlpha=1;
      var lbl=distPriceLabel(xv),half=ctx.measureText(lbl).width/2;
      ctx.fillStyle=cTx3;
      if(fine){
        ctx.save();ctx.translate(xx,padT+ph+9);ctx.rotate(-Math.PI/4);ctx.textAlign="right";ctx.textBaseline="middle";ctx.fillText(lbl,0,0);ctx.restore();
      }else ctx.fillText(lbl,Math.max(half+1,Math.min(w-half-1,xx)),padT+ph+12);
    }
    ctx.font="11px "+FONT;ctx.textAlign="center";ctx.textBaseline="alphabetic";ctx.fillStyle=cTx3;
    ctx.fillText("\u6210\u672c\u4ef7\uff08\u7b49\u5bbd\u5206\u7bb1 "+distPriceLabel(step)+"\uff09\u00b7 \u7eb5\u8f74 BTC",padL+pw/2,h-5);

    if(spot>0&&spot<=axisHi){
      var xp=xOf(spot);
      ctx.strokeStyle=cBtc;ctx.lineWidth=1.4;ctx.setLineDash([5,4]);
      ctx.beginPath();ctx.moveTo(xp,padT-5);ctx.lineTo(xp,padT+ph);ctx.stroke();
      ctx.setLineDash([]);ctx.lineWidth=1;
      var pill="\u73b0\u4ef7 $"+Math.round(spot).toLocaleString("en-US");
      ctx.font="bold 11px "+FONT;
      var tw=ctx.measureText(pill).width,pX=5,pW=tw+pX*2,pH=15;
      var pl=Math.max(padL,Math.min(xp-pW/2,padL+pw-pW)),pt=Math.max(1,padT-5-pH-2);
      ctx.fillStyle=cBtc;ctx.globalAlpha=.16;
      ctx.beginPath();
      if(ctx.roundRect)ctx.roundRect(pl,pt,pW,pH,5);else ctx.rect(pl,pt,pW,pH);
      ctx.fill();ctx.globalAlpha=1;
      ctx.fillStyle=cBtc;ctx.textAlign="left";ctx.textBaseline="middle";
      ctx.fillText(pill,pl+pX,pt+pH/2);
    }
    ctx.textAlign="left";ctx.textBaseline="alphabetic";

    // 绘制几何量交给 tooltip 复用，保证命中区与画面永远一致
    distGeom={padL:padL,padT:padT,pw:pw,ph:ph,plotTop:plotTop,peakBand:PEAK_BAND,yStep:yStep,slot:slot,n:n,bins:bins,step:step,axisHi:axisHi,yMax:yMax,peak:model.peak,mode:distViewMode,spot:spot};
  }

  function drawDistYAxis(){
    var axis=$("distYAxis");if(!axis||!distGeom)return;
    var rect=axis.getBoundingClientRect(),w=rect.width,h=rect.height,dpr=dprId();if(!(w>0&&h>0))return;
    if(axis.width!==Math.round(w*dpr)||axis.height!==Math.round(h*dpr)){axis.width=Math.round(w*dpr);axis.height=Math.round(h*dpr)}
    var ctx=axis.getContext("2d"),g=distGeom,cs=getComputedStyle(document.documentElement);
    var cTx3=cs.getPropertyValue("--text-tertiary").trim()||"#85858b",cDiv=cs.getPropertyValue("--border-subtle").trim()||"#29292d",FONT=cs.getPropertyValue("--sf").trim()||"system-ui";
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.font="11px "+FONT;ctx.textBaseline="middle";ctx.textAlign="right";
    var scale=h/(g.padT+g.ph+(g.mode==="fine"?52:34));
    for(var v=g.yStep;v<=g.yMax+1e-6;v+=g.yStep){
      var y=(g.plotTop+(g.ph-g.peakBand)*(1-v/g.yMax))*scale;
      ctx.strokeStyle=cDiv;ctx.globalAlpha=.7;ctx.beginPath();ctx.moveTo(w-5,y);ctx.lineTo(w,y);ctx.stroke();ctx.globalAlpha=1;
      ctx.fillStyle=cTx3;ctx.fillText(distSupplyLabel(v),w-8,y);
    }
  }

  function prepareDistStage(buckets,spot){
    var shell=$("distChartShell"),stage=$("distChartStage");if(!shell||!stage)return null;
    var viewport=Math.max(280,shell.clientWidth||shell.getBoundingClientRect().width||280);
    var probe=distBuild(buckets,spot,Math.max(1,viewport-DIST_PAD_L-DIST_PAD_R),distViewMode);
    var width=viewport;
    if(distViewMode==="fine"&&probe)width=Math.max(viewport,Math.ceil(probe.bins.length*7.2+DIST_PAD_L+DIST_PAD_R));
    stage.style.width=Math.round(width)+"px";
    var meta=$("distBucketMeta"),hint=$("distGestureHint");
    if(meta&&probe)meta.innerHTML=distViewMode==="fine"?("<strong>"+probe.bins.length+"</strong> 个真实 $1K 价格档"):("<strong>"+probe.bins.length+"</strong> 个自适应显示档");
    if(hint)hint.textContent=distViewMode==="fine"?(width>viewport+2?"已定位现价附近 · 左右滑动查看完整分布":"完整 $1K 分布已在当前宽度展开"):"全景模式会按屏幕宽度合并显示，不改变统计卡口径";
    return{shell:shell,stage:stage,probe:probe,viewport:viewport,width:width};
  }

  function focusDistChart(){
    if(!distNeedsFocus||distViewMode!=="fine"||!distGeom)return;
    var shell=$("distChartShell");if(!shell)return;
    var focusPrice=distGeom.spot>0?distGeom.spot:((distGeom.bins[distGeom.peak].lo+distGeom.bins[distGeom.peak].hi)/2);
    var x=distGeom.padL+Math.max(0,Math.min(1,focusPrice/distGeom.axisHi))*distGeom.pw;
    shell.scrollLeft=Math.max(0,Math.min(shell.scrollWidth-shell.clientWidth,x-shell.clientWidth*.52));
    distNeedsFocus=false;
  }

  function syncViewButtons(){
    var fine=$("distFineBtn"),overview=$("distOverviewBtn"),isFine=distViewMode==="fine";
    if(fine){fine.classList.toggle("active",isFine);fine.setAttribute("aria-pressed",isFine?"true":"false")}
    if(overview){overview.classList.toggle("active",!isFine);overview.setAttribute("aria-pressed",isFine?"false":"true")}
  }

  function setDistView(mode){
    mode=mode==="overview"?"overview":"fine";if(mode===distViewMode)return;
    distViewMode=mode;writeViewMode(mode);distNeedsFocus=true;hideTip();syncViewButtons();render();
  }

  function render(){
    var cvs=$("distChart");if(!cvs)return;
    var data=distCacheData;
    var spot=(typeof S!=='undefined'&&S.price>0)?S.price:((typeof window.__distSpot!=='undefined'&&window.__distSpot>0)?window.__distSpot:null);
    if(!data)return;
    var stats=computeStats(data,spot);
    stats_total=stats.total||0;
    window.__costStructureUrpd={day:distDateInfo,spot:spot,realized:stats.realized,profitPct:stats.belowPct,lossPct:stats.abovePct,source:distSource==="live"?"Bitview 实时 URPD":distSource==="cache"?"本机 URPD 缓存":"URPD 快照"};
    if(typeof moduleIsReady==="function"&&moduleIsReady("coststate")&&typeof renderCostStructureState==="function")renderCostStructureState();
    // 指标卡
    if(spot>0){
      dSet("distSpot",DMoney(spot));
      dSet("distProfit",stats.belowPct.toFixed(1)+"%");
      dSet("distProfitSup","现价下方 · 获利 "+Math.round(stats.total*stats.belowPct/100).toLocaleString("en-US")+" BTC");
      dSet("distLoss",stats.abovePct.toFixed(1)+"%");
      dSet("distLossSup","现价上方 · 套牢 "+Math.round(stats.total*stats.abovePct/100).toLocaleString("en-US")+" BTC");
    }else{
      dSet("distSpot","--");dSet("distProfit","--");dSet("distProfitSup","等待现价");dSet("distLoss","--");dSet("distLossSup","等待现价");
    }
    dSet("distRealized",DMoney(stats.realized));
    dSet("distPnl",DFmtUsdB(stats.pnl));
    dSet("distPnlLabel", (stats.pnl>0&&isFinite(stats.pnl))?"全市场净浮盈":(stats.pnl<0?"全市场净浮亏":"待数据"));
    var ageTxt="";
    if(distDateInfo){var age=Math.max(0,Math.floor((Date.now()-Date.parse(distDateInfo+"T00:00:00Z"))/86400000));if(isFinite(age))ageTxt=" · 距今 "+age+" 天"}
    if(distDateInfo)dSet("distSpotDate","数据日期 "+distDateInfo);
    dSet("distSourceText","数据源 · Bitview URPD · "+distDateInfo+ageTxt+" · $1K 原始分桶");
    // 绘制
    prepareDistStage(data,spot);
    var rect=cvs.getBoundingClientRect();if(rect.width===0)return;
    var w=rect.width,h=rect.height,dpr=dprId();
    var cw=Math.round(w*dpr),ch=Math.round(h*dpr);
    if(cvs.width!==cw||cvs.height!==ch){cvs.width=cw;cvs.height=ch}
    var ctx=cvs.getContext("2d");distPlotCtx=ctx;
    drawDist(ctx,w,h,data,stats);
    drawDistYAxis();
    if(distNeedsFocus)requestAnimationFrame(focusDistChart);
    // 筹码峰文案取自实际绘制的分箱，保证与图上最高的那根柱严格一致
    if(distGeom&&distGeom.bins&&distGeom.bins[distGeom.peak]){
      var pb=distGeom.bins[distGeom.peak];
      var pkShare=stats.total>0?(pb.supply/stats.total*100):0;
      dSet("distPeak","图上最高柱 "+distPriceLabel(pb.lo)+"–"+distPriceLabel(pb.hi)+" · "+Math.round(pb.supply).toLocaleString("en-US")+" BTC · 占供应 "+pkShare.toFixed(2)+"%");
    }else dSet("distPeak","图上最高柱 --");
    // $1K 区间口径的最大筹码峰
    var p1k=distPeak1k(data);
    if(p1k){
      dSet("distPeak1k",Math.round(p1k.supply).toLocaleString("en-US"));
      dSet("distPeak1kSub","$"+p1k.lo.toLocaleString("en-US")+"–$"+p1k.hi.toLocaleString("en-US")+" · 占供应 "+(stats.total>0?(p1k.supply/stats.total*100).toFixed(2):"--")+"%");
    }else{dSet("distPeak1k","--");dSet("distPeak1kSub","等待数据")}
  }
  function dprId(){return window.devicePixelRatio||1}

  function distAge(day){
    if(!day)return 999;
    var ts=Date.parse(day+"T00:00:00Z");return isFinite(ts)?Math.max(0,Math.floor((Date.now()-ts)/86400000)):999;
  }

  function refresh(force){
    var cached=cacheRead();
    // 非强制刷新时，只有“缓存写入时间仍在 TTL 内”才跳过联网；
    // 不再拿数据日期本身当刷新 TTL。
    if(!force&&cached&&cacheFresh(cached)){
      if(!distCacheData){distDateInfo=cached.day;distCacheData=cached.data;distSource="cache"}
      render();return;
    }
    dAuto();
    var btn=$("distRefreshBtn");if(btn)btn.disabled=true;
    dStatus("同步中","warn");
    function done(){if(btn)btn.disabled=false}
    return fetchUrpd().then(function(res){
      distDateInfo=res.day;distCacheData=res.buckets;distSource="live";
      cacheWrite(res.day,res.buckets);
      var age=distAge(res.day);
      dStatus(age>3?"快照较旧":"已同步",age>3?"bad":"good");
      render();done();
    }).catch(function(err){
      // 第一优先：保留当前内存中的有效数据，绝不因一次网络失败清空 UI。
      if(distCacheData&&distCacheData.length){
        var age0=distAge(distDateInfo);
        dStatus(age0>3?"当前数据较旧":"当前数据保留",age0>3?"bad":"warn");
        render();done();return;
      }
      // 第二优先：使用任意年龄的本机缓存。
      var c2=cacheRead();
      if(c2){
        distDateInfo=c2.day;distCacheData=c2.data;distSource="cache";
        var age2=distAge(c2.day);
        dStatus(age2>3?"缓存较旧":"缓存可用",age2>3?"bad":"warn");
        render();done();return;
      }
      // 真正从未成功获取过数据时，才显示不可用。
      dStatus("数据不可用","bad");
      done();
    });
  }

  window.__requestUrpdStructure=function(force){return refresh(!!force)};

  function onInit(){
    syncViewButtons();
    var c=cacheRead();
    if(c){
      distDateInfo=c.day;distCacheData=c.data;distSource="cache";
      var age=distAge(c.day);
      dStatus(age>3?"载入旧缓存":"载入缓存",age>3?"bad":"warn");
      render();
    }else dSet("distSourceText","数据源 · Bitview URPD");
    refresh(false);
    // 主题切换时重绘
    try{window.addEventListener("themechange",function(){render()})}catch(e){}
  }

  // 事件与观察器（页面加载后绑定）
  function bindEvents(){
    var btn=$("distRefreshBtn");
    if(btn)btn.addEventListener("click",function(){refresh(true)});
    var fine=$("distFineBtn"),overview=$("distOverviewBtn");
    if(fine)fine.addEventListener("click",function(){setDistView("fine")});
    if(overview)overview.addEventListener("click",function(){setDistView("overview")});
    var shell=$("distChartShell");var cvs=$("distChart");
    if(shell&&window.ResizeObserver){distResizeObs=new ResizeObserver(function(){requestAnimationFrame(render)});distResizeObs.observe(shell)}
    if(cvs){cvs.addEventListener("pointermove",onTip,{passive:true});cvs.addEventListener("pointerleave",hideTip,{passive:true})}
  }
  function onTip(ev){
    var cvs=$("distChart"),tip=$("distTooltip");
    if(!cvs||!tip||!distGeom)return;
    var g=distGeom,rect=cvs.getBoundingClientRect(),mx=ev.clientX-rect.left;
    var idx=Math.floor((mx-g.padL)/g.slot);
    if(idx<0||idx>=g.n){hideTip();return}
    var b=g.bins[idx];
    if(!b||!(b.supply>0)){hideTip();return}
    var share=stats_total>0?(b.supply/stats_total*100):0;
    tip.innerHTML="<b>"+distPriceLabel(b.lo)+" – "+distPriceLabel(b.hi)+"</b>"+
      "<div><span>\u6301\u6709\u91cf</span><strong>"+Math.round(b.supply).toLocaleString("en-US")+" BTC</strong></div>"+
      "<div><span>\u5360\u603b\u4f9b\u5e94</span><strong>"+share.toFixed(2)+"%</strong></div>";
    var tw=tip.offsetWidth,left=g.padL+g.slot*(idx+0.5)+12;
    if(left+tw>rect.width)left=g.padL+g.slot*(idx+0.5)-12-tw;
    tip.style.left=Math.max(0,Math.min(rect.width-tw,left))+"px";
    var my=ev.clientY-rect.top;
    tip.style.top=(my>rect.height-80?my-64:my+12)+"px";
    tip.classList.add("on");
  }
  function hideTip(){var tip=$("distTooltip");if(tip)tip.classList.remove("on")}

  function startLazy(){
    var sec=$("distribution");
    if(!sec)return;
    if(!("IntersectionObserver" in window)){bindEvents();onInit();return}
    var io=new IntersectionObserver(function(entries){
      for(var i=0;i<entries.length;i++)if(entries[i].isIntersecting){io.disconnect();sec.dataset.ready="1";bindEvents();onInit();return}
    },{rootMargin:"320px 0px"});
    io.observe(sec);
  }
  if(document.readyState==="complete"||document.readyState==="interactive")startLazy();
  else document.addEventListener("DOMContentLoaded",startLazy);
})();

