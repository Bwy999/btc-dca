#!/usr/bin/env python3
"""预计算老比特币异动筛选器全历史数据（2011 至今，V27.12.8）

从 Bitview 公开 API 拉取 2011-01-01 至今的日度数据：
  - BTC 价格（price）
  - 巨鲸 24h 持仓净变化（1k–10k、10k–100k、>100k BTC）
  - 长期持有者已实现利润（lth_realized_profit_sum_1w ÷ 7 折算日均 USD）
  - 12 档老币每日移动量（age_1y_to_18m … age_over_15y）

仅使用 Python 标准库；写入紧凑格式 data/old-coins.json（带 v=1 校验）。
用法：python3 tools/precompute_old_coins.py [data/old-coins.json]
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

BASE = "https://bitview.space/api/series/bulk"
UA = {"User-Agent": "sats-garden-old-coins/1.0", "Accept": "application/json"}
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

CORE_SERIES = [
    "price",
    "balance_1k_to_10k_btc_supply_delta_24h",
    "balance_10k_to_100k_btc_supply_delta_24h",
    "balance_over_100k_btc_supply_delta_24h",
    "lth_realized_profit_sum_1w",
]


def fetch_json(url, tries=3):
    last = None
    for k in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=90) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (400, 404):
                raise
        except Exception as e:
            last = e
        time.sleep(2 * (k + 1))
    raise last


def bulk(names, start="2011-01-01"):
    series = ",".join(["date"] + names)
    url = f"{BASE}?index=day1&start={start}&series={series}"
    arr = fetch_json(url)
    ref = arr[0]
    dates = ref["data"]
    pos0 = int(ref.get("start") or 0)
    cols = {}
    for name, col in zip(names, arr[1:]):
        cstart = int(col.get("start") or 0)
        cdata = col.get("data") or []
        aligned = []
        for i in range(len(dates)):
            idx = pos0 + i - cstart
            aligned.append(cdata[idx] if 0 <= idx < len(cdata) else None)
        cols[name] = aligned
    return dates, cols


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_OUT
    dates1, core = bulk(CORE_SERIES)
    time.sleep(0.4)
    dates2, age = bulk(COHORTS)

    age_by_date = {d: i for i, d in enumerate(dates2)}
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    rows = []
    prev_p = None

    for i, d in enumerate(dates1):
        if not d or d >= today:
            continue
        p_raw = core["price"][i]
        if p_raw is None or float(p_raw) <= 0:
            continue
        p = round(float(p_raw))
        pc = round(((p / prev_p) - 1) * 100, 2) if prev_p else 0.0
        prev_p = p

        w = round(
            float(core["balance_1k_to_10k_btc_supply_delta_24h"][i] or 0)
            + float(core["balance_10k_to_100k_btc_supply_delta_24h"][i] or 0)
            + float(core["balance_over_100k_btc_supply_delta_24h"][i] or 0)
        )
        pr = round(float(core["lth_realized_profit_sum_1w"][i] or 0) / 7.0)

        ai = age_by_date.get(d)
        if ai is not None:
            cvals = [round(float(age[s][ai] or 0)) for s in COHORTS]
        else:
            cvals = [0] * len(COHORTS)

        # 紧凑数组：[日期, 价格, 涨跌幅%, 巨鲸净变化, LTH日均利润USD, [12档老币移动量]]
        rows.append([d, p, pc, w, pr, cvals])

    if len(rows) < 200:
        raise RuntimeError(f"unexpected rows length: {len(rows)}")

    payload = {
        "v": 1,
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "pm": "1w/7",
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
