#!/usr/bin/env python3
"""静态检查（V26.4.7）：被 try{…} 包起来调用的函数必须有定义。

起因：V26.4.4 重做仪表盘时误删了 phaseBar()，但调用处被 try{}catch(e){} 包住，错误被吞掉，
周期雷达的阶段进度条只显示「--」。本检查扫描所有脚本中 try{名字( 形式的调用，
确认同名函数在源码或部署包的脚本里确实有定义（function 名字 / 名字= / 名字: function）。

用法：python3 tests/static_test.py <目录或 index.html>
"""
import os
import re
import sys

arg = sys.argv[1] if len(sys.argv) > 1 else "."
paths = [arg] if os.path.isfile(arg) else [os.path.join(arg, "index.html")]
adir = os.path.join(os.path.dirname(paths[0]), "assets")
if os.path.isdir(adir):
    paths += [os.path.join(adir, f) for f in os.listdir(adir) if f.endswith(".js")]
src = "\n".join(open(p, encoding="utf-8").read() for p in paths if os.path.exists(p))
calls = set(re.findall(r"try\{\s*([A-Za-z_$][\w$]*)\(", src))
skip = {"if", "for", "while", "return", "new", "typeof", "JSON", "localStorage", "document", "window", "Number", "String", "Math", "Date", "Object", "Array", "fetch", "setTimeout", "clearTimeout", "requestAnimationFrame", "navigator", "console", "decodeURIComponent", "encodeURIComponent", "parseFloat", "parseInt"}
missing = []
for name in sorted(calls - skip):
    if not re.search(r"(function\s+%s\s*\()|(\b%s\s*=\s*(async\s+)?(function|\())|(\b%s\s*:\s*(async\s+)?function)|(window\.%s\s*=)" % ((re.escape(name),) * 4), src):
        missing.append(name)
if missing:
    print("✗ 被 try{} 调用但找不到定义的函数：" + "、".join(missing))
    sys.exit(1)
print(f"全部通过：{len(calls - skip)} 个被 try{{}} 调用的函数都有定义")
