#!/usr/bin/env python3
"""V27.4：线上自动巡检——用真实浏览器（Chromium，iPhone 尺寸）打开正式网站，把五个分区都走一遍。

检查：页面是否空白、价格是否出来、有没有脚本错误、有没有 NaN / undefined 之类的乱码、
哪些模块显示「暂不可用」、哪些数据源失败（网络缓存层的统计），并记录打开速度。
发现问题：仓库开 Issue（同标题已开着就追加评论），本次任务以失败结束（GitHub 会发邮件）。
每个分区的截图作为附件保存 7 天，便于对照。
用法：python3 tools/patrol.py [网址] [截图目录]
"""
import asyncio
import json
import os
import sys
import time
import urllib.request

SITE = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("SITE_URL", "https://bwy999.github.io/btc-dca/")
SHOTS = sys.argv[2] if len(sys.argv) > 2 else "patrol-shots"
TABS = [("now", "行情"), ("value", "分析"), ("chain", "链上"), ("dca", "定投"), ("mine", "我的")]
IGNORE_ERR = ("runtime.sendMessage", "Extension context", "ResizeObserver loop")

SCAN = r"""()=>{
 const vis=e=>{const r=e.getBoundingClientRect();if(r.width<2||r.height<2)return false;const c=getComputedStyle(e);return c.visibility!=='hidden'&&c.display!=='none'};
 const title=e=>{const s=e.closest('section,details,article');const h=s&&s.querySelector('.sec-title,summary b,h2,h3');return h?h.textContent.trim().slice(0,20):'?'};
 const bad=[],stale=[],junk=[];
 document.querySelectorAll('.fresh-badge').forEach(b=>{if(!vis(b))return;const t=b.textContent.trim();if(/暂不可用|Unavailable/.test(t))bad.push(title(b));else if(/滞后|Stale/.test(t))stale.push(title(b)+' '+t)});
 const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode()){const t=n.nodeValue;if(/\b(NaN|undefined|Infinity)\b|\[object /.test(t)&&n.parentElement&&vis(n.parentElement)&&!n.parentElement.closest('script,style,#sgDiag'))junk.push(title(n.parentElement)+': '+t.trim().slice(0,40))}
 const secs=[...document.querySelectorAll('section.sec, .today-verdict, .aurum-hero')].filter(vis).length;
 return {bad:[...new Set(bad)],stale:[...new Set(stale)],junk:[...new Set(junk)].slice(0,10),sections:secs,textLen:document.body.innerText.length}}"""


async def run():
    from playwright.async_api import async_playwright
    os.makedirs(SHOTS, exist_ok=True)
    rep = {"site": SITE, "at": time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime()), "errors": [], "tabs": {}}
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 393, "height": 852}, device_scale_factor=2, is_mobile=True, has_touch=True, locale="zh-CN",
                                  user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1")
        pg = await ctx.new_page()
        pg.on("pageerror", lambda e: rep["errors"].append(str(e)[:200]) if not any(x in str(e) for x in IGNORE_ERR) else None)
        t0 = time.time()
        await pg.goto(SITE + ("&" if "?" in SITE else "?") + "patrol=" + str(int(t0)), wait_until="domcontentloaded", timeout=60000)
        try:
            await pg.wait_for_function("()=>typeof S!=='undefined'&&S.price>0", timeout=45000)
            rep["priceSec"] = round(time.time() - t0, 1)
        except Exception:
            rep["priceSec"] = None
        rep["build"] = await pg.evaluate("()=>{const m=document.querySelector('meta[name=btc-dca-build]');return m?m.content:''}")
        rep["dclMs"] = await pg.evaluate("()=>{const n=performance.getEntriesByType('navigation')[0];return n?Math.round(n.domContentLoadedEventEnd):null}")
        for key, name in TABS:
            await pg.evaluate("(t)=>{setTab(t);document.querySelectorAll('details.module-fold').forEach(x=>{if(x.offsetParent)x.open=true})}", key)
            h = await pg.evaluate("document.documentElement.scrollHeight")
            y = 0
            while y < h:
                await pg.evaluate("(y)=>window.scrollTo({top:y,behavior:'instant'})", y)
                await pg.wait_for_timeout(250)
                y += 700
                h = await pg.evaluate("document.documentElement.scrollHeight")
            await pg.wait_for_timeout(12000)
            rep["tabs"][name] = await pg.evaluate(SCAN)
            await pg.evaluate("()=>window.scrollTo(0,0)")
            await pg.screenshot(path=os.path.join(SHOTS, f"{key}.png"), full_page=True)
        rep["dataFail"] = await pg.evaluate("()=>{const n=window.__sgNet&&window.__sgNet.stat;if(!n)return {};const f=n.fail||{},w=n.why||{},o={};Object.keys(f).forEach(h=>o[h]=f[h]+(w[h]?' ('+w[h]+')':''));return o}")
        await b.close()
    return rep


