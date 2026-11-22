#!/usr/bin/env python3
"""预计算老比特币异动筛选器全历史数据（2011 至今，V27.3）

从 Bitview 公开 API 拉取 2011-01-01 至今的日度数据：
  - BTC 价格（price）
  - 长期持有者当日持仓净变化（由 lth_supply 逐日差分计算，剔除交易所归集干扰）
  - 长期持有者已实现利润（依次尝试 24h / 1w / 全网 24h / 1w，按周序列自动 ÷7 折算日均 USD）
  - 12 档老币每日移动量（age_1y_to_18m … age_over_15y）

内置双重容错：
  1. 按 Bitview 最大单次权重 320,000 限制，每次仅拉 2 个序列（加 date 共 3 列），遇 weight_exceeded 自动退化为单序列拉取；
  2. 遇 400/404 单个序列不存在时自动剔除并继续，不中断整批任务。

仅使用 Python 标准库；写入紧凑格式 data/old-coins.json（带 v=1 校验）。
用法：python3 tools/precompute_old_coins.py [data/old-coins.json]
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

BASE = "https://bitview.space/api/series/bulk"
UA = {"User-Agent": "sats-garden-old-coins/1.2", "Accept": "application/json"}
DEFAULT_OUT = "data/old-coins.json"

COHORTS = [
    "age_1y_to_18m_transfer_volume_sum_24h",
    "age_18m_to_2y_transfer_volume_sum_24h",
    "age_2y_to_3y_transfer_volume_sum_24h",
    "age_3y_to_4y_transfer_volume_sum_24h",
    "age_4y_to_5y_transfer_volume_sum_24h",
    "age_5y_to_6y_transfer_volume_sum_24h",
    "age_6y_to_7y_transfer_volume_sum_24h",
    "age_7y_to_8y_transfer_volume_sum_24h",
    "age_8y_to_10y_transfer_volume_sum_24h",
    "age_10y_to_12y_transfer_volume_sum_24h",
    "age_12y_to_15y_transfer_volume_sum_24h",
    "age_over_15y_transfer_volume_sum_24h",
]

LTH_SERIES = ["lth_supply"]

PROFIT_CANDIDATES = [
    ("lth_realized_profit_sum_24h", 1.0, "24h"),
    ("lth_realized_profit_sum_1w", 7.0, "1w/7"),
    ("realized_profit_sum_24h", 1.0, "all-24h"),
    ("realized_profit_sum_1w", 7.0, "all-1w/7"),
]


def fetch_raw(url, tries=3):
    last = None
    for k in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=90) as resp:
                return 200, resp.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            body = ""
            try:
                body = e.read().decode("utf-8", "replace")
            except Exception:
                pass
            if e.code in (400, 404):
                return e.code, body
            last = RuntimeError(f"HTTP {e.code}: {body[:200]}")
        except Exception as e:
            last = e
        time.sleep(2 * (k + 1))
    raise last


def fetch_chunk(names, start="2011-01-01"):
    """拉取一小批序列（<=2 个）；若仍触发 weight_exceeded 则拆成单个拉取；遇 not found 自动跳过。"""
    active = list(names)
    skipped = []
    for _ in range(len(names) + 2):
        series = ",".join(["date"] + active)
        url = f"{BASE}?index=day1&start={start}&series={series}"
        code, body = fetch_raw(url)
        if code == 200:
            arr = json.loads(body)
            ref = arr[0]
            dates = ref["data"]
            pos0 = int(ref.get("start") or 0)
            cols = {}
            for name, col in zip(active, arr[1:]):
                cstart = int(col.get("start") or 0)
                cdata = col.get("data") or []
                aligned = {}
                for i, d in enumerate(dates):
                    idx = pos0 + i - cstart
                    if 0 <= idx < len(cdata) and cdata[idx] is not None:
                        aligned[d] = cdata[idx]
                cols[name] = aligned
            return dates, cols, skipped
        if code == 400 and "weight_exceeded" in body and len(active) > 1:
            # 自动拆半重拉
            mid = len(active) // 2
            d1, c1, s1 = fetch_chunk(active[:mid], start)
            time.sleep(0.25)
            d2, c2, s2 = fetch_chunk(active[mid:], start)
            c1.update(c2)
            return (d1 or d2), c1, skipped + s1 + s2
        m = re.search(r"'([a-z0-9_]+)'\s+not\s+found", body, re.I)
        if m and m.group(1) in active:
            bad = m.group(1)
            skipped.append(bad)
            active.remove(bad)
            if not active:
                return [], {}, skipped
            continue
        raise RuntimeError(f"HTTP {code} for {url[:140]}: {body[:300]}")
    raise RuntimeError("too many retries in fetch_chunk")


def bulk_safe(names, start="2011-01-01", chunk_size=2):
    """按 2 个序列一组分批拉取（避免超过 Bitview 320,000 单次权重上限）。"""
    all_dates = []
    all_cols = {}
    all_skipped = []
    for i in range(0, len(names), chunk_size):
        part = names[i:i + chunk_size]
        dates, cols, skipped = fetch_chunk(part, start)
        if len(dates) > len(all_dates):
            all_dates = dates
        all_cols.update(cols)
        all_skipped.extend(skipped)
        time.sleep(0.25)
    if all_skipped:
        print(f"WARN: skipped unavailable series: {', '.join(all_skipped)}", file=sys.stderr)
    return all_dates, all_cols


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_OUT
    all_names = ["price"] + LTH_SERIES + [c[0] for c in PROFIT_CANDIDATES] + COHORTS
    dates, cols = bulk_safe(all_names, start="2011-01-01", chunk_size=2)

    if not dates or "price" not in cols:
        raise RuntimeError("failed to fetch price series from Bitview")

    profit_key, profit_div, profit_mode = None, 1.0, "none"
    for k, div, mode in PROFIT_CANDIDATES:
        if k in cols and cols[k]:
            profit_key, profit_div, profit_mode = k, div, mode
            break
    print(f"INFO: profit series = {profit_key} ({profit_mode})")

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    rows = []
    prev_p = None
    prev_lth = None
    price_map = cols["price"]
    lth_map = cols.get("lth_supply", {})

    for d in dates:
        if not d or d >= today:
            continue
        p_raw = price_map.get(d)
        if p_raw is None or float(p_raw) <= 0:
            continue
        p = round(float(p_raw))
        pc = round(((p / prev_p) - 1) * 100, 2) if prev_p else 0.0
        prev_p = p

        lth_raw = lth_map.get(d)
        lth_val = float(lth_raw) if lth_raw is not None else None
        w = round(lth_val - prev_lth) if (lth_val is not None and prev_lth is not None) else 0
        if lth_val is not None:
            prev_lth = lth_val
        pr = round(float(cols[profit_key].get(d) or 0) / profit_div) if profit_key else 0
        cvals = [round(float(cols[s].get(d) or 0)) if s in cols else 0 for s in COHORTS]

        rows.append([d, p, pc, w, pr, cvals])

    if len(rows) < 200:
        raise RuntimeError(f"unexpected rows length: {len(rows)}")

    payload = {
        "v": 1,
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "pm": profit_mode,
        "rows": rows,
    }

    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    tmp = out_path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, out_path)
    print(f"OK: wrote {len(rows)} days ({rows[0][0]} .. {rows[-1][0]}) -> {out_path}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
