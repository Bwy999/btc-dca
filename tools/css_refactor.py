#!/usr/bin/env python3
"""BTC Intelligence 样式清理工具（V26.2.2）

只做「可证明不改变渲染结果」的清理：
  1. 同一上下文（相同的 @media / @supports 链）、同一选择器中，被后面同名属性覆盖的声明。
     - 后者重要性 >= 前者才算覆盖；
     - 后者的值用到较新的 CSS 特性（color-mix、env、clamp 等）时保留前者，作为旧浏览器的回退。
  2. 选择器里引用的 class / id 在 HTML 与脚本中完全不存在的选择器（死选择器）。
     - 由脚本拼接出来的 class 前缀（如 "lvl-"+n）一律保留。
  3. 清理后变空的规则与空的 @media。

用法：python3 tools/css_refactor.py index.html [--write]
不带 --write 时只输出统计。
"""
import re
import sys

RISKY_VALUE = re.compile(r"color-mix\(|env\(|clamp\(|\bmin\(|\bmax\(|dvh|svh|lvh|dvw|oklch|oklab|\blab\(|\blch\(|\bcolor\(|-webkit-|-moz-|image-set\(|fit-content|round\(|mod\(|rem\(", re.I)


# ---------- 解析 ----------
def strip_comments(css):
    out, i, n = [], 0, len(css)
    while i < n:
        if css.startswith("/*", i):
            j = css.find("*/", i + 2)
            i = n if j < 0 else j + 2
            continue
        c = css[i]
        if c in "\"'":
            j = i + 1
            while j < n and css[j] != c:
                j += 2 if css[j] == "\\" else 1
            out.append(css[i:j + 1]); i = j + 1; continue
        out.append(c); i += 1
    return "".join(out)


def find_block_end(css, i):
    """i 指向 '{' 之后；返回匹配 '}' 的位置。"""
    depth, n = 1, len(css)
    while i < n:
        c = css[i]
        if c in "\"'":
            j = i + 1
            while j < n and css[j] != c:
                j += 2 if css[j] == "\\" else 1
            i = j + 1; continue
        if c == "(":
            # 括号内可能有 ';' 或 '{'（极少见），跳过
            d, j = 1, i + 1
            while j < n and d:
                if css[j] == "(": d += 1
                elif css[j] == ")": d -= 1
                j += 1
            i = j; continue
        if c == "{": depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return i
        i += 1
    raise ValueError("unbalanced braces")


def split_top(s, sep):
    parts, depth, buf, q = [], 0, [], None
    for c in s:
        if q:
            buf.append(c)
            if c == q: q = None
            continue
        if c in "\"'": q = c
        elif c in "([": depth += 1
        elif c in ")]": depth -= 1
        if c == sep and depth == 0:
            parts.append("".join(buf)); buf = []
        else:
            buf.append(c)
    parts.append("".join(buf))
    return parts


def parse_decls(body):
    decls = []
    for part in split_top(body, ";"):
        part = part.strip()
        if not part or ":" not in part:
            continue
        prop, val = part.split(":", 1)
        prop = prop.strip(); val = val.strip()
        imp = False
        m = re.search(r"!\s*important\s*$", val, re.I)
        if m:
            imp = True; val = val[:m.start()].strip()
        decls.append([prop, val, imp])
    return decls


def parse(css, ctx=()):
    nodes, i, n = [], 0, len(css)
    while i < n:
        while i < n and css[i] in " \t\r\n;":
            i += 1
        if i >= n:
            break
        if css.startswith("/*", i):
            k = css.find("*/", i + 2); k = n if k < 0 else k + 2
            nodes.append({"t": "raw", "text": css[i:k]}); i = k; continue
        j = i
        # 找到下一个 '{' 或 ';'（@import 等）
        while j < n and css[j] not in "{;":
            if css[j] in "\"'":
                q = css[j]; j += 1
                while j < n and css[j] != q:
                    j += 2 if css[j] == "\\" else 1
            j += 1
        if j >= n:
            break
        prelude = css[i:j].strip()
        if css[j] == ";":
            nodes.append({"t": "raw", "text": prelude + ";"}); i = j + 1; continue
        end = find_block_end(css, j + 1)
        body = css[j + 1:end]
        if prelude.startswith("@"):
            name = prelude.split()[0].lower()
            if name in ("@media", "@supports", "@layer", "@container"):
                nodes.append({"t": "at", "prelude": prelude, "children": parse(body, ctx + (prelude,))})
            else:  # @keyframes、@font-face 等原样保留
                nodes.append({"t": "raw", "text": prelude + "{" + body + "}"})
        else:
            nodes.append({"t": "rule", "sel": prelude, "decls": parse_decls(strip_comments(body)), "ctx": ctx})
        i = end + 1
    return nodes