def judge(rep):
    problems = []
    if rep.get("priceSec") is None:
        problems.append("45 秒内价格没有显示出来（页面可能空白或卡住）")
    if rep["errors"]:
        problems.append("脚本错误：\n" + "\n".join(f"  - `{e}`" for e in rep["errors"][:8]))
    for name, t in rep["tabs"].items():
        if t["textLen"] < 300 or t["sections"] < 1:
            problems.append(f"「{name}」分区几乎是空白的")
        if t["junk"]:
            problems.append(f"「{name}」出现乱码：" + "；".join(t["junk"]))
        if len(t["bad"]) >= 2:
            problems.append(f"「{name}」有 {len(t['bad'])} 个模块暂不可用：" + "、".join(t["bad"]))
    return problems


def report_md(rep, problems):
    lines = [f"**网址**：{rep['site']}　**构建号**：`{rep.get('build')}`　**时间**：{rep['at']}",
             f"**价格出现**：{rep.get('priceSec')} 秒　**DOMContentLoaded**：{rep.get('dclMs')} ms"]
    for name, t in rep["tabs"].items():
        extra = []
        if t["bad"]: extra.append("暂不可用：" + "、".join(t["bad"]))
        if t["stale"]: extra.append("滞后：" + "、".join(t["stale"][:6]))
        lines.append(f"- {name}：{t['sections']} 个模块" + ("；" + "；".join(extra) if extra else "，全部正常"))
    if rep.get("dataFail"):
        lines.append("**数据源失败**：" + "，".join(f"{h} ×{v}" for h, v in rep["dataFail"].items()))
    lines.append("\n**结论**：" + ("发现问题：\n" + "\n".join("- " + p for p in problems) if problems else "全部正常 ✅"))
    return "\n".join(lines)


def open_issue(text):
    repo, token = os.environ.get("GITHUB_REPOSITORY"), os.environ.get("GITHUB_TOKEN")
    if not (repo and token):
        return
    title = "网站巡检发现问题"
    hdr = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json", "Content-Type": "application/json"}
    def http(url, method="GET", data=None):
        req = urllib.request.Request(url, data=data, method=method, headers=hdr)
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode() or "null")
    try:
        issues = http(f"https://api.github.com/repos/{repo}/issues?state=open&per_page=50")
        num = next((x["number"] for x in issues if x.get("title") == title), None)
        body = text + "\n\n（自动巡检。打开 Actions 里这次「Site patrol」可以下载各分区截图；把这个 Issue 截图发给 Claude。）"
        if num:
            http(f"https://api.github.com/repos/{repo}/issues/{num}/comments", "POST", json.dumps({"body": body}).encode())
        else:
            http(f"https://api.github.com/repos/{repo}/issues", "POST", json.dumps({"title": title, "body": body}).encode())
    except Exception as e:
        print("开 Issue 失败：", e)


def main():
    rep = asyncio.run(run())
    problems = judge(rep)
    md = report_md(rep, problems)
    print(md)
    with open(os.path.join(SHOTS, "report.json"), "w", encoding="utf-8") as f:
        json.dump(rep, f, ensure_ascii=False, indent=1)
    s = os.environ.get("GITHUB_STEP_SUMMARY")
    if s:
        with open(s, "a", encoding="utf-8") as f:
            f.write("## 网站巡检\n\n" + md + "\n")
    if problems:
        open_issue(md)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
