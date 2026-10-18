
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
    $("qrChecked").textContent=(en?"Status checked · ":"状态核对 · ")+day;
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
