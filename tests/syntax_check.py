#!/usr/bin/env python3
"""V27.2 脚本语法检查：把 source/index.html 里每一段内联脚本交给 node --check。
一段脚本有语法错误，整段都不会运行（V27.2 开发中曾因此让「顶底区间」整段失效），其他测试不一定能发现。
用法：python3 tests/syntax_check.py source/index.html
"""
import re, subprocess, sys, tempfile, os
src = sys.argv[1] if len(sys.argv) > 1 else "source/index.html"
s = open(src, encoding="utf-8").read()
bad = 0; n = 0
for i, (attrs, js) in enumerate(re.findall(r"<script(\s[^>]*)?>(.*?)</script>", s, re.S)):
    if (attrs and ("src=" in attrs or "json" in attrs or "text/plain" in attrs)) or not js.strip(): continue
    n += 1
    with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8") as f: f.write(js); path = f.name
    r = subprocess.run(["node", "--check", path], capture_output=True, text=True); os.unlink(path)
    if r.returncode:
        bad += 1; line = s[:s.find(js)].count("\n") + 1
        print("✗ 第 %d 段脚本（源文件约第 %d 行）语法错误：\n%s" % (i + 1, line, r.stderr.strip().splitlines()[-1] if r.stderr.strip() else r.stderr))
if bad: sys.exit(1)
print("全部通过：%d 段内联脚本语法正确" % n)
