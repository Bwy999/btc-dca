#!/usr/bin/env python3
"""部署前只读检查（V26.4.5）

对「准备上传的目录」（build.py split 的输出或解压后的部署包）做只读检查，不修改任何文件：
  1. 构建号一致：index.html 的 BUILD_ID / 构建号元数据 / BUILD 注释、sw.js 的 SW_BUILD、ahr999.html 的构建号。
  2. 页面引用的本地脚本、样式、图标都存在。
  3. assets/ 中带哈希的文件名与内容一致（sha256 前 10 位，与 tools/build.py 相同）。
  4. sw.js 的必需资源（ASSETS）与按需资源（OPTIONAL_ASSETS）都存在。
  5. index.html 没有重复的元素 id。
  6. data/*.json（若存在）结构正确、生成时间不在未来；--require-data 时三份文件必须存在。
  7. dca.html 默认只提示；--require-ledger 时必须存在。

用法：python3 tools/check_deploy.py <目录> [--require-data] [--require-ledger]
有任何一项失败时退出码为 1。
"""
import hashlib
import json
import os
import re
import sys
from collections import Counter
from datetime import datetime, timezone


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    root = args[0] if args else "."
    require_data = "--require-data" in sys.argv
    require_ledger = "--require-ledger" in sys.argv
    fails, notes = [], []

    def read(p):
        with open(os.path.join(root, p), encoding="utf-8") as f:
            return f.read()

    def exists(p):
        return os.path.isfile(os.path.join(root, p))

    for p in ("index.html", "sw.js"):
        if not exists(p):
            print(f"✗ 缺少 {p}")
            sys.exit(1)
    html, sw = read("index.html"), read("sw.js")

    # 1. 构建号
    ids = {
        "BUILD_ID": re.search(r'const BUILD_ID="([^"]+)"', html),
        "页面元数据": re.search(r'<meta name="btc-dca-build" content="([^"]+)"', html),
        "BUILD 注释": re.search(r"<!-- BUILD: ([^ ]+) ", html),
        "SW_BUILD": re.search(r'const SW_BUILD = "([^"]+)"', sw),
    }
    if exists("ahr999.html"):
        ids["AHR999 专页"] = re.search(r"(\d+\.\d+\.\d+-\d{8})", read("ahr999.html"))
    vals = {k: (m.group(1) if m else None) for k, m in ids.items()}
    missing = [k for k, v in vals.items() if not v]
    if missing:
        fails.append("找不到构建号：" + "、".join(missing))
    if len({v for v in vals.values() if v}) > 1:
        fails.append("构建号不一致：" + "，".join(f"{k}={v}" for k, v in vals.items()))

    # 1b. 正式版的版本号必须等于构建号（V26.4.12 ↔ 26.4.12-日期；末尾 .0 可省略：V26.5 ↔ 26.5.0-日期）；测试版（含 Beta）不检查
    lab = re.search(r'const BUILD_LABEL="([^"]+)"', html)
    if lab and "Beta" not in lab.group(1) and vals.get("BUILD_ID"):
        num = vals["BUILD_ID"].split("-")[0]
        if lab.group(1) not in ("V" + num, "V" + re.sub(r"\.0$", "", num)):
            fails.append(f"版本号 {lab.group(1)} 与构建号 {vals['BUILD_ID']} 不一致")

    # 2. 页面引用的本地资源
    refs = set(re.findall(r'(?:src|href)="(?:\./)?((?:assets/)[^"?#]+)"', html))
    refs |= set(re.findall(r'I18N_SRC="(?:\./)?(assets/[^"]+)"', html))
    for p in ("apple-touch-icon.png",):
        if f'href="./{p}"' in html or f'href="{p}"' in html:
            refs.add(p)
    for p in sorted(refs):
        if not exists(p):
            fails.append(f"页面引用的文件不存在：{p}")

    # 3. 哈希与内容一致
    adir = os.path.join(root, "assets")
    if os.path.isdir(adir):
        for fn in sorted(os.listdir(adir)):
            m = re.match(r"^(.+)\.([0-9a-f]{10})\.(js|css)$", fn)
            if not m:
                continue
            data = open(os.path.join(adir, fn), encoding="utf-8").read()
            if hashlib.sha256(data.encode("utf-8")).hexdigest()[:10] != m.group(2):
                fails.append(f"文件内容与哈希不符：assets/{fn}")
        stray = sorted(set(f"assets/{f}" for f in os.listdir(adir)) - refs - set(re.findall(r'"\./(assets/[^"]+)"', sw)))
        if stray:
            notes.append("assets/ 中有未被引用的旧文件（不影响运行，可删除）：" + "、".join(stray[:6]) + ("…" if len(stray) > 6 else ""))

    # 4. Service Worker 资源清单
    for label, pat in (("ASSETS", r"/\*ASSETS\*/(.*?)/\*END\*/"), ("OPTIONAL_ASSETS", r"/\*OPTIONAL\*/(.*?)/\*OEND\*/")):
        m = re.search(pat, sw, re.S)
        if not m:
            fails.append(f"sw.js 中找不到 {label} 清单")
            continue
        for p in re.findall(r'"\./([^"]+)"', m.group(1)):
            if not exists(p):
                fails.append(f"sw.js {label} 中的文件不存在：{p}")

    # 5. 重复 id
    body = html[html.find("<body"):]
    dup = [k for k, v in Counter(re.findall(r'\sid="([^"]+)"', body)).items() if v > 1]
    if dup:
        fails.append("重复的元素 id：" + "、".join(dup[:10]))

    # 6. 预计算数据
    now = datetime.now(timezone.utc)
    for p, need in (("data/monthly.json", "groups"), ("data/lth-chips.json", "daily"), ("data/daily-state.json", "today"), ("data/quantum.json", "bips")):
        if not exists(p):
            (fails if require_data else notes).append(f"{p} 不存在" + ("" if require_data else "（由 GitHub 定时任务生成，部署包不含属正常）"))
            continue
        try:
            j = json.loads(read(p))
            if j.get("v") != 1 or need not in j:
                fails.append(f"{p} 结构不正确")
            g = j.get("generated")
            if g and datetime.strptime(g, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) > now:
                fails.append(f"{p} 的生成时间在未来：{g}")
        except Exception as e:
            fails.append(f"{p} 不是有效 JSON：{e}")

    # 7. 完整账本
    if not exists("dca.html"):
        (fails if require_ledger else notes).append("dca.html 不在此目录" + ("" if require_ledger else "（请保留服务器上已有的 dca.html）"))

    for n in notes:
        print("· " + n)
    if fails:
        for f in fails:
            print("✗ " + f)
        print(f"未通过：{len(fails)} 项")
        sys.exit(1)
    print(f"✓ 部署检查通过 · 构建号 {vals.get('BUILD_ID')}")


if __name__ == "__main__":
    main()
