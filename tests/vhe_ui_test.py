#!/usr/bin/env python3
"""SatsGarden V28.2.1 · VHE 双模式极简界面、状态一致性与多视口自动化验收测试

用法：python3 tests/vhe_ui_test.py <构建目录>
依赖：Playwright + Chromium（通过本地 HTTP 静态服务器验证真实 Worker、同源回退与多视口布局）
"""
import asyncio
import functools
import http.server
import json
import os
import re
import socketserver
import sys
import threading
from playwright.async_api import async_playwright

ADBLOCK_SELECTORS = [
    '[class^="ad-"]', '[class*=" ad-"]', '[class^="ad_"]', '[class*=" ad_"]',
    '[class$="-ad"]', '[class*="-ad "]', '[class*="-ad-"]', '[class*="_ad_"]',
    '[id^="ad-"]', '[id^="ad_"]', '[id^="ads"]', '[id*="-ad-"]', '[id*="_ad_"]', '[id$="-ad"]',
    '.ad', '.ads', '.adbox', '.ad-box', '.adsbygoogle', '.advert', '.advertisement',
    '[class*="ads-"]', '[class*="-ads"]', '[class*="advert"]', '[id*="advert"]',
    '[class*="banner"]', '[id*="banner"]', '[class*="sponsor"]', '[id*="sponsor"]',
    '[class*="promo"]', '[id*="promo"]', '[class*="popup"]', '[class*="guanggao"]',
    '[class*="tuiguang"]', '[class^="gg-"]', '[id^="gg-"]',
]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass


def start_http_server(root_dir):
    handler = functools.partial(QuietHandler, directory=root_dir)
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", 0), handler)
    port = httpd.server_address[1]
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return httpd, port


