#!/usr/bin/env python3
"""把 V26 以来按「版本」追加的样式块，按「模块」重新排列（V26.3）。

只移动整段样式块的位置，不改任何规则内容；同一模块内保持原来的先后顺序。
每次运行后必须用比对工具确认渲染结果不变。

用法：python3 tools/css_modules.py index.html [--write]
"""
import re, sys
sys.path.insert(0, __file__.rsplit("/", 1)[0])
import css_refactor as C

START = "/* —— V26.0.7"
MODULES = [
    ("外壳 · 导航、状态栏、语言", ["电脑大屏", "V26.0.12", "恢复：", "V26.1.0", "Liquid Glass", "镜面边缘", "内部光泽", "选中「液滴」", "标签与图标", "系统不支持毛玻璃", "V26.3.1"]),
    ("首页 · AHR999、减半、今日结论", ["明暗切换", "V26.0.7", "V26.0.8", "V26.0.13", "删除：", "首页减半倒计时", "V26.0.16", "V26.0.17", "V26.0.18", "V26.0.19", "减半区块链条", "V26.3 首页今日结论", "自上次打开以来"]),
    ("分析页", ["估值总览", "预测市场", "V26.2.0", "V26.3 分析页"]),
    ("链上 · 长期持有者与筹码", ["V26.0.10", "V26.0.11", "成本分布", "V26.1.3", "V26.1.7", "V26.1.8", "V26.1.9", "Beta 20", "Beta 21", "Beta 22", "Beta 23", "V26.3 顶底区间"]),
    ("我的", ["信号定投回测", "信号联动定投"]),
    ("通用组件", ["提示框统一"]),
]


def module_of(comment):
    for i, (_, keys) in enumerate(MODULES):
        if any(k in comment for k in keys):
            return i
    return None


def main():
    path = sys.argv[1]
    html = open(path, encoding="utf-8").read()
    m = list(re.finditer(r"(<style[^>]*>)(.*?)(</style>)", html, re.S))[-1]
    nodes = C.parse(m.group(2))
    if any(nd["t"] == "raw" and "================= 模块：" in nd["text"] for nd in nodes):
        print("已按模块整理过，无需重复运行（新增样式请直接写到对应模块分组里）。")
        return
    idx = next(i for i, nd in enumerate(nodes) if nd["t"] == "raw" and nd["text"].startswith(START))
    head, tail = nodes[:idx], nodes[idx:]
    groups = [[] for _ in MODULES]
    cur, unknown = None, []
    for nd in tail:
        if nd["t"] == "raw" and nd["text"].startswith("/*"):
            mi = module_of(nd["text"])
            if mi is not None:
                cur = mi
            elif "V26.1.2 修复" in nd["text"]:
                continue  # 空的版本标题，内容已按子标题归类
            elif cur is None:
                unknown.append(nd["text"][:50])
        if cur is None:
            raise SystemExit("无法归类：" + str(unknown))
        groups[cur].append(nd)
    out = head[:]
    for (name, _), g in zip(MODULES, groups):
        if g:
            out.append({"t": "raw", "text": f"/* ================= 模块：{name} ================= */"})
            out.extend(g)
    new = C.serialize(out)
    print("blocks per module:", [len([n for n in g if n["t"] == "raw" and n["text"].startswith("/*")]) for g in groups])
    if "--write" in sys.argv:
        open(path, "w", encoding="utf-8").write(html[:m.start(2)] + new + html[m.end(2):])


if __name__ == "__main__":
    main()
