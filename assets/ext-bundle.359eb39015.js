
(function(){
  "use strict";
  // V26.4：图表交互统一
  //  1. 手指离开图表后，读数和十字线保留 2 秒再收起（鼠标不受影响）；再次按下会取消收起。
  //  2. 画布上的文字统一使用系统字体（字号、字重保持各图原样）。
  //  图表库（K 线类）自带手势，不参与；滚动页面时浏览器发出的「取消」立即收起，不延迟。
  var HOLD=2000,timers=new Map(),cancelled=new Set(),LWC="#decisionChart,#miningHashChart,#miningDiffChart,#personalChart,#distYAxis";
  function chartOf(t){if(!t||!t.closest)return null;var c=t.closest("canvas");if(!c||c.closest(LWC)||c.matches(LWC))return null;return c}
  function fire(c,init){["pointerup","pointerleave"].forEach(function(t){var ev=new PointerEvent(t,init||{pointerType:"touch",isPrimary:true});ev.__held=true;c.dispatchEvent(ev)})}
  function flush(c){if(!timers.has(c))return;var t=timers.get(c);clearTimeout(t.id);timers.delete(c);fire(c,t.init)}
  window.addEventListener("pointerdown",function(e){var c=chartOf(e.target);timers.forEach(function(_,k){if(k!==c)flush(k)});if(c&&timers.has(c)){clearTimeout(timers.get(c).id);timers.delete(c)}},true);
  window.addEventListener("pointercancel",function(e){var c=chartOf(e.target);if(!c)return;cancelled.add(e.pointerId);if(timers.has(c)){clearTimeout(timers.get(c).id);timers.delete(c)}},true);
  ["pointerup","pointerleave"].forEach(function(type){
    window.addEventListener(type,function(e){
      if(e.pointerType!=="touch"||e.__held)return;var c=chartOf(e.target);if(!c)return;
      if(cancelled.has(e.pointerId)){if(type==="pointerleave")cancelled.delete(e.pointerId);return}
      e.stopImmediatePropagation();
      if(timers.has(c))clearTimeout(timers.get(c).id);
      var init={pointerType:"touch",pointerId:e.pointerId,clientX:e.clientX,clientY:e.clientY,isPrimary:true};
      timers.set(c,{id:setTimeout(function(){timers.delete(c);fire(c,init)},HOLD),init:init});
    },true);
  });
  var P=window.CanvasRenderingContext2D&&CanvasRenderingContext2D.prototype,d=P&&Object.getOwnPropertyDescriptor(P,"font");
  if(d&&d.set&&!P.__fontUnified){P.__fontUnified=true;var STACK='-apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC","Helvetica Neue",system-ui,sans-serif';
    Object.defineProperty(P,"font",{configurable:true,get:d.get,set:function(v){if(typeof v==="string")v=v.replace(/(\d+(?:\.\d+)?px)(\s*\/\s*[\d.]+\w*)?\s+.+$/,"$1 "+STACK);d.set.call(this,v)}})}
})();

;/*EXT_SEP*/

(function(){
  "use strict";
  // V26.4.1：图表画布上的文字（筹码分布、减半链条等）在英文模式下也走同一份中英对照表
  var P=window.CanvasRenderingContext2D&&CanvasRenderingContext2D.prototype;if(!P||P.__i18nPatched)return;P.__i18nPatched=true;
  var CJK=/[\u4e00-\u9fff]/,miss=window.__canvasI18nMiss=new Set();
  function tx(t){if(window.BTC_LANG!=="en"||typeof t!=="string"||!CJK.test(t)||typeof window.i18nText!=="function")return t;var r=window.i18nText(t);if(CJK.test(r))miss.add(t);return r}
  ["fillText","strokeText","measureText"].forEach(function(k){var o=P[k];P[k]=function(t){var a=Array.prototype.slice.call(arguments);a[0]=tx(t);return o.apply(this,a)}});
})();

;/*EXT_SEP*/


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
        // V26.6.1：最大筹码峰已在上方卡片显示；精细模式不再在图上标注（原标注会超出右边缘）
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
    // V26.6.1：坐标说明不再画在图上（滑动时会被裁掉）

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
    // V26.9.2：两行数据——平均浮盈（相对持币成本）与持币总成本，和右边「最大筹码峰」的两行对齐
    (function(){var en=window.BTC_LANG==="en",cap=stats.realized*stats.total,r=cap>0&&isFinite(stats.pnl)?stats.pnl/cap*100:NaN;
      dSet("distPnlLabel",isFinite(r)?((en?(r>=0?"Avg. gain ":"Avg. loss "):(r>=0?"平均浮盈 ":"平均浮亏 "))+(r>=0?"+":"−")+Math.abs(r).toFixed(1)+"%\n"+(en?"Total cost basis ":"持币总成本 ")+(cap>=1e12?"$"+(cap/1e12).toFixed(2)+"T":"$"+(cap/1e9).toFixed(0)+"B")):(en?"Waiting for data":"等待数据"))})();
    var ageTxt="";
    if(distDateInfo){var age=Math.max(0,Math.floor((Date.now()-Date.parse(distDateInfo+"T00:00:00Z"))/86400000));if(isFinite(age))ageTxt=" · 距今 "+age+" 天"}
    if(distDateInfo)dSet("distSpotDate","数据日 "+distDateInfo);
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
      dSet("distPeak1kSub","$"+Math.round(p1k.lo/1000)+"K–$"+Math.round(p1k.hi/1000)+"K\n"+(window.BTC_LANG==="en"?"Share of supply ":"占供应 ")+(stats.total>0?(p1k.supply/stats.total*100).toFixed(2):"--")+"%");
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
    // 不再拿数据日本身当刷新 TTL。
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
    if(cvs){cvs.addEventListener("pointerdown",onTip,{passive:true});cvs.addEventListener("pointermove",onTip,{passive:true});cvs.addEventListener("pointerleave",hideTip,{passive:true})}
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


;/*EXT_SEP*/

(function(){
  "use strict";
  var DAY=864e5, ROW=44, STALE_DAYS=3;
  var filter="all", selected="", raf=0, expanded=false;
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
    // V26.5：默认只显示现价上方最近 2 条、下方最近 3 条；「查看全部」展开
    var total=shown.length,mb=el("ladderMore");
    if(!expanded&&filter==="all"&&total>5){var ab=shown.filter(function(l){return l.price>spot}).sort(function(a,b){return a.price-b.price}).slice(0,2),bl=shown.filter(function(l){return l.price<=spot}).sort(function(a,b){return b.price-a.price}).slice(0,3);shown=ab.concat(bl)}
    if(mb){mb.hidden=!(filter==="all"&&total>5);mb.textContent=expanded?"收起":"查看全部 "+total+" 条"}

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
        '<p class="day'+(st2?" warn":"")+'">'+(d.calc?"模型按日期计算":(!d.day?"数据日未知":(st2?"数据日 "+esc(d.day)+" · 已滞后 "+a+" 天，等待更新":"数据日 "+esc(d.day)+" · 及时")))+'</p>';
    }else el("ladderDetail").innerHTML="";

    var staleN=all.filter(staleText).length,status=el("ladderStatus");
    var updating=typeof progActive!=="undefined"&&progActive;
    status.textContent=all.length+" 条线"+(updating&&staleN?" · 更新中":staleN?" · "+staleN+" 条滞后":" · 数据及时");
    status.className="lad-status"+(staleN&&!updating?" warn":"");
  }

  function queue(){if(!raf)raf=requestAnimationFrame(render)}

  // 交互：事件委托，筛选与选中只影响本模块
  el("homeLadder").addEventListener("click",function(e){
    var f=e.target.closest("[data-lad-filter]"),r=e.target.closest("[data-lad-id]");
    if(e.target.closest("#ladderMore")){expanded=!expanded;queue();return}
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

;/*EXT_SEP*/

(function(){
  "use strict";
  var PLAIN=["价格低于深度低估线，处在历史少见的便宜区间。","价格低于长期估值模型，处在历史偏便宜的区间。","价格高于长期估值模型，处在偏贵的区间。","价格远高于长期估值模型，处在历史高估区间。"];
  function el(id){return document.getElementById(id)}
  function paint(){
    var snap=null;try{snap=S.ahr&&focusAhrSnapshot(S.ahr,focusAhrModel)}catch(e){}
    var model=el("heroAhrModel"),plain=el("heroAhrPlain"),deepK=el("heroAhrDeepK"),deep=el("heroAhrDeep");
    if(model)model.textContent=focusAhrModel==="classic"?"经典":"新拟合";
    if(!plain||!deep)return;
    if(!snap){plain.textContent="等待 AHR999 数据";deep.textContent="--";return}
    plain.textContent=PLAIN[snap.zone];
    var line=+snap.prices[0],p=+S.price;
    if(line>0&&p>0){
      var v=(line/p-1)*100;
      deepK.textContent=p>line?"距深度低估线":"已低于深度低估线";
      deep.innerHTML="$"+Math.round(line).toLocaleString("en-US")+" <span>· "+(v>=0?"+":"−")+Math.abs(v).toFixed(1)+"%</span>";
    }else deep.textContent="--";
  }
  // V25.1.16：估值氛围色 + 一次性开场编排 + 价格跳动反馈
  var ZONE_C=["var(--market-positive)","var(--market-positive-emphasis)","var(--market-caution)","var(--market-negative)"];
  var t0=Date.now(),introDone=false,lastP=0,flashT=0;
  function aura(){
    var snap=null;try{snap=S.ahr&&focusAhrSnapshot(S.ahr,focusAhrModel)}catch(e){}
    var hero=el("today"),a=el("heroAura");if(!hero||!a)return snap;
    if(snap){hero.style.setProperty("--hero-zone",ZONE_C[snap.zone]);a.classList.add("on")}else a.classList.remove("on");
    return snap;
  }
  function intro(snap){
    if(introDone)return;
    if(Date.now()-t0>6000||document.visibilityState==="hidden"){introDone=true;return}
    if(!snap||!(+S.price>0))return;
    introDone=true;
    if(window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches)return;
    var hero=el("today"),cur=el("ahrCur"),lad=el("homeLadder");
    hero.classList.add("intro");if(lad)lad.classList.add("intro");
    if(cur&&cur.style.left){var target=cur.style.left;cur.style.transition="none";cur.style.left="0%";void cur.offsetWidth;setTimeout(function(){cur.style.transition="";cur.style.left=target},380)}
    setTimeout(function(){hero.classList.remove("intro");if(lad)lad.classList.remove("intro")},2800);
  }
  function flash(){
    var p=+S.price,inp=el("bp");if(!(p>0)||!inp)return;
    if(lastP&&p!==lastP&&!S.manualPrice&&document.activeElement!==inp){
      inp.classList.remove("tick-up","tick-down");void inp.offsetWidth;inp.classList.add(p>lastP?"tick-up":"tick-down");
      clearTimeout(flashT);flashT=setTimeout(function(){inp.classList.remove("tick-up","tick-down")},650);
    }
    lastP=p;
  }
  function after(kind){try{paint()}catch(e){}try{intro(aura())}catch(e){}if(kind==="price")try{flash()}catch(e){}}
  window.renderFocusAhr=(function(orig){return typeof orig==="function"?function(){var r=orig.apply(this,arguments);after("ahr");return r}:orig})(window.renderFocusAhr);
  window.renderPriceSpark=(function(orig){return typeof orig==="function"?function(){var r=orig.apply(this,arguments);after("price");return r}:orig})(window.renderPriceSpark);
  try{var fb=el("homeFootBuild");if(fb){var bd=BUILD_ID.split("-");fb.innerHTML='<i></i>'+sgLabel()+'<em>· '+bd[1].replace(/(\d{4})(\d{2})(\d{2})/,"$1-$2-$3")+'</em>'}}catch(e){}
  // 大屏布局按当前分区切换
  function markTab(id){document.documentElement.dataset.tab=id||ACTIVE_TAB||"now"}
  window.setTab=(function(orig){return typeof orig==="function"?function(id){var r=orig.apply(this,arguments);try{markTab(ACTIVE_TAB)}catch(e){}return r}:orig})(window.setTab);
  try{markTab(ACTIVE_TAB)}catch(e){}
  after("init");
})();

;/*EXT_SEP*/

(function(){
  "use strict";
  // V25.1.12：LTH 筹码集中度 ±10%
  // 数据：Bitview / BRK 公开 URPD（cohort=lth，每 $1,000 一档）+ Bitview 日收盘价。
  // 每日值 = 成本落在 [收盘价×0.9, 收盘价×1.1] 内的 LTH 供应 / LTH 总供应。只读，不参与评分。
  var API="https://bitview.space/api/urpd/lth",Q="?agg=lin1000&weight=raw";
  var KEY="btc_lth_chips_v1",TTL=6*3600*1000,DAYS=365,BAND=0.10,CONC=3,NAME="LTH筹码集中";
  var state={rows:{},latest:null,ts:0},range=365,loading=false,plot=null,resizeObs=null,lastNote="";
  // V26 Beta 23：2013 年起每月一次的长期历史（log50 分档），用于「全部」、历史分位与信号回测
  var HKEY="btc_lth_chips_hist_v1",hist={},histLoading=false;
  try{var hc=JSON.parse(localStorage.getItem(HKEY)||"null");if(hc&&hc.v===1&&hc.m)hist=hc.m}catch(e){}
  function histRows(){return Object.keys(hist).sort().map(function(m){var r=hist[m];return{day:r.day,c:+r.c,p:+r.p}})}
  function measureLog(j,price){
    var b=j&&Array.isArray(j.buckets)?j.buckets:[],k=Math.pow(10,1/50),lo=price*(1-BAND),hi=price*(1+BAND),tot=0,inb=0;
    for(var i=0;i<b.length;i++){var a=+b[i].price_floor,s=+b[i].supply;if(!(s>0))continue;tot+=s;if(!(a>0))continue;var z=a*k,ov=Math.min(hi,z)-Math.max(lo,a);if(ov>0)inb+=s*Math.min(1,ov/(z-a))}
    return tot>0?inb/tot*100:null;
  }
  async function loadHist(list){
    if(histLoading||!Array.isArray(list))return;histLoading=true;
    try{
      var first={},lastDay=list[list.length-1];list.forEach(function(d){var m=d.slice(0,7);if(m>="2013-01"&&!first[m])first[m]=d});
      var curM=lastDay.slice(0,7);first[curM]=lastDay;
      var todo=Object.keys(first).sort().filter(function(m){return !hist[m]||m===curM&&hist[m].day!==lastDay}).reverse(),fails=0,next=0;
      if(window.__lthChipsPre===false&&todo.length>24)todo=todo.slice(0,24);   // V27.10：没有预先算好的文件时，月度历史只补最近 24 个月
      var worker=async function(){while(next<todo.length&&fails<6){var m=todo[next++],d=first[m];
        try{var j=await getJson(API+"/"+d+"?agg=log50&weight=raw",15000),p=+j.close,c=measureLog(j,p);if(c!=null&&p>0){hist[m]={c:+c.toFixed(3),p:p,day:d};fails=0}}catch(e){fails++}
        if(next%10===0){try{localStorage.setItem(HKEY,JSON.stringify({v:1,m:hist}))}catch(e){}render()}}};
      await Promise.all([worker(),worker()]);
      try{localStorage.setItem(HKEY,JSON.stringify({v:1,m:hist}))}catch(e){}
    }finally{histLoading=false;render()}
  }
  function insight(){
    if(!window.BTCInsight)return;var H=histRows().map(function(r){return{day:r.day,value:r.c,price:r.p}});
    if(H.length<36){var a=$("lthChipsPos"),b=$("lthChipsSig");if(a)a.innerHTML=H.length?'<p class="ph-note" style="margin:12px 0 0">'+(window.BTC_LANG==="en"?"Building long-term history… ":"正在建立长期历史… ")+H.length+(window.BTC_LANG==="en"?" months":" 个月")+'</p>':"";if(b)b.innerHTML="";return}
    BTCInsight.positionCard($("lthChipsPos"),H,{lo:"分散",loEn:"Spread out",hi:"高度集中",hiEn:"Highly concentrated",fmt:function(v){return v.toFixed(1)+"%"},grad:"linear-gradient(90deg,#c3b9fb,#7c6cf0)"});
    var R=BTCInsight.rollingEvents(H,{unit:"month",win:48,q:.85,minN:24,gap:3}),T=R.current;
    BTCInsight.signalCard($("lthChipsSig"),H,R.events,{unit:"month",baseStart:R.first,abs:true,sampleZh:"每月第一个可用日",sample:"first available day of each month",title:"筹码高度集中之后",titleEn:"After heavy crowding",
      rule:"升破此前 48 个月的 85% 分位 · 按月 · 间隔 ≥3 月"+(T!=null?" · 现在 "+T.toFixed(1)+"%":""),ruleEn:"Crosses above the 85th pct of the prior 48 months · monthly · ≥3 months apart"+(T!=null?" · now "+T.toFixed(1)+"%":"")});
  }
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
    if(range===0){var hr=histRows();if(hr.length>=12)return hr}
    var days=Object.keys(state.rows).sort(),cut=new Date(Date.now()-(range||365)*864e5).toISOString().slice(0,10);
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
      $("lthChipsNowSub").textContent="数据日 "+state.latest.day+" · "+(+S.price>0?"按实时价":"按收盘价");
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
      $("lthChipsRank").textContent="百分点";
    }
    var age=last?ageDays(last):999,n=days.length;
    if(loading)setStatus("计算中 "+n+"/"+DAYS,"warn");
    else if(!n)setStatus(lastNote||"等待数据","warn");
    else setStatus(age>3?"数据滞后":lastNote==="live"?"实时已同步":"缓存可用",age>3?"bad":(lastNote==="live"||age<=2)?"good":"warn",last);
    try{insight()}catch(e){}
    $("lthChipsSource").textContent="数据源 · Bitview / BRK · LTH URPD"+(last?" · 数据日 "+last+" · 已算 "+n+" 日":"");
    draw();
  }

  function draw(){
    var canvas=$("lthChipsChart"),shell=$("lthChipsChartShell"),empty=$("lthChipsEmpty");if(!canvas||!shell)return;
    var rows=rowsInRange().filter(function(r){return r.p>0});
    if(rows.length<2){if(empty){empty.hidden=false;empty.textContent=loading?"正在逐日计算 LTH 筹码分布… 已完成 "+Object.keys(state.rows).length+" 日":"历史暂不可用。点按「更新」重试。"}plot=null;return}
    if(empty)empty.hidden=true;
    var w=Math.max(280,shell.clientWidth),h=Math.max(260,shell.clientHeight),dpr=Math.min(2,window.devicePixelRatio||1);
    canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);canvas.style.width=w+"px";canvas.style.height=h+"px";
    var ctx=canvas.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    var css=getComputedStyle(document.documentElement),grid=css.getPropertyValue("--border-subtle").trim()||"rgba(127,127,127,.18)",tx3=css.getPropertyValue("--text-tertiary").trim()||"#8e8e93";
    var ref=histRows().map(function(r){return r.c});if(ref.length<24)ref=rows.map(function(r){return r.c});ref.sort(function(a,c){return a-c});
    var q80=ref[Math.floor(ref.length*.8)],q95=ref[Math.floor(ref.length*.95)],lvl=function(v){return v>=q95?2:v>=q80?1:0};
    var COL=["rgba(142,142,150,.5)","#f0a43a","#e5533d"],LINE=["#8e8e96","#f0a43a","#e5533d"],E=window.BTC_LANG==="en";
    var x0=8,x1=w-56,pw=x1-x0,y0=10,GAP=12,B=22,PH=Math.round((h-y0-B-GAP)*.6),VH=h-y0-B-GAP-PH,VY=y0+PH+GAP;
    var x=function(i){return x0+i/(rows.length-1)*pw};
    var pl=Infinity,phh=-Infinity;rows.forEach(function(r){pl=Math.min(pl,r.p);phh=Math.max(phh,r.p)});var lo=Math.log10(pl),hi=Math.log10(phh);if(hi-lo<.1){lo-=.05;hi+=.05}
    var yp=function(v){return y0+(1-(Math.log10(v)-lo)/(hi-lo))*PH};
    var cmax=0;rows.forEach(function(r){cmax=Math.max(cmax,r.c)});cmax=Math.max(cmax,q95||0)*1.08||1;var yv=function(v){return VY+VH-Math.min(1,v/cmax)*VH};
    ctx.font="11px system-ui,-apple-system,sans-serif";ctx.textBaseline="middle";ctx.textAlign="left";
    var lastY=1e9;for(var e=Math.floor(lo);e<=Math.ceil(hi);e++)[1,2,5].forEach(function(m){var p=m*Math.pow(10,e),lp=Math.log10(p);if(lp<lo||lp>hi)return;var y=yp(p);if(Math.abs(lastY-y)<22)return;lastY=y;ctx.strokeStyle=grid;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x0,Math.round(y)+.5);ctx.lineTo(x1,Math.round(y)+.5);ctx.stroke();ctx.fillStyle=tx3;ctx.fillText(shortMoney(p),x1+6,y)});
    ctx.font="600 10px system-ui,-apple-system,sans-serif";ctx.textBaseline="top";ctx.fillStyle=tx3;ctx.fillText(E?"BTC price":"BTC 价格",x0+2,y0+1);ctx.fillText(E?"LTH supply within ±10% of price":"现价 ±10% 内的 LTH 筹码占比",x0+2,VY-1);
    ctx.lineWidth=2;ctx.lineJoin="round";ctx.lineCap="round";
    for(var k=1;k<rows.length;k++){ctx.strokeStyle=LINE[lvl(rows[k].c)];ctx.beginPath();ctx.moveTo(x(k-1),yp(rows[k-1].p));ctx.lineTo(x(k),yp(rows[k].p));ctx.stroke()}
    var bw=Math.max(1,Math.min(9,pw/rows.length*.7));
    rows.forEach(function(r,i){ctx.fillStyle=COL[lvl(r.c)];var yy=yv(r.c);ctx.fillRect(x(i)-bw/2,yy,bw,VY+VH-yy)});
    if(q95<cmax){var yr=Math.round(yv(q95))+.5;ctx.strokeStyle="#e5533d";ctx.globalAlpha=.6;ctx.setLineDash([3,3]);ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x0,yr);ctx.lineTo(x1,yr);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;ctx.fillStyle="#e5533d";ctx.textBaseline="middle";ctx.font="10px system-ui,sans-serif";ctx.fillText(q95.toFixed(1)+"%",x1+6,yr)}
    ctx.fillStyle=tx3;ctx.textBaseline="middle";ctx.font="10px system-ui,sans-serif";ctx.fillText(cmax.toFixed(0)+"%",x1+6,VY+4);
    var tickN=w<430?3:5;ctx.font="11px system-ui,-apple-system,sans-serif";ctx.textBaseline="bottom";for(var t=0;t<tickN;t++){var idx=Math.round(t/(tickN-1)*(rows.length-1));ctx.fillStyle=tx3;ctx.textAlign=t===0?"left":t===tickN-1?"right":"center";ctx.fillText(range===0?rows[idx].day.slice(0,4):rows[idx].day.slice(2,7).replace("-","/"),x(idx),h-4)}
    var lastR=rows[rows.length-1];
    plot={rows:rows,x0:x0,x1:x1,pw:pw,x:x};
    canvas.setAttribute("aria-label",rows[0].day+" 至 "+lastR.day+"，BTC 价格与 LTH 筹码集中度，最新 "+lastR.c.toFixed(2)+"%");
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
    if(!force&&fresh&&days.length>=DAYS-5&&state.latest){render();if(Object.keys(hist).length<36)getJson(API+"/dates?weight=raw",12000).then(function(l){if(Array.isArray(l))loadHist(l.filter(isDay).sort())}).catch(function(){});return}
    loading=true;render();
    var fails=0,done=0,preOk=false;
    // V26.3：先读服务器每天预先算好的结果（GitHub Actions 生成），只补缺少的日期
    try{
      var pre=await getJson("data/lth-chips.json?d="+new Date().toISOString().slice(0,10),8000);
      if(pre&&pre.v===1){preOk=true;
        var dd=pre.daily||{};Object.keys(dd).forEach(function(d){if(isDay(d)&&!state.rows[d]&&dd[d]&&+dd[d].p>0)state.rows[d]={c:+dd[d].c,p:+dd[d].p}});
        if(pre.latest&&isDay(pre.latest.day)&&Array.isArray(pre.latest.b)&&(!state.latest||state.latest.day<pre.latest.day))state.latest={day:pre.latest.day,b:pre.latest.b,w:+pre.latest.w||1000};
        var mm=pre.monthly||{},changed=false;Object.keys(mm).forEach(function(m){var r=mm[m];if(r&&+r.p>0&&(!hist[m]||(r.day&&hist[m].day<r.day))){hist[m]={c:+r.c,p:+r.p,day:r.day};changed=true}});
        if(changed){try{localStorage.setItem(HKEY,JSON.stringify({v:1,m:hist}))}catch(e){}}
        state.ts=Date.now();write();render();
        var latestAge=state.latest?(Date.now()-Date.parse(state.latest.day+"T00:00:00Z"))/864e5:99;
        if(!force&&latestAge<=2&&Object.keys(state.rows).length>=DAYS-5&&Object.keys(hist).length>=120){loading=false;render();return}
      }
    }catch(e){}
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
      // V27.10：预先算好的文件读不到（任务没跑 / 网络问题）时，手机只补最近 45 天，不再一次补满一年
      if(!preOk&&todo.length>45)todo=todo.slice(0,45);
      window.__lthChipsPre=preOk;
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
      loadHist(list);
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

;/*EXT_SEP*/

(function(){
  "use strict";
  // V25.1.18：分析页折叠标题显示实时摘要；数据未就绪时保留原说明
  var PH=/^(--|—|等待|数据缺失|暂不可用|加载|同步|计算|正在|waiting|loading|unavailable|syncing|calculating|checking|missing|updating)/i;
  function txt(id){var e=document.getElementById(id);var t=e?String(e.textContent||"").trim():"";return t&&!PH.test(t)&&!/计算中|Calculating/i.test(t)?t:""}
  var RULES={
    value:function(){return txt("imSummary")},
    zones:function(){var h=txt("ctHeadline"),n=txt("ctNow");return h&&!/计算|暂不可用|Calculating|Unavailable/i.test(h)?h+(n&&/\d/.test(n)?" · "+n:""):""},
    cycle:function(){var p=txt("phaseName"),d=txt("phaseDays");return p&&!/识别|建立|Detecting|Building/i.test(p)?p+(d&&/\d/.test(d)?" · "+d:""):""},
    trend:function(){var t=txt("decisionDistance"),p=txt("powerPositionText");var a=[];if(t&&/\d/.test(t))a.push("相对 200 日趋势 "+t);if(p&&/\d|上方|下方|中轴|above|below|middle/i.test(p))a.push("幂律"+p.split("·")[0].trim());return a.join(" · ")},
    floor:function(){var s=txt("bitFloorState");return s?s.split("·")[0].trim():""},
    miner:function(){var p=txt("puellMarket");return p&&/\d/.test(p)?"Puell "+p:""},
    fund:function(){var v=txt("fgiValue"),st=txt("fgiState");return v&&/\d/.test(v)?"恐惧贪婪 "+v+(st?" · "+st:""):""},
    cost:function(){var v=txt("costBasisSth"),g=txt("costBasisSthGap");return v&&/\d/.test(v)?"STH "+v+(g&&/\d/.test(g)?" · "+g:""):""},
    state:function(){var v=txt("costDecisionTitle");return v&&!/正在核对|Checking/i.test(v)?v:""},
    lth:function(){var c=txt("lthChipsNow"),p=txt("lthPsilValue");if(c&&/\d/.test(c))return"筹码集中度 "+c;return p&&/\d/.test(p)?"LTH_PSIL "+p:""},
    holders:function(){var r=txt("holderDominantRange");return r&&!/^--/.test(r)?"主导迁移 "+r:""},
    dist:function(){var v=txt("lossHeroValue"),l=txt("lossHeroLabel");return v&&/\d/.test(v)?(l?l.replace(/供应$/,""):"深度亏损")+" "+v:""}
  };
  var SRC={value:["imSummary"],zones:["ctHeadline","ctNow"],cycle:["phaseName","phaseDays"],trend:["decisionDistance","powerPositionText"],floor:["bitFloorState"],miner:["puellMarket"],fund:["fgiValue","fgiState"],cost:["costBasisSth","costBasisSthGap"],state:["costDecisionTitle"],lth:["lthChipsNow","lthPsilValue"],holders:["holderDominantRange"],dist:["lossHeroValue","lossHeroLabel"]};
  function paint(key){
    var el=document.querySelector('small[data-fold-live="'+key+'"]');if(!el)return;
    if(el.closest(".chain-card")){el.textContent=el.dataset.foldDefault;el.classList.remove("live");return}
    var v="";try{v=RULES[key]()}catch(e){}
    el.textContent=v||el.dataset.foldDefault;el.classList.toggle("live",!!v);
  }
  Object.keys(SRC).forEach(function(key){
    paint(key);
    if(!("MutationObserver"in window))return;
    var mo=new MutationObserver(function(){paint(key)});
    SRC[key].forEach(function(id){var e=document.getElementById(id);if(e)mo.observe(e,{childList:true,characterData:true,subtree:true})});
  });
})();

;/*EXT_SEP*/

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

;/*EXT_SEP*/

(function(){
  "use strict";
  // 预测市场：让 % 紧跟在数字后面
  var ctx=null;
  function place(){["spb","spu"].forEach(function(id){
    var i=document.getElementById(id);if(!i)return;var w=i.parentNode,u=w&&w.querySelector(".prob-unit");if(!u)return;
    var v=String(i.value||"");if(!v){u.style.display="none";return}
    var cs=getComputedStyle(i);
    // V26.9.3：用页面里的隐藏文字测宽（字体、字距、等宽数字都与输入框一致），iPhone 上 % 不再压住数字
    if(!ctx){ctx=document.createElement("span");ctx.setAttribute("aria-hidden","true");ctx.style.cssText="position:absolute;left:-9999px;top:0;visibility:hidden;white-space:pre";document.body.appendChild(ctx)}
    ["fontFamily","fontSize","fontWeight","fontStyle","letterSpacing","fontVariantNumeric","fontFeatureSettings","fontStretch"].forEach(function(k){ctx.style[k]=cs[k]});
    ctx.textContent=v;
    var x=(parseFloat(cs.paddingLeft)||0)+(parseFloat(cs.borderLeftWidth)||0)+ctx.getBoundingClientRect().width+4;
    u.style.display="";u.style.left=x+"px";u.style.fontSize=Math.round(parseFloat(cs.fontSize)*.5)+"px";
  })}
  ["spb","spu"].forEach(function(id){var i=document.getElementById(id);if(i)i.addEventListener("input",place)});
  var orig=window.sig;if(typeof orig==="function")window.sig=function(){var r=orig.apply(this,arguments);try{place()}catch(e){}return r};
  setInterval(place,2000);place();
})();

;/*EXT_SEP*/

(function(){
  "use strict";
  // V26.0.8：AHR999 当前值在 2011 年以来全部日线中的分位
  var cache={key:"",vals:null,first:0};
  function history(model){
    var raw=typeof DAILY==="undefined"?null:DAILY,last=raw&&raw.length?raw[raw.length-1]:null,key=model+"|"+(raw?raw.length:0)+"|"+(last?last[0]:0);
    if(cache.key===key)return cache;
    var rows=[];try{rows=focusAhrHistory(raw,model)}catch(e){}
    cache={key:key,vals:rows.map(function(r){return r.value}).sort(function(a,b){return a-b}),first:rows.length?rows[0].time:0};
    return cache;
  }
  function color(p){return p<25?"var(--market-positive)":p<50?"var(--market-positive-emphasis)":p<75?"var(--market-caution)":"var(--market-negative)"}
  function paint(){
    var box=document.getElementById("ahrPct");if(!box)return;
    var model=typeof focusAhrModel==="string"?focusAhrModel:"refit",snap=null;
    try{snap=focusAhrSnapshot(S.ahr,model)}catch(e){}
    var h=history(model);
    if(!snap||!(snap.value>0)||!h.vals||h.vals.length<365){box.hidden=true;return}
    var v=snap.value,lo=0,hi=h.vals.length;while(lo<hi){var m=(lo+hi)>>1;if(h.vals[m]<=v)lo=m+1;else hi=m}
    var p=Math.max(0,Math.min(100,lo/h.vals.length*100)),pr=Math.round(p);
    box.hidden=false;box.style.setProperty("--pct-color",color(p));
    document.getElementById("ahrPctVal").textContent=pr+"%";
    var fill=document.getElementById("ahrPctFill");fill.style.width=p+"%";fill.style.setProperty("--pct-bg",(p>0?100/p*100:100)+"%");
    document.getElementById("ahrPctKnob").style.left=p+"%";
    var year=h.first?new Date(h.first*1000).getUTCFullYear():"";
    document.getElementById("ahrPctNote").textContent=(pr<50?"比 "+year+" 年以来 "+(100-pr)+"% 的日子更便宜。":"比 "+year+" 年以来 "+pr+"% 的日子更贵。");
  }
  ["renderFocusAhr","renderFocusAhrChart","setFocusAhrModel"].forEach(function(n){
    var orig=window[n];if(typeof orig!=="function")return;
    window[n]=function(){var r=orig.apply(this,arguments);try{paint()}catch(e){}return r};
  });
  window.addEventListener("themechange",function(){try{paint()}catch(e){}});
  try{paint()}catch(e){}
})();

;/*EXT_SEP*/

