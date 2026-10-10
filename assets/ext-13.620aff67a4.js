
(function(){
  "use strict";
  // Beta 20：通用「信号之后 BTC 怎么走」。信号 = 条件首次成立，且距上一次信号 ≥30 天；
  // 对比信号之后 30 / 90 / 180 天的 BTC 涨跌中位数、上涨概率，与「任意一天」的同期表现。
  var H=[30,90,180];
  function en(){return window.BTC_LANG==="en"}
  function $(id){return document.getElementById(id)}
  function addDays(d,n){return new Date(Date.parse(d+"T00:00:00Z")+n*864e5).toISOString().slice(0,10)}
  function med(a){if(!a.length)return null;var b=a.slice().sort(function(x,y){return x-y}),m=b.length>>1;return b.length%2?b[m]:(b[m-1]+b[m])/2}
  function pct(v){return v==null?"--":(v>=0?"+":"")+(v*100).toFixed(1)+"%"}
  function quant(arr,q){var b=arr.slice().sort(function(x,y){return x-y});return b[Math.min(b.length-1,Math.floor(b.length*q))]}
  // rows: [{day,v,price}]
  function analyse(rows,cond){
    var price={};rows.forEach(function(r){if(r.price>0)price[r.day]=r.price});
    var fwd=function(d,h){var p0=price[d];if(!p0)return null;for(var k=0;k<4;k++){var p=price[addDays(d,h+k)];if(p)return p/p0-1}return null};
    var ev=[],last=null,prevOn=false;
    rows.forEach(function(r){var on=!!cond(r);if(on&&!prevOn&&(!last||Date.parse(r.day)-Date.parse(last)>=30*864e5)){ev.push(r.day);last=r.day}prevOn=on});
    var out={events:ev,sig:{},base:{}};
    H.forEach(function(h){out.sig[h]=ev.map(function(d){return fwd(d,h)}).filter(function(x){return x!=null});out.base[h]=[];for(var i=0;i<rows.length;i+=3){var v=fwd(rows[i].day,h);if(v!=null)out.base[h].push(v)}});
    out.fwd=fwd;return out;
  }
  function cellHtml(arr){if(!arr||!arr.length)return '<span>--</span>';var m=med(arr),up=arr.filter(function(x){return x>0}).length/arr.length;
    return '<span><b style="color:'+(m>=0?"var(--market-positive)":"var(--market-negative)")+'">'+pct(m)+'</b><small>'+(en()?"up ":"上涨 ")+Math.round(up*100)+'% · '+(en()?"n=":"样本 ")+arr.length+'</small></span>'}
  function table(el,cols){
    var E=en(),head='<div class="rv-tr rv-th"><span></span>'+cols.map(function(c){return '<span>'+c.label+'</span>'}).join("")+'</div>';
    var body=H.map(function(h){return '<div class="rv-tr"><span>'+(E?"After "+h+" days":h+" 天后")+'</span>'+cols.map(function(c){return cellHtml(c.data[h])}).join("")+'</div>'}).join("");
    el.innerHTML=head+body;
  }
  function verdict(sig,base){var a=med(sig[90]||[]),b=med(base[90]||[]);if(a==null||b==null||(sig[90]||[]).length<3)return null;var d=a-b;return d>.1?"good":d<-.1?"bad":"flat"}
  function vTxt(v){var E=en();return v==="good"?(E?"historically bullish":"历史上偏利好"):v==="bad"?(E?"historically bearish":"历史上偏利空"):(E?"no clear edge":"影响不明显")}
  // —— LTH_PSIL ——
  function paintPsil(){
    var d=typeof lthPsilData!=="undefined"?lthPsilData:null,box=$("btPsil");if(!box)return;
    if(!d||!Array.isArray(d.series)||d.series.length<365){box.hidden=true;return}
    var rows=d.series.map(function(r){return{day:r.day,v:+r.value,price:+r.price}}),p90=quant(rows.map(function(r){return r.v}),.9);
    var A=analyse(rows,function(r){return r.v>=p90});box.hidden=A.events.length<2;if(box.hidden)return;
    var E=en(),v=verdict(A.sig,A.base);
    $("btPsilRule").textContent=E?"Signal = LTH supply in loss first reaching its historical top 10% (≥"+p90.toFixed(1)+"%), at least 30 days apart":"信号 = 长期持有者浮亏占比首次进入历史最高的 10%（≥"+p90.toFixed(1)+"%），两次至少相隔 30 天";
    table($("btPsilTable"),[{label:E?"After a signal":"信号之后",data:A.sig},{label:E?"Any day":"任意一天",data:A.base}]);
    var le=A.events[A.events.length-1],cur=rows[rows.length-1].v;
    $("btPsilNote").innerHTML=(E?A.events.length+" signals since "+rows[0].day.slice(0,4)+"; latest "+le+". Now "+cur.toFixed(1)+"% ("+(cur>=p90?"in the signal zone":"not in the signal zone")+"). Verdict: ":"自 "+rows[0].day.slice(0,4)+" 年以来共 "+A.events.length+" 次信号，最近一次 "+le+"。当前 "+cur.toFixed(1)+"%（"+(cur>=p90?"处于信号区":"未进入信号区")+"）。结论：")+(v?'<span class="bt-verdict '+v+'">'+vTxt(v)+'</span>':"--")+(E?" Past results do not guarantee the future.":" 历史表现不代表未来。");
  }
  // —— LTH NUPL ——
  window.paintNuplBT=function(){
    var raw=window.__nuplRows,box=$("btNupl");if(!box)return;
    if(!Array.isArray(raw)||raw.length<365){box.hidden=true;return}
    var rows=raw.map(function(r){return{day:r[0],v:+r[1],price:+r[2]}});
    var hi=analyse(rows,function(r){return r.v>=.5}),lo=analyse(rows,function(r){return r.v<0});
    box.hidden=hi.events.length+lo.events.length<2;if(box.hidden)return;
    var E=en();
    $("btNuplRule").textContent=E?"Signals: LTH NUPL first reaching ≥0.5 (rich profit) or first dropping below 0 (overall loss), at least 30 days apart":"信号：长期持有者 NUPL 首次升到 ≥0.5（利润丰厚），或首次跌到 0 以下（整体浮亏），两次至少相隔 30 天";
    table($("btNuplTable"),[{label:E?"≥0.5 rich profit":"≥0.5 赚很多",data:hi.sig},{label:E?"<0 in loss":"<0 整体亏损",data:lo.sig},{label:E?"Any day":"任意一天",data:hi.base}]);
    var cur=rows[rows.length-1].v,vh=verdict(hi.sig,hi.base),vl=verdict(lo.sig,lo.base);
    $("btNuplNote").innerHTML=(E?"Now "+cur.toFixed(3)+" ("+(cur>=.5?"rich-profit zone":cur<0?"loss zone":"between the two")+"). ≥0.5: ":"当前 "+cur.toFixed(3)+"（"+(cur>=.5?"处于利润丰厚区":cur<0?"处于整体浮亏区":"介于两者之间")+"）。≥0.5：")
      +(vh?'<span class="bt-verdict '+vh+'">'+vTxt(vh)+'</span>':"--")+(E?"  <0: ":"　<0：")+(vl?'<span class="bt-verdict '+vl+'">'+vTxt(vl)+'</span>':"--")+(E?" Past results do not guarantee the future.":" 历史表现不代表未来。");
  };
  ["renderLthPsilModule"].forEach(function(n){var o=window[n];if(typeof o!=="function")return;window[n]=function(){var r=o.apply(this,arguments);try{paintPsil()}catch(e){}return r}});
  try{paintPsil();window.paintNuplBT()}catch(e){}
  window.addEventListener("themechange",function(){try{paintPsil();window.paintNuplBT()}catch(e){}});
})();
