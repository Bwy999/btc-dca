#!/usr/bin/env python3
"""V28 数据层：GitHub 每 6 小时把网页要用的 Bitview 数据算好，写成 data/v28/ 下的两个文件，手机只读文件、不再直接连 Bitview。

  data/v28/core.json    首页和定投页要用的「最新值」（很小，几 KB）
  data/v28/charts.json  指标页图表要用的历史序列（约 200 KB）

网页（V28）不再认识 Bitview 的序列名——以后 Bitview 再改名，只改这个脚本。
任何一组读取失败：沿用上一次文件里的那一组（标 stale），不让整个文件作废。
用法：python3 tools/v28_build_data.py data/v28
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

BASE = "https://bitview.space"
UA = {"User-Agent": "sats-garden-v28/1.0", "Accept": "application/json"}
PCT = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95]
AGE_GROUPS = [("m1", ["under_1h", "1h_to_1d", "1d_to_1w", "1w_to_1m"]),
              ("m6", ["1m_to_2m", "2m_to_3m", "3m_to_4m", "4m_to_5m", "5m_to_6m"]),
              ("y1", ["6m_to_9m", "9m_to_1y"]),
              ("y2", ["1y_to_18m", "18m_to_2y"]),
              ("y5", ["2y_to_3y", "3y_to_4y", "4y_to_5y"]),
              ("old", ["5y_to_6y", "6y_to_7y", "7y_to_8y", "8y_to_10y", "10y_to_12y", "12y_to_15y", "over_15y"])]
BANDS = [b for _, bs in AGE_GROUPS for b in bs]
OLD_BANDS = ["5y_to_6y", "6y_to_7y", "7y_to_8y", "8y_to_10y", "10y_to_12y", "12y_to_15y", "over_15y"]


def get(url, tries=3):
    last = None
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (400, 404):
                raise
        except Exception as e:
            last = e
        time.sleep(2 * (k + 1))
    raise last


def bulk(index, names, start):
    """返回 {名字: [数值…]}，第一列 date。每次最多 30 个序列。"""
    out = {}
    for i in range(0, len(names), 29):
        part = names[i:i + 29]
        r = get(f"{BASE}/api/series/bulk?index={index}&series={','.join(['date'] + part)}&start={start}")
        out.setdefault("date", r[0]["data"])
        if len(r[0]["data"]) != len(out["date"]):
            raise ValueError("bulk parts misaligned")
        for n, col in zip(part, r[1:]):
            out[n] = col["data"]
        time.sleep(0.3)
    return out


def rnd(v, nd=2):
    return None if v is None else round(float(v), nd)


def pname(p):
    return "cost_basis_by_coin_median" if p == 50 else f"cost_basis_by_coin_p{p}"


# ---------- 各组数据（每组一个函数，互不影响） ----------
def g_daily():
    """近 3 年日度：价格、LTH_PSIL、长 / 短期持币量、长期持有者 30 天变化、成本分位带。"""
    names = ["price", "lth_supply_in_loss_share", "lth_supply", "sth_supply", "lth_supply_delta_1m"] + [pname(p) for p in (25, 40, 50, 60, 75)]
    r = bulk("day1", names, -1100)
    return {"d": r["date"], "price": [rnd(x) for x in r["price"]], "psil": [rnd(x) for x in r["lth_supply_in_loss_share"]],
            "lth": [rnd(x, 0) for x in r["lth_supply"]], "sth": [rnd(x, 0) for x in r["sth_supply"]],
            "lthDelta30": [rnd(x, 0) for x in r["lth_supply_delta_1m"]],
            **{f"p{p}": [rnd(x, 0) for x in r[pname(p)]] for p in (25, 40, 50, 60, 75)}}


def g_price_all():
    """全部历史日收盘（AHR999 的 200 日成本和拟合要用）。"""
    r = bulk("day1", ["price"], "2010-07-17")
    return {"start": r["date"][0], "v": [rnd(x) for x in r["price"]]}


def g_percentiles():
    r = bulk("day1", [pname(p) for p in PCT], -1)
    return {"day": r["date"][-1], "pct": PCT, "v": [rnd(r[pname(p)][-1], 0) for p in PCT]}


def g_cohort_weekly():
    """长期持有者分组成本（周度）：≤10 年、6 月–5 年、6 月–7 年、6 月–10 年。"""
    names = ["price", "realized_cap", "circulating_supply", "age_under_6m_realized_cap", "age_under_6m_supply"]
    for b in OLD_BANDS:
        names += [f"age_{b}_realized_cap", f"age_{b}_supply"]
    r = bulk("week1", names, "2013-01-01")
    n = len(r["date"])
    f = lambda k, i: float(r[k][i] or 0)
    out = {"d": r["date"], "price": [rnd(x) for x in r["price"]], "l10": [], "a5": [], "a7": [], "a10": []}
    q = lambda R, S: round(R / S) if S > 1e3 and R > 0 else None
    for i in range(n):
        oR = sum(f(f"age_{b}_realized_cap", i) for b in ("10y_to_12y", "12y_to_15y", "over_15y"))
        oS = sum(f(f"age_{b}_supply", i) for b in ("10y_to_12y", "12y_to_15y", "over_15y"))
        R10, S10 = f("realized_cap", i) - oR, f("circulating_supply", i) - oS
        Ra, Sa = R10 - f("age_under_6m_realized_cap", i), S10 - f("age_under_6m_supply", i)
        R7 = Ra - f("age_7y_to_8y_realized_cap", i) - f("age_8y_to_10y_realized_cap", i)
        S7 = Sa - f("age_7y_to_8y_supply", i) - f("age_8y_to_10y_supply", i)
        R5 = R7 - f("age_5y_to_6y_realized_cap", i) - f("age_6y_to_7y_realized_cap", i)
        S5 = S7 - f("age_5y_to_6y_supply", i) - f("age_6y_to_7y_supply", i)
        out["l10"].append(q(R10, S10)); out["a10"].append(q(Ra, Sa)); out["a7"].append(q(R7, S7)); out["a5"].append(q(R5, S5))
    return out


def g_age():
    """各币龄的持币成本：六组的持币量、平均成本、盈利占比 + 每组的成本分布（每 1,000 美元一档）。"""
    cols = {}
    for suf in ("supply", "realized_cap", "supply_in_profit"):
        r = bulk("day1", [f"age_{b}_{suf}" for b in BANDS], -1)
        cols[suf] = {b: float(r[f"age_{b}_{suf}"][-1] or 0) for b in BANDS}
        day = r["date"][-1]
    rows, dist = [], {}
    for k, bs in AGE_GROUPS:
        sp = sum(cols["supply"][b] for b in bs); cap = sum(cols["realized_cap"][b] for b in bs); pf = sum(cols["supply_in_profit"][b] for b in bs)
        rows.append({"k": k, "supply": round(sp), "avg": round(cap / sp) if sp > 0 else None, "profit": round(pf / sp, 4) if sp > 0 else None})
        acc, close = {}, 0.0
        for b in bs:
            j = get(f"{BASE}/api/urpd/age_{b}?agg=lin1000")
            close = float(j.get("close") or close)
            bk = j.get("buckets") or {}
            pr = [x["price_floor"] for x in bk] if isinstance(bk, list) else bk.get("price", [])
            su = [x["supply"] for x in bk] if isinstance(bk, list) else bk.get("supply", [])
            for p, s in zip(pr, su):
                if float(s) > 0:
                    acc[int(round(float(p)))] = acc.get(int(round(float(p))), 0.0) + float(s)
            time.sleep(0.2)
        xs = sorted(acc)
        dist[k] = {"x": xs, "y": [round(acc[x], 1) for x in xs], "close": close}
    tot = sum(r["supply"] for r in rows)
    if not 15e6 < tot < 22e6:
        raise ValueError(f"age supply total {tot}")
    return {"day": day, "rows": rows, "dist": dist}


def g_sync():
    j = get(f"{BASE}/api/server/sync")
    return {"height": j.get("computed_height") or j.get("indexed_height"), "behind": j.get("blocks_behind"), "ts": j.get("last_indexed_at_unix")}


GROUPS_CHARTS = {"daily": g_daily, "priceAll": g_price_all, "cohortWeekly": g_cohort_weekly, "age": g_age}
GROUPS_CORE = {"percentiles": g_percentiles, "sync": g_sync}


def latest(daily, cohort, age, pct):
    """core.json 里的「最新值」：首页结论和定投页只需要这些。"""
    out = {}
    if daily:
        i = len(daily["d"]) - 1
        while i > 0 and daily["price"][i] is None:
            i -= 1
        ratio = [l / s if l and s else None for l, s in zip(daily["lth"], daily["sth"])]
        peak = max((x for x in ratio[-500:] if x), default=None)
        out.update({"day": daily["d"][i], "price": daily["price"][i], "psil": daily["psil"][i], "lthDelta30": daily["lthDelta30"][i],
                    "lthSthRatio": rnd(ratio[i], 3), "lthSthFromPeak": rnd(ratio[i] / peak - 1, 4) if peak and ratio[i] else None,
                    "costMedian": daily["p50"][i], "costP25": daily["p25"][i], "costP75": daily["p75"][i]})
    if cohort:
        out["cohort"] = {k: next((x for x in reversed(cohort[k]) if x), None) for k in ("l10", "a5", "a7", "a10")}
    if age:
        out["newBuyers"] = next((r for r in age["rows"] if r["k"] == "m1"), None)
    if pct and out.get("price"):
        v, px, pos = pct["v"], out["price"], None
        for k in range(len(v) - 1):
            if v[k] and v[k] > 0 and v[k] <= px < v[k + 1]:
                import math
                pos = round(PCT[k] + 5 * math.log(px / v[k]) / math.log(v[k + 1] / v[k]))
        if v[-1] and px >= v[-1]:
            pos = 95
        out["pricePercentile"] = pos
    return out


def run(groups, old):
    res, stale = {}, []
    for name, fn in groups.items():
        try:
            res[name] = fn()
            print("✓", name)
        except Exception as e:
            print("✗", name, "：", e)
            if old.get(name) is not None:
                res[name] = old[name]; stale.append(name)
    return res, stale


def load(path):
    try:
        return json.load(open(path, encoding="utf-8"))
    except Exception:
        return {}


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "data/v28"
    os.makedirs(out, exist_ok=True)
    pc, pk = os.path.join(out, "charts.json"), os.path.join(out, "core.json")
    oldc, oldk = load(pc), load(pk)
    charts, s1 = run(GROUPS_CHARTS, oldc)
    core, s2 = run(GROUPS_CORE, oldk)
    if not charts.get("daily"):
        raise SystemExit("日度数据读取失败且没有上一次的文件，不写入")
    now = int(time.time() * 1000)
    charts.update({"v": 1, "ts": now, "stale": s1})
    core.update({"v": 1, "ts": now, "stale": s1 + s2,
                 "latest": latest(charts.get("daily"), charts.get("cohortWeekly"), charts.get("age"), core.get("percentiles"))})
    for path, data in ((pc, charts), (pk, core)):
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, separators=(",", ":"), ensure_ascii=False)
        print(path, os.path.getsize(path) // 1024, "KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