(function(){
  "use strict";
  // V26.0.11：长期持有者 NUPL 历史图表。数据：Bitview lth_nupl + price（2011 年起），本机缓存 6 小时。
  var KEY="btc_bitview_lth_nupl_v1",TTL=6*3600*1000,data=null,range=0,loading=false,hover=-1,inited=false;
  function $(id){return document.getElementById(id)}
  function css(n,f){var v=getComputedStyle(document.documentElement).getPropertyValue(n).trim();return v||f}
  function col(raw,name,idx){try{return pickSeries(raw,name,idx)}catch(e){return null}}
  async function series(name){
    var raw=await tryFetch(bitviewBulkUrl(["date",name],"2011-01-01"),15000),d=col(raw,"date",0),v=col(raw,name,1);
    if(!Array.isArray(d)||!Array.isArray(v))throw new Error("no "+name);
    var m={};for(var i=0;i<Math.min(d.length,v.length);i++){var x=+v[i];if(/^\d{4}-\d{2}-\d{2}$/.test(String(d[i]))&&Number.isFinite(x))m[d[i]]=x}
    return m;
  }
  async function load(force){
    if(loading)return;var c=null;try{c=JSON.parse(localStorage.getItem(KEY)||"null")}catch(e){}
    if(c&&Array.isArray(c.rows)&&c.rows.length){data=c.rows;draw();try{window.__lthNuplRows=data;document.dispatchEvent(new CustomEvent("nupl:data"))}catch(e){}}
    if(!force&&c&&Date.now()-c.ts<TTL)return;
    loading=true;
    try{
      var res=await Promise.all([series("lth_nupl"),series("price")]),n=res[0],p=res[1];
      var rows=Object.keys(n).filter(function(d){return p[d]>0&&n[d]>-1&&n[d]<1}).sort().map(function(d){return[d,+n[d].toFixed(4),+p[d].toPrecision(7)]});
      if(rows.length>100){data=rows;try{localStorage.setItem(KEY,JSON.stringify({ts:Date.now(),rows:rows}))}catch(e){}}
      try{window.__lthNuplRows=data;document.dispatchEvent(new CustomEvent("nupl:data"))}catch(e){}
    }catch(e){if(!data){var em=$("nuplEmpty");if(em)em.textContent="历史暂不可用。点按「更新」重试。"}}
    finally{loading=false;draw()}
  }
  function view(){if(!data)return[];if(!range)return data;var cut=new Date(Date.now()-range*864e5).toISOString().slice(0,10);return data.filter(function(r){return r[0]>=cut})}
  function draw(){
    try{if(data&&window.__nuplRows!==data){window.__nuplRows=data;if(window.paintNuplBT)window.paintNuplBT()}}catch(e){}
    var cv=$("nuplChart"),shell=$("nuplShell"),em=$("nuplEmpty");if(!cv||!shell)return;
    var rows=view();if(rows.length<2){if(em)em.hidden=false;return}if(em)em.hidden=true;
    var w=Math.max(260,shell.clientWidth),h=Math.max(200,shell.clientHeight),dpr=Math.min(2,window.devicePixelRatio||1);
    cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr);var ctx=cv.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    var L=40,R=52,T=10,B=24,PW=w-L-R,PH=h-T-B;
    var vals=rows.map(function(r){return r[1]}),lo=Math.min(-.3,Math.floor(Math.min.apply(null,vals)*10)/10),hi=Math.max(.6,Math.ceil(Math.max.apply(null,vals)*10)/10);
    var pr=rows.map(function(r){return r[2]}),plo=Math.log10(Math.min.apply(null,pr)),phi=Math.log10(Math.max.apply(null,pr));if(phi-plo<.2){plo-=.1;phi+=.1}
    var X=function(i){return L+i/(rows.length-1)*PW},Y=function(v){return T+(1-(v-lo)/(hi-lo))*PH},YP=function(p){return T+(1-(Math.log10(p)-plo)/(phi-plo))*PH};
    var tert=css("--text-tertiary","#8a8a93"),grid=css("--border-subtle","rgba(0,0,0,.08)");
    ctx.font="11px -apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif";ctx.textBaseline="middle";
    // 左轴网格
    var step=(hi-lo)>1.2?.4:.2;ctx.lineWidth=1;
    for(var v=Math.ceil(lo/step)*step;v<=hi+1e-9;v+=step){var y=Math.round(Y(v))+.5;ctx.strokeStyle=grid;ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(L,y);ctx.lineTo(w-R,y);ctx.stroke();ctx.fillStyle=tert;ctx.textAlign="right";ctx.fillText(v.toFixed(1).replace("-","−"),L-6,y)}
    // 分界线：0 盈亏线、0.5 利润丰厚
    [[0,css("--text-secondary","#666"),.55],[.5,css("--market-positive","#0a9d58"),.6],[-.3,css("--market-negative","#dc4b32"),.6]].forEach(function(t){if(t[0]<lo||t[0]>hi)return;var y=Math.round(Y(t[0]))+.5;ctx.globalAlpha=t[2];ctx.strokeStyle=t[1];ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(L,y);ctx.lineTo(w-R,y);ctx.stroke();ctx.globalAlpha=1});ctx.setLineDash([]);
    // 右轴价格刻度
    ctx.textAlign="left";var lastY=1e9,fmtP=function(p){return p>=1e3?"$"+(+(p/1e3).toPrecision(3))+"K":"$"+(+p.toPrecision(2))};
    for(var k=Math.floor(plo);k<=Math.ceil(phi);k++){[1,3].forEach(function(m){var p=m*Math.pow(10,k),lp=Math.log10(p);if(lp<plo||lp>phi)return;var y=YP(p);if(Math.abs(lastY-y)<14)return;lastY=y;ctx.fillStyle=tert;ctx.fillText(fmtP(p),w-R+6,y)})}
    // 价格线
    ctx.strokeStyle="rgba(142,142,150,.75)";ctx.lineWidth=1.2;ctx.beginPath();rows.forEach(function(r,i){var x=X(i),y=YP(r[2]);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke();
    // NUPL 线
    ctx.strokeStyle="#e8973a";ctx.lineWidth=1.75;ctx.lineJoin="round";ctx.beginPath();rows.forEach(function(r,i){var x=X(i),y=Y(r[1]);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke();
    // 横轴年份
    ctx.fillStyle=tert;ctx.textBaseline="alphabetic";[0,.5,1].forEach(function(f){var i=Math.round(f*(rows.length-1));ctx.textAlign=f===0?"left":f===1?"right":"center";ctx.fillText(range&&range<=365?rows[i][0].slice(0,7):rows[i][0].slice(0,4),X(i),h-6)});
    // 按住查看
    var tip=$("nuplTip");
    if(hover>=0&&hover<rows.length){var r=rows[hover],x=X(hover);ctx.strokeStyle=css("--text-primary","#111");ctx.globalAlpha=.35;ctx.beginPath();ctx.moveTo(x,T);ctx.lineTo(x,T+PH);ctx.stroke();ctx.globalAlpha=1;
      ctx.fillStyle="#e8973a";ctx.beginPath();ctx.arc(x,Y(r[1]),3.5,0,Math.PI*2);ctx.fill();
      tip.innerHTML=r[0]+"<b>NUPL "+r[1].toFixed(3)+"</b>BTC $"+Math.round(r[2]).toLocaleString("en-US");tip.classList.add("on");tip.style.left=Math.max(4,Math.min(w-128,x-60))+"px"}
    else if(tip)tip.classList.remove("on");
    cv._rows=rows;cv._geom={L:L,PW:PW};
  }
  function bind(){
    var sec=$("lthNupl");if(!sec)return;
    sec.querySelectorAll("[data-nupl-range]").forEach(function(b){b.addEventListener("click",function(){range=+b.dataset.nuplRange;sec.querySelectorAll("[data-nupl-range]").forEach(function(x){var on=x===b;x.classList.toggle("active",on);x.setAttribute("aria-pressed",on?"true":"false")});hover=-1;draw()})});
    var cv=$("nuplChart");
    var move=function(e){var g=cv._geom,rows=cv._rows;if(!g||!rows)return;var rect=cv.getBoundingClientRect(),f=(e.clientX-rect.left-g.L)/g.PW;hover=Math.max(0,Math.min(rows.length-1,Math.round(f*(rows.length-1))));draw()};
    cv.addEventListener("pointerdown",move);cv.addEventListener("pointermove",function(e){if(e.pointerType==="mouse"||e.buttons)move(e)});
    ["pointerup","pointerleave","pointercancel"].forEach(function(t){cv.addEventListener(t,function(){hover=-1;draw()})});
    var rt=0;window.addEventListener("resize",function(){clearTimeout(rt);rt=setTimeout(draw,120)},{passive:true});
    window.addEventListener("themechange",draw);
  }
  function init(){if(inited)return;inited=true;bind();load(false)}
  window.refreshLthNuplChart=function(){return load(true)};
  // 「长期持有者」模块标题栏的「更新」同时更新本图表
  if(typeof window.refreshLthPsil==="function"){var _rp=window.refreshLthPsil;window.refreshLthPsil=function(){var r=_rp.apply(this,arguments);if(arguments[0])load(true);return r}}
  if(typeof lazySection==="function")lazySection("lthNupl",init);else init();
  document.addEventListener("toggle",function(e){if(e.target&&e.target.open&&e.target.querySelector&&e.target.querySelector("#lthNupl"))setTimeout(draw,60)},true);
})();

;/*EXT_SEP*/

(function(){
  "use strict";
  // V26.0.15：首页减半倒计时 + 逐块推进的区块链条。
  // 当前高度：mempool.space 最近区块（每分钟更新）；取不到时用已有的「剩余区块」反推。
  var HALVING=1050000,ERA_START=840000,blocks=[],lastTip=0,timer=0,shown=false;
  function $(id){return document.getElementById(id)}
  function ago(ts){var m=Math.max(0,Math.round((Date.now()/1000-ts)/60));return m<1?"刚刚":m<60?m+" 分钟前":Math.floor(m/60)+" 小时前"}
  function tipFromState(){var inp=$("shv"),days=inp?+inp.value:0,saved=S&&S.sigs?+S.sigs.hb||0:0,approx=Math.round(days*144),rem=saved>0&&Math.abs(saved-approx)<=144?saved:approx;return rem>0?HALVING-rem:0}
  function paint(){
    var box=$("halvingHero");if(!box)return;
    var tip=blocks.length?blocks[0].height:tipFromState();if(!(tip>ERA_START)){box.hidden=true;return}
    box.hidden=false;
    var rem=HALVING-tip,pct=Math.max(0,Math.min(100,(tip-ERA_START)/210000*100)),days=rem/144,eta=new Date(Date.now()+rem*600*1000);
    $("hhDays").textContent=Math.round(days).toLocaleString("en-US");
    $("hhPct").textContent=pct.toFixed(1)+"%";
    $("hhBlocks").textContent=rem.toLocaleString("en-US");
    $("hhHeight").textContent="#"+tip.toLocaleString("en-US");
    $("hhEnd").innerHTML="预计 "+eta.getUTCFullYear()+" 年 "+(eta.getUTCMonth()+1)+" 月<br>第 1,050,000 块";
    var w=pct.toFixed(2)+"%",fill=$("hhFill"),knob=$("hhKnob");
    if(!shown){shown=true;requestAnimationFrame(function(){requestAnimationFrame(function(){fill.style.width=w;knob.style.left=w})})}else{fill.style.width=w;knob.style.left=w}
    chain(tip);
  }
  // 区块链条：FLIP 动画。新区块到来时，原「出块中」的区块原地变为已确认（闪一下），整条链平滑左移一格，右侧出现新的「出块中」。
  var REDUCED=!!(window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches);
  function chain(tip){
    var strip=$("hhStrip");if(!strip)return;
    var cw=(strip.parentNode&&strip.parentNode.clientWidth)||320,fit=Math.max(2,Math.min(14,Math.floor((cw+12)/(76+12))-1));
    var list=[];if(blocks.length)list=blocks.slice(0,fit).reverse();else for(var q=fit-1;q>=0;q--)list.push({height:tip-q});
    var lastTs=blocks.length?blocks[0].timestamp:0,mine=lastTs?Math.min(98,Math.max(4,(Date.now()/1000-lastTs)/600*100)):35;
    var isNew=lastTip&&tip>lastTip;
    // 记录旧位置
    var first={};strip.querySelectorAll(".hb-blk").forEach(function(el){first[el.dataset.h]=el.getBoundingClientRect().left});
    var html=list.map(function(b,i){var latest=i===list.length-1,minted=isNew&&b.height>lastTip;return '<div class="hb-blk'+(latest?' latest':'')+(minted&&!REDUCED?' minted':'')+'" data-h="'+b.height+'"><b>#'+b.height.toLocaleString("en-US")+'</b><small>'+(b.timestamp?ago(b.timestamp):(latest?"最新":"已确认"))+'</small></div>'+'<i class="hb-link" aria-hidden="true"></i>'}).join("");
    html+='<div class="hb-blk next'+(isNew&&!REDUCED?' enter':'')+'" data-h="'+(tip+1)+'" style="--mine:'+mine.toFixed(0)+'%"><b>#'+(tip+1).toLocaleString("en-US")+'</b><small><span class="hb-dot"></span>出块中…</small></div>';
    strip.innerHTML=html;lastTip=tip;
    // 平滑左移：每个区块从旧位置滑到新位置
    if(isNew&&!REDUCED){
      strip.querySelectorAll(".hb-blk").forEach(function(el){
        var old=first[el.dataset.h];if(old==null)return;var dx=old-el.getBoundingClientRect().left;if(Math.abs(dx)<1)return;
        el.style.transition="none";el.style.transform="translateX("+dx+"px)";
        requestAnimationFrame(function(){requestAnimationFrame(function(){el.style.transition="transform .8s cubic-bezier(.2,.8,.2,1)";el.style.transform=""})});
      });
    }
  }
  async function poll(){
    if(document.visibilityState==="hidden")return;
    try{
      var r=await fetch("https://mempool.space/api/v1/blocks",{cache:"no-store"});if(!r.ok)throw 0;
      var j=await r.json();
      if(Array.isArray(j)&&j.length&&j[0].height>ERA_START)blocks=j.map(function(b){return{height:+b.height,timestamp:+b.timestamp}}).filter(function(b){return b.height>0});
    }catch(e){}
    paint();
  }
  function start(){clearInterval(timer);poll();timer=setInterval(poll,30000)}
  // 每 15 秒刷新「几分钟前」与出块进度，不发请求
  setInterval(function(){if(blocks.length&&document.visibilityState!=="hidden")chain(blocks[0].height)},15000);
  var rzT=0;window.addEventListener("resize",function(){clearTimeout(rzT);rzT=setTimeout(function(){var t=blocks.length?blocks[0].height:tipFromState();if(t)chain(t)},150)},{passive:true});
  document.addEventListener("visibilitychange",function(){if(document.visibilityState==="visible")poll()});
  var orig=window.sig;if(typeof orig==="function")window.sig=function(){var r=orig.apply(this,arguments);try{if(!blocks.length)paint()}catch(e){}return r};
  try{paint()}catch(e){}
  setTimeout(start,1200);
})();

;/*EXT_SEP*/

(function(){
  "use strict";
  // V26.1.3：沉睡 1 年以上的币重新流通量（Revived Supply 1y+）。
  // 数据：Bitview utxos_over_1y_old_transfer_volume_sum_24h（持有 ≥365 天的 UTXO 每日被花费量，BTC）。
  var COHORT={"1y":{series:"utxos_over_1y_old_transfer_volume_sum_24h",days:365,zh:"1 年",en:"1Y"},"6m":{series:"utxos_over_6m_old_transfer_volume_sum_24h",days:182,zh:"6 个月",en:"6M"}};
  var cohort="1y";try{var sc=localStorage.getItem("btc_revived_cohort_v1");if(COHORT[sc])cohort=sc}catch(e){}
  var KEY0="btc_bitview_revived_v3_",TTL=6*3600*1000;
  
  var data=null,range=0,hover=-1,loading=false,inited=false,p95=null,seriesName=null;
  function $(id){return document.getElementById(id)}
  function css(n,f){var v=getComputedStyle(document.documentElement).getPropertyValue(n).trim();return v||f}
  function fmt(v){var a=Math.abs(v);return a>=1e6?(v/1e6).toFixed(2)+"M":a>=1e4?(v/1e3).toFixed(0)+"K":a>=1e3?(v/1e3).toFixed(1)+"K":Math.round(v).toLocaleString("en-US")}
  async function fetchSeries(name){
    var raw=await tryFetch(bitviewBulkUrl(["date",name],"2011-01-01"),15000),d=pickSeries(raw,"date",0),v=pickSeries(raw,name,1);
    if(!Array.isArray(d)||!Array.isArray(v))throw new Error("no "+name);
    var m={},vals=[];for(var i=0;i<Math.min(d.length,v.length);i++){var x=+v[i];if(/^\d{4}-\d{2}-\d{2}$/.test(String(d[i]))&&Number.isFinite(x)&&x>=0){m[d[i]]=x;vals.push(x)}}
    if(vals.length<100)throw new Error("short "+name);
    // 若数值明显是聪（sats），换算成 BTC
    vals.sort(function(a,b){return a-b});var med=vals[vals.length>>1];
    if(med>2e7)for(var k in m)m[k]=m[k]/1e8;
    return m;
  }

  function labels(){
    var C=COHORT[cohort],en=window.BTC_LANG==="en",t=$("revivedTitle"),sub=$("revivedSub"),src=$("revivedSource"),cv=$("revivedChart");
    if(t)t.textContent=en?"Revived supply "+C.en+"+":"沉睡 "+C.zh+"以上的币重新流通";
    if(sub)sub.textContent=en?"BTC dormant for "+(cohort==="1y"?"1+ year":"6+ months")+" that moved again. Higher = more old coins moving (selling, transfers or wallet clean-up).":"沉睡 "+C.zh+"以上后重新转出的 BTC。越高 = 越多老币重新流通（可能是卖出，也可能是转账或整理钱包）。";
    if(src)src.textContent=en?"Bitview · UTXOs held ≥"+C.days+" days · UTC daily":"Bitview · 持有 ≥"+C.days+" 天的 UTXO · 按 UTC 日";
    if(cv)cv.setAttribute("aria-label",en?"Revived supply "+C.en+"+ and BTC price history":"沉睡 "+C.zh+"以上的币重新流通量与 BTC 价格历史");
    document.querySelectorAll("[data-rv-cohort]").forEach(function(x){var on=x.dataset.rvCohort===cohort;x.classList.toggle("active",on);x.setAttribute("aria-pressed",on?"true":"false")});
  }
  async function load(force){
    if(loading)return;var KEY=KEY0+cohort,c=null;try{c=JSON.parse(localStorage.getItem(KEY)||"null")}catch(e){}
    data=null;p95=null;labels();
    if(c&&Array.isArray(c.rows)&&c.rows.length){data=c.rows;seriesName=c.name;stats();draw()}else{var em0=$("revivedEmpty");if(em0){em0.hidden=false;em0.textContent=window.BTC_LANG==="en"?"Syncing full history…":"正在同步完整历史…"}clearStats();draw()}
    if(!force&&c&&Date.now()-c.ts<TTL)return;
    loading=true;
    try{
      var want=cohort,used=COHORT[want].series,m=await fetchSeries(used);
      if(want!==cohort)return;
      var price={};try{var raw=await tryFetch(bitviewBulkUrl(["date","price"],"2011-01-01"),15000),d=pickSeries(raw,"date",0),v=pickSeries(raw,"price",1);for(var j=0;j<Math.min(d.length,v.length);j++)if(+v[j]>0)price[d[j]]=+v[j]}catch(e){}
      var days=Object.keys(m).sort(),rows=[],win=[],sum=0;
      for(var q=0;q<days.length;q++){var dv=m[days[q]];win.push(dv);sum+=dv;if(win.length>7)sum-=win.shift();rows.push([days[q],+dv.toFixed(2),+sum.toFixed(2),price[days[q]]?+price[days[q]].toPrecision(7):null])}
      data=rows;seriesName=used;
      try{localStorage.setItem(KEY0+want,JSON.stringify({ts:Date.now(),rows:rows,name:used}))}catch(e){}
      stats();
    }catch(e){
      if(!data){var em=$("revivedEmpty");if(em)em.textContent="Bitview 暂未提供该序列，稍后自动重试。";var f=$("revivedFresh");if(f){f.textContent="暂不可用";f.className="fresh-badge warn"}}
    }finally{loading=false;draw()}
  }
  function clearStats(){["revivedPct","rvState"].forEach(function(id){var e=$(id);if(e){e.textContent="--";e.style.color=""}});var b=$("rvSig");if(b)b.hidden=true}
  var events=[];
  function fwd(i,n){var r=data[i],t=data[i+n];return r&&t&&r[3]&&t[3]?t[3]/r[3]-1:null}
  function med(a){if(!a.length)return null;var b=a.slice().sort(function(x,y){return x-y}),m=b.length>>1;return b.length%2?b[m]:(b[m-1]+b[m])/2}
  function pctTxt(v){return v==null?"--":(v>=0?"+":"")+(v*100).toFixed(1)+"%"}
  function cell(id,arr){var e=$(id);if(!e)return;if(!arr.length){e.innerHTML="--";return}var m=med(arr),up=arr.filter(function(x){return x>0}).length/arr.length,E=window.BTC_LANG==="en";
    e.innerHTML='<b style="color:'+(m>=0?"var(--market-positive)":"var(--market-negative)")+'">'+pctTxt(m)+'</b><small>'+(E?"up ":"上涨 ")+Math.round(up*100)+'% · n='+arr.length+'</small>'}
  function stats(){
    if(!data||!data.length)return;
    var E=window.BTC_LANG==="en",last=data[data.length-1],n=data.length,s30=0;for(var i=Math.max(0,n-30);i<n;i++)s30+=data[i][1];
    // 30 日合计的历史分位（2012 年起）
    var hist=[],acc=0,w=[];for(var j=0;j<n;j++){w.push(data[j][1]);acc+=data[j][1];if(w.length>30)acc-=w.shift();if(w.length===30&&data[j][0]>="2012-01-01")hist.push(acc)}
    var sorted=hist.slice().sort(function(a,b){return a-b}),lo=0,hi=sorted.length;while(lo<hi){var mid=(lo+hi)>>1;if(sorted[mid]<=s30)lo=mid+1;else hi=mid}
    var pct=sorted.length?Math.round(lo/sorted.length*100):null;
    var s7=data.filter(function(r){return r[0]>="2012-01-01"&&r[2]>0}).map(function(r){return r[2]}).sort(function(a,b){return a-b});p95=s7.length?s7[Math.floor(s7.length*.95)]:null;
    var pe=$("revivedPct");pe.textContent=pct==null?"--":pct+"%";pe.style.color=pct==null?"":pct>=90?"var(--market-negative)":pct>=70?"var(--market-caution)":"";
    var fw=(pct==null?0:pct)+"%";$("rvFill").style.width=fw;$("rvKnob").style.left=fw;
    $("rvState").textContent=pct==null?"--":pct>=90?(E?"Old coins moving en masse":"老币大规模移动"):pct>=70?(E?"Old coins moving more than usual":"老币移动偏多"):pct<=30?(E?"Old coins staying put":"老币按兵不动"):(E?"Within the usual range":"处于常见范围");
    $("rvPosNote").textContent=E?"30-day total "+fmt(s30)+" BTC":"近 30 日 "+fmt(s30)+" BTC";
    $("rvDayNote").textContent=E?"Latest day "+fmt(last[1])+" · 7 days "+fmt(last[2])+" BTC":"最近一日 "+fmt(last[1])+" · 7 日 "+fmt(last[2])+" BTC";
    // V26.4.5：信号 = 连续 7 个日历日的合计，升破「此前 4 年」的 95% 分位（每天只用当天之前的数据）· 间隔 ≥30 天
    events=[];var BI=window.BTCInsight,box=$("rvSig");
    if(BI&&BI.rollingEvents){
      var byDay=new Map();data.forEach(function(r){byDay.set(r[0],r)});
      var rows7=[];data.forEach(function(r){if(r[0]<"2012-01-01"||!(r[3]>0))return;var t=Date.parse(r[0]+"T00:00:00Z"),sum=0,ok=true;
        for(var k=0;k<7;k++){var d=new Date(t-k*864e5).toISOString().slice(0,10),x=byDay.get(d);if(!x||typeof x[1]!=="number"||!isFinite(x[1])){ok=false;break}sum+=x[1]}
        rows7.push({day:r[0],value:ok?sum:null,price:r[3]})});
      var R=BI.rollingEvents(rows7,{unit:"day",win:1461,q:.95,minN:730,gap:30});events=R.events;
      var sets=BI.forwardSets(rows7,events,{unit:"day",baseStart:R.first}),H=BI.horizons({unit:"day"});
      if(box){box.hidden=events.length<2;
        H.forEach(function(h){cell("rvS"+h,sets[h].sig);cell("rvB"+h,sets[h].base)});
        var T=R.current,le=events.length?rows7[events[events.length-1]]:null;
        $("rvSigRule").textContent=E?"7-day total crosses above the 95th pct of the prior 4 years (only data before that day) · ≥30 days apart"+(T!=null?" · now "+fmt(T)+" BTC":""):"7 日合计升破此前 4 年的 95% 分位（每天只用当天之前的数据）· 间隔 ≥30 天"+(T!=null?" · 现在 "+fmt(T)+" BTC":"");
        $("rvSigNote").textContent=le?(BI.verdictText(sets,{unit:"day"},E)+(E?" "+events.length+" signals · latest "+le.day+" · old coins moving can be selling, transfers or wallet clean-up; windows overlap.":"共 "+events.length+" 次 · 最近 "+le.day+" · 老币重新流通可能是卖出，也可能是转账或整理钱包；观察窗口可能重叠。")):"--";}
    }
    var f=$("revivedFresh");if(f){var age=Math.round((Date.now()-Date.parse(last[0]+"T00:00:00Z"))/864e5);f.textContent=(age>3?(E?"Stale · ":"滞后 · "):(E?"Data date · ":"数据日 · "))+last[0].slice(5);f.className="fresh-badge "+(age>3?"warn":"good")}
  }
  function view(){if(!data)return[];if(!range)return data;var cut=new Date(Date.now()-range*864e5).toISOString().slice(0,10);return data.filter(function(r){return r[0]>=cut})}
  function draw(){
    // V26.1.9：上方是 BTC 价格（像普通行情图），下方是「老币卖出量」柱子（像成交量）。
    // 柱子与价格线按同一标准着色：灰 = 正常，橙 = 偏多（高于历史 80% 分位），红 = 大量（高于 95% 分位）。
    var cv=$("revivedChart"),shell=$("revivedShell"),em=$("revivedEmpty");if(!cv||!shell)return;
    var all=view().filter(function(r){return r[3]>0});if(all.length<14){if(em)em.hidden=false;return}if(em)em.hidden=true;
    var w=Math.max(260,shell.clientWidth),h=Math.max(240,shell.clientHeight),dpr=Math.min(2,window.devicePixelRatio||1);
    cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr);var ctx=cv.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    // 按范围合并成周（或两周）柱
    var step=all.length>2600?14:all.length>220?7:1,bk=[];
    for(var i=0;i<all.length;i+=step){var seg=all.slice(i,i+step),sum=0;seg.forEach(function(r){sum+=r[1]});var lastR=seg[seg.length-1];bk.push({day:seg[0][0],end:lastR[0],price:lastR[3],sum:sum,v7:sum*7/seg.length})}
    var s7=data.filter(function(r){return r[0]>="2012-01-01"&&r[2]>0}).map(function(r){return r[2]}).sort(function(a,b){return a-b});
    var p80=s7.length?s7[Math.floor(s7.length*.8)]:Infinity,P95=s7.length?s7[Math.floor(s7.length*.95)]:Infinity;
    var lvl=function(v){return v>=P95?2:v>=p80?1:0},COL=["rgba(142,142,150,.55)","#f0a43a","#e5533d"],LINE=["#8e8e96","#f0a43a","#e5533d"];
    var L=8,R=56,T=10,B=22,GAP=12,PW=w-L-R,PH=Math.round((h-T-B-GAP)*.64),VH=h-T-B-GAP-PH,VY=T+PH+GAP;
    var X=function(k){return L+(bk.length===1?PW/2:k/(bk.length-1)*PW)};
    var pr=bk.map(function(b){return b.price}),plo=Math.log10(Math.min.apply(null,pr)),phi=Math.log10(Math.max.apply(null,pr));if(phi-plo<.15){plo-=.08;phi+=.08}
    var YP=function(p){return T+(1-(Math.log10(p)-plo)/(phi-plo))*PH};
    var vmax=Math.max.apply(null,bk.map(function(b){return b.v7}))||1,YV=function(v){return VY+VH-Math.min(1,v/vmax)*VH};
    var tert=css("--text-tertiary","#8a8a93"),grid=css("--border-subtle","rgba(0,0,0,.08)"),E=window.BTC_LANG==="en";
    ctx.font="11px -apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif";ctx.textBaseline="middle";ctx.textAlign="left";
    // 价格刻度（右侧）
    var lastY=1e9,fp=function(p){return p>=1e3?"$"+(+(p/1e3).toPrecision(3))+"K":"$"+(+p.toPrecision(2))};
    for(var e=Math.floor(plo);e<=Math.ceil(phi);e++)[1,2,5].forEach(function(m){var p=m*Math.pow(10,e),lp=Math.log10(p);if(lp<plo||lp>phi)return;var y=YP(p);if(Math.abs(lastY-y)<22)return;lastY=y;ctx.strokeStyle=grid;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(L,Math.round(y)+.5);ctx.lineTo(L+PW,Math.round(y)+.5);ctx.stroke();ctx.fillStyle=tert;ctx.fillText(fp(p),L+PW+6,y)});
    // 分区标签
    ctx.fillStyle=tert;ctx.font="600 10px -apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif";ctx.textBaseline="top";
    ctx.fillText(E?"BTC price":"BTC 价格",L+2,T+1);ctx.fillText(E?"Old coins moved (per week)":"老币重新流通量（每周）",L+2,VY-1);
    // 价格线：按当周老币卖出量着色
    ctx.lineWidth=2;ctx.lineJoin="round";ctx.lineCap="round";
    for(var k=1;k<bk.length;k++){ctx.strokeStyle=LINE[lvl(bk[k].v7)];ctx.beginPath();ctx.moveTo(X(k-1),YP(bk[k-1].price));ctx.lineTo(X(k),YP(bk[k].price));ctx.stroke()}
    // 柱子
    var bw=Math.max(1,Math.min(10,PW/bk.length*.72));
    bk.forEach(function(b,k){ctx.fillStyle=COL[lvl(b.v7)];var y=YV(b.v7);ctx.fillRect(X(k)-bw/2,y,bw,VY+VH-y)});
    // 95% 分位参考线
    if(P95<vmax){var yr=Math.round(YV(P95))+.5;ctx.strokeStyle="#e5533d";ctx.globalAlpha=.6;ctx.setLineDash([3,3]);ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(L,yr);ctx.lineTo(L+PW,yr);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;ctx.fillStyle="#e5533d";ctx.textBaseline="middle";ctx.font="10px -apple-system,sans-serif";ctx.fillText(E?"95th pct":"95% 分位",L+PW+6,yr)}
    ctx.fillStyle=tert;ctx.textBaseline="middle";ctx.font="10px -apple-system,sans-serif";ctx.fillText(fmt(vmax),L+PW+6,VY+4);
    // 时间轴
    ctx.font="11px -apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif";ctx.textBaseline="alphabetic";ctx.fillStyle=tert;
    [0,.5,1].forEach(function(f){var k=Math.round(f*(bk.length-1)),d=bk[k].end;ctx.textAlign=f===0?"left":f===1?"right":"center";ctx.fillText(range&&range<=182?d.slice(5):range&&range<=365?d.slice(0,7):d.slice(0,4),X(k),h-6)});
    // 按住查看
    var tip=$("revivedTip");
    if(hover>=0&&hover<bk.length){var b=bk[hover],x=X(hover),lv=lvl(b.v7);ctx.strokeStyle=css("--text-primary","#111");ctx.globalAlpha=.3;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,T);ctx.lineTo(x,VY+VH);ctx.stroke();ctx.globalAlpha=1;
      ctx.fillStyle=LINE[lv];ctx.beginPath();ctx.arc(x,YP(b.price),4,0,Math.PI*2);ctx.fill();
      var lvTxt=E?["Normal","Above usual","Heavy movement"][lv]:["正常","偏多","大量流通"][lv];
      tip.innerHTML=(step>1?b.day+" – "+b.end:b.end)+"<b>BTC $"+Math.round(b.price).toLocaleString("en-US")+"</b>"+(E?"Old coins moved ":"老币重新流通 ")+fmt(b.sum)+" BTC<br>"+lvTxt;tip.classList.add("on");tip.style.left=Math.max(4,Math.min(w-150,x-70))+"px"}
    else if(tip)tip.classList.remove("on");
    cv._rows=bk;cv._geom={L:L,PW:PW};
  }
  function bind(){
    var sec=$("revived1y");if(!sec)return;
    sec.querySelectorAll("[data-rv-range]").forEach(function(b){b.addEventListener("click",function(){range=+b.dataset.rvRange;sec.querySelectorAll("[data-rv-range]").forEach(function(x){var on=x===b;x.classList.toggle("active",on);x.setAttribute("aria-pressed",on?"true":"false")});hover=-1;draw()})});
    sec.querySelectorAll("[data-rv-cohort]").forEach(function(b){b.addEventListener("click",function(){if(b.dataset.rvCohort===cohort)return;cohort=b.dataset.rvCohort;try{localStorage.setItem("btc_revived_cohort_v1",cohort)}catch(e){}hover=-1;loading=false;load(false)})});
    var cv=$("revivedChart");
    var move=function(e){var g=cv._geom,rows=cv._rows;if(!g||!rows)return;var rect=cv.getBoundingClientRect(),f=(e.clientX-rect.left-g.L)/g.PW;hover=Math.max(0,Math.min(rows.length-1,Math.round(f*(rows.length-1))));draw()};
    cv.addEventListener("pointerdown",move);cv.addEventListener("pointermove",function(e){if(e.pointerType==="mouse"||e.buttons)move(e)});
    ["pointerup","pointerleave","pointercancel"].forEach(function(t){cv.addEventListener(t,function(){hover=-1;draw()})});
    var rt=0;window.addEventListener("resize",function(){clearTimeout(rt);rt=setTimeout(draw,120)},{passive:true});
    window.addEventListener("themechange",draw);
  }
  function init(){if(inited)return;inited=true;bind();load(false)}
  if(typeof window.refreshLthPsil==="function"){var _rp=window.refreshLthPsil;window.refreshLthPsil=function(){var r=_rp.apply(this,arguments);if(arguments[0])load(true);return r}}
  if(typeof lazySection==="function")lazySection("revived1y",init);else init();
  document.addEventListener("toggle",function(e){if(e.target&&e.target.open&&e.target.querySelector&&e.target.querySelector("#revived1y"))setTimeout(draw,60)},true);
})();

;/*EXT_SEP*/

(function(){
  "use strict";
  // V26.1.6：LTH_PSIL 历史极值。全部按页面已同步的 Bitview 完整历史（2013 年起）计算。
  var HALVINGS=["2016-07-09","2020-05-11","2024-04-20"];
  var en=function(){return window.BTC_LANG==="en"};
  function $(id){return document.getElementById(id)}
  function stats(){
    var d=typeof lthPsilData!=="undefined"?lthPsilData:null;if(!d||!Array.isArray(d.series)||d.series.length<365)return null;
    var S=d.series,last=S[S.length-1],ath=S[0],i;
    for(i=1;i<S.length;i++)if(+S[i].value>+ath.value)ath=S[i];
    var cut=new Date(Date.parse(last.day+"T00:00:00Z")-365*864e5).toISOString().slice(0,10),y1=null;
    for(i=0;i<S.length;i++)if(S[i].day>=cut&&(!y1||+S[i].value>+y1.value))y1=S[i];
    var below=0;for(i=0;i<S.length;i++)if(+S[i].value<=+last.value)below++;
    var pct=below/S.length*100;
    // 每个减半周期内的最高值
    var edges=[S[0].day].concat(HALVINGS,["9999-12-31"]),peaks=[];
    for(var e=0;e<edges.length-1;e++){var pk=null;for(i=0;i<S.length;i++){var r=S[i];if(r.day>=edges[e]&&r.day<edges[e+1]&&(!pk||+r.value>+pk.value))pk=r}if(pk&&+pk.value>=5)peaks.push(pk)}
    return{last:last,ath:ath,y1:y1,pct:pct,peaks:peaks};
  }
  function paint(){
    var st=stats(),box=$("psilHist");if(!box)return;
    if(!st){box.hidden=true;return}
    box.hidden=false;
    var E=en(),cur=+st.last.value,ath=+st.ath.value,p=Math.round(st.pct),y0=lthPsilData.series[0].day.slice(0,4);
    $("phPct").textContent=p+"%";$("phPct").style.color=p>=90?"var(--market-caution)":"";
    $("phPctNote").textContent=E?"Higher than "+p+"% of days since "+y0:"高于 "+y0+" 年以来 "+p+"% 的日子";
    var w=Math.max(0,Math.min(100,cur/ath*100)).toFixed(1)+"%";$("phFill").style.width=w;$("phKnob").style.left=w;
    $("phNow").textContent=(E?"Now ":"当前 ")+cur.toFixed(1)+"%";
    $("phAth").textContent=(E?"All-time high ":"历史最高 ")+ath.toFixed(1)+"%";
    var eras=[["2013","2016"],["2016","2020"],["2020","2024"],["2024",E?"now":"至今"]];
    var html=st.peaks.map(function(r,i){var top=r.day===st.ath.day,era=eras[eras.length-st.peaks.length+i]||["",""];
      return '<div class="ph-row'+(top?' top':'')+'"><span class="era">'+era[0]+'–'+era[1]+'</span><span class="bar"><i style="width:'+(+r.value/ath*100).toFixed(1)+'%"></i></span><span class="val">'+(+r.value).toFixed(1)+'%</span><span class="when">'+r.day+(top?(E?" · all-time high":" · 历史最高"):"")+'</span></div>'}).join("");
    $("phPeaks").innerHTML=html;
    var gap=cur-ath,y1=st.y1;
    $("phNote").textContent=y1?(E?"1-year high "+(+y1.value).toFixed(1)+"% · "+y1.day.slice(0,7):"近 1 年最高 "+(+y1.value).toFixed(1)+"% · "+y1.day.slice(0,7)):"";
  }
  function overlay(){
    var st=stats(),cv=$("lthPsilChart"),P=typeof lthPsilPlot!=="undefined"?lthPsilPlot:null;if(!st||!cv||!P||!P.rows||P.rows.length<2)return;
    var rows=P.rows,maxPct=Math.max(60,Math.ceil(Math.max.apply(null,rows.map(function(r){return +r.value}))/10)*10);
    var yPct=function(v){return P.y1-v/maxPct*P.ph},dpr=Math.min(2,window.devicePixelRatio||1),ctx=cv.getContext("2d");ctx.save();ctx.setTransform(dpr,0,0,dpr,0,0);
    // 历史最高虚线（全历史口径，即使当前范围看不到那次峰值也画出）
    var ya=yPct(+st.ath.value);if(ya>=P.y0-2){ctx.strokeStyle="#f7931a";ctx.globalAlpha=.7;ctx.setLineDash([5,4]);ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(P.x0,Math.round(ya)+.5);ctx.lineTo(P.x1,Math.round(ya)+.5);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;
}
    // 各周期峰值圆点
    var idx={};rows.forEach(function(r,i){idx[r.day]=i});
    st.peaks.forEach(function(pk){var i=idx[pk.day];if(i==null)return;var xx=P.x(i),yy=yPct(+pk.value);
      ctx.fillStyle="#fff";ctx.strokeStyle="#f7931a";ctx.lineWidth=2;ctx.beginPath();ctx.arc(xx,yy,4,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.font="600 10px system-ui,-apple-system,sans-serif";ctx.fillStyle="#d9800f";ctx.textBaseline="bottom";ctx.textAlign=xx>P.x1-40?"right":xx<P.x0+40?"left":"center";ctx.fillText(pk.day.slice(0,4),xx,yy-6)});
    ctx.restore();
  }
  ["renderLthPsilModule","drawLthPsilChart"].forEach(function(n){var o=window[n];if(typeof o!=="function")return;window[n]=function(){var r=o.apply(this,arguments);try{paint();overlay()}catch(e){}return r}});
  try{paint();overlay()}catch(e){}
})();

;/*EXT_SEP*/

(function(){
  "use strict";
  // V26.3：顶底区间。门槛 = 过去 48 个月的分位（至少 24 个有效月），每月只用当时已知数据。
  //  5 类指标先在类内平均，再合成综合分（0–100）：
  //   估值利润：MVRV、NUPL、LTH NUPL、Reserve Risk、获利筹码占比、PSIL（取反）
  //   短期情绪：STH NUPL；矿工：Puell；老币行为：1 年以上老币月度重新流通；趋势：Pi Cycle（111 日均线 ÷ 350 日均线×2）
  //  底部区：综合分 ≤ 25。顶部区：Reserve Risk 分位 ≥ 75；若 Pi Cycle 或老币放量也 ≥ 75，记为「强」。
  var KEY="btc_bitview_topbottom_v2",TTL=12*3600*1000,W=48,MIN=24,inited=false,M=null;
  // V26.4：GitHub 每天预先下载的月度序列（data/monthly.json）；缺失、超过 48 小时或缺组时回到直接请求 Bitview
  if(!window.monthlyRaw){var _mp=null;window.monthlyRaw=function(ser){
    if(!_mp)_mp=fetch("data/monthly.json?d="+new Date().toISOString().slice(0,10),{cache:"no-store"}).then(function(r){return r.ok?r.json():null}).catch(function(){return null});
    return _mp.then(function(j){if(!j||j.v!==1||!j.groups)return null;var age=Date.now()-Date.parse(j.generated);if(!(age<48*3600*1000))return null;return j.groups[ser.join(",")]||null})}}
  var SER_A=["date","lth_nupl","lth_supply_in_loss_share","utxos_over_1y_old_transfer_volume_sum_1m","price","nupl","sth_nupl","supply_in_profit_share","reserve_risk"];
  var SER_B=["date","mvrv","puell_multiple","price_sma_111d","price_sma_350d_x2"];
  // V27.5：顶部证据之一「长期持有者连续减持」需要的月度序列
  var SER_C=["date","lth_supply_delta_1m"];
  var FAMS=[["value",["mvrv","mnupl","nupl","rrl","sip","psilInv"],"估值利润","Valuation"],["sth",["snupl"],"短期情绪","Short-term"],["miner",["puell"],"矿工","Miners"],["old",["rev"],"老币行为","Old coins"],["trend",["pi"],"趋势","Trend"]];
  function $(id){return document.getElementById(id)}
  function E(){return window.BTC_LANG==="en"}
  function num(v){if(v==null||v==="")return null;v=+v;return Number.isFinite(v)?v:null}
  function pt(v){return v==null?"--":(v>=0?"+":"")+(v*100).toFixed(0)+"%"}
  var P=null;
  function rp(a,i){if(i+1<MIN)return null;var lo=Math.max(0,i-W+1),n=0,c=0;for(var j=lo;j<=i;j++){c++;if(a[j]<=a[i])n++}return n/c*100}
  function rpCol(a){var out=[];for(var i=0;i<a.length;i++){if(a[i]==null){out.push(null);continue}var n=0,c=0;for(var j=Math.max(0,i-W+1);j<=i;j++){if(a[j]==null)continue;c++;if(a[j]<=a[i])n++}out.push(c>=MIN?n/c*100:null)}return out}
  function prep(){
    var col=function(k){return M.map(function(r){return r[k]})};
    P={};["mvrv","mnupl","nupl","rrl","sip","psil","snupl","puell","rev","pi"].forEach(function(k){P[k]=rpCol(col(k))});
    P.psilInv=P.psil.map(function(v){return v==null?null:100-v});
  }
  function lthDist(i){var x=M[i]&&M[i].lth;if(x==null||!(x<0))return false;var s3=0;for(var j=Math.max(0,i-2);j<=i;j++)s3+=(M[j].lth||0);return s3<0}
  function mvrvDiv(i){var mv=M[i]&&M[i].mvrv;if(mv==null||!(mv>1.5))return false;var hp=0,hm=0;
    for(var j=Math.max(0,i-24);j<=i;j++){if(M[j].price>hp)hp=M[j].price;if(j<i&&M[j].mvrv>hm)hm=M[j].mvrv}
    return hm>0&&M[i].price>=.85*hp&&mv<=.85*hm}
  function evalAt(i){
    var fam={},vals=[];
    FAMS.forEach(function(f){var xs=f[1].map(function(k){return P[k][i]}).filter(function(v){return v!=null});fam[f[0]]=xs.length?xs.reduce(function(a,b){return a+b},0)/xs.length:null;if(fam[f[0]]!=null)vals.push(fam[f[0]])});
    var score=vals.length>=3?vals.reduce(function(a,b){return a+b},0)/vals.length:null;
    if(score==null)return null;
    var rr=P.rrl[i],pi=P.pi[i],rev=P.rev[i];
    // V27.5：顶部区 = 三项证据满足两项
    //   ① Reserve Risk 4 年分位 ≥ 75
    //   ② 长期持有者连续减持：当月净减持，且近 3 个月合计也是净减持
    //   ③ MVRV 背离：价格在近 2 年最高价的 85% 以内，MVRV 却比此前 2 年最高 MVRV 低 15% 以上（且 MVRV > 1.5，处在牛市阶段）
    var eRR=rr!=null&&rr>=75,eLTH=lthDist(i),eDIV=mvrvDiv(i),cnt=(eRR?1:0)+(eLTH?1:0)+(eDIV?1:0);
    var top=cnt>=2,strong=top&&((pi||0)>=75||(rev||0)>=75);
    // V27.8：深度底部——长期持有者亏损供应占比 LTH_PSIL ≥ 42%。2013 年以来只在四次大底出现（2015-01～09、2018-11～2019-03、2022-11～12、2026-06～07），
    // 第一次出现的月份之后最多再跌 0%～14%；出现时一定算底部区
    var psil=M[i]&&M[i].psil,deep=psil!=null&&psil>=42;
    return{score:score,fam:fam,rr:rr,pi:pi,rev:rev,eRR:eRR,eLTH:eLTH,eDIV:eDIV,cnt:cnt,psil:psil,deep:deep,bottom:score<=25.0001||deep,top:top&&!deep,strong:strong,r:M[i]};
  }
  async function fetchCols(ser,start){
    var url=bitviewBulkUrl(ser,start).replace("index=day1","index=month1"),raw=(start==="2012-01-01"&&window.monthlyRaw?await window.monthlyRaw(ser):null)||await tryFetch(url,15000),out={};
    var cols=ser.map(function(n,i){return pickSeries(raw,n,i)});if(!cols.every(Array.isArray))throw new Error("bad");
    for(var i=0;i<cols[0].length;i++){var m=String(cols[0][i]).slice(0,7);if(!/^\d{4}-\d{2}$/.test(m))continue;var o={};ser.forEach(function(n,k){if(k)o[n]=num(cols[k][i])});out[m]=o}
    return out;
  }
  async function load(){
    var c=null;try{c=JSON.parse(localStorage.getItem(KEY)||"null")}catch(e){}
    if(c&&c.rows&&c.rows.length){M=c.rows;prep();render()}
    if(c&&Date.now()-c.ts<TTL)return;
    try{
      var A=await fetchCols(SER_A,"2012-01-01"),B=await fetchCols(SER_B,"2012-01-01").catch(function(){return {}}),C=await fetchCols(SER_C,"2012-01-01").catch(function(){return {}});
      var rows=Object.keys(A).sort().map(function(m){var a=A[m],b=B[m]||{};
        return{m:m,nupl:a.lth_nupl,psil:a.lth_supply_in_loss_share,rev:a.utxos_over_1y_old_transfer_volume_sum_1m,price:a.price,mnupl:a.nupl,snupl:a.sth_nupl,sip:a.supply_in_profit_share,
          rrl:a.reserve_risk>0?Math.log10(a.reserve_risk):null,mvrv:b.mvrv,lth:(C[m]||{}).lth_supply_delta_1m,puell:b.puell_multiple,pi:b.price_sma_111d>0&&b.price_sma_350d_x2>0?b.price_sma_111d/b.price_sma_350d_x2:null}}).filter(function(r){return r.price>0&&r.nupl!=null});
      if(rows.length<36)throw new Error("short");
      M=rows;prep();try{localStorage.setItem(KEY,JSON.stringify({ts:Date.now(),rows:rows}))}catch(e){}
      render();
    }catch(e){if(!M){$("ctHeadline").textContent=E()?"Unavailable":"暂不可用";$("ctDetail").textContent=E()?"Bitview monthly history could not be loaded; it will retry.":"Bitview 月度历史暂时无法读取，稍后自动重试。";var f=$("ctFresh");f.textContent=E()?"Unavailable":"暂不可用";f.className="fresh-badge warn"}}
  }
  // V26.4：底部仪表 = 100 − 综合分（≥ 75 即综合分 ≤ 25，进入底部区）；顶部仪表 = Reserve Risk 4 年分位（≥ 75 进入顶部区）
  function gauge(el,val,on,note,pill,sig){
    if(!el)return;var L=216.77,v=Math.max(0,Math.min(100,val==null?0:val));
    var at=function(p){var a=(135+2.7*p)*Math.PI/180;return [60+46*Math.cos(a),60+46*Math.sin(a)]};
    var arc=el.querySelector(".tbg2-arc"),zone=el.querySelector(".tbg2-zone"),notch=el.querySelector(".tbg2-notch"),knob=el.querySelector(".tbg2-knob");
    arc.style.strokeDasharray=(L*v/100).toFixed(1)+" "+L.toFixed(1);
    zone.style.strokeDasharray="0 "+(L*.75).toFixed(1)+" "+(L*.25).toFixed(1)+" "+L.toFixed(1);
    var n=at(75),k=at(v);notch.setAttribute("cx",n[0].toFixed(1));notch.setAttribute("cy",n[1].toFixed(1));knob.setAttribute("cx",k[0].toFixed(1));knob.setAttribute("cy",k[1].toFixed(1));
    knob.style.opacity=val==null?0:1;
    el.classList.toggle("on",!!on);el.querySelector(".tbg2-center b").textContent=val==null?"--":Math.round(v);
    el.querySelector(".tbg2-center small").textContent=note;el.querySelector(".tbg2-pill").textContent=pill;
    var ft=el.querySelector(".tbg2-foot");if(ft){var en=window.BTC_LANG==="en";ft.textContent=(sig?(en?"Signals ":"信号 ")+sig+" · ":"")+(en?ft.dataset.baseEn:ft.dataset.base)}
  }
  function gauges(v,en){
    var b=100-v.score,cnt=function(id){var e=$(id);var t=e?String(e.textContent||"").trim():"";return /\d/.test(t)?t.replace(/\s+/g,""):""};
    var bc=cnt("csBottomCount"),tc=cnt("csTopCount");
    gauge($("tbgBottom"),b,v.bottom,v.bottom?(en?"in zone":"已进入"):(en?Math.ceil(75-b)+" pts to go":"还差 "+Math.ceil(75-b)+" 分"),v.bottom?(v.deep?(en?"Deep bottom":"深度底部"):(en?"Bottom zone":"底部区")):(en?"Not in zone":"未进入"),bc);
    var tv=[8,45,80,100][v.cnt]||0,tg=$("tbgTop");
    gauge(tg,tv,v.top,v.top?(en?"in zone":"已进入"):(en?(2-v.cnt)+" more to go":"还差 "+(2-v.cnt)+" 项"),v.top?(v.strong?(en?"Top · strong":"顶部区 · 强"):(en?"Top zone":"顶部区")):(en?"Not in zone":"未进入"),tc);
    if(tg){var cb=tg.querySelector(".tbg2-center b");if(cb)cb.textContent=v.cnt+"/3"}
  }
  function famColor(v){return v==null?"var(--text-tertiary)":v<=25?"var(--market-positive)":v>=75?"var(--market-negative)":v>=60?"var(--market-caution)":"var(--text-secondary)"}
  function render(){
    if(!M||!P)return;var en=E(),i=M.length-1,v=evalAt(i);if(!v)return;
    var st=$("ctStatus");st.className="ct-status"+(v.bottom?" bottom":v.top?" top":"");
    $("ctHeadline").textContent=v.bottom?(v.deep?(en?"Bottom zone · deep":"底部区 · 深度"):(en?"Bottom zone":"底部区")):v.top?(v.strong?(en?"Top zone · strong":"顶部区 · 强"):(en?"Top zone":"顶部区")):(en?"Neutral":"中性区间");
    $("ctDetail").textContent=v.bottom?(v.deep?(en?"Long-term holders in loss "+Math.round(v.psil)+"% (≥ 42%): seen only at the 2015, 2018, 2022 and 2026 bottoms.":"长期持有者浮亏 "+Math.round(v.psil)+"%（≥ 42%）：只在 2015、2018、2022、2026 年四次大底出现过。"):(en?"Composite ≤ 25. Past bottoms all landed in this zone.":"综合分 ≤ 25。历史底部都出现在这一区间。")):v.top?(en?v.cnt+" of 3 top signals present. Pair with risk control below.":"顶部证据满足 "+v.cnt+" / 3。配合下方风控使用。"):(en?"Neither zone is active this month.":"本月不在底部区，也不在顶部区。");
    $("ctNeedle").style.left=Math.max(2,Math.min(98,v.score)).toFixed(1)+"%";
    $("ctNow").textContent=(en?"Composite ":"综合分 ")+Math.round(v.score);
    $("tbFams").innerHTML=FAMS.map(function(f){var x=v.fam[f[0]];return '<div class="tb-fam"><span>'+(en?f[3]:f[2])+'</span><i><b style="width:'+(x==null?0:x.toFixed(0))+'%;background:'+famColor(x)+'"></b></i><em style="color:'+famColor(x)+'">'+(x==null?"--":Math.round(x))+'</em></div>'}).join("");
    var ok=function(b){return b?'<b class="tb-ok">✓</b>':'<b class="tb-no">—</b>'};
    $("tbTop").innerHTML='<div class="tb-top-title">'+(en?"Top zone · 2 of 3":"顶部区 · 三项满足两项")+'<small>'+(en?"Strong if Pi Cycle or old coins moving also ≥ 75":"Pi Cycle 或老币放量也 ≥ 75 时为「强」")+'</small></div>'
      +'<div class="tb-top-row">'+ok(v.eRR)+'<span>'+(en?"Reserve Risk ≥ 75th pct":"Reserve Risk ≥ 75% 分位")+'</span><em>'+(v.rr==null?"--":Math.round(v.rr)+"%")+'</em></div>'
      +'<div class="tb-top-row">'+ok(v.eLTH)+'<span>'+(en?"Long-term holders keep selling":"长期持有者连续减持")+'</span><em>'+(v.r.lth==null?"--":(v.r.lth>=0?"+":"−")+(en?(Math.abs(v.r.lth)/1e3).toFixed(0)+"K":(Math.abs(v.r.lth)/1e4).toFixed(1)+"万"))+'</em></div>'
      +'<div class="tb-top-row">'+ok(v.eDIV)+'<span>'+(en?"MVRV lags new highs":"MVRV 背离")+'</span><em>'+(v.r.mvrv==null?"--":v.r.mvrv.toFixed(2))+'</em></div>';
    // 历史：连续同类月份合并为一段
    var eps=[],cur=null;
    for(var k=0;k<M.length;k++){var e=evalAt(k);var t=e?(e.bottom?"b":e.top?(e.strong?"T":"t"):null):null;
      if(t&&cur&&(cur.t===t||(cur.t!=="b"&&t!=="b"))&&cur.end===k-1){cur.end=k;if(t==="T")cur.t="T"}else if(t){cur={t:t,start:k,end:k};eps.push(cur)}else cur=null}
    var fw=function(k,n){return k+n<M.length?M[k+n].price/M[k].price-1:null};
    var html='<div class="ct-row h"><span>'+(en?"Months":"月份")+'</span><span>'+(en?"Zone":"区间")+'</span><span>'+(en?"+3M":"3 个月后")+'</span><span>'+(en?"+6M":"6 个月后")+'</span></div>';
    eps.slice().reverse().forEach(function(p){var a=M[p.start].m,b=M[p.end].m;
      html+='<div class="ct-row"><span>'+a+(b!==a?" – "+b:"")+'</span><span class="'+(p.t==="b"?"t-b":"t-t")+'">'+(p.t==="b"?(en?"Bottom":"底部区"):p.t==="T"?(en?"Top · strong":"顶部区 · 强"):(en?"Top":"顶部区"))+'</span><span>'+pt(fw(p.start,3))+'</span><span>'+pt(fw(p.start,6))+'</span></div>'});
    $("ctHistory").innerHTML=html;
    var f=$("ctFresh");if(f){f.textContent=(en?"Data date · ":"数据日 · ")+v.r.m;f.className="fresh-badge good"}
    try{gauges(v,en)}catch(e){}
    // V27.9：底部确认——近 24 个月里 LTH_PSIL 冲上过 42%，之后回落 8 个百分点以上（2015-10、2019-05、2023-01、2026-08 都是这样确认的）
    try{var cf=$("ctConfirm");if(!cf){var dt=$("ctDetail");if(dt){cf=document.createElement("p");cf.id="ctConfirm";cf.className="ct-confirm";dt.insertAdjacentElement("afterend",cf)}}
      if(cf){var pk=-1,pkv=0;for(var q=Math.max(0,i-24);q<=i;q++){var pv=M[q].psil;if(pv!=null&&pv>=42&&pv>=pkv){pk=q;pkv=pv}}
        var cur=M[i].psil,txt="";
        if(pk>=0&&cur!=null){
          if(cur>=42)txt=en?"Deep bottom in progress · long-term holders in loss "+Math.round(cur)+"%":"深度底部进行中 · 长期持有者浮亏 "+Math.round(cur)+"%";
          else{var cm=null;for(var q2=pk+1;q2<=i;q2++){if(M[q2].psil!=null&&M[q2].psil<=pkv-8){cm=M[q2].m;break}}
            if(cm)txt=en?"Bottom confirmed in "+cm+" · LTH in loss fell from "+Math.round(pkv)+"% to "+Math.round(cur)+"%":"底部已确认（"+cm+"）· 长期持有者浮亏从 "+Math.round(pkv)+"% 回落到 "+Math.round(cur)+"%"}}
        cf.textContent=txt;cf.hidden=!txt}}catch(e){}
    window.__TB={zone:v.bottom?"bottom":v.top?(v.strong?"topStrong":"top"):"neutral",score:v.score,month:v.r.m,risk:"off"};
    var IND={};["mvrv","mnupl","nupl","rrl","sip","psil","snupl","puell","rev","pi"].forEach(function(k){IND[k]={v:M[i][k],p:P[k][i],prev:i>0?M[i-1][k]:null}});window.__TBD={fam:v.fam,ind:IND,month:v.r.m};
    try{risk()}catch(e){}
    try{document.dispatchEvent(new CustomEvent("tb:update"))}catch(e){}
  }
  // V26 Beta 22：牛市后期风控——NUPL 确认进入牛市后期后，月线收盘较本轮最高回撤 20% 时提示一次。
  function risk(){
    var en=E(),nu=M.map(function(r){return r.nupl}),n=M.length,nrs=[];for(var i=0;i<n;i++)nrs.push(rp(nu,i));
    var hi=null,hiI=null,armed=false,evs=[],state=[];
    for(var k=0;k<n;k++){var late=false;for(var j=Math.max(0,k-12);j<=k;j++)if((nrs[j]||0)>=85)late=true;
      if(late){if(hi==null||M[k].price>hi){hi=M[k].price;hiI=k;armed=true}var dd=M[k].price/hi-1;
        if(armed&&dd<=-0.2){var mn=Infinity;for(var q=k;q<Math.min(n,k+19);q++)mn=Math.min(mn,M[q].price);evs.push({k:k,hiI:hiI,ratio:M[k].price/hi,after:k+1<n?mn/M[k].price-1:null});armed=false}
        state[k]={late:true,hi:hi,hiI:hiI,dd:dd,armed:armed}}
      else{hi=null;armed=false;state[k]={late:false}}}
    var cur=state[n-1],box=$("ctRisk"),maxNr=0;for(var t=Math.max(0,n-13);t<n;t++)maxNr=Math.max(maxNr,nrs[t]||0);
    var money=function(v){return "$"+Math.round(v).toLocaleString("en-US")};
    box.className="psil-hist ct-risk"+(cur.late?(cur.armed?" watch":" fire"):"");
    if(window.__TB)window.__TB.risk=!cur.late?"off":cur.armed?"watch":"fired";if(window.__TB&&cur.late&&cur.armed)window.__TB.dd=cur.dd;
    if(!cur.late){
      $("crState").textContent=en?"Not active":"未启动";
      $("crSub").textContent=en?"Starts at NUPL 85th pct (12-month high "+Math.round(maxNr)+"%)":"NUPL 达 85% 分位后启动（近 12 月最高 "+Math.round(maxNr)+"%）";
      $("crFill").style.width="0%";$("crKnob").style.left="0%";$("crNow").textContent=en?"Inactive":"未启动";
      $("crNote").textContent=en?"Inactive outside a late bull market.":"仅在牛市后期启动。";
    }else{
      var dd=cur.dd,p=Math.max(0,Math.min(100,-dd/0.2*100));
      $("crFill").style.width=p+"%";$("crKnob").style.left=p+"%";
      $("crNow").textContent=(en?"Now ":"当前 ")+(dd*100).toFixed(1)+"%";
      $("crSub").textContent=(en?"Cycle high monthly close ":"本轮最高月线收盘 ")+money(cur.hi)+" · "+M[cur.hiI].m;
      if(cur.armed){$("crState").textContent=(dd*100).toFixed(1)+"%";
        $("crNote").textContent=en?"Prompt below "+money(cur.hi*0.8)+" (−20%). Fires after the top by design.":"月线收盘低于 "+money(cur.hi*0.8)+"（−20%）时提示。规则必然在顶部之后触发。"}
      else{$("crState").textContent=en?"Triggered":"已提示";
        $("crNote").textContent=en?"20%+ below the cycle high: the point your plan named. Resets on a new high.":"已较本轮高点回撤 20% 以上：按你预设的计划执行。创新高后重置。"}
    }
    var html='<div class="ct-row r4 h"><span>'+(en?"Prompt":"提示月份")+'</span><span>'+(en?"Cycle high":"本轮高点")+'</span><span>'+(en?"Price vs high":"占高点")+'</span><span>'+(en?"Lower within 18M":"之后最低")+'</span></div>';
    evs.slice().reverse().forEach(function(e){html+='<div class="ct-row r4"><span>'+M[e.k].m+'</span><span>'+M[e.hiI].m+'</span><span>'+Math.round(e.ratio*100)+'%</span><span style="color:var(--market-negative)">'+(e.after==null?"--":pt(e.after))+'</span></div>'});
    $("crHistory").innerHTML=html;
    try{var zs=[],gb=[],gt=[],gd=[],gp=[];for(var q=0;q<n;q++){var ev=evalAt(q);zs.push(ev?(ev.bottom?"b":ev.top?(ev.strong?"T":"t"):"n"):"n");gb.push(ev&&ev.score!=null?100-ev.score:null);gt.push(ev?ev.cnt:null);gd.push(!!(ev&&ev.deep));gp.push(ev&&ev.psil!=null?ev.psil:null)}
      window.__TBM={rows:M.map(function(r){return{m:r.m,price:r.price}}),zone:zs,risk:evs.map(function(e){return e.k}),gBottom:gb,gTop:gt,deep:gd,psil:gp};
      document.dispatchEvent(new CustomEvent("tbm:update"))}catch(e){}
    try{var H=[];for(var q=0;q<n;q++){var ev2=evalAt(q);H.push({m:M[q].m,price:M[q].price,zone:ev2?(ev2.bottom?"b":ev2.top?"t":"n"):null,prompt:false})}
      evs.forEach(function(e){if(H[e.k])H[e.k].prompt=true});window.__TBHist=H;document.dispatchEvent(new CustomEvent("tb:hist"))}catch(e){}
  }
  function init(){if(inited)return;inited=true;load()}
  window.__tbmInit=init;
  if(typeof lazySection==="function")lazySection("cycleThermo",init);else init();
  setTimeout(init,2500);  // 首页「今日结论」需要这份结果
  document.addEventListener("toggle",function(e){if(e.target&&e.target.open&&e.target.querySelector&&e.target.querySelector("#cycleThermo"))init()},true);
})();

;/*EXT_SEP*/

(function(){
  "use strict";
  // V26 Beta 25：底栏选中「液滴」——滑动到选中的分区，移动时像液体一样拉伸回弹。
  var bar=document.getElementById("tabBar");if(!bar)return;
  var lens=document.createElement("span");lens.className="tab-lens";lens.setAttribute("aria-hidden","true");lens.innerHTML="<i></i>";bar.insertBefore(lens,bar.firstChild);
  var last=null;
  function place(anim){
    var a=bar.querySelector(".tab.active")||bar.querySelector('.tab[aria-current="page"]');
    if(!a||!a.offsetWidth){lens.style.opacity="0";return}
    var x=a.offsetLeft,w=a.offsetWidth;lens.style.opacity="1";lens.style.width=w+"px";lens.style.transform="translateX("+x+"px)";
    if(anim&&last&&last!==a){var i=lens.firstChild;i.classList.remove("morph");void i.offsetWidth;i.classList.add("morph")}
    last=a;
  }
  var orig=window.setTab;if(typeof orig==="function")window.setTab=function(){var r=orig.apply(this,arguments);requestAnimationFrame(function(){place(true)});return r};
  bar.addEventListener("pointerdown",function(e){var t=e.target.closest&&e.target.closest(".tab");if(t&&t.classList.contains("active"))lens.classList.add("press")});
  ["pointerup","pointercancel","pointerleave"].forEach(function(n){bar.addEventListener(n,function(){lens.classList.remove("press")})});
  var rt=0;window.addEventListener("resize",function(){clearTimeout(rt);rt=setTimeout(function(){place(false)},80)},{passive:true});
  lens.style.transition="none";place(false);requestAnimationFrame(function(){requestAnimationFrame(function(){lens.style.transition="";place(false)})});
  setTimeout(function(){place(false)},600);
})();

;/*EXT_SEP*/

(function(){
  "use strict";
  // V26.3：首页「今日结论」——AHR999 分区 + 顶底区间 + 牛市后期风控，合成一句话与对应的执行提示。
  function $(id){return document.getElementById(id)}
  function E(){return window.BTC_LANG==="en"}
  var card=null;
  function ensure(){
    if(card)return card;var hero=$("heroAhr");if(!hero)return null;
    var host=document.getElementById("today")||hero.closest(".aurum-hero")||hero.closest("section")||hero.parentElement;if(!host)return null;
    card=document.createElement("section");card.className="today-verdict";card.id="todayVerdict";card.setAttribute("aria-label","今日结论");
    card.innerHTML='<div class="tv-head"><h2>今日结论</h2><small id="tvDate"></small></div><p class="tv-main" id="tvMain">计算中…</p><span class="tv-act" id="tvAct"><i></i><span>--</span></span>'
      +'<div class="tv-chips"><button class="tv-chip" type="button" data-go="ahr"><small>AHR999</small><b id="tvAhr">--</b></button><button class="tv-chip" type="button" data-go="tb"><small>顶底区间</small><b id="tvTb">--</b></button><button class="tv-chip" type="button" data-go="risk"><small>牛市风控</small><b id="tvRisk">--</b></button></div>'
      +'<div class="tv-why" id="tvWhy" hidden></div>'
      +'<p class="tv-note">按本站规则汇总，不构成投资建议。</p>';
    card.dataset.tab="now";  // 只属于「行情」分区，切换到其他分区时随首页大卡片一起隐藏
    host.insertAdjacentElement("afterend",card);
    if(host.style.display==="none")card.style.display="none";
    card.addEventListener("click",function(e){var b=e.target.closest("[data-go]");if(!b)return;var g=b.dataset.go;
      var MOD={costBands:["chain","costBands"],ageCost:["chain","ageCost"],lthMonthly:["chain","lthMonthly"],stable:["value","stableX"]};
      if(MOD[g]){try{setTab(MOD[g][0])}catch(x){}setTimeout(function(){var t=$(MOD[g][1]);if(!t)return;var d=t.closest("details");if(d)d.open=true;setTimeout(function(){t.scrollIntoView({behavior:"smooth",block:"start"})},120)},250);return}
      if(g==="ahr"){var t=$("ahr");if(t)t.scrollIntoView({behavior:"smooth",block:"start"});return}
      try{setTab("value")}catch(x){}var d=document.querySelector('details[data-module=cycleZones]');if(d)d.open=true;
      setTimeout(function(){var t=$(g==="risk"?"ctRisk":"cycleThermo");if(t)t.scrollIntoView({behavior:"smooth",block:"start"})},250)});
    return card;
  }
  function paint(){
    if(!ensure())return;var en=E();
    var ab=$("ahrBig"),ahr=parseFloat(ab&&ab.dataset?ab.dataset.ahrRefit:NaN),zk=ab&&ab.dataset?ab.dataset.zoneRefit:"";
    var ZN={deep:["深度低估","Deep value"],value:["长期低估","Long-term value"],warm:["估值偏热","Running warm"],over:["高估风险","Overvalued risk"]},zone=ZN[zk]?ZN[zk][en?1:0]:"";
    var TB=window.__TB||null;
    var tbTxt=!TB?"--":TB.zone==="bottom"?(en?"Bottom zone":"底部区"):TB.zone==="topStrong"?(en?"Top · strong":"顶部区 · 强"):TB.zone==="top"?(en?"Top zone":"顶部区"):(en?"Neutral":"中性区间");
    var rkTxt=!TB?"--":TB.risk==="fired"?(en?"Prompted":"已提示"):TB.risk==="watch"?(en?"Watching":"监控中"):(en?"Inactive":"未启动");
    var act,color;
    if(TB&&TB.risk==="fired"){act=en?"Risk prompt: follow your reduce plan":"风控已提示：按预设计划减仓";color="var(--market-negative)"}
    else if(TB&&(TB.zone==="top"||TB.zone==="topStrong")){act=en?"Top zone: pause extra buys, prepare your exit plan":"顶部区域：暂停加仓，准备风控";color="var(--market-caution)"}
    else if((TB&&TB.zone==="bottom")||(Number.isFinite(ahr)&&ahr<0.45)){act=en?"Bottom area: extra buys per your plan":"底部区域：可按计划加大定投";color="var(--market-positive)"}
    else if(Number.isFinite(ahr)&&ahr<=1.2){act=en?"Keep your regular DCA":"按计划定投";color="var(--market-positive-emphasis)"}
    else if(Number.isFinite(ahr)){act=en?"Valuation high: slow down DCA":"估值偏高：放慢定投";color="var(--market-caution)"}
    else{act=en?"Waiting for data":"等待数据";color="var(--text-tertiary)"}
    var parts=[];if(zone&&zone!=="等待数据"&&zone!=="Waiting for data")parts.push(zone);if(TB)parts.push(tbTxt);if(TB&&TB.risk!=="off")parts.push((en?"risk ":"风控")+rkTxt);
    $("tvMain").textContent=parts.length?parts.join(" · "):(en?"Calculating…":"计算中…");
    var a=$("tvAct");a.style.color=color;a.querySelector("span").textContent=act;
    $("tvAhr").textContent=Number.isFinite(ahr)?ahr.toFixed(3):"--";
    $("tvTb").textContent=TB?tbTxt+" · "+Math.round(TB.score):"--";
    $("tvRisk").textContent=rkTxt;
    $("tvDate").textContent=new Date().toISOString().slice(0,10);
    why(en);
  }
  // V27.10：「依据」——各模块最新结论各一行（读各模块存在本机的数据；还没有就先不显示那一行）
  function rd(k){try{return JSON.parse(localStorage.getItem(k))}catch(e){return null}}
  function usd(v){return !(v>0)?"--":v>=1e3?"$"+(v/1e3).toFixed(v>=1e5?0:1)+"K":"$"+Math.round(v)}
  function wan(v,en){var a=Math.abs(v);return en?(a>=1e6?(a/1e6).toFixed(2)+"M":(a/1e3).toFixed(0)+"K"):(a>=1e4?(a/1e4).toFixed(1)+"万":Math.round(a).toLocaleString("en-US"))}
  function bn(v){var a=Math.abs(v);return (v<0?"−":"+")+"$"+(a>=1e9?(a/1e9).toFixed(1)+"B":(a/1e6).toFixed(0)+"M")}
  function why(en){
    var box=$("tvWhy");if(!box)return;var px=typeof S!=="undefined"&&S&&S.price>0?S.price:null,rows=[];
    var row=function(go,tone,zh,eng){rows.push('<button type="button" class="tv-why-row" data-go="'+go+'"><i class="'+tone+'"></i><span>'+(en?eng:zh)+'</span></button>')};
    var T=window.__TBM;if(T&&T.gTop&&T.gTop.length){var k=T.gTop[T.gTop.length-1];if(k!=null)row("tb",k>=2?"cau":"neu","顶部证据满足 "+k+" / 3"+(k>=2?"，已进入顶部区":"，未进入顶部区"),k+" of 3 top signals"+(k>=2?" — in the top zone":""))}
    var cb=rd("btc_cost_bands_v1");if(cb&&cb.L&&cb.L.v&&px){var v=cb.L.v,P=[5,10,15,20,25,30,35,40,45,50,55,60,65,70,75,80,85,90,95],pc=null;
      for(var i=0;i<v.length-1;i++){if(v[i]>0&&v[i]<=px&&px<v[i+1])pc=Math.round(P[i]+5*Math.log(px/v[i])/Math.log(v[i+1]/v[i]))}if(px>=v[v.length-1])pc=95;
      if(pc!=null)row("costBands",pc>=85?"cau":pc<=40?"pos":"neu","现价高于 "+pc+"% 的持币成本，中位成本 "+usd(v[9]),"Price above "+pc+"% of coins' cost; median cost "+usd(v[9]))}
    var ac=rd("btc_age_cost_v1");if(ac&&ac.D&&ac.D.rows){var m1=ac.D.rows[0];if(m1&&m1.avg>0&&m1.profit!=null)row("ageCost","neu","近 1 个月买入的币 "+Math.round(m1.profit*100)+"% 盈利，平均成本 "+usd(m1.avg),"Coins bought in the last month: "+Math.round(m1.profit*100)+"% in profit, avg cost "+usd(m1.avg))}
    var lm=rd("btc_lth_monthly_v1"),lr=rd("btc_lthsth_d_v1"),part=[],pe=[],lt="neu";
    if(lm&&lm.data&&lm.data.v&&lm.data.v.length){var x=lm.data.v[lm.data.v.length-1];part.push("近 30 天"+(x>=0?"增持 ":"减持 ")+wan(x,false)+" BTC");pe.push("30-day "+(x>=0?"added ":"sold ")+wan(x,true)+" BTC");lt=x>=0?"pos":"neg"}
    if(lr&&lr.data&&lr.data.r&&lr.data.r.length){var r=lr.data.r,n=r.length,pk=0;for(var j=Math.max(0,n-500);j<n;j++)pk=Math.max(pk,r[j]);var off=r[n-1]/pk-1;if(off<-.03){part.push("长短期持仓比率距高点 −"+Math.abs(off*100).toFixed(0)+"%");pe.push("LTH/STH ratio "+Math.abs(off*100).toFixed(0)+"% below its high")}}
    if(part.length)row("lthMonthly",lt,"长期持有者"+part.join("，"),"Long-term holders: "+pe.join("; "));
    var st=rd("btc_stablex_v1"),h=rd("btc_stablex_12h_v1");if(st&&st.data&&st.data.u&&st.data.u.length>31){var d=st.data,m=d.u.length-1,t30=(d.u[m]-d.u[m-30])+(d.c[m]-d.c[m-30]);
      var hot=h&&h.u&&h.c&&Date.now()-Math.min(h.u.t||0,h.c.t||0)<3600*1000?[["USDT",h.u],["USDC",h.c]].filter(function(q){return Math.abs(q[1].d)>=q[1].cap*.003}):[];
      row("stable",t30>0?"pos":"neg","稳定币 30 天 "+bn(t30)+(t30>0?"（扩张）":"（收缩）")+(hot.length?"，12 小时 "+hot.map(function(q){return q[0]+(q[1].d>0?" 异动增发":" 异动赎回")}).join("、"):""),"Stablecoins 30-day "+bn(t30)+(hot.length?"; 12h "+hot.map(function(q){return q[0]+(q[1].d>0?" big mint":" big burn")}).join(", "):""))}
    box.innerHTML=rows.join("");box.hidden=!rows.length;
  }
  document.addEventListener("tb:update",paint);document.addEventListener("ahr:update",paint);
  setInterval(paint,15000);setTimeout(paint,1200);
  // 第一次打开时，这几个模块还没被滑到、没有数据：页面空闲后先让它们在后台读取，「依据」随后补齐
  setTimeout(function(){var w=window.__warm||{};["costBands","ageCost","lthMonthly","lthRatio","stable"].forEach(function(k){try{w[k]&&w[k]()}catch(e){}});[6000,12000,20000].forEach(function(t){setTimeout(paint,t)})},6000);
})();

;/*EXT_SEP*/

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
      ["decision","insTrend","r200",{lo:"低于均线",loEn:"Below MA",hi:"远高于均线",hiEn:"Far above MA",fmt:function(v){return v.toFixed(2)+"×"}},function(a,b){return a>=1&&b<1},6,"跌破 200 周均线之后","After price falls below the 200-week MA","价格 ÷ 200 周均线 < 1 · 间隔 ≥6 月","Price ÷ 200-week MA < 1 · ≥6 months apart"]];
    defs.forEach(function(d){
      var w=host(d[0],d[1]);if(!w)return;var R=series(d[2]);if(R.length<36){w.innerHTML="";return}
      I.positionCard(w.querySelector(".ins-pos"),R,d[3]);
      var ev=I.crossEvents(R,d[4],d[5],"month");
      I.signalCard(w.querySelector(".ins-sig"),R,ev,{unit:"month",sampleZh:"Bitview 月度值",sample:"Bitview monthly values",title:d[6],titleEn:d[7],rule:d[8],ruleEn:d[9]});
    });
  }
  async function load(){
    if(loading)return;var c=null;try{c=JSON.parse(localStorage.getItem(KEY)||"null")}catch(e){}
    if(c&&c.rows&&c.rows.length){rows=c.rows;render();if(Date.now()-c.ts<TTL)return}
    loading=true;
    try{
      var url=bitviewBulkUrl(SER,"2012-01-01").replace("index=day1","index=month1"),raw=(window.monthlyRaw?await window.monthlyRaw(SER):null)||await tryFetch(url,15000);
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
  document.addEventListener("toggle",function(e){var d=e.target;if(d&&d.open&&/^(todayCard|decision)$/.test(d.dataset&&d.dataset.module||""))load()},true);
})();

