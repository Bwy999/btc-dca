#!/usr/bin/env python3
"""V27.10：一个压缩包完成上线。

把 SatsGarden_*.zip 上传到仓库（任意位置）→ GitHub 自动运行本脚本：
  1. 解压，找到包含 index.html 和 sw.js 的那一层；
  2. 跑一遍检查（部署检查、脚本语法、静态检查、可靠性、Safari 兼容）——任何一项不通过就停下，网站保持原样；
  3. 把文件放到仓库对应位置（同名覆盖，旧文件保留）；data/（自动任务生成的数据）不碰；
     .github/（自动任务配置）不能由自动任务自己改，有变化时在结果里提醒手动上传；
  4. 删除压缩包。之后由工作流提交并推送。
用法：python3 tools/deploy_zip.py   （在仓库根目录运行）
"""
import glob
import os
import shutil
import subprocess
import sys
import tempfile
import zipfile

REPO = os.getcwd()
SKIP_TOP = {".git", "data", ".github"}
# 图标文件以仓库里现有的为准：仓库已有就不覆盖（首页、主屏幕图标保持不变）
KEEP_IF_EXISTS = {"btc-logo.png", "apple-touch-icon.png", "favicon.ico", "favicon.png"}


def log(msg):
    print(msg, flush=True)
    s = os.environ.get("GITHUB_STEP_SUMMARY")
    if s:
        with open(s, "a", encoding="utf-8") as f:
            f.write(msg + "\n\n")


def find_root(base):
    for dirpath, dirs, files in os.walk(base):
        if "index.html" in files and "sw.js" in files and "assets" in dirs:
            return dirpath
    return None


def run(cmd, cwd):
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=600)
    tail = (r.stdout + r.stderr).strip().splitlines()[-3:]
    return r.returncode == 0, " / ".join(tail)


def checks(root):
    todo = []
    if os.path.exists(os.path.join(root, "tools/check_deploy.py")):
        todo.append(("部署检查", ["python3", "tools/check_deploy.py", "."]))
    if os.path.exists(os.path.join(root, "source/index.html")):
        for name, script in (("脚本语法", "tests/syntax_check.py"), ("Safari 兼容", "tests/safari_compat.py")):
            if os.path.exists(os.path.join(root, script)):
                todo.append((name, ["python3", script, "source/index.html"]))
    if os.path.exists(os.path.join(root, "tests/static_test.py")):
        todo.append(("静态检查", ["python3", "tests/static_test.py", "."]))
    if os.path.exists(os.path.join(root, "tests/reliability_test.mjs")) and shutil.which("node"):
        todo.append(("可靠性", ["node", "tests/reliability_test.mjs", "."]))
    ok_all = True
    for name, cmd in todo:
        ok, tail = run(cmd, root)
        log(f"- {'✅' if ok else '❌'} {name}：{tail}")
        ok_all &= ok
    return ok_all


def build_id(root):
    try:
        t = open(os.path.join(root, "index.html"), encoding="utf-8").read()
        i = t.find('name="btc-dca-build" content="')
        return t[i + 30:t.find('"', i + 30)] if i >= 0 else "?"
    except Exception:
        return "?"


def main():
    zips = [z for z in glob.glob("**/*.zip", recursive=True) if not z.startswith(("data/", ".git/"))]
    if not zips:
        log("没有找到压缩包，什么也没做。")
        return 0
    z = max(zips, key=lambda p: subprocess.run(["git", "log", "-1", "--format=%ct", "--", p], capture_output=True, text=True).stdout.strip() or "0")
    log(f"## 一键上线：`{z}`")
    tmp = tempfile.mkdtemp()
    with zipfile.ZipFile(z) as f:
        f.extractall(tmp)
    root = find_root(tmp)
    if not root:
        log("❌ 压缩包里没有找到 index.html + sw.js + assets/，没有上线。")
        return 1
    bid = build_id(root)
    log(f"构建号：`{bid}`")
    if not checks(root):
        log("❌ 检查没有全部通过，网站保持原样。把这一页截图发给 Claude。")
        return 1
    # .github 有变化只提醒
    gh = os.path.join(root, ".github")
    changed = []
    if os.path.isdir(gh):
        for p in glob.glob(os.path.join(gh, "**/*"), recursive=True):
            if os.path.isfile(p):
                rel = os.path.relpath(p, root)
                dst = os.path.join(REPO, rel)
                if not os.path.exists(dst) or open(p, "rb").read() != open(dst, "rb").read():
                    changed.append(rel)
    for name in os.listdir(root):
        if name in SKIP_TOP:
            continue
        src, dst = os.path.join(root, name), os.path.join(REPO, name)
        if os.path.isdir(src):
            # assets/ 里的旧文件不删：还没更新到新版的手机可能仍在请求它们
            shutil.copytree(src, dst, dirs_exist_ok=True)
        else:
            if name in KEEP_IF_EXISTS and os.path.exists(dst):
                continue
            shutil.copy2(src, dst)
    for p in zips:
        os.remove(p)
    with open(os.path.join(REPO, ".deploy-build"), "w") as f:
        f.write(bid)
    log(f"✅ 已放到仓库对应位置，等待提交。")
    if changed:
        log("⚠️ 以下自动任务配置有变化，GitHub 不允许自动任务修改它们，请手动上传：\n" + "\n".join(f"- `{c}`" for c in changed))
    return 0


if __name__ == "__main__":
    sys.exit(main())
