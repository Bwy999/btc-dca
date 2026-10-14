#!/usr/bin/env python3
"""每日状态与 iPhone 推送（V26.4）

在 GitHub Actions 里每天运行一次：
  1. 用 Bitview 数据计算与网站完全相同的「今日结论」：AHR999（新拟合）、顶底区间、牛市后期风控。
  2. 写入 data/daily-state.json（含最近 120 天的每日记录）。
  3. 结论发生变化时，通过 Bark 推送到 iPhone（仓库 Secrets 里设置 BARK_KEY 才会推送）。
     设置 PUSH_DAILY=1 时，每天都推送一条摘要。

用法：python3 tools/daily_state.py data/daily-state.json
只用 Python 标准库。
"""
import json
import math
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

BULK = "https://bitview.space/api/series/bulk"
SITE = os.environ.get("SITE_URL", "https://9992100.xyz/")
AHR_A, AHR_B = 5.5856, -16.1567          # 新拟合（与网站一致）
GENESIS = datetime(2009, 1, 3, tzinfo=timezone.utc)
W, MIN = 48, 24                           # 过去 4 年分位，至少 24 个有效月


def get_json(url, tries=3):
    last = None
    for k in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "btc-intelligence-daily/1.0"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:
            last = e
            time.sleep(2 + 3 * k)
    raise last


def pick(raw, name, idx):
    if not isinstance(raw, list):
        return None
    for x in raw:
        if isinstance(x, dict) and name in (x.get("series"), x.get("name"), x.get("id")):
            return x.get("data")
    return raw[idx].get("data") if len(raw) > idx and isinstance(raw[idx], dict) else None


def num(v):
    try:
        v = float(v)
        return v if math.isfinite(v) else None
    except Exception:
        return None


def bulk(series, index, start):
    raw = get_json(f"{BULK}?index={index}&series={','.join(series)}&start={start}")
    cols = [pick(raw, n, i) or [] for i, n in enumerate(series)]
    out = {}
    for i, d in enumerate(cols[0]):
        out[str(d)] = {n: (num(cols[k][i]) if i < len(cols[k]) else None) for k, n in enumerate(series) if k}
    return out


# ---------- AHR999（新拟合） ----------
def ahr999():
    days = bulk(["date", "price"], "day1", "-230")
    rows = [(d, v["price"]) for d, v in sorted(days.items()) if v["price"] and v["price"] > 0]
    if len(rows) < 200:
        raise SystemExit("price history too short")
    day, price = rows[-1]
    closes = [p for _, p in rows[-200:]]
    hm = 200 / sum(1 / p for p in closes)
    dg = (datetime.strptime(day, "%Y-%m-%d").replace(tzinfo=timezone.utc) - GENESIS).days
    pl = 10 ** (AHR_A * math.log10(dg) + AHR_B)
    v = price * price / (hm * pl)
    zone = "deep" if v < 0.45 else "value" if v < 1.2 else "warm" if v < 5 else "over"
    return {"day": day, "price": price, "ahr": round(v, 4), "zone": zone}


# ---------- 顶底区间与牛市后期风控（与网站同一规则） ----------
def rp_col(a):
    out = []
    for i in range(len(a)):
        if a[i] is None:
            out.append(None); continue
        win = [x for x in a[max(0, i - W + 1):i + 1] if x is not None]
        out.append(sum(1 for x in win if x <= a[i]) / len(win) * 100 if len(win) >= MIN else None)
    return out


def rp_plain(a, i):
    if i + 1 < MIN:
        return None
    win = a[max(0, i - W + 1):i + 1]
    return sum(1 for x in win if x <= a[i]) / len(win) * 100


def zones():
    A = bulk(["date", "lth_nupl", "lth_supply_in_loss_share", "utxos_over_1y_old_transfer_volume_sum_1m", "price", "nupl", "sth_nupl", "supply_in_profit_share", "reserve_risk"], "month1", "2012-01-01")
    try:  # 辅助序列偶发超时时不让整个任务失败（与网页一致：缺少这几项时按其余类别计算）
        B = bulk(["date", "mvrv", "puell_multiple", "price_sma_111d", "price_sma_350d_x2"], "month1", "2012-01-01")
    except Exception as e:
        print("辅助序列暂不可用：", e); B = {}
    rows = []
    for d in sorted(A):
        a, b = A[d], B.get(d, {})
        if not (a.get("price") and a["price"] > 0 and a.get("lth_nupl") is not None):
            continue
        rr = a.get("reserve_risk")
        s111, s350 = b.get("price_sma_111d"), b.get("price_sma_350d_x2")
        rows.append({"m": d[:7], "price": a["price"], "nupl": a["lth_nupl"], "mnupl": a.get("nupl"), "snupl": a.get("sth_nupl"),
                     "sip": a.get("supply_in_profit_share"), "psil": a.get("lth_supply_in_loss_share"), "rev": a.get("utxos_over_1y_old_transfer_volume_sum_1m"),
                     "rrl": math.log10(rr) if rr and rr > 0 else None, "mvrv": b.get("mvrv"), "puell": b.get("puell_multiple"),
                     "pi": s111 / s350 if s111 and s350 and s111 > 0 and s350 > 0 else None})
    P = {k: rp_col([r[k] for r in rows]) for k in ["mvrv", "mnupl", "nupl", "rrl", "sip", "psil", "snupl", "puell", "rev", "pi"]}
    P["psilInv"] = [None if v is None else 100 - v for v in P["psil"]]
    fams = [("value", ["mvrv", "mnupl", "nupl", "rrl", "sip", "psilInv"]), ("sth", ["snupl"]), ("miner", ["puell"]), ("old", ["rev"]), ("trend", ["pi"])]
    i = len(rows) - 1
    fam = {}
    for f, ks in fams:
        xs = [P[k][i] for k in ks if P[k][i] is not None]
        fam[f] = round(sum(xs) / len(xs), 1) if xs else None
    vals = [v for v in fam.values() if v is not None]
    score = sum(vals) / len(vals) if len(vals) >= 3 else None
    rr, pi, rev = P["rrl"][i], P["pi"][i], P["rev"][i]
    top = rr is not None and rr >= 75
    strong = top and ((pi or 0) >= 75 or (rev or 0) >= 75)
    zone = "neutral" if score is None else "bottom" if score <= 25.0001 else ("topStrong" if strong else "top") if top else "neutral"

    # 牛市后期风控：近 12 个月 LTH NUPL 曾 ≥ 4 年 85% 分位；之后月线收盘较本轮最高回撤 20% 提示一次
    nu = [r["nupl"] for r in rows]
    nrs = [rp_plain(nu, k) for k in range(len(rows))]
    hi = hi_i = None; armed = False; state = None
    for k in range(len(rows)):
        late = any((nrs[j] or 0) >= 85 for j in range(max(0, k - 12), k + 1))
        if late:
            if hi is None or rows[k]["price"] > hi:
                hi, hi_i, armed = rows[k]["price"], k, True
            dd = rows[k]["price"] / hi - 1
            if armed and dd <= -0.2:
                armed = False
            state = {"late": True, "armed": armed, "dd": dd, "hi": hi, "hiMonth": rows[hi_i]["m"]}
        else:
            hi = None; armed = False; state = {"late": False}
    risk = "off" if not state["late"] else "watch" if state["armed"] else "fired"
    return {"month": rows[i]["m"], "zone": zone, "score": None if score is None else round(score, 1), "fam": fam,
            "rr": None if rr is None else round(rr), "risk": risk,
            "dd": round(state.get("dd", 0), 4) if state["late"] else None}