;/*EXT_SEP*/

(function(){
  "use strict";
  // V26.3：信号联动定投回测（我的 → 定投策略对比）。按月线收盘成交，不计手续费。
  //  普通定投：每月 1 份。
  //  信号定投：每月 1 份；底部区当月 2 份；顶部区当月 0.5 份；牛市风控提示当月卖出持仓的 1/3 换成现金；
  //           现金在之后的底部区里分 6 个月投回。
  var start="2018",built=false;
  function $(id){return document.getElementById(id)}
  function E(){return window.BTC_LANG==="en"}
  function fmtUsd(v){return "$"+Math.round(v).toLocaleString("en-US")}
  function fmtBtc(v){return v.toFixed(v<1?4:2)+" BTC"}
  function pct(v){return (v>=0?"+":"")+(v*100).toFixed(0)+"%"}
  function sim(D,s,signal,mode){
    var btc=0,cash=0,inv=0,step=0,risk=new Set(D.risk),last=D.rows[D.rows.length-1].price;mode=mode||"all";
    for(var k=s;k<D.rows.length;k++){var p=D.rows[k].price,z=D.zone[k];
      var units=signal&&mode!=="sell"?(z==="b"?2:(z==="t"||z==="T")?0.5:1):1,amt=100*units;inv+=amt;btc+=amt/p;
      if(signal&&mode!=="units"){
        if(risk.has(k)){var sell=btc/3;btc-=sell;cash+=sell*p;step=0}
        var dp=D.deep&&D.deep[k];   // V27.8：深度底部一次投入全部储备金
        if(z==="b"&&cash>0){if(dp){btc+=cash/p;cash=0;step=0}else{if(!step)step=cash/6;var use=Math.min(cash,step);cash-=use;btc+=use/p}}else if(z!=="b")step=0;
      }}
    var val=btc*last+cash;return{inv:inv,val:val,ret:val/inv-1,btc:btc,cash:cash,per:val/inv*10000};
  }
  function ensure(){
    if(built&&$("sigDca"))return $("sigDca");var d=document.querySelector('details[data-module="dcalab"]');if(!d)return null;
    var w=document.createElement("div");w.className="sigdca";w.id="sigDca";
    w.innerHTML='<h3>信号定投 · AHR999 定投 · 普通定投</h3><p class="sd-sub">用「顶底区间」和「牛市后期风控」调节每月定投，与普通定投比较。</p>'
      +'<div class="range-tabs sd-starts" role="group" aria-label="回测起点"><button class="range-btn" type="button" data-sd="2014">2014 起</button><button class="range-btn active" type="button" data-sd="2018" aria-pressed="true">2018 起</button><button class="range-btn" type="button" data-sd="2020">2020 起</button><button class="range-btn" type="button" data-sd="2022">2022 起</button></div>'
      +'<div class="sd-table" id="sdTable"></div><p class="sd-verdict" id="sdVerdict"></p><p class="sd-sub" id="sdWhy"></p>'
      +'<ul class="sd-rules"><li>普通定投：每月 1 份（100 美元）。</li><li>信号定投：底部区 2 份，顶部区 0.5 份；风控提示当月卖出 1/3，现金在之后的底部区分 6 个月投回。</li><li>按月线收盘成交，不计手续费；规则是看过历史后设定的，结果偏乐观，仅供参考。</li></ul>';
    var sum=d.querySelector("summary");if(sum&&sum.nextSibling)d.insertBefore(w,sum.nextSibling);else d.appendChild(w);
    w.addEventListener("click",function(e){var b=e.target.closest("[data-sd]");if(!b)return;start=b.dataset.sd;w.querySelectorAll("[data-sd]").forEach(function(x){var on=x===b;x.classList.toggle("active",on);x.setAttribute("aria-pressed",on?"true":"false")});render()});
    built=true;return w;
  }
  // V26.9.3：AHR999 定投（经典 AHR999，与「定投策略对比」原规则相同：<0.45 → 4 份，0.45–1.2 → 1.5 份，1.2–5 → 0.4 份，>5 → 0 份）
  function ahrMap(){try{if(typeof dcaLabMonths==="undefined"||!dcaLabMonths.length)return null;var m={};dcaLabMonths.forEach(function(r){if(r&&r.m&&isFinite(r.ahrClassic))m[r.m]=r.ahrClassic});return m}catch(e){return null}}
  function mult(){try{var x=window.S&&S.dcaLab&&S.dcaLab.mult;if(Array.isArray(x)&&x.length===4)return x}catch(e){}try{var y=S.dcaLab.mult;if(Array.isArray(y)&&y.length===4)return y}catch(e){}return [4,1.5,.4,0]}
  function simAhr(D,s,A){
    var btc=0,inv=0,last=D.rows[D.rows.length-1].price,M=mult(),miss=0;
    for(var k=s;k<D.rows.length;k++){var p=D.rows[k].price,a=A[D.rows[k].m];
      if(!isFinite(a)){miss++;a=1}
      var units=a<.45?M[0]:a<1.2?M[1]:a<5?M[2]:M[3],amt=100*units;inv+=amt;btc+=amt/p}
    var val=btc*last;return{inv:inv,val:val,ret:inv>0?val/inv-1:0,btc:btc,cash:0,per:inv>0?val/inv*10000:0,miss:miss};
  }
  function render(){
    var D=window.__TBM;if(!D||!D.rows||D.rows.length<24)return;if(!ensure())return;var en=E();
    var s=D.rows.findIndex(function(r){return r.m>=start+"-01"});if(s<0)return;
    if(en){var h=$("sigDca").querySelector("h3");if(h)h.textContent="Signal vs AHR999 vs regular DCA";$("sigDca").querySelectorAll("[data-sd]").forEach(function(x){x.textContent=x.dataset.sd})}
    var A=ahrMap();
    if(!A){try{if(typeof initDcaLab==="function")initDcaLab();if(typeof refreshDcaLab==="function")refreshDcaLab(false)}catch(e){}}
    var a=sim(D,s,false),b=sim(D,s,true),c=A?simAhr(D,s,A):null;
    a.coin=a.btc/a.inv*10000;b.coin=b.btc/b.inv*10000;if(c)c.coin=c.btc/c.inv*10000;
    var cols=[a,c,b],best=function(get){var v=cols.map(function(x){return x?get(x):-Infinity}),m=Math.max.apply(null,v);return v.map(function(x){return x>=m*0.999&&isFinite(x)})};
    var row=function(k,get,f,hl){var bb=hl?best(get):[0,0,0];return '<div class="sd-tr sd-3"><span>'+k+'</span>'+cols.map(function(x,i){return '<span>'+(bb[i]?'<b>':'')+(x?f(get(x)):'--')+(bb[i]?'</b>':'')+'</span>'}).join("")+'</div>'};
    var btc3=function(v){return v.toFixed(3)};
    $("sdTable").innerHTML='<div class="sd-tr sd-3 sd-th"><span></span><span>'+(en?"Regular":"普通定投")+'</span><span>AHR999</span><span>'+(en?"Signal":"信号定投")+'</span></div>'
      +row(en?"Invested":"投入",function(x){return x.inv},fmtUsd,false)
      +row(en?"Value now":"现在价值",function(x){return x.val},fmtUsd,true)
      +row(en?"Return":"收益率",function(x){return x.ret},pct,true)
      +row(en?"$10K → value":"每万美元变成",function(x){return x.per},fmtUsd,true)
      +row(en?"BTC held":"持有 BTC",function(x){return x.btc},btc3,false)
      +row(en?"$10K → BTC":"每万美元买到 BTC",function(x){return x.coin},btc3,true)
      +row(en?"Cash":"现金",function(x){return x.cash},fmtUsd,false);
    var v=$("sdVerdict");
    if(c){
      var dr=b.ret-c.ret,dc=b.coin/c.coin-1;
      v.innerHTML=(en?("From "+start+", signal vs AHR999 DCA: return "+pct(b.ret)+" vs "+pct(c.ret)+"; BTC per $10K "+btc3(b.coin)+" vs "+btc3(c.coin)+" ("+(dc>=0?"+":"−")+Math.abs(dc*100).toFixed(1)+"%)."):
        ("从 "+start+" 年起，信号定投对比 AHR999 定投：<br>收益率 "+pct(b.ret)+" 对 "+pct(c.ret)+"（"+(dr>=0?"高 ":"低 ")+Math.abs(dr*100).toFixed(0)+" 个百分点）；<br>每 1 万美元买到 "+btc3(b.coin)+" 对 "+btc3(c.coin)+" BTC（币本位"+(dc>=0?"多 ":"少 ")+Math.abs(dc*100).toFixed(1)+"%）。"));
      v.style.color=(dr>=0&&dc>=0)?"var(--market-positive)":(dr<0&&dc<0)?"var(--market-negative)":"var(--text-primary)";
    }else{v.textContent=en?"Loading AHR999 history…":"正在读取 AHR999 历史…";v.style.color="var(--text-tertiary)"}
  }
  // AHR999 月度历史读到后再画一次
  var tries=0,poll=setInterval(function(){tries++;if(ahrMap()){clearInterval(poll);render()}else if(tries>90)clearInterval(poll)},2000);
  document.addEventListener("tbm:update",render);
  document.addEventListener("toggle",function(e){if(e.target&&e.target.open&&e.target.dataset&&e.target.dataset.module==="dcalab")render()},true);
  var orig=window.setTab;if(typeof orig==="function")window.setTab=function(t){var r=orig.apply(this,arguments);if(t==="mine")setTimeout(render,50);return r};
})();

