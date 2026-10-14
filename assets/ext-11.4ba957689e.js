
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
