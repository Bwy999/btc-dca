
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
