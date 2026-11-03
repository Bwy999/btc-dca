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
import urllib.error
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


# ===== V27.8：Bitview 新旧接口兼容（与网页 bvSpec 对照表一致）=====
# 新版 Bitview（next.bitview.space）改名 / 下线了部分序列。先按原名请求；
# 服务器回答「找不到」时，用新名字或新数据算出旧序列，按原来的格式写进 monthly.json，网页解析代码不用改。
AGE1Y = ["1y_to_18m", "18m_to_2y", "2y_to_3y", "3y_to_4y", "4y_to_5y", "5y_to_6y", "6y_to_7y",
         "7y_to_8y", "8y_to_10y", "10y_to_12y", "12y_to_15y", "over_15y"]


def spec(n):
    if n == "date":
        return ("date", [])
    if n == "puell_multiple":
        return ("puell", ["subsidy_sum_24h_usd", "subsidy_sum_1y_usd"])
    if n == "price_sma_111d":
        return ("sma", [], 111, 1)
    if n == "price_sma_350d_x2":
        return ("sma", [], 350, 2)
    if n.startswith("utxos_over_1y_old_transfer_volume_sum_"):
        sfx = n[len("utxos_over_1y_old_"):]
        return ("sum", [f"age_{b}_{sfx}" for b in AGE1Y])
    return ("alias", [n])


def http_json(url):
    """返回 (状态码, JSON 或 None, 文本)；不抛 404。"""
    req = urllib.request.Request(url, headers={"User-Agent": "btc-intelligence-monthly/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            t = r.read().decode("utf-8")
            return r.status, json.loads(t), t
    except urllib.error.HTTPError as e:
        t = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(t), t
        except Exception:
            return e.code, None, t


def daily_price():
    st, j, _ = http_json(f"{BULK}?index=day1&series=date,price&start=2010-07-01")
    if st != 200 or not isinstance(j, list):
        raise ValueError("daily price")
    return j[0]["data"], [float(x) if x is not None else None for x in j[1]["data"]]


def month_end_sma(days, prices, n, months):
    out, q, s, by_day = {}, [], 0.0, {}
    for d, v in zip(days, prices):
        if v is None or v <= 0:
            continue
        q.append(v); s += v
        if len(q) > n:
            s -= q.pop(0)
        by_day[d] = s / n if len(q) >= n else None
    res = []
    for m in months:   # month1 的日期是该月 1 日；取该月最后一个有值的日子
        ym = m[:7]
        cands = [d for d in by_day if d[:7] == ym]
        res.append(by_day[max(cands)] if cands else None)
    return res


def translate(ser):
    specs = [spec(n) for n in ser]
    need = []
    for sp in specs:
        for p_ in sp[1]:
            if p_ not in need:
                need.append(p_)
    cols = {}
    for i in range(0, max(1, len(need)), 30):
        names = ["date"] + need[i:i + 30]
        st, j, t = http_json(f"{BULK}?index=month1&series={','.join(names)}&start={START}")
        if st != 200 or not isinstance(j, list):
            raise ValueError(f"translate {st} {t[:120]}")
        for n_, c in zip(names, j):
            cols[n_] = c
    ref = cols["date"]
    n0, dates = int(ref.get("start") or 0), ref["data"]

    def val(name, i):
        c = cols.get(name)
        if not c:
            return None
        k = n0 + i - int(c.get("start") or 0)
        v = c["data"][k] if 0 <= k < len(c["data"]) else None
        return None if v is None else float(v)

    dp, out = None, []
    for name, sp in zip(ser, specs):
        kind = sp[0]
        if kind == "date":
            arr = list(dates)
        elif kind == "alias":
            arr = [val(sp[1][0], i) for i in range(len(dates))]
        elif kind == "sum":
            arr = []
            for i in range(len(dates)):
                vs = [val(p_, i) for p_ in sp[1]]
                vs = [v for v in vs if v is not None]
                arr.append(sum(vs) if vs else None)
        elif kind == "puell":
            arr = []
            for i in range(len(dates)):
                a, c = val(sp[1][0], i), val(sp[1][1], i)
                arr.append(a / (c / 365) if a is not None and c else None)
        elif kind == "sma":
            if dp is None:
                dp = daily_price()
            arr = [None if v is None else v * sp[3] for v in month_end_sma(dp[0], dp[1], sp[2], dates)]
        out.append({"index": "month1", "type": "Derived", "start": n0, "end": n0 + len(dates), "data": arr, "translated": name})
    return out


def fetch_group(ser):
    st, j, t = http_json(f"{BULK}?index=month1&series={','.join(ser)}&start={START}")
    if st == 200 and isinstance(j, list) and len(j) >= len(ser):
        return j
    if st in (400, 404) and "not found" in t:
        print("  新版 Bitview：按对照表换算", ",".join(ser))
        return translate(ser)
    raise ValueError(f"HTTP {st}")


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else "data/monthly.json"
    groups, failed = {}, []
    for ser in GROUPS:
        key = ",".join(ser)
        try:
            raw = fetch_group(ser)
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