;/*EXT_SEP*/

(function(){
  "use strict";
  // V26.3.1：状态栏磨砂底。只在内容滚到状态栏下面时出现；颜色取当前页面背景。
  var el=document.createElement("div");el.className="status-scrim";el.setAttribute("aria-hidden","true");document.body.appendChild(el);
  function tint(){var c=getComputedStyle(document.body).backgroundColor||"rgb(242,242,247)",m=c.match(/[\d.]+/g);if(m)el.style.setProperty("--scrim-bg","rgba("+m[0]+","+m[1]+","+m[2]+",.8)")}
  function onScroll(){el.classList.toggle("on",(window.scrollY||document.documentElement.scrollTop)>4)}
  tint();onScroll();window.addEventListener("scroll",onScroll,{passive:true});window.addEventListener("themechange",tint);
  new MutationObserver(tint).observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]});
})();

;/*EXT_SEP*/

(function(){
  "use strict";
  // V26.3 Beta 4：自上次打开以来。离开页面时记录一份快照；下次打开（间隔 ≥ 1 小时）时，在「今日结论」顶部列出变化。
  var KEY="btc_last_visit_v2",prev=null,shown=false;
  try{prev=JSON.parse(localStorage.getItem(KEY)||"null")}catch(e){}
  function E(){return window.BTC_LANG==="en"}
  function cur(){
    var bp=document.getElementById("bp"),manual=document.getElementById("homeManualPrice");
    if(manual&&!manual.hidden)return null;
    var ab=document.getElementById("ahrBig"),price=parseFloat(String(bp&&bp.value||"").replace(/[^\d.]/g,"")),ahr=parseFloat(ab&&ab.dataset?ab.dataset.ahrRefit:NaN),TB=window.__TB;
    var zone=!Number.isFinite(ahr)?"":ahr<0.45?"deep":ahr<1.2?"value":ahr<5?"warm":"over";
    if(!(price>0)||!Number.isFinite(ahr))return null;
    return{ts:Date.now(),price:price,ahr:ahr,zone:zone,tb:TB?TB.zone:null,score:TB?Math.round(TB.score):null,risk:TB?TB.risk:null};
  }
  function save(){var c=cur();if(c){try{localStorage.setItem(KEY,JSON.stringify(c))}catch(e){}}}
  function ago(ms){var h=ms/36e5,en=E();if(h<24)return en?Math.round(h)+" h":Math.round(h)+" 小时";var d=Math.round(h/24);return en?d+(d>1?" days":" day"):d+" 天"}
  var ZN={deep:["深度低估","Deep value"],value:["长期低估","Long-term value"],warm:["估值偏热","Running warm"],over:["高估风险","Overvalued risk"]};
  function zn(k,L){return ZN[k]?ZN[k][L]:""}
  var TBN={bottom:["底部区","Bottom zone"],top:["顶部区","Top zone"],topStrong:["顶部区 · 强","Top · strong"],neutral:["中性区间","Neutral"]};
  var RKN={off:["未启动","inactive"],watch:["监控中","watching"],fired:["已提示","prompted"]};
  function render(){
    if(shown||!prev)return;var c=cur();if(!c||!window.__TB)return;
    var gap=c.ts-prev.ts;if(gap<36e5)return;   // 不到 1 小时不提示
    var card=document.getElementById("todayVerdict");if(!card)return;shown=true;
    var en=E(),L=en?1:0,items=[];
    var dp=c.price/prev.price-1;items.push((en?"Price ":"价格 ")+'<b class="'+(dp>=0?"up":"down")+'">'+(dp>=0?"+":"")+(dp*100).toFixed(1)+"%</b>");
    if(Math.abs(c.ahr-prev.ahr)>=0.01||c.zone!==prev.zone)items.push("AHR999 "+prev.ahr.toFixed(2)+" → <b>"+c.ahr.toFixed(2)+"</b>"+(c.zone!==prev.zone&&ZN[prev.zone]?(en?" (":"（")+zn(prev.zone,L)+" → <b>"+zn(c.zone,L)+"</b>"+(en?")":"）"):""));
    if(prev.tb&&c.tb!==prev.tb)items.push((en?"Zones ":"顶底区间 ")+TBN[prev.tb][L]+" → <b>"+TBN[c.tb][L]+"</b>");
    else if(prev.score!=null&&c.score!=null&&Math.abs(c.score-prev.score)>=5)items.push((en?"Composite ":"综合分 ")+prev.score+" → <b>"+c.score+"</b>");
    if(prev.risk&&c.risk!==prev.risk)items.push((en?"Risk control ":"牛市风控 ")+RKN[prev.risk][L]+" → <b>"+RKN[c.risk][L]+"</b>");
    var big=items.length>1||Math.abs(dp)>=0.05;
    var el=document.createElement("div");el.className="tv-since";el.setAttribute("role","status");
    el.innerHTML='<span>'+(en?"Since you last opened ("+ago(gap)+" ago): ":"距上次打开 "+ago(gap)+"：")+items.join(" · ")+(items.length===1&&!big?(en?" · no zone changes":" · 各项区间没有变化"):"")+'</span><button type="button" aria-label="'+(en?"Close":"关闭")+'">×</button>';
    el.querySelector("button").addEventListener("click",function(){el.remove()});
    var head=card.querySelector(".tv-head");card.insertBefore(el,head?head.nextSibling:card.firstChild);
  }
  document.addEventListener("tb:update",function(){setTimeout(render,300)});
  setTimeout(render,4000);
  document.addEventListener("visibilitychange",function(){if(document.visibilityState==="hidden")save()});
  window.addEventListener("pagehide",save);
  setTimeout(save,90000);  // 停留一分半后也记录，防止异常退出
})();

;/*EXT_SEP*/

(function(){
  "use strict";
  // V26.4：指标明细（替代七维估值评分）。与「顶底区间」同一份 Bitview 月度数据、同一种 4 年分位，按 5 类排列。
  var FAMS=[["value","估值利润","Valuation",[["mvrv","MVRV","MVRV"],["mnupl","NUPL","NUPL"],["nupl","LTH NUPL","LTH NUPL"],["rrl","Reserve Risk","Reserve Risk"],["sip","获利筹码","Supply in profit"],["psil","LTH_PSIL","LTH_PSIL"]]],
    ["sth","短期情绪","Short-term",[["snupl","STH NUPL","STH NUPL"]]],["miner","矿工","Miners",[["puell","Puell Multiple","Puell Multiple"]]],
    ["old","老币行为","Old coins",[["rev","老币重新流通","Old coins moved"]]],["trend","趋势","Trend",[["pi","Pi Cycle","Pi Cycle"]]]];
  function E(){return window.BTC_LANG==="en"}
  function fmt(k,v){if(v==null)return"--";if(k==="rrl")return Math.pow(10,v).toExponential(2);if(k==="sip"||k==="psil")return v.toFixed(1)+"%";if(k==="rev")return v>=1e6?(v/1e6).toFixed(2)+"M":(v/1e3).toFixed(0)+"K";if(k==="pi")return v.toFixed(2)+"×";return v.toFixed(2)}
  function col(p){return p==null?"var(--text-tertiary)":p<=25?"var(--market-positive)":p>=75?"var(--market-negative)":p>=60?"var(--market-caution)":"var(--text-secondary)"}
  function render(){
    var D=window.__TBD,box=document.getElementById("indicatorDetail");if(!D||!box)return;var en=E();
    box.innerHTML=FAMS.map(function(f){var fs=D.fam[f[0]];
      return '<div class="ind-fam"><div class="ind-fam-h"><b>'+(en?f[2]:f[1])+'</b><em style="color:'+col(fs)+'">'+(fs==null?"--":Math.round(fs))+'</em></div>'+f[3].map(function(r){var x=D.ind[r[0]]||{},p=x.p;
        var dv=x.v!=null&&x.prev!=null?x.v-x.prev:null,ds="";
        if(dv!=null){if(r[0]==="rrl"){var pc=(Math.pow(10,dv)-1)*100;ds=Math.abs(pc)<0.05?"0":(pc>=0?"+":"−")+Math.abs(pc).toFixed(1)+"%"}
          else{var t=fmt(r[0],Math.abs(dv)).replace(/^[−-]/,"");ds=/^0(\.0+)?(%|K|M|×)?$/.test(t)?"0":(dv>=0?"+":"−")+t}}
        return '<div class="ind-row ind-row2"><span>'+(en?r[2]:r[1])+'</span><i><u style="width:'+(p==null?0:Math.round(p))+'%;background:'+col(r[0]==="psil"&&p!=null?100-p:p)+'"></u></i><em class="ind-p">'+(p==null?"--":Math.round(p)+"%")+'</em><b>'+fmt(r[0],x.v)+'</b><small class="ind-d">'+(ds||"--")+'</small></div>'}).join("")+'</div>'}).join("")
      +'<div class="ind-cols"><span></span><span>'+(en?"4-yr pct":"4 年分位")+'</span><span>'+(en?"Now":"当前")+'</span><span>'+(en?"1M chg":"较上月")+'</span></div>';
    var s=document.getElementById("imSummary");if(s)s.textContent=(en?"Valuation ":"估值利润 ")+Math.round(D.fam.value)+(en?" · Short-term ":" · 短期情绪 ")+Math.round(D.fam.sth);
  }
  document.addEventListener("tb:update",function(){render();try{if(typeof renderCostStructureState==="function")renderCostStructureState()}catch(e){}try{if(typeof calc==="function")calc(false,false)}catch(e){}try{if(typeof trig==="function")trig(false,false)}catch(e){}});
  render();
  // 定投执行：隐藏只适用于旧「回撤价位」规则的下一档距离
  var nd=document.getElementById("costNextDistance");if(nd&&nd.parentElement)nd.parentElement.style.display="none";
})();

;/*EXT_SEP*/

(function(){
  "use strict";
  // V26.4.6：链上页分组卡片——顶部小格只陈述数据，按含义上色；模块在卡片内展开
  function $(id){return document.getElementById(id)}
  function E(){return window.BTC_LANG==="en"}
  function raw(id){var e=$(id);var t=e?String(e.textContent||"").trim():"";return /\d/.test(t)?t:""}
  var C={good:"var(--market-positive)",warn:"var(--market-caution)",bad:"var(--market-negative)"};
  function tile(card,k,val,tone){var e=document.querySelector('#'+card+' [data-k="'+k+'"] b');if(!e)return;e.textContent=val||"--";e.style.color=tone?C[tone]:""}
  function paint(){
    var en=E(),D=window.__TBD;
    var sth=raw("costBasisSth"),gap=raw("costBasisSthGap").replace(/^(距现价|vs spot)\s*/,""),loss=raw("lossHeroValue").replace(/\s*BTC$/,"");
    var g=parseFloat(gap.replace("−","-"));
    tile("cg_cost","sth",sth);tile("cg_cost","gap",gap,isFinite(g)?(g<0?"good":"bad"):null);tile("cg_cost","loss",loss);
    if(D&&D.ind){var ps=D.ind.psil||{},rv=D.ind.rev||{},pu=D.ind.puell||{};
      tile("cg_holders","psil",ps.v==null?"":ps.v.toFixed(1)+"%",ps.p==null?null:ps.p>=75?"good":ps.p<=25?"warn":null);
      tile("cg_holders","rev",rv.p==null?"":Math.round(rv.p)+(en?"% pct":"% 分位"),rv.p==null?null:rv.p>=75?"warn":null);
      var p=pu.p;tile("cg_miners","puell",pu.v==null?"":pu.v.toFixed(2));tile("cg_miners","pp",p==null?"":Math.round(p)+"%");
      tile("cg_miners","state",p==null?"":p<=25?(en?"Stressed":"承压"):p>=75?(en?"High":"偏高"):(en?"Normal":"常规"),p==null?null:p<=25?"good":p>=75?"bad":null)}
    var ch=raw("lthChipsNow");tile("cg_holders","chips",ch);
  }
  // 分组结论需要成本与深度亏损数据：打开链上页时就开始读取（不必等展开模块）
  // V27.1：筹码集中度也在打开链上页时就开始计算（原来要点开「长期持有者」才算，摘要一直是灰色占位条）；
  // 直接打开在链上页（上次停留在链上）时同样预热。
  function warm(){try{initCostBasisPrice()}catch(e){}try{initDeepLoss()}catch(e){}try{if(typeof window.initLthChips==="function")window.initLthChips()}catch(e){}setTimeout(paint,800)}
  var orig=window.setTab;if(typeof orig==="function")window.setTab=function(t){var r=orig.apply(this,arguments);if(t==="chain")warm();return r};
  if(document.documentElement.dataset.tab==="chain")setTimeout(warm,300);
  document.addEventListener("tb:update",paint);setInterval(paint,10000);setTimeout(paint,1500);
  // V26.6.2：分组摘要的数据来源一变就立即刷新（原来最多要等 10 秒，筹码集中度等会先显示骨架条）
  (function(){var q=0,ids=["costBasisSth", "costBasisSthGap", "lossHeroValue", "lthChipsNow"];function kick(){if(!q)q=setTimeout(function(){q=0;paint()},120)}var mo=new MutationObserver(kick);ids.forEach(function(id){var e=document.getElementById(id);if(e)mo.observe(e,{childList:true,characterData:true,subtree:true})})})();
})();

;/*EXT_SEP*/

(function(){
  "use strict";
  // V26.4.15：量子准备度。提案状态：data/quantum.json（GitHub 每天读取 BIP 仓库）优先，否则用下方人工核对的里程碑；
  // 链上暴露：Bitview 月度序列（P2PK、P2TR 持币量），缓存 12 小时。
  var CHECKED="2026-10-17";
  var STAGES=["提案","草案","实现","Core 合并","激活信号","主网激活"],STAGES_EN=["Proposal","Draft","Implemented","Core merge","Signaling","Mainnet"];
  var ITEMS=[
    {bip:"360",name:"BIP-360 · P2MR 抗量子输出",nameEn:"BIP-360 · P2MR quantum-resistant output",stage:2,ext:true,status:"草案",statusEn:"Draft",
      note:"已合入 BIP 仓库（2026-02）；第三方测试网已实现，Bitcoin Core 尚无实现",noteEn:"Merged into the BIP repo (2026-02); implemented on a third-party testnet, no Bitcoin Core implementation yet"},
    {bip:"361",name:"BIP-361 · 旧签名淘汰与迁移",nameEn:"BIP-361 · Legacy signature sunset",stage:2,status:"草案 · 争议大",statusEn:"Draft · contested",
      note:"已合入 BIP 仓库（2026-04）；依赖 BIP-360 先激活",noteEn:"Merged into the BIP repo (2026-04); depends on BIP-360 activating first"},
    {name:"后量子签名方案",nameEn:"Post-quantum signatures",stage:1,status:"讨论中",statusEn:"Discussion",
      note:"候选 ML-DSA、SLH-DSA；尚无正式 BIP",noteEn:"Candidates ML-DSA and SLH-DSA; no formal BIP yet"}];
  var KEY="btc_bitview_quantum_v1",TTL=12*3600*1000,data=null,status=null;
  function $(id){return document.getElementById(id)}
  function E(){return window.BTC_LANG==="en"}
  function fmtBtc(v){return v>=1e6?(v/1e6).toFixed(2)+"M":v>=1e3?(v/1e3).toFixed(0)+"K":v.toFixed(0)}
  function tile(k,v,sub){var t=document.querySelector('#cg_quantum [data-k="'+k+'"] b');if(t)t.textContent=v}
  function paint(){
    var en=E(),list=$("qrList");if(!list)return;
    list.innerHTML=ITEMS.map(function(it){
      var st=it.status,stEn=it.statusEn;
      if(status&&it.bip&&status.bips&&status.bips[it.bip]&&status.bips[it.bip].status){var raw=status.bips[it.bip].status;if(!/draft/i.test(raw)){st=raw;stEn=raw}}
      var bar=STAGES.map(function(_,i){return '<i class="'+(i<it.stage?"on":(it.ext&&i===it.stage?"ext":""))+'"></i>'}).join("");
      return '<div class="qr-row"><div class="qr-row-h"><b>'+(en?it.nameEn:it.name)+'</b><em>'+(en?stEn:st)+'</em></div><p>'+(en?it.noteEn:it.note)+'</p><div class="qr-bar">'+bar+'</div>'+(it.bip==="360"?'<div class="qr-lb">'+(en?STAGES_EN:STAGES).map(function(x){return "<span>"+x+"</span>"}).join("")+'</div>':"")+'</div>'}).join("");
    var day=status&&status.generated?String(status.generated).slice(0,10):CHECKED;
    // V27.6：核对日期收进折叠里；只有超过 14 天没核对（每周任务没跑）才在标题旁提醒
    var ageD=Math.floor((Date.now()-Date.parse(day+"T00:00:00Z"))/864e5),qc=$("qrChecked");
    qc.hidden=!(ageD>14);qc.className=ageD>14?"qr-stale":"";qc.textContent=(en?"Status ":"状态核对 · ")+(en?ageD+" days old":ageD+" 天前");
    var ft=$("qrFoot");if(ft)ft.textContent=(en?"Bars: solid = done; dashed = third-party testnet only. Proposal status is read from the BIP repository every week; last checked ":"进度条：实色 = 已完成；虚线 = 仅第三方测试网。提案状态每周自动读取 BIP 仓库，最近核对 ")+day+(en?".":"。");
    var fs=$("qrFoldS"),ft2=$("qrFoldT");if(ft2)ft2.textContent=en?"Upgrade progress":"升级进度";if(fs)fs.textContent=en?"No quantum upgrade active on mainnet":"主网未激活任何量子升级";
    if(data){var r=data[data.length-1],tot=r.pk65+r.pk33+r.tr;
      tile("p2pk",r.domPk.toFixed(2)+"%");tile("p2tr",r.domTr.toFixed(2)+"%");tile("sum",(r.domPk+r.domTr).toFixed(1)+"%");
      $("qrKn").textContent=(en?"About "+fmtBtc(tot)+" BTC · ":"约 "+fmtBtc(tot)+" BTC · ")+r.m;
      // P2PK 大额移动提醒：最近一个月 P2PK 持币减少超过 5,000 BTC
      var al=$("qrAlert");if(data.length>1&&al){var p=data[data.length-2],drop=(p.pk65+p.pk33)-(r.pk65+r.pk33);
        if(drop>5000){al.hidden=false;al.textContent=en?"Large P2PK movement: about "+fmtBtc(drop)+" BTC left early public-key addresses in the past month.":"P2PK 地址有大额移动：近一个月约 "+fmtBtc(drop)+" BTC 从早期公钥地址转出。"}else al.hidden=true}}
  }
  async function load(){
    try{var c=JSON.parse(localStorage.getItem(KEY)||"null");if(c&&c.rows){data=c.rows;paint();if(Date.now()-c.ts<TTL)return}}catch(e){}
    try{
      var ser=["date","p2pk65_supply","p2pk33_supply","p2tr_supply","p2pk65_supply_dominance","p2pk33_supply_dominance","p2tr_supply_dominance"];
      var raw=await tryFetch(bitviewBulkUrl(ser,"2025-01-01").replace("index=day1","index=month1"),15000),cols=ser.map(function(n,i){return pickSeries(raw,n,i)});
      if(!cols.every(Array.isArray))throw 0;var rows=[];
      for(var i=0;i<cols[0].length;i++){var v=cols.slice(1).map(function(c){return +c[i]});if(v.every(function(x){return isFinite(x)}))rows.push({m:String(cols[0][i]).slice(0,7),pk65:v[0],pk33:v[1],tr:v[2],domPk:v[3]+v[4],domTr:v[5]})}
      if(!rows.length)throw 0;data=rows;try{localStorage.setItem(KEY,JSON.stringify({ts:Date.now(),rows:rows}))}catch(e){}paint();
    }catch(e){}
  }
  async function loadStatus(){try{var r=await fetch("data/quantum.json?d="+new Date().toISOString().slice(0,10),{cache:"no-store"});if(r.ok){var j=await r.json();if(j&&j.v===1){status=j;paint()}}}catch(e){}}
  var started=false;function start(){if(started)return;started=true;paint();load();loadStatus()}
  var orig=window.setTab;if(typeof orig==="function")window.setTab=function(t){var r=orig.apply(this,arguments);if(t==="chain")start();return r};
  window.addEventListener("themechange",function(){if(started)paint()});
  setTimeout(function(){if(document.documentElement.dataset.tab==="chain")start()},1500);
})();

;/*EXT_SEP*/

(function(){
  "use strict";
  // V26.5 Beta 2：数字占位（--、--%、$-- 等）统一显示为骨架条；文字变化后自动恢复
  var RX=/^(?:[$¥]?\s?--(?:\.--)?\s?(?:%|×|x|BTC|sat\/vB|EH\/s|T)?|--\/--|等待数据|计算中…|Waiting for data|Calculating…)$/;
  var SEL="b,strong,.num,.v,.cc-k b,.tbg2-center b,.fund-value,.hold-val,.m21-sats";
  var raf=0;
  function scan(){raf=0;document.querySelectorAll(SEL).forEach(function(e){if(e.children.length>1)return;var t=(e.textContent||"").trim();var on=RX.test(t);if(on!==e.classList.contains("sk-wait"))e.classList.toggle("sk-wait",on)})}
  function queue(){if(!raf)raf=requestAnimationFrame(scan)}
  try{new MutationObserver(queue).observe(document.body,{subtree:true,childList:true,characterData:true})}catch(e){}
  document.addEventListener("DOMContentLoaded",queue);setTimeout(queue,800);
})();

;/*EXT_SEP*/

