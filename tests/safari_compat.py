#!/usr/bin/env python3
"""V27.1 Safari 兼容性检查：静态扫描源文件，找出目标 iOS 版本不支持、且没有写备用方案的脚本接口与样式功能。

用法：python3 tests/safari_compat.py source/index.html [--ios 17.0]
脚本接口：用到的地方前面 200 个字符内要有存在性判断（"X" in window / typeof X / X&&、?.），否则判为失败。
样式功能：不支持的功能只会被浏览器忽略，不会报错，列出来提示，不判失败；关键样式需同时写兼容写法。
"""
import re, sys

JS = {  # 名称: (正则, 最低 Safari)
    "requestIdleCallback": (r"\brequestIdleCallback\(", 99), "structuredClone": (r"\bstructuredClone\(", 15.4),
    "Object.groupBy": (r"\bObject\.groupBy\(", 17.4), "Map.groupBy": (r"\bMap\.groupBy\(", 17.4), "Promise.withResolvers": (r"Promise\.withResolvers", 17.4),
    "Array.fromAsync": (r"Array\.fromAsync", 16.4), "toSorted/toReversed/toSpliced/with": (r"\.(toSorted|toReversed|toSpliced)\(", 16.0),
    "URL.canParse": (r"URL\.canParse", 17.0), "AbortSignal.any": (r"AbortSignal\.any", 17.4), "AbortSignal.timeout": (r"AbortSignal\.timeout", 16.0),
    "Iterator helpers": (r"\.values\(\)\.(map|filter|take|drop)\(|Iterator\.from", 18.4), "Set methods": (r"\.(union|intersection|symmetricDifference|isSubsetOf)\(", 17.0),
    "scheduler.postTask": (r"\bscheduler\.postTask", 99), "crypto.randomUUID": (r"crypto\.randomUUID\(", 15.4), "navigator.share": (r"navigator\.share\(", 12.2),
}
CSS = {"field-sizing": 99, "interpolate-size": 99, "scrollbar-gutter": 99, "anchor-name": 26.0, "position-anchor": 26.0, "@starting-style": 17.5,
       "light-dark(": 17.5, "@scope": 17.4, "text-wrap:": 17.4, "::details-content": 18.4, "content-visibility": 18.0, "@container": 16.0,
       "color-mix(": 16.2, ":has(": 15.4, "dvh": 15.4, "lvh": 15.4, "svh": 15.4, "@property": 16.4}

def main():
    src = sys.argv[1]; ios = float(sys.argv[sys.argv.index("--ios") + 1]) if "--ios" in sys.argv else 17.0
    s = open(src, encoding="utf-8").read()
    css = "\n".join(re.findall(r"<style[^>]*>(.*?)</style>", s, re.S))
    js = "\n".join(b for a, b in re.findall(r"<script(\s[^>]*)?>(.*?)</script>", s, re.S) if not (a and "src=" in a))
    bad = []
    for name, (rx, need) in JS.items():
        if need <= ios: continue
        for m in re.finditer(rx, js):
            before = js[max(0, m.start() - 200):m.start()]
            word = re.escape(name.split(".")[-1].split("/")[0].split(" ")[0])
            if re.search(r'(["\']' + word + r'["\']\s*in\b|typeof\s+[\w.]*' + word + r'|' + word + r'\s*&&|\?\.)', before): continue
            bad.append("%s（需要 Safari %s）：…%s…" % (name, need, js[max(0, m.start() - 60):m.start() + 40].replace("\n", " ")))
    warn = ["%s ×%d（需要 Safari %s）" % (k, css.count(k), v) for k, v in CSS.items() if v > ios and css.count(k)]
    print("目标 iOS %.1f" % ios)
    if warn: print("样式提示（不支持时只会被忽略）：" + "；".join(warn))
    if bad:
        print("✗ 没有备用方案的脚本接口："); [print("   " + x) for x in bad]; sys.exit(1)
    print("全部通过：没有目标版本不支持且缺少备用方案的脚本接口")

if __name__ == "__main__":
    main()
