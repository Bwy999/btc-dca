#!/usr/bin/env python3
"""预先下载「顶底区间」与分析页使用的 Bitview 月度序列（V26.4）

在 GitHub Actions 里每天运行一次，结果写入 data/monthly.json。
网页先读这份文件；文件缺失、超过 48 小时或缺少某组序列时，自动回到直接请求 Bitview。

文件里按「请求组」原样保存 Bitview 的返回（每组自带 date 序列），
网页用与直接请求完全相同的解析代码读取，计算结果不会因为数据来源不同而变化。

用法：python3 tools/precompute_monthly.py data/monthly.json
只用 Python 标准库。
"""
import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timezone

BULK = "https://bitview.space/api/series/bulk"
START = "2012-01-01"
GROUPS = [
    # 顶底区间（与网页 SER_A / SER_B 完全一致）
    ["date", "lth_nupl", "lth_supply_in_loss_share", "utxos_over_1y_old_transfer_volume_sum_1m", "price", "nupl", "sth_nupl", "supply_in_profit_share", "reserve_risk"],
    ["date", "mvrv", "puell_multiple", "price_sma_111d", "price_sma_350d_x2"],
    # V27.5：顶部证据「长期持有者连续减持」（与网页 SER_C 一致）
    ["date", "lth_supply_delta_1m"],
    # 分析页数据化解读
    ["date", "price", "mvrv", "sth_nupl", "price_sma_200w_ratio"],
]


def get_json(url, tries=3):
    last = None
    for k in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "btc-intelligence-monthly/1.0"})
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:
            last = e
            time.sleep(2 + 3 * k)
    raise last


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else "data/monthly.json"
    groups, failed = {}, []
    for ser in GROUPS:
        key = ",".join(ser)
        try:
            raw = get_json(f"{BULK}?index=month1&series={key}&start={START}")
            if not isinstance(raw, list) or len(raw) < len(ser):
                raise ValueError("bad response")
            groups[key] = raw
        except Exception as e:
            failed.append(key)
            print("暂不可用：", key, e)
    if not groups:
        raise SystemExit("Bitview 月度序列全部不可用")
    data = {"v": 1, "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "start": START, "groups": groups}
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"))
    print(f"groups {len(groups)} · failed {len(failed)}")


if __name__ == "__main__":
    main()
