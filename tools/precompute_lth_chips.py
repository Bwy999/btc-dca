#!/usr/bin/env python3
"""预先计算 LTH 筹码集中度 ±10%（V26.3）

在 GitHub Actions 里每天运行一次，结果写入 data/lth-chips.json。
网页打开时先读这份文件，只需补算缺少的最新一两天，不再在手机上逐日下载约一年的筹码分布。

计算口径与网页完全一致：
  · 近一年逐日：Bitview LTH URPD（每 $1,000 一档，lin1000），现价 ±10% 内的供应 ÷ LTH 总供应。
  · 2013 年起按月：每月第一个可用日的 URPD（每十倍 50 档，log50），价格取该日收盘价。

用法：python3 tools/precompute_lth_chips.py data/lth-chips.json
只用 Python 标准库；已有文件时只补缺少的日期（增量更新）。
"""
import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timezone

API = "https://bitview.space/api/urpd/lth"
BULK = "https://bitview.space/api/series/bulk"
BAND = 0.10
DAYS = 365
KEEP_DAYS = 400


def get_json(url, tries=3):
    last = None
    for k in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "btc-intelligence-precompute/1.0"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:  # 网络抖动时稍等重试
            last = e
            time.sleep(2 + 3 * k)
    raise last


def compact(j):
    b = []
    for x in (j or {}).get("buckets") or []:
        try:
            pf, s = float(x["price_floor"]), float(x["supply"])
        except Exception:
            continue
        if pf >= 0 and s > 0:
            b.append([pf, s])
    b.sort(key=lambda r: r[0])
    w = 0
    for i in range(1, len(b)):
        d = b[i][0] - b[i - 1][0]
        if d > 0 and (not w or d < w):
            w = d
    return {"b": b, "w": w or 1000} if b else None


def measure(cb, price):
    if not cb or not price or price <= 0:
        return None
    lo, hi, w = price * (1 - BAND), price * (1 + BAND), cb["w"]
    tot = inb = 0.0
    for a, s in cb["b"]:
        tot += s
        ov = min(hi, a + w) - max(lo, a)
        if ov > 0:
            inb += s * min(1, ov / w)
    return inb / tot * 100 if tot > 0 else None


def measure_log(j, price):
    k = 10 ** (1 / 50)
    lo, hi = price * (1 - BAND), price * (1 + BAND)
    tot = inb = 0.0
    for x in (j or {}).get("buckets") or []:
        try:
            a, s = float(x["price_floor"]), float(x["supply"])
        except Exception:
            continue
        if not s > 0:
            continue
        tot += s
        if not a > 0:
            continue
        z = a * k
        ov = min(hi, z) - max(lo, a)
        if ov > 0:
            inb += s * min(1, ov / (z - a))
    return inb / tot * 100 if tot > 0 else None


def pick(raw, name, idx):
    if not isinstance(raw, list):
        return None
    for x in raw:
        if isinstance(x, dict) and name in (x.get("series"), x.get("name"), x.get("id")):
            return x.get("data")
    return raw[idx].get("data") if len(raw) > idx and isinstance(raw[idx], dict) else None


def prices():
    raw = get_json(f"{BULK}?index=day1&series=date,price&start=-{DAYS + 40}")
    d, p = pick(raw, "date", 0) or [], pick(raw, "price", 1) or []
    return {str(a): float(b) for a, b in zip(d, p) if b and float(b) > 0}


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else "data/lth-chips.json"
    data = {"v": 1, "daily": {}, "monthly": {}, "latest": None}
    if os.path.exists(out_path):
        try:
            old = json.load(open(out_path, encoding="utf-8"))
            if old.get("v") == 1:
                data.update({k: old.get(k) or data[k] for k in ("daily", "monthly", "latest")})
        except Exception:
            pass

    dates = sorted(d for d in get_json(f"{API}/dates?weight=raw") if isinstance(d, str) and len(d) == 10)
    if not dates:
        raise SystemExit("no URPD dates")
    latest_day = dates[-1]
    pm = prices()

    # 1) 最新分布（网页上的 ±10% 价格区间与区间内 BTC 用它计算）
    if not data["latest"] or data["latest"].get("day") != latest_day:
        cb = compact(get_json(f"{API}/{latest_day}?agg=lin1000&weight=raw"))
        if cb:
            data["latest"] = {"day": latest_day, "b": cb["b"], "w": cb["w"]}
            if latest_day in pm:
                c = measure(cb, pm[latest_day])
                if c is not None:
                    data["daily"][latest_day] = {"c": round(c, 4), "p": pm[latest_day]}

    # 2) 近一年逐日
    fails = 0
    for d in reversed(dates[-DAYS:]):
        if d in data["daily"] or d not in pm:
            continue
        try:
            c = measure(compact(get_json(f"{API}/{d}?agg=lin1000&weight=raw")), pm[d])
            if c is not None:
                data["daily"][d] = {"c": round(c, 4), "p": pm[d]}
            fails = 0
        except Exception:
            fails += 1
            if fails >= 8:
                break
        time.sleep(0.15)
    for d in sorted(data["daily"])[:-KEEP_DAYS]:
        data["daily"].pop(d, None)

    # 3) 2013 年起按月（当月取最新一天，其余月份取第一个可用日）
    first = {}
    for d in dates:
        m = d[:7]
        if m >= "2013-01" and m not in first:
            first[m] = d
    cur_m = latest_day[:7]
    first[cur_m] = latest_day
    for m in sorted(first, reverse=True):
        d = first[m]
        have = data["monthly"].get(m)
        if have and (m != cur_m or have.get("day") == d):
            continue
        try:
            j = get_json(f"{API}/{d}?agg=log50&weight=raw")
            p = float(j.get("close") or 0)
            c = measure_log(j, p) if p > 0 else None
            if c is not None:
                data["monthly"][m] = {"c": round(c, 3), "p": p, "day": d}
        except Exception:
            pass
        time.sleep(0.15)

    data["generated"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    data["band"] = BAND
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"))
    print(f"daily {len(data['daily'])} · monthly {len(data['monthly'])} · latest {data['latest'] and data['latest']['day']}")


if __name__ == "__main__":
    main()
