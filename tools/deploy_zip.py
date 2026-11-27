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
# 仅保留压缩包未内置的传统 favicon 文件；包内自带的 PWA 图标（btc-logo.png、apple-touch-icon.png）正常随版本更新
KEEP_IF_EXISTS = {"favicon.ico", "favicon.png"}


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
    if os.path.exists(os.path.join(root, "source/vhe.html")):
        for name, script in (("VHE 脚本语法", "tests/syntax_check.py"), ("VHE Safari 兼容", "tests/safari_compat.py")):
            if os.path.exists(os.path.join(root, script)):
                todo.append((name, ["python3", script, "source/vhe.html"]))
    if os.path.exists(os.path.join(root, "tests/static_test.py")):
        todo.append(("静态检查", ["python3", "tests/static_test.py", "."]))
    node_bin = shutil.which("node")
    vhe_test_path = os.path.join(root, "tests/vhe_test.mjs")
    if not node_bin or not os.path.exists(vhe_test_path):
        log("❌ VHE 验收测试：缺少 node 运行环境或 tests/vhe_test.mjs，拒绝跳过部署门禁。")
        return False
    if os.path.exists(os.path.join(root, "tests/reliability_test.mjs")):
        todo.append(("可靠性", [node_bin, "tests/reliability_test.mjs", "."]))
    todo.append(("VHE 验收测试", [node_bin, "tests/vhe_test.mjs", "."]))
    if os.path.exists(os.path.join(root, "tests/vhe_plain_test.mjs")):
        todo.append(("VHE 简明界面逻辑", [node_bin, "tests/vhe_plain_test.mjs", "."]))
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


def referenced_assets(base):
    import re
    keep = set()
    for fn in ("index.html", "sw.js", "ahr999.html", "old-coins.html", "dca.html", "vhe.html"):
        p = os.path.join(base, fn)
        if os.path.isfile(p):
            try:
                t = open(p, encoding="utf-8", errors="ignore").read()
                keep.update(re.findall(r"assets/([A-Za-z0-9._-]+\.(?:js|css))", t))
            except Exception:
                pass
    return keep


def prune_stale_assets(keep_assets):
    import re
    assets_dir = os.path.join(REPO, "assets")
    if not os.path.isdir(assets_dir) or not keep_assets:
        return 0
    pruned = 0
    for fn in list(os.listdir(assets_dir)):
        fp = os.path.join(assets_dir, fn)
        if os.path.isfile(fp) and re.search(r"\.[0-9a-f]{8,12}\.(?:js|css)$", fn) and fn not in keep_assets:
            os.remove(fp)
            pruned += 1
    if pruned:
        log(f"🧹 已自动清理 {pruned} 个历史旧版静态资源（保留在用资源 {len(keep_assets)} 个）")
    return pruned


def main():
    zips = [z for z in glob.glob("**/*.zip", recursive=True) if not z.startswith(("data/", ".git/"))]
    if not zips:
        pruned = prune_stale_assets(referenced_assets(REPO))
        if not pruned:
            log("没有找到压缩包，且没有需要清理的历史静态资源。")
        return 0
    z = max(zips, key=lambda p: subprocess.run(["git", "log", "-1", "--format=%ct", "--", p], capture_output=True, text=True).stdout.strip() or "0")
    log(f"## 一键上线：`{z}`")
    tmp = tempfile.mkdtemp()
    with zipfile.ZipFile(z) as f:
        for info in f.infolist():
            # 有的压缩工具不标注「文件名是 UTF-8」，Python 会按旧编码解成乱码（如「升级说明.txt」变成「σìçτ║ºΦ»┤µÿÄ.txt」）——还原成正确的中文名
            if not info.flag_bits & 0x800:
                try:
                    info.filename = info.filename.encode("cp437").decode("utf-8")
                except Exception:
                    pass
            f.extract(info, tmp)
    root = find_root(tmp)
    if not root:
        log("❌ 压缩包里没有找到 index.html + sw.js + assets/，没有上线。")
        return 1
    bid = build_id(root)
    log(f"构建号：`{bid}`")
    if not checks(root):
        log("❌ 检查没有全部通过，网站保持原样。把这一页截图发给 Claude。")
        return 1
    # 记录上线前正在使用的上一版静态资源（过渡期保留上一版，清理更早堆积的历史文件）
    prev_assets = referenced_assets(REPO)
    new_assets = referenced_assets(root)
    if os.path.isdir(os.path.join(root, "assets")):
        new_assets.update(os.listdir(os.path.join(root, "assets")))
    # .github 有变化只提醒
    gh = os.path.join(root, ".github")
    changed = []
    if os.path.isdir(gh):
        for p in sorted(glob.glob(os.path.join(gh, "**/*"), recursive=True)):
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
            shutil.copytree(src, dst, dirs_exist_ok=True)
        else:
            if name in KEEP_IF_EXISTS and os.path.exists(dst):
                continue
            shutil.copy2(src, dst)
    prune_stale_assets(prev_assets | new_assets)
    for p in zips:
        os.remove(p)
    # 清理以前上线时留下的乱码文件名（它们能还原成正确中文名、且正确名的文件已经存在）
    for name in os.listdir(REPO):
        try:
            fixed = name.encode("cp437").decode("utf-8")
        except Exception:
            continue
        if fixed != name and os.path.exists(os.path.join(REPO, fixed)) and os.path.isfile(os.path.join(REPO, name)):
            os.remove(os.path.join(REPO, name))
            log(f"🧹 删除乱码文件名：`{name}`（正确的是 `{fixed}`）")
    with open(os.path.join(REPO, ".deploy-build"), "w") as f:
        f.write(bid)
    log(f"✅ 已放到仓库对应位置，等待提交。")
    if changed:
        log("⚠️ 以下自动任务配置有变化，GitHub 不允许自动任务修改它们，请手动上传：\n" + "\n".join(f"- `{c}`" for c in changed))
    return 0


if __name__ == "__main__":
    sys.exit(main())
