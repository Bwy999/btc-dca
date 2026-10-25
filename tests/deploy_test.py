#!/usr/bin/env python3
"""部署检查的测试（V26.4.5）

用法：python3 tests/deploy_test.py [合并源码 index.html 的路径，默认 source/index.html]
从合并源码构建到临时目录，确认 tools/check_deploy.py：
  · 对完整的构建通过；
  · 资源缺失、文件内容被改、构建号不一致、重复 id 时失败。
"""
import os
import re
import shutil
import subprocess
import sys
import tempfile

repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
tools = os.path.join(repo, "tools")
arg = sys.argv[1] if len(sys.argv) > 1 else os.path.join(repo, "source", "index.html")
src_index = os.path.abspath(os.path.join(arg, "index.html") if os.path.isdir(arg) else arg)
ok_count, bad = 0, []


def build(dst):
    subprocess.run([sys.executable, os.path.join(tools, "build.py"), "split", src_index, dst], check=True, capture_output=True)
    for f in ("ahr999.html", "apple-touch-icon.png", "btc-logo.png"):
        for base in (os.path.dirname(src_index), repo):
            if os.path.exists(os.path.join(base, f)):
                shutil.copy(os.path.join(base, f), dst); break


def check(d):
    return subprocess.run([sys.executable, os.path.join(tools, "check_deploy.py"), d], capture_output=True, text=True).returncode


def expect(name, cond):
    global ok_count
    if cond:
        ok_count += 1
    else:
        bad.append(name)
        print("✗ " + name)


with tempfile.TemporaryDirectory() as tmp:
    good = os.path.join(tmp, "good")
    build(good)
    expect("完整构建通过检查", check(good) == 0)

    def variant(name, mutate):
        d = os.path.join(tmp, name)
        shutil.copytree(good, d)
        mutate(d)
        expect(name + " 时检查失败", check(d) != 0)

    def drop_asset(d):
        js = sorted(f for f in os.listdir(os.path.join(d, "assets")) if f.startswith("ext-"))[0]
        os.remove(os.path.join(d, "assets", js))

    def tamper(d):
        css = [f for f in os.listdir(os.path.join(d, "assets")) if f.endswith(".css")][0]
        with open(os.path.join(d, "assets", css), "a", encoding="utf-8") as f:
            f.write("/* changed */")

    def mismatch(d):
        p = os.path.join(d, "sw.js")
        s = open(p, encoding="utf-8").read()
        open(p, "w", encoding="utf-8").write(re.sub(r'const SW_BUILD = "[^"]+"', 'const SW_BUILD = "0.0.0-20000101"', s))

    def dup_id(d):
        p = os.path.join(d, "index.html")
        s = open(p, encoding="utf-8").read()
        open(p, "w", encoding="utf-8").write(s.replace("</body>", '<i id="ahrBig"></i></body>', 1))

    variant("资源缺失", drop_asset)
    variant("文件内容被改", tamper)
    variant("构建号不一致", mismatch)
    variant("重复元素 id", dup_id)

print(f"{'未通过' if bad else '全部通过'}：通过 {ok_count} 项，未通过 {len(bad)} 项")
sys.exit(1 if bad else 0)
