#!/usr/bin/env python3
"""V26.5：把样式表中的字号、字重、圆角收敛到统一刻度（只改源文件 index.html 的 <style>）。

字号（px）：≤11.5 → 11 · 12–14 → 13 · 14.5–18 → 16 · 18.5–23 → 20 · ≥24 保持（大数字）
字重：≤550 → 400 · 551–679 → 600 · ≥680 → 700
圆角（px）：≤6 保持 · 7–12 → 10 · 13–24 → 16 · 999 / 50% 保持
用法：python3 tools/css_scale.py index.html [--dry]
"""
import re, sys, collections

def snap_fs(v):
    if v <= 11.5: return 11
    if v < 14.5: return 13
    if v < 18.5: return 16
    if v < 24: return 20
    return v

def snap_fw(v):
    return 400 if v <= 550 else (600 if v < 680 else 700)

def snap_r(v):
    if v <= 6 or v >= 100: return v
    return 10 if v <= 12 else (16 if v <= 24 else v)

def fmt(v):
    return str(int(v)) if float(v).is_integer() else str(v)

def transform(css, stats):
    def fs(m):
        v = float(m.group(2)); n = snap_fs(v); stats["font-size"][(fmt(v), fmt(n))] += 1
        return m.group(1) + fmt(n) + "px"
    def fw(m):
        v = int(m.group(2)); n = snap_fw(v); stats["font-weight"][(v, n)] += 1
        return m.group(1) + str(n)
    def br(m):
        v = float(m.group(2)); n = snap_r(v); stats["border-radius"][(fmt(v), fmt(n))] += 1
        return m.group(1) + fmt(n) + "px"
    css = re.sub(r"(font-size\s*:\s*)(\d+(?:\.\d+)?)px", fs, css)
    css = re.sub(r"(font-weight\s*:\s*)(\d{3})\b", fw, css)
    css = re.sub(r"(border-radius\s*:\s*)(\d+(?:\.\d+)?)px(?=\s*[;}!])", br, css)
    return css

def main():
    path = sys.argv[1]; dry = "--dry" in sys.argv
    html = open(path, encoding="utf-8").read()
    if "<style" not in html:
        raise SystemExit("这个文件里没有内联样式。请对源文件 index.html 运行。")
    stats = collections.defaultdict(collections.Counter)
    out = re.sub(r"(<style[^>]*>)(.*?)(</style>)", lambda m: m.group(1) + transform(m.group(2), stats) + m.group(3), html, flags=re.S)
    for k, c in stats.items():
        changed = sum(n for (a, b), n in c.items() if a != b)
        print(f"{k}: {changed} 处调整 / {sum(c.values())} 处")
    if not dry:
        open(path, "w", encoding="utf-8").write(out)

if __name__ == "__main__":
    main()
