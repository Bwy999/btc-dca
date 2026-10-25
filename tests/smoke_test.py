#!/usr/bin/env python3
"""上线前自检（可选）。需要：pip install playwright && playwright install chromium

用法：python3 tests/smoke_test.py 网站目录
检查：4 个分区、浅色 / 深色、手机 / 电脑宽度下页面无脚本错误；全部模块展开后无脚本错误；
      V26.4.1 起另查：中文 / 英文各自在 390px 下页面不横向溢出；首页「今日结论」只出现在行情分区；
截图保存到 网站目录/test-shots/，用于和上一版对比。不联网：外部请求一律拦截。
"""
import asyncio, os, sys
from playwright.async_api import async_playwright

async def main(root):
    out = os.path.join(root, 'test-shots'); os.makedirs(out, exist_ok=True)
    url = 'file://' + os.path.abspath(os.path.join(root, 'index.html'))
    failed = 0
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        # V26.4.1：中英文在 390px 下不横向溢出；今日结论只属于行情分区
        for lang in ('zh', 'en'):
            ctx = await b.new_context(viewport={'width': 390, 'height': 900})
            await ctx.add_init_script(f"localStorage.setItem('btc_lang_v1','{lang}')")
            pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.route('**/*', lambda r: r.abort() if not r.request.url.startswith('file:') else r.continue_())
            await pg.goto(url); await pg.wait_for_timeout(1500)
            problems = []
            for tab in ('now', 'value', 'chain', 'mine'):
                await pg.evaluate(f"()=>{{setTab('{tab}');document.querySelectorAll('details').forEach(d=>d.open=true)}}")
                await pg.wait_for_timeout(1200)
                sw = await pg.evaluate("()=>document.documentElement.scrollWidth")
                if sw > 392: problems.append(f'{tab} 横向溢出 {sw}px')
                vis = await pg.evaluate("()=>{const v=document.getElementById('todayVerdict');return !!v&&getComputedStyle(v).display!=='none'&&v.getBoundingClientRect().height>0}")
                if tab != 'now' and vis: problems.append(f'{tab} 出现了今日结论')
            if errs: problems.append('脚本错误：' + errs[0])
            failed += bool(problems)
            print(f'390px {lang}: ' + ('通过' if not problems else '失败：' + '；'.join(problems)))
            await ctx.close()
        for w in (390, 1440):
            for theme in ('light', 'dark'):
                pg = await b.new_page(viewport={'width': w, 'height': 900})
                errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
                await pg.route('**/*', lambda r: r.abort() if not r.request.url.startswith('file:') else r.continue_())
                await pg.goto(url); await pg.wait_for_timeout(1500)
                await pg.evaluate("t=>{document.documentElement.dataset.theme=t;window.dispatchEvent(new Event('themechange'))}", theme)
                for tab in ('now', 'value', 'chain', 'mine'):
                    await pg.evaluate(f"()=>{{setTab('{tab}');document.querySelectorAll('details').forEach(d=>d.open=true)}}")
                    await pg.wait_for_timeout(1200)
                    await pg.screenshot(path=os.path.join(out, f'{w}_{theme}_{tab}.png'), full_page=True)
                status = '通过' if not errs else '失败：' + errs[0]
                failed += bool(errs)
                print(f'{w}px {theme}: {status}')
                await pg.close()
        await b.close()
    print('全部通过' if not failed else f'{failed} 组有脚本错误')
    sys.exit(1 if failed else 0)

if __name__ == '__main__':
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else '.'))