(function(){
  "use strict";
  // V26.5.1：同一张折叠卡里，数据日与前一个相同就不再显示
  var raf=0;
  function dedupe(){raf=0;document.querySelectorAll(".module-fold").forEach(function(f){var seen={};f.querySelectorAll(".head-status .fresh-badge").forEach(function(b){var t=(b.textContent||"").trim(),ok=b.classList.contains("good"),hide=ok&&!!seen[t];b.classList.toggle("dup-date",hide);if(ok&&!hide)seen[t]=1})})}
  function queue(){if(!raf)raf=requestAnimationFrame(dedupe)}
  function init(){var mo=new MutationObserver(queue);document.querySelectorAll(".head-status .fresh-badge").forEach(function(b){mo.observe(b,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:["class"]})});dedupe()}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();

;/*EXT_SEP*/

(function(){
  "use strict";
  // V26.5.3：折叠卡第一个模块的数据日，显示在折叠栏副标题后面
  function init(){
    document.querySelectorAll(".module-fold").forEach(function(f){
      var sec=f.querySelector(":scope>.sec");if(!sec)return;
      var head=sec.querySelector(":scope>:is(.module-head,.capitalized-head,.ct-head):first-child");if(!head)return;
      var list=[].slice.call(head.querySelectorAll(".fresh-badge")).filter(function(x){return x.id!=="freshRadar"&&!x.closest(".price-status")});
      var src=list[0],sum=f.querySelector(":scope>summary>span");if(!src||!sum)return;
      var hs=src.closest(".head-status");if(hs)hs.classList.add("in-summary");else src.classList.add("in-summary-badge");
      head.classList.add("date-in-summary");
      var d=document.createElement("span");d.setAttribute("aria-hidden","true");sum.appendChild(d);
      function sync(){d.textContent=src.textContent;d.className=src.className.replace(/\b(dup-date|in-summary-badge)\b/g,"").trim()+" fold-date"}
      sync();new MutationObserver(sync).observe(src,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:["class"]});
    });
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();

;/*EXT_SEP*/

(function(){
  "use strict";
  // V26.6：测试快照。打开 网址#test-snapshot，点按顶部按钮，导出行情与链上缓存（不含持仓、账本、预算、API Key），
  // 用于截图回归测试，让测试截图显示真实数字。平时不显示任何东西。
  if(location.hash!=="#test-snapshot")return;
  var DENY=/^(btc_exec_|btc_dca_ledger|btc_personal_|btc_backup_receipt|btc_v25_before|btc_bg_api_key|btc_last_visit|btc_health_write|btc_update_meta|btc_active_tab|btc_lang|btc_theme|btc_focus_view|btc_dist_view)/,ALLOW=/^(btc_|bg|bv|bn_|stable)/;
  function build(){var o={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&ALLOW.test(k)&&!DENY.test(k))o[k]=localStorage.getItem(k)}return {app:"Sats Garden test snapshot",build:typeof BUILD_ID==="string"?BUILD_ID:"",capturedAt:new Date().toISOString(),storage:o}}
  function show(){
    var b=document.createElement("button");b.type="button";b.textContent="导出测试快照";
    b.style.cssText="position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 12px);transform:translateX(-50%);z-index:9999;padding:10px 16px;border:0;border-radius:999px;background:#111;color:#fff;font:600 14px -apple-system,system-ui,sans-serif";
    b.onclick=function(){var blob=new Blob([JSON.stringify(build())],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="sats-garden-snapshot-"+new Date().toISOString().slice(0,10)+".json";document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(a.href)},3000);b.textContent="已导出"};
    document.body.appendChild(b);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",show);else show();
})();

;/*EXT_SEP*/

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
    var mStale=c&&c.data&&c.data.day&&(Date.now()-Date.parse(c.data.day+"T00:00:00Z"))>2*864e5;
    if(!force&&c&&!mStale&&Date.now()-c.ts<TTL){render();return}
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

;/*EXT_SEP*/

(function(){
  "use strict";
  // V26.8：长期持有者币龄销毁（Bitview lth_coindays_destroyed_sum_24h，按 UTC 日）+ BTC 价格
  var KEY="btc_lth_cdd_v1",TTL=6*3600*1000,API="https://bitview.space/api/series/bulk",SPAN=1100;
  var data=null,loading=false,failed=false,range=180,hover=-1;
  function $(id){return document.getElementById(id)}
  function en(){return window.BTC_LANG==="en"}
  function css(n,f){var v=getComputedStyle(document.documentElement).getPropertyValue(n).trim();return v||f}
  function zh(v){if(!(v>=0))return "--";if(v>=1e8)return (v/1e8).toFixed(2)+"亿";if(v>=1e4)return Math.round(v/1e4).toLocaleString("en-US")+"万";return Math.round(v).toLocaleString("en-US")}
  function cmp(v){if(!(v>=0))return "--";if(v>=1e9)return (v/1e9).toFixed(2)+"B";if(v>=1e6)return (v/1e6).toFixed(1)+"M";if(v>=1e3)return (v/1e3).toFixed(0)+"K";return Math.round(v)+""}
  function num(v){return en()?cmp(v):zh(v)}
  function usd(v){return v>=1e3?"$"+(v/1e3).toFixed(v>=1e5?0:1)+"K":"$"+Math.round(v)}
  function addDay(d,n){var t=new Date(d+"T00:00:00Z");t.setUTCDate(t.getUTCDate()+n);return t.toISOString().slice(0,10)}
  function valid(d){return d&&/^\d{4}-\d{2}-\d{2}$/.test(d.day0||"")&&Array.isArray(d.cdd)&&Array.isArray(d.px)&&d.cdd.length===d.px.length&&d.cdd.length>120}
  function readCache(){try{var c=JSON.parse(localStorage.getItem(KEY));if(c&&valid(c.data))return c}catch(e){}return null}
  function q95(a){var b=a.filter(function(v){return v>=0}).sort(function(x,y){return x-y});if(!b.length)return NaN;return b[Math.min(b.length-1,Math.floor(b.length*.95))]}
  function stats(){var n=data.cdd.length,last=n-1,yr=data.cdd.slice(Math.max(0,n-365));return {line:q95(yr),last:data.cdd[last],day:addDay(data.day0,last)}}
  function badge(){
    var b=$("freshLthCdd");if(!b)return;var t,c;
    if(data){var day=stats().day,age=(Date.now()-Date.parse(day+"T00:00:00Z"))/864e5;if(age>3){t=(en()?"Stale · ":"滞后 · ")+day.slice(5);c="warn"}else{t=(en()?"Data date · ":"数据日 · ")+day.slice(5);c="good"}}
    else if(loading){t=en()?"Syncing":"同步中";c="warn"}else if(failed){t=en()?"Unavailable":"暂不可用";c="bad"}else{t=en()?"Waiting for data":"等待数据";c="warn"}
    b.textContent=t;b.className="fresh-badge "+c;
  }
  function labels(){
    var E=en(),set=function(id,z,e){var x=$(id);if(x)x.textContent=E?e:z};
    set("cddLastLabel","最新一天","Latest day");set("cddLineLabel","异动线 · 近 1 年 95% 分位","Spike line · 1y 95th pct");
    set("cddLegCdd","每日币龄销毁","Daily coin-days destroyed");set("cddLegPx","BTC 价格","BTC price");set("cddLegLine","异动线","Spike line");set("cddLegHit","超过异动线","Above the line");
    document.querySelectorAll("[data-cdd-range]").forEach(function(b){b.setAttribute("aria-pressed",+b.dataset.cddRange===range?"true":"false");b.classList.toggle("active",+b.dataset.cddRange===range);if(E)b.textContent={90:"3M",180:"6M",365:"1Y",1095:"3Y"}[b.dataset.cddRange]});
  }
  function render(){
    badge();labels();
    var empty=$("cddEmpty"),cv=$("cddCanvas");if(!cv)return;
    if(!data){if(empty){empty.hidden=false;empty.textContent=loading?(en()?"Syncing…":"同步中…"):failed?(en()?"Unavailable":"暂不可用"):(en()?"Waiting for data":"等待数据")}var c0=cv.getContext("2d");c0.clearRect(0,0,cv.width,cv.height);return}
    if(empty)empty.hidden=true;
    var st=stats(),L=$("cddLast"),T=$("cddLine");if(L){L.textContent=num(st.last);L.classList.toggle("hot",st.last>=st.line)}if(T)T.textContent=num(st.line);
    draw(st);
  }
  function draw(st){
    var cv=$("cddCanvas"),box=cv.parentElement,W=box.clientWidth,H=box.clientHeight;if(!W||!H)return;
    var dpr=Math.min(3,window.devicePixelRatio||1);cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);
    var c=cv.getContext("2d");c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,W,H);
    var n=data.cdd.length,s0=Math.max(0,n-range),cdd=data.cdd.slice(s0),px=data.px.slice(s0),m=cdd.length;
    var padL=44,padR=48,padT=10,padB=22,pw=W-padL-padR,ph=H-padT-padB;
    var maxC=0;cdd.forEach(function(v){if(v>maxC)maxC=v});var srt=cdd.slice().sort(function(a,b){return a-b}),p98=srt[Math.floor(srt.length*.98)]||0;var cap=Math.max(st.line*2.4,p98*1.15);var clipped=maxC>cap*1.25;if(clipped)maxC=cap;maxC=Math.max(maxC,st.line)*1.08||1;
    var pmin=Infinity,pmax=0;px.forEach(function(v){if(v>0){pmin=Math.min(pmin,v);pmax=Math.max(pmax,v)}});var lmin=Math.log(pmin*.97),lmax=Math.log(pmax*1.03);
    var X=function(i){return padL+(m>1?i/(m-1):0)*pw},YC=function(v){return padT+ph-(Math.min(v,maxC)/maxC)*ph},YP=function(v){return padT+ph-(Math.log(v)-lmin)/(lmax-lmin)*ph};
    var FONT=css("--font-sans","-apple-system,system-ui,sans-serif"),tx3=css("--text-tertiary","#888"),grid=css("--border-subtle","rgba(0,0,0,.08)"),brand=css("--brand","#f7931a"),red=css("--market-negative","#e5484d");
    c.font="10px "+FONT;c.fillStyle=tx3;c.strokeStyle=grid;c.lineWidth=1;
    // 网格与左轴（币龄销毁）
    c.textAlign="right";c.textBaseline="middle";
    for(var g=0;g<=3;g++){var v=maxC/1.08*g/3,y=YC(v);c.beginPath();c.moveTo(padL,y+.5);c.lineTo(padL+pw,y+.5);c.stroke();c.fillText(num(v),padL-6,y)}
    // 右轴（价格，对数）
    c.textAlign="left";[pmin,Math.sqrt(pmin*pmax),pmax].forEach(function(v){c.fillText(usd(v),padL+pw+6,YP(v))});
    // 横轴日期
    c.textAlign="center";c.textBaseline="alphabetic";var lastLab=-99;
    for(var i=0;i<m;i++){var d=addDay(data.day0,s0+i);var mark=range>400?(d.slice(5)==="01-01"):(d.slice(8)==="01");if(!mark)continue;var x=X(i);if(x-lastLab<44)continue;lastLab=x;
      var lab=range>400?d.slice(0,4):(en()?["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+d.slice(5,7)-1]:(+d.slice(5,7))+"月");c.fillText(lab,x,H-6)}
    // 价格线（灰）
    c.strokeStyle=tx3;c.globalAlpha=.75;c.lineWidth=1.2;c.beginPath();var st0=false;
    for(i=0;i<m;i++){if(!(px[i]>0))continue;var y2=YP(px[i]);if(!st0){c.moveTo(X(i),y2);st0=true}else c.lineTo(X(i),y2)}c.stroke();c.globalAlpha=1;
    // 币龄销毁（橙色面积 + 线）
    c.beginPath();c.moveTo(X(0),YC(0));for(i=0;i<m;i++)c.lineTo(X(i),YC(Math.max(0,cdd[i])));c.lineTo(X(m-1),YC(0));c.closePath();
    c.fillStyle=brand;c.globalAlpha=.12;c.fill();c.globalAlpha=1;
    c.strokeStyle=brand;c.lineWidth=1.4;c.lineJoin="round";c.beginPath();for(i=0;i<m;i++){var yy=YC(Math.max(0,cdd[i]));if(i)c.lineTo(X(i),yy);else c.moveTo(X(i),yy)}c.stroke();
    // 异动线（红色虚线）
    var yl=YC(st.line);c.strokeStyle=red;c.lineWidth=1.2;c.setLineDash([5,4]);c.beginPath();c.moveTo(padL,yl);c.lineTo(padL+pw,yl);c.stroke();c.setLineDash([]);
    // 超过异动线：红圈（连续几天只圈最高的一天）
    c.lineWidth=1.8;c.strokeStyle=red;
    for(i=0;i<m;i++){if(!(cdd[i]>=st.line))continue;var a=i;while(i+1<m&&cdd[i+1]>=st.line)i++;var best=a;for(var k=a;k<=i;k++)if(cdd[k]>cdd[best])best=k;c.beginPath();c.arc(X(best),YC(cdd[best]),5,0,Math.PI*2);c.stroke();if(cdd[best]>maxC){var ax=X(best),ay=YC(cdd[best])-8;c.fillStyle=red;c.beginPath();c.moveTo(ax,ay-6);c.lineTo(ax-4,ay);c.lineTo(ax+4,ay);c.closePath();c.fill()}}
    // 按住时的读数
    var live=$("cddLive");
    if(hover>=0&&hover<m){var hx=X(hover);c.strokeStyle=tx3;c.lineWidth=1;c.beginPath();c.moveTo(hx+.5,padT);c.lineTo(hx+.5,padT+ph);c.stroke();
      c.fillStyle=brand;c.beginPath();c.arc(hx,YC(cdd[hover]),3.5,0,Math.PI*2);c.fill();
      if(live)live.textContent=addDay(data.day0,s0+hover)+" · "+num(cdd[hover])+(en()?" coin-days":" 币天")+" · "+(px[hover]>0?"$"+Math.round(px[hover]).toLocaleString("en-US"):"--")}
    else if(live)live.textContent="";
    draw.map={padL:padL,pw:pw,m:m};
  }
  async function bulk(name){
    var u=new URL(API);u.searchParams.set("index","day1");u.searchParams.set("series","date,"+name);u.searchParams.set("start",String(-SPAN));
    return typeof tryFetch==="function"?await tryFetch(u.toString(),20000):await (await fetch(u.toString())).json();
  }
  async function load(force){
    var c=readCache();if(c&&!data)data=c.data;
    if(!force&&c&&Date.now()-c.ts<TTL){render();return}
    if(loading)return;loading=true;failed=false;render();
    try{
      var r=await Promise.all([bulk("lth_coindays_destroyed_sum_24h"),bulk("price")]);
      var dates=r[0]&&r[0][0]&&r[0][0].data,cdd=r[0]&&r[0][1]&&r[0][1].data,pd=r[1]&&r[1][0]&&r[1][0].data,pv=r[1]&&r[1][1]&&r[1][1].data;
      if(!Array.isArray(dates)||!Array.isArray(cdd)||dates.length!==cdd.length)throw new Error("bad cdd");
      var pm={};if(Array.isArray(pd)&&Array.isArray(pv))pd.forEach(function(d,i){pm[d]=+pv[i]});
      // 最后一天还没走完（当天 UTC），不计入
      var today=new Date().toISOString().slice(0,10),end=dates.length;while(end>0&&dates[end-1]>=today)end--;
      var d={day0:dates[0],cdd:cdd.slice(0,end).map(function(v){return +v>=0?+v:0}),px:dates.slice(0,end).map(function(x){return pm[x]>0?pm[x]:0})};
      if(!valid(d))throw new Error("bad cdd");
      data=d;try{localStorage.setItem(KEY,JSON.stringify({ts:Date.now(),data:d}))}catch(e){}
    }catch(e){if(!data)failed=true}
    finally{loading=false;render()}
  }
  function init(){
    var sec=$("lthCdd");if(!sec)return;
    sec.addEventListener("click",function(e){var b=e.target.closest&&e.target.closest("[data-cdd-range]");if(!b)return;range=+b.dataset.cddRange;hover=-1;render()});
    var cv=$("cddCanvas");
    var pick=function(ev){if(!data||!draw.map)return;var r=cv.getBoundingClientRect(),x=(ev.touches?ev.touches[0].clientX:ev.clientX)-r.left,mm=draw.map;var i=Math.round((x-mm.padL)/mm.pw*(mm.m-1));hover=Math.max(0,Math.min(mm.m-1,i));draw(stats())};
    var clear=function(){hover=-1;if(data)draw(stats())};
    cv.addEventListener("pointermove",pick);cv.addEventListener("pointerdown",pick);cv.addEventListener("pointerleave",clear);cv.addEventListener("touchend",clear,{passive:true});
    var started=false,go=function(){if(started)return;started=true;load(false)};
    if("IntersectionObserver" in window){var io=new IntersectionObserver(function(es){if(es.some(function(x){return x.isIntersecting})){io.disconnect();go()}},{rootMargin:"600px 0px"});io.observe(sec)}else go();
    if(typeof window.refreshLthPulse==="function"){var orig=window.refreshLthPulse;window.refreshLthPulse=function(f){if(f)load(true);return orig.apply(this,arguments)}}
    var rt=0;window.addEventListener("resize",function(){clearTimeout(rt);rt=setTimeout(function(){if(data)render()},150)},{passive:true});
    window.addEventListener("themechange",function(){if(data)render()});
    if("ResizeObserver" in window){new ResizeObserver(function(){if(data)render()}).observe(cv.parentElement)}
    render();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();

;/*EXT_SEP*/

(function(){
  "use strict";
  // V27.3 正式版：本月信号定投（与「定投策略对比」里的信号定投同一套规则）
  //   每月预算 = 1 份。底部区 2 份（多出的 1 份从储备金拿，不够就有多少拿多少）；中性 1 份；顶部区 0.5 份（另一半存进储备金）。
  //   牛市后期风控当月：提示卖出现货持仓的 1/3，所得可手动加进储备金。
  function $(id){return document.getElementById(id)}
  function en(){return window.BTC_LANG==="en"}
  function st(){try{return typeof S!=="undefined"?S:null}catch(e){return null}}
  function yuan(v){return "¥"+Math.round(v).toLocaleString("en-US")}
  function plan(){var x=st();if(!x)return null;if(!x.sigPlan||typeof x.sigPlan!=="object")x.sigPlan={};var p=x.sigPlan;if(!(p.budget>0))p.budget=2000;if(!/^\d{4}-\d{2}$/.test(p.start||""))p.start=null;if(!isFinite(p.adj))p.adj=0;return p}
  function save(){try{if(typeof saveState==="function")saveState()}catch(e){}}
  function zoneName(z){return z==="b"?(en()?"Bottom zone":"底部区"):(z==="t"||z==="T")?(en()?"Top zone":"顶部区"):(en()?"Neutral":"中性区间")}
  function held(){var x=st(),h=x&&x.hd;return h?Math.max(0,(+h.d||0)+(+h.l||0)):0}
  function spent(){try{var v=typeof executionView==="function"?executionView():null;return v&&v.ready&&isFinite(v.total)?v.total:null}catch(e){return null}}
  var ICON={down:'<path d="M12 4v11"/><path d="M7.5 11 12 15.5 16.5 11"/><path d="M6 20h12"/>',up:'<path d="M12 20V9"/><path d="M7.5 13 12 8.5 16.5 13"/><path d="M6 4h12"/>',
    shield:'<path d="M12 3.5 5.5 6v5.6c0 4 2.8 7 6.5 8.4 3.7-1.4 6.5-4.4 6.5-8.4V6z"/><path d="m9.3 12 2 2 3.6-3.8"/>',vault:'<rect x="3.5" y="5" width="17" height="14" rx="3"/><circle cx="12" cy="12" r="3.2"/><path d="M12 8.8V7.5M12 16.5v-1.3M15.2 12h1.3M7.5 12h1.3"/>',
    plus:'<circle cx="12" cy="12" r="8.5"/><path d="M12 8.5v7M8.5 12h7"/>'};
  function ic(n,c){return '<span class="sp-ic" style="--c:'+c+'" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+ICON[n]+'</svg></span>'}
  function budgetChip(B){var h=$("dcaIntro");if(!h)return;var c=h.querySelector(".sp-budget");if(!c){c=document.createElement("button");c.type="button";c.className="sp-budget";c.dataset.sp="budget";h.appendChild(c)}c.innerHTML=(en()?"Monthly ":"每月 ")+"<b>"+yuan(B)+"</b>"}
  function render(){
    var box=$("sigPlan"),D=window.__TBM,p=plan();if(!box)return;
    if(!D||!D.rows||!D.rows.length||!p){box.removeAttribute("data-z");box.innerHTML='<div class="sp-card sp-empty">'+(en()?"Waiting for data":"等待数据")+'</div>';return}
    var E2=en(),n=D.rows.length,k=n-1,m=D.rows[k].m,B=p.budget,risk=new Set(D.risk||[]);
    if(!p.start){p.start=m;save()}
    budgetChip(B);
    var s0=D.rows.findIndex(function(r){return r.m>=p.start});if(s0<0)s0=k;
    var res=+p.adj||0;
    // V27.8：深度底部（LTH_PSIL ≥ 42%）的月份，储备金一次全部投入
    for(var i=s0;i<k;i++){var zz=D.zone[i];if(zz==="t"||zz==="T")res+=B/2;else if(zz==="b"){res-=(D.deep&&D.deep[i])?res:Math.max(0,Math.min(res,B))}}
    res=Math.max(0,res);
    var z=D.zone[k]||"n",zk=z==="b"?"b":(z==="t"||z==="T")?"t":"n",amt,save2=0,from=0,verdict,sub,zname,zc;
    var deepNow=!!(D.deep&&D.deep[k]),psNow=D.psil&&D.psil[k];
    if(zk==="b"&&deepNow){from=res;amt=B+from;zname=E2?"Deep bottom":"深度底部";zc="var(--sg)";verdict=E2?"Deep bottom: budget + all of the reserve":"深度底部，预算加全部储备金";sub=from>0?(E2?"Budget "+yuan(B)+" + reserve "+yuan(from):"本月预算 "+yuan(B)+" ＋ 储备金 "+yuan(from)):(E2?"Reserve is empty, invest the budget":"储备金为 0，先投本月预算")}
    else if(zk==="b"){from=Math.min(res,B);amt=B+from;zname=E2?"Bottom zone":"底部区";zc="var(--sg)";verdict=E2?"Bottom zone, double up":"底部区，加倍投入";sub=from>0?(E2?"Budget "+yuan(B)+" + reserve "+yuan(from):"本月预算 "+yuan(B)+" ＋ 储备金 "+yuan(from)):(E2?"Reserve is empty, invest the budget":"储备金为 0，先投本月预算")}
    else if(zk==="t"){amt=B/2;save2=B/2;zname=E2?"Top zone":"顶部区";zc="var(--so)";verdict=E2?"Top zone, invest half":"顶部区，减半投入";sub=E2?"Put "+yuan(save2)+" into the reserve":"另 "+yuan(save2)+" 存进储备金"}
    else{amt=B;zname=E2?"Neutral":"中性区间";zc="var(--sb)";verdict=E2?"Neutral, invest as planned":"中性区间，照常投入";sub=E2?"No adjustment this month":"信号不加不减"}
    var r=risk.has(k),h=held(),sp=spent(),done=sp==null?0:Math.max(0,sp),pct=amt>0?Math.min(1,done/amt):0;
    var C=2*Math.PI*84,L=Math.max(.01,C*pct);
    var tier=function(key,x,label,a,c){return '<div class="sp-tier'+(zk===key?' on':'')+'" style="--c:'+c+'"><b>'+x+'</b><span>'+label+'</span><i>'+yuan(a)+'</i></div>'};
    var steps3=function(v,c){var x=v==null?0:Math.max(0,Math.min(3,v)),h='<span class="sp-steps" style="--c:'+c+'">';for(var q=1;q<=3;q++)h+='<i'+(q<=x?' class="on"':'')+(q===2?' data-cut="1"':'')+'></i>';return h+'</span>'};
    var meter=function(v,c){var x=v==null?0:Math.max(0,Math.min(100,v));return '<span class="sp-meter" style="--c:'+c+'"><u style="width:'+x.toFixed(1)+'%"></u><s></s></span>'};
    var gb=D.gBottom&&D.gBottom[k],gt=D.gTop&&D.gTop[k],mm=+m.slice(5,7);
    box.dataset.z=zk;
    box.innerHTML='<div class="sp-card sp-hero">'
      +'<div class="sp-top"><span class="sp-month">'+(E2?["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][mm-1]+" "+m.slice(0,4):m.slice(0,4)+" 年 "+mm+" 月")+'</span><span class="sp-tags"><span class="sp-tag" style="--c:'+zc+'"><i></i>'+zname+'</span>'+(r?'<span class="sp-tag" style="--c:var(--sr)"><i></i>'+(E2?"Risk control":"风控")+'</span>':'')+'</span></div>'
      +'<div class="sp-ring"><svg viewBox="0 0 200 200" aria-hidden="true" style="color:var(--z)"><defs><linearGradient id="spRingG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".55"/><stop offset="1" stop-color="currentColor"/></linearGradient></defs>'
      +'<circle cx="100" cy="100" r="84" fill="none" stroke="color-mix(in srgb,var(--z) 14%,var(--border-subtle))" stroke-width="9"/>'
      +'<circle cx="100" cy="100" r="84" fill="none" stroke="url(#spRingG)" style="color:var(--z)" stroke-width="9" stroke-linecap="round" stroke-dasharray="'+L.toFixed(1)+' '+C.toFixed(1)+'" transform="rotate(-90 100 100)"/></svg>'
      +'<div class="sp-ringtxt"><small>'+(E2?"To invest":"本月应投")+'</small><b><em>¥</em>'+Math.round(amt).toLocaleString("en-US")+'</b><span>'+(sp==null?(E2?"Records unavailable":"记录待核对"):(pct>=1?(E2?"Done":"已完成"):(E2?"Invested ":"已投 ")+yuan(done)+" / "+Math.round(pct*100)+"%"))+'</span></div></div>'
      +'<div class="sp-verdict">'+verdict+'</div><div class="sp-vsub">'+sub+'</div>'
      +'<div class="sp-tiers">'+tier("b","×2",E2?"Bottom":"底部区",B*2,"var(--sg)")+tier("n","×1",E2?"Neutral":"中性",B,"var(--sb)")+tier("t","×0.5",E2?"Top":"顶部区",B/2,"var(--so)")+'</div>'
      +'</div>'
      +'<div class="sp-h2">'+(E2?"Signals":"依据")+'</div><div class="sp-card sp-list">'
      +'<div class="sp-row">'+ic("down","var(--sg)")+'<span class="sp-lab">'+(E2?"Bottom signal":"底部信号")+'<em>'+(E2?"Doubles above 75":"过 75 加倍")+'</em></span>'+meter(gb,"var(--sg)")+'<b'+(gb>=75?' style="color:var(--sg)"':'')+'>'+(gb==null?"--":Math.round(gb))+'</b></div>'
      +'<div class="sp-row">'+ic("shield","var(--sg)")+'<span class="sp-lab">'+(E2?"Deep bottom":"深度底部")+'<em>'+(E2?"LTH supply in loss ≥ 42%: use all of the reserve":"长期持有者浮亏 ≥ 42% 时，储备金全部投入")+'</em></span><b'+(deepNow?' style="color:var(--sg)"':' class="mute"')+'>'+(psNow==null?"—":Math.round(psNow)+"%")+'</b></div>'
      +'<div class="sp-row">'+ic("up","var(--so)")+'<span class="sp-lab">'+(E2?"Top signal":"顶部信号")+'<em>'+(E2?"Halves at 2 of 3":"三项满足两项减半")+'</em></span>'+steps3(gt,"var(--so)")+'<b'+(gt>=2?' style="color:var(--so)"':'')+'>'+(gt==null?"--":gt+"/3")+'</b></div>'
      +'<div class="sp-row">'+ic("shield","var(--sr)")+'<span class="sp-lab">'+(E2?"Late-bull risk control":"牛市后期风控")+(r?'<em style="color:var(--sr)">'+(E2?"Sell 1/3 of spot into the reserve":"卖出现货的 1/3 放进储备金")+(h>0?(E2?" · about ":"，约 ")+(h/3).toFixed(4)+" BTC":"")+'</em>':'')+'</span><b class="'+(r?'':'mute')+'"'+(r?' style="color:var(--sr)"':'')+'>'+(r?(E2?"Fired":"已启动"):(E2?"Off":"未启动"))+'</b></div>'
      +'</div>'
      +'<div class="sp-h2">'+(E2?"Money":"资金")+'</div><div class="sp-card sp-list">'
      +'<button type="button" class="sp-row" data-sp="adj">'+ic("vault","var(--sv)")+'<span class="sp-lab">'+(E2?"Reserve":"储备金")+'</span><b>'+yuan(res)+(save2?' → '+yuan(res+save2):from?' → '+yuan(res-from):'')+'</b></button>'
      +'<button type="button" class="sp-row" data-sp="rec">'+ic("plus","var(--sb)")+'<span class="sp-lab">'+(E2?"Record this month":"记录本月投入")+'</span><b class="link">'+(E2?"Record":"记录")+'</b></button>'
      +'</div>';
  }
  function init(){
    var box=$("sigPlan");if(!box)return;
    var onClick=function(e){var b=e.target.closest&&e.target.closest("[data-sp]");if(!b)return;
      if(b.dataset.sp==="budget"){var p0=plan(),t0=window.prompt(en()?"Monthly budget in ¥ (1 unit)":"每月预算（元）：底部区投 2 倍，顶部区投一半","" + p0.budget);if(t0==null)return;var v0=Math.round(+String(t0).replace(/[^\d.]/g,""));if(v0>=100){p0.budget=v0;save();render()}return}
      if(b.dataset.sp==="rec"){try{setTab("mine");if(typeof focusOpenSection==="function")focusOpenSection("personal")}catch(_){}return}
      if(b.dataset.sp==="adj"){var p=plan(),cur=+p.adj||0,t=window.prompt(en()?"Add to (or subtract from, with −) the reserve, in ¥":"储备金调整（元）：输入要加入的金额，减少用负数。例如风控卖出所得、手动存入。","");if(t==null)return;var v=+String(t).replace(/[^\d.\-]/g,"");if(isFinite(v)&&v!==0){p.adj=cur+v;save();render()}}};
    box.addEventListener("click",onClick);var hd=$("dcaIntro");if(hd)hd.addEventListener("click",onClick);
    document.addEventListener("tbm:update",render);
    setInterval(function(){if(document.documentElement.dataset.tab==="dca")render()},30000);
    var warm=function(){if(!window.__TBM&&typeof window.__tbmInit==="function")try{window.__tbmInit()}catch(e){}};
    var orig=window.setTab;if(typeof orig==="function")window.setTab=function(t){var r=orig.apply(this,arguments);if(t==="dca"){warm();render()}return r};
    if(document.documentElement.dataset.tab==="dca")warm();
    render();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();

;/*EXT_SEP*/

(function(){
  "use strict";
  // V27.4：长期持有者每月持仓变化（Bitview lth_supply_delta_1m，按月：每月最后一天的 30 天净变化；当月为最近 30 天）
  var KEY="btc_lth_monthly_v1",TTL=6*3600*1000,API="https://bitview.space/api/series/bulk";
  // 3 月 / 1 年：按天显示（每天的 30 天净变化）；3 年 / 5 年 / 全部：按月显示
  var data=null,loading=false,failed=false,range=66,hover=-1,map=null,daily=null,dLoading=false,dFailed=false,DKEY="btc_lth_daily_v1";
  function $(id){return document.getElementById(id)}
  function en(){return window.BTC_LANG==="en"}
  function css(n,f){var v=getComputedStyle(document.documentElement).getPropertyValue(n).trim();return v||f}
  function fmt(v,sign){if(!isFinite(v))return "--";var a=Math.abs(v),t;
    if(en())t=a>=1e6?(a/1e6).toFixed(2)+"M":a>=1e3?(a/1e3).toFixed(a>=1e5?0:1)+"K":Math.round(a)+"";
    else t=a>=1e4?(a/1e4).toFixed(a>=1e6?0:1)+"万":Math.round(a).toLocaleString("en-US");
    t=t.replace(/\.0(?=万|K|M)/,"");return (sign?(v>0?"+":v<0?"−":""):(v<0?"−":""))+t}
  function usd(v){return v>=1e3?"$"+(v/1e3).toFixed(v>=1e5?0:1)+"K":"$"+Math.round(v)}
  function valid(d){return d&&Array.isArray(d.m)&&Array.isArray(d.v)&&Array.isArray(d.p)&&d.m.length===d.v.length&&d.m.length>24}
  function readCache(){try{var c=JSON.parse(localStorage.getItem(KEY));if(c&&valid(c.data))return c}catch(e){}return null}
  function badge(){var b=$("freshLthMonthly");if(!b)return;var t,c;
    if(data||daily){var d1=data&&data.day||"",d2=daily&&daily.m&&daily.m.length?daily.m[daily.m.length-1]:"",d=d2&&(!d1||d2>d1)?d2:d1,age=d?(Date.now()-Date.parse(d+"T00:00:00Z"))/864e5:0;if(d&&age>3){t=(en()?"Stale · ":"滞后 · ")+d.slice(5);c="warn"}else{t=(en()?"Data date · ":"数据日 · ")+(d?d.slice(5):(data?data.m[data.m.length-1].slice(0,7):""));c="good"}}
    else if(loading){t=en()?"Syncing":"同步中";c="warn"}else if(failed){t=en()?"Unavailable":"暂不可用";c="bad"}else{t=en()?"Waiting for data":"等待数据";c="warn"}
    b.textContent=t;b.className="fresh-badge "+c}
  function labels(){var E=en(),set=function(id,z,e){var x=$(id);if(x)x.textContent=E?e:z};
    set("mchgNowLabel","最近 30 天","Last 30 days");set("mchgPrevLabel","上月","Last month");set("mchgYearLabel","近 12 个月合计","Past 12 months");
    set("mchgLegAdd","增持","Added");set("mchgLegCut","减持","Reduced");set("mchgLegPx","BTC 价格","BTC price");
    document.querySelectorAll("[data-mchg-range]").forEach(function(b){var on=+b.dataset.mchgRange===range;b.setAttribute("aria-pressed",on?"true":"false");b.classList.toggle("active",on);if(E)b.textContent={"-90":"3M","-365":"1Y",36:"3Y",66:"5Y",999:"All"}[b.dataset.mchgRange]})}
  function kpi(id,v){var e=$(id);if(!e)return;e.innerHTML=isFinite(v)?fmt(v,true)+'<span class="mchg-u">BTC</span>':"--";e.classList.toggle("up",v>0);e.classList.toggle("dn",v<0)}
  function render(){
    badge();labels();var cv=$("mchgCanvas"),empty=$("mchgEmpty");if(!cv)return;
    if(!data){if(empty){empty.hidden=false;empty.textContent=loading?(en()?"Syncing…":"同步中…"):failed?(en()?"Unavailable":"暂不可用"):(en()?"Waiting for data":"等待数据")}return}
    if(empty)empty.hidden=true;
    var n=data.v.length,d2=daily&&daily.m&&daily.m.length?daily.m[daily.m.length-1]:"",useD=d2&&(!data.day||d2>=data.day);kpi("mchgNow",useD?daily.v[daily.v.length-1]:data.v[n-1]);kpi("mchgPrev",data.v[n-2]);
    var y=0;for(var i=Math.max(0,n-12);i<n;i++)y+=data.v[i]||0;
    // 近 12 个月合计 = 12 个完整月的月末 30 天变化之和（约等于一年的净变化）
    kpi("mchgYear",y);draw();
  }
  function draw(){
    var cv=$("mchgCanvas"),box=cv.parentElement,W=box.clientWidth,H=box.clientHeight;if(!W||!H||!data)return;
    var dpr=Math.min(3,window.devicePixelRatio||1);cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);
    var c=cv.getContext("2d");c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,W,H);
    var dly=range<0,src=dly?daily:data;
    if(dly&&!src){loadDaily();src=daily;if(!src){var lv=$("mchgLive");if(lv)lv.textContent=dFailed?(en()?"Daily data unavailable":"日度数据暂不可用"):(en()?"Loading daily data…":"正在读取日度数据…");return}}
    var span=dly?-range:range,N=src.v.length,s0=Math.max(0,N-span),v=src.v.slice(s0),p=src.p.slice(s0),m=src.m.slice(s0),cnt=v.length;
    var padL=46,padR=48,padT=10,padB=22,pw=W-padL-padR,ph=H-padT-padB;
    var mx=0;v.forEach(function(x){if(isFinite(x))mx=Math.max(mx,Math.abs(x))});
    // 整齐的刻度：每格 1 / 1.5 / 2 / 2.5 / 3 / 4 / 5 / 6 / 8 × 10ⁿ，上下各两格
    var raw=(mx||1)/2,mag=Math.pow(10,Math.floor(Math.log10(raw))),f=raw/mag,step=[1,1.5,2,2.5,3,4,5,6,8,10].find(function(x){return f<=x})*mag;mx=step*2*1.04;
    var pmin=Infinity,pmax=0;p.forEach(function(x){if(x>0){pmin=Math.min(pmin,x);pmax=Math.max(pmax,x)}});var lmin=Math.log(pmin*.9),lmax=Math.log(pmax*1.1);
    var bw=pw/cnt,X=function(i){return padL+i*bw},Y=function(x){return padT+ph/2-(x/mx)*(ph/2)},YP=function(x){return padT+ph-(Math.log(x)-lmin)/(lmax-lmin)*ph};
    var FONT=css("--font-sans","-apple-system,system-ui,sans-serif"),tx3=css("--text-tertiary","#888"),grid=css("--border-subtle","rgba(0,0,0,.08)"),up=css("--market-positive","#18a058"),dn=css("--market-negative","#e5484d");
    c.font="10px "+FONT;c.fillStyle=tx3;c.strokeStyle=grid;c.lineWidth=1;c.textAlign="right";c.textBaseline="middle";
    [-2,-1,0,1,2].forEach(function(g){var val=step*g,yy=Y(val);c.beginPath();c.moveTo(padL,Math.round(yy)+.5);c.lineTo(padL+pw,Math.round(yy)+.5);c.stroke();c.fillText(fmt(val,false),padL-6,yy)});
    c.textAlign="left";if(pmax>0)[pmin,Math.sqrt(pmin*pmax),pmax].forEach(function(x){c.fillText(usd(x),padL+pw+6,YP(x))});
    c.textAlign="center";c.textBaseline="alphabetic";var last=-99;
    var MN=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    for(var i=0;i<cnt;i++){
      if(dly){if(m[i].slice(8,10)!=="01")continue}else if(m[i].slice(5,7)!=="01")continue;
      var xx=X(i)+bw/2;if(xx-last<40)continue;last=xx;
      c.fillText(dly?(en()?MN[+m[i].slice(5,7)-1]:(+m[i].slice(5,7))+"月"):m[i].slice(0,4),xx,H-6)}
    // 柱：增持绿、减持红
    var gap=bw>6?1:bw>3?.5:0;
    for(i=0;i<cnt;i++){var val2=v[i];if(!isFinite(val2)||!val2)continue;var y0=Y(0),y1=Y(val2),col=val2>0?up:dn;
      c.globalAlpha=hover===i?1:.78;c.fillStyle=col;c.fillRect(X(i)+gap/2,Math.min(y0,y1),Math.max(1,bw-gap),Math.abs(y1-y0))}
    c.globalAlpha=1;
    // 零线
    c.strokeStyle=tx3;c.globalAlpha=.6;c.beginPath();c.moveTo(padL,Math.round(Y(0))+.5);c.lineTo(padL+pw,Math.round(Y(0))+.5);c.stroke();c.globalAlpha=1;
    // 价格线
    c.strokeStyle=css("--text-secondary","#555");c.globalAlpha=.7;c.lineWidth=1.4;c.lineJoin="round";c.beginPath();var st=false;
    for(i=0;i<cnt;i++){if(!(p[i]>0))continue;var px=X(i)+bw/2,py=YP(p[i]);if(!st){c.moveTo(px,py);st=true}else c.lineTo(px,py)}c.stroke();c.globalAlpha=1;
    var live=$("mchgLive");
    if(hover>=0&&hover<cnt){if(live)live.textContent=(dly?m[hover]+(en()?" · 30-day ":" · 30 天 "):m[hover].slice(0,7)+" · ")+fmt(v[hover],true)+" BTC · "+(p[hover]>0?"$"+Math.round(p[hover]).toLocaleString("en-US"):"--")}else if(live)live.textContent="";
    map={padL:padL,bw:bw,cnt:cnt};
  }
  function loadDaily(force){
    if(dLoading||(!force&&daily))return;
    try{var c=JSON.parse(localStorage.getItem(DKEY));if(c&&valid(c.data)){daily=c.data;var ld=daily.m[daily.m.length-1],stale=!ld||(Date.now()-Date.parse(ld+"T00:00:00Z"))>2*864e5;if(!force&&!stale&&Date.now()-c.ts<TTL){if(data)render();else draw();return}}}catch(e){}
    dLoading=true;dFailed=false;
    var u=function(name){var x=new URL(API);x.searchParams.set("index","day1");x.searchParams.set("series","date,"+name);x.searchParams.set("start","-400");return x.toString()};
    var get=function(url){return typeof tryFetch==="function"?tryFetch(url,20000):fetch(url).then(function(r){return r.json()})};
    Promise.all([get(u("lth_supply_delta_1m")),get(u("price"))]).then(function(r){
      var dm=r[0][0].data,dv=r[0][1].data,pm=r[1][0].data,pv=r[1][1].data,P={},today=new Date().toISOString().slice(0,10);pm.forEach(function(d,i){P[d]=+pv[i]});
      var d={m:[],v:[],p:[]};dm.forEach(function(x,i){var val=dv[i];if(x>=today||val==null||!isFinite(+val))return;d.m.push(x);d.v.push(+val);d.p.push(P[x]||0)});
      if(!valid(d))throw new Error("bad daily");daily=d;try{localStorage.setItem(DKEY,JSON.stringify({ts:Date.now(),data:d}))}catch(e){}
    }).catch(function(){if(!daily)dFailed=true}).then(function(){dLoading=false;if(data)render();else draw()});
  }
  async function bulk(name){var u=new URL(API);u.searchParams.set("index","month1");u.searchParams.set("series","date,"+name);u.searchParams.set("start","0");
    return typeof tryFetch==="function"?await tryFetch(u.toString(),20000):await (await fetch(u.toString())).json()}
  async function load(force){
    var c=readCache();if(c&&!data)data=c.data;
    if(!force&&c&&Date.now()-c.ts<TTL){render();return}
    if(loading)return;loading=true;failed=false;render();
    try{
      var r=await Promise.all([bulk("lth_supply_delta_1m"),bulk("price")]);
      var dm=r[0][0].data,dv=r[0][1].data,pm=r[1][0].data,pv=r[1][1].data,P={};pm.forEach(function(d,i){P[d]=+pv[i]});
      var d={m:[],v:[],p:[],day:String(r[0][1].stamp||"").slice(0,10)};
      dm.forEach(function(x,i){var val=dv[i];if(val==null||!isFinite(+val))return;d.m.push(x);d.v.push(+val);d.p.push(P[x]||0)});
      if(!valid(d))throw new Error("bad lth monthly");
      data=d;try{localStorage.setItem(KEY,JSON.stringify({ts:Date.now(),data:d}))}catch(e){}
    }catch(e){if(!data)failed=true}
    finally{loading=false;render()}
  }
  function init(){
    var sec=$("lthMonthly");if(!sec)return;
    sec.addEventListener("click",function(e){var b=e.target.closest&&e.target.closest("[data-mchg-range]");if(!b)return;range=+b.dataset.mchgRange;hover=-1;render()});
    var cv=$("mchgCanvas");
    var pick=function(ev){if(!data||!map)return;var r=cv.getBoundingClientRect(),x=(ev.touches?ev.touches[0].clientX:ev.clientX)-r.left;hover=Math.max(0,Math.min(map.cnt-1,Math.floor((x-map.padL)/map.bw)));draw()};
    var clear=function(){hover=-1;if(data)draw()};
    cv.addEventListener("pointermove",pick);cv.addEventListener("pointerdown",pick);cv.addEventListener("pointerleave",clear);cv.addEventListener("touchend",clear,{passive:true});
    var started=false,go=function(){if(started)return;started=true;load(false)};(window.__warm=window.__warm||{}).lthMonthly=go;
    if("IntersectionObserver" in window){var io=new IntersectionObserver(function(es){if(es.some(function(x){return x.isIntersecting})){io.disconnect();go()}},{rootMargin:"600px 0px"});io.observe(sec.closest("details")||sec)}else go();
    var rt=0;window.addEventListener("resize",function(){clearTimeout(rt);rt=setTimeout(function(){if(data)render()},150)},{passive:true});
    window.addEventListener("themechange",function(){if(data)render()});
    if("ResizeObserver" in window){new ResizeObserver(function(){if(data)draw()}).observe(cv.parentElement)}
    var rb=$("lthMonthlyRefreshBtn");
    if(rb)rb.addEventListener("click",function(){
      if(loading||dLoading)return;
      rb.disabled=true;rb.textContent=en()?"Syncing…":"更新中";
      try{localStorage.removeItem(KEY);localStorage.removeItem(DKEY)}catch(e){}
      var b=window.__sgNet&&window.__sgNet.bust?window.__sgNet.bust("lth_supply_delta_1m"):Promise.resolve();
      b.then(function(){return Promise.all([load(true),loadDaily(true)])}).finally(function(){rb.disabled=false;rb.textContent=en()?"Refresh":"更新"});
    });
    document.addEventListener("visibilitychange",function(){if(started&&document.visibilityState==="visible"){load(false);if(range<0)loadDaily(false)}});
    render();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();

;/*EXT_SEP*/

(function(){
  "use strict";
  // V27.6：稳定币流动性（USDT / USDC）
  //   日度：DefiLlama 每日流通市值（与原模块同一来源）；BTC 价格：Bitview 日度
  //   12 小时：CoinGecko 近 2 天逐小时市值，取最新与 12 小时前之差；变化 ≥ 市值 0.3% 记为「异动」
  var KEY="btc_stablex_v1",TTL=6*3600*1000,K12="btc_stablex_12h_v1",T12=5*60*1000,SPAN=1100;
  var D=null,H=null,range=365,sel="t",hover={t:-1,u:-1,c:-1},maps={},loading=false;
  function $(id){return document.getElementById(id)}
  function en(){return window.BTC_LANG==="en"}
  function css(n,f){var v=getComputedStyle(document.documentElement).getPropertyValue(n).trim();return v||f}
  function b$(v,sign){if(!isFinite(v))return "--";var a=Math.abs(v),t=a>=1e9?"$"+(a/1e9).toFixed(a>=1e10?1:2)+"B":"$"+(a/1e6).toFixed(0)+"M";return (v<0?"−":(sign&&v>0?"+":""))+t}
  function pct(v){return isFinite(v)?(v>=0?"+":"−")+Math.abs(v*100).toFixed(1)+"%":"--"}
  function ax(v){var a=Math.abs(v),t=a>=1e9?"$"+(+(a/1e9).toFixed(1))+"B":"$"+Math.round(a/1e6)+"M";return (v<0?"−":"+")+t}
  function get(url,ms){return typeof tryFetch==="function"?tryFetch(url,ms||12000):fetch(url).then(function(r){return r.json()})}
  function readJSON(k){try{return JSON.parse(localStorage.getItem(k))}catch(e){return null}}
  function llama(id){return get("https://stablecoins.llama.fi/stablecoincharts/all?stablecoin="+id,30000).then(function(r){
      if(!Array.isArray(r))throw new Error("llama");var out={};r.forEach(function(x){var t=+x.date,v=x.totalCirculatingUSD&&x.totalCirculatingUSD.peggedUSD;if(t&&v>0)out[new Date(t*1000).toISOString().slice(0,10)]=+v});return out})}
  function btc(){var u=new URL("https://bitview.space/api/series/bulk");u.searchParams.set("index","day1");u.searchParams.set("series","date,price");u.searchParams.set("start",String(-SPAN));
    return get(u.toString(),15000).then(function(r){var d=r[0].data,v=r[1].data,o={};d.forEach(function(x,i){if(v[i]>0)o[x]=+v[i]});return o})}
  // V27.6.2：DefiLlama 连不上时（部分网络下会被拦），改用 CoinGecko 近 365 天日度数据
  function cgDaily(id){return get("https://api.coingecko.com/api/v3/coins/"+id+"/market_chart?vs_currency=usd&days=365",15000).then(function(r){
      var mc=(r&&r.market_caps)||[],pr=(r&&r.prices)||[],o={};
      for(var i=0;i<mc.length;i++){var p=pr[i],px=p?+p[1]:1;if(!(px>.97&&px<1.03))px=1;var v=+mc[i][1]/px;if(v>1e9)o[new Date(mc[i][0]).toISOString().slice(0,10)]=v}
      if(Object.keys(o).length<200)throw new Error("cg daily");return o})}
  function sleep(ms){return new Promise(function(r){setTimeout(r,ms)})}
  var dailyFailed=false;
  async function loadDaily(force){
    var c=readJSON(KEY);if(c&&c.data&&c.data.days&&c.data.days.length>60){D=c.data;if(!force&&Date.now()-c.ts<TTL)return}
    if(loading)return;loading=true;dailyFailed=false;
    // V27.10：先读 GitHub 每 6 小时预先下载的 data/stablecoins.json（同一网站，最快最稳）；没有或超过 36 小时才自己去取
    try{var pre=await fetch("data/stablecoins.json",{cache:"no-cache"}).then(function(r){return r.ok?r.json():null}).catch(function(){return null});
      if(pre&&Array.isArray(pre.days)&&pre.days.length>60&&pre.u&&pre.c&&pre.u.length===pre.days.length&&Date.now()-(+pre.ts||0)<36*3600*1000){
        var pp=pre.p&&pre.p.length===pre.days.length?pre.p.slice():pre.days.map(function(){return 0});
        D={src:pre.src==="coingecko"?"cg":"pre",days:pre.days,u:pre.u,c:pre.c,p:pp};try{localStorage.setItem(KEY,JSON.stringify({ts:Date.now(),data:D}))}catch(e){}
        loading=false;return}}catch(e){}
    try{
      var src="llama",pair;
      try{pair=await Promise.all([llama(1),llama(2)])}
      catch(e){src="cg";var a=await cgDaily("tether");await sleep(1200);var b=await cgDaily("usd-coin");pair=[a,b]}
      var r=[pair[0],pair[1],await btc().catch(function(){return {}})];
      var days=Object.keys(r[0]).filter(function(d){return r[1][d]>0}).sort();days=days.slice(-SPAN);
      if(days.length<60)throw new Error("short");
      var d={src:src,days:days,u:days.map(function(x){return r[0][x]}),c:days.map(function(x){return r[1][x]}),p:days.map(function(x){return r[2][x]||0})};
      // 价格缺失时沿用前一天
      for(var i=1;i<d.p.length;i++)if(!(d.p[i]>0))d.p[i]=d.p[i-1];
      D=d;try{localStorage.setItem(KEY,JSON.stringify({ts:Date.now(),data:d}))}catch(e){}
    }catch(e){if(!D)dailyFailed=true}
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
    var arr=D[key],n=D.days.length,s0=Math.max(30,n-Math.min(range,n)),idx=[];for(var i=s0;i<n;i++)idx.push(i);var cnt=idx.length;
    var vals=idx.map(function(i){return chg(arr,i,30)}),pr=idx.map(function(i){return D.p[i]});
    var padL=44,padR=42,padT=8,padB=18,pw=W-padL-padR,ph=Hh-padT-padB,mx=0;vals.forEach(function(v){if(isFinite(v))mx=Math.max(mx,Math.abs(v))});
    var raw=(mx||1)/2,mag=Math.pow(10,Math.floor(Math.log10(raw))),f=raw/mag,step=[1,1.5,2,2.5,3,4,5,6,8,10].find(function(x){return f<=x})*mag;mx=step*2*1.04;
    var pmin=Infinity,pmax=0;pr.forEach(function(x){if(x>0){pmin=Math.min(pmin,x);pmax=Math.max(pmax,x)}});var lmin=Math.log(pmin*.92),lmax=Math.log(pmax*1.08);
    var bw=pw/cnt,X=function(i){return padL+i*bw},Y=function(v){return padT+ph/2-(v/mx)*(ph/2)},YP=function(x){return padT+ph-(Math.log(x)-lmin)/(lmax-lmin)*ph};
    var FONT=css("--font-sans","-apple-system,system-ui,sans-serif"),tx3=css("--text-tertiary","#888"),grid=css("--border-subtle","rgba(0,0,0,.08)"),up=css("--market-positive","#18a058"),dn=css("--market-negative","#e5484d");
    c.font="9px "+FONT;c.fillStyle=tx3;c.strokeStyle=grid;c.lineWidth=1;c.textAlign="right";c.textBaseline="middle";
    [-2,-1,0,1,2].forEach(function(g){var yy=Math.round(Y(step*g))+.5;c.beginPath();c.moveTo(padL,yy);c.lineTo(padL+pw,yy);c.stroke();c.fillText(g?ax(step*g):"0",padL-5,yy)});
    c.textAlign="left";if(pmax>0){c.fillText("$"+Math.round(pmax/1e3)+"K",padL+pw+5,YP(pmax));c.fillText("$"+Math.round(pmin/1e3)+"K",padL+pw+5,YP(pmin));c.fillText("BTC",padL+pw+5,padT+ph/2)}
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
    if(!D){
      var age0=h12Age(),fr0=age0<=60,cls0=function(v){return v>0?"up":v<0?"dn":""};
      var chip0=function(name,h){if(!h)return '<span class="stx-chip">'+name+' --</span>';var hot=fr0&&Math.abs(h.d)>=h.cap*.003,c=h.d>=0?"var(--market-positive)":"var(--market-negative)";
        return '<span class="stx-chip'+(hot?' hot':'')+'" style="--c:'+c+'">'+name+' <b class="'+cls0(h.d)+'">'+b$(h.d,true)+'</b>'+(hot?'<em>'+(E?(h.d>0?"Big mint":"Big burn"):(h.d>0?"异动增发":"异动赎回"))+'</em>':'')+'</span>'};
      box.innerHTML=(H?'<div class="stx-12h"><span>'+(E?"12 hours":"12 小时")+'</span>'+chip0("USDT",H.u)+chip0("USDC",H.c)+'</div><div class="stx-fresh'+(fr0?'':' warn')+'">'+(fr0?(E?"Updated ":"更新于 ")+hm(Math.min(H.u.t,H.c.t)):(E?"Stale by ":"已滞后 ")+fmtAge(age0))+'</div>':'')
        +'<div class="stx-empty">'+(loading?(E?"Loading daily history…":"正在读取日度数据…"):dailyFailed?(E?"Daily history unavailable (DefiLlama and CoinGecko both failed)":"日度数据暂不可用（DefiLlama、CoinGecko 都没有连上）"):(E?"Waiting for data":"等待数据"))+'</div>';
      return}
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
    // V27.5：精简版——一个主数字、一行小数据、一张图（合计 / USDT / USDC 切换）、一行历史统计
    if(!D.t||D.t.length!==D.u.length)D.t=D.u.map(function(v,i){return v+D.c[i]});
    var cur=D[sel],nowS=sel==="u"?nowU:sel==="c"?nowC:nowU+nowC,v30s=back(cur,nowS,30),im=impact(cur);
    var h12=H&&H.u&&H.c&&fresh?H.u.d+H.c.d:null,hot=H&&fresh?[["USDT",H.u],["USDC",H.c]].filter(function(q){return Math.abs(q[1].d)>=q[1].cap*.003}):[];
    var mini=function(label,v,extra){return '<div><small>'+label+'</small><b class="'+cls(v)+'">'+(isFinite(v)&&v!=null?b$(v,true):"—")+'</b>'+(extra||"")+'</div>'};
    var hotTxt=hot.length?'<em class="stx-hot" style="--c:'+(hot[0][1].d>0?"var(--market-positive)":"var(--market-negative)")+'">'+hot.map(function(q){return q[0]+(q[1].d>0?(E?" mint":" 异动增发"):(E?" burn":" 异动赎回"))}).join(" · ")+'</em>':'';
    var tabs=function(items,cur,attr){return '<div class="stx-seg" role="group">'+items.map(function(x){return '<button type="button" class="'+(x[0]===cur?'on':'')+'" '+attr+'="'+x[0]+'">'+x[1]+'</button>'}).join("")+'</div>'};
    var imTxt=(im.upn||im.dnn)?(E?"After big mints, BTC 30d later ":"大额增发后 30 天 BTC ")+'<b>'+(isFinite(im.up)?pct(im.up):"—")+'</b>'+(E?" · after big redemptions ":" · 大额赎回后 ")+'<b>'+(isFinite(im.dn)?pct(im.dn):"—")+'</b>':"";
    box.innerHTML='<div class="stx-top"><div class="stx-big '+cls(t30)+'"><small>'+(E?"Last 30 days":"近 30 天")+'</small>'+b$(t30,true)+'</div><span class="stx-tag" style="--c:'+tc+'">'+tag.split(" · ")[0]+'</span></div>'
      +'<div class="stx-row">'+mini(E?"12 h":"12 小时",h12,hotTxt)+mini(E?"7 days":"7 天",t7)+mini(E?"90 days":"90 天",t90)+'</div>'
      +(H&&!fresh?'<div class="stx-fresh warn">'+(E?"12-hour data stale by ":"12 小时数据已滞后 ")+fmtAge(age)+'</div>':'')
      +'<div class="stx-tools">'+tabs([["t",E?"Total":"合计"],["u","USDT"],["c","USDC"]],sel,"data-stx-coin")
      +tabs([[90,E?"3M":"3月"],[365,E?"1Y":"1年"],[1095,E?"3Y":"3年"]].filter(function(x){return x[0]<=365||D.days.length>400}),range,"data-stx-range")+'</div>'
      +'<span class="stx-live" id="stxLive_'+sel+'"></span><div class="stx-chart"><canvas id="stxCv_'+sel+'" aria-label="30 天净变化与 BTC 价格"></canvas></div>'
      +'<div class="stx-foot"><span>'+(E?"Cap ":"市值 ")+b$(nowS)+'</span>'+(imTxt?'<span>'+imTxt+'</span>':'')+'</div>';
    draw(sel);
  }
  function init(){
    var box=$("stableX");if(!box)return;
    box.addEventListener("click",function(e){var c=e.target.closest&&e.target.closest("[data-stx-coin]");if(c){sel=c.dataset.stxCoin;hover={t:-1,u:-1,c:-1};render();return}});
    box.addEventListener("click",function(e){var b=e.target.closest&&e.target.closest("[data-stx-range]");if(!b)return;range=+b.dataset.stxRange;hover={t:-1,u:-1,c:-1};render()});
    var pick=function(ev){var cv=ev.target;if(!cv||!cv.id||cv.id.indexOf("stxCv_")!==0||!D)return;var key=cv.id.slice(6),m=maps[key];if(!m)return;var r=cv.getBoundingClientRect(),x=(ev.touches?ev.touches[0].clientX:ev.clientX)-r.left;hover[key]=Math.max(0,Math.min(m.cnt-1,Math.floor((x-m.padL)/m.bw)));draw(key)};
    box.addEventListener("pointermove",pick);box.addEventListener("pointerdown",pick);box.addEventListener("pointerleave",function(){hover={t:-1,u:-1,c:-1};if(D)draw(sel)});
    var started=false,go=function(){if(started)return;started=true;render();load12(false).then(function(){render();return loadDaily(false)}).then(render);setTimeout(render,400)};(window.__warm=window.__warm||{}).stable=go;
    if("IntersectionObserver" in window){var io=new IntersectionObserver(function(es){if(es.some(function(x){return x.isIntersecting})){io.disconnect();go()}},{rootMargin:"600px 0px"});io.observe(box.closest("details")||box)}else go();
    setInterval(function(){if(started&&document.visibilityState==="visible")load12(false).then(render)},5*60*1000);
    document.addEventListener("visibilitychange",function(){if(started&&document.visibilityState==="visible")load12(false).then(render)});
    var rt=0;window.addEventListener("resize",function(){clearTimeout(rt);rt=setTimeout(function(){if(D)draw(sel)},150)},{passive:true});
    if("ResizeObserver" in window){var lastW=0;new ResizeObserver(function(){var w=box.clientWidth;if(w&&w!==lastW){lastW=w;if(D)draw(sel)}}).observe(box)}   // V27.9.1：折叠打开后补画
    window.addEventListener("themechange",function(){if(D)render()});
    render();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();

;/*EXT_SEP*/

(function(){
  "use strict";
  // V27.12：美国现货比特币 ETF 每日净流入 / 流出，单独列出 IBIT（贝莱德）与 FBTC（富达）。
  // 数据：TFTC「The Commoner Bitcoin ETF Tracker」公开文件（CC BY 4.0，需署名），每个交易日收盘后更新一次。
  var URL_LOCAL="./data/etf-flows.json",URL_ALL="https://www.tftc.io/bitcoin-etf-flows/data.json",KEY="btc_etf_flows_v1",TTL=3*3600*1000;
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
    var getSrc=function(u){return fetch(u,{cache:"no-cache",signal:ctl?ctl.signal:undefined}).then(function(r){if(!r.ok)throw new Error(r.status);return r.json()}).then(function(j){var o=pack(j);if(!ok(o))throw new Error("shape");return o})};return getSrc(URL_LOCAL).catch(function(){return getSrc(URL_ALL)}).then(function(o){D=o;failed=false;try{localStorage.setItem(KEY,JSON.stringify(o))}catch(e){}})
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
    var headTxt=G==="d"?lastB.d.slice(5)+(E?" session":" 当日"):G==="w"?(E?"This week, from "+lastB.d.slice(5):"本周 · "+lastB.d.slice(5)+" 起"):(E?lastB.d.slice(0,7):(+lastB.d.slice(5,7))+" 月合计");
    var la=G==="d"?(E?"5d ":"近 5 日 "):G==="w"?(E?"Last wk ":"上周 "):(E?"Last mo ":"上月 "),lb=G==="d"?(E?"1m ":"近 1 月 "):G==="w"?(E?"4 wks ":"近 4 周 "):(E?"3 mos ":"近 3 月 ");
    var tile=function(k,name,sub){var Bk=buckets(D[k],G),m=Bk.length,v=Bk[m-1].v,a=G==="d"?sumB(Bk,5):(m>1?Bk[m-2].v:null),b=sumB(Bk,G==="d"?21:G==="w"?4:3);
      return '<button type="button" class="etf-tile'+(sel===k?' on':'')+'" data-etf-sel="'+k+'"><small>'+name+'<i>'+sub+'</i></small><b class="'+cls(v)+'">'+m$(v,true)+'</b>'
        +'<span>'+la+'<em class="'+cls(a)+'">'+m$(a,true)+'</em></span><span>'+lb+'<em class="'+cls(b)+'">'+m$(b,true)+'</em></span></button>'};
    var sk=streak(cur),unit=G==="d"?(E?" days":" 个交易日"):G==="w"?(E?" weeks":" 周"):(E?" months":" 个月");
    var skTxt=Math.abs(sk)>=2?(E?(Math.abs(sk)+" straight"+unit+" of "+(sk>0?"inflow":"outflow")):("连续 "+Math.abs(sk)+unit+"净"+(sk>0?"流入":"流出"))):"";
    var gtabs='<div class="stx-seg etf-gran" role="group">'+[["d",E?"Day":"日"],["w",E?"Week":"周"],["m",E?"Month":"月"]].map(function(x){return '<button type="button" class="'+(x[0]===G?'on':'')+'" data-etf-gran="'+x[0]+'">'+x[1]+'</button>'}).join("")+'</div>';
    var cum=D.t.reduce(function(a,b){return a+b},0);
    var tabs='<div class="stx-seg" role="group">'+[[91,E?"3M":"近 3 月"],[183,E?"6M":"近 6 月"],[365,E?"1Y":"近 1 年"],[0,E?"All":"全部"]].map(function(x){return '<button type="button" class="'+(x[0]===range?'on':'')+'" data-etf-range="'+x[0]+'">'+x[1]+'</button>'}).join("")+'</div>';
    box.innerHTML='<div class="etf-head"><span>'+headTxt+'</span>'+gtabs+'</div>'
      +'<div class="etf-tiles">'+tile("t",E?"All ETFs":"全部 ETF","")+tile("i","IBIT",E?"BlackRock":"贝莱德")+tile("f","FBTC",E?"Fidelity":"富达")+'</div>'
      +(skTxt?'<div class="etf-streak '+cls(sk)+'">'+skTxt+'</div>':'')+tabs+'<span class="stx-live" id="etfLive"></span>'
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

;/*EXT_SEP*/

(function(){
  "use strict";
  // V27.7：长/短期持有者持仓比率 = lth_supply ÷ sth_supply（Bitview）。1 年 / 3 年按天，全部按月
  var API="https://bitview.space/api/series/bulk",KD="btc_lthsth_d_v1",KM="btc_lthsth_m_v1",TTL=6*3600*1000;
  var Dd=null,Dm=null,range=365,hover=-1,map=null,loadingD=false,loadingM=false,failed=false;
  function $(id){return document.getElementById(id)}
  function en(){return window.BTC_LANG==="en"}
  function css(n,f){var v=getComputedStyle(document.documentElement).getPropertyValue(n).trim();return v||f}
  function readJSON(k){try{return JSON.parse(localStorage.getItem(k))}catch(e){return null}}
  function get(url){return typeof tryFetch==="function"?tryFetch(url,25000):fetch(url).then(function(r){return r.json()})}
  function url(index,start){var u=new URL(API);u.searchParams.set("index",index);u.searchParams.set("series","date,lth_supply,sth_supply,price");u.searchParams.set("start",String(start));return u.toString()}
  function parse(r,dropToday){var d=r[0].data,l=r[1].data,s=r[2].data,p=r[3].data,today=new Date().toISOString().slice(0,10),o={d:[],r:[],p:[]};
    d.forEach(function(x,i){if(dropToday&&x>=today)return;var a=+l[i],b=+s[i];if(!(a>0&&b>0))return;o.d.push(x);o.r.push(a/b);o.p.push(+p[i]||0)});return o}
  function ok(o){return o&&Array.isArray(o.d)&&o.d.length>30&&o.d.length===o.r.length}
  async function loadD(force){var c=readJSON(KD);if(c&&ok(c.data)){Dd=c.data;var ld=Dd.d[Dd.d.length-1],stale=!ld||(Date.now()-Date.parse(ld+"T00:00:00Z"))>2*864e5;if(!force&&!stale&&Date.now()-c.ts<TTL)return}
    if(loadingD)return;loadingD=true;try{var o=parse(await get(url("day1",-1100)),true);if(!ok(o))throw 0;Dd=o;try{localStorage.setItem(KD,JSON.stringify({ts:Date.now(),data:o}))}catch(e){}}catch(e){if(!Dd)failed=true}finally{loadingD=false}}
  async function loadM(){var c=readJSON(KM);if(c&&ok(c.data)){Dm=c.data;if(Date.now()-c.ts<TTL)return}
    if(loadingM)return;loadingM=true;try{var o=parse(await get(url("month1","2011-01-01")),false);if(!ok(o))throw 0;Dm=o;try{localStorage.setItem(KM,JSON.stringify({ts:Date.now(),data:o}))}catch(e){}}catch(e){}finally{loadingM=false}}
  function badge(){var b=$("freshLthRatio");if(!b)return;var t,c;
    if(Dd){var day=Dd.d[Dd.d.length-1],age=(Date.now()-Date.parse(day+"T00:00:00Z"))/864e5;if(age>3){t=(en()?"Stale · ":"滞后 · ")+day.slice(5);c="warn"}else{t=(en()?"Data date · ":"数据日 · ")+day.slice(5);c="good"}}
    else if(loadingD){t=en()?"Syncing":"同步中";c="warn"}else if(failed){t=en()?"Unavailable":"暂不可用";c="bad"}else{t=en()?"Waiting for data":"等待数据";c="warn"}
    b.textContent=t;b.className="fresh-badge "+c}
  function labels(){var E=en(),set=function(id,z,e){var x=$(id);if(x)x.textContent=E?e:z};
    set("lrNowL","当前比率","Current ratio");set("lrPeakL","本轮高点","Cycle high");set("lrOffL","距高点","From high");set("lrLegR","长/短期持仓比率","LTH / STH supply");set("lrLegP","BTC 价格","BTC price");
    document.querySelectorAll("[data-lr-range]").forEach(function(b){var on=+b.dataset.lrRange===range;b.setAttribute("aria-pressed",on?"true":"false");b.classList.toggle("active",on);if(E)b.textContent={365:"1Y",1095:"3Y",0:"All"}[b.dataset.lrRange]})}
  function render(){
    badge();labels();var empty=$("lrEmpty");
    if(!Dd){if(empty){empty.hidden=false;empty.textContent=loadingD?(en()?"Syncing…":"同步中…"):failed?(en()?"Unavailable":"暂不可用"):(en()?"Waiting for data":"等待数据")}return}
    if(empty)empty.hidden=true;
    var n=Dd.r.length,now=Dd.r[n-1],pk=0,pi=n-1;for(var i=Math.max(0,n-500);i<n;i++)if(Dd.r[i]>pk){pk=Dd.r[i];pi=i}
    $("lrNow").textContent=now.toFixed(2);
    $("lrPeak").innerHTML=pk.toFixed(2)+'<small>'+Dd.d[pi]+'</small>';
    var off=now/pk-1,o=$("lrOff");o.textContent=(off>=0?"+":"−")+Math.abs(off*100).toFixed(1)+"%";o.style.color=off<-.001?"var(--market-negative)":"";
    draw();
  }
  function draw(){
    var cv=$("lrCanvas");if(!cv||!Dd)return;var box=cv.parentElement,W=box.clientWidth,H=box.clientHeight;if(!W||!H)return;
    var src=range===0?(Dm||Dd):Dd;if(range===0&&!Dm)loadM().then(function(){if(range===0)draw()});
    var span=range===0?src.d.length:range,s0=Math.max(0,src.d.length-span),d=src.d.slice(s0),r=src.r.slice(s0),p=src.p.slice(s0),cnt=d.length,mon=range===0&&src===Dm;
    var dpr=Math.min(3,window.devicePixelRatio||1);cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);var c=cv.getContext("2d");c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,W,H);
    var padL=34,padR=48,padT=10,padB=22,pw=W-padL-padR,ph=H-padT-padB;
    var rmin=Infinity,rmax=0;r.forEach(function(x){rmin=Math.min(rmin,x);rmax=Math.max(rmax,x)});var pad=(rmax-rmin)*.08||.1;rmin-=pad;rmax+=pad;
    var pmin=Infinity,pmax=0;p.forEach(function(x){if(x>0){pmin=Math.min(pmin,x);pmax=Math.max(pmax,x)}});var lmin=Math.log(pmin*.92),lmax=Math.log(pmax*1.08);
    var X=function(i){return padL+(cnt>1?i/(cnt-1):0)*pw},Y=function(v){return padT+ph-(v-rmin)/(rmax-rmin)*ph},YP=function(v){return padT+ph-(Math.log(v)-lmin)/(lmax-lmin)*ph};
    var FONT=css("--font-sans","-apple-system,system-ui,sans-serif"),tx3=css("--text-tertiary","#888"),grid=css("--border-subtle","rgba(0,0,0,.08)"),brand=css("--brand","#f7931a");
    c.font="10px "+FONT;c.fillStyle=tx3;c.strokeStyle=grid;c.lineWidth=1;c.textAlign="right";c.textBaseline="middle";
    for(var g=0;g<=3;g++){var v=rmin+(rmax-rmin)*g/3,y=Math.round(Y(v))+.5;c.beginPath();c.moveTo(padL,y);c.lineTo(padL+pw,y);c.stroke();c.fillText(v.toFixed(1),padL-5,y)}
    c.textAlign="left";if(pmax>0){[pmin,Math.sqrt(pmin*pmax),pmax].forEach(function(x){c.fillText(x>=1e3?"$"+Math.round(x/1e3)+"K":"$"+Math.round(x),padL+pw+5,YP(x))})}
    c.textAlign="center";c.textBaseline="alphabetic";var last=-99,MN=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],yearly=range!==365;
    for(var i2=0;i2<cnt;i2++){var dd=d[i2];if(mon?dd.slice(5,7)!=="01":(yearly?dd.slice(5)!=="01-01":dd.slice(8)!=="01"))continue;var xx=X(i2);if(xx-last<40)continue;last=xx;
      c.fillText(yearly?dd.slice(0,4):(en()?MN[+dd.slice(5,7)-1]:(+dd.slice(5,7))+"月"),xx,H-6)}
    c.strokeStyle=css("--text-secondary","#555");c.globalAlpha=.65;c.lineWidth=1.3;c.lineJoin="round";c.beginPath();var st=false;
    for(i2=0;i2<cnt;i2++){if(!(p[i2]>0))continue;var py=YP(p[i2]);if(!st){c.moveTo(X(i2),py);st=true}else c.lineTo(X(i2),py)}c.stroke();c.globalAlpha=1;
    c.strokeStyle=brand;c.lineWidth=1.8;c.beginPath();for(i2=0;i2<cnt;i2++){var yy=Y(r[i2]);if(i2)c.lineTo(X(i2),yy);else c.moveTo(X(i2),yy)}c.stroke();
    var lv=$("lrLive");
    if(hover>=0&&hover<cnt){var hx=X(hover);c.strokeStyle=tx3;c.lineWidth=1;c.beginPath();c.moveTo(hx+.5,padT);c.lineTo(hx+.5,padT+ph);c.stroke();c.fillStyle=brand;c.beginPath();c.arc(hx,Y(r[hover]),3.5,0,Math.PI*2);c.fill();
      if(lv)lv.textContent=(mon?d[hover].slice(0,7):d[hover])+(en()?" · ratio ":" · 比率 ")+r[hover].toFixed(2)+" · $"+Math.round(p[hover]).toLocaleString("en-US")}
    else if(lv)lv.textContent="";
    map={padL:padL,pw:pw,cnt:cnt};
  }
  function init(){
    var sec=$("lthRatio");if(!sec)return;
    sec.addEventListener("click",function(e){var b=e.target.closest&&e.target.closest("[data-lr-range]");if(!b)return;range=+b.dataset.lrRange;hover=-1;render()});
    var cv=$("lrCanvas"),pick=function(ev){if(!Dd||!map)return;var rc=cv.getBoundingClientRect(),x=(ev.touches?ev.touches[0].clientX:ev.clientX)-rc.left;hover=Math.max(0,Math.min(map.cnt-1,Math.round((x-map.padL)/map.pw*(map.cnt-1))));draw()};
    cv.addEventListener("pointermove",pick);cv.addEventListener("pointerdown",pick);cv.addEventListener("pointerleave",function(){hover=-1;draw()});cv.addEventListener("touchend",function(){hover=-1;draw()},{passive:true});
    var started=false,go=function(){if(started)return;started=true;render();loadD(false).then(render)};(window.__warm=window.__warm||{}).lthRatio=go;
    if("IntersectionObserver" in window){var io=new IntersectionObserver(function(es){if(es.some(function(x){return x.isIntersecting})){io.disconnect();go()}},{rootMargin:"600px 0px"});io.observe(sec.closest("details")||sec)}else go();
    var rt=0;window.addEventListener("resize",function(){clearTimeout(rt);rt=setTimeout(function(){if(Dd)draw()},150)},{passive:true});
    window.addEventListener("themechange",function(){if(Dd)render()});
    if("ResizeObserver" in window)new ResizeObserver(function(){if(Dd)draw()}).observe(cv.parentElement);
    var rb=$("lthRatioRefreshBtn");
    if(rb)rb.addEventListener("click",function(){
      if(loadingD||loadingM)return;
      rb.disabled=true;rb.textContent=en()?"Syncing…":"更新中";
      try{localStorage.removeItem(KD);localStorage.removeItem(KM)}catch(e){}
      var b=window.__sgNet&&window.__sgNet.bust?window.__sgNet.bust("lth_supply,sth_supply"):Promise.resolve();
      b.then(function(){return Promise.all([loadD(true),range===0?loadM():Promise.resolve()])}).then(render).finally(function(){rb.disabled=false;rb.textContent=en()?"Refresh":"更新"});
    });
    document.addEventListener("visibilitychange",function(){if(started&&document.visibilityState==="visible")loadD(false).then(render)});
    render();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();

;/*EXT_SEP*/

(function(){
  "use strict";
  // V27.9：Bitview 同步状态（/api/server/sync）——它算到第几个区块、落后几块、最后一次更新时间。
  // 显示在数据健康中心；Bitview 停更或落后时第一时间看得到。每 10 分钟检查一次（页面可见时）。
  function load(){
    var f=typeof tryFetch==="function"?tryFetch("https://bitview.space/api/server/sync",8000):fetch("https://bitview.space/api/server/sync").then(function(r){return r.json()});
    return f.then(function(j){
      if(!j||!(+j.indexed_height>0))throw new Error("sync");
      window.__bvSync={height:+(j.computed_height||j.indexed_height),tip:+j.tip_height,behind:Math.max(0,+j.blocks_behind||0),ts:+j.last_indexed_at_unix||Date.parse(j.last_indexed_at)/1000||null,at:Date.now()};
    }).catch(function(){window.__bvSync={err:1,at:Date.now()}}).then(function(){if(typeof renderHealthRuntime==="function")try{renderHealthRuntime()}catch(e){}});
  }
  function start(){load();setInterval(function(){if(document.visibilityState==="visible")load()},10*60*1000)}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",function(){setTimeout(start,1500)});else setTimeout(start,1500);
})();

;/*EXT_SEP*/

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
    try{var c=JSON.parse(localStorage.getItem(KEY));if(c&&c.D&&c.D.v===2&&c.L){D=c.D;L=c.L;if(Date.now()-c.ts<TTL){render();return}}}catch(e){}
    if(loading)return;loading=true;render();
    try{
      // 全网最便宜的约四分之一的币成本接近 0（早期币），带到图上会把纵轴拉到 $2；所以图上画第 25–75、40–60 分位
      var r=await get(url(["price",nm(25),nm(40),nm(50),nm(60),nm(75)],-1100)),days=r[0].data,col=function(k){return r[k].data.map(function(x){return x==null?null:+x})};
      var d={v:2,d:days,p:col(1),b25:col(2),b40:col(3),b50:col(4),b60:col(5),b75:col(6)};
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
    set("cbL80","中间 50% 的币","Middle 50%");set("cbL50","中间 20% 的币","Middle 20%");set("cbLmed","中位成本","Median cost");set("cbLpx","价格","Price");
    document.querySelectorAll("[data-cb-range]").forEach(function(b){var on=+b.dataset.cbRange===range;b.setAttribute("aria-pressed",on?"true":"false");b.classList.toggle("active",on);if(E)b.textContent=b.dataset.cbRange==="365"?"1Y":"3Y"});
    var em=$("cbEmpty");if(!D||!L){if(em){em.hidden=false;em.textContent=loading?(E?"Syncing…":"同步中…"):failed?(E?"Unavailable":"暂不可用"):(E?"Waiting for data":"等待数据")}return}
    if(em)em.hidden=true;
    var px=spot(),pc=pctOf(px),med=L.v[9];
    var k2=function(v){return !(v>0)?"--":v>=1e4?"$"+Math.round(v/1e3)+"K":v>=1e3?"$"+(v/1e3).toFixed(1)+"K":"$"+Math.round(v)};
    $("cbPos").innerHTML=pc==null?"--":pc+'%<small class="cb-sub">'+(E?"of coins' cost":"的持币成本")+'</small>';
    $("cbMed").innerHTML=k2(med)+(px>0&&med>0?'<small class="cb-sub">'+(E?"price "+((px/med-1)>=0?"+":"−"):((px/med-1)>=0?"现价高 ":"现价低 "))+Math.abs((px/med-1)*100).toFixed(0)+"%"+'</small>':"");
    $("cbMid").innerHTML=k2(L.v[4])+"–"+k2(L.v[14]).replace("$","")+'<small class="cb-sub">'+(E?"25th–75th pct":"第 25–75 分位")+'</small>';
    draw();
  }
  function draw(){
    var cv=$("cbCanvas");if(!cv||!D)return;var box=cv.parentElement,W=box.clientWidth,H=box.clientHeight;if(!W||!H)return;
    var n=D.d.length,s0=Math.max(0,n-range),idx=[];for(var i=s0;i<n;i++)idx.push(i);var cnt=idx.length;
    var dpr=Math.min(3,window.devicePixelRatio||1);cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);var c=cv.getContext("2d");c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,W,H);
    var padL=44,padR=10,padT=8,padB=20,pw=W-padL-padR,ph=H-padT-padB,lo=Infinity,hi=0;
    idx.forEach(function(k){[D.p[k],D.b25[k],D.b75[k]].forEach(function(v){if(v>0){lo=Math.min(lo,v);hi=Math.max(hi,v)}})});lo*=.85;hi*=1.08;
    var X=function(q){return padL+(cnt>1?q/(cnt-1):0)*pw},Y=function(v){return padT+ph-(Math.log(v)-Math.log(lo))/(Math.log(hi)-Math.log(lo))*ph};
    var FONT=css("--font-sans","-apple-system,system-ui,sans-serif"),tx3=css("--text-tertiary","#888"),grid=css("--border-subtle","rgba(0,0,0,.08)"),brand=css("--brand","#f7931a"),ink=css("--text-primary","#111");
    c.font="10px "+FONT;c.fillStyle=tx3;c.strokeStyle=grid;c.lineWidth=1;c.textAlign="right";c.textBaseline="middle";
    for(var g=0;g<=3;g++){var v=Math.exp(Math.log(lo)+(Math.log(hi)-Math.log(lo))*g/3),y=Math.round(Y(v))+.5;c.beginPath();c.moveTo(padL,y);c.lineTo(padL+pw,y);c.stroke();c.fillText(usd(v),padL-5,y)}
    c.textAlign="center";c.textBaseline="alphabetic";var last=-99,MN=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],yr=range>400;
    idx.forEach(function(k,q){var dd=D.d[k];if(yr?dd.slice(5)!=="01-01":dd.slice(8)!=="01")return;var xx=X(q);if(xx-last<40)return;last=xx;c.fillText(yr?dd.slice(0,4):(en()?MN[+dd.slice(5,7)-1]:(+dd.slice(5,7))+"月"),xx,H-5)});
    var band=function(a,b,alpha){c.beginPath();var st=false;idx.forEach(function(k,q){var v=D[a][k];if(!(v>0))return;if(!st){c.moveTo(X(q),Y(v));st=true}else c.lineTo(X(q),Y(v))});
      for(var q=cnt-1;q>=0;q--){var v2=D[b][idx[q]];if(v2>0)c.lineTo(X(q),Y(v2))}c.closePath();c.globalAlpha=alpha;c.fillStyle=brand;c.fill();c.globalAlpha=1};
    band("b75","b25",.16);band("b60","b40",.34);
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
    // V27.9.1：数据常在折叠还没打开时就读完了（那时图表宽度为 0 画不出来），打开后尺寸变化再画一次
    if("ResizeObserver" in window)new ResizeObserver(function(){if(D)draw()}).observe(cv.parentElement);
    var rb=$("lthCohortRefreshBtn");
    if(rb)rb.addEventListener("click",function(){
      if(loading)return;
      rb.disabled=true;rb.textContent=en()?"Syncing…":"更新中";
      try{localStorage.removeItem(KEY)}catch(e){}
      var b=window.__sgNet&&window.__sgNet.bust?window.__sgNet.bust("age_under_6m_realized_cap"):Promise.resolve();
      b.then(function(){return load(true)}).finally(function(){rb.disabled=false;rb.textContent=en()?"Refresh":"更新"});
    });
    var started=false,go=function(){if(started)return;started=true;load(false)};(window.__warm=window.__warm||{})[sec.id]=go;
    if("IntersectionObserver" in window){var io=new IntersectionObserver(function(es){if(es.some(function(x){return x.isIntersecting})){io.disconnect();go()}},{rootMargin:"600px 0px"});io.observe(sec.closest("details")||sec)}else go();
    window.addEventListener("resize",function(){if(D)draw()},{passive:true});window.addEventListener("themechange",function(){if(D)render()});
    setInterval(function(){if(D&&document.visibilityState==="visible")render()},60000);
    render();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();

;/*EXT_SEP*/

(function(){
  "use strict";
  // V27.9：各币龄的持币成本——按持有时间分 6 组：持币量、平均成本（实现市值 ÷ 持币量）、盈利占比；点一组看它的成本分布（URPD）
  var KEY="btc_age_cost_v1",TTL=6*3600*1000,API="https://bitview.space/api/series/bulk";
  var G=[
    {k:"m1",zh:"1 个月内",en:"< 1 month",b:["under_1h","1h_to_1d","1d_to_1w","1w_to_1m"]},
    {k:"m6",zh:"1–6 个月",en:"1–6 months",b:["1m_to_2m","2m_to_3m","3m_to_4m","4m_to_5m","5m_to_6m"]},
    {k:"y1",zh:"6–12 个月",en:"6–12 months",b:["6m_to_9m","9m_to_1y"]},
    {k:"y2",zh:"1–2 年",en:"1–2 years",b:["1y_to_18m","18m_to_2y"]},
    {k:"y5",zh:"2–5 年",en:"2–5 years",b:["2y_to_3y","3y_to_4y","4y_to_5y"]},
    {k:"old",zh:"5 年以上",en:"5+ years",b:["5y_to_6y","6y_to_7y","7y_to_8y","8y_to_10y","10y_to_12y","12y_to_15y","over_15y"]}
  ];
  var BANDS=[].concat.apply([],G.map(function(g){return g.b}));
  var D=null,sel="m6",dist={},hover=-1,map=null,loading=false,failed=false;
  function $(id){return document.getElementById(id)}
  function en(){return window.BTC_LANG==="en"}
  function css(n,f){var v=getComputedStyle(document.documentElement).getPropertyValue(n).trim();return v||f}
  function get(u){return typeof tryFetch==="function"?tryFetch(u,25000):fetch(u).then(function(r){return r.json()})}
  function usd(v){return !(v>0)?"--":v>=1e3?"$"+(v/1e3).toFixed(v>=1e5?0:1)+"K":"$"+Math.round(v)}
  function btc(v){return !(v>=0)?"--":en()?(v>=1e6?(v/1e6).toFixed(2)+"M":v>=1e3?(v/1e3).toFixed(0)+"K":Math.round(v)):(v>=1e4?(v/1e4).toFixed(v>=1e6?0:1)+"万":Math.round(v).toLocaleString("en-US"))}
  async function cols(suffix){var u=new URL(API);u.searchParams.set("index","day1");u.searchParams.set("series",["date"].concat(BANDS.map(function(b){return "age_"+b+"_"+suffix})).join(","));u.searchParams.set("start","-1");
    var r=await get(u.toString()),o={day:r[0].data[r[0].data.length-1]};BANDS.forEach(function(b,i){var a=r[i+1].data;o[b]=+a[a.length-1]});return o}
  async function load(){
    try{var c=JSON.parse(localStorage.getItem(KEY));if(c&&c.D){D=c.D;if(Date.now()-c.ts<TTL){render();return}}}catch(e){}
    if(loading)return;loading=true;render();
    try{var s=await cols("supply"),rc=await cols("realized_cap"),pf=await cols("supply_in_profit");
      var rows=G.map(function(g){var sp=0,cap=0,pr=0;g.b.forEach(function(b){sp+=s[b]||0;cap+=rc[b]||0;pr+=pf[b]||0});return {k:g.k,supply:sp,avg:sp>0?cap/sp:null,profit:sp>0?pr/sp:null}});
      var tot=rows.reduce(function(a,r){return a+r.supply},0);if(!(tot>15e6&&tot<22e6))throw 0;
      D={day:s.day,rows:rows};failed=false;try{localStorage.setItem(KEY,JSON.stringify({ts:Date.now(),D:D}))}catch(e){}
    }catch(e){if(!D)failed=true}
    finally{loading=false;render();if(shown())loadDist(sel)}   // V27.11：模块还没显示（首页后台预读）时不取成本分布，显示出来再取
  }
  async function urpd(band){
    // 新版队列名 age_*；旧版 utxos_*_old
    var tries=["age_"+band,"utxos_"+band+"_old"];
    for(var i=0;i<tries.length;i++){try{var j=await get("https://bitview.space/api/urpd/"+tries[i]+"?agg=lin1000");if(j&&j.buckets)return j}catch(e){}}
    throw new Error("urpd "+band);
  }
  function shown(){var c=$("acCanvas");return !!(c&&c.parentElement&&c.parentElement.clientWidth>0)}
  async function loadDist(k){
    if(dist[k])return draw();var g=G.find(function(x){return x.k===k});if(!g)return;
    var em=$("acEmpty");if(em){em.hidden=false;em.textContent=en()?"Syncing…":"同步中…"}
    try{var parts=await Promise.all(g.b.map(urpd)),acc={},close=0;
      parts.forEach(function(j){close=+j.close||close;(j.buckets||[]).forEach(function(r){var f=Math.round(+r.price_floor);acc[f]=(acc[f]||0)+(+r.supply||0)})});
      var keys=Object.keys(acc).map(Number).sort(function(a,b){return a-b});dist[k]={x:keys,y:keys.map(function(x){return acc[x]}),close:close};
      if(em)em.hidden=true;
    }catch(e){if(em){em.hidden=false;em.textContent=en()?"Unavailable":"暂不可用"}}
    draw();
  }
  function badge(){var b=$("freshAgeCost");if(!b)return;var t,c;
    if(D&&D.day){var age=(Date.now()-Date.parse(D.day+"T00:00:00Z"))/864e5;t=(age>3?(en()?"Stale · ":"滞后 · "):(en()?"Data date · ":"数据日 · "))+D.day.slice(5);c=age>3?"warn":"good"}
    else if(loading){t=en()?"Syncing":"同步中";c="warn"}else if(failed){t=en()?"Unavailable":"暂不可用";c="bad"}else{t=en()?"Waiting for data":"等待数据";c="warn"}
    b.textContent=t;b.className="fresh-badge "+c}
  function render(){
    badge();var E=en(),box=$("acTable");if(!box)return;
    if(!D){box.innerHTML='<div class="hd-empty">'+(loading?(E?"Syncing…":"同步中…"):failed?(E?"Unavailable":"暂不可用"):(E?"Waiting for data":"等待数据"))+'</div>';$("acDetail").hidden=true;return}
    var px=(typeof S!=="undefined"&&S&&S.price>0)?S.price:null,tot=D.rows.reduce(function(a,r){return a+r.supply},0);
    box.innerHTML='<div class="ac-row ac-head"><span>'+(E?"Held for":"持有时间")+'</span><span>'+(E?"Coins":"持币量")+'</span><span>'+(E?"Avg cost":"平均成本")+'</span><span>'+(E?"In profit":"盈利占比")+'</span></div>'
      +D.rows.map(function(r,i){var g=G[i],gap=px&&r.avg?px/r.avg-1:null;
        return '<button type="button" class="ac-row'+(r.k===sel?' on':'')+'" data-ac="'+r.k+'"><b>'+(E?g.en:g.zh)+'</b><span>'+btc(r.supply)+'<em>'+(tot>0?(r.supply/tot*100).toFixed(1)+"%":"")+'</em></span><span>'+usd(r.avg)+(gap==null?'':'<em class="'+(gap>=0?'up':'dn')+'">'+(E?"price ":"现价 ")+(gap>=0?"+":"−")+Math.abs(gap*100).toFixed(0)+'%</em>')+'</span><span class="'+(r.profit>=.5?'up':'dn')+'">'+(r.profit==null?"--":Math.round(r.profit*100)+"%")+'</span></button>'}).join("");
    $("acDetail").hidden=false;draw();
  }
  function draw(){
    var g=G.find(function(x){return x.k===sel}),r=D&&D.rows.find(function(x){return x.k===sel}),E=en();if(!g||!r)return;
    $("acDetName").textContent=(E?g.en:g.zh)+(E?" · cost distribution":" · 成本分布");
    $("acDetSub").textContent=(E?"avg cost ":"平均成本 ")+usd(r.avg)+(r.profit==null?"":(E?" · ":" · ")+Math.round(r.profit*100)+(E?"% in profit":"% 盈利"));
    var cv=$("acCanvas"),d=dist[sel];if(!cv)return;var box=cv.parentElement,W=box.clientWidth,H=box.clientHeight;if(!W||!H)return;
    var dpr=Math.min(3,window.devicePixelRatio||1);cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);var c=cv.getContext("2d");c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,W,H);if(!d)return;
    var px=(typeof S!=="undefined"&&S&&S.price>0)?S.price:d.close,xmax=Math.max(px*1.6,d.x.filter(function(x,i){return d.y[i]>0}).slice(-1)[0]||0);xmax=Math.min(xmax,Math.max(px*2.2,130000));
    var pts=d.x.map(function(x,i){return [x,d.y[i]]}).filter(function(p){return p[0]<=xmax}),ymax=0;pts.forEach(function(p){ymax=Math.max(ymax,p[1])});ymax=ymax*1.1||1;
    var padL=40,padR=8,padT=8,padB=20,pw=W-padL-padR,ph=H-padT-padB,X=function(v){return padL+v/xmax*pw},Y=function(v){return padT+ph-v/ymax*ph};
    var FONT=css("--font-sans","-apple-system,system-ui,sans-serif"),tx3=css("--text-tertiary","#888"),grid=css("--border-subtle","rgba(0,0,0,.08)"),up=css("--market-positive","#18a058"),dn=css("--market-negative","#e5484d"),ink=css("--text-primary","#111");
    c.font="10px "+FONT;c.fillStyle=tx3;c.strokeStyle=grid;c.lineWidth=1;c.textAlign="right";c.textBaseline="middle";
    for(var q=0;q<=2;q++){var vv=ymax/1.1*q/2,yy=Math.round(Y(vv))+.5;c.beginPath();c.moveTo(padL,yy);c.lineTo(padL+pw,yy);c.stroke();c.fillText(btc(vv),padL-5,yy)}
    c.textAlign="center";c.textBaseline="alphabetic";var stp=xmax>150000?50000:xmax>60000?20000:10000;for(var t=0;t<=xmax;t+=stp)c.fillText(usd(t)==="--"?"$0":usd(t),X(t),H-5);
    var bw=Math.max(1,pw/(xmax/1000)-.6);pts.forEach(function(p,i){c.fillStyle=p[0]+500<px?up:dn;c.globalAlpha=hover===i?1:.75;c.fillRect(X(p[0]),Y(p[1]),bw,padT+ph-Y(p[1]))});c.globalAlpha=1;
    var xp=X(px);c.strokeStyle=ink;c.setLineDash([4,3]);c.beginPath();c.moveTo(xp+.5,padT);c.lineTo(xp+.5,padT+ph);c.stroke();c.setLineDash([]);c.fillStyle=ink;c.textAlign=xp>W-60?"right":"left";c.fillText((E?"price ":"现价 ")+usd(px),xp+(xp>W-60?-4:4),padT+9);
    var lv=$("acLive");if(lv)lv.textContent=hover>=0&&pts[hover]?usd(pts[hover][0])+"–"+usd(pts[hover][0]+1000)+" · "+btc(pts[hover][1])+" BTC":"";
    map={pts:pts,X:X,xmax:xmax,padL:padL,pw:pw};
  }
  function init(){
    var sec=$("ageCost");if(!sec)return;
    sec.addEventListener("click",function(e){var b=e.target.closest&&e.target.closest("[data-ac]");if(!b)return;sel=b.dataset.ac;hover=-1;render();loadDist(sel)});
    var cv=$("acCanvas"),pick=function(ev){if(!map)return;var r=cv.getBoundingClientRect(),x=(ev.touches?ev.touches[0].clientX:ev.clientX)-r.left,v=(x-map.padL)/map.pw*map.xmax,best=-1,bd=Infinity;map.pts.forEach(function(p,i){var dd=Math.abs(p[0]+500-v);if(dd<bd){bd=dd;best=i}});hover=best;draw()};
    cv.addEventListener("pointermove",pick);cv.addEventListener("pointerdown",pick);cv.addEventListener("pointerleave",function(){hover=-1;draw()});
    if("ResizeObserver" in window)new ResizeObserver(function(){if(!D)return;if(!dist[sel]&&shown())loadDist(sel);else draw()}).observe(cv.parentElement);   // V27.9.1：折叠打开后补画；V27.11：这时才取成本分布
    var started=false,go=function(){if(started)return;started=true;load()};(window.__warm=window.__warm||{})[sec.id]=go;
    if("IntersectionObserver" in window){var io=new IntersectionObserver(function(es){if(es.some(function(x){return x.isIntersecting})){io.disconnect();go()}},{rootMargin:"600px 0px"});io.observe(sec.closest("details")||sec)}else go();
    window.addEventListener("resize",function(){if(D)draw()},{passive:true});window.addEventListener("themechange",function(){if(D)render()});
    setInterval(function(){if(D&&document.visibilityState==="visible")render()},60000);
    render();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();

;/*EXT_SEP*/

(function(){
  "use strict";
  // V27.11：Bitview 稀有度总等级（rarity_meter_level：0 = 正常；负数 = 罕见低位，如 2022-06 为 −4；正数 = 罕见高位）
  function load(){
    var u="https://bitview.space/api/series/bulk?index=day1&series=date,rarity_meter_level,rarity_meter_score&start=-3";
    (typeof tryFetch==="function"?tryFetch(u,12000):fetch(u).then(function(r){return r.json()})).then(function(r){
      var d=r[0].data,l=r[1].data,i=d.length-1;while(i>0&&l[i]==null)i--;
      window.__rarity={day:d[i],level:+l[i]||0,score:+r[2].data[i]||0};
      if(typeof renderBitviewOverview==="function")try{renderBitviewOverview()}catch(e){}
    }).catch(function(){});
  }
  setTimeout(load,5000);setInterval(function(){if(document.visibilityState==="visible")load()},6*3600*1000);
})();

;/*EXT_SEP*/

(function(){
  "use strict";
  // V27.11：周期时钟——减半后第几天；历史顶部窗口（减半后 526–548 天：2017、2021、2025 三轮）与底部窗口（777–924 天）
  var HALVINGS=[["2012-11-28",210000],["2016-07-09",420000],["2020-05-11",630000],["2024-04-20",840000]],NEXT_H=1050000,TOP=[526,548],BOT=[777,924],SPAN=1460;
  function $(id){return document.getElementById(id)}
  function en(){return window.BTC_LANG==="en"}
  function days(a,b){return Math.floor((b-Date.parse(a+"T00:00:00Z"))/864e5)}
  function ensure(){
    var c=$("cycleClock");if(c)return c;var host=$("radar");if(!host)return null;
    c=document.createElement("section");c.className="sec cclock";c.id="cycleClock";c.setAttribute("aria-label","周期时钟");
    c.innerHTML='<div class="module-head"><div class="module-title-row"><h2 class="sec-title" id="ccTitle">周期时钟</h2></div></div>'
      +'<div class="cc-big"><b id="ccDay">--</b><span id="ccSub"></span></div>'
      +'<div class="cc-bar" id="ccBar"><i class="cc-top"></i><i class="cc-bot"></i><i class="cc-now" id="ccNow"></i></div>'
      +'<div class="cc-ticks"><span>0</span><span id="ccT1">1年</span><span id="ccT2">2年</span><span id="ccT3">3年</span><span id="ccT4">4年</span></div>'
      +'<div class="cc-legend"><span class="k-top"><i></i><em id="ccLt">顶部窗口</em></span><span class="k-bot"><i></i><em id="ccLb">底部窗口</em></span><span class="k-now"><i></i><em id="ccLn">今天</em></span></div>'
      +'<div class="cc-rows" id="ccRows"></div>';
    host.insertAdjacentElement("afterend",c);
    var top=c.querySelector(".cc-top"),bot=c.querySelector(".cc-bot");
    top.style.left=(TOP[0]/SPAN*100)+"%";top.style.width=((TOP[1]-TOP[0])/SPAN*100)+"%";
    bot.style.left=(BOT[0]/SPAN*100)+"%";bot.style.width=((BOT[1]-BOT[0])/SPAN*100)+"%";
    return c;
  }
  function paint(){
    var c=ensure();if(!c)return;var E=en(),h=HALVINGS[HALVINGS.length-1],now=Date.now(),d=days(h[0],now);
    $("ccTitle").textContent=E?"Cycle clock":"周期时钟";
    $("ccDay").textContent=E?"Day "+d+" after the halving":"减半后第 "+d+" 天";
    var st=d<TOP[0]?(E?(TOP[0]-d)+" days to the historical top window":"距历史顶部窗口还有 "+(TOP[0]-d)+" 天")
      :d<=TOP[1]?(E?"Inside the historical top window":"正处在历史顶部窗口")
      :d<BOT[0]?(E?(BOT[0]-d)+" days to the historical bottom window":"距历史底部窗口还有 "+(BOT[0]-d)+" 天")
      :d<=BOT[1]?(E?"Inside the historical bottom window ("+(BOT[1]-d)+" days left)":"正处在历史底部窗口（还剩 "+(BOT[1]-d)+" 天）")
      :(E?"Past the historical bottom window":"已过历史底部窗口");
    $("ccSub").textContent=st;
    $("ccNow").style.left=Math.min(100,d/SPAN*100)+"%";
    [["ccT1","1年","1y"],["ccT2","2年","2y"],["ccT3","3年","3y"],["ccT4","4年","4y"],["ccLt","顶部窗口","Top window"],["ccLb","底部窗口","Bottom window"],["ccLn","今天","Today"]].forEach(function(x){var e=$(x[0]);if(e)e.textContent=E?x[2]:x[1]});
    // 下次减半：有 Bitview 区块高度就按「剩余区块 × 10 分钟」估，否则按 4 年估
    var hgt=window.__bvSync&&window.__bvSync.height>0?window.__bvSync.height:null,eta=hgt?now+(NEXT_H-hgt)*600000:Date.parse(h[0]+"T00:00:00Z")+1461*864e5,left=Math.max(0,Math.round((eta-now)/864e5));
    var etaS=new Date(eta).toISOString().slice(0,7);
    var rows=[[E?"Past tops (2017 / 21 / 25)":"历次顶部（2017 / 21 / 25）",E?"day 526 / 548 / 534":"第 526 / 548 / 534 天"],
      [E?"Past lows (2018 / 22 / 26)":"历次低点（2018 / 22 / 26）",E?"day 889 / 924 / 801":"第 889 / 924 / 801 天"],
      [E?"Next halving":"下次减半",(E?"about ":"约 ")+etaS+(E?" · in "+left+" days":" · 还剩 "+left+" 天")+(hgt?(E?" (by block height)":"（按区块高度估算）"):"")],
      (function(){var a=eta+TOP[0]*864e5,b2=eta+TOP[1]*864e5,inNow=d>=TOP[0]&&d<=TOP[1],l2=Math.max(0,Math.round((a-now)/864e5));
        return [E?"Next top window":"下一个顶部窗口",inNow?(E?"now":"正处在窗口内"):(new Date(a).toISOString().slice(0,7)+(E?" to ":" 至 ")+new Date(b2).toISOString().slice(0,7)+(E?" · in "+l2+" days":" · 还有 "+l2+" 天"))]})()];
    $("ccRows").innerHTML=rows.map(function(r){return '<div class="cc-row"><span>'+r[0]+'</span><b>'+r[1]+'</b></div>'}).join("");
  }
  function start(){paint();setInterval(paint,60000)}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",function(){setTimeout(start,800)});else setTimeout(start,800);
})();

;/*EXT_SEP*/

(function(){
  "use strict";
  // V27.3 正式版.3：所有「数据日」标签统一写法——正常只写日期「11-05」，滞后「滞后 · 11-01」，月度数据「11 月」
  function norm(t){
    var m;
    if((m=/^(?:数据日|Data date) · (\d{4})-(\d{2})-(\d{2})$/.exec(t)))return m[2]+"-"+m[3];
    if((m=/^(?:数据日|Data date) · (\d{2})-(\d{2})$/.exec(t)))return m[1]+"-"+m[2];
    if((m=/^(?:数据日|Data date) · (\d{4})-(\d{2})$/.exec(t)))return window.BTC_LANG==="en"?["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+m[2]-1]:(+m[2])+" 月";
    if((m=/^(滞后|Stale) · \d{4}-(\d{2})-(\d{2})$/.exec(t)))return m[1]+" · "+m[2]+"-"+m[3];
    if((m=/^(滞后|Stale) · \d{4}-(\d{2})$/.exec(t)))return m[1]+" · "+(window.BTC_LANG==="en"?["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+m[2]-1]:(+m[2])+" 月");
    return null;
  }
  // V27.3 正式版.4：只在异常时显示——正常的日期标 is-ok（折叠栏里隐藏，模块里变成淡灰小字）；读取中的标 is-wait（打开后前 15 秒不显示）
  var WAIT=/^(等待数据|同步中|链上同步中|检查中|正在读取|Syncing|Waiting for data|Loading)/;
  function fix(el){if(!el||!el.classList||!el.classList.contains("fresh-badge"))return;var t=(el.textContent||"").trim(),n=norm(t);if(n&&n!==t){el.textContent=n;t=n}
    var ok=/^(\d{2}-\d{2}|\d{1,2} 月|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|刚刚|更新 · 刚刚)$/.test(t)||el.classList.contains("good")&&!/滞后|Stale|不可用|Unavailable/.test(t);
    if(el.classList.contains("is-ok")!==ok)el.classList.toggle("is-ok",ok);
    var w=WAIT.test(t);if(el.classList.contains("is-wait")!==w)el.classList.toggle("is-wait",w)}
  function sweep(){document.querySelectorAll(".fresh-badge").forEach(fix)}
  function start(){
    document.documentElement.classList.add("sg-quiet");setTimeout(function(){document.documentElement.classList.remove("sg-quiet")},15000);
    sweep();
    if(!("MutationObserver" in window))return setInterval(sweep,3000);
    // V27.4：页面上的变化（比如每秒刷新的价格）攒到下一帧统一处理一次，不再每个变化都检查
    var pending=false;
    new MutationObserver(function(){if(pending)return;pending=true;requestAnimationFrame(function(){pending=false;sweep()})})
      .observe(document.body,{subtree:true,childList:true,characterData:true});
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);else start();
})();

;/*EXT_SEP*/

(function(){
  "use strict";
  // V27.7：长期持有者分组成本——各持有时间段的平均成本（实现市值 ÷ 持币量），Bitview 周度数据
  //   ≤10 年 = 全部 − 10 年以上；6 月–10 年 = ≤10 年 − 6 个月以内；6 月–7 年 = 6 月–10 年 − (7–8 年 + 8–10 年)；6 月–5 年 = 6 月–7 年 − (5–6 年 + 6–7 年)
  var KEY="btc_lth_cohort_v1",TTL=12*3600*1000,API="https://bitview.space/api/series/bulk";
  var B=["5y_to_6y","6y_to_7y","7y_to_8y","8y_to_10y","10y_to_12y","12y_to_15y","over_15y"];
  var LINES=[{k:"l10",zh:"≤10 年",en:"≤10y",c:"var(--text-primary)"},{k:"a5",zh:"6 月–5 年",en:"6m–5y",c:"#e8890c"},{k:"a7",zh:"6 月–7 年",en:"6m–7y",c:"#4466ee"},{k:"a10",zh:"6 月–10 年",en:"6m–10y",c:"#12a170"}];
  var D=null,range=0,hover=-1,map=null,loading=false,failed=false,off={};
  function $(id){return document.getElementById(id)}
  function en(){return window.BTC_LANG==="en"}
  function css(n,f){var v=getComputedStyle(document.documentElement).getPropertyValue(n).trim();return v||f}
  function col(c){return c.indexOf("var(")===0?css(c.slice(4,-1),"#111"):c}
  function usd(v){return !(v>0)?"—":v>=1e4?"$"+(v/1e3).toFixed(1)+"K":v>=1e3?"$"+(v/1e3).toFixed(2)+"K":"$"+Math.round(v)}
  function get(u){return typeof tryFetch==="function"?tryFetch(u,30000):fetch(u).then(function(r){return r.json()})}
  async function load(force){
    try{var c=JSON.parse(localStorage.getItem(KEY));if(c&&c.D&&c.D.d){D=c.D;if(!force&&Date.now()-c.ts<TTL){render();return}}}catch(e){}
    if(loading)return;loading=true;render();
    try{
      var names=["date","price","realized_cap","circulating_supply","age_under_6m_realized_cap","age_under_6m_supply"];B.forEach(function(b){names.push("age_"+b+"_realized_cap","age_"+b+"_supply")});
      var u=new URL(API);u.searchParams.set("index","week1");u.searchParams.set("series",names.join(","));u.searchParams.set("start","2013-01-01");
      var r=await get(u.toString()),col_=function(n){var k=names.indexOf(n);return r[k].data.map(function(x){return x==null?NaN:+x})};
      var d=r[0].data,px=col_("price"),rc=col_("realized_cap"),sp=col_("circulating_supply"),r6=col_("age_under_6m_realized_cap"),s6=col_("age_under_6m_supply");
      var b={};B.forEach(function(x){b[x]={r:col_("age_"+x+"_realized_cap"),s:col_("age_"+x+"_supply")}});
      var o={d:d,p:px,l10:[],a10:[],a7:[],a5:[]};
      for(var i=0;i<d.length;i++){
        var oR=b["10y_to_12y"].r[i]+b["12y_to_15y"].r[i]+b["over_15y"].r[i],oS=b["10y_to_12y"].s[i]+b["12y_to_15y"].s[i]+b["over_15y"].s[i];
        if(!isFinite(oR)){oR=0;oS=0}
        var R10=rc[i]-oR,S10=sp[i]-oS,Ra=R10-r6[i],Sa=S10-s6[i],R7=Ra-(b["7y_to_8y"].r[i]||0)-(b["8y_to_10y"].r[i]||0),S7=Sa-(b["7y_to_8y"].s[i]||0)-(b["8y_to_10y"].s[i]||0),
            R5=R7-(b["5y_to_6y"].r[i]||0)-(b["6y_to_7y"].r[i]||0),S5=S7-(b["5y_to_6y"].s[i]||0)-(b["6y_to_7y"].s[i]||0);
        var q=function(R,S){return S>1e3&&R>0?R/S:null};
        o.l10.push(q(R10,S10));o.a10.push(q(Ra,Sa));o.a7.push(q(R7,S7));o.a5.push(q(R5,S5));
      }
      if(d.length<50||o.l10[d.length-1]==null)throw 0;
      D=o;failed=false;try{localStorage.setItem(KEY,JSON.stringify({ts:Date.now(),D:D}))}catch(e){}
    }catch(e){if(!D)failed=true}
    finally{loading=false;render()}
  }
  function last(a){for(var i=a.length-1;i>=0;i--)if(a[i]>0)return a[i];return null}
  function badge(){var b=$("freshLthCohort");if(!b)return;var t,c;
    if(D){var day=D.d[D.d.length-1],age=(Date.now()-Date.parse(day+"T00:00:00Z"))/864e5;t=(age>10?(en()?"Stale · ":"滞后 · "):(en()?"Data date · ":"数据日 · "))+day.slice(5);c=age>10?"warn":"good"}
    else if(loading){t=en()?"Syncing":"同步中";c="warn"}else if(failed){t=en()?"Unavailable":"暂不可用";c="bad"}else{t=en()?"Waiting for data":"等待数据";c="warn"}
    b.textContent=t;b.className="fresh-badge "+c}
  function render(){
    badge();var E=en(),em=$("lcEmpty");
    document.querySelectorAll("[data-lc-range]").forEach(function(x){var on=+x.dataset.lcRange===range;x.setAttribute("aria-pressed",on?"true":"false");x.classList.toggle("active",on);if(E)x.textContent={52:"1Y",156:"3Y",0:"All"}[x.dataset.lcRange]});
    if(!D){if(em){em.hidden=false;em.textContent=loading?(E?"Syncing…":"同步中…"):failed?(E?"Unavailable":"暂不可用"):(E?"Waiting for data":"等待数据")}return}
    if(em)em.hidden=true;
    var px=typeof S!=="undefined"&&S&&S.price>0?S.price:last(D.p);
    $("lcLegend").innerHTML=LINES.map(function(l){var v=last(D[l.k]);return '<button type="button" class="'+(off[l.k]?'off':'')+'" data-lc-line="'+l.k+'" style="--c:'+l.c+'"><span><i></i>'+(E?l.en:l.zh)+'</span><b>'+usd(v)+'</b></button>'}).join("");
    var vs=LINES.map(function(l){return last(D[l.k])}).filter(function(v){return v>0}),mx=Math.max.apply(null,vs),mn=Math.min.apply(null,vs);
    $("lcSpread").innerHTML=(E?"Lines spread ":"四条线相差 ")+'<b>'+((mx/mn-1)*100).toFixed(0)+'%</b>'+(px?(E?" · price vs 6m–5y ":" · 现价比 6 月–5 年成本 ")+'<b>'+((px/last(D.a5)-1)>=0?"+":"−")+Math.abs((px/last(D.a5)-1)*100).toFixed(0)+'%</b>':"");
    draw();
  }
  function draw(){
    var cv=$("lcCanvas");if(!cv||!D)return;var box=cv.parentElement,W=box.clientWidth,H=box.clientHeight;if(!W||!H)return;
    var n=D.d.length,s0=range?Math.max(0,n-range):0,cnt=n-s0;
    var dpr=Math.min(3,window.devicePixelRatio||1);cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);var c=cv.getContext("2d");c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,W,H);
    var padL=46,padR=8,padT=8,padB=20,pw=W-padL-padR,ph=H-padT-padB,lo=Infinity,hi=0;
    for(var i=s0;i<n;i++){[D.p[i]].concat(LINES.map(function(l){return D[l.k][i]})).forEach(function(v){if(v>0){lo=Math.min(lo,v);hi=Math.max(hi,v)}})}
    lo*=.85;hi*=1.12;var L0=Math.log(lo),L1=Math.log(hi);
    var X=function(k){return padL+(cnt>1?(k-s0)/(cnt-1):0)*pw},Y=function(v){return padT+ph-(Math.log(v)-L0)/(L1-L0)*ph};
    var FONT=css("--font-sans","-apple-system,system-ui,sans-serif"),tx3=css("--text-tertiary","#888"),grid=css("--border-subtle","rgba(0,0,0,.08)");
    c.font="10px "+FONT;c.fillStyle=tx3;c.strokeStyle=grid;c.lineWidth=1;c.textAlign="right";c.textBaseline="middle";
    for(var e=Math.ceil(Math.log10(lo));e<=Math.floor(Math.log10(hi));e++){var v=Math.pow(10,e),y=Math.round(Y(v))+.5;c.beginPath();c.moveTo(padL,y);c.lineTo(padL+pw,y);c.stroke();c.fillText(usd(v).replace(".0K","K").replace(".00K","K"),padL-5,y)}
    if(Math.floor(Math.log10(hi))-Math.ceil(Math.log10(lo))<1){[lo*1.1,Math.sqrt(lo*hi),hi/1.1].forEach(function(v){var y=Math.round(Y(v))+.5;c.beginPath();c.moveTo(padL,y);c.lineTo(padL+pw,y);c.stroke();c.fillText(usd(v),padL-5,y)})}
    c.textAlign="center";c.textBaseline="alphabetic";var lastX=-99,yrs=(Date.parse(D.d[n-1])-Date.parse(D.d[s0]))/864e5>730;
    for(i=s0;i<n;i++){var dd=D.d[i],nd=D.d[i-1];if(!nd)continue;var nm=yrs?dd.slice(0,4)!==nd.slice(0,4):dd.slice(5,7)!==nd.slice(5,7);if(!nm)continue;var xx=X(i);if(xx-lastX<(yrs?36:40))continue;lastX=xx;c.fillText(yrs?dd.slice(0,4):(en()?["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+dd.slice(5,7)-1]:(+dd.slice(5,7))+"月"),xx,H-5)}
    var line=function(arr,color,w,a){c.strokeStyle=color;c.lineWidth=w;c.globalAlpha=a;c.lineJoin="round";c.beginPath();var st=false;for(var k=s0;k<n;k++){var v=arr[k];if(!(v>0)){st=false;continue}if(!st){c.moveTo(X(k),Y(v));st=true}else c.lineTo(X(k),Y(v))}c.stroke();c.globalAlpha=1};
    line(D.p,css("--text-tertiary","#999"),1.2,.75);
    LINES.slice().reverse().forEach(function(l){if(!off[l.k])line(D[l.k],col(l.c),1.8,1)});
    var lv=$("lcLive");
    if(hover>=s0&&hover<n){var hx=X(hover);c.strokeStyle=tx3;c.lineWidth=1;c.beginPath();c.moveTo(hx+.5,padT);c.lineTo(hx+.5,padT+ph);c.stroke();
      if(lv)lv.textContent=D.d[hover]+" · "+(en()?"price ":"价格 ")+usd(D.p[hover])+" · "+LINES.map(function(l){return (en()?l.en:l.zh)+" "+usd(D[l.k][hover])}).join(" · ")}
    else if(lv)lv.textContent="";
    map={padL:padL,pw:pw,s0:s0,cnt:cnt};
  }
  function init(){
    var sec=$("lthCohort");if(!sec)return;
    sec.addEventListener("click",function(e){var b=e.target.closest&&e.target.closest("[data-lc-range]");if(b){range=+b.dataset.lcRange;hover=-1;render();return}
      var l=e.target.closest&&e.target.closest("[data-lc-line]");if(l){off[l.dataset.lcLine]=!off[l.dataset.lcLine];render()}});
    var cv=$("lcCanvas"),pick=function(ev){if(!D||!map)return;var r=cv.getBoundingClientRect(),x=(ev.touches?ev.touches[0].clientX:ev.clientX)-r.left;hover=map.s0+Math.max(0,Math.min(map.cnt-1,Math.round((x-map.padL)/map.pw*(map.cnt-1))));draw()};
    cv.addEventListener("pointermove",pick);cv.addEventListener("pointerdown",pick);cv.addEventListener("pointerleave",function(){hover=-1;draw()});cv.addEventListener("touchend",function(){hover=-1;draw()},{passive:true});
    var started=false,go=function(){if(started)return;started=true;load()};
    if("IntersectionObserver" in window){var io=new IntersectionObserver(function(es){if(es.some(function(x){return x.isIntersecting})){io.disconnect();go()}},{rootMargin:"600px 0px"});io.observe(sec.closest("details")||sec)}else go();
    window.addEventListener("resize",function(){if(D)draw()},{passive:true});window.addEventListener("themechange",function(){if(D)render()});
    if("ResizeObserver" in window)new ResizeObserver(function(){if(D)draw()}).observe(cv.parentElement);
    render();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();

;/*EXT_SEP*/
(function(){
  "use strict";
  // V26.1.0 中英文切换。中文为原文；英文通过对照表在页面上逐段替换，数字、价格、日期保持原样。
  var KEY="btc_lang_v1",lang=window.BTC_LANG||"zh";
  function setLang(l){try{localStorage.setItem(KEY,l)}catch(e){}location.reload()}
  window.setSiteLang=setLang;
  function paintToggle(){document.querySelectorAll("[data-lang-btn]").forEach(function(b){var on=b.dataset.langBtn===lang;b.classList.toggle("on",on);b.setAttribute("aria-pressed",on?"true":"false")})}
  document.addEventListener("click",function(e){var b=e.target.closest&&e.target.closest("[data-lang-btn]");if(b&&b.dataset.langBtn!==lang)setLang(b.dataset.langBtn)});
  paintToggle();
  if(lang!=="en"){document.documentElement.classList.remove("i18n-pending");return}
  // V26.4：对照表单独成文件，只在英文模式下载入
  if(!window.I18N_EN&&window.I18N_SRC){var sc=document.createElement("script");sc.src=window.I18N_SRC;sc.onload=boot;sc.onerror=function(){document.documentElement.classList.remove("i18n-pending")};document.head.appendChild(sc);return}
  boot();
  function boot(){
  var D=window.I18N_EN||{};
  var NUM=/[$¥]?[−\-+]?\d[\d,]*(?:\.\d+)?(?:[KMBT%x×]|bp)?/g,CJK=/[\u4e00-\u9fff\u3000-\u303f\uff01-\uff1f]/;
  var SEP=/(\s·\s|；|，|。|：|！|？|（|）|、)/,SEPMAP={"；":"; ","，":", ","。":". ","：":": ","！":"! ","？":"? ","（":" (","）":") ","、":", "};
  var MON=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  function seg(p,whole){
    var t=p.trim();if(!t||!CJK.test(t))return p;
    var nums=t.match(NUM)||[],k=t.replace(NUM,"{#}"),v=D[k];
    if(v==null)return greedy(t)||(whole?null:piece(t))||p;
    return v.replace(/\{ym:(\d+),(\d+)\}/g,function(m,a,b){var y=nums[+a],mo=parseInt(String(nums[+b]||"").replace(/[^\d]/g,""),10);return MON[mo-1]?MON[mo-1]+" "+y:y+"-"+mo})
            .replace(/\{(\d+)\}/g,function(m,i){return nums[+i]!=null?nums[+i]:""});
  }
  // 兜底：把未登记的片段按已知词条从左到右拆开（例如「幂律等待计算」→「Power law Calculating」）
  var PLAIN={},MAXL=0;for(var kk in D){if(kk.indexOf("{#}")<0&&kk.length<=16){PLAIN[kk]=D[kk];if(kk.length>MAXL)MAXL=kk.length}}
  function greedy(t){
    if(t.length>40||NUM.test(t)){NUM.lastIndex=0;return null}NUM.lastIndex=0;
    var i=0,out=[];
    while(i<t.length){var ch=t[i];if(!CJK.test(ch)){var j=i;while(j<t.length&&!CJK.test(t[j]))j++;out.push(t.slice(i,j).trim());i=j;continue}
      var hit=null;for(var L=Math.min(MAXL,t.length-i);L>=1;L--){var sub=t.substr(i,L);if(L===1&&"和与或及的".indexOf(sub)<0)continue;if(PLAIN[sub]!=null){hit=sub;break}}
      if(!hit)return null;out.push(PLAIN[hit]);i+=hit.length}
    return out.filter(Boolean).join(" ");
  }
  // 兜底 2：在数字处切开，逐段翻译后按原顺序拼回（例如「LTH 自身供应中有 0.00% 处于未实现亏损」）
  function piece(t){
    var parts=t.split(/([$¥]?[−\-+]?\d[\d,]*(?:\.\d+)?(?:[KMBT%x×]|bp)?)/);
    if(parts.length<2)return null;
    var out="",any=false;
    for(var i=0;i<parts.length;i++){var x=parts[i];if(!x)continue;
      if(i%2===1||!CJK.test(x)){out+=x;continue}
      var c=x.trim(),w=D[c]!=null?D[c]:greedy(c);if(w==null)return null;any=true;
      var pre=/^\s/.test(x)||(out&&!/\s$/.test(out))?" ":"",post=/\s$/.test(x)||i<parts.length-1?" ":"";
      out+=pre+w+post}
    if(!any)return null;
    return out.replace(/\s+([,.;:!?%)/])/g,"$1").replace(/\s{2,}/g," ").trim();
  }
  function tr(s){
    if(!s||!CJK.test(s))return s;
    var pt=s.trim();if(PUNCT[pt]!=null)return PUNCT[pt];
    var lead=s.match(/^\s*/)[0],trail=s.match(/\s*$/)[0],t=s.trim().replace(/\s+/g," ");
    var whole=seg(t,true);if(whole!==t){whole=whole.charAt(0)==="_"?whole.slice(1):cap(whole);if(/^[,.;:]/.test(whole))lead="";if(/[：，；、]$/.test(t)&&!/\s$/.test(whole))whole+=" ";return lead+whole+trail}
    var parts=t.split(SEP),out="";
    var low=false;
    for(var i=0;i<parts.length;i++){var p=parts[i];if(!p)continue;var sp=p.trim();if(SEPMAP[sp]!=null&&p.length<=3){out+=SEPMAP[sp];low=/[，；：、（]/.test(sp);continue}var x=seg(p);if(x.charAt(0)==="_")x=x.slice(1);else if(low)x=lc(x);low=false;out+=x}
    out=out.replace(/\s+([,.;:!?)])/g,"$1").replace(/\(\s+/g,"(").replace(/\s{2,}/g," ").trim();
    if(/[：，；、]$/.test(t))out+=" ";
    return lead+cap(out)+trail;
  }
  var PUNCT={"，":", ","。":". ","；":"; ","：":": ","、":", ","！":"! ","？":"? ","（":" (","）":") ","「":"\"","」":"\"","《":"\"","》":"\""};
  var PROPER=/^(True|Bitview|Bitcoin|Binance|Coinbase|Fear|Puell|Reserve|Pi|Bedrock|Active|Jiushen|Weibo|Alternative|CryptoCompare|Blockchain|DefiLlama|Polymarket|Satoshi|I|OKX|Glassnode|CoinGecko|GitHub|CoinGlass|Service|Sunday|Monday)\b/;
  function lc(x){var m=x.match(/^\s*([A-Z])([a-z])/);if(!m||PROPER.test(x.trim()))return x;return x.replace(/^(\s*)([A-Z])/,function(a,s,c){return s+c.toLowerCase()})}
  function cap(o){if(/^(vs\b|p\d|pp\b|[a-z]\s)/.test(o))return o;if(/^(days|blocks|pts|years|months|hours|min|x)$/.test(o))return o;return o.replace(/(^|[.!?]\s+)([a-z])/g,function(m,a,b){return a+b.toUpperCase()})}
  window.i18nText=tr;
  var seen=new WeakMap(),SKIP=/^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA)$/,ATTRS=["aria-label","title","placeholder"];
  function noTr(el){return el&&el.closest&&el.closest('[translate="no"]')}
  function node(n){if(noTr(n.parentElement))return;var v=n.nodeValue;if(seen.get(n)===v||!CJK.test(v))return;var r=tr(v);if(r!==v)n.nodeValue=r;seen.set(n,n.nodeValue)}
  function attrs(el){if(!el.getAttribute)return;for(var i=0;i<ATTRS.length;i++){var v=el.getAttribute(ATTRS[i]);if(v&&CJK.test(v)){var r=tr(v);if(r!==v)el.setAttribute(ATTRS[i],r)}}}
  function walk(root){
    if(root.nodeType===3){if(!(root.parentNode&&SKIP.test(root.parentNode.nodeName)))node(root);return}
    if(root.nodeType!==1||SKIP.test(root.nodeName))return;attrs(root);
    var w=document.createTreeWalker(root,5,null),n;
    while(n=w.nextNode()){if(n.nodeType===3){if(!(n.parentNode&&SKIP.test(n.parentNode.nodeName)))node(n)}else attrs(n)}
  }
  walk(document.body);document.title=tr(document.title);
  new MutationObserver(function(ms){for(var i=0;i<ms.length;i++){var m=ms[i];if(m.type==="characterData")node(m.target);else if(m.type==="attributes")attrs(m.target);else for(var j=0;j<m.addedNodes.length;j++)walk(m.addedNodes[j])}})
    .observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:ATTRS});
  document.documentElement.classList.remove("i18n-pending");
  // V26.4：对照表是按需下载的，比它先画好的图表在此重画一次，图上的文字才会变成英文
  try{window.dispatchEvent(new Event("themechange"));window.dispatchEvent(new Event("resize"))}catch(e){}
  }
})();

;/*EXT_SEP*/

(function(){
  if(window.__sgResonanceInit)return;
  window.__sgResonanceInit=true;
  var CACHE_KEY="sg_resonance_v5",CACHE_TTL=5*60*1000;
  var activeTab="crash",lastState=null,busy=false;

  function $(id){return document.getElementById(id)}
  function fmtUsdM(v){
    if(v==null||!isFinite(v))return "—";
    var a=Math.abs(v),s=v<0?"-":(v>0?"+":"");
    if(a>=1e9)return s+"$"+(a/1e9).toFixed(2)+"B";
    if(a>=1e6)return s+"$"+(a/1e6).toFixed(0)+"M";
    return s+"$"+Math.round(a);
  }
  function fmtPct(v,d){
    if(v==null||!isFinite(v))return "—";
    var s=v>0?"+":"";
    return s+v.toFixed(d==null?2:d)+"%";
  }
  function fmtBtc(v){
    if(v==null||!isFinite(v))return "—";
    var s=v>0?"+":"";
    return s+Math.round(v).toLocaleString("en-US")+" BTC";
  }
  function fetchJson(url,ms){
    var ctrl=typeof AbortController!=="undefined"?new AbortController():null;
    var timer=ctrl?setTimeout(function(){try{ctrl.abort()}catch(e){}},ms||9000):null;
    return fetch(url,ctrl?{signal:ctrl.signal}:undefined).then(function(r){
      if(timer)clearTimeout(timer);
      if(!r.ok)throw new Error("HTTP "+r.status);
      return r.json();
    },function(err){
      if(timer)clearTimeout(timer);
      throw err;
    });
  }

  function fetchBitview(){
    var u1="https://bitview.space/api/series/bulk?index=day1&series=date,mvrv,sth_nupl&start=-1465";
    var u2="https://bitview.space/api/series/bulk?index=day1&series=date,sth_realized_price,sopr_24h,lth_supply&start=-1465";
    return Promise.all([fetchJson(u1,14000),fetchJson(u2,14000)]).then(function(res){
      var a=res[0],b=res[1];
      function pick(resp,idx){
        if(!Array.isArray(resp)||!resp[idx]||!Array.isArray(resp[idx].data))return [];
        return resp[idx].data.filter(function(x){return typeof x==="number"&&isFinite(x)});
      }
      function toMap(resp,idx){
        var m={};
        if(!Array.isArray(resp)||!resp[0]||!resp[idx])return m;
        var ds=resp[0].data||[],vs=resp[idx].data||[];
        for(var i=0;i<ds.length&&i<vs.length;i++){
          if(typeof ds[i]==="string"&&typeof vs[i]==="number"&&isFinite(vs[i]))m[ds[i].slice(0,10)]=vs[i];
        }
        return m;
      }
      var mvrvArr=pick(a,1),sthNuplArr=pick(a,2),sthRpArr=pick(b,1),soprArr=pick(b,2),lthSupArr=pick(b,3);
      var mvrv=mvrvArr.length?mvrvArr[mvrvArr.length-1]:null;
      var mvrvPct=null;
      if(mvrv!=null&&mvrvArr.length>=30){
        var le=0;for(var k=0;k<mvrvArr.length;k++){if(mvrvArr[k]<=mvrv)le++}
        mvrvPct=le/mvrvArr.length*100;
      }
      var sthNupl=sthNuplArr.length?sthNuplArr[sthNuplArr.length-1]:null;
      var sthNupl14Min=sthNuplArr.length?Math.min.apply(null,sthNuplArr.slice(-14)):null;
      var sthRp=sthRpArr.length?sthRpArr[sthRpArr.length-1]:null;
      var soprNow=soprArr.length?soprArr[soprArr.length-1]:null;
      var sopr14Min=soprArr.length?Math.min.apply(null,soprArr.slice(-14)):null;
      var lth7d=lthSupArr.length>=8?(lthSupArr[lthSupArr.length-1]-lthSupArr[lthSupArr.length-8]):null;
      return {
        mvrv:mvrv,mvrvPct:mvrvPct,sthNupl:sthNupl,sthNupl14Min:sthNupl14Min,
        sthRp:sthRp,soprNow:soprNow,sopr14Min:sopr14Min,lth7d:lth7d,
        hist:{mvrv:toMap(a,1),sthNupl:toMap(a,2),sthRp:toMap(b,1),sopr:toMap(b,2),lth:toMap(b,3)}
      };
    });
  }

  function fetchOldCoins(){
    return fetchJson("./data/old-coins.json",9000).then(function(j){
      var rows=j&&Array.isArray(j.rows)?j.rows:[];
      if(!rows.length)return null;
      var n=rows.length;
      function parseRow(r){
        var cvals=r[5]||[],ov=0;
        for(var i=0;i<cvals.length;i++)ov+=(+cvals[i]||0);
        return {ov:ov,pr:+r[4]||0};
      }
      var extreme3=false,maxOv3=0,maxPr3=0;
      for(var i=Math.max(0,n-3);i<n;i++){
        var x=parseRow(rows[i]);
        if(x.ov>7000&&x.pr>4e8)extreme3=true;
        if(x.ov>maxOv3){maxOv3=x.ov;maxPr3=x.pr}
      }
      var quietDays=0;
      for(var q=n-1;q>=Math.max(0,n-60);q--){
        var xq=parseRow(rows[q]);
        if(xq.ov>5000&&xq.pr>3e8)break;
        quietDays++;
      }
      var last=rows[n-1];
      return {extreme3:extreme3,maxOv3:maxOv3,maxPr3:maxPr3,quietDays:quietDays,lastDate:last[0],lastPrice:+last[1]||null,histRows:rows.slice(-1500)};
    });
  }

  function fetchEtf(){
    var parseDays=function(j){
      var arr=(j&&Array.isArray(j.days))?j.days:[];
      var clean=[],emap={};
      for(var i=0;i<arr.length;i++){
        if(arr[i]&&typeof arr[i].netFlowUsd==="number"){
          clean.push(arr[i].netFlowUsd);
          if(arr[i].date)emap[arr[i].date.slice(0,10)]=arr[i].netFlowUsd;
        }
      }
      if(clean.length<5)return null;
      var n=clean.length,sum5=0;
      for(var k=n-5;k<n;k++)sum5+=clean[k];
      return {sum5:sum5,thru:(j&&j.updatedThrough)||"",hist:emap};
    };
    return fetchJson("./data/etf-flows.json",7000).then(parseDays).catch(function(){
      return fetchJson("https://www.tftc.io/bitcoin-etf-flows/data.json",9000).then(parseDays);
    });
  }

  function fetchStablecoin(){
    return fetchJson("https://stablecoins.llama.fi/stablecoincharts/all",12000).then(function(arr){
      if(!Array.isArray(arr)||arr.length<35)throw new Error("bad stablecoin");
      var vals=[],smap={};
      for(var i=Math.max(0,arr.length-1520);i<arr.length;i++){
        var x=arr[i];
        var v=x&&x.totalCirculatingUSD&&typeof x.totalCirculatingUSD.peggedUSD==="number"?x.totalCirculatingUSD.peggedUSD:(x&&x.totalCirculating&&typeof x.totalCirculating.peggedUSD==="number"?x.totalCirculating.peggedUSD:null);
        if(v!=null&&isFinite(v)&&v>0){
          vals.push(v);
          if(x&&x.date)smap[new Date((+x.date)*1000).toISOString().slice(0,10)]=v;
        }
      }
      if(vals.length<31)throw new Error("short stablecoin");
      var n=vals.length,now=vals[n-1];
      return {now:now,d7:now-vals[n-8],d30:now-vals[n-31],hist:smap};
    });
  }

  function fetchFng(){
    return fetchJson("https://api.alternative.me/fng/?limit=1500",10000).then(function(j){
      var arr=j&&Array.isArray(j.data)?j.data:[];
      if(arr.length<3)throw new Error("bad fng");
      var vals=arr.slice(0,7).map(function(x){return parseInt(x.value,10)}).filter(function(v){return isFinite(v)});
      if(!vals.length)throw new Error("empty fng");
      var fmap={};
      for(var i=0;i<arr.length;i++){
        var v=parseInt(arr[i].value,10),ts=+arr[i].timestamp;
        if(isFinite(v)&&isFinite(ts)&&ts>0)fmap[new Date(ts*1000).toISOString().slice(0,10)]=v;
      }
      return {now:vals[0],min7:Math.min.apply(null,vals),max7:Math.max.apply(null,vals),hist:fmap};
    });
  }

  function fetchDerivatives(){
    var oiP=fetchJson("https://fapi.binance.com/futures/data/openInterestHist?symbol=BTCUSDT&period=1d&limit=10",8500).then(function(arr){
      if(!Array.isArray(arr)||arr.length<8)throw new Error("bad oi");
      var vals=arr.map(function(x){return +(x.sumOpenInterest||0)}).filter(function(v){return v>0});
      if(vals.length<8)throw new Error("short oi");
      var now=vals[vals.length-1],prev7=vals[vals.length-8];
      return {oi7dPct:(now-prev7)/prev7*100};
    }).catch(function(){
      return fetchJson("https://www.okx.com/api/v5/rubik/stat/contracts/open-interest-volume?ccy=BTC&period=1D",8500).then(function(j){
        var arr=j&&Array.isArray(j.data)?j.data:[];
        if(arr.length<8)throw new Error("okx oi");
        var vals=arr.slice(0,10).map(function(x){return +(x[1]||0)}).reverse();
        return {oi7dPct:(vals[vals.length-1]-vals[vals.length-8])/vals[vals.length-8]*100};
      });
    });
    var frP=fetchJson("https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT",7500).then(function(j){
      var r=+(j&&j.lastFundingRate);if(!isFinite(r))throw new Error("fr");return r*3*365*100;
    }).catch(function(){
      return fetchJson("https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP",7500).then(function(j){
        var r=+(j&&j.data&&j.data[0]&&j.data[0].fundingRate);if(!isFinite(r))throw new Error("okx fr");return r*3*365*100;
      });
    });
    return Promise.all([oiP.catch(function(){return null}),frP.catch(function(){return null})]).then(function(r){return {oi:r[0],frAnn:r[1]}});
  }

  function fetchCoinbasePremium(){
    var bnUrl="https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=10";
    var cbUrl="https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=86400";
    var bnLiveUrl="https://data-api.binance.vision/api/v3/ticker/price?symbol=BTCUSDT";
    var cbLiveUrl="https://api.exchange.coinbase.com/products/BTC-USD/ticker";
    return Promise.all([
      fetchJson(bnUrl,8000).catch(function(){return fetchJson("https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=10",8000)}),
      fetchJson(cbUrl,8000).catch(function(){return null}),
      fetchJson(bnLiveUrl,7000).catch(function(){return null}),
      fetchJson(cbLiveUrl,7000).catch(function(){return null})
    ]).then(function(res){
      var bnK=res[0],cbK=res[1],bnL=res[2],cbL=res[3];
      var spot=bnL&&+bnL.price?+bnL.price:null,cbSpot=cbL&&+cbL.price?+cbL.price:null;
      var livePrem=(spot&&cbSpot)?((cbSpot-spot)/spot*100):null;
      var prem7=null;
      if(Array.isArray(bnK)&&Array.isArray(cbK)&&cbK.length>=7){
        var cbMap={};for(var i=0;i<cbK.length;i++)cbMap[Math.floor((+cbK[i][0])/86400)*86400]=+cbK[i][4];
        var prems=[];
        for(var j=0;j<bnK.length;j++){
          var bts=Math.floor((+bnK[j][0]/1000)/86400)*86400,bc=+bnK[j][4];
          if(cbMap[bts]&&bc>0)prems.push((cbMap[bts]-bc)/bc*100);
        }
        if(prems.length>=7){var s7=0;for(var b=prems.length-7;b<prems.length;b++)s7+=prems[b];prem7=s7/7}
      }
      if(prem7==null)prem7=livePrem;
      return {spot:spot,livePrem:livePrem,prem7:prem7};
    });
  }

  // Strict 30D/90D Historical Backtest + Automatic Statistical Edge Gate
  function computeBacktest(data){
    var oc=data.oc,bv=data.bv||{},etf=data.etf,stb=data.stb,fng=data.fng;
    var rows=(oc&&Array.isArray(oc.histRows))?oc.histRows:[];
    if(rows.length<180)return null;
    var bvh=bv.hist||{},em=(etf&&etf.hist)||{},sm=(stb&&stb.hist)||{},fm=(fng&&fng.hist)||{};
    var n=rows.length;
    var dates=[],prices=[],ovs=[],prs=[];
    for(var i=0;i<n;i++){
      var r=rows[i],cvals=r[5]||[],ov=0;
      for(var c=0;c<cvals.length;c++)ov+=(+cvals[c]||0);
      dates.push(r[0]);prices.push(+r[1]||0);ovs.push(ov);prs.push(+r[4]||0);
    }
    var mvrvWin=[],crashEv=[],rallyEv=[],base30=[],base90=[];
    var lastCrash=-99,lastRally=-99;
    function med(arr){
      if(!arr.length)return null;
      var s=arr.slice().sort(function(a,b){return a-b}),m=Math.floor(s.length/2);
      return s.length%2?s[m]:(s[m-1]+s[m])/2;
    }
    for(var t=35;t<n-91;t++){
      var d=dates[t],p0=prices[t],p30=prices[t+30],p90=prices[t+90];
      if(!(p0>0&&p30>0&&p90>0))continue;
      var r30=(p30-p0)/p0*100,r90=(p90-p0)/p0*100;
      base30.push(r30);base90.push(r90);

      var mv=bvh.mvrv?bvh.mvrv[d]:null;
      if(mv!=null){mvrvWin.push(mv);if(mvrvWin.length>1460)mvrvWin.shift()}
      var mvPct=null;
      if(mv!=null&&mvrvWin.length>=60){
        var le=0;for(var k=0;k<mvrvWin.length;k++)if(mvrvWin[k]<=mv)le++;
        mvPct=le/mvrvWin.length*100;
      }
      var sn=bvh.sthNupl?bvh.sthNupl[d]:null;
      var srp=bvh.sthRp?bvh.sthRp[d]:null;
      var sp=bvh.sopr?bvh.sopr[d]:null;
      var lth0=bvh.lth?bvh.lth[d]:null,lth7=bvh.lth?bvh.lth[dates[t-7]]:null;
      var lth7d=(lth0!=null&&lth7!=null)?(lth0-lth7):null;

      // Old coins extreme 3d distribution & 7d quiet
      var extDist3=false;
      for(var e3=t;e3>=t-2;e3--){if(ovs[e3]>7000&&prs[e3]>4e8)extDist3=true}
      var quiet=0;for(var q=t;q>=Math.max(0,t-14);q--){if(ovs[q]>5000&&prs[q]>3e8)break;quiet++}

      // 14d STH capitulation check
      var hadCap=false;
      for(var c14=t;c14>=t-13;c14--){
        var sv=bvh.sopr?bvh.sopr[dates[c14]]:null,nv=bvh.sthNupl?bvh.sthNupl[dates[c14]]:null;
        if(sv!=null&&sv<0.985&&nv!=null&&nv<-0.08){hadCap=true;break}
      }

      // ETF 5d
      var evs=[];for(var e=t;e>=Math.max(0,t-9)&&evs.length<5;e--){if(em[dates[e]]!=null)evs.push(em[dates[e]])}
      var etf5=evs.length===5?(evs[0]+evs[1]+evs[2]+evs[3]+evs[4]):null;

      // Stablecoin 7d
      var st0=sm[d],st7=sm[dates[t-7]];
      var stb7=(st0&&st7)?(st0-st7):null;

      // F&G 7d
      var fg0=fm[d],fgMax=fg0;
      if(fg0!=null){for(var f=t-1;f>=t-6;f--){var fv=fm[dates[f]];if(fv!=null&&fv>fgMax)fgMax=fv}}

      // === Extreme Crash (3 pillars aligned) ===
      var cP1=(mvPct!=null&&mvPct>=80&&sn!=null&&sn>0.15);
      var cP2=(extDist3||(lth7d!=null&&lth7d<-25000));
      var cP3=((fg0!=null&&fgMax>=78&&fg0<=fgMax-2)||(etf5!=null&&etf5<-3e8)||(stb7!=null&&stb7<-5e8));
      if(cP1&&cP2&&cP3&&t-lastCrash>=30){
        crashEv.push({d:d,r30:r30,r90:r90});
        lastCrash=t;
      }

      // === Extreme Rally (3 pillars aligned) ===
      var rP1=((mvPct!=null&&mvPct<=30)||(srp!=null&&srp>0&&p0<srp));
      var rP2=(hadCap&&quiet>=7);
      var rP3=((fg0!=null&&fg0<=25)||(etf5!=null&&etf5>2e8)||(stb7!=null&&stb7>5e8));
      if(rP1&&rP2&&rP3&&t-lastRally>=30){
        rallyEv.push({d:d,r30:r30,r90:r90});
        lastRally=t;
      }
    }

    var b30=med(base30),b90=med(base90);
    var bDn30=0,bUp90=0;
    for(var i=0;i<base30.length;i++)if(base30[i]<0)bDn30++;
    for(var j=0;j<base90.length;j++)if(base90[j]>0)bUp90++;
    var baseDn30Pct=base30.length?Math.round(bDn30/base30.length*100):50;
    var baseUp90Pct=base90.length?Math.round(bUp90/base90.length*100):50;

    function summarize(evs,isCrash){
      var a30=evs.map(function(x){return x.r30}),a90=evs.map(function(x){return x.r90});
      var m30=med(a30),m90=med(a90);
      var h30=0,h90=0;
      for(var k=0;k<evs.length;k++){
        if(isCrash){if(a30[k]<0)h30++;if(a90[k]<0)h90++}
        else{if(a30[k]>0)h30++;if(a90[k]>0)h90++}
      }
      var rate30=evs.length?Math.round(h30/evs.length*100):null;
      var rate90=evs.length?Math.round(h90/evs.length*100):null;
      // Strict edge test: need >=3 samples AND clear statistical edge over baseline
      var valid=false;
      if(evs.length>=3&&m30!=null&&m90!=null&&b30!=null&&b90!=null){
        if(isCrash) valid=((m90<=b90-5)||(m30<=b30-4&&rate30>=baseDn30Pct+10));
        else valid=((m90>=b90+5&&rate90>=60)||(m30>=b30+4&&rate30>=60));
      }
      return {n:evs.length,m30:m30,m90:m90,rate30:rate30,rate90:rate90,valid:valid,recent:evs.slice(-4).reverse()};
    }

    return {
      span:dates[35]+" ~ "+dates[n-92],
      base30:b30,base90:b90,baseDn30Pct:baseDn30Pct,baseUp90Pct:baseUp90Pct,
      crash:summarize(crashEv,true),
      rally:summarize(rallyEv,false)
    };
  }

  function evaluate(data){
    var bv=data.bv||{},oc=data.oc,etf=data.etf,drv=data.drv||{},cb=data.cb||{},stb=data.stb,fng=data.fng;
    var spot=cb.spot||(oc&&oc.lastPrice)||null;
    var bt=computeBacktest(data);

    // === Live Extreme Crash (3 pillars) ===
    var c1Avail=(bv.mvrvPct!=null&&bv.sthNupl!=null);
    var c1Hit=(c1Avail&&bv.mvrvPct>=80&&bv.sthNupl>0.15);
    var c2Avail=(!!oc||bv.lth7d!=null);
    var c2Hit=((oc&&oc.extreme3)||(bv.lth7d!=null&&bv.lth7d<-25000));
    var c3Parts=[],c3Hit=false,c3Avail=false;
    if(fng){c3Avail=true;if(fng.max7>=78&&fng.now<=fng.max7-2)c3Hit=true;c3Parts.push("F&G "+fng.now+"(高"+fng.max7+")")}
    if(etf){c3Avail=true;if(etf.sum5<-3e8)c3Hit=true;c3Parts.push("ETF "+fmtUsdM(etf.sum5))}
    if(stb){c3Avail=true;if(stb.d7<-5e8)c3Hit=true;c3Parts.push("稳定币 "+fmtUsdM(stb.d7))}
    if(cb.prem7!=null){c3Avail=true;if(cb.prem7<-0.05)c3Hit=true;c3Parts.push("CB "+fmtPct(cb.prem7,2))}
    if(drv.oi&&drv.frAnn!=null){c3Avail=true;if(drv.oi.oi7dPct>15&&drv.frAnn>30)c3Hit=true}

    var crashItems=[
      {layer:"高位",name:"MVRV ≥80% 分位 且 STH 浮盈 >0.15",avail:c1Avail,hit:c1Hit,val:c1Avail?("MVRV "+bv.mvrvPct.toFixed(0)+"% · sth_nupl "+bv.sthNupl.toFixed(3)):"暂缺"},
      {layer:"派发",name:"老币放量(>7k & $400M) 或 LTH 7日 <-25k",avail:c2Avail,hit:c2Hit,val:(oc?("3日峰值 "+Math.round(oc.maxOv3).toLocaleString("en-US")+" BTC"):"")+(bv.lth7d!=null?(" · LTH "+fmtBtc(bv.lth7d)):"")},
      {layer:"拐弱",name:"极度贪婪拐头 / ETF流出 / 稳定币收缩 / 负溢价",avail:c3Avail,hit:c3Hit,val:c3Parts.length?c3Parts.join(" · "):"暂缺"}
    ];
    var cCnt=(c1Hit?1:0)+(c2Hit?1:0)+(c3Hit?1:0);
    var cValid=!!(bt&&bt.crash.valid);
    var crash={
      cnt:cCnt,hits:[c1Hit?1:0,c2Hit?1:0,c3Hit?1:0],items:crashItems,valid:cValid,
      active:(cCnt===3&&cValid),
      level:(cCnt===3&&cValid)?"danger":(cCnt>=2&&cValid?"warn":"ok"),
      label:!cValid?"未过回测·观察":(cCnt===3?"极端大跌共振":(cCnt===2?"2/3 警戒":"未触发")),
      gateText:!cValid?"回测未明显跑赢基准，已静默预警":(cCnt===3?"3/3 极值同向满足 · 回测有效":"需 3/3 极值同时满足（回测有效）")
    };

    // === Live Extreme Rally (3 pillars) ===
    var r1Avail=(bv.mvrvPct!=null||(spot!=null&&bv.sthRp!=null));
    var r1Hit=((bv.mvrvPct!=null&&bv.mvrvPct<=30)||(spot!=null&&bv.sthRp!=null&&spot<bv.sthRp));
    var r2Avail=(bv.sopr14Min!=null&&bv.sthNupl14Min!=null&&!!oc);
    var r2Hit=(r2Avail&&bv.sopr14Min<0.985&&bv.sthNupl14Min<-0.08&&oc.quietDays>=7);
    var r3Parts=[],r3Hit=false,r3Avail=false;
    if(fng){r3Avail=true;if(fng.now<=25)r3Hit=true;r3Parts.push("F&G "+fng.now)}
    if(etf){r3Avail=true;if(etf.sum5>2e8)r3Hit=true;r3Parts.push("ETF "+fmtUsdM(etf.sum5))}
    if(stb){r3Avail=true;if(stb.d7>5e8)r3Hit=true;r3Parts.push("稳定币 "+fmtUsdM(stb.d7))}

    var rallyItems=[
      {layer:"赔率",name:"MVRV ≤30% 分位 或 现价低于 STH 成本线",avail:r1Avail,hit:r1Hit,val:(bv.mvrvPct!=null?("MVRV "+bv.mvrvPct.toFixed(0)+"%"):"")+(bv.sthRp?(" · STH成本 $"+Math.round(bv.sthRp).toLocaleString("en-US")):"")},
      {layer:"出清",name:"14日内 STH 割肉脉冲 且 老币静默 ≥7天",avail:r2Avail,hit:r2Hit,val:r2Avail?("14日低 SOPR "+bv.sopr14Min.toFixed(3)+" · 静默 "+oc.quietDays+" 天"):"暂缺"},
      {layer:"极恐",name:"F&G ≤25 极度恐惧 或 ETF/稳定币转正回流",avail:r3Avail,hit:r3Hit,val:r3Parts.length?r3Parts.join(" · "):"暂缺"}
    ];
    var rCnt=(r1Hit?1:0)+(r2Hit?1:0)+(r3Hit?1:0);
    var rValid=!!(bt&&bt.rally.valid);
    var rally={
      cnt:rCnt,hits:[r1Hit?1:0,r2Hit?1:0,r3Hit?1:0],items:rallyItems,valid:rValid,
      active:(rCnt===3&&rValid),
      level:(rCnt===3&&rValid)?"go":(rCnt>=2&&rValid?"ready":"ok"),
      label:!rValid?"未过回测·观察":(rCnt===3?"极端大涨共振":(rCnt===2?"2/3 蓄力":"未触发")),
      gateText:!rValid?"回测未明显跑赢基准，已静默提示":(rCnt===3?"3/3 极值同向满足 · 回测有效":"需 3/3 极值同时满足（回测有效）")
    };

    return {crash:crash,rally:rally,bt:bt,meta:{cb:cb,drv:drv,etf:etf,bv:bv,stb:stb,fng:fng,ts:Date.now()}};
  }

  function renderBacktest(bt){
    var meta=$("rsBtMeta"),body=$("rsBtBody");
    if(!body)return;
    if(!bt){
      if(meta)meta.textContent="历史样本不足";
      body.textContent="需加载 old-coins.json 与 Bitview 历史序列后显示 30/90 日回测。";
      return;
    }
    if(meta)meta.textContent=bt.span;
    function fR(v){
      if(v==null||!isFinite(v))return "—";
      var cls=v>=0?"rs-bt-up":"rs-bt-dn";
      return '<span class="'+cls+'">'+(v>=0?"+":"")+v.toFixed(1)+"%</span>";
    }
    var c=bt.crash,r=bt.rally;
    var cTag=c.valid?'<span class="rs-bt-up">✓ 有效</span>':'<span style="color:var(--text-secondary)">未达标</span>';
    var rTag=r.valid?'<span class="rs-bt-up">✓ 有效</span>':'<span style="color:var(--text-secondary)">未达标</span>';
    var h='<table class="rs-bt-tbl"><thead><tr><th>极端信号</th><th>次数</th><th>30日中位</th><th>90日中位</th><th>检验</th></tr></thead><tbody>'+
      '<tr><td>大跌共振 (3/3)</td><td>'+c.n+' 次</td><td>'+fR(c.m30)+'</td><td>'+fR(c.m90)+'</td><td>'+cTag+'</td></tr>'+
      '<tr><td>大涨共振 (3/3)</td><td>'+r.n+' 次</td><td>'+fR(r.m30)+'</td><td>'+fR(r.m90)+'</td><td>'+rTag+'</td></tr>'+
      '<tr><td style="color:var(--text-secondary)">同期任意一天</td><td style="color:var(--text-secondary)">基准</td><td>'+fR(bt.base30)+'</td><td>'+fR(bt.base90)+'</td><td style="color:var(--text-secondary)">对照</td></tr>'+
      '</tbody></table>';
    var rec=activeTab==="crash"?c.recent:r.recent;
    if(rec&&rec.length){
      h+='<div class="rs-bt-rec"><span class="rs-bt-chip" style="background:transparent;padding-left:0">最近触发：</span>';
      for(var i=0;i<rec.length;i++){
        h+='<span class="rs-bt-chip">'+rec[i].d+' (30日 '+fR(rec[i].r30)+' · 90日 '+fR(rec[i].r90)+')</span>';
      }
      h+='</div>';
    }
    body.innerHTML=h;
  }

  function render(st){
    if(!st)return;
    lastState=st;
    var c=st.crash,r=st.rally,m=st.meta;

    var live=document.querySelector('[data-fold-live="resonance"]');
    if(live){
      live.textContent="大跌 "+c.cnt+"/3 ("+c.label+") ｜ 大涨 "+r.cnt+"/3 ("+r.label+")";
      live.classList.add("live");
    }

    var cBox=$("rsCrashBox");
    if(cBox){
      cBox.className="rs-box"+(c.level==="danger"?" is-danger":(c.level==="warn"?" is-warn":""));
      $("rsCrashBadge").className="rs-badge"+(c.level==="danger"?" danger":(c.level==="warn"?" warn":""));
      $("rsCrashBadge").textContent=c.label;
      $("rsCrashScore").innerHTML=c.cnt+"<small>/3</small>";
      $("rsCrashGate").textContent=c.gateText;
      for(var i=0;i<3;i++){
        $("rsCL"+(i+1)).textContent=c.hits[i]+"/1";
        $("rsCB"+(i+1)).style.width=(c.hits[i]?100:0)+"%";
      }
    }

    var rBox=$("rsRallyBox");
    if(rBox){
      rBox.className="rs-box"+(r.level==="go"?" is-go":(r.level==="ready"?" is-ready":""));
      $("rsRallyBadge").className="rs-badge"+(r.level==="go"?" go":(r.level==="ready"?" ready":""));
      $("rsRallyBadge").textContent=r.label;
      $("rsRallyScore").innerHTML=r.cnt+"<small>/3</small>";
      $("rsRallyGate").textContent=r.gateText;
      for(var j=0;j<3;j++){
        $("rsRL"+(j+1)).textContent=r.hits[j]+"/1";
        $("rsRB"+(j+1)).style.width=(r.hits[j]?100:0)+"%";
      }
    }

    if($("rsValCb")){
      $("rsValCb").textContent=m.cb&&m.cb.livePrem!=null?fmtPct(m.cb.livePrem,3):"—";
      $("rsSubCb").textContent=m.cb&&m.cb.prem7!=null?("7日均 "+fmtPct(m.cb.prem7,3)):"未获取";
    }
    if($("rsValOi")){
      $("rsValOi").textContent=m.drv&&m.drv.oi?fmtPct(m.drv.oi.oi7dPct,1):"—";
      $("rsSubOi").textContent=m.drv&&m.drv.frAnn!=null?("年化费率 "+fmtPct(m.drv.frAnn,1)):"未获取";
    }
    if($("rsValEtf")){
      $("rsValEtf").textContent=m.etf?fmtUsdM(m.etf.sum5):"—";
      $("rsSubEtf").textContent=m.etf?(m.etf.thru?("截至 "+m.etf.thru):"本地/公开数据"):"未获取";
    }
    if($("rsValStb")){
      $("rsValStb").textContent=m.stb?fmtUsdM(m.stb.d7):"—";
      $("rsSubStb").textContent=m.stb?("30日 "+fmtUsdM(m.stb.d30)):"未获取";
    }
    if($("rsValFng")){
      $("rsValFng").textContent=m.fng?String(m.fng.now):"—";
      $("rsSubFng").textContent=m.fng?("7日 "+m.fng.min7+"–"+m.fng.max7):"未获取";
    }
    if($("rsValSth")){
      $("rsValSth").textContent=m.bv&&m.bv.sthRp?("$"+Math.round(m.bv.sthRp).toLocaleString("en-US")):"—";
      $("rsSubSth").textContent=m.bv&&m.bv.soprNow!=null?("24h SOPR "+m.bv.soprNow.toFixed(3)):"未获取";
    }

    var d=new Date(m.ts);
    var hh=String(d.getHours()).padStart(2,"0"),mm=String(d.getMinutes()).padStart(2,"0");
    if($("rsStatusMeta"))$("rsStatusMeta").textContent="已检验 · "+hh+":"+mm;

    renderList();
    renderBacktest(st.bt);
    syncHomeAndDca(st);
  }

  function syncHomeAndDca(st){
    var c=st.crash,r=st.rally;
    var cCls="rs-sync-pill"+(c.level==="danger"?" danger":(c.level==="warn"?" warn":""));
    var rCls="rs-sync-pill"+(r.level==="go"?" go":(r.level==="ready"?" ready":""));
    var hc=$("homeRsCrash"),hr=$("homeRsRally"),hm=$("homeRsMsg");
    if(hc){hc.className=cCls;hc.textContent="大跌 "+c.cnt+"/3 · "+c.label}
    if(hr){hr.className=rCls;hr.textContent="大涨 "+r.cnt+"/3 · "+r.label}
    var homeTxt="";
    if(c.active)homeTxt="极端派发大跌共振（3/3，回测有效）：高位拥挤+老币派发+资金拐弱同向确认，注意防守。";
    else if(r.active)homeTxt="极端出清大涨共振（3/3，回测有效）：低位赔率+STH割肉出清+极恐/回流同向确认，适合按计划加码。";
    else homeTxt="当前未触发经回测验证的 3/3 极端大跌或大涨共振，按常规估值分区与定投纪律执行即可。";
    if(hm)hm.textContent=homeTxt;

    var dc=$("dcaRsCrash"),dr=$("dcaRsRally"),dm=$("dcaRsMsg");
    if(dc){dc.className=cCls;dc.textContent="大跌 "+c.cnt+"/3"}
    if(dr){dr.className=rCls;dr.textContent="大涨 "+r.cnt+"/3"}
    var dcaTxt="";
    if(r.active)dcaTxt="极端出清大涨共振已通过回测并触发（3/3）：除常规/加倍定投外，可按计划分批释放储备金。";
    else if(c.active)dcaTxt="极端派发大跌共振已通过回测并触发（3/3）：建议暂缓额外加仓，留足现金。";
    else dcaTxt="未触发经回测验证的 3/3 极端共振：底部区照常执行本月定投，不因短期波动频繁折腾。";
    if(dm)dm.textContent=dcaTxt;
  }

  function renderList(){
    var box=$("rsDetailList");
    if(!box||!lastState)return;
    var items=activeTab==="crash"?lastState.crash.items:lastState.rally.items;
    var hitCls=activeTab==="crash"?"hit-crash":"hit-rally";
    var html="";
    for(var i=0;i<items.length;i++){
      var it=items[i];
      var scTxt=!it.avail?"缺":(it.hit?"✓ 满足":"未满足");
      var scCls="rs-row-sc"+(it.avail&&it.hit?(" "+hitCls):"");
      html+='<div class="rs-row"><span class="rs-tag">'+it.layer+'</span><div class="rs-row-main"><div class="rs-row-t">'+it.name+'</div><div class="rs-row-v">'+it.val+'</div></div><div class="'+scCls+'">'+scTxt+'</div></div>';
    }
    box.innerHTML=html;
  }

  function run(force){
    if(busy)return;
    if(!force){
      try{
        var raw=localStorage.getItem(CACHE_KEY);
        if(raw){
          var cached=JSON.parse(raw);
          if(cached&&cached.meta&&Date.now()-cached.meta.ts<CACHE_TTL){
            render(cached);
            return;
          }
        }
      }catch(e){}
    }
    busy=true;
    if($("rsStatusMeta"))$("rsStatusMeta").textContent="正在同步实时与 4 年历史数据…";
    Promise.all([
      fetchBitview().catch(function(){return {}}),
      fetchOldCoins().catch(function(){return null}),
      fetchEtf().catch(function(){return null}),
      fetchDerivatives().catch(function(){return {}}),
      fetchCoinbasePremium().catch(function(){return {}}),
      fetchStablecoin().catch(function(){return null}),
      fetchFng().catch(function(){return null})
    ]).then(function(res){
      var st=evaluate({bv:res[0],oc:res[1],etf:res[2],drv:res[3],cb:res[4],stb:res[5],fng:res[6]});
      try{
        var lite={crash:st.crash,rally:st.rally,bt:st.bt,meta:{cb:{livePrem:st.meta.cb&&st.meta.cb.livePrem,prem7:st.meta.cb&&st.meta.cb.prem7},drv:st.meta.drv,etf:st.meta.etf?{sum5:st.meta.etf.sum5,thru:st.meta.etf.thru}:null,bv:{sthRp:st.meta.bv&&st.meta.bv.sthRp,soprNow:st.meta.bv&&st.meta.bv.soprNow},stb:st.meta.stb?{d7:st.meta.stb.d7,d30:st.meta.stb.d30}:null,fng:st.meta.fng?{now:st.meta.fng.now,min7:st.meta.fng.min7,max7:st.meta.fng.max7}:null,ts:st.meta.ts}};
        localStorage.setItem(CACHE_KEY,JSON.stringify(lite));
      }catch(e){}
      render(st);
      busy=false;
    },function(){
      busy=false;
      if($("rsStatusMeta"))$("rsStatusMeta").textContent="同步失败，请点击刷新重试";
    });
  }

  function bind(){
    var tc=$("rsTabCrash"),tr=$("rsTabRally"),rb=$("rsRefreshBtn"),fold=$("resonanceFold");
    if(tc&&tr){
      tc.addEventListener("click",function(){activeTab="crash";tc.classList.add("active");tr.classList.remove("active");renderList();if(lastState)renderBacktest(lastState.bt)});
      tr.addEventListener("click",function(){activeTab="rally";tr.classList.add("active");tc.classList.remove("active");renderList();if(lastState)renderBacktest(lastState.bt)});
    }
    if(rb)rb.addEventListener("click",function(){run(true)});
    if(fold)fold.addEventListener("toggle",function(){if(fold.open&&!lastState)run(false)});
    setTimeout(function(){run(false)},1200);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",bind);
  else bind();

  function jumpToResonance(){
    try{
      if(typeof switchTab==="function")switchTab("value");
      else{
        var tabBtn=document.querySelector('[data-tab-btn="value"],[data-tab="value"]');
        if(tabBtn)tabBtn.click();
      }
      setTimeout(function(){
        var fold=$("resonanceFold");
        if(fold){fold.open=true;fold.scrollIntoView({behavior:"smooth",block:"start"})}
      },80);
    }catch(e){}
  }
  var hj=$("homeRsJump"),dj=$("dcaRsJump");
  if(hj)hj.addEventListener("click",jumpToResonance);
  if(dj)dj.addEventListener("click",jumpToResonance);

  (function initBackup(){
    var SKIP_RE=/(cache|history|daily|monthly|lth_|etf_flows|sg_resonance|addr_dist|cost_bands|age_cost|mining|holder_cohorts|deep_loss|bitview_floor|before_restore|before_import)/i;
    function collectPayload(){
      var data={},count=0;
      for(var i=0;i<localStorage.length;i++){
        var k=localStorage.key(i);
        if(!k||SKIP_RE.test(k))continue;
        if(/^(btc_|sg_|dca_|plan_|hold_)/i.test(k)){
          data[k]=localStorage.getItem(k);
          count++;
        }
      }
      return {app:"SatsGarden",v:"27.3",exportedAt:new Date().toISOString(),count:count,keys:data};
    }
    function setStatus(msg,isErr){
      var el=$("rsBkStatus");
      if(!el)return;
      el.style.color=isErr?"#ef4444":"var(--text-secondary)";
      el.textContent=msg;
    }
    function applyJsonStr(raw){
      try{
        var obj=JSON.parse((raw||"").trim());
        var keys=obj&&obj.keys&&typeof obj.keys==="object"?obj.keys:(obj&&typeof obj==="object"?obj:null);
        if(!keys||!Object.keys(keys).length)throw new Error("empty");
        try{localStorage.setItem("btc_v27_before_restore",JSON.stringify(collectPayload()))}catch(e){}
        var n=0;
        Object.keys(keys).forEach(function(k){
          if(typeof keys[k]==="string"){localStorage.setItem(k,keys[k]);n++}
        });
        setStatus("已恢复 "+n+" 项本机记录，正在刷新页面…",false);
        setTimeout(function(){location.reload()},700);
      }catch(e){
        setStatus("备份格式无效，请检查 JSON 内容是否完整。",true);
      }
    }
    var expBtn=$("rsBkExport"),cpBtn=$("rsBkCopy"),tgBtn=$("rsBkToggleImport"),apBtn=$("rsBkApply"),fi=$("rsBkFile"),pn=$("rsBkPanel");
    var meta=$("rsBkMeta");
    if(meta){
      try{
        var c=collectPayload().count;
        meta.textContent="当前已检测到 "+c+" 项本机持仓/设置记录 · 纯本地无服务器";
      }catch(e){}
    }
    if(expBtn)expBtn.addEventListener("click",function(){
      var p=collectPayload();
      var blob=new Blob([JSON.stringify(p,null,2)],{type:"application/json;charset=utf-8"});
      var a=document.createElement("a");
      a.href=URL.createObjectURL(blob);
      a.download="sats-garden-backup-"+new Date().toISOString().slice(0,10)+".json";
      document.body.appendChild(a);a.click();document.body.removeChild(a);
      setStatus("已导出 "+p.count+" 项本机记录为 JSON 备份文件。",false);
    });
    if(cpBtn)cpBtn.addEventListener("click",function(){
      var txt=JSON.stringify(collectPayload());
      if(navigator.clipboard&&navigator.clipboard.writeText){
        navigator.clipboard.writeText(txt).then(function(){setStatus("已复制备份码到剪贴板，可粘贴到备忘录保存。",false)},function(){
          if(pn)pn.classList.add("open");
          var inp=$("rsBkInput");if(inp){inp.value=txt;inp.select()}
          setStatus("已填入下方文本框，请全选复制保存。",false);
        });
      }else{
        if(pn)pn.classList.add("open");
        var inp=$("rsBkInput");if(inp){inp.value=txt;inp.select()}
        try{document.execCommand("copy");setStatus("已复制备份码到剪贴板。",false)}catch(e){setStatus("请长按下方文本框复制保存。",false)}
      }
    });
    if(tgBtn&&pn)tgBtn.addEventListener("click",function(){pn.classList.toggle("open")});
    if(fi)fi.addEventListener("change",function(e){
      var f=e.target.files&&e.target.files[0];
      if(!f)return;
      var rd=new FileReader();
      rd.onload=function(){
        var inp=$("rsBkInput");
        if(inp)inp.value=String(rd.result||"");
        setStatus("已载入文件 "+f.name+"，点击「确认恢复到本机」生效。",false);
      };
      rd.readAsText(f);
    });
    if(apBtn)apBtn.addEventListener("click",function(){
      var inp=$("rsBkInput");
      applyJsonStr(inp?inp.value:"");
    });
  })();
  window.__sgResonance={refresh:function(){run(true)}};
})();
