#!/usr/bin/env python3
"""V26.9 合并同一选择器的多条规则（静态、不改变层叠结果）。

同一媒体条件下、选择器完全相同的多条规则，全部合并进最后一条：
- 前面规则里的声明，如果后面那条已经声明了同一组属性（简写展开后完全覆盖），说明它早已被覆盖 → 删除；
- 如果后面没有声明这些属性，而且两条规则之间的任何规则都没有声明这些属性 → 移到最后一条里；
- 其他情况（部分重叠、!important 冲突、中间有别的规则争同一属性、带浏览器前缀）→ 原地不动。
移空的规则删除。改完必须跑截图回归测试。

用法：python3 tools/css_merge_rules.py source/index.html [--write]
"""
import re, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from css_prune import split_blocks
from css_merge_layers import decls

def norm(sel):
    return re.sub(r'\s+', ' ', re.sub(r'\s*([>+~,])\s*', r'\1', sel.strip()))

def main():
    src = sys.argv[1]; write = "--write" in sys.argv
    html = open(src, encoding="utf-8").read()
    blocks = list(re.finditer(r'(<style[^>]*>)(.*?)(</style>)', html, re.S))
    # 1. 文档顺序列出所有样式规则
    rules = []   # dict(bi, path, media, sel, decls)
    def walk(css, bi, media, path):
        for k, it in enumerate(split_blocks(css)):
            if it[0] != "RULE": continue
            pre = it[1].strip()
            if pre.startswith("@media") or pre.startswith("@supports"):
                walk(it[2], bi, media + (re.sub(r'\s+', ' ', pre),), path + (k,))
            elif pre.startswith("@"):
                continue
            else:
                rules.append({"bi": bi, "path": path + (k,), "media": media, "sel": norm(it[1]), "pre": it[1],
                              "decls": [d for d in decls(it[2]) if d.strip()]})
    for bi, m in enumerate(blocks): walk(m.group(2), bi, (), ())
    # 2. 展开每条声明的分属性
    allds = sorted({d.strip() for r in rules for d in r["decls"] if ":" in d})
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page()
        exp = pg.evaluate("""(list)=>{const out={};for(const d of list){const s=document.createElement('div').style;s.cssText=d;const a=[];for(let i=0;i<s.length;i++)a.push(s[i]);out[d]=a}return out}""", allds)
        b.close()
    def fam(d):
        return set(exp.get(d.strip(), []))
    def imp(d): return "!important" in d
    def vendor(d):
        n = d.split(":", 1)[0].strip().lower(); return n.startswith("-") and not n.startswith("--")
    # 每条规则声明的分属性集合（用于「中间有没有别的规则争同一属性」）
    rfam = [set().union(*[fam(d) for d in r["decls"] if ":" in d]) if r["decls"] else set() for r in rules]
    groups = {}
    for i, r in enumerate(rules): groups.setdefault((r["media"], r["sel"]), []).append(i)
    moved = dropped = merged_rules = 0
    for key, idxs in groups.items():
        if len(idxs) < 2: continue
        L = idxs[-1]
        for E in reversed(idxs[:-1]):
            keep = []
            Lfam = {}; Lnew = set()
            NEWER = re.compile(r'(dvh|svh|lvh|dvw|svw|lvw|color-mix|env\(|clamp\(|min\(|max\(|:has)')
            for d in rules[L]["decls"]:
                for lh in fam(d):
                    Lfam[lh] = imp(d)
                    if NEWER.search(d): Lnew.add(lh)
            for d in rules[E]["decls"]:
                f = fam(d)
                if ":" not in d or not f or vendor(d): keep.append(d); continue
                overlap = f & set(Lfam)
                if overlap:
                    if f <= set(Lfam) and all(Lfam[x] or not imp(d) for x in f) and not (f & Lnew):
                        dropped += 1; continue          # 早已被最后一条覆盖
                    keep.append(d); continue            # 部分重叠或 !important 冲突：不动
                between = any(rfam[j] & f for j in range(E + 1, L))
                if between: keep.append(d); continue
                rules[L]["decls"].append(d.strip()); moved += 1
                for lh in f: Lfam[lh] = imp(d)
                rfam[L] |= f
            if len(keep) != len(rules[E]["decls"]):
                rules[E]["decls"] = keep; rfam[E] = set().union(*[fam(x) for x in keep if ":" in x]) if keep else set()
                if not keep: merged_rules += 1
    print("移入最后一条的声明", moved, "删除的早已被覆盖的声明", dropped, "清空并删除的规则", merged_rules)
    if not write: return
    # 3. 回写
    by_path = {(r["bi"], r["path"]): r for r in rules}
    def rebuild(css, bi, path):
        out = []
        for k, it in enumerate(split_blocks(css)):
            if it[0] != "RULE": out.append(it[1]); continue
            pre = it[1].strip()
            if pre.startswith("@media") or pre.startswith("@supports"):
                inner = rebuild(it[2], bi, path + (k,))
                if inner.strip(): out.append(it[1] + "{" + inner + "}")
                continue
            if pre.startswith("@"): out.append(it[1] + "{" + it[2] + "}"); continue
            r = by_path.get((bi, path + (k,)))
            if r is None: out.append(it[1] + "{" + it[2] + "}"); continue
            body = ";".join(d.strip() for d in r["decls"] if d.strip())
            if body: out.append(it[1] + "{" + body + "}")
        return "".join(out)
    res, last = [], 0
    for bi, m in enumerate(blocks):
        res.append(html[last:m.start(2)]); res.append(rebuild(m.group(2), bi, ())); last = m.end(2)
    res.append(html[last:])
    open(src, "w", encoding="utf-8").write("".join(res))
    print("已写入")

if __name__ == "__main__":
    main()
