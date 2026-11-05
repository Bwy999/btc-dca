#!/usr/bin/env python3
"""V27.10：Bitview 接口每日体检。

逐个确认网页用到的 Bitview 序列（tools/bitview_series.json）还能取到、成本分布（URPD）队列还在、
Bitview 自己的计算进度没有落后太多。发现问题：
  · 在 GitHub 仓库开一个 Issue（同标题已开着就不重复开），写明哪些名字失效；
  · 本次任务以失败结束（GitHub 默认会发邮件提醒仓库主人）。
用法：python3 tools/check_bitview.py
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

BASE = "https://bitview.space"
HERE = os.path.dirname(os.path.abspath(__file__))


def http(url, method="GET", data=None, headers=None):
    req = urllib.request.Request(url, data=data, method=method, headers={"User-Agent": "sats-garden-bitview-check/1.0", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:  # 网络错误
        return 0, str(e)


def check_series(names):
    """每批最多 30 个；遇到「找不到」就记下来、去掉再试，直到这一批全部能取到。"""
    missing, errors = [], []
    for i in range(0, len(names), 30):
        batch = list(names[i:i + 30])
        for _ in range(40):
            if not batch:
                break
            st, t = http(f"{BASE}/api/series/bulk?index=day1&series=date,{','.join(batch)}&start=-1")
            if st == 200:
                break
            bad = None
            if st == 404:
                try:
                    msg = json.loads(t).get("error", {}).get("message", "")
                except Exception:
                    msg = t
                bad = next((n for n in batch if f"'{n}'" in msg), None)
            if bad:
                missing.append(bad)
                batch.remove(bad)
                continue
            errors.append(f"HTTP {st}: {t[:160]}")
            break
        time.sleep(0.3)
    return missing, errors


def main():
    cfg = json.load(open(os.path.join(HERE, "bitview_series.json"), encoding="utf-8"))
    problems = []
    missing, errors = check_series(cfg["series_day1"])
    if missing:
        problems.append("**失效的序列（网页对应模块会显示「暂不可用」或改用备用算法）：**\n" + "\n".join(f"- `{n}`" for n in missing))
    if errors:
        problems.append("**请求出错：**\n" + "\n".join(f"- {e}" for e in errors[:10]))
    bad_c = []
    for c in cfg.get("urpd_cohorts", []):
        st, t = http(f"{BASE}/api/urpd/{c}?agg=log10")
        ok = False
        if st == 200:
            try:
                b = json.loads(t).get("buckets")
                ok = isinstance(b, list) or (isinstance(b, dict) and isinstance(b.get("price"), list))
            except Exception:
                ok = False
        if not ok:
            bad_c.append(f"`{c}`（HTTP {st}）")
        time.sleep(0.2)
    if bad_c:
        problems.append("**成本分布（URPD）队列失效：** " + "、".join(bad_c))
    st, t = http(f"{BASE}/api/server/sync")
    sync_line = ""
    if st == 200:
        try:
            j = json.loads(t)
            behind = int(j.get("blocks_behind") or 0)
            last = float(j.get("last_indexed_at_unix") or 0)
            hours = (time.time() - last) / 3600 if last else None
            sync_line = f"区块 #{j.get('indexed_height')} · 落后 {behind} 块 · " + (f"{hours:.1f} 小时前更新" if hours is not None else "更新时间未知")
            if behind > cfg.get("max_blocks_behind", 12) or (hours is not None and hours > cfg.get("max_hours_since_index", 6)):
                problems.append(f"**Bitview 计算落后：** {sync_line}")
        except Exception:
            problems.append("**同步状态格式无法识别**")
    else:
        problems.append(f"**同步状态接口出错：** HTTP {st}")

    total = len(cfg["series_day1"])
    head = f"检查了 {total} 个序列、{len(cfg.get('urpd_cohorts', []))} 个成本分布队列。{sync_line}"
    body = head + ("\n\n" + "\n\n".join(problems) if problems else "\n\n全部正常。")
    print(body)
    summ = os.environ.get("GITHUB_STEP_SUMMARY")
    if summ:
        with open(summ, "a", encoding="utf-8") as f:
            f.write("## Bitview 接口体检\n\n" + body + "\n")
    if not problems:
        return 0
    repo, token = os.environ.get("GITHUB_REPOSITORY"), os.environ.get("GITHUB_TOKEN")
    if repo and token:
        title = "Bitview 接口体检发现问题"
        hdr = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json", "Content-Type": "application/json"}
        st, t = http(f"https://api.github.com/repos/{repo}/issues?state=open&per_page=50", headers=hdr)
        exists = st == 200 and any(x.get("title") == title for x in json.loads(t))
        text = body + f"\n\n（{time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime())} 自动检查。把这个 Issue 的截图发给 Claude，按名单更新网页里的对照表。）"
        if exists:
            num = next(x["number"] for x in json.loads(t) if x.get("title") == title)
            http(f"https://api.github.com/repos/{repo}/issues/{num}/comments", "POST", json.dumps({"body": text}).encode(), hdr)
        else:
            http(f"https://api.github.com/repos/{repo}/issues", "POST", json.dumps({"title": title, "body": text}).encode(), hdr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