def serialize(nodes):
    out = []
    for nd in nodes:
        if nd["t"] == "raw":
            out.append(nd["text"])
        elif nd["t"] == "at":
            inner = serialize(nd["children"])
            if inner.strip():
                out.append(nd["prelude"] + "{" + inner + "}")
        else:
            if not nd["decls"]:
                continue
            body = ";".join(p + ":" + v + ("!important" if imp else "") for p, v, imp in nd["decls"])
            out.append(nd["sel"] + "{" + body + "}")
    return "\n".join(out)


def walk_rules(nodes):
    for nd in nodes:
        if nd["t"] == "rule":
            yield nd
        elif nd["t"] == "at":
            yield from walk_rules(nd["children"])


# ---------- 清理 ----------
def norm_sel(sel):
    return re.sub(r"\s+", " ", re.sub(r"\s*([>+~,])\s*", r"\1", sel.strip()))


def dedupe(nodes):
    """删除被「同上下文、同选择器、同属性」的后续声明覆盖的声明。"""
    rules = list(walk_rules(nodes))
    seen = {}  # key -> [后面存在非风险的 !important 声明, 后面存在非风险的普通声明]
    removed = 0
    for r in reversed(rules):
        key0 = (r["ctx"], norm_sel(r["sel"]))
        keep = []
        for prop, val, imp in reversed(r["decls"]):
            k = key0 + (prop.lower(),)
            f = seen.setdefault(k, [False, False])
            if (imp and f[0]) or (not imp and (f[0] or f[1])):
                removed += 1
                continue
            keep.append([prop, val, imp])
            if not RISKY_VALUE.search(val):
                if imp: f[0] = True
                else: f[1] = True
        r["decls"] = list(reversed(keep))
    return removed


def dynamic_prefixes(js):
    pre = set(re.findall(r"[\"'`]([a-zA-Z][\w-]*-)[\"'`]\s*\+", js))
    pre |= set(re.findall(r"`[^`]*?\b([a-zA-Z][\w-]*-)\$\{", js))
    pre |= set(re.findall(r"[\"'` ]([a-zA-Z][\w-]*-)\"\s*\+", js))
    return pre


def dead_selectors(nodes, source):
    tokens = set(re.findall(r"[A-Za-z_][\w-]*", source))
    prefixes = dynamic_prefixes(source)
    removed = 0
    for r in walk_rules(nodes):
        sels = split_top(r["sel"], ",")
        keep = []
        for sel in sels:
            names = re.findall(r"[.#](-?[A-Za-z_][\w-]*)", re.sub(r"\[[^\]]*\]|\"[^\"]*\"|'[^']*'", "", sel))
            dead = False
            for nm in names:
                if nm in tokens:
                    continue
                if any(nm.startswith(p) for p in prefixes):
                    continue
                dead = True; break
            if dead:
                removed += 1
            else:
                keep.append(sel)
        if not keep:
            r["decls"] = []
        elif len(keep) != len(sels):
            r["sel"] = ",".join(k.strip() for k in keep)
    return removed


def main():
    path = sys.argv[1]; write = "--write" in sys.argv
    html = open(path, encoding="utf-8").read()
    if "<style" not in html:
        raise SystemExit("这个文件里没有内联样式。请对源文件 index.html 运行本工具（构建后的 assets/*.css 由 tools/build.py 生成，不要直接修改）。")
    blocks = list(re.finditer(r"(<style[^>]*>)(.*?)(</style>)", html, re.S))
    source = re.sub(r"<style[^>]*>.*?</style>", "", html, flags=re.S)
    stats = []
    out = html
    for m in reversed(blocks):
        css = m.group(2)
        nodes = parse(css)
        d = dedupe(nodes)
        s = dead_selectors(nodes, source)
        d += dedupe(nodes)
        new = serialize(nodes)
        stats.append((len(css), len(new), d, s))
        out = out[:m.start(2)] + new + out[m.end(2):]
    for before, after, d, s in reversed(stats):
        print(f"style block: {before/1024:.1f}KB -> {after/1024:.1f}KB · overridden decls removed {d} · dead selectors removed {s}")
    if write:
        open(path, "w", encoding="utf-8").write(out)


if __name__ == "__main__":
    main()
