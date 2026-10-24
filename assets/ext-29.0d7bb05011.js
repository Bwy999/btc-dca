
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
