#!/usr/bin/env python3
"""预计算美国现货比特币 ETF 每日资金流（V27.12.3）

从 TFTC「The Commoner Bitcoin ETF Tracker」拉取公开 JSON（CC BY 4.0），
精简为页面所需字段并写入 data/etf-flows.json（带 v=1 与 generated 时间戳）。
仅使用 Python 标准库；拉取失败时保留已有文件不覆盖。

用法：python3 tools/precompute_etf.py [data/etf-flows.json]
"""
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone

SOURCE_URL = "https://www.tftc.io/bitcoin-etf-flows/data.json"
DEFAULT_OUT = "data/etf-flows.json"


def fetch_json(url, timeout=30):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "SatsGarden/27.12.3 (+https://9992100.xyz/)",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        if resp.status != 200:
            raise RuntimeError(f"HTTP {resp.status}")
        return json.loads(resp.read().decode("utf-8"))


def compact_days(raw_days):
    out = []
    for x in raw_days or []:
        if not isinstance(x, dict) or not x.get("date"):
            continue
        nf = x.get("netFlowUsd")
        if not isinstance(nf, (int, float)):
            continue
        per = x.get("perEtfUsd") or {}
        row = {
            "date": str(x["date"]),
            "netFlowUsd": round(nf),
            "perEtfUsd": {},
        }
        if isinstance(per.get("IBIT"), (int, float)):
            row["perEtfUsd"]["IBIT"] = round(per["IBIT"])
        if isinstance(per.get("FBTC"), (int, float)):
            row["perEtfUsd"]["FBTC"] = round(per["FBTC"])
        close = x.get("btcCloseUsd")
        if isinstance(close, (int, float)) and close > 0:
            row["btcCloseUsd"] = round(close, 2)
        aum = x.get("totalNetAssetsUsd")
        if isinstance(aum, (int, float)) and aum > 0:
            row["totalNetAssetsUsd"] = round(aum)
        out.append(row)
    return out


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_OUT
    raw = fetch_json(SOURCE_URL)
    days = compact_days(raw.get("days"))
    if len(days) <= 20:
        raise RuntimeError(f"unexpected days length: {len(days)}")

    payload = {
        "v": 1,
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "TFTC · The Commoner Bitcoin ETF Tracker (CC BY 4.0)",
        "updatedThrough": raw.get("updatedThrough") or days[-1]["date"],
        "days": days,
    }

    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    tmp_path = out_path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp_path, out_path)
    print(f"OK: wrote {len(days)} sessions (through {payload['updatedThrough']}) -> {out_path}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
