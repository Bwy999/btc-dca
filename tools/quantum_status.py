#!/usr/bin/env python3
"""量子准备度：读取 BIP 仓库中量子相关提案的状态（V26.4.15）

在 GitHub Actions 里每天运行，写入 data/quantum.json：
  {"v":1,"generated":"…","bips":{"360":{"status":"Draft","title":"…"},"361":{…}}}
只读取提案头部的 Title / Status 字段，不做任何推断；读取失败的提案不写入（网页改用人工核对的里程碑）。

用法：python3 tools/quantum_status.py data/quantum.json
"""
import json
import os
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone

BIPS = ["360", "361"]
BASE = "https://raw.githubusercontent.com/bitcoin/bips/master/bip-{n}.{ext}"


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "sats-garden-quantum/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")


def header(text):
    out = {}
    for key in ("Title", "Status", "Type", "Created"):
        m = re.search(r"^\s*" + key + r":\s*(.+?)\s*$", text[:4000], re.M)
        if m:
            out[key.lower()] = m.group(1).strip()
    return out


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else "data/quantum.json"
    bips = {}
    for n in BIPS:
        num = n.zfill(4)
        for ext in ("mediawiki", "md"):
            try:
                h = header(get(BASE.format(n=num, ext=ext)))
                if h.get("status"):
                    bips[n] = h
                    break
            except Exception:
                time.sleep(1)
    if not bips:
        raise SystemExit("BIP 仓库暂时无法读取")
    data = {"v": 1, "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "bips": bips}
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(json.dumps(bips, ensure_ascii=False))


if __name__ == "__main__":
    main()
