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
})();