async def run_suite(root_dir):
    root = os.path.abspath(root_dir)
    results_json_path = os.path.join(root, "docs", "VHE_BACKTEST_RESULTS.json")
    with open(results_json_path, encoding="utf-8") as f:
        ref_data = json.load(f)

    passed = 0
    failed = []

    def check(name, cond, detail=""):
        nonlocal passed
        if cond:
            passed += 1
            print(f"  ✓ {name}")
        else:
            msg = f"{name}" + (f" ({detail})" if detail else "")
            failed.append(msg)
            print(f"  ✗ {msg}")

    # 1. 静态 HTML 初始状态检查：未执行脚本前不得预判「守恒通过」或「未证明增币能力」
    raw_vhe_html = open(os.path.join(root, "vhe.html"), encoding="utf-8").read()
    check("初始静态 HTML 不预判守恒通过", "守恒通过" not in raw_vhe_html and "守恒自检通过" not in raw_vhe_html)
    check("初始静态 HTML 不预判未证明结论", "未证明增币能力" not in raw_vhe_html)
    check("初始静态 HTML 审计与样本外标记为待计算/待验证", "待计算" in raw_vhe_html and "待验证" in raw_vhe_html)

    httpd, port = start_http_server(root)
    base_url = f"http://127.0.0.1:{port}"

    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch()

            # 2. 主站入口简化与隔离检查（不加载 VHE 引擎，不增加底部 Tab）
            ctx_main = await browser.new_context(viewport={"width": 402, "height": 874})
            await ctx_main.add_init_script("localStorage.setItem('btc_lang_v1', 'zh');")
            pg_main = await ctx_main.new_page()
            loaded_urls = []
            pg_main.on("request", lambda req: loaded_urls.append(req.url))
            await pg_main.goto(f"{base_url}/index.html", wait_until="load")
            await pg_main.evaluate("() => setTab('dca')")
            await pg_main.wait_for_timeout(300)
            entry_info = await pg_main.evaluate("""() => {
                const el = document.getElementById('vheEntry');
                return {
                    visible: !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0,
                    text: el ? el.innerText.trim() : '',
                    hasVheGlobal: Boolean(window.VHEEngine || window.VHEUI),
                    tabCount: document.querySelectorAll('#tabBar button[data-tab]').length
                };
            }""")
            check("主站定投页入口文案更新为「波动增币 / 验证波段交易能否增加 BTC」",
                  entry_info["visible"] and "波动增币" in entry_info["text"] and "验证波段交易能否增加 BTC" in entry_info["text"],
                  entry_info["text"])
            check("主站不加载 VHE 策略引擎且底部保持 5 个分区",
                  not entry_info["hasVheGlobal"] and not any("vhe-engine" in u for u in loaded_urls) and entry_info["tabCount"] == 5)
            await ctx_main.close()

            # 3. 概览首屏、基准数值逐项核对（对照 docs/VHE_BACKTEST_RESULTS.json）与按需计算验证
            ctx = await browser.new_context(viewport={"width": 402, "height": 874})
            await ctx.add_init_script("localStorage.setItem('btc_lang_v1', 'zh'); localStorage.setItem('btc_theme_v1', 'dark');")
            pg = await ctx.new_page()
            errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)))
            await pg.goto(f"{base_url}/vhe.html", wait_until="load")

            # 等待后台 Worker 完成 OOS 计算
            await pg.wait_for_function("() => window.VHEUI && window.VHEUI.getStateSnapshot().oosStatus === 'ready'", timeout=8000)
            snap0 = await pg.evaluate("() => window.VHEUI.getStateSnapshot()")
            check("新访问默认展示概览模式且后台 Worker 就绪",
                  snap0["viewMode"] == "overview" and snap0["workerReady"] is True, str(snap0))
            check("概览模式下策略矩阵与全历史滚动保持按需未计算状态（非纯 CSS 隐藏）",
                  snap0["matrixStatus"] == "idle" and snap0["rollingStatus"] == "idle", str(snap0))

            # 对照 VHE_BACKTEST_RESULTS.json 的 2021-11-01 默认窗口与 OOS 指标
            b2021 = next(x for x in ref_data["fixedStartBenchmarks"] if x["start"] == "2021-11-01" and x["exitPolicy"] == "stop_up_20pct")
            oos_ref = ref_data["outOfSampleEvaluation"]
            exp_sats = f"\u2212{abs(round(b2021['netDiffEqBTC'] * 1e8)):,} 聪"
            exp_win = f"{oos_ref['selectedOosRolling24m']['winRate'] * 100:.2f}%"
            exp_med = f"\u2212{abs(oos_ref['selectedOosRolling24m']['medianExcessPct'] * 100):.2f}%"

            ov_dom = await pg.evaluate("""() => ({
                verdict: document.getElementById('verdictTitle').textContent.trim(),
                deltaLabel: document.getElementById('heroDeltaLabel').textContent.trim(),
                rulePill: document.getElementById('ruleScopePill').textContent.trim(),
                oosPill: document.getElementById('oosScopePill').textContent.trim(),
                sats: document.getElementById('heroSatsVal').textContent.trim(),
                btcSub: document.getElementById('heroBtcPctVal').textContent.trim(),
                baseEq: document.getElementById('cmpBaseEqVal').textContent.trim(),
                vheEq: document.getElementById('cmpVheEqVal').textContent.trim(),
                fineLine: document.getElementById('overviewHoldingsLine').textContent.trim(),
                oosWin: document.getElementById('oosWinRateVal').textContent.trim(),
                oosMed: document.getElementById('oosMedianVal').textContent.trim(),
                oosNote: document.getElementById('oosEvidenceNote').textContent.trim(),
                nextTxt: document.getElementById('nextStepText').textContent.trim(),
                titlePx: parseFloat(getComputedStyle(document.getElementById('verdictTitle')).fontSize),
                satsPx: parseFloat(getComputedStyle(document.getElementById('heroSatsVal')).fontSize),
                btnH: document.getElementById('btnGoResearch').getBoundingClientRect().height
            })""")
            check("默认 2021-11-01 概览大数字、标题与基准对比精确匹配 VHE_BACKTEST_RESULTS.json",
                  ov_dom["sats"] == exp_sats
                  and ov_dom["deltaLabel"] == "相比纯持有，多/少了多少 BTC 等价资产"
                  and f"{b2021['baselineEqBTC']:.6f} BTC" == ov_dom["baseEq"]
                  and f"{b2021['eqBTC']:.6f} BTC" == ov_dom["vheEq"]
                  and f"{abs(b2021['netDiffEqBTC']):.8f} BTC" in ov_dom["btcSub"]
                  and f"实际持币 {b2021['heldBTC']:.6f} BTC" in ov_dom["fineLine"],
                  str(ov_dom))
            check("默认 10% 规则与预注册 5% 候选区分清晰且 OOS 跑赢率/中位超额精确匹配",
                  ov_dom["verdict"] == "尚未证明增币优势"
                  and "未验证" in ov_dom["rulePill"]
                  and "未通过" in ov_dom["oosPill"]
                  and ov_dom["oosWin"] == exp_win
                  and ov_dom["oosMed"] == exp_med
                  and "不是当前 10% 规则的胜率" in ov_dom["oosNote"]
                  and "不生成实盘买卖指令" in ov_dom["nextTxt"],
                  str(ov_dom))
            check("视觉层级规范：主标题 24–28px、焦点数字 30–36px、主按钮触控 >=44px",
                  24 <= ov_dom["titlePx"] <= 28 and 30 <= ov_dom["satsPx"] <= 36 and ov_dom["btnH"] >= 44,
                  f"title={ov_dom['titlePx']} sats={ov_dom['satsPx']} btnH={ov_dom['btnH']}")

            # 4. 切换进入「策略研究」模式、滚动位置记忆、折叠后非零宽高 Canvas 重绘及未知成本「未填写」
            await pg.click("#btnGoResearch")
            await pg.evaluate("""() => {
                document.getElementById('secResearchVerify').open = true;
                document.getElementById('secResearchRisk').open = true;
                document.getElementById('secResearchTrades').open = true;
            }""")
            await pg.wait_for_function("""() => {
                const s = window.VHEUI.getStateSnapshot();
                return s.matrixStatus === 'ready' && s.rollingStatus === 'ready';
            }""", timeout=8000)
            await pg.wait_for_timeout(120)

            res_dom = await pg.evaluate("""() => ({
                rollCvW: document.getElementById('rollingChartCanvas').width,
                mainCvW: document.getElementById('mainChartCanvas').width,
                cashCvW: document.getElementById('cashChartCanvas').width,
                diagText: document.getElementById('diagKvGrid').innerText,
                failedRows: document.querySelectorAll('#failedCyclesBody tr').length,
                tradeRowsPage1: document.querySelectorAll('#tradeTableBody tr').length,
                pagerVisible: !document.getElementById('tradePager').hidden
            })""")
            check("研究页隐藏后首次展开时三张 Canvas 均按非零宽高完成重绘",
                  res_dom["rollCvW"] > 200 and res_dom["mainCvW"] > 200 and res_dom["cashCvW"] > 200,
                  str(res_dom))
            check("未知起始本金显示「未填写」、失败回合完整保留、成交记录分页生效",
                  "未填写" in res_dom["diagText"]
                  and res_dom["failedRows"] == b2021["failedCycles"]
                  and res_dom["tradeRowsPage1"] == 20
                  and res_dom["pagerVisible"] is True,
                  str(res_dom))

            # 核对全部 5 个固定起点与 VHE_BACKTEST_RESULTS.json 一致
            all_starts_match = True
            for row_ref in ref_data["fixedStartBenchmarks"]:
                if row_ref["exitPolicy"] != "stop_up_20pct":
                    continue
                st_day = row_ref["start"]
                await pg.click(f'[data-start-preset="{st_day}"]')
                dirty_before = await pg.evaluate("() => !document.getElementById('paramDirtyBadge').hidden && !document.getElementById('tabDirtyPill').hidden")
                if not dirty_before and st_day != "2021-11-01":
                    all_starts_match = False
                await pg.click("#btnApplyParams")
                await pg.wait_for_timeout(60)
                got_eq = await pg.evaluate("() => document.getElementById('cmpVheEqVal').textContent.trim()")
                if got_eq != f"{row_ref['eqBTC']:.6f} BTC":
                    all_starts_match = False
            check("5 个周期快捷起点逐项核对均与 docs/VHE_BACKTEST_RESULTS.json 完全一致且未应用标记正常", all_starts_match)

            # 恢复 2021-11-01 测试滚动位置记忆（概览 150px ↔ 研究 420px）
            await pg.click("#btnResetParams")
            await pg.wait_for_timeout(60)
            await pg.click("#tabModeOverview")
            await pg.evaluate("() => window.scrollTo(0, 150)")
            await pg.wait_for_timeout(40)
            await pg.click("#tabModeResearch")
            await pg.evaluate("() => window.scrollTo(0, 420)")
            await pg.wait_for_timeout(40)
            await pg.click("#tabModeOverview")
            y_ov = await pg.evaluate("() => Math.round(window.scrollY)")
            await pg.click("#tabModeResearch")
            y_res = await pg.evaluate("() => Math.round(window.scrollY)")
            check("同一会话切换「概览 / 策略研究」保持各自滚动位置", abs(y_ov - 150) <= 5 and abs(y_res - 420) <= 5, f"ov={y_ov}, res={y_res}")

            # 5. 验证 0% 波段、单窗正收益（+0.83%）、OOS 通过但规则不匹配、OOS 通过且匹配
            await pg.fill("#inpTradeRatio", "0")
            check("修改参数未点按应用时显示「未应用」提示",
                  await pg.evaluate("() => !document.getElementById('paramDirtyBadge').hidden && !document.getElementById('paramDirtyHint').hidden"))
            await pg.click("#btnApplyParams")
            await pg.wait_for_timeout(50)
            zero_state = await pg.evaluate("() => ({ t: document.getElementById('verdictTitle').textContent, s: document.getElementById('heroSatsVal').textContent })")
            check("0% 波段显示「持有基准」而非波段获利证据",
                  zero_state["t"] == "持有基准" and zero_state["s"] == "0 聪", str(zero_state))

            # 2021-11-01 10% + 90天超时（单窗 +0.83%，但不得显示实盘推荐或已验证）
            await pg.fill("#inpTradeRatio", "10")
            await pg.evaluate("() => { document.getElementById('advParamFold').open = true; }")
            await pg.select_option("#selExitPolicy", "timeout_90d")
            await pg.click("#btnApplyParams")
            await pg.wait_for_timeout(60)
            pos_win = await pg.evaluate("""() => ({
                t: document.getElementById('verdictTitle').textContent.trim(),
                rule: document.getElementById('ruleScopePill').textContent.trim(),
                sats: document.getElementById('heroSatsVal').textContent.trim()
            })""")
            check("单一窗口正超额（+247,761 聪）标注「当前规则尚未验证」，不给绿色实盘推荐",
                  pos_win["t"] == "当前规则尚未验证" and "单窗领先" in pos_win["rule"] and pos_win["sats"] == "+247,761 聪",
                  str(pos_win))

            # 语言与主题切换不重复跑回测，且英文模式无中文残留
            cnt_before = (await pg.evaluate("() => window.VHEUI.getStateSnapshot().metricsLog.backtestRunCount"))
            await pg.click("#langEnBtn")
            await pg.click("#btnThemeToggle")
            await pg.click("#tabModeOverview")
            en_text = await pg.evaluate("() => document.getElementById('overviewPanel').innerText")
            cjk_left = re.findall(r"[\u4e00-\u9fff]+", en_text)
            await pg.click("#langZhBtn")
            await pg.click("#btnThemeToggle")
            cnt_after = (await pg.evaluate("() => window.VHEUI.getStateSnapshot().metricsLog.backtestRunCount"))
            check("语言与主题切换零重复回测计算，且英文概览零中文残留",
                  cnt_after == cnt_before and len(cjk_left) == 0, f"runs={cnt_before}->{cnt_after}, cjk={cjk_left}")

            # 6. 回测失败清空旧结果并禁用导出 + 快速重复切换防竞态
            await pg.click("#tabModeResearch")
            await pg.fill("#inpStart", "2027-01-01")
            await pg.click("#btnApplyParams")
            await pg.wait_for_timeout(50)
            fail_dom = await pg.evaluate("""() => ({
                errHidden: document.getElementById('runErrorNotice').hidden,
                sats: document.getElementById('heroSatsVal').textContent.trim(),
                vheEq: document.getElementById('cmpVheEqVal').textContent.trim(),
                kpiEq: document.getElementById('kpiEqVal').textContent.trim(),
                csvDisabled: document.getElementById('btnExportCsv').disabled
            })""")
            check("回测失败时清空全部旧数值并禁用成交 CSV 导出",
                  not fail_dom["errHidden"] and fail_dom["sats"] == "--" and fail_dom["vheEq"] == "--" and fail_dom["kpiEq"] == "--" and fail_dom["csvDisabled"] is True,
                  str(fail_dom))

            # 快速连续切换 5 次参数，最终落点必须严格等于最后一次（2021-11-01 · 5% · stop_up_20pct）
            await pg.evaluate("""() => {
                const steps = [
                    { start: '2017-12-01', ratio: '10', exit: 'stop_up_20pct' },
                    { start: '2018-12-01', ratio: '0', exit: 'stop_up_20pct' },
                    { start: '2022-11-01', ratio: '10', exit: 'hold_wait' },
                    { start: '2024-01-01', ratio: '10', exit: 'timeout_90d' },
                    { start: '2021-11-01', ratio: '5', exit: 'stop_up_20pct' }
                ];
                for (const s of steps) {
                    document.getElementById('inpStart').value = s.start;
                    document.getElementById('inpEnd').value = '';
                    document.getElementById('inpTradeRatio').value = s.ratio;
                    document.getElementById('selExitPolicy').value = s.exit;
                    document.getElementById('btnApplyParams').click();
                }
            }""")
            await pg.wait_for_timeout(250)
            b5_ref = next(x for x in ref_data["batch1LumpSum2021"] if x["id"] == "vhe_5pct_stop20")
            rapid_eq = await pg.evaluate("() => document.getElementById('cmpVheEqVal').textContent.trim()")
            check("快速重复切换后最终展示结果严格对应最后一次参数且无旧任务覆盖",
                  rapid_eq == f"{b5_ref['eqBTC']:.6f} BTC", rapid_eq)

            # 7. 真实账本只读隔离验证（btc_dca_ledger_v1=0.525 + btc_exec_v7 现货 l=0.20，镜像 d=0.525 不重复计入 -> 0.725 BTC，且两键字节级不变）
            ledger_seed = json.dumps({"v": 2, "baseline": {"btc": 0.42}, "orders": [{"id": "1", "type": "btc", "btc": 0.105}]})
            exec_seed = json.dumps({"v": 7, "hd": {"l": 0.20, "d": 0.525}})
            await pg.evaluate("""([l, e]) => {
                localStorage.setItem('btc_dca_ledger_v1', l);
                localStorage.setItem('btc_exec_v7', e);
            }""", [ledger_seed, exec_seed])
            await pg.click("#tabModeOverview")
            await pg.click("#btnOverviewReadLocal")
            await pg.wait_for_timeout(80)
            after_store = await pg.evaluate("""() => ({
                l: localStorage.getItem('btc_dca_ledger_v1'),
                e: localStorage.getItem('btc_exec_v7'),
                baseEq: document.getElementById('cmpBaseEqVal').textContent.trim()
            })""")
            check("只读导入本机持仓（0.725 BTC，不重复计入镜像）后真实账本键字节级 100% 未改动",
                  after_store["l"] == ledger_seed and after_store["e"] == exec_seed and after_store["baseEq"] == "0.725000 BTC",
                  str(after_store))

            # 8. 广告拦截器选择器扫描（概览 + 策略研究全展开）
            await pg.click("#tabModeResearch")
            await pg.evaluate("() => document.querySelectorAll('details').forEach(d => d.open = true)")
            ad_hits = await pg.evaluate("""(sels) => {
                const hits = [];
                for (const s of sels) {
                    try {
                        if (document.querySelectorAll(s).length > 0) hits.push(s);
                    } catch (_) {}
                }
                return hits;
            }""", ADBLOCK_SELECTORS)
            check("36 条常见广告拦截规则扫描零命中", len(ad_hits) == 0, str(ad_hits))
            check("交互全流程零页面脚本错误", len(errs) == 0, str(errs))
            await ctx.close()

            # 9. OOS 加载中（pending）、OOS 通过但自定义规则不匹配 / 匹配、以及数据缺失态验证
            ctx_edge = await browser.new_context(viewport={"width": 402, "height": 874})
            await ctx_edge.add_init_script("localStorage.setItem('btc_lang_v1', 'zh');")
            pg_edge = await ctx_edge.new_page()
            # 挂起 Worker 请求，验证 pending 状态绝不显示 0% 或未通过
            await pg_edge.route("**/vhe-worker.*.js", lambda r: None)
            await pg_edge.goto(f"{base_url}/vhe.html", wait_until="domcontentloaded")
            await pg_edge.wait_for_function("() => document.getElementById('heroSatsVal').textContent.includes('聪')", timeout=5000)
            pending_dom = await pg_edge.evaluate("""() => ({
                badge: document.getElementById('oosSummaryBadgeText').textContent.trim(),
                win: document.getElementById('oosWinRateVal').textContent.trim(),
                verdict: document.getElementById('verdictTitle').textContent.trim()
            })""")
            check("样本外后台计算期间显示「待验证 / 正在验证」，不误报为 0% 或未通过",
                  pending_dom["badge"] == "待验证" and pending_dom["win"] == "待验证" and "正在验证" in pending_dom["verdict"],
                  str(pending_dom))
            await pg_edge.close()

            # 数据缺失态验证（拦截 charts.json 与 seed-cycle）
            pg_miss = await ctx_edge.new_page()
            await pg_miss.route("**/charts.json", lambda r: r.abort())
            await pg_miss.route("**/seed-cycle.*.js", lambda r: r.abort())
            await pg_miss.goto(f"{base_url}/vhe.html", wait_until="load")
            await pg_miss.wait_for_timeout(120)
            miss_dom = await pg_miss.evaluate("""() => ({
                st: document.getElementById('dataStatusText').textContent.trim(),
                vt: document.getElementById('verdictTitle').textContent.trim(),
                sats: document.getElementById('heroSatsVal').textContent.trim(),
                csvDis: document.getElementById('btnExportCsv').disabled
            })""")
            check("历史数据缺失时状态与结论统一显示「暂不可用」且禁用导出",
                  miss_dom["st"] == "暂不可用" and miss_dom["vt"] == "暂不可用" and miss_dom["sats"] == "--" and miss_dom["csvDis"] is True,
                  str(miss_dom))

            # OOS 通过门槛但与自定义参数不匹配 vs 匹配状态验证（在 Context 级拦截专用 Worker 脚本返回合成通过对象）
            ctx_pass = await browser.new_context(viewport={"width": 402, "height": 874})
            await ctx_pass.add_init_script("localStorage.setItem('btc_lang_v1', 'zh');")
            mock_worker_js = """
            self.onmessage = function(ev) {
              var m = ev.data || {};
              if (m.type === 'init') { self.postMessage({ type: 'ready', ok: true, version: '28.2.0' }); return; }
              if (m.task === 'oos') {
                self.postMessage({
                  type: 'result', reqId: m.reqId, calcToken: m.calcToken, task: 'oos', cacheKey: m.cacheKey, ok: true,
                  data: {
                    ok: true,
                    trainRange: { start: '2013-09-01', end: '2020-12-31' },
                    oosRange: { start: '2021-01-01', end: '2026-09-26' },
                    totalTrialsCount: 6,
                    trainSelectedCandidateId: 'vhe_5pct_stop20',
                    selectedOosRolling24m: { windowMonths: 24, oosSampleCount: 45, winRate: 0.6222, medianExcessPct: 0.0115 },
                    researchGatePassed: true,
                    trials: []
                  }
                });
              }
            };
            """
            await ctx_pass.route("**/vhe-worker.*.js", lambda r: r.fulfill(status=200, content_type="application/javascript", body=mock_worker_js))
            pg_pass = await ctx_pass.new_page()
            await pg_pass.goto(f"{base_url}/vhe.html", wait_until="load")
            await pg_pass.wait_for_function("() => window.VHEUI && window.VHEUI.getStateSnapshot().oosStatus === 'ready'", timeout=5000)
            mismatch_dom = await pg_pass.evaluate("""() => ({
                vt: document.getElementById('verdictTitle').textContent.trim(),
                rp: document.getElementById('ruleScopePill').textContent.trim(),
                op: document.getElementById('oosScopePill').textContent.trim()
            })""")
            check("固定候选通过但当前为 10% 自定义规则时：明确区分「当前规则：未验证」与「预注册研究：通过」",
                  mismatch_dom["vt"] == "当前规则尚未验证" and mismatch_dom["rp"] == "当前规则：未验证" and "通过" in mismatch_dom["op"],
                  str(mismatch_dom))

            await pg_pass.evaluate("""() => {
                window.VHEUI.setMode('research');
                document.getElementById('inpTradeRatio').value = '5';
                document.getElementById('btnApplyParams').click();
            }""")
            await pg_pass.wait_for_timeout(80)
            matched_dom = await pg_pass.evaluate("""() => ({
                vt: document.getElementById('verdictTitle').textContent.trim(),
                next: document.getElementById('nextStepText').textContent.trim()
            })""")
            check("匹配通过门槛的预注册候选时显示「满足初步研究门槛，仅模拟观察」且仍声明不生成实盘指令",
                  matched_dom["vt"] == "满足初步研究门槛，仅模拟观察" and "不生成实盘买卖指令" in matched_dom["next"],
                  str(matched_dom))
            await ctx_pass.close()
            await ctx_edge.close()

            # 10. 多视口（390 / 402 / 430 / 768 / 1440px）中英文零横向溢出回归
            overflow_issues = []
            for vw in (390, 402, 430, 768, 1440):
                for lang in ("zh", "en"):
                    c_vw = await browser.new_context(viewport={"width": vw, "height": 874})
                    await c_vw.add_init_script(f"localStorage.setItem('btc_lang_v1', '{lang}')")
                    p_vw = await c_vw.new_page()
                    await p_vw.goto(f"{base_url}/vhe.html", wait_until="load")
                    await p_vw.wait_for_timeout(120)
                    sw_ov = await p_vw.evaluate("() => document.documentElement.scrollWidth")
                    if sw_ov > vw + 1:
                        overflow_issues.append(f"{vw}px {lang} overview scrollWidth={sw_ov}")
                    await p_vw.evaluate("""() => {
                        window.VHEUI.setMode('research');
                        document.querySelectorAll('details').forEach(d => d.open = true);
                    }""")
                    await p_vw.wait_for_timeout(150)
                    sw_res = await p_vw.evaluate("() => document.documentElement.scrollWidth")
                    if sw_res > vw + 1:
                        overflow_issues.append(f"{vw}px {lang} research scrollWidth={sw_res}")
                    await c_vw.close()
            check("390 / 402 / 430 / 768 / 1440px 中英文在概览与研究全展开下均零横向溢出",
                  len(overflow_issues) == 0, "; ".join(overflow_issues))

            await browser.close()
    finally:
        httpd.shutdown()

    print(f"\n{'全部通过' if not failed else '存在失败'}：通过 {passed} 项，未通过 {len(failed)} 项")
    return 0 if not failed else 1


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "."
    sys.exit(asyncio.run(run_suite(target)))
