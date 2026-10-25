#!/usr/bin/env python3
"""V26.9 合并补丁层：删除「在所有测试状态下都被等价规则覆盖」的声明。

输入 tools/cascade_audit.py merge 的汇总结果。一条声明只有同时满足下面全部条件才删除：
- 在至少一个状态下匹配到了元素；
- 在任何状态下都没有生效；
- 每一次被覆盖，覆盖它的都是「去掉永远存在的前缀后选择器完全相同、媒体条件相同或无条件、优先级不低」的规则；
- 属性不带浏览器前缀（-webkit- 等保留给 Safari）；同一条规则里没有重复声明同一属性。
简写属性（如 padding）要它展开后的每个分属性都满足条件才删除。

用法：python3 tools/css_merge_layers.py source/index.html 汇总.json [--write]
"""
import json, re, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from css_prune import split_blocks, split_selectors

def norm_sel(s):
    s = re.sub(r'\s*([>+~,])\s*', r'\1', s.strip())
    s = re.sub(r'\s+', ' ', s).replace('"', "'")
    return s

def walk_rules(css):
    """按浏览器 CSSOM 的顺序列出样式规则：[(prelude, body)]，递归进入 @media / @supports。"""
    out = []
    for it in split_blocks(css):
        if it[0] != "RULE": continue
        pre = it[1].strip()
        if pre.startswith("@media") or pre.startswith("@supports"):
            out.extend(walk_rules(it[2]))
        elif pre.startswith("@"):
            continue
        else:
            out.append((it[1], it[2]))
    return out

def decls(body):
    parts, cur, d, q = [], "", 0, None
    for c in body:
        if q:
            cur += c
            if c == q: q = None
            continue
        if c in "\"'": q = c
        elif c == "(": d += 1
        elif c == ")": d -= 1
        if c == ";" and d == 0: parts.append(cur); cur = ""
        else: cur += c
    if cur.strip(): parts.append(cur)
    return parts

def main():
    src, summ = sys.argv[1], sys.argv[2]; write = "--write" in sys.argv
    html = open(src, encoding="utf-8").read()
    J = json.load(open(summ, encoding="utf-8"))
    stat, rules = J["stat"], J["rules"]
    removable = {}
    for k, v in stat.items():
        if v[0] > 0 and v[1] == 0 and v[3] == 0 and v[2] > 0:
            rid, prop = k.rsplit("|", 1)
            removable.setdefault(rid, set()).add(prop)
    blocks = list(re.finditer(r'(<style[^>]*>)(.*?)(</style>)', html, re.S))
    # 每条规则的选择器，用来核对 CSSOM 顺序与源码顺序一致
    needed = set()
    plan = []   # (block_index, rule_local_index, [decl texts to drop])
    key = lambda x: re.sub(r'[\s"\']', '', x).replace("::", ":").lower()
    by_sig = {}
    for r in rules.values():
        sg, li = r["id"].rsplit("#", 1); by_sig.setdefault(sg, {})[int(li)] = r["sel"]
    srcmap = {}   # (block, source rule index) -> cssom rule id
    for bi, m in enumerate(blocks):
        css = m.group(2); sig = "%d:%s" % (len(css), css[:40])
        rl = walk_rules(css); om = by_sig.get(sig, {}); j = 0; skipped = 0
        for li, (pre, body) in enumerate(rl):
            if j in om and key(om[j]) == key(pre):
                srcmap[(bi, li)] = sig + "#" + str(j); j += 1
            else:
                skipped += 1   # 浏览器丢弃的规则（如 -moz- 专用选择器），不对齐、不改动
        if om and j != len(om): print("样式块", bi, "对齐不完整：", j, "/", len(om), "，该块不改动"); srcmap = {k: v for k, v in srcmap.items() if k[0] != bi}
        elif skipped: print("样式块", bi, "跳过浏览器丢弃的规则", skipped, "条")
        for li, (pre, body) in enumerate(rl):
            rid = srcmap.get((bi, li))
            if not rid or rid not in removable: continue
            ds = decls(body); names = []
            for d in ds:
                if ":" not in d: names.append(None); continue
                names.append(d.split(":", 1)[0].strip().lower())
            for d, n in zip(ds, names):
                if n and not (n.startswith("-") and not n.startswith("--")): needed.add(d.strip())
            plan.append((bi, li, rid, ds, names))
    # 用浏览器把每条声明展开成分属性
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page()
        exp = pg.evaluate("""(list)=>{const out={};for(const d of list){const s=document.createElement('div').style;s.cssText=d;const a=[];for(let i=0;i<s.length;i++)a.push(s[i]);out[d]=a}return out}""", sorted(needed))
        b.close()
    drops = {}
    count = 0
    for bi, li, rid, ds, names in plan:
        rem = removable[rid]
        seen = {}
        for d, n in zip(ds, names):
            for lh in exp.get(d.strip(), []): seen[lh] = seen.get(lh, 0) + 1
        dup = any(v > 1 for v in seen.values())
        if dup: continue
        drop = []
        for d, n in zip(ds, names):
            if not n or (n.startswith("-") and not n.startswith("--")): continue
            lhs = exp.get(d.strip(), [])
            if lhs and all(l in rem for l in lhs): drop.append(d)
        if drop: drops[(bi, li)] = drop; count += len(drop)
    print("可删除声明", count, "涉及规则", len(drops))
    if not write: return
    # 改写：逐个样式块重建
    def rebuild(css, bi):
        counter = [0]
        def rec(c):
            out = []
            for it in split_blocks(c):
                if it[0] != "RULE":
                    out.append(it[1]); continue
                pre = it[1].strip()
                if pre.startswith("@media") or pre.startswith("@supports"):
                    inner = rec(it[2])
                    if inner.strip(): out.append(it[1] + "{" + inner + "}")
                    continue
                if pre.startswith("@"):
                    out.append(it[1] + "{" + it[2] + "}"); continue
                li = counter[0]; counter[0] += 1
                key = (bi, li)
                if key in drops:
                    ds = decls(it[2]); keep = [d for d in ds if d not in drops[key]]
                    body = ";".join(x.strip() for x in keep if x.strip())
                    if body.strip(): out.append(it[1] + "{" + body + "}")
                else:
                    out.append(it[1] + "{" + it[2] + "}")
            return "".join(out)
        return rec(css)
    res, last = [], 0
    for bi, m in enumerate(blocks):
        res.append(html[last:m.start(2)]); res.append(rebuild(m.group(2), bi)); last = m.end(2)
    res.append(html[last:])
    open(src, "w", encoding="utf-8").write("".join(res))
    print("已写入")

if __name__ == "__main__":
    main()
