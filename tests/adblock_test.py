#!/usr/bin/env python3
"""V27.1 广告拦截器模拟测试：网页里有没有元素会被广告拦截类扩展 / 内容拦截器当成广告隐藏。

用法：python3 tests/adblock_test.py <站点目录>
做法：打开四个分区、展开全部折叠项，用常见拦截规则（EasyList / 中文规则里的通用隐藏选择器）逐条匹配页面元素。
有任何元素被匹配到就判为失败，并列出元素。背景：V27.0.4 前「持币地址分布」的类名是 ad-panel、ad-row，在装了拦截器的 iPhone 上整块被隐藏。
"""
import asyncio, os, sys

SELECTORS = [
    '[class^="ad-"]', '[class*=" ad-"]', '[class^="ad_"]', '[class*=" ad_"]', '[class$="-ad"]', '[class*="-ad "]', '[class*="-ad-"]', '[class*="_ad_"]',
    '[id^="ad-"]', '[id^="ad_"]', '[id^="ads"]', '[id*="-ad-"]', '[id*="_ad_"]', '[id$="-ad"]',
    '.ad', '.ads', '.adbox', '.ad-box', '.adsbygoogle', '.advert', '.advertisement', '[class*="ads-"]', '[class*="-ads"]',
    '[class*="advert"]', '[id*="advert"]', '[class*="banner"]', '[id*="banner"]', '[class*="sponsor"]', '[id*="sponsor"]',
    '[class*="promo"]', '[id*="promo"]', '[class*="popup"]', '[class*="guanggao"]', '[class*="tuiguang"]', '[class^="gg-"]', '[id^="gg-"]',
]

async def main(site):
    from playwright.async_api import async_playwright
    url = "file://" + os.path.abspath(os.path.join(site, "index.html"))
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 393, "height": 852})
        await pg.route("**/*", lambda r: r.continue_() if r.request.url.startswith("file:") else r.abort())
        await pg.goto(url); await pg.wait_for_timeout(2500)
        hits = {}
        for t in ["now", "value", "chain", "mine"]:
            await pg.evaluate("(t)=>{setTab(t);document.querySelectorAll('details').forEach(x=>x.open=true)}", t)
            await pg.wait_for_timeout(1500)
            r = await pg.evaluate("""(sels)=>{const out={};for(const s of sels){let n;try{n=[...document.querySelectorAll(s)]}catch(e){continue}
              n=n.filter(e=>!e.closest('#sgDiag'));if(n.length)out[s]=n.slice(0,5).map(e=>e.tagName.toLowerCase()+(e.id?'#'+e.id:'')+(e.className&&typeof e.className==='string'?'.'+e.className.trim().split(/\\s+/).join('.'):''))}return out}""", SELECTORS)
            for k, v in r.items(): hits.setdefault(k, set()).update(v)
        await b.close()
    if hits:
        print("✗ 有元素会被广告拦截器隐藏：")
        for k, v in hits.items(): print("  ", k, "→", ", ".join(sorted(v)))
        sys.exit(1)
    print("全部通过：%d 条常见拦截规则，四个分区展开后没有元素命中" % len(SELECTORS))

if __name__ == "__main__":
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "."))
