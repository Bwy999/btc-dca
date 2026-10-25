#!/usr/bin/env python3
"""V26.6 样式表整理：删除匹配不到任何元素的选择器、被后面同一规则完全覆盖的重复规则、空规则。

用法：python3 tools/css_prune.py source/index.html [--hidden] [--write]
--hidden：再删除只作用于「永远隐藏的元素」的样式（这些元素本身的隐藏规则保留）。
不加 --write 只打印统计。保守原则：
- 选择器里只要有一个类名或 id 在 HTML / 脚本里完全找不到（也找不到用字符串拼接生成的前缀），这个选择器才算无效；
- 含 :is() :where() :not() :has() 的选择器一律保留；
- 同一个 @media 环境里，选择器和声明完全相同的规则，只保留最后一条（前面的必然被覆盖）。
改完必须跑截图回归测试（tests/visual_test.py），截图应逐像素一致。
"""
import re, sys

def split_blocks(css):
    """把一段 CSS 拆成 [(prelude, body_or_None)]；body 为 None 表示 @charset/@import 之类的语句。保留注释为独立项。"""
    out, i, n = [], 0, len(css)
    while i < n:
        if css.startswith("/*", i):
            j = css.find("*/", i + 2); j = n if j < 0 else j + 2
            out.append(("COMMENT", css[i:j])); i = j; continue
        if css[i].isspace():
            j = i
            while j < n and css[j].isspace(): j += 1
            out.append(("WS", css[i:j])); i = j; continue
        # 读取 prelude 到 { 或 ;
        j, q = i, None
        while j < n:
            c = css[j]
            if q:
                if c == "\\": j += 2; continue
                if c == q: q = None
            elif c in "\"'": q = c
            elif css.startswith("/*", j):
                k = css.find("*/", j + 2); j = n if k < 0 else k + 2; continue
            elif c in "{;": break
            j += 1
        if j >= n:
            out.append(("RAW", css[i:])); break
        if css[j] == ";":
            out.append(("STMT", css[i:j + 1])); i = j + 1; continue
        # 找匹配的 }
        depth, k, q = 0, j, None
        while k < n:
            c = css[k]
            if q:
                if c == "\\": k += 2; continue
                if c == q: q = None
            elif c in "\"'": q = c
            elif css.startswith("/*", k):
                m = css.find("*/", k + 2); k = n if m < 0 else m + 2; continue
            elif c == "{": depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0: break
            k += 1
        out.append(("RULE", css[i:j], css[j + 1:k]))
        i = k + 1
    return out

def split_selectors(prelude):
    parts, depth, cur = [], 0, ""
    for c in prelude:
        if c in "([": depth += 1
        elif c in ")]": depth -= 1
        if c == "," and depth == 0: parts.append(cur); cur = ""
        else: cur += c
    parts.append(cur)
    return parts

class Pruner:
    def __init__(self, text, hidden=None):
        self.text = text
        self.hidden = hidden or set()   # 永远隐藏的单个类名 / id（如 .price-unit、#ctDetail）
        self.cache = {}
        self.is_hide_rule = False
        self.removed_sel = 0; self.removed_rules = 0; self.removed_dupes = 0; self.removed_props = 0
    def alive(self, tok):
        if tok in self.cache: return self.cache[tok]
        t = self.text
        ok = re.search(r'(?<![\w-])' + re.escape(tok) + r'(?![\w-])', t) is not None
        if not ok:
            # 字符串拼接生成的类名：如 "tone-"+x、`tone-${x}`
            for m in re.finditer(r'-', tok):
                pre = tok[:m.start() + 1]
                if len(pre) >= 3 and re.search(re.escape(pre) + r'(["\'`]|\$\{)', t):
                    ok = True; break
        self.cache[tok] = ok
        return ok
    def selector_dead(self, sel):
        if re.search(r':(is|where|not|has)\(', sel): return False
        if self.hidden and not self.is_hide_rule:
            toks = set(re.findall(r'([.#]-?[A-Za-z_][\w-]*)', re.sub(r'\[[^\]]*\]', '', sel)))
            if toks & self.hidden: return True
        sel2 = re.sub(r'\[[^\]]*\]', '', sel)                 # 属性选择器里的值不算类名
        sel2 = re.sub(r'::?[\w-]+(\([^)]*\))?', '', sel2)       # 伪类、伪元素
        toks = re.findall(r'[.#](-?[A-Za-z_][\w-]*)', sel2)
        return any(not self.alive(tk) for tk in toks)
    def prune(self, css, ctx=""):
        items = split_blocks(css)
        # 第一遍：处理每条规则（递归进入 @media / @supports）
        res = []
        for it in items:
            if it[0] != "RULE": res.append(it); continue
            pre, body = it[1], it[2]
            p = pre.strip()
            if p.startswith("@media") or p.startswith("@supports") or p.startswith("@layer") or p.startswith("@container"):
                inner = self.prune(body, ctx + "|" + p)
                if inner.strip(): res.append(("RULE", pre, inner))
                else: self.removed_rules += 1
                continue
            if p.startswith("@"):
                res.append(it); continue
            sels = split_selectors(pre)
            self.is_hide_rule = bool(re.search(r'display\s*:\s*none\s*!important', body)) and not ctx
            keep = [s for s in sels if not self.selector_dead(s)]
            self.removed_sel += len(sels) - len(keep)
            if not keep or not body.strip():
                self.removed_rules += 1; continue
            newpre = ",".join(keep) if len(keep) != len(sels) else pre
            res.append(("RULE", newpre, body))
        # 第二遍：同一环境里，选择器完全相同的前后两条规则，前一条里被后一条重新声明的属性删除
        res = self.drop_overridden(res)
        # 第三遍：同一环境里完全相同的规则，只保留最后一条
        seen = {}
        for idx, it in enumerate(res):
            if it[0] == "RULE" and not it[1].strip().startswith("@"):
                key = (re.sub(r'\s+', ' ', it[1].strip()), re.sub(r'\s+', ' ', it[2].strip()))
                if key in seen: seen[key].append(idx)
                else: seen[key] = [idx]
        drop = set()
        for key, idxs in seen.items():
            if len(idxs) > 1:
                drop.update(idxs[:-1]); self.removed_dupes += len(idxs) - 1
        out = []
        for idx, it in enumerate(res):
            if idx in drop: continue
            if it[0] == "RULE": out.append(it[1] + "{" + it[2] + "}")
            elif it[0] in ("COMMENT", "WS", "STMT", "RAW"): out.append(it[1])
        return "".join(out)