ZN = {"deep": "深度低估", "value": "长期低估", "warm": "估值偏热", "over": "高估风险"}
TBN = {"bottom": "底部区", "top": "顶部区", "topStrong": "顶部区 · 强", "neutral": "中性区间"}
RKN = {"off": "未启动", "watch": "监控中", "fired": "已提示"}


def verdict(a, t):
    if t["risk"] == "fired":
        act = "风控已提示：按预设计划减仓"
    elif t["zone"] in ("top", "topStrong"):
        act = "顶部区域：暂停加仓，准备风控"
    elif t["zone"] == "bottom" or a["ahr"] < 0.45:
        act = "底部区域：可按计划加大定投"
    elif a["ahr"] <= 1.2:
        act = "按计划定投"
    else:
        act = "估值偏高：放慢定投"
    parts = [ZN[a["zone"]], TBN[t["zone"]]] + (["风控" + RKN[t["risk"]]] if t["risk"] != "off" else [])
    return " · ".join(parts), act


def bark(title, body):
    key = os.environ.get("BARK_KEY", "").strip()
    if not key:
        print("BARK_KEY 未设置，跳过推送")
        return False
    base = key if key.startswith("http") else f"https://api.day.app/{key}"
    url = f"{base.rstrip('/')}/{urllib.parse.quote(title, safe='')}/{urllib.parse.quote(body, safe='')}?group=BTC&url={urllib.parse.quote(SITE, safe='')}"
    try:
        get_json(url, tries=2)
        print("已推送：", title)
        return True
    except Exception as e:
        print("推送失败：", e)
        return False


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else "data/daily-state.json"
    old = {}
    if os.path.exists(out_path):
        try:
            old = json.load(open(out_path, encoding="utf-8"))
        except Exception:
            old = {}
    a, t = ahr999(), zones()
    headline, action = verdict(a, t)
    now = {"day": a["day"], "price": a["price"], "ahr": a["ahr"], "ahrZone": a["zone"], "tb": t["zone"], "score": t["score"], "risk": t["risk"], "headline": headline, "action": action}
    hist = [h for h in (old.get("history") or []) if h.get("day") != now["day"]] + [now]
    hist = hist[-120:]
    prev = old.get("today") or {}

    changes = []
    if prev:
        if prev.get("ahrZone") != now["ahrZone"]:
            changes.append(f"AHR999 分区：{ZN.get(prev.get('ahrZone'), '--')} → {ZN[now['ahrZone']]}")
        if prev.get("tb") != now["tb"]:
            changes.append(f"顶底区间：{TBN.get(prev.get('tb'), '--')} → {TBN[now['tb']]}")
        if prev.get("risk") != now["risk"]:
            changes.append(f"牛市风控：{RKN.get(prev.get('risk'), '--')} → {RKN[now['risk']]}")
        if prev.get("action") != now["action"] and not changes:
            changes.append(f"执行提示：{prev.get('action')} → {now['action']}")
    body_tail = f"BTC ${now['price']:,.0f} · AHR999 {now['ahr']:.3f} · 综合分 {now['score'] if now['score'] is not None else '--'}"
    pushed = False
    if changes:
        pushed = bark("BTC 今日结论有变化", "；".join(changes) + "。现在：" + action + "。" + body_tail)
    elif os.environ.get("PUSH_DAILY") == "1":
        pushed = bark("BTC 今日结论", headline + " · " + action + "。" + body_tail)

    data = {"v": 1, "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "today": now,
            "zones": t, "changes": changes, "pushed": pushed, "history": hist}
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(headline, "|", action, "|", body_tail, "| changes:", changes or "无")


if __name__ == "__main__":
    main()
