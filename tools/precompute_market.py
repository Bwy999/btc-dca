#!/usr/bin/env python3
"""V27.10：每 6 小时预先下载两份「大而慢」的数据，存到网站自己的 data/ 目录。
手机打开网页时先读这里（同一网站，不用连境外接口），没有或过期才自己去取。

  data/stablecoins.json  USDT / USDC 每日流通量（DefiLlama；不通时 CoinGecko 近 365 天）+ BTC 每日价格（Bitview），约 3 年
  data/mining.json       全网算力 / 难度全部历史（mempool.space；不通时 Bitview 同格式接口）

用法：python3 tools/precompute_market.py data
"""
import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timezone

SPAN = 1100
UA = {"User-Agent": "sats-garden-market/1.0", "Accept": "application/json"}


def get(url, timeout=90):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def day(ts_sec):
    return datetime.fromtimestamp(int(ts_sec), tz=timezone.utc).strftime("%Y-%m-%d")


def llama(sid):
    out = {}
    for x in get(f"https://stablecoins.llama.fi/stablecoincharts/all?stablecoin={sid}"):
        v = ((x.get("totalCirculatingUSD") or {}).get("peggedUSD"))
        if x.get("date") and v and v > 0:
            out[day(x["date"])] = float(v)
    if len(out) < 300:
        raise ValueError("llama short")
    return out


def coingecko(cid):
    j = get(f"https://api.coingecko.com/api/v3/coins/{cid}/market_chart?vs_currency=usd&days=365")
    out = {}
    for (t, mc), (_, px) in zip(j.get("market_caps", []), j.get("prices", [])):
        px = px if 0.97 < (px or 0) < 1.03 else 1.0
        if mc and mc > 1e9:
            out[day(t / 1000)] = float(mc) / px
    if len(out) < 200:
        raise ValueError("coingecko short")
    return out


def btc_prices():
    j = get(f"https://bitview.space/api/series/bulk?index=day1&series=date,price&start=-{SPAN + 5}")
    return {d: float(p) for d, p in zip(j[0]["data"], j[1]["data"]) if p}


def stablecoins():
    src = "llama"
    try:
        u, c = llama(1), llama(2)
    except Exception as e:
        print("  DefiLlama 不通，改用 CoinGecko：", e)
        src = "coingecko"
        u = coingecko("tether")
        time.sleep(2)
        c = coingecko("usd-coin")
    try:
        p = btc_prices()
    except Exception as e:
        print("  BTC 价格读取失败：", e)
        p = {}
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    days = sorted(d for d in u if d in c and d < today)[-SPAN:]
    last = 0.0
    prices = []
    for d in days:
        last = p.get(d, last)
        prices.append(round(last, 2))
    return {"ts": int(time.time() * 1000), "src": src, "days": days,
            "u": [round(u[d]) for d in days], "c": [round(c[d]) for d in days], "p": prices}


def mining():
    for url in ("https://mempool.space/api/v1/mining/hashrate/all", "https://bitview.space/api/v1/mining/hashrate/all"):
        try:
            j = get(url, timeout=120)
            if isinstance(j, dict) and len(j.get("hashrates") or []) > 100 and len(j.get("difficulty") or []) > 20:
                return {"ts": int(time.time() * 1000), "src": url.split("/")[2], "raw": j}
        except Exception as e:
            print("  ", url, e)
    raise ValueError("mining sources failed")


SITE = "https://bwy999.github.io/btc-dca/"


def bark(title, body):
    """仓库 Secrets 设了 BARK_KEY 才推送（与每日结论推送同一个设置）。"""
    import urllib.parse
    key = os.environ.get("BARK_KEY", "").strip()
    if not key:
        print("  BARK_KEY 未设置，跳过推送：", title)
        return False
    base = key if key.startswith("http") else f"https://api.day.app/{key}"
    url = f"{base.rstrip('/')}/{urllib.parse.quote(title, safe='')}/{urllib.parse.quote(body, safe='')}?group=BTC&url={urllib.parse.quote(SITE, safe='')}"
    try:
        urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=20).read()
        print("  已推送：", title)
        return True
    except Exception as e:
        print("  推送失败：", e)
        return False


def stable_alert(out):
    """V27.11：稳定币 12 小时异动推送——近 12 小时供应量（市值 ÷ 价格）变化 ≥ 市值 0.3% 时推送；同一币同一方向 12 小时内只推一次。"""
    path = os.path.join(out, "alert-state.json")
    try:
        st = json.load(open(path, encoding="utf-8"))
    except Exception:
        st = {}
    now = time.time()
    lines = []
    for cid, name in (("tether", "USDT"), ("usd-coin", "USDC")):
        try:
            j = get(f"https://api.coingecko.com/api/v3/coins/{cid}/market_chart?vs_currency=usd&days=1")
            pts = [(t / 1000, mc / px) for (t, mc), (_, px) in zip(j["market_caps"], j["prices"]) if px and 0.97 < px < 1.03]
            last = pts[-1]
            base = next((p for p in reversed(pts) if p[0] <= last[0] - 12 * 3600), None)
            if not base:
                continue
            d = last[1] - base[1]
            if abs(d) >= last[1] * 0.003:
                k = f"{name}:{'up' if d > 0 else 'down'}"
                if now - float(st.get(k, 0)) >= 12 * 3600:
                    lines.append(f"{name} {'增发' if d > 0 else '赎回'} {abs(d) / 1e9:.2f}B（{d / last[1] * 100:+.2f}%）")
                    st[k] = now
            time.sleep(2)
        except Exception as e:
            print("  稳定币 12 小时数据读取失败：", cid, e)
    if lines:
        bark("稳定币 12 小时异动", "；".join(lines))
    with open(path, "w", encoding="utf-8") as f:
        json.dump(st, f)


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "data"
    os.makedirs(out, exist_ok=True)
    ok = 0
    for name, fn in (("stablecoins.json", stablecoins), ("mining.json", mining)):
        try:
            data = fn()
            with open(os.path.join(out, name), "w", encoding="utf-8") as f:
                json.dump(data, f, separators=(",", ":"))
            print("✓", name, data.get("src"), len(data.get("days") or (data.get("raw") or {}).get("hashrates") or []))
            ok += 1
        except Exception as e:
            print("✗", name, e)
    try:
        stable_alert(out)
    except Exception as e:
        print("✗ 异动推送", e)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
