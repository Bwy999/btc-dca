#!/usr/bin/env python3
"""V26.6 截图回归测试：固定数据、固定时间、断网，逐分区截图，并与基线逐像素对比。

用法
  拍基线：  python3 tests/visual_test.py capture <站点目录> <输出目录> [--fixture 快照.json] [--full] [--only 393,light,zh-CN]
  对比：    python3 tests/visual_test.py compare <基线目录> <新截图目录> <报告目录>

站点目录是 build.py split 的输出（含 index.html、assets/、sw.js）。
快照 JSON 由网站的 #test-snapshot 导出（只含行情与链上缓存，不含持仓、账本、预算）。
不给快照时，页面在断网状态下渲染（骨架条与「暂不可用」），同样可以用来发现排版回退。

默认矩阵：393 浅色中文、393 深色中文、375 浅色英文、430 浅色中文、1440 浅色中文、1024 深色英文；
--full 为 375/393/430/1024/1440 × 浅/深 × 中/英。
"""
import asyncio, json, os, sys, glob, time

TABS = ["now", "value", "chain", "mine"]
DEFAULT = [(393, "light", "zh-CN"), (393, "dark", "zh-CN"), (375, "light", "en-US"), (430, "light", "zh-CN"), (1440, "light", "zh-CN"), (1024, "dark", "en-US")]
FULL = [(w, c, l) for w in (375, 393, 430, 1024, 1440) for c in ("light", "dark") for l in ("zh-CN", "en-US")]
# 关闭动画与闪烁，保证同一份输入得到同一张图
FREEZE_CSS = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}"
DEFAULT_TIME = "2026-10-18T12:00:00Z"


def _init_script(fixture):
    store = (fixture or {}).get("storage", {})
    lang = None
    return (
        "(()=>{try{const s=%s;for(const k in s){localStorage.setItem(k,s[k])}}catch(e){}"
        "try{localStorage.setItem('btc_last_visit_v2','')}catch(e){}})();" % json.dumps(store)
    )


async def capture(site, out, fixture_path=None, full=False, only=None):
    from playwright.async_api import async_playwright
    fixture = json.load(open(fixture_path, encoding="utf-8")) if fixture_path else None
    at = (fixture or {}).get("capturedAt") or DEFAULT_TIME
    os.makedirs(out, exist_ok=True)
    url = "file://" + os.path.abspath(os.path.join(site, "index.html"))
    matrix = FULL if full else DEFAULT
    if only:
        w, c, l = only.split(","); matrix = [(int(w), c, l)]
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for w, scheme, loc in matrix:
            ctx = await b.new_context(viewport={"width": w, "height": 900 if w >= 1024 else 852}, device_scale_factor=2, locale=loc,
                                      color_scheme=scheme, reduced_motion="reduce")
            await ctx.clock.set_fixed_time(at)
            await ctx.add_init_script(_init_script(fixture))
            await ctx.route("**/*", lambda r: r.continue_() if r.request.url.startswith("file:") else r.abort())
            pg = await ctx.new_page()
            errors = []
            pg.on("pageerror", lambda e: errors.append(str(e)))
            await pg.goto(url)
            await pg.add_style_tag(content=FREEZE_CSS)
            await pg.wait_for_timeout(3000)
            for t in TABS:
                await pg.evaluate("(t)=>{setTab(t);window.scrollTo(0,0)}", t)
                await pg.wait_for_timeout(500)
                await pg.evaluate("()=>document.querySelectorAll('details.module-fold').forEach(x=>{if(x.offsetParent)x.open=true})")
                # 滚动两遍，让按需加载的模块都完成初始化
                for _pass in range(2):
                    h = await pg.evaluate("document.documentElement.scrollHeight"); y = 0
                    while y < h:
                        await pg.evaluate("(y)=>window.scrollTo({top:y,behavior:\"instant\"})", y); await pg.wait_for_timeout(200); y += 600
                        h = await pg.evaluate("document.documentElement.scrollHeight")
                # 等页面安静下来：骨架条数量和页面高度连续 1.2 秒不变（最多 10 秒），避免异步计算的先后造成截图不一致
                last = None; stable = 0
                for _ in range(25):
                    await pg.wait_for_timeout(400)
                    cur = await pg.evaluate("()=>[document.querySelectorAll('.sk-wait,[aria-busy=true]').length,document.documentElement.scrollHeight,(document.body.innerText.match(/计算中|Computing/g)||[]).length]")
                    stable = stable + 1 if cur == last else 0; last = cur
                    if stable >= 3: break
                await pg.evaluate("window.scrollTo(0,0)"); await pg.wait_for_timeout(300)
                # 底部导航固定在屏幕上，整页截图时会叠在中间；截图时隐藏
                await pg.add_style_tag(content=".nav-dock{visibility:hidden!important}")
                name = f"{t}_{w}_{scheme}_{loc}.png"
                try:
                    await pg.screenshot(path=os.path.join(out, name), full_page=True, timeout=90000)
                except Exception:
                    await pg.wait_for_timeout(1000)
                    await pg.screenshot(path=os.path.join(out, name), full_page=True, timeout=90000)
                await pg.add_style_tag(content=".nav-dock{visibility:visible!important}")
                print("拍摄", name, flush=True)
            if errors:
                print("页面错误", w, scheme, loc, errors[:3])
            await ctx.close()
        await b.close()