NEWER = re.compile(r'(dvh|svh|lvh|color-mix|env\(|@supports|-webkit-|-moz-)')

def parse_decls(body):
    out, cur, depth, q = [], "", 0, None
    for c in body:
        if q:
            cur += c
            if c == q: q = None
            continue
        if c in "\"'": q = c
        elif c == "(": depth += 1
        elif c == ")": depth -= 1
        if c == ";" and depth == 0: out.append(cur); cur = ""
        else: cur += c
    if cur.strip(): out.append(cur)
    res = []
    for d in out:
        if ":" not in d or d.strip().startswith("/*"): res.append((None, d)); continue
        prop, val = d.split(":", 1)
        res.append((prop.strip().lower(), d))
    return res

def _drop_overridden(self, res):
    rules = [(i, it) for i, it in enumerate(res) if it[0] == "RULE" and not it[1].strip().startswith("@")]
    groups = {}
    for i, it in rules:
        groups.setdefault(re.sub(r'\s+', ' ', it[1].strip()), []).append(i)
    res = list(res)
    for sel, idxs in groups.items():
        if len(idxs) < 2: continue
        for a_pos, a in enumerate(idxs[:-1]):
            later = set()
            for b in idxs[a_pos + 1:]:
                for prop, d in parse_decls(res[b][2]):
                    if prop and not NEWER.search(d): later.add((prop, "!important" in d))
            decls = parse_decls(res[a][2]); keep = []
            for prop, d in decls:
                if prop and not NEWER.search(d):
                    imp = "!important" in d
                    if (prop, True) in later or ((prop, False) in later and not imp):
                        self.removed_props += 1; continue
                keep.append(d)
            body = ";".join(x.strip("\n") for x in keep)
            if body.strip(" ;\n\t"): res[a] = ("RULE", res[a][1], body)
            else: res[a] = ("DROP",); self.removed_rules += 1
    return [it for it in res if it[0] != "DROP"]

Pruner.drop_overridden = _drop_overridden

def find_hidden(css):
    """顶层、无条件的 display:none!important 规则里，只由一个类名或 id 组成的选择器 = 永远隐藏的元素。"""
    hidden = set()
    for it in split_blocks(css):
        if it[0] != "RULE" or it[1].strip().startswith("@"): continue
        if not re.search(r'display\s*:\s*none\s*!important', it[2]): continue
        for sel in split_selectors(it[1]):
            sel = sel.strip()
            if re.fullmatch(r'[.#]-?[A-Za-z_][\w-]*', sel): hidden.add(sel)
    # 有任何规则用 !important 把它重新显示出来（display 不是 none），就不算永远隐藏
    def walk(c):
        for it in split_blocks(c):
            if it[0] != "RULE": continue
            if it[1].strip().startswith("@"):
                yield from walk(it[2]); continue
            yield it
    for it in walk(css):
        m = re.search(r'display\s*:\s*([a-z-]+)\s*!important', it[2])
        if m and m.group(1) != "none":
            for tok in list(hidden):
                if re.search(re.escape(tok) + r'(?![\w-])', it[1]): hidden.discard(tok)
    return hidden

def main():
    path = sys.argv[1]; write = "--write" in sys.argv
    src = open(path, encoding="utf-8").read()
    blocks = list(re.finditer(r'(<style[^>]*>)(.*?)(</style>)', src, re.S))
    text = re.sub(r'<style[^>]*>.*?</style>', ' ', src, flags=re.S)
    allcss = "\n".join(m.group(2) for m in blocks)
    hidden = find_hidden(allcss) if "--hidden" in sys.argv else set()
    if hidden: print("永远隐藏的元素：", " ".join(sorted(hidden)))
    pr = Pruner(text, hidden)
    out, last, before, after = [], 0, 0, 0
    for m in blocks:
        css = m.group(2); before += len(css.encode())
        new = pr.prune(css); after += len(new.encode())
        out.append(src[last:m.start(2)]); out.append(new); last = m.end(2)
    out.append(src[last:])
    print(f"样式 {before/1024:.1f} KB → {after/1024:.1f} KB；删除无效选择器 {pr.removed_sel} 个、空规则或无效规则 {pr.removed_rules} 条、被覆盖的重复规则 {pr.removed_dupes} 条、被后面同名规则重写的属性 {pr.removed_props} 处")
    if write: open(path, "w", encoding="utf-8").write("".join(out))

if __name__ == "__main__":
    main()
