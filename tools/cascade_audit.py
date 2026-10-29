#!/usr/bin/env python3
"""V26.9 样式层级审计：在多种页面状态下运行 tools/cascade_audit.js，汇总每条声明是否生效。

用法：
  python3 tools/cascade_audit.py run  <source/index.html> <输出.json> [--fixture 快照.json] --only 393,light,zh-CN[,offline]
  python3 tools/cascade_audit.py merge <输出目录> <汇总.json>
每次 run 只跑一组设置（4 个分区）；merge 把多组结果累加。
"""
import asyncio, json, os, sys, glob

TABS = ["now", "value", "chain", "dca", "mine"]

async def run(src, out, fixture, only):
    from playwright.async_api import async_playwright
    w, scheme, loc = only.split(",")[:3]
    offline = only.endswith(",offline")
    fx = json.load(open(fixture, encoding="utf-8")) if (fixture and not offline) else None
    js = open(os.path.join(os.path.dirname(__file__), "cascade_audit.js"), encoding="utf-8").read()
    total = {}; rules = {}; bad = set()
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": int(w), "height": 900 if int(w) >= 1024 else 852}, locale=loc, color_scheme=scheme)
        if fx:
            await ctx.clock.set_fixed_time(fx["capturedAt"])
            await ctx.add_init_script("(()=>{const s=%s;for(const k in s)localStorage.setItem(k,s[k])})()" % json.dumps(fx["storage"]))
        await ctx.route("**/*", lambda r: r.continue_() if r.request.url.startswith("file:") else r.abort())
        pg = await ctx.new_page()
        await pg.goto("file://" + os.path.abspath(src)); await pg.wait_for_timeout(3000)
        for t in TABS:
            await pg.evaluate("(t)=>{setTab(t);window.scrollTo(0,0)}", t); await pg.wait_for_timeout(400)
            await pg.evaluate("()=>document.querySelectorAll('details.module-fold').forEach(x=>{if(x.offsetParent)x.open=true})")
            for _ in range(2):
                h = await pg.evaluate("document.documentElement.scrollHeight"); y = 0
                while y < h:
                    await pg.evaluate("(y)=>window.scrollTo({top:y,behavior:'instant'})", y); await pg.wait_for_timeout(120); y += 700
                    h = await pg.evaluate("document.documentElement.scrollHeight")
            await pg.wait_for_timeout(1500)
            for state in ("closed", "open"):
                # 第二轮：把页面里其余的 details（历史记录、说明等）也展开
                if state == "open":
                    await pg.evaluate("()=>document.querySelectorAll('details').forEach(x=>x.open=true)"); await pg.wait_for_timeout(600)
                r = await pg.evaluate(js)
                for x in r["rules"]: rules[x["id"]] = x
                for k, v in r["stat"].items():
                    a = total.setdefault(k, [0, 0, 0, 0])
                    for i in range(4): a[i] += v[i]
                bad.update(r["bad"])
        await b.close()
    json.dump({"rules": rules, "stat": total, "bad": sorted(bad), "sheets": r["sheets"]}, open(out, "w", encoding="utf-8"), ensure_ascii=False)
    print("完成", only, "规则", len(rules), "声明键", len(total), "无法匹配", len(bad))

def merge(d, out):
    rules, stat, bad, sheets = {}, {}, set(), None
    for f in sorted(glob.glob(os.path.join(d, "*.json"))):
        j = json.load(open(f, encoding="utf-8"))
        rules.update(j["rules"]); bad.update(j["bad"]); sheets = j["sheets"]
        for k, v in j["stat"].items():
            a = stat.setdefault(k, [0, 0, 0, 0])
            for i in range(4): a[i] += v[i]
    json.dump({"rules": rules, "stat": stat, "bad": sorted(bad), "sheets": sheets}, open(out, "w", encoding="utf-8"), ensure_ascii=False)
    dead = [k for k, v in stat.items() if v[0] > 0 and v[1] == 0 and v[3] == 0 and v[2] > 0]
    print("状态文件", len(glob.glob(os.path.join(d, "*.json"))), "声明键", len(stat), "可安全删除的属性", len(dead))

if __name__ == "__main__":
    a = sys.argv[1:]
    if a[0] == "run":
        fx = a[a.index("--fixture") + 1] if "--fixture" in a else None
        asyncio.run(run(a[1], a[2], fx, a[a.index("--only") + 1]))
    else:
        merge(a[1], a[2])