def compare(base, cur, report):
    from PIL import Image, ImageChops
    os.makedirs(report, exist_ok=True)
    names = sorted(set(os.listdir(base)) | set(os.listdir(cur)))
    names = [n for n in names if n.endswith(".png")]
    changed = []
    for n in names:
        a, b = os.path.join(base, n), os.path.join(cur, n)
        if not os.path.exists(a) or not os.path.exists(b):
            changed.append((n, "缺少截图", None)); continue
        A, B = Image.open(a).convert("RGB"), Image.open(b).convert("RGB")
        if A.size != B.size:
            # 高度不同：找到第一处不同的行，截出前后一段并排对比
            h = min(A.height, B.height); w = min(A.width, B.width)
            dd = ImageChops.difference(A.crop((0, 0, w, h)), B.crop((0, 0, w, h))).convert("L").point(lambda v: 255 if v > 24 else 0)
            bb = dd.getbbox()
            y = bb[1] if bb else h
            changed.append((n, f"高度变化 {A.height} → {B.height}，第一处不同在 y={y}", (A, B, (0, y, w, y + 1))))
            continue
        d = ImageChops.difference(A, B).convert("L").point(lambda v: 255 if v > 24 else 0)
        box = d.getbbox()
        if box:
            px = d.histogram()[255]
            changed.append((n, f"{px} 个像素不同，区域 {box}", (A, B, box)))
    lines = [f"共 {len(names)} 张，变化 {len(changed)} 张"]
    for n, why, data in changed:
        lines.append(f"✗ {n}  {why}")
        if data and data[2]:
            A, B, (x0, y0, x1, y1) = data
            pad = 60; x0, y0 = max(0, x0 - pad), max(0, y0 - 400); x1 = min(A.width, B.width, x1 + pad)
            y1 = max(y1 + pad, y0 + 1600); y1 = min(y1, y0 + 2400)
            ca = A.crop((x0, y0, x1, min(A.height, y1))); cb = B.crop((x0, y0, x1, min(B.height, y1)))
            sheet = Image.new("RGB", (ca.width + cb.width + 20, max(ca.height, cb.height)), (255, 0, 0))
            sheet.paste(ca, (0, 0)); sheet.paste(cb, (ca.width + 20, 0))
            sheet.save(os.path.join(report, "diff_" + n))
    if not changed:
        lines.append("全部一致")
    open(os.path.join(report, "report.txt"), "w", encoding="utf-8").write("\n".join(lines) + "\n")
    print("\n".join(lines))
    return 0 if not changed else 1


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a or a[0] not in ("capture", "compare"):
        print(__doc__); sys.exit(2)
    if a[0] == "capture":
        fx = a[a.index("--fixture") + 1] if "--fixture" in a else None
        only = a[a.index("--only") + 1] if "--only" in a else None
        asyncio.run(capture(a[1], a[2], fx, "--full" in a, only))
    else:
        sys.exit(compare(a[1], a[2], a[3]))
