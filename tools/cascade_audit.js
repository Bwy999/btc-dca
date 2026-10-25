// V26.9 样式层级审计（在页面里运行）。
// 对当前页面状态，逐个元素计算每个 CSS 属性最终生效的是哪一条声明，返回：
//   rules: [{sheet, idx, sel, media}]              全部样式规则（文档顺序）
//   stat:  {"规则号|属性": [匹配次数, 生效次数, 被安全覆盖次数, 被其他方式覆盖次数]}
// 「安全覆盖」= 覆盖它的规则，去掉 html/body/:root/.focus-layout/.terminal-ui 这类永远存在的前缀后，
// 选择器与它完全相同、媒体条件相同或无条件、优先级不低于它。这样的覆盖在任何状态下都成立。
(function () {
  "use strict";
  var NEWER = /(dvh|svh|lvh|dvw|svw|lvw|color-mix|env\(|clamp\(|min\(|max\(|:has)/;
  var CONST = /^(?:html|body|:root|\.focus-layout|\.terminal-ui)+$/;
  function splitTop(s, ch) {
    var out = [], d = 0, cur = "", q = null;
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (q) { cur += c; if (c === q) q = null; continue; }
      if (c === '"' || c === "'") { q = c; cur += c; continue; }
      if (c === "(" || c === "[") d++;
      else if (c === ")" || c === "]") d--;
      if (c === ch && d === 0) { out.push(cur); cur = ""; } else cur += c;
    }
    out.push(cur);
    return out;
  }
  function spec(sel) {
    // [a,b,c]
    var a = 0, b = 0, c = 0, i = 0, s = sel;
    while (i < s.length) {
      var ch = s[i];
      if (ch === "#") { a++; i++; while (i < s.length && /[\w-]/.test(s[i])) i++; continue; }
      if (ch === ".") { b++; i++; while (i < s.length && /[\w-]/.test(s[i])) i++; continue; }
      if (ch === "[") { b++; var d = 0; while (i < s.length) { if (s[i] === "[") d++; if (s[i] === "]") { d--; if (!d) { i++; break; } } i++; } continue; }
      if (ch === ":") {
        var pe = s[i + 1] === ":"; i += pe ? 2 : 1;
        var nm = ""; while (i < s.length && /[\w-]/.test(s[i])) nm += s[i++];
        var arg = null;
        if (s[i] === "(") { var d2 = 0, st = i; while (i < s.length) { if (s[i] === "(") d2++; if (s[i] === ")") { d2--; if (!d2) { i++; break; } } i++; } arg = s.slice(st + 1, i - 1); }
        if (pe || /^(before|after|first-letter|first-line)$/.test(nm)) { c++; continue; }
        if (nm === "where") continue;
        if (/^(is|not|has|matches|-webkit-any)$/.test(nm) && arg) {
          var best = [0, 0, 0]; splitTop(arg, ",").forEach(function (x) { var sp = spec(x.trim()); if (cmp(sp, best) > 0) best = sp; });
          a += best[0]; b += best[1]; c += best[2]; continue;
        }
        if (/^nth-(child|last-child)$/.test(nm) && arg && / of /.test(arg)) { var sp2 = spec(arg.split(" of ")[1]); a += sp2[0]; b += sp2[1] + 1; c += sp2[2]; continue; }
        b++; continue;
      }
      if (/[a-zA-Z]/.test(ch)) { c++; while (i < s.length && /[\w-]/.test(s[i])) i++; continue; }
      i++;
    }
    return [a, b, c];
  }
  function cmp(x, y) { for (var i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; }
  function pseudoOf(sel) {
    var m = sel.match(/::?(before|after|first-letter|first-line|placeholder|selection|marker|backdrop|-webkit-[\w-]+)\s*$/);
    if (!m) return { host: sel, pe: "" };
    var host = sel.slice(0, m.index).trim();
    return { host: host === "" || /[>+~]$/.test(host) ? (host + "*") : host, pe: m[1] };
  }
  function norm(sel) {
    return sel.replace(/\s*([>+~,])\s*/g, "$1").replace(/\s+/g, " ").replace(/"/g, "'").trim();
  }
  function stripConst(sel) {
    // 拆成复合选择器，去掉开头永远存在的部分
    var parts = [], cur = "", d = 0, q = null, s = norm(sel);
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (q) { cur += c; if (c === q) q = null; continue; }
      if (c === "'" ) { q = c; cur += c; continue; }
      if (c === "(" || c === "[") d++; else if (c === ")" || c === "]") d--;
      if (d === 0 && (c === " " || c === ">" || c === "+" || c === "~")) { parts.push(cur); parts.push(c); cur = ""; continue; }
      cur += c;
    }
    parts.push(cur);
    while (parts.length > 2 && CONST.test(parts[0]) && (parts[1] === " " || parts[1] === ">")) parts.splice(0, 2);
    return parts.join("");
  }
  var rules = [], styleSheets = [].slice.call(document.styleSheets);
  var local = {};
  function walk(list, sheetIdx, media) {
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (r.type === 1) { local[sheetIdx] = (local[sheetIdx] || 0) + 1; rules.push({ sheet: sheetIdx, local: local[sheetIdx] - 1, rule: r, sel: r.selectorText, media: media }); }
      else if (r.type === 4) walk(r.cssRules, sheetIdx, media.concat(["@media " + r.media.mediaText]));
      else if (r.type === 12) walk(r.cssRules, sheetIdx, media.concat(["@supports " + r.conditionText]));
    }
  }
  styleSheets.forEach(function (sh, si) { try { walk(sh.cssRules, si, []); } catch (e) {} });
  function mediaOn(m) {
    return m.every(function (x) {
      if (x.indexOf("@media ") === 0) return matchMedia(x.slice(7)).matches;
      if (x.indexOf("@supports ") === 0) { try { return CSS.supports(x.slice(10)); } catch (e) { return true; } }
      return true;
    });
  }
  // 每个元素 + 伪元素 → 每个属性的候选声明
  var cand = new Map(), bad = [];
  function push(el, pe, prop, entry) {
    var k = cand.get(el); if (!k) { k = {}; cand.set(el, k); }
    var key = pe + "|" + prop; (k[key] || (k[key] = [])).push(entry);
  }
  rules.forEach(function (R, idx) {
    R.on = mediaOn(R.media);
    if (!R.on) return;
    var st = R.rule.style, props = [];
    for (var j = 0; j < st.length; j++) props.push(st[j]);
    if (!props.length) return;
    splitTop(R.sel, ",").forEach(function (alt) {
      alt = alt.trim(); var p = pseudoOf(alt), els;
      try { els = document.querySelectorAll(p.host); } catch (e) { bad.push(idx + ":" + alt); return; }
      if (!els.length) return;
      var sp = spec(alt), base = stripConst(p.host) + (p.pe ? "::" + p.pe : "");
      els.forEach(function (el) {
        props.forEach(function (pr) {
          push(el, p.pe, pr, { idx: idx, sp: sp, imp: st.getPropertyPriority(pr) === "important", base: base, media: R.media.join(" && "), val: st.getPropertyValue(pr) });
        });
      });
    });
  });
  var stat = {}, sig = styleSheets.map(function (sh) { var n = sh.ownerNode; return n && n.tagName === "STYLE" ? (n.textContent.length + ":" + n.textContent.slice(0, 40)) : "x"; });
  function S(k) { return stat[k] || (stat[k] = [0, 0, 0, 0]); }
  function rid(idx) { var R = rules[idx]; return sig[R.sheet] + "#" + R.local; }
  cand.forEach(function (byProp, el) {
    var inl = el.style;
    Object.keys(byProp).forEach(function (key) {
      var list = byProp[key], pe = key.split("|")[0], prop = key.slice(pe.length + 1);
      var w = null;
      list.forEach(function (e) {
        if (!w) { w = e; return; }
        if (e.imp !== w.imp) { if (e.imp) w = e; return; }
        var c = cmp(e.sp, w.sp); if (c > 0 || (c === 0 && e.idx > w.idx)) w = e;
      });
      var inlineWins = !pe && inl && inl.getPropertyValue(prop) !== "" && (inl.getPropertyPriority(prop) === "important" || !w.imp);
      list.forEach(function (e) {
        var s = S(rid(e.idx) + "|" + prop); s[0]++;
        if (!inlineWins && e === w) { s[1]++; return; }
        var safe = !inlineWins && !NEWER.test(w.val) && w.idx !== e.idx && w.base === e.base && (w.media === "" || w.media === e.media) && (w.imp || !e.imp) &&
          (cmp(w.sp, e.sp) > 0 || (cmp(w.sp, e.sp) === 0 && w.idx > e.idx));
        if (safe) s[2]++; else s[3]++;
      });
    });
  });
  return {
    rules: rules.map(function (R, i) { return { id: rid(i), sel: R.sel, media: R.media.join(" && ") }; }),
    sheets: styleSheets.map(function (sh) { var n = sh.ownerNode; return n && n.tagName === "STYLE" ? (n.textContent.length + ":" + n.textContent.slice(0, 60)) : "" }),
    stat: stat, bad: bad.slice(0, 20)
  };
})()
