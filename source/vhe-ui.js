/* SatsGarden V28.2.1 · VHE Dual-Mode Standalone UI Controller
 * 极简决策概览（默认） + 完整策略研究双模式架构：
 * 1. 首屏仅运行主回测并立即交给浏览器绘制，样本外（OOS）、策略矩阵与滚动检验通过后台 Worker / 可取消调度按需执行；
 * 2. 严格区分「固定预注册候选研究门槛」与「当前自定义规则单窗结果」，禁止将单窗领先包装成实盘信号；
 * 3. 主回测失败或数据缺失时立即清空旧结果并禁用成交 CSV 导出，杜绝新旧配置结果混淆；
 * 4. 严格只读隔离本机真实账本（绝不写入 btc_dca_ledger_v1 或 btc_exec_v7）。
 */
(function () {
  "use strict";

  var VHE = window.VHEEngine;
  if (!VHE) return;

  var STORAGE_KEY = "btc_vhe_config_v1";
  var SESSION_UI_KEY = "btc_vhe_ui_session_v1";
  var THEME_KEY = "btc_theme_v1";
  var LANG_KEY = "btc_lang_v1";
  var MINUS = "\u2212";
  var TRADE_PAGE_SIZE = 20;

  var I18N = {
    zh: {
      docTitle: "波动增币 · Sats Garden",
      backMain: "主站",
      pageTitle: "波动增币",
      simBadge: "历史模拟",
      btnUpdate: "更新",
      metaInitHint: "正在校验历史日线 · 非今日交易信号",
      btnSourceDetail: "来源",
      hdrSrcNote: "本页仅运行历史机械回放，不生成今日买卖指令，不修改你的真实定投账本。",
      tabOverview: "概览",
      tabResearch: "策略研究",
      pillUnapplied: "未应用",
      eqExplainSummary: "什么是 BTC 等价资产？",
      eqExplainBody: "BTC 等价资产 = 实际持币 + 现金按期末日参考价折算的 BTC。现金折算仅用于同口径对比，不代表已持有的真实币量，不含税费。",
      btnOverviewImportLocal: "只读导入本机数量",
      btnRestoreExample: "恢复 0.30 示例",
      ovChartTitle: "BTC 等价资产对照曲线",
      ovChartSub: "点按或滑动曲线查看单日数值；红绿点为模拟卖出与回购日。",
      ovEvidenceTitle: "样本外研究证据",
      ovEvidenceSub: "基于预注册训练期（2013–2020）选出候选的独立样本外表现。",
      ovOosWinLabel: "24 月样本外滚动跑赢率",
      ovOosMedLabel: "24 月样本外中位超额",
      btnViewResearch: "查看研究详情",
      resParamTitle: "回测设置",
      resParamSub: "常用区间与仓位参数；仅保存在本机，不修改真实定投账本。",
      lblQuickDates: "历史周期起点快捷选择",
      pre2017: "2017-12 牛顶",
      pre2018: "2018-12 熊底",
      pre2021: "2021-11 牛顶",
      pre2022: "2022-11 熊底",
      pre2024: "2024-01 ETF",
      lblInitBtc: "起始 BTC（默认示例 0.30）",
      btnReadSnapshot: "只读带入本机持仓",
      lblStart: "回测开始日",
      lblEnd: "回测结束日（留空至数据末日）",
      lblContribMode: "入金模式",
      optContribNone: "无新增入金（纯存量对照）",
      optContribUniform: "每月等额定投（同入金日对照）",
      optContribAhr: "每月 AHR999 动态定投（保留未投现金）",
      lblMonthlyUsd: "每月外部入金（USD，定投模式生效）",
      lblTradeRatio: "波段比例上限（0%–10%）",
      advParamTitle: "高级设置（均线、三档买卖阈值、退出方式、费率与起始本金）",
      lblMaLen: "算术均线长度（日）",
      lblSellThr: "A / B / C 卖出偏离阈值（%）",
      lblBuyThr: "分层回撤回购阈值（%）",
      lblExitPolicy: "退出方式",
      optExitStop20: "较卖出成交价上涨 20% 止损回购",
      optExitWait: "无限等待回撤回购",
      optExitTimeout90: "等待满 90 天超时回购",
      lblTrendFilter: "卖出前趋势过滤（仅用过去价格）",
      optTrendNone: "不启用趋势过滤",
      optTrendSlope: "近 20 日均线斜率过陡时禁止卖出",
      lblCooldown: "子仓完成后冷却期（天）",
      lblFee: "单边手续费率（%）",
      lblSlip: "单边滑点假设（%）",
      lblInitCost: "起始仓位已知净投入 USD（可选）",
      initCostPh: "未填写",
      feeZero: "零摩擦检验 (0%)",
      feeStd: "标准摩擦 (0.10%+0.05%)",
      feeHigh: "高压摩擦 (0.25%+0.15%)",
      btnRunSim: "应用参数",
      btnResetDefault: "恢复默认",
      msgParamUnapplied: "已修改参数但尚未应用，点按「应用参数」更新结果。",
      paramSnapshotNote: "0.30 BTC 为默认示例仓位。点按「只读带入本机持仓」仅读取数量，绝不写入或改动定投账本。",
      resVerifyTitle: "策略验证",
      resVerifySub: "同现金流矩阵、24/36/48 月全历史滚动检验与预注册样本外评估。",
      secRollingTitle: "同现金流策略对照矩阵",
      batch1Tab: "第一批 · 存量对照",
      batch2Tab: "第二批 · 定投对照",
      thStrategy: "对照方案（点按载入参数）",
      thHeldBtc: "实际 BTC",
      thEndCash: "期末现金",
      thEqBtc: "等价 BTC",
      thVsRef: "相对组基准",
      thMaxDd: "最大币本位回撤",
      thFailCnt: "失败回合",
      thVerdict: "结论",
      subRollingWinTitle: "跨起点按月滚动窗口",
      win24m: "24 个月",
      win36m: "36 个月",
      win48m: "48 个月",
      rollingOverlapWarn: "按月滚动窗口存在时间重叠，跑赢窗口占比不等于独立周期胜率。",
      subOosTitle: "预注册训练期（2013–2020）→ 样本外（2021–末日）检验",
      thCandidate: "预注册候选（共 6 组）",
      thTrainEx: "训练期超额",
      thOosEx: "样本外超额",
      thOosHighFee: "高费率压力超额",
      thOosCash: "样本外期末现金",
      thOosDd: "样本外回撤",
      resRiskTitle: "风险与执行",
      resRiskSub: "实际持仓切换、待回购现金曲线、成本与回合指标、实验子仓及失败记录。",
      secChartTitle: "持仓口径切换与待回购现金曲线",
      secChartSub: "切换查看实际持币量与现金折算后的等价资产，下方同步显示待回购与外部留存现金。",
      modeEqBtc: "BTC 等价",
      modeHeldBtc: "实际持仓",
      legSell: "卖出执行",
      legBuy: "分层回购",
      legExit: "止损/超时回购",
      kpiHeldLabel: "实际持仓 BTC",
      kpiCashLabel: "待回购与留存现金",
      kpiEqLabel: "BTC 等价资产",
      kpiDdLabel: "最差币本位回撤",
      subLotsTitle: "实验子仓状态（A / B / C）",
      subFailedCyclesTitle: "失败回合、止损退出与未完成子仓",
      thCycleLot: "子仓 / 状态",
      thCycleSpan: "卖出执行日 → 结束日",
      thAnchorPx: "卖出成交锚点",
      thSoldBtc: "卖出 BTC",
      thRepBtc: "已回购 BTC",
      thNetLoss: "净增减 / 待回购现金",
      resTradesTitle: "交易记录与数据",
      resTradesSub: "按执行时间排序的模拟成交表、CSV/JSON 导入导出、原始数据条与方法说明。",
      secTradeTitle: "模拟成交明细（按时间顺序）",
      secTradeSub: "交易记录导出为 CSV；实验参数独立导出为 JSON，不包含在主站定投备份中。",
      fltAll: "全部",
      fltSell: "仅卖出",
      fltBuy: "仅回购/止损",
      btnExportCsv: "导出模拟成交记录 CSV",
      btnExportJson: "导出 VHE 实验设置 JSON",
      btnImportJson: "导入 VHE 实验设置 JSON",
      thSigDay: "信号日 (T)",
      thExecDay: "执行日 (T+1)",
      thLot: "子仓",
      thAction: "动作",
      thExecPx: "模拟成交价",
      thQtyBtc: "数量 (BTC)",
      thFeeSlip: "费用+滑点",
      thBtcAfter: "成交后实际 BTC",
      thCashAfter: "成交后现金",
      thReason: "触发原因",
      btnPrevPage: "上一页",
      btnNextPage: "下一页",
      subDataProvTitle: "原始数据来源与区间核对",
      provSource: "来源",
      provSpan: "首末数据日",
      provRows: "有效日线",
      provUpdated: "文件生成日",
      provWindow: "当前回测区间",
      provSemantics: "成交模型",
      provFingerprint: "校验指纹",
      semValue: "日参考价 · T信号→T+1收盘",
      secMethodTitle: "指标说明、账本隔离与方法局限",
      method1: "<b>收盘后次日执行：</b>无全历史日内逐笔与高低价文件，所有信号在 T 日完成收盘后确认，并于 T+1 日参考价叠加单边滑点与报价币手续费模拟成交，不假设盘中触价成交或限价必成。",
      method2: "<b>均线与估值口径区分：</b>本页 MA200 为连续 200 个已完成有效日的算术均值；AHR999 使用 200 日调和均值定投成本，其 2026 新拟合系数用于早期历史重放存在模型选择后见风险。VHE 不使用 URPD 快照构造历史信号。",
      method3: "<b>账本严格只读隔离：</b>本页参数仅存于独立键 btc_vhe_config_v1，不读写 btc_dca_ledger_v1 或 btc_exec_v7，不连接任何交易接口，不使用杠杆。若样本外未证明稳定增币优势，继续持有与纪律定投仍是默认基准。"
    },
    en: {
      docTitle: "Volatility BTC · Sats Garden",
      backMain: "Home",
      pageTitle: "Volatility BTC",
      simBadge: "Historical Sim",
      btnUpdate: "Update",
      metaInitHint: "Verifying daily history · Not a live trade signal",
      btnSourceDetail: "Source",
      hdrSrcNote: "Mechanical historical replay only. Generates no live orders and never modifies your real DCA ledger.",
      tabOverview: "Overview",
      tabResearch: "Strategy Research",
      pillUnapplied: "Unapplied",
      eqExplainSummary: "What is BTC Equivalent?",
      eqExplainBody: "BTC Equivalent = Actual Held BTC + Cash converted at the period-end daily reference price. Conversion is for apples-to-apples comparison only, not real held coins, and excludes taxes.",
      btnOverviewImportLocal: "Import Local BTC (Read-Only)",
      btnRestoreExample: "Restore 0.30 Example",
      ovChartTitle: "BTC Equivalent Comparison",
      ovChartSub: "Tap or drag to inspect daily values; red/green dots mark simulated sells and buybacks.",
      ovEvidenceTitle: "Out-of-Sample Research Evidence",
      ovEvidenceSub: "Independent OOS rolling check of the candidate selected in pre-registered training (2013–2020).",
      ovOosWinLabel: "24M OOS Rolling Win Rate",
      ovOosMedLabel: "24M OOS Median Excess",
      btnViewResearch: "Explore Research Details",
      resParamTitle: "Backtest Settings",
      resParamSub: "Core window and position settings; saved on this device only, real ledger untouched.",
      lblQuickDates: "Cycle Start Shortcuts",
      pre2017: "2017-12 Top",
      pre2018: "2018-12 Low",
      pre2021: "2021-11 Top",
      pre2022: "2022-11 Low",
      pre2024: "2024-01 ETF",
      lblInitBtc: "Initial BTC (0.30 example)",
      btnReadSnapshot: "Read Local BTC (Read-Only)",
      lblStart: "Start Date",
      lblEnd: "End Date (blank = last data day)",
      lblContribMode: "Cashflow Mode",
      optContribNone: "No New Cash (Lump-Sum)",
      optContribUniform: "Monthly Uniform DCA",
      optContribAhr: "Monthly AHR999 Dynamic DCA (Keep Cash)",
      lblMonthlyUsd: "Monthly Inflow (USD, DCA modes)",
      lblTradeRatio: "Swing Band Cap (0%–10%)",
      advParamTitle: "Advanced Settings (MA, Sell/Buyback Tiers, Exit Policy, Fees & Cost Basis)",
      lblMaLen: "Arithmetic MA Length (Days)",
      lblSellThr: "Lot A / B / C Sell Deviation (%)",
      lblBuyThr: "Tiered Buyback Drawdown (%)",
      lblExitPolicy: "Exit Policy",
      optExitStop20: "+20% Above Sell Fill Stop Buyback",
      optExitWait: "Hold & Wait Indefinitely",
      optExitTimeout90: "90-Day Timeout Buyback",
      lblTrendFilter: "Pre-Sell Trend Filter (Past Only)",
      optTrendNone: "No Trend Filter",
      optTrendSlope: "Block Sells When 20D MA Slope > 6%",
      lblCooldown: "Post-Cycle Cooldown (Days)",
      lblFee: "One-Way Fee Rate (%)",
      lblSlip: "One-Way Slippage (%)",
      lblInitCost: "Known Initial Cost Basis USD (Optional)",
      initCostPh: "Not entered",
      feeZero: "Zero Friction (0%)",
      feeStd: "Standard (0.10%+0.05%)",
      feeHigh: "Stress (0.25%+0.15%)",
      btnRunSim: "Apply Parameters",
      btnResetDefault: "Reset Defaults",
      msgParamUnapplied: "Parameters modified but not applied yet. Tap Apply Parameters to update.",
      paramSnapshotNote: "0.30 BTC is an example position. Tapping Read Local BTC only reads quantity and never modifies your DCA ledger.",
      resVerifyTitle: "Strategy Validation",
      resVerifySub: "Same-cashflow matrix, 24/36/48M full-history rolling checks, and pre-registered OOS test.",
      secRollingTitle: "Same-Cashflow Strategy Matrix",
      batch1Tab: "Batch 1 · Lump-Sum",
      batch2Tab: "Batch 2 · Monthly DCA",
      thStrategy: "Strategy (Tap to Load)",
      thHeldBtc: "Actual BTC",
      thEndCash: "End Cash",
      thEqBtc: "Equiv BTC",
      thVsRef: "vs Group Ref",
      thMaxDd: "Max BTC DD",
      thFailCnt: "Failed Cycles",
      thVerdict: "Verdict",
      subRollingWinTitle: "Monthly Rolling Windows",
      win24m: "24 Months",
      win36m: "36 Months",
      win48m: "48 Months",
      rollingOverlapWarn: "Monthly rolling windows overlap in time; win share does not equal independent cycle probability.",
      subOosTitle: "Pre-Registered Train (2013–2020) → Out-of-Sample (2021–End)",
      thCandidate: "Pre-Registered Candidate (6 Total)",
      thTrainEx: "Train Excess",
      thOosEx: "OOS Excess",
      thOosHighFee: "High-Fee OOS",
      thOosCash: "OOS End Cash",
      thOosDd: "OOS BTC DD",
      resRiskTitle: "Risk & Execution",
      resRiskSub: "Actual BTC curve switch, pending cash curve, cost & cycle metrics, sub-lots, and failed cycles.",
      secChartTitle: "Holdings Basis Switch & Pending Cash Curve",
      secChartSub: "Switch between actual held BTC and cash-converted eqBTC; lower chart tracks pending and reserve cash.",
      modeEqBtc: "BTC Equiv",
      modeHeldBtc: "Actual BTC",
      legSell: "Sell Fill",
      legBuy: "Tier Buyback",
      legExit: "Stop/Timeout Exit",
      kpiHeldLabel: "Actual Held BTC",
      kpiCashLabel: "Pending & Reserve Cash",
      kpiEqLabel: "BTC Equivalent",
      kpiDdLabel: "Max BTC Drawdown",
      subLotsTitle: "Experimental Sub-Lots (A / B / C)",
      subFailedCyclesTitle: "Failed Cycles, Stop Exits & Open Lots",
      thCycleLot: "Lot / State",
      thCycleSpan: "Sell Exec → Close",
      thAnchorPx: "Sell Anchor",
      thSoldBtc: "Sold BTC",
      thRepBtc: "Bought BTC",
      thNetLoss: "Net BTC / Cash Left",
      resTradesTitle: "Trades & Data",
      resTradesSub: "Chronological paginated fills, CSV/JSON import & export, raw data bar, and methodology.",
      secTradeTitle: "Simulated Fills (Chronological)",
      secTradeSub: "Export simulated fills as CSV; export VHE parameters separately as JSON (excluded from main DCA backup).",
      fltAll: "All",
      fltSell: "Sells Only",
      fltBuy: "Buybacks / Stops",
      btnExportCsv: "Export Trades CSV",
      btnExportJson: "Export VHE Settings JSON",
      btnImportJson: "Import VHE Settings JSON",
      thSigDay: "Signal Day (T)",
      thExecDay: "Exec Day (T+1)",
      thLot: "Lot",
      thAction: "Action",
      thExecPx: "Sim Fill Price",
      thQtyBtc: "Qty (BTC)",
      thFeeSlip: "Fee+Slip",
      thBtcAfter: "Held BTC After",
      thCashAfter: "Cash After",
      thReason: "Trigger Reason",
      btnPrevPage: "Prev",
      btnNextPage: "Next",
      subDataProvTitle: "Raw Data Provenance & Span",
      provSource: "Source",
      provSpan: "Data Span",
      provRows: "Valid Days",
      provUpdated: "File Built",
      provWindow: "Active Window",
      provSemantics: "Fill Model",
      provFingerprint: "Fingerprint",
      semValue: "Daily Ref · T Signal → T+1 Close",
      secMethodTitle: "Methodology, Ledger Isolation & Limitations",
      method1: "<b>Next-Close Execution:</b> Full historical intraday OHLC/tick files are unavailable; signals confirm at Day T close and execute at Day T+1 daily reference price with one-way fee and slippage. No intraday touch or limit-fill guarantee is assumed.",
      method2: "<b>MA200 vs AHR999:</b> MA200 here is the arithmetic mean of 200 contiguous valid closes, distinct from AHR999's 200D harmonic cost. Applying 2026 refit parameters to early history carries model-selection hindsight. URPD snapshots are never used as historical signals.",
      method3: "<b>Strict Read-Only Ledger Isolation:</b> Settings are stored solely under btc_vhe_config_v1; btc_dca_ledger_v1 and btc_exec_v7 are never written. No exchange APIs or leverage. Without proven OOS BTC alpha, disciplined HODL/DCA remains the baseline."
    }
  };

  var CANDIDATE_SPECS = {
    hodl_0pct: { tradeRatio: 0, exitPolicy: "stop_up_20pct", stopUpPct: 0.20, timeoutDays: 90, trendFilter: "none", zh: "0% 波段 · 纯持有基线", en: "0% Band · Pure HODL Baseline" },
    vhe_5pct_stop20: { tradeRatio: 0.05, exitPolicy: "stop_up_20pct", stopUpPct: 0.20, timeoutDays: 90, trendFilter: "none", zh: "5% 波段 · 涨20%止损", en: "5% Band · +20% Stop Buyback" },
    vhe_10pct_stop20: { tradeRatio: 0.10, exitPolicy: "stop_up_20pct", stopUpPct: 0.20, timeoutDays: 90, trendFilter: "none", zh: "10% 波段 · 涨20%止损", en: "10% Band · +20% Stop Buyback" },
    vhe_10pct_wait: { tradeRatio: 0.10, exitPolicy: "hold_wait", stopUpPct: 0.20, timeoutDays: 90, trendFilter: "none", zh: "10% 波段 · 无限等待", en: "10% Band · Hold & Wait" },
    vhe_10pct_timeout90: { tradeRatio: 0.10, exitPolicy: "timeout_90d", stopUpPct: 0.20, timeoutDays: 90, trendFilter: "none", zh: "10% 波段 · 90天超时", en: "10% Band · 90D Timeout" },
    vhe_10pct_trend: { tradeRatio: 0.10, exitPolicy: "stop_up_20pct", stopUpPct: 0.20, timeoutDays: 90, trendFilter: "ma_slope_cap", zh: "10% 波段 · 过去斜率过滤", en: "10% Band · Past Slope Filter" }
  };

  var state = {
    lang: window.BTC_LANG === "en" ? "en" : "zh",
    theme: document.documentElement.dataset.theme === "dark" ? "dark" : "light",
    viewMode: "overview", // 新访问始终优先展示概览
    scrollMemory: { overview: 0, research: 0 },
    isLoadingData: true,
    isCalculatingPrimary: false,
    isFormDirty: false,
    loadSeq: 0,
    calcToken: 0,
    norm: null,
    unverifiedFallbackNote: null,
    config: VHE.validateConfig(VHE.DEFAULT_CONFIG).config,
    bt: null,
    btCache: { key: null, data: null },
    oosState: { status: "pending", key: null, data: null },
    matrixCache: { status: "idle", key: null, data: null },
    rollingCache: { status: "idle", key: null, data: null },
    chartMode: "eq",
    ovHoverIdx: -1,
    resHoverIdx: -1,
    activeBatch: "batch1",
    rollingMonths: 24,
    tradeFilter: "all",
    tradePage: 1,
    metricsLog: {
      firstResultVisibleMs: null,
      lastParamSwitchMs: null,
      backtestRunCount: 0
    }
  };

  var bootPerfT0 = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();

  function nowMs() {
    return (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
  }

  function $(id) {
    return document.getElementById(id);
  }

  function isEn() {
    return state.lang === "en";
  }

  function tr(key) {
    var dict = I18N[state.lang] || I18N.zh;
    return dict[key] !== undefined ? dict[key] : (I18N.zh[key] || key);
  }

  function escHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fmtSignedNum(val, digits, suffix) {
    if (!Number.isFinite(val)) return "--";
    var abs = Math.abs(val).toFixed(digits);
    var sign = val > 1e-12 ? "+" : (val < -1e-12 ? MINUS : "");
    return sign + abs + (suffix || "");
  }

  function fmtSatsSigned(btcDelta) {
    if (!Number.isFinite(btcDelta)) return "--";
    var sats = Math.round(btcDelta * 1e8);
    var absStr = String(Math.abs(sats)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    var sign = sats > 0 ? "+" : (sats < 0 ? MINUS : "");
    return sign + absStr + (isEn() ? " sats" : " 聪");
  }

  function fmtPct(ratio, digits, forceSign) {
    if (!Number.isFinite(ratio)) return "--";
    var pct = ratio * 100;
    var d = digits !== undefined ? digits : 2;
    var sign = pct < -1e-9 ? MINUS : (forceSign && pct > 1e-9 ? "+" : "");
    return sign + Math.abs(pct).toFixed(d) + "%";
  }

  function fmtUsd(val, decimals) {
    if (!Number.isFinite(val)) return "--";
    var d = decimals !== undefined ? decimals : 0;
    var sign = val < -1e-9 ? MINUS : "";
    var abs = Math.abs(val);
    var parts = abs.toFixed(d).split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return sign + "$" + (parts.length > 1 ? parts[0] + "." + parts[1] : parts[0]);
  }

  var toastTimer = null;
  function showToast(msg) {
    var el = $("vheToast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove("show");
    }, 2600);
  }

  // ==================== 5 维缓存键（数据指纹 + 引擎版本 + 配置哈希 + 研究范围 + 费用场景） ====================
  function buildBtCacheKey(norm, cfg) {
    var scope = (cfg.start || "auto") + ".." + (cfg.end || norm.meta.lastDay) + ":p" + cfg.positionSource;
    var fee = cfg.feeRate.toFixed(6) + ":" + cfg.slippageRate.toFixed(6);
    return [norm.meta.fingerprint, VHE.VERSION, cfg.hash, scope, fee].join("|");
  }

  function buildOosCacheKey(norm) {
    var scope = "train:2013-09-01..2020-12-31|oos:2021-01-01.." + norm.meta.lastDay;
    var fee = "std:0.0010:0.0005|stress:0.0020:0.0010";
    return [norm.meta.fingerprint, VHE.VERSION, "pre_reg_oos_v1", scope, fee].join("|");
  }

  function buildMatrixCacheKey(norm, bt, batch, effMonthly) {
    var scope = batch + ":" + bt.metrics.startDay + ".." + bt.metrics.endDay + ":m" + effMonthly + ":i" + bt.config.initialBTC;
    var fee = bt.config.feeRate.toFixed(6) + ":" + bt.config.slippageRate.toFixed(6);
    return [norm.meta.fingerprint, VHE.VERSION, bt.config.hash, scope, fee].join("|");
  }

  function buildRollingCacheKey(norm, cfg) {
    var scope = "rolling_24_36_48:" + norm.meta.firstDay + ".." + norm.meta.lastDay;
    var fee = cfg.feeRate.toFixed(6) + ":" + cfg.slippageRate.toFixed(6);
    return [norm.meta.fingerprint, VHE.VERSION, cfg.hash, scope, fee].join("|");
  }

  // ==================== 后台 Web Worker + 可取消分片回退调度器 ====================
  var workerCtrl = {
    worker: null,
    ready: false,
    failed: false,
    busy: false,
    reqSeq: 0,
    inflight: null,
    latestByTask: Object.create(null), // 单槽去重队列：快速重复切换自动丢弃中间过时请求
    fallbackTimers: Object.create(null)
  };

  function initBackgroundWorker() {
    if (workerCtrl.worker || workerCtrl.failed) return;
    if (location.protocol !== "http:" && location.protocol !== "https:") {
      workerCtrl.failed = true;
      return;
    }
    if (typeof Worker !== "function" || !window.VHE_WORKER_SRC || !window.VHE_ENGINE_SRC) {
      workerCtrl.failed = true;
      return;
    }
    if (String(window.VHE_WORKER_SRC).indexOf("__VHE_") >= 0) {
      workerCtrl.failed = true;
      return;
    }
    try {
      var wUrl = new URL(window.VHE_WORKER_SRC, window.location.href).href;
      var eUrl = new URL(window.VHE_ENGINE_SRC, window.location.href).href;
      var w = new Worker(wUrl);
      workerCtrl.worker = w;
      w.onmessage = function (ev) {
        var msg = ev && ev.data ? ev.data : {};
        if (msg.type === "ready") {
          if (msg.ok) {
            workerCtrl.ready = true;
            pumpWorkerQueue();
          } else {
            workerCtrl.failed = true;
            try { w.terminate(); } catch (_) {}
            workerCtrl.worker = null;
            flushQueueViaFallback();
          }
          return;
        }
        if (msg.type === "result") {
          var doneJob = workerCtrl.inflight;
          workerCtrl.inflight = null;
          workerCtrl.busy = false;
          if (doneJob && doneJob.reqId === msg.reqId) {
            if (msg.ok) {
              doneJob.onDone(msg.data, msg.cacheKey, msg.calcToken);
            } else {
              doneJob.onError(msg.error || "WORKER_ERROR", msg.calcToken);
            }
          }
          pumpWorkerQueue();
        }
      };
      w.onerror = function () {
        workerCtrl.failed = true;
        workerCtrl.ready = false;
        workerCtrl.busy = false;
        var cur = workerCtrl.inflight;
        workerCtrl.inflight = null;
        try { w.terminate(); } catch (_) {}
        workerCtrl.worker = null;
        if (cur) workerCtrl.latestByTask[cur.task] = cur;
        flushQueueViaFallback();
      };
      w.postMessage({ type: "init", engineUrl: eUrl });
    } catch (_) {
      workerCtrl.failed = true;
      workerCtrl.worker = null;
    }
  }

  function pumpWorkerQueue() {
    if (!workerCtrl.ready || workerCtrl.busy || !workerCtrl.worker) return;
    var order = ["oos", "matrix", "rolling"];
    for (var i = 0; i < order.length; i++) {
      var tName = order[i];
      var job = workerCtrl.latestByTask[tName];
      if (job) {
        delete workerCtrl.latestByTask[tName];
        workerCtrl.busy = true;
        workerCtrl.inflight = job;
        workerCtrl.worker.postMessage({
          type: "compute",
          reqId: job.reqId,
          calcToken: job.calcToken,
          task: job.task,
          cacheKey: job.cacheKey,
          norm: job.norm,
          config: job.config,
          activeBatch: job.activeBatch,
          overrides: job.overrides,
          options: job.options,
          windows: job.windows
        });
        return;
      }
    }
  }

  function runFallbackJob(job) {
    if (workerCtrl.fallbackTimers[job.task]) {
      clearTimeout(workerCtrl.fallbackTimers[job.task]);
      delete workerCtrl.fallbackTimers[job.task];
    }
    workerCtrl.fallbackTimers[job.task] = setTimeout(function () {
      delete workerCtrl.fallbackTimers[job.task];
      // 如果已有更新的 calcToken 且不是独立数据源级 oos 任务，直接跳过旧计算
      if (job.task !== "oos" && job.calcToken !== state.calcToken) return;
      if (!state.norm || state.norm.meta.fingerprint !== job.norm.meta.fingerprint) return;
      try {
        var res = null;
        if (job.task === "oos") {
          res = VHE.runOutOfSampleEvaluation(job.norm, job.options || {});
        } else if (job.task === "matrix") {
          res = VHE.compareStrategies(job.norm, job.activeBatch, job.overrides || {});
        } else if (job.task === "rolling") {
          res = VHE.runRollingTests(job.norm, job.config, job.windows || [24, 36, 48]);
        }
        job.onDone(res, job.cacheKey, job.calcToken);
      } catch (err) {
        job.onError(String(err), job.calcToken);
      }
    }, 16);
  }

  function flushQueueViaFallback() {
    var keys = Object.keys(workerCtrl.latestByTask);
    for (var i = 0; i < keys.length; i++) {
      var job = workerCtrl.latestByTask[keys[i]];
      delete workerCtrl.latestByTask[keys[i]];
      if (job) runFallbackJob(job);
    }
  }

  function scheduleBackgroundTask(spec) {
    var job = Object.assign({ reqId: ++workerCtrl.reqSeq }, spec);
    initBackgroundWorker();
    if (workerCtrl.failed || !workerCtrl.worker) {
      runFallbackJob(job);
      return;
    }
    workerCtrl.latestByTask[job.task] = job;
    pumpWorkerQueue();
  }

  function afterNextPaint(cb) {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(function () {
        setTimeout(cb, 0);
      });
    } else {
      setTimeout(cb, 0);
    }
  }

  // ==================== 状态徽章与文案辅助 ====================
  // 严格遵守 文案规范.md B 节五种状态用语：等待数据 / 更新中 / 数据日 · MM-DD / 滞后 · MM-DD / 暂不可用
  function setStatusBadge(kind, mmdd) {
    var badge = $("dataStatusBadge");
    var txt = $("dataStatusText");
    if (!badge || !txt) return;
    if (kind === "loading") {
      badge.className = "status-badge warn num";
      txt.textContent = isEn() ? "Updating" : "更新中";
    } else if (kind === "fresh") {
      badge.className = "status-badge ok num";
      txt.textContent = (isEn() ? "Data · " : "数据日 · ") + mmdd;
    } else if (kind === "lagged") {
      badge.className = "status-badge warn num";
      txt.textContent = (isEn() ? "Lagged · " : "滞后 · ") + mmdd;
    } else if (kind === "unavailable") {
      badge.className = "status-badge bad num";
      txt.textContent = isEn() ? "Unavailable" : "暂不可用";
    } else {
      badge.className = "status-badge warn num";
      txt.textContent = isEn() ? "Waiting" : "等待数据";
    }
  }

  function translateBaselineLabel(cfg, shortForm) {
    var mode = cfg ? cfg.contributionMode : "none";
    if (!isEn()) {
      if (mode === "monthly_uniform") return shortForm ? "普通等额定投" : "普通等额定投基准";
      if (mode === "monthly_ahr999") return shortForm ? "AHR999 动态定投" : "AHR999 动态定投基准";
      return shortForm ? "纯持有" : "纯持有基准 (HODL)";
    }
    if (mode === "monthly_uniform") return shortForm ? "Uniform DCA" : "Uniform DCA Baseline";
    if (mode === "monthly_ahr999") return shortForm ? "AHR999 DCA" : "AHR999 Dynamic DCA";
    return shortForm ? "Pure HODL" : "Pure HODL Baseline";
  }

  function getCandidateDisplayName(candId) {
    var sp = CANDIDATE_SPECS[candId];
    if (!sp) return candId || "--";
    return isEn() ? sp.en : sp.zh;
  }

  // 严格判断当前规则是否与预注册训练期选出的候选一致（排除自定义参数、定投模式或低于标准费率的宽松设置）
  function matchPreRegisteredCandidate(cfg, oos) {
    if (!cfg || !oos || !oos.ok || !oos.trainSelectedCandidateId) return false;
    var sp = CANDIDATE_SPECS[oos.trainSelectedCandidateId];
    if (!sp) return false;
    if (cfg.contributionMode !== "none") return false;
    if (cfg.maLength !== 200 || cfg.cooldownDays !== 0) return false;
    if (cfg.feeRate + 1e-8 < 0.001 || cfg.slippageRate + 1e-8 < 0.0005) return false;
    if (Math.abs(cfg.tradeRatio - sp.tradeRatio) > 1e-6) return false;
    if (cfg.exitPolicy !== sp.exitPolicy) return false;
    if (cfg.trendFilter !== sp.trendFilter) return false;
    if (Math.abs(cfg.sellThresholds[0] - 0.25) > 1e-6 || Math.abs(cfg.sellThresholds[1] - 0.40) > 1e-6 || Math.abs(cfg.sellThresholds[2] - 0.55) > 1e-6) return false;
    if (Math.abs(cfg.buybackDrawdowns[0] - 0.10) > 1e-6 || Math.abs(cfg.buybackDrawdowns[1] - 0.20) > 1e-6 || Math.abs(cfg.buybackDrawdowns[2] - 0.30) > 1e-6) return false;
    return true;
  }

  // ==================== 本机配置与只读持仓快照 ====================
  function loadSavedConfig() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (!parsed || parsed.schema !== STORAGE_KEY || typeof parsed.config !== "object") return;
      var check = VHE.validateConfig(parsed.config);
      if (check.ok) {
        state.config = check.config;
      }
    } catch (_) {}
  }

  function saveConfigToLocal(cfg) {
    try {
      var payload = {
        schema: STORAGE_KEY,
        version: 1,
        savedAt: new Date().toISOString(),
        config: {
          initialBTC: cfg.initialBTC,
          initialCash: cfg.initialCash,
          positionSource: cfg.positionSource,
          initialCostUSD: cfg.initialCostUSD,
          start: cfg.start,
          end: cfg.end,
          tradeRatio: cfg.tradeRatio,
          maLength: cfg.maLength,
          sellThresholds: cfg.sellThresholds,
          lotWeights: cfg.lotWeights,
          buybackDrawdowns: cfg.buybackDrawdowns,
          buybackWeights: cfg.buybackWeights,
          feeRate: cfg.feeRate,
          slippageRate: cfg.slippageRate,
          exitPolicy: cfg.exitPolicy,
          stopUpPct: cfg.stopUpPct,
          timeoutDays: cfg.timeoutDays,
          trendFilter: cfg.trendFilter,
          cooldownDays: cfg.cooldownDays,
          contributionMode: cfg.contributionMode,
          monthlyUSD: cfg.monthlyUSD
        }
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (_) {}
  }

  function loadSessionResearchFoldState() {
    try {
      var raw = sessionStorage.getItem(SESSION_UI_KEY);
      if (!raw) return;
      var obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object") return;
      ["secResearchParams", "secResearchVerify", "secResearchRisk", "secResearchTrades", "advParamFold"].forEach(function (id) {
        if (typeof obj[id] === "boolean" && $(id)) {
          $(id).open = obj[id];
        }
      });
    } catch (_) {}
  }

  function saveSessionResearchFoldState() {
    try {
      var obj = {};
      ["secResearchParams", "secResearchVerify", "secResearchRisk", "secResearchTrades", "advParamFold"].forEach(function (id) {
        if ($(id)) obj[id] = Boolean($(id).open);
      });
      sessionStorage.setItem(SESSION_UI_KEY, JSON.stringify(obj));
    } catch (_) {}
  }

  // 严格只读读取本机持仓数量（绝不写入或修改 btc_dca_ledger_v1 或 btc_exec_v7）
  function readLocalHoldingsSnapshotReadOnly() {
    var totalBtc = 0;
    var found = false;
    try {
      var dcaRaw = localStorage.getItem("btc_dca_ledger_v1");
      if (dcaRaw) {
        var dca = JSON.parse(dcaRaw);
        if (dca && typeof dca === "object") {
          var baseBtc = dca.baseline && Number.isFinite(Number(dca.baseline.btc)) ? Number(dca.baseline.btc) : 0;
          var ordBtc = 0;
          if (Array.isArray(dca.orders)) {
            for (var i = 0; i < dca.orders.length; i++) {
              var o = dca.orders[i];
              if (o && o.type === "btc" && Number.isFinite(Number(o.btc)) && Number(o.btc) > 0) {
                ordBtc += Number(o.btc);
              }
            }
          }
          if (baseBtc + ordBtc > 0) {
            totalBtc += baseBtc + ordBtc;
            found = true;
          }
        }
      }
      var execRaw = localStorage.getItem("btc_exec_v7");
      if (execRaw) {
        var ex = JSON.parse(execRaw);
        if (ex && ex.hd && typeof ex.hd === "object") {
          var longBtc = Number.isFinite(Number(ex.hd.l)) && Number(ex.hd.l) > 0 ? Number(ex.hd.l) : 0;
          var dBtc = !found && Number.isFinite(Number(ex.hd.d)) && Number(ex.hd.d) > 0 ? Number(ex.hd.d) : 0;
          if (longBtc + dBtc > 0) {
            totalBtc += longBtc + dBtc;
            found = true;
          }
        }
      }
    } catch (_) {}
    return found && totalBtc > 0 ? Number(totalBtc.toFixed(8)) : null;
  }

  // ==================== 表单同步与「未应用」状态检查 ====================
  function syncMonthlyFieldVisibility() {
    var mode = $("selContribMode") ? $("selContribMode").value : "none";
    var fld = $("fieldMonthlyUsd");
    var inp = $("inpMonthlyUsd");
    if (fld && inp) {
      var active = mode !== "none";
      inp.disabled = !active;
      fld.style.opacity = active ? "1" : "0.58";
    }
  }

  function syncFormFromConfig() {
    var c = state.config;
    if ($("inpStart")) $("inpStart").value = c.start || "2021-11-01";
    if ($("inpEnd")) $("inpEnd").value = c.end || "";
    if ($("inpInitBtc")) $("inpInitBtc").value = String(c.initialBTC);
    if ($("inpTradeRatio")) $("inpTradeRatio").value = String(Number((c.tradeRatio * 100).toFixed(2)));
    if ($("inpMaLen")) $("inpMaLen").value = String(c.maLength);
    if ($("inpSellA")) $("inpSellA").value = String(Number((c.sellThresholds[0] * 100).toFixed(2)));
    if ($("inpSellB")) $("inpSellB").value = String(Number((c.sellThresholds[1] * 100).toFixed(2)));
    if ($("inpSellC")) $("inpSellC").value = String(Number((c.sellThresholds[2] * 100).toFixed(2)));
    if ($("inpBuy1")) $("inpBuy1").value = String(Number((c.buybackDrawdowns[0] * 100).toFixed(2)));
    if ($("inpBuy2")) $("inpBuy2").value = String(Number((c.buybackDrawdowns[1] * 100).toFixed(2)));
    if ($("inpBuy3")) $("inpBuy3").value = String(Number((c.buybackDrawdowns[2] * 100).toFixed(2)));
    if ($("selExitPolicy")) $("selExitPolicy").value = c.exitPolicy;
    if ($("selTrendFilter")) $("selTrendFilter").value = c.trendFilter;
    if ($("inpFee")) $("inpFee").value = String(Number((c.feeRate * 100).toFixed(4)));
    if ($("inpSlip")) $("inpSlip").value = String(Number((c.slippageRate * 100).toFixed(4)));
    if ($("inpCooldown")) $("inpCooldown").value = String(c.cooldownDays);
    if ($("selContribMode")) $("selContribMode").value = c.contributionMode;
    if ($("inpMonthlyUsd")) $("inpMonthlyUsd").value = String(c.monthlyUSD);
    if ($("inpInitCost")) $("inpInitCost").value = c.initialCostUSD != null ? String(c.initialCostUSD) : "";

    syncPresetHighlights(c.start, c.end, c.feeRate * 100, c.slippageRate * 100);
    syncMonthlyFieldVisibility();
    setFormDirty(false);
  }

  function syncPresetHighlights(startStr, endStr, feePct, slipPct) {
    var presetBtns = document.querySelectorAll("[data-start-preset]");
    for (var i = 0; i < presetBtns.length; i++) {
      presetBtns[i].classList.toggle("on", presetBtns[i].getAttribute("data-start-preset") === startStr && !endStr);
    }
    var feeBtns = document.querySelectorAll("[data-fee-preset]");
    for (var j = 0; j < feeBtns.length; j++) {
      var parts = feeBtns[j].getAttribute("data-fee-preset").split(",");
      var fMatch = Math.abs(Number(parts[0]) - feePct) < 1e-6 && Math.abs(Number(parts[1]) - slipPct) < 1e-6;
      feeBtns[j].classList.toggle("on", fMatch);
    }
  }

  function readConfigFromForm() {
    var initCostStr = $("inpInitCost") ? $("inpInitCost").value.trim() : "";
    var rawInitBtc = $("inpInitBtc") && $("inpInitBtc").value.trim() !== "" ? Number($("inpInitBtc").value) : NaN;
    var posSrc = state.config.positionSource || "example";
    if (Number.isFinite(rawInitBtc) && Math.abs(rawInitBtc - state.config.initialBTC) > 1e-10 && posSrc === "local_snapshot") {
      posSrc = "example";
    }
    return {
      start: $("inpStart") && $("inpStart").value ? $("inpStart").value : "2021-11-01",
      end: $("inpEnd") && $("inpEnd").value ? $("inpEnd").value : null,
      initialBTC: rawInitBtc,
      initialCash: state.config.initialCash || 0,
      positionSource: posSrc,
      initialCostUSD: initCostStr === "" ? null : Number(initCostStr),
      tradeRatio: $("inpTradeRatio") && $("inpTradeRatio").value.trim() !== "" ? Number($("inpTradeRatio").value) / 100 : NaN,
      maLength: $("inpMaLen") && $("inpMaLen").value.trim() !== "" ? Number($("inpMaLen").value) : NaN,
      sellThresholds: [
        Number($("inpSellA").value) / 100,
        Number($("inpSellB").value) / 100,
        Number($("inpSellC").value) / 100
      ],
      lotWeights: [1 / 3, 1 / 3, 1 / 3],
      buybackDrawdowns: [
        Number($("inpBuy1").value) / 100,
        Number($("inpBuy2").value) / 100,
        Number($("inpBuy3").value) / 100
      ],
      buybackWeights: [1 / 3, 1 / 3, 1 / 3],
      exitPolicy: $("selExitPolicy").value,
      stopUpPct: 0.20,
      timeoutDays: 90,
      trendFilter: $("selTrendFilter").value,
      feeRate: $("inpFee") && $("inpFee").value.trim() !== "" ? Number($("inpFee").value) / 100 : NaN,
      slippageRate: $("inpSlip") && $("inpSlip").value.trim() !== "" ? Number($("inpSlip").value) / 100 : NaN,
      cooldownDays: $("inpCooldown") && $("inpCooldown").value.trim() !== "" ? Number($("inpCooldown").value) : NaN,
      contributionMode: $("selContribMode").value,
      monthlyUSD: $("inpMonthlyUsd") && $("inpMonthlyUsd").value.trim() !== "" ? Number($("inpMonthlyUsd").value) : NaN
    };
  }

  function setFormDirty(dirty) {
    state.isFormDirty = Boolean(dirty);
    if ($("paramDirtyBadge")) $("paramDirtyBadge").hidden = !state.isFormDirty;
    if ($("paramDirtyHint")) $("paramDirtyHint").hidden = !state.isFormDirty;
    if ($("tabDirtyPill")) $("tabDirtyPill").hidden = !state.isFormDirty;
    renderOverviewVerdictAndEvidence();
  }

  function checkFormDirty() {
    syncMonthlyFieldVisibility();
    var raw = readConfigFromForm();
    syncPresetHighlights(raw.start, raw.end, (raw.feeRate || 0) * 100, (raw.slippageRate || 0) * 100);
    var check = VHE.validateConfig(raw);
    if (!check.ok) {
      setFormDirty(true);
      return;
    }
    var nc = check.config;
    var ac = state.config;
    var same = nc.hash === ac.hash
      && nc.start === ac.start
      && (nc.end || null) === (ac.end || null)
      && Math.abs(nc.initialBTC - ac.initialBTC) <= 1e-10
      && (nc.initialCostUSD || null) === (ac.initialCostUSD || null);
    setFormDirty(!same);
  }

  function setApplyButtonBusy(busy) {
    var btn = $("btnApplyParams");
    if (!btn) return;
    btn.disabled = Boolean(busy);
    btn.textContent = busy ? (isEn() ? "Calculating…" : "正在计算…") : tr("btnRunSim");
  }

  // ==================== 数据加载与回退 ====================
  async function loadHistoryData(isManualRefresh) {
    var myLoadSeq = ++state.loadSeq;
    state.isLoadingData = true;
    setStatusBadge("loading");
    state.unverifiedFallbackNote = null;

    if ($("vheUnavailableCard")) $("vheUnavailableCard").hidden = true;
    if ($("runErrorNotice")) $("runErrorNotice").hidden = true;
    renderLoadingState();

    var loadedNorm = null;

    // 1. 优先读取同源预生成 ./data/v28/charts.json（仅接受带显式 d 校验的序列）
    if (location.protocol === "http:" || location.protocol === "https:") {
      var ctrl = typeof AbortController === "function" ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function () { try { ctrl.abort(); } catch (_) {} }, 4500) : null;
      try {
        var res = await fetch("./data/v28/charts.json", {
          cache: "no-store",
          signal: ctrl ? ctrl.signal : undefined
        });
        if (timer) clearTimeout(timer);
        if (myLoadSeq !== state.loadSeq) return;
        if (res && res.ok) {
          var ct = (res.headers.get("content-type") || "").toLowerCase();
          if (ct.indexOf("text/html") === -1) {
            var json = await res.json();
            if (myLoadSeq !== state.loadSeq) return;
            var cand = VHE.normalizeHistory(json);
            if (cand.ok && cand.meta.verified) {
              loadedNorm = cand;
            } else if (cand.ok && !cand.meta.verified) {
              state.unverifiedFallbackNote = isEn()
                ? "Same-origin charts.json lacks explicit daily array d; cleanly switched to verified bundled CYCLE_SEED."
                : "线上 charts.json 缺少显式日期校验字段 d，已独立回退至随包历史种子 CYCLE_SEED（未混合数据源）。";
            }
          }
        }
      } catch (_) {
        if (timer) clearTimeout(timer);
      }
    }

    if (myLoadSeq !== state.loadSeq) return;

    // 2. 独立回退至随包历史种子 CYCLE_SEED
    var bundledSeed = (typeof CYCLE_SEED === "object" && CYCLE_SEED) ? CYCLE_SEED : (window.CYCLE_SEED || null);
    if (!loadedNorm && bundledSeed) {
      var seedCand = VHE.normalizeHistory(bundledSeed);
      if (seedCand.ok && seedCand.meta.verified) {
        loadedNorm = seedCand;
      }
    }

    state.isLoadingData = false;

    if (!loadedNorm) {
      state.norm = null;
      state.bt = null;
      state.oosState = { status: "unavailable", key: null, data: null };
      state.matrixCache = { status: "unavailable", key: null, data: null };
      state.rollingCache = { status: "unavailable", key: null, data: null };
      setStatusBadge("unavailable");
      renderClearedInvalidState(isEn()
        ? "Unavailable. Verified historical daily series is missing. Tap Update to retry."
        : "暂不可用。未找到通过连续性校验的历史日线数据。点按「更新」重试。", true);
      if (isManualRefresh) {
        showToast(isEn() ? "Data unavailable" : "数据暂不可用");
      }
      return;
    }

    var prevFp = state.norm ? state.norm.meta.fingerprint : null;
    state.norm = loadedNorm;
    if (prevFp !== loadedNorm.meta.fingerprint) {
      state.btCache = { key: null, data: null };
      state.oosState = { status: "pending", key: null, data: null };
      state.matrixCache = { status: "idle", key: null, data: null };
      state.rollingCache = { status: "idle", key: null, data: null };
    }

    var mmdd = loadedNorm.meta.lastDay ? loadedNorm.meta.lastDay.slice(5) : "--";
    setStatusBadge(loadedNorm.meta.isLagged ? "lagged" : "fresh", mmdd);

    executeSimulationFlow(false);
    if (isManualRefresh) {
      showToast(isEn() ? ("Updated · Data " + loadedNorm.meta.lastDay) : ("已更新 · 数据日 " + loadedNorm.meta.lastDay));
    }
  }

  // ==================== 加载中 / 不可用 / 回测失败清空态（严禁残留旧结果） ====================
  function clearCanvas(id) {
    var cv = $(id);
    if (!cv) return;
    var ctx = cv.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, cv.width, cv.height);
  }

  function renderLoadingState() {
    $("verdictTitle").textContent = isEn() ? "Calculating…" : "正在计算…";
    $("verdictDesc").textContent = isEn()
      ? "Reading and verifying historical daily closes."
      : "正在读取并校验历史日线，请稍候。";
    $("ruleScopePill").className = "scope-chip";
    $("ruleScopePill").textContent = isEn() ? "Current Rule: Calculating" : "当前规则：正在计算";
    $("oosScopePill").className = "scope-chip";
    $("oosScopePill").textContent = isEn() ? "Pre-Reg Study: Pending" : "预注册研究：待验证";
    $("heroSatsVal").textContent = "--";
    $("heroSatsVal").className = "focus-sats num";
    $("heroBtcPctVal").textContent = isEn() ? "Calculating…" : "正在计算…";
    $("cmpBaseEqVal").textContent = "--";
    $("cmpBaseSub").textContent = isEn() ? "Calculating…" : "正在计算…";
    $("cmpVheEqVal").textContent = "--";
    $("cmpVheSub").textContent = isEn() ? "Calculating…" : "正在计算…";
    $("overviewHoldingsLine").textContent = isEn() ? "Actual BTC: Calculating · Cash: Calculating" : "实际持币：正在计算 · 现金：正在计算";
    $("btnExportCsv").disabled = true;
  }

  function renderClearedInvalidState(reasonMsg, isDataMissing) {
    state.bt = null;
    state.ovHoverIdx = -1;
    state.resHoverIdx = -1;

    if (isDataMissing && $("vheUnavailableCard")) {
      $("vheUnavailableCard").hidden = false;
      $("vheUnavailableMsg").textContent = reasonMsg;
    }

    $("btnExportCsv").disabled = true;

    $("headerMetaSummary").textContent = isDataMissing
      ? (isEn() ? "Historical data unavailable · Not a trade signal" : "历史数据暂不可用 · 非今日交易信号")
      : (isEn() ? "Backtest invalid · Previous results cleared" : "当前参数无法完成回测 · 已清空旧结果");

    $("ruleScopePill").className = "scope-chip warn";
    $("ruleScopePill").textContent = isEn() ? "Current Rule: Invalid" : "当前规则：不可用";
    $("oosScopePill").className = "scope-chip";
    $("oosScopePill").textContent = isDataMissing
      ? (isEn() ? "Pre-Reg Study: Unavailable" : "预注册研究：暂不可用")
      : (state.oosState.status === "ready" && state.oosState.data && state.oosState.data.ok
        ? (state.oosState.data.researchGatePassed
          ? (isEn() ? "Pre-Reg Study: Passed (Sim)" : "预注册研究：通过（仅模拟）")
          : (isEn() ? "Pre-Reg Study: Not Passed" : "预注册研究：未通过"))
        : (isEn() ? "Pre-Reg Study: Pending" : "预注册研究：待验证"));

    $("verdictTitle").textContent = isDataMissing
      ? (isEn() ? "Unavailable" : "暂不可用")
      : (isEn() ? "Backtest Cannot Run" : "当前回测无法完成");
    $("verdictDesc").textContent = reasonMsg;

    $("heroDeltaLabel").textContent = isEn() ? "Net BTC Equivalent vs Baseline" : "相比持有基准，BTC 等价资产净变化";
    $("heroSatsVal").textContent = "--";
    $("heroSatsVal").className = "focus-sats num";
    $("heroBtcPctVal").textContent = isDataMissing ? (isEn() ? "Unavailable" : "暂不可用") : (isEn() ? "Invalid range or parameters" : "参数或区间无效，无有效结果");

    $("cmpBaseEqVal").textContent = "--";
    $("cmpBaseSub").textContent = "--";
    $("cmpVheEqVal").textContent = "--";
    $("cmpVheEqVal").className = "num";
    $("cmpVheSub").textContent = "--";
    $("overviewHoldingsLine").textContent = isEn() ? "Actual BTC: -- · Total Cash: -- · Pending Buyback: --" : "实际持币：-- · 总现金：-- · 待回购现金：--";

    $("nextStepText").textContent = isDataMissing
      ? (isEn() ? "Tap Update after reconnecting; real DCA ledger stays untouched." : "请联网后点按「更新」重试；原本机定投账本不受影响。")
      : (isEn() ? "Fix or reset parameters in Strategy Research; no live trade signals." : "请在「策略研究 → 回测设置」修正参数或恢复默认；不生成实盘买卖指令。");

    $("auditBadge").className = "status-badge warn num";
    $("auditBadgeText").textContent = isDataMissing ? (isEn() ? "Unavailable" : "暂不可用") : (isEn() ? "Invalid" : "未生效");
    $("kpiHeldVal").textContent = "--";
    $("kpiHeldSub").textContent = "--";
    $("kpiCashVal").textContent = "--";
    $("kpiCashSub").textContent = "--";
    $("kpiEqVal").textContent = "--";
    $("kpiEqVal").className = "num";
    $("kpiEqSub").textContent = "--";
    $("kpiDdVal").textContent = "--";
    $("kpiDdSub").textContent = "--";
    $("diagKvGrid").innerHTML = "";
    $("lotsGrid").innerHTML = "";
    $("tradesCountMeta").textContent = "--";
    $("verifyFoldMeta").textContent = "--";
    if ($("tradePager")) $("tradePager").hidden = true;

    var emptyLabel = isDataMissing ? (isEn() ? "Unavailable" : "暂不可用") : (isEn() ? "No valid result under current settings" : "当前设置无有效结果");
    $("matrixTableBody").innerHTML = '<tr><td colspan="8" class="tbl-empty">' + escHtml(emptyLabel) + "</td></tr>";
    if (isDataMissing) {
      $("oosTableBody").innerHTML = '<tr><td colspan="6" class="tbl-empty">' + escHtml(emptyLabel) + "</td></tr>";
      $("oosSummaryBadge").className = "status-badge bad num";
      $("oosSummaryBadgeText").textContent = isEn() ? "Unavailable" : "暂不可用";
      $("oosWinRateVal").textContent = "--";
      $("oosWinRateSub").textContent = emptyLabel;
      $("oosMedianVal").textContent = "--";
      $("oosMedianSub").textContent = emptyLabel;
      $("oosEvidenceNote").textContent = reasonMsg;
    }
    $("failedCyclesBody").innerHTML = '<tr><td colspan="6" class="tbl-empty">' + escHtml(emptyLabel) + "</td></tr>";
    $("tradeTableBody").innerHTML = '<tr><td colspan="10" class="tbl-empty">' + escHtml(emptyLabel) + "</td></tr>";

    clearCanvas("overviewMainCanvas");
    clearCanvas("mainChartCanvas");
    clearCanvas("cashChartCanvas");
    clearCanvas("rollingChartCanvas");

    if (isDataMissing) {
      $("hdrSrcName").textContent = isEn() ? "Unavailable" : "暂不可用";
      $("hdrSrcSpan").textContent = "--";
      $("hdrSrcRows").textContent = "--";
      $("provSourceVal").textContent = isEn() ? "Unavailable" : "暂不可用";
      $("provSpanVal").textContent = "--";
      $("provRowsVal").textContent = "--";
      $("provUpdatedVal").textContent = "--";
      $("provWindowVal").textContent = "--";
      $("provHashVal").textContent = "--";
    } else {
      $("provWindowVal").textContent = "--";
    }
  }

  // ==================== 主流程：先跑主回测渲染概览，再让浏览器绘制，随后后台执行 OOS 与按需研究 ====================
  function executeSimulationFlow(isParamSwitch) {
    if (!state.norm) {
      renderClearedInvalidState(isEn() ? "No verified historical series available." : "当前无可用历史序列。", true);
      return;
    }

    var myToken = ++state.calcToken;
    var tStart = nowMs();
    state.isCalculatingPrimary = true;
    setApplyButtonBusy(true);

    var meta = state.norm.meta;
    updateProvenanceDom(meta, null);

    var btKey = buildBtCacheKey(state.norm, state.config);
    var bt;
    if (state.btCache.key === btKey && state.btCache.data) {
      bt = state.btCache.data;
    } else {
      bt = VHE.runBacktest(state.norm, state.config);
      state.metricsLog.backtestRunCount += 1;
      if (bt && bt.ok) {
        state.btCache = { key: btKey, data: bt };
      }
    }

    state.isCalculatingPrimary = false;
    setApplyButtonBusy(false);
    state.bt = bt;
    state.ovHoverIdx = -1;
    state.resHoverIdx = -1;
    state.tradePage = 1;

    renderGlobalWarnings(bt);

    var errNotice = $("runErrorNotice");
    if (!bt || !bt.ok) {
      var errMsg = (bt && bt.errors && bt.errors.length) ? bt.errors.join(" ") : (isEn() ? "Backtest failed." : "回测未能完成。");
      if (errNotice) {
        errNotice.hidden = false;
        errNotice.textContent = errMsg;
      }
      renderClearedInvalidState(errMsg, false);
      return;
    }

    if (errNotice) errNotice.hidden = true;
    $("btnExportCsv").disabled = false;
    updateProvenanceDom(meta, bt);

    // 1. 立即更新首屏概览 + 单一曲线
    renderOverviewPrimary(bt);
    if (state.viewMode === "overview") {
      drawSingleCurveCanvas("overviewMainCanvas", "overviewChartTip", bt, true, state.ovHoverIdx);
    }

    // 更新研究区折叠栏轻量摘要（不构造大表 DOM）
    $("tradesCountMeta").textContent = bt.trades.length + (isEn() ? " fills" : " 笔");
    $("auditBadge").className = bt.audit.passed ? "status-badge ok num" : "status-badge bad num";
    $("auditBadgeText").textContent = bt.audit.passed
      ? (isEn() ? "Conservation OK" : "守恒通过")
      : (isEn() ? "Audit Mismatch" : "对账异常");

    // 2. 给浏览器真实绘制机会，记录真实可见耗时，再启动后台 OOS 与可见研究子区
    afterNextPaint(function () {
      if (myToken !== state.calcToken) return;
      var elapsed = Math.round((nowMs() - (isParamSwitch ? tStart : bootPerfT0)) * 10) / 10;
      if (state.metricsLog.firstResultVisibleMs === null && !isParamSwitch) {
        state.metricsLog.firstResultVisibleMs = elapsed;
      }
      if (isParamSwitch) {
        state.metricsLog.lastParamSwitchMs = Math.round((nowMs() - tStart) * 10) / 10;
      }

      ensureOosEvaluation(myToken);
      if (state.viewMode === "research") {
        syncVisibleResearchSections(myToken);
      }
    });
  }

  function updateProvenanceDom(meta, bt) {
    var srcLabel = isEn()
      ? (meta.isSeed ? "Bundled Seed (CYCLE_SEED)" : "Same-Origin (charts.json)")
      : (meta.isSeed ? "随包历史种子 (CYCLE_SEED)" : "同源预生成 (charts.json)");
    var gapNote = meta.gapCount > 0 ? (isEn() ? (" (" + meta.gapCount + " early gaps)") : ("（早期缺口 " + meta.gapCount + " 日）")) : "";
    var spanTxt = meta.firstDay + " → " + meta.lastDay;
    var rowsTxt = meta.validCount + gapNote;

    $("hdrSrcName").textContent = srcLabel;
    $("hdrSrcSpan").textContent = spanTxt;
    $("hdrSrcRows").textContent = rowsTxt;
    $("hdrSrcModel").textContent = tr("semValue");

    $("provSourceVal").textContent = srcLabel;
    $("provSpanVal").textContent = spanTxt;
    $("provRowsVal").textContent = rowsTxt;
    $("provUpdatedVal").textContent = meta.updatedDay || "--";
    $("provSemanticsVal").textContent = tr("semValue");

    if (bt && bt.ok) {
      var winTxt = bt.metrics.startDay + " → " + bt.metrics.endDay;
      $("provWindowVal").textContent = winTxt;
      $("provHashVal").textContent = meta.fingerprint + " · " + bt.config.hash;
      $("headerMetaSummary").textContent = isEn()
        ? ("Data End " + meta.lastDay + (meta.gapCount > 0 ? (" · " + meta.gapCount + " gaps") : "") + " · Historical Sim (Not a Signal)")
        : ("数据末日 " + meta.lastDay + (meta.gapCount > 0 ? (" · 含早期缺口 " + meta.gapCount + " 日") : "") + " · 历史模拟，非今日交易信号");
    } else {
      $("provWindowVal").textContent = "--";
      $("provHashVal").textContent = meta.fingerprint;
    }
  }

  function renderGlobalWarnings(bt) {
    var warns = [];
    if (state.unverifiedFallbackNote) {
      warns.push('<div class="warn-notice">' + escHtml(state.unverifiedFallbackNote) + "</div>");
    }
    if (state.norm && state.norm.meta.gapCount > 0) {
      warns.push('<div class="warn-notice">' + escHtml(isEn()
        ? ("Data gap notice: Series has " + state.norm.meta.gapCount + " missing calendar days in early history; MA requires contiguous valid days without interpolation.")
        : ("缺日提示：历史序列早期含 " + state.norm.meta.gapCount + " 个缺失自然日；均线严格按连续有效日计算，不对缺口插值。")) + "</div>");
    }
    if (bt && bt.ok && bt.config.contributionMode === "monthly_ahr999" && bt.metrics.startDay < "2026-01-01") {
      warns.push('<div class="warn-notice">' + escHtml(isEn()
        ? "Model hindsight note: AHR999 2026 refit coefficients (A=5.5856, B=−16.1567) replayed before 2026 carry in-sample hindsight."
        : "模型后见提示：AHR999 新拟合系数（A=5.5856, B=−16.1567）用于早期区间回放存在模型选择后见风险。") + "</div>");
    }
    $("runWarningsBox").innerHTML = warns.join("");
  }

  // ==================== 概览渲染：唯一结论、唯一焦点数字、同口径对比与 OOS 摘要 ====================
  function renderOverviewPrimary(bt) {
    var m = bt.metrics;
    var cfg = bt.config;
    var baseShort = translateBaselineLabel(cfg, true);

    // 1. 最大视觉焦点：净增减聪 + BTC 精确小数 + 百分比
    var diffBtc = m.netDiffEqBTC;
    $("heroDeltaLabel").textContent = isEn()
      ? ("vs " + baseShort + ", More/Less BTC Equivalent")
      : ("相比" + baseShort + "，多/少了多少 BTC 等价资产");

    var satsEl = $("heroSatsVal");
    satsEl.textContent = fmtSatsSigned(diffBtc);
    satsEl.className = "focus-sats num " + (diffBtc > 1e-10 ? "up" : (diffBtc < -1e-10 ? "dn" : ""));

    $("heroBtcPctVal").textContent = isEn()
      ? (fmtSignedNum(diffBtc, 8, " BTC") + " (" + fmtPct(m.netDiffEqPct, 2, true) + " eqBTC · " + m.startDay + " → " + m.endDay + ")")
      : (fmtSignedNum(diffBtc, 8, " BTC") + "（" + fmtPct(m.netDiffEqPct, 2, true) + " 等价资产 · " + m.startDay + " → " + m.endDay + "）");

    // 2. 左右对比：同一口径与同一期末日期
    var bandPctStr = Number((cfg.tradeRatio * 100).toFixed(1));
    $("cmpBaseLabel").textContent = isEn()
      ? (baseShort + " (" + m.endDay + ")")
      : (baseShort + "（" + m.endDay + "）");
    $("cmpBaseEqVal").textContent = m.baselineEqBTC.toFixed(6) + " BTC";
    $("cmpBaseSub").textContent = isEn()
      ? ("Held " + m.baselineHeldBTC.toFixed(6) + (m.baselineCashUSD > 0.005 ? (" · Cash " + fmtUsd(m.baselineCashUSD, 0)) : ""))
      : ("实际持币 " + m.baselineHeldBTC.toFixed(6) + (m.baselineCashUSD > 0.005 ? (" · 留存现金 " + fmtUsd(m.baselineCashUSD, 0)) : ""));

    $("cmpVheLabel").textContent = isEn()
      ? ("Swing Band (" + bandPctStr + "% cap)")
      : ("波段策略（" + bandPctStr + "% 仓）");
    var vheEqEl = $("cmpVheEqVal");
    vheEqEl.textContent = m.eqBTC.toFixed(6) + " BTC";
    vheEqEl.className = "num " + (diffBtc > 1e-10 ? "up" : (diffBtc < -1e-10 ? "dn" : ""));
    $("cmpVheSub").textContent = isEn()
      ? ("Held " + m.heldBTC.toFixed(6) + " · DD " + MINUS + (m.maxEqBtcDrawdown * 100).toFixed(2) + "%")
      : ("实际持币 " + m.heldBTC.toFixed(6) + " · 回撤 " + MINUS + (m.maxEqBtcDrawdown * 100).toFixed(2) + "%");

    // 3. 下方细行：严格区分实际持币、总现金、待回购现金与外部留存现金
    var fineParts = isEn()
      ? [
          "Actual Held " + m.heldBTC.toFixed(6) + " BTC",
          "Total Cash " + fmtUsd(m.totalCashUSD, 2),
          "Pending Buyback " + fmtUsd(m.pendingBuybackCashUSD, 2)
        ]
      : [
          "实际持币 " + m.heldBTC.toFixed(6) + " BTC",
          "总现金 " + fmtUsd(m.totalCashUSD, 2),
          "待回购现金 " + fmtUsd(m.pendingBuybackCashUSD, 2)
        ];
    if (m.externalReserveCashUSD > 0.005) {
      fineParts.push((isEn() ? "External Reserve " : "外部留存现金 ") + fmtUsd(m.externalReserveCashUSD, 2));
    }
    fineParts.push((isEn() ? "Fees " : "累计费用 ") + fmtUsd(m.totalFeesUSD + m.totalSlippageUSD, 2));
    $("overviewHoldingsLine").textContent = fineParts.join(" · ");

    // 4. 示例仓位 / 本机只读数量说明
    var isLocalSnap = cfg.positionSource === "local_snapshot";
    $("btnOverviewResetExample").hidden = !isLocalSnap && Math.abs(cfg.initialBTC - 0.3) < 1e-8 && cfg.contributionMode === "none";
    if (isLocalSnap) {
      $("overviewPosText").textContent = isEn()
        ? ("Using read-only local quantity: " + cfg.initialBTC + " BTC (real DCA ledger untouched).")
        : ("当前使用只读导入的本机数量：" + cfg.initialBTC + " BTC（真实定投账本未作任何修改）。");
    } else {
      var cfNoteZh = cfg.contributionMode === "none" ? "无外部现金流" : ("每月外部入金 " + fmtUsd(cfg.monthlyUSD, 0));
      var cfNoteEn = cfg.contributionMode === "none" ? "no external cashflows" : ("monthly inflow " + fmtUsd(cfg.monthlyUSD, 0));
      $("overviewPosText").textContent = isEn()
        ? ("Showing " + cfg.initialBTC.toFixed(2) + " BTC example position, " + cfNoteEn + " (not your real holdings).")
        : ("当前显示 " + cfg.initialBTC.toFixed(2) + " BTC 示例仓位，" + cfNoteZh + "（不代表你的真实持仓）。");
    }

    // 5. 概览图例（仅两条等价曲线）
    $("ovLegBase").textContent = baseShort;
    $("ovLegVhe").textContent = isEn() ? ("Swing (" + bandPctStr + "%)") : ("波段（" + bandPctStr + "%）");

    renderOverviewVerdictAndEvidence();
  }

  function renderOverviewVerdictAndEvidence() {
    if (state.isLoadingData || state.isCalculatingPrimary) return;
    var bt = state.bt;
    if (!state.norm || !bt || !bt.ok) return;

    var m = bt.metrics;
    var cfg = bt.config;
    var baseShort = translateBaselineLabel(cfg, true);
    var dirtyPrefixZh = state.isFormDirty ? "【注意：研究页有未应用修改，以下仍为上次已应用参数结果】" : "";
    var dirtyPrefixEn = state.isFormDirty ? "[Note: Unapplied edits exist in Research; showing last applied parameters] " : "";

    var oosStatus = state.oosState.status;
    var oos = (oosStatus === "ready" && state.oosState.data && state.oosState.data.ok) ? state.oosState.data : null;
    var matched = oos ? matchPreRegisteredCandidate(cfg, oos) : false;
    var candName = oos ? getCandidateDisplayName(oos.trainSelectedCandidateId) : "--";

    // A. 更新主结论与两个作用域徽章
    if (cfg.tradeRatio === 0) {
      $("ruleScopePill").className = "scope-chip";
      $("ruleScopePill").textContent = isEn() ? "Current Rule: 0% Hold Baseline" : "当前规则：0% 持有基准";
      $("verdictTitle").textContent = isEn() ? "Hold / DCA Baseline" : "持有基准";
      $("verdictDesc").textContent = (isEn() ? dirtyPrefixEn : dirtyPrefixZh) + (isEn()
        ? ("0% swing band selected; outcome equals " + baseShort + " and is not evidence of swing trading gains. Historical simulation, not a live signal.")
        : ("当前波段比例为 0%，结果与" + baseShort + "完全一致，不是波段增币证据。历史模拟，不是今日交易信号。"));
    } else if (oosStatus === "pending" || !oos) {
      $("ruleScopePill").className = "scope-chip";
      $("ruleScopePill").textContent = isEn() ? "Current Rule: Window Computed" : "当前规则：单窗已算出";
      $("verdictTitle").textContent = isEn() ? "Verifying Out-of-Sample Evidence…" : "正在验证样本外证据…";
      $("verdictDesc").textContent = (isEn() ? dirtyPrefixEn : dirtyPrefixZh) + (isEn()
        ? "Single-window comparison is ready; checking pre-registered out-of-sample rolling gates in the background."
        : "当前窗口对比已算出；正在后台验证预注册样本外滚动表现，未完成前不预判结论。");
    } else if (!oos.researchGatePassed) {
      // 样本外未通过门槛
      if (m.outperformedBaseline) {
        // 单一窗口领先，但样本外研究未通过 / 当前规则未验证 —— 严禁给绿色实盘推荐！
        $("ruleScopePill").className = "scope-chip warn";
        $("ruleScopePill").textContent = isEn() ? "Current Rule: Unverified (1-Win Ahead)" : "当前规则：未验证（单窗领先）";
        $("verdictTitle").textContent = isEn() ? "Current Rule Unverified" : "当前规则尚未验证";
        $("verdictDesc").textContent = (isEn() ? dirtyPrefixEn : dirtyPrefixZh) + (isEn()
          ? ("Ahead of " + baseShort + " in this single window, but single-window gains do not prove persistent edge; pre-registered OOS gate did not pass.")
          : ("当前规则在本区间单窗领先" + baseShort + "，但单一历史窗口领先不代表持续优势；预注册候选未通过样本外研究门槛。"));
      } else {
        $("ruleScopePill").className = "scope-chip warn";
        $("ruleScopePill").textContent = matched
          ? (isEn() ? "Current Rule: Pre-Reg Candidate (Failed OOS)" : "当前规则：匹配预注册候选（未过门槛）")
          : (isEn() ? "Current Rule: Unverified" : "当前规则：未验证");
        $("verdictTitle").textContent = isEn() ? "BTC Alpha Not Proven" : "尚未证明增币优势";
        $("verdictDesc").textContent = (isEn() ? dirtyPrefixEn : dirtyPrefixZh) + (isEn()
          ? ("Pre-registered candidate failed the out-of-sample gate, and current rule trailed " + baseShort + " in this window. Historical simulation only.")
          : ("预注册候选未通过研究门槛；当前规则在本区间亦落后" + baseShort + "。历史模拟，不是今日交易信号。"));
      }
    } else {
      // 样本外预注册候选满足初步门槛（oos.researchGatePassed === true）
      if (matched) {
        $("ruleScopePill").className = "scope-chip ok";
        $("ruleScopePill").textContent = isEn() ? "Current Rule: Matches Pre-Reg (Scoped)" : "当前规则：匹配预注册候选（仅指定区间）";
        $("verdictTitle").textContent = isEn() ? "Preliminary Gate Met · Sim Watch Only" : "满足初步研究门槛，仅模拟观察";
        $("verdictDesc").textContent = (isEn() ? dirtyPrefixEn : dirtyPrefixZh) + (isEn()
          ? ("Verified only over pre-registered OOS range (" + oos.oosRange.start + " → " + oos.oosRange.end + ") under modeled fees; not a live trading permit.")
          : ("仅在预注册样本外区间（" + oos.oosRange.start + " → " + oos.oosRange.end + "）与指定费率条件下满足初步门槛，不代表可实盘使用。"));
      } else {
        $("ruleScopePill").className = "scope-chip warn";
        $("ruleScopePill").textContent = isEn() ? "Current Rule: Unverified" : "当前规则：未验证";
        $("verdictTitle").textContent = isEn() ? "Current Rule Unverified" : "当前规则尚未验证";
        $("verdictDesc").textContent = (isEn() ? dirtyPrefixEn : dirtyPrefixZh) + (isEn()
          ? ("Pre-registered candidate (" + candName + ") passed preliminary OOS checks, which does not validate your custom parameters.")
          : ("预注册固定候选（" + candName + "）虽通过初步检验，但不能证明当前自定义参数有效。历史模拟，不是买卖信号。"));
      }
    }

    // B. 更新样本外证据卡片与顶部 OOS 徽章
    if (oosStatus === "pending" || !oos) {
      $("oosScopePill").className = "scope-chip";
      $("oosScopePill").textContent = isEn() ? "Pre-Reg Study: Pending" : "预注册研究：待验证";
      $("oosSummaryBadge").className = "status-badge warn num";
      $("oosSummaryBadgeText").textContent = isEn() ? "Pending" : "待验证";
      $("oosWinRateVal").textContent = isEn() ? "Pending" : "待验证";
      $("oosWinRateVal").className = "";
      $("oosWinRateSub").textContent = isEn() ? "Computing 24M rolling OOS…" : "正在后台计算样本外窗口…";
      $("oosMedianVal").textContent = isEn() ? "Pending" : "待验证";
      $("oosMedianVal").className = "";
      $("oosMedianSub").textContent = isEn() ? "Train 2013–2020 locked" : "训练期 2013–2020 锁定候选";
      $("oosEvidenceNote").textContent = isEn()
        ? "Evaluating pre-registered candidate on 2021–end out-of-sample rolling windows in the background."
        : "正在后台验证预注册候选在样本外区间（2021–末日）的 24 个月重叠滚动窗口表现。";
      $("nextStepText").textContent = isEn()
        ? "Keep long-term holding and DCA as your research baseline; no live buy/sell orders are generated."
        : "保持长期持有与定投为研究基准；不生成实盘买卖指令。";
      return;
    }

    var roll24 = oos.selectedOosRolling24m;
    var winPctText = roll24 ? ((roll24.winRate * 100).toFixed(2) + "%") : "--";
    var medPctText = roll24 ? fmtPct(roll24.medianExcessPct, 2, true) : "--";

    if (oos.researchGatePassed) {
      $("oosScopePill").className = "scope-chip ok";
      $("oosScopePill").textContent = isEn() ? "Pre-Reg Study: Passed (Sim)" : "预注册研究：通过（仅模拟）";
      $("oosSummaryBadge").className = "status-badge ok num";
      $("oosSummaryBadgeText").textContent = isEn() ? "Gate Met (Sim)" : "初步通过（仅模拟）";
    } else {
      $("oosScopePill").className = "scope-chip warn";
      $("oosScopePill").textContent = isEn() ? "Pre-Reg Study: Not Passed" : "预注册研究：未通过";
      $("oosSummaryBadge").className = "status-badge warn num";
      $("oosSummaryBadgeText").textContent = isEn() ? "Gate Not Met" : "未通过门槛";
    }

    $("oosWinRateVal").textContent = winPctText;
    $("oosWinRateVal").className = roll24 && roll24.winRate > 0.5 ? "up" : (roll24 && roll24.winRate < 0.5 ? "dn" : "");
    $("oosWinRateSub").textContent = isEn()
      ? (candName + " · " + (roll24 ? roll24.oosSampleCount : 0) + " overlapping windows")
      : (candName + " · 共 " + (roll24 ? roll24.oosSampleCount : 0) + " 个重叠月窗口");

    $("oosMedianVal").textContent = medPctText;
    $("oosMedianVal").className = roll24 && roll24.medianExcessPct > 1e-9 ? "up" : (roll24 && roll24.medianExcessPct < -1e-9 ? "dn" : "");
    $("oosMedianSub").textContent = oos.oosRange.start + " → " + oos.oosRange.end;

    var curBandPct = Number((cfg.tradeRatio * 100).toFixed(1)) + "%";
    if (!matched) {
      $("oosEvidenceNote").textContent = isEn()
        ? ("Pre-registered training (2013–2020) selected \"" + candName + "\". Over OOS (" + oos.oosRange.start + " → " + oos.oosRange.end + "), its 24M overlapping rolling win rate is " + winPctText + " with median excess " + medPctText + ". This is NOT the win rate of your current " + curBandPct + " setting.")
        : ("预注册训练期（2013–2020）选出「" + candName + "」，在样本外（" + oos.oosRange.start + " → " + oos.oosRange.end + "）24 月重叠滚动跑赢率为 " + winPctText + "，中位超额 " + medPctText + "。这不是当前 " + curBandPct + " 规则的胜率，重叠窗口也不等于独立周期概率。");
    } else {
      $("oosEvidenceNote").textContent = isEn()
        ? ("Current rule matches pre-registered candidate \"" + candName + "\" (OOS " + oos.oosRange.start + " → " + oos.oosRange.end + "). Monthly windows overlap in time and do not represent independent cycles.")
        : ("当前规则匹配预注册候选「" + candName + "」（样本外 " + oos.oosRange.start + " → " + oos.oosRange.end + "）。按月滚动窗口存在时间重叠，跑赢率不等于独立周期胜率。");
    }

    if (!oos.researchGatePassed || !matched || cfg.tradeRatio === 0) {
      $("nextStepText").textContent = isEn()
        ? "Keep long-term holding and DCA as your research baseline; no live buy/sell orders are generated."
        : "保持长期持有与定投为研究基准；不生成实盘买卖指令。";
    } else {
      $("nextStepText").textContent = isEn()
        ? "Simulation observation only; keep disciplined holding/DCA baseline and never treat historical backtests as live orders."
        : "仅作历史模拟观察；保持长期持有与定投纪律，不生成实盘买卖指令。";
    }
  }

  // ==================== 后台样本外检验（OOS）调度 ====================
  function ensureOosEvaluation(token) {
    if (!state.norm) return;
    var oosKey = buildOosCacheKey(state.norm);
    if (state.oosState.status === "ready" && state.oosState.key === oosKey && state.oosState.data) {
      renderOverviewVerdictAndEvidence();
      if (state.viewMode === "research" && $("secResearchVerify") && $("secResearchVerify").open) {
        renderOosTableInResearch(state.oosState.data);
      }
      return;
    }

    state.oosState = { status: "pending", key: oosKey, data: null };
    renderOverviewVerdictAndEvidence();

    scheduleBackgroundTask({
      task: "oos",
      calcToken: token,
      cacheKey: oosKey,
      norm: state.norm,
      options: {},
      onDone: function (res, key) {
        if (!state.norm || buildOosCacheKey(state.norm) !== key) return;
        state.oosState = { status: "ready", key: key, data: res };
        renderOverviewVerdictAndEvidence();
        if (state.viewMode === "research" && $("secResearchVerify") && $("secResearchVerify").open) {
          renderOosTableInResearch(res);
        }
      },
      onError: function () {
        if (!state.norm || buildOosCacheKey(state.norm) !== oosKey) return;
        state.oosState = { status: "unavailable", key: oosKey, data: null };
        renderOverviewVerdictAndEvidence();
      }
    });
  }

  // ==================== Canvas 高清绘图（确保可见且宽高非零时才绘制） ====================
  function setupCanvas(canvas) {
    if (!canvas || !canvas.parentElement) return null;
    var rect = canvas.parentElement.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 20) return null;
    var w = Math.floor(rect.width);
    var h = Math.floor(rect.height);
    var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: h };
  }

  function cssVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function drawSingleCurveCanvas(canvasId, tipId, bt, forceEqMode, hoverIdx) {
    var cv = $(canvasId);
    if (!bt || !bt.ok || !bt.curve || bt.curve.length < 2 || !cv) return;
    var setup = setupCanvas(cv);
    if (!setup) return;

    var ctx = setup.ctx;
    var W = setup.w;
    var H = setup.h;
    ctx.clearRect(0, 0, W, H);

    var curve = bt.curve;
    var n = curve.length;
    var useEq = forceEqMode ? true : (state.chartMode === "eq");

    var ink = cssVar("--ink", "#11141a");
    var ink3 = cssVar("--ink3", "#6b7280");
    var hair = cssVar("--hair", "rgba(128,128,128,0.15)");
    var blue = cssVar("--blue", "#2563eb");
    var green = cssVar("--green", "#15803d");
    var red = cssVar("--red", "#dc2626");
    var amber = cssVar("--amber", "#b45309");

    var padL = 56;
    var padR = 12;
    var padT = 14;
    var padB = 22;
    var plotW = Math.max(40, W - padL - padR);
    var plotH = Math.max(40, H - padT - padB);

    var minY = Infinity;
    var maxY = -Infinity;
    for (var i = 0; i < n; i++) {
      var vVal = useEq ? curve[i].eqBTC : curve[i].heldBTC;
      var bVal = useEq ? curve[i].baselineEqBTC : curve[i].baselineHeldBTC;
      if (vVal < minY) minY = vVal;
      if (bVal < minY) minY = bVal;
      if (vVal > maxY) maxY = vVal;
      if (bVal > maxY) maxY = bVal;
    }
    var spanY = maxY - minY;
    if (!(spanY > 1e-9)) {
      var padFlat = Math.max(0.005, maxY * 0.03);
      minY = Math.max(0, minY - padFlat);
      maxY = maxY + padFlat;
    } else {
      minY = Math.max(0, minY - spanY * 0.10);
      maxY = maxY + spanY * 0.10;
    }

    function xAt(idx) {
      return padL + (idx / (n - 1)) * plotW;
    }
    function yAt(val) {
      return padT + (1 - (val - minY) / (maxY - minY)) * plotH;
    }

    ctx.font = '11.5px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
    ctx.textBaseline = "middle";
    for (var g = 0; g <= 3; g++) {
      var gyVal = minY + (g / 3) * (maxY - minY);
      var gy = yAt(gyVal);
      ctx.strokeStyle = hair;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, gy);
      ctx.lineTo(W - padR, gy);
      ctx.stroke();

      ctx.fillStyle = ink3;
      ctx.textAlign = "right";
      ctx.fillText(gyVal.toFixed(gyVal >= 1 ? 3 : 4), padL - 6, gy);
    }

    ctx.textBaseline = "top";
    var tickIndices = [0, Math.floor((n - 1) * 0.33), Math.floor((n - 1) * 0.66), n - 1];
    for (var ti = 0; ti < tickIndices.length; ti++) {
      var tIdx = tickIndices[ti];
      var tx = xAt(tIdx);
      ctx.fillStyle = ink3;
      ctx.textAlign = ti === 0 ? "left" : (ti === tickIndices.length - 1 ? "right" : "center");
      ctx.fillText(curve[tIdx].date.slice(0, 7), tx, H - padB + 5);
    }

    // 基准虚线
    ctx.save();
    ctx.strokeStyle = blue;
    ctx.lineWidth = 1.7;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    for (var bi = 0; bi < n; bi++) {
      var bx = xAt(bi);
      var by = yAt(useEq ? curve[bi].baselineEqBTC : curve[bi].baselineHeldBTC);
      if (bi === 0) ctx.moveTo(bx, by);
      else ctx.lineTo(bx, by);
    }
    ctx.stroke();
    ctx.restore();

    // 波段实线
    ctx.strokeStyle = ink;
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    for (var vi = 0; vi < n; vi++) {
      var vx = xAt(vi);
      var vy = yAt(useEq ? curve[vi].eqBTC : curve[vi].heldBTC);
      if (vi === 0) ctx.moveTo(vx, vy);
      else ctx.lineTo(vx, vy);
    }
    ctx.stroke();

    // 买卖执行标记点
    var dateToIdx = Object.create(null);
    for (var di = 0; di < n; di++) {
      dateToIdx[curve[di].date] = di;
    }
    for (var trIdx = 0; trIdx < bt.trades.length; trIdx++) {
      var trd = bt.trades[trIdx];
      if (trd.lotId === "DCA") continue;
      var cIdx = dateToIdx[trd.executionDay];
      if (cIdx === undefined) continue;
      var mx = xAt(cIdx);
      var my = yAt(useEq ? curve[cIdx].eqBTC : curve[cIdx].heldBTC);
      ctx.beginPath();
      if (trd.action === "SELL") {
        ctx.fillStyle = red;
        ctx.arc(mx, my, 3.2, 0, Math.PI * 2);
      } else if (trd.action === "BUYBACK_TIER") {
        ctx.fillStyle = green;
        ctx.arc(mx, my, 3.2, 0, Math.PI * 2);
      } else {
        ctx.fillStyle = amber;
        ctx.rect(mx - 2.8, my - 2.8, 5.6, 5.6);
      }
      ctx.fill();
    }

    var tip = $(tipId);
    if (hoverIdx >= 0 && hoverIdx < n) {
      var hPt = curve[hoverIdx];
      var hx = xAt(hoverIdx);
      var hy = yAt(useEq ? hPt.eqBTC : hPt.heldBTC);
      ctx.strokeStyle = ink3;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hx, padT);
      ctx.lineTo(hx, H - padB);
      ctx.stroke();

      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.arc(hx, hy, 4, 0, Math.PI * 2);
      ctx.fill();

      if (tip) {
        tip.hidden = false;
        tip.textContent = hPt.date + " · " + fmtUsd(hPt.price, 0) + " · "
          + (isEn() ? "Base " : "基准 ") + hPt.baselineEqBTC.toFixed(6) + " · "
          + (isEn() ? "Held " : "实持 ") + hPt.heldBTC.toFixed(6) + " · "
          + (isEn() ? "Cash " : "现金 ") + fmtUsd(hPt.totalCashUSD, 0) + " · "
          + "eqBTC " + hPt.eqBTC.toFixed(6);
      }
    } else if (tip) {
      tip.hidden = true;
    }
  }

  function drawResearchCharts() {
    var bt = state.bt;
    if (!bt || !bt.ok || !bt.curve || bt.curve.length < 2) return;
    if (state.viewMode !== "research" || !$("secResearchRisk") || !$("secResearchRisk").open) return;

    var useEq = state.chartMode === "eq";
    $("legBaseText").textContent = isEn()
      ? (useEq ? "Baseline eqBTC" : "Baseline Held BTC")
      : (useEq ? "基准等价 BTC" : "基准实际持仓");
    $("legVheText").textContent = isEn()
      ? (useEq ? "Swing eqBTC" : "Swing Actual BTC")
      : (useEq ? "波段等价 BTC" : "波段实际持仓");

    drawSingleCurveCanvas("mainChartCanvas", "mainChartTip", bt, false, state.resHoverIdx);

    var cashCv = $("cashChartCanvas");
    var cSetup = setupCanvas(cashCv);
    if (!cSetup) return;

    var cctx = cSetup.ctx;
    var CW = cSetup.w;
    var CH = cSetup.h;
    cctx.clearRect(0, 0, CW, CH);

    var curve = bt.curve;
    var n = curve.length;
    var padL = 56;
    var padR = 12;
    var cPadT = 12;
    var cPadB = 18;
    var plotW = Math.max(40, CW - padL - padR);
    var cPlotH = Math.max(30, CH - cPadT - cPadB);

    var ink3 = cssVar("--ink3", "#6b7280");
    var hair = cssVar("--hair", "rgba(128,128,128,0.15)");
    var amber = cssVar("--amber", "#b45309");

    var maxCash = 0;
    for (var ci = 0; ci < n; ci++) {
      if (curve[ci].totalCashUSD > maxCash) maxCash = curve[ci].totalCashUSD;
    }
    var yCashMax = maxCash > 1 ? maxCash * 1.12 : 100;

    function xAt(idx) {
      return padL + (idx / (n - 1)) * plotW;
    }
    function yCashAt(v) {
      return cPadT + (1 - Math.min(1, Math.max(0, v / yCashMax))) * cPlotH;
    }

    cctx.strokeStyle = hair;
    cctx.lineWidth = 1;
    cctx.beginPath();
    cctx.moveTo(padL, yCashAt(0));
    cctx.lineTo(CW - padR, yCashAt(0));
    cctx.moveTo(padL, cPadT);
    cctx.lineTo(CW - padR, cPadT);
    cctx.stroke();

    cctx.font = '11px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
    cctx.fillStyle = ink3;
    cctx.textAlign = "right";
    cctx.textBaseline = "middle";
    cctx.fillText("$0", padL - 6, yCashAt(0));
    cctx.fillText(maxCash >= 1000 ? ("$" + (maxCash / 1000).toFixed(1) + "K") : fmtUsd(maxCash, 0), padL - 6, cPadT + 3);

    cctx.textAlign = "left";
    cctx.fillText(isEn() ? "Pending & Reserve Cash (USD)" : "待回购与外部留存现金 (USD)", padL + 4, cPadT + 4);

    if (maxCash > 0.01) {
      cctx.beginPath();
      cctx.moveTo(xAt(0), yCashAt(0));
      for (var ai = 0; ai < n; ai++) {
        cctx.lineTo(xAt(ai), yCashAt(curve[ai].totalCashUSD));
      }
      cctx.lineTo(xAt(n - 1), yCashAt(0));
      cctx.closePath();
      cctx.fillStyle = cssVar("--amber-soft", "rgba(180,83,9,0.16)");
      cctx.fill();

      cctx.strokeStyle = amber;
      cctx.lineWidth = 1.5;
      cctx.beginPath();
      for (var li = 0; li < n; li++) {
        var cx = xAt(li);
        var cy = yCashAt(curve[li].totalCashUSD);
        if (li === 0) cctx.moveTo(cx, cy);
        else cctx.lineTo(cx, cy);
      }
      cctx.stroke();
    }

    if (state.resHoverIdx >= 0 && state.resHoverIdx < n) {
      var chx = xAt(state.resHoverIdx);
      cctx.strokeStyle = ink3;
      cctx.lineWidth = 1;
      cctx.beginPath();
      cctx.moveTo(chx, cPadT);
      cctx.lineTo(chx, CH - cPadB);
      cctx.stroke();
    }
  }

  // ==================== 策略研究模式：按需同步可见子区 ====================
  function syncVisibleResearchSections(token) {
    if (state.viewMode !== "research") return;
    if (!state.norm || !state.bt || !state.bt.ok) return;
    var activeToken = token !== undefined ? token : state.calcToken;

    if ($("secResearchRisk") && $("secResearchRisk").open) {
      renderRiskAndExecutionSection(state.bt);
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(drawResearchCharts);
      } else {
        drawResearchCharts();
      }
    }

    if ($("secResearchTrades") && $("secResearchTrades").open) {
      renderTradeTablePaginated(state.bt);
    }

    if ($("secResearchVerify") && $("secResearchVerify").open) {
      ensureVerifySectionComputed(activeToken);
    }
  }

  // 子区 2：策略验证（矩阵 + 滚动 + OOS，明确各自时间作用域与未通过原因）
  function ensureVerifySectionComputed(token) {
    if (!state.norm || !state.bt || !state.bt.ok) return;
    var bt = state.bt;
    var effMonthly = state.config.monthlyUSD > 0 ? state.config.monthlyUSD : 500;

    $("matrixScopeNote").textContent = isEn()
      ? ("Scope: Selected window (" + bt.metrics.startDay + " → " + bt.metrics.endDay + ") · Initial " + state.config.initialBTC + " BTC · Fee " + (state.config.feeRate * 100).toFixed(2) + "% + Slip " + (state.config.slippageRate * 100).toFixed(2) + "%")
      : ("作用域：当前选定起止日（" + bt.metrics.startDay + " → " + bt.metrics.endDay + "）· 起始 " + state.config.initialBTC + " BTC · 费率 " + (state.config.feeRate * 100).toFixed(2) + "% + 滑点 " + (state.config.slippageRate * 100).toFixed(2) + "%");

    $("rollingScopeNote").textContent = isEn()
      ? ("Scope: Full verified history (" + state.norm.meta.firstDay + " → " + state.norm.meta.lastDay + ") · Uses current strategy rule across monthly starts (not restricted to single start/end above)")
      : ("作用域：全历史有效区间（" + state.norm.meta.firstDay + " → " + state.norm.meta.lastDay + "）· 按当前规则跨月滚动，不受上方单一起止日限制");

    $("oosScopeNote").textContent = isEn()
      ? ("Scope: Fixed pre-registered split (Train 2013-09-01→2020-12-31 · OOS 2021-01-01→" + state.norm.meta.lastDay + ") · Independent of custom parameters; never reverse-picks OOS winners.")
      : ("作用域：固定预注册切分（训练 2013-09-01→2020-12-31 · 样本外 2021-01-01→" + state.norm.meta.lastDay + "）· 不随上方自定义参数变动，禁止按样本外赢家反选模型。");

    // 1. 矩阵
    var matKey = buildMatrixCacheKey(state.norm, bt, state.activeBatch, effMonthly);
    if (state.matrixCache.status === "ready" && state.matrixCache.key === matKey && state.matrixCache.data) {
      renderMatrixTable(state.matrixCache.data);
    } else {
      state.matrixCache = { status: "pending", key: matKey, data: null };
      $("verifyFoldMeta").textContent = isEn() ? "Computing…" : "正在计算…";
      $("matrixTableBody").innerHTML = '<tr><td colspan="8" class="tbl-empty">' + (isEn() ? "Computing same-cashflow matrix…" : "正在后台计算同现金流策略矩阵…") + "</td></tr>";
      var overrides = {
        start: bt.metrics.startDay,
        end: state.config.end || null,
        initialBTC: state.config.initialBTC,
        feeRate: state.config.feeRate,
        slippageRate: state.config.slippageRate,
        monthlyUSD: effMonthly
      };
      scheduleBackgroundTask({
        task: "matrix",
        calcToken: token,
        cacheKey: matKey,
        norm: state.norm,
        activeBatch: state.activeBatch,
        overrides: overrides,
        onDone: function (res, key, jobToken) {
          if (jobToken !== state.calcToken || !state.bt || !state.bt.ok) return;
          if (buildMatrixCacheKey(state.norm, state.bt, state.activeBatch, effMonthly) !== key) return;
          state.matrixCache = { status: "ready", key: key, data: res };
          renderMatrixTable(res);
          updateVerifyFoldMeta();
        },
        onError: function () {
          $("matrixTableBody").innerHTML = '<tr><td colspan="8" class="tbl-empty">' + (isEn() ? "Calculation failed" : "计算未完成") + "</td></tr>";
        }
      });
    }

    // 2. 全历史滚动
    var rollKey = buildRollingCacheKey(state.norm, bt.config);
    if (state.rollingCache.status === "ready" && state.rollingCache.key === rollKey && state.rollingCache.data) {
      renderRollingWindowBlock(state.rollingCache.data);
    } else {
      state.rollingCache = { status: "pending", key: rollKey, data: null };
      $("verifyFoldMeta").textContent = isEn() ? "Computing…" : "正在计算…";
      $("rollingKpiGrid").innerHTML = '<article class="kpi"><small>' + (isEn() ? "Rolling Check" : "滚动窗口检验") + '</small><b class="num">' + (isEn() ? "Computing…" : "正在计算…") + "</b><span>24 / 36 / 48M</span></article>";
      scheduleBackgroundTask({
        task: "rolling",
        calcToken: token,
        cacheKey: rollKey,
        norm: state.norm,
        config: bt.config,
        windows: [24, 36, 48],
        onDone: function (res, key, jobToken) {
          if (jobToken !== state.calcToken || !state.bt || !state.bt.ok) return;
          if (buildRollingCacheKey(state.norm, state.bt.config) !== key) return;
          state.rollingCache = { status: "ready", key: key, data: res };
          renderRollingWindowBlock(res);
          updateVerifyFoldMeta();
        },
        onError: function () {
          $("rollingKpiGrid").innerHTML = "";
        }
      });
    }

    // 3. 预注册 OOS 表
    if (state.oosState.status === "ready" && state.oosState.data) {
      renderOosTableInResearch(state.oosState.data);
    } else {
      $("oosGateExplainBox").textContent = isEn() ? "Verifying pre-registered out-of-sample trials…" : "正在后台验证预注册样本外候选…";
      $("oosTableBody").innerHTML = '<tr><td colspan="6" class="tbl-empty">' + (isEn() ? "Pending" : "待验证") + "</td></tr>";
      ensureOosEvaluation(token);
    }
    updateVerifyFoldMeta();
  }

  function updateVerifyFoldMeta() {
    if (state.matrixCache.status === "pending" || state.rollingCache.status === "pending" || state.oosState.status === "pending") {
      $("verifyFoldMeta").textContent = isEn() ? "Computing…" : "正在计算…";
      return;
    }
    if (state.rollingCache.status === "ready" && state.rollingCache.data && state.rollingCache.data.ok) {
      var cur = state.rollingCache.data.results.find(function (r) { return r.windowMonths === state.rollingMonths; }) || state.rollingCache.data.results[0];
      if (cur) {
        $("verifyFoldMeta").textContent = cur.windowMonths + (isEn() ? "M win " : "月跑赢 ") + (cur.winRate * 100).toFixed(1) + "%";
        return;
      }
    }
    $("verifyFoldMeta").textContent = isEn() ? "Ready" : "已就绪";
  }

  function renderMatrixTable(mat) {
    var tbody = $("matrixTableBody");
    if (!mat || !mat.ok) {
      tbody.innerHTML = '<tr><td colspan="8" class="tbl-empty">' + (isEn() ? "Unavailable" : "暂不可用") + "</td></tr>";
      return;
    }
    tbody.innerHTML = mat.items.map(function (it, idx) {
      var m = it.metrics;
      var diffCls = it.vsGroupRefEqBTC > 1e-10 ? "up" : (it.vsGroupRefEqBTC < -1e-10 ? "dn" : "");
      var vText = idx === 0
        ? (isEn() ? "Group Baseline" : "本组对照基准")
        : (it.vsGroupRefEqBTC > 1e-10
          ? (isEn() ? "1-Win Ahead (Unverified)" : "单窗领先（非保证）")
          : (isEn() ? "Trailed Baseline" : "单窗落后基准"));
      var isCurrent = state.bt && state.bt.ok && it.configHash === state.bt.config.hash;
      return '<tr class="clickable' + (isCurrent ? " active-row" : "") + '" data-strat-idx="' + idx + '">'
        + "<td><b>" + escHtml(isEn() ? it.labelEn : it.labelZh) + "</b></td>"
        + '<td class="r">' + m.heldBTC.toFixed(6) + "</td>"
        + '<td class="r">' + fmtUsd(m.totalCashUSD, 0) + "</td>"
        + '<td class="r">' + m.eqBTC.toFixed(6) + "</td>"
        + '<td class="r ' + diffCls + '">' + (idx === 0 ? "0.00%" : fmtPct(it.vsGroupRefEqPct, 2, true)) + "</td>"
        + '<td class="r">' + MINUS + (m.maxEqBtcDrawdown * 100).toFixed(2) + "%</td>"
        + '<td class="r">' + m.failedCycles + "</td>"
        + "<td>" + escHtml(vText) + "</td>"
        + "</tr>";
    }).join("");
  }

  function renderRollingWindowBlock(rollRes) {
    if (!rollRes || !rollRes.ok) return;
    var curRoll = rollRes.results.find(function (r) { return r.windowMonths === state.rollingMonths; }) || rollRes.results[0];
    if (!curRoll) return;
    var wWorst = curRoll.worstWindow
      ? (fmtPct(curRoll.worstWindow.excessPct, 2, true) + " (" + curRoll.worstWindow.start.slice(0, 7) + ")")
      : "--";
    $("rollingKpiGrid").innerHTML = [
      [isEn() ? "Win Share (Overlapping)" : "跑赢基准窗口占比", (curRoll.winRate * 100).toFixed(1) + "%", curRoll.winCount + " / " + curRoll.sampleCount + (isEn() ? " starts" : " 个月起点")],
      [isEn() ? "Median Excess eqBTC" : "中位相对超额", fmtPct(curRoll.medianExcessPct, 2, true), fmtSignedNum(curRoll.medianExcessBTC, 6, " BTC")],
      [isEn() ? "Worst Lagging Window" : "最差落后窗口", wWorst, (isEn() ? "Open cash windows: " : "含未回购现金窗口：") + curRoll.openCashWindowCount],
      [isEn() ? "Rolling Summary" : "全历史滚动结论", curRoll.proven ? (isEn() ? "Median Positive" : "中位超额为正") : (isEn() ? "Unproven" : "未证明增币能力"), isEn() ? "Overlapping != independent" : "重叠样本不等于独立胜率"]
    ].map(function (c) {
      return '<article class="kpi"><small>' + escHtml(c[0]) + '</small><b class="num">' + escHtml(c[1]) + '</b><span class="num">' + escHtml(c[2]) + "</span></article>";
    }).join("");

    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(function () { drawRollingBars(curRoll); });
    } else {
      drawRollingBars(curRoll);
    }
  }

  function drawRollingBars(curRoll) {
    if (state.viewMode !== "research" || !$("secResearchVerify") || !$("secResearchVerify").open) return;
    var cv = $("rollingChartCanvas");
    if (!cv || !curRoll || !curRoll.samples || curRoll.samples.length === 0) return;
    var setup = setupCanvas(cv);
    if (!setup) return;
    var ctx = setup.ctx;
    var W = setup.w;
    var H = setup.h;
    ctx.clearRect(0, 0, W, H);

    var samples = curRoll.samples;
    var n = samples.length;
    var padL = 48;
    var padR = 10;
    var padT = 12;
    var padB = 20;
    var plotW = Math.max(40, W - padL - padR);
    var plotH = Math.max(40, H - padT - padB);

    var maxAbs = 0.02;
    for (var i = 0; i < n; i++) {
      var a = Math.abs(samples[i].excessPct);
      if (a > maxAbs) maxAbs = a;
    }
    maxAbs *= 1.12;

    var zeroY = padT + plotH / 2;
    var ink3 = cssVar("--ink3", "#6b7280");
    var hair = cssVar("--hair", "rgba(128,128,128,0.18)");
    var green = cssVar("--green", "#15803d");
    var red = cssVar("--red", "#dc2626");

    ctx.strokeStyle = hair;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(W - padR, padT);
    ctx.moveTo(padL, zeroY);
    ctx.lineTo(W - padR, zeroY);
    ctx.moveTo(padL, padT + plotH);
    ctx.lineTo(W - padR, padT + plotH);
    ctx.stroke();

    ctx.font = '11px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
    ctx.fillStyle = ink3;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText("+" + (maxAbs * 100).toFixed(1) + "%", padL - 5, padT + 2);
    ctx.fillText("0%", padL - 5, zeroY);
    ctx.fillText(MINUS + (maxAbs * 100).toFixed(1) + "%", padL - 5, padT + plotH - 2);

    var step = plotW / n;
    var barW = Math.max(1.2, step * 0.76);
    for (var k = 0; k < n; k++) {
      var v = samples[k].excessPct;
      var bx = padL + k * step;
      var bh = (Math.abs(v) / maxAbs) * (plotH / 2);
      ctx.fillStyle = v >= 0 ? green : red;
      if (v >= 0) {
        ctx.fillRect(bx, zeroY - bh, barW, Math.max(1, bh));
      } else {
        ctx.fillRect(bx, zeroY, barW, Math.max(1, bh));
      }
    }

    ctx.textBaseline = "top";
    ctx.fillStyle = ink3;
    ctx.textAlign = "left";
    ctx.fillText(samples[0].start.slice(0, 7), padL, H - padB + 4);
    ctx.textAlign = "right";
    ctx.fillText(samples[n - 1].start.slice(0, 7), W - padR, H - padB + 4);
  }

  function renderOosTableInResearch(oos) {
    if (!oos || !oos.ok) {
      $("oosGateExplainBox").textContent = isEn() ? "Unavailable" : "暂不可用";
      $("oosTableBody").innerHTML = '<tr><td colspan="6" class="tbl-empty">' + (isEn() ? "Unavailable" : "暂不可用") + "</td></tr>";
      return;
    }

    var selId = oos.trainSelectedCandidateId;
    var selName = getCandidateDisplayName(selId);
    var selTrial = oos.trials.find(function (t) { return t.id === selId; });
    var r24 = oos.selectedOosRolling24m;

    // 明确列出选出的候选及通过/未通过的具体原因，严禁拿样本外赢家反推模型
    var reasonsZh = [];
    var reasonsEn = [];
    if (selTrial && r24) {
      if (!(selTrial.oosExcessPct > 0)) {
        reasonsZh.push("样本外整段超额 " + fmtPct(selTrial.oosExcessPct, 2, true) + "（需 > 0%）");
        reasonsEn.push("full OOS excess " + fmtPct(selTrial.oosExcessPct, 2, true) + " (needs > 0%)");
      }
      if (!(selTrial.oosHighFeeExcessPct > 0)) {
        reasonsZh.push("高压费率超额 " + fmtPct(selTrial.oosHighFeeExcessPct, 2, true) + "（需 > 0%）");
        reasonsEn.push("high-fee OOS excess " + fmtPct(selTrial.oosHighFeeExcessPct, 2, true) + " (needs > 0%)");
      }
      if (!(r24.medianExcessPct > 0)) {
        reasonsZh.push("24 月滚动中位超额 " + fmtPct(r24.medianExcessPct, 2, true) + "（需 > 0%）");
        reasonsEn.push("24M rolling median excess " + fmtPct(r24.medianExcessPct, 2, true) + " (needs > 0%)");
      }
      if (!(r24.winRate > 0.5)) {
        reasonsZh.push("24 月滚动跑赢率 " + (r24.winRate * 100).toFixed(2) + "%（需 > 50%）");
        reasonsEn.push("24M rolling win share " + (r24.winRate * 100).toFixed(2) + "% (needs > 50%)");
      }
    }

    if (oos.researchGatePassed) {
      $("oosGateExplainBox").textContent = isEn()
        ? ("Train-selected candidate: \"" + selName + "\". Passed preliminary OOS criteria (simulation observation only, not live trading advice).")
        : ("训练期选出候选：「" + selName + "」。已满足四项初步样本外门槛（仅作模拟观察，不构成实盘许可）。");
    } else {
      $("oosGateExplainBox").textContent = isEn()
        ? ("Train-selected candidate: \"" + selName + "\". Gate NOT passed because: " + reasonsEn.join("; ") + ". Other rows with higher OOS numbers lost more in training and must NOT be cherry-picked ex-post.")
        : ("训练期选出候选：「" + selName + "」。未通过门槛原因：" + reasonsZh.join("；") + "。表中样本外数值较高的其他候选在训练期表现更差，严禁事后按测试集赢家反选模型。");
    }

    $("oosTableBody").innerHTML = oos.trials.map(function (t) {
      var isSel = t.id === selId;
      var tag = isSel ? (isEn() ? " [Train-Selected]" : " [训练期选出]") : "";
      return "<tr" + (isSel ? ' class="active-row"' : "") + ">"
        + "<td><b>" + escHtml(getCandidateDisplayName(t.id) + tag) + "</b></td>"
        + '<td class="r">' + fmtPct(t.trainExcessPct, 2, true) + "</td>"
        + '<td class="r ' + (t.oosExcessPct > 0 ? "up" : (t.oosExcessPct < 0 ? "dn" : "")) + '">' + fmtPct(t.oosExcessPct, 2, true) + "</td>"
        + '<td class="r">' + fmtPct(t.oosHighFeeExcessPct, 2, true) + "</td>"
        + '<td class="r">' + fmtUsd(t.oosCashUSD, 0) + "</td>"
        + '<td class="r">' + MINUS + (t.oosMaxDrawdownBTC * 100).toFixed(2) + "%</td>"
        + "</tr>";
    }).join("");
  }

  // 子区 3：风险与执行（KPI、诊断行、未知成本标注「未填写」、子仓与失败记录）
  function renderRiskAndExecutionSection(bt) {
    var m = bt.metrics;
    var baseName = translateBaselineLabel(bt.config, false);

    var expHeld = Math.max(0, m.heldBTC - m.coreBTC);
    $("kpiHeldVal").textContent = m.heldBTC.toFixed(6) + " BTC";
    $("kpiHeldSub").textContent = isEn()
      ? ("Core " + m.coreBTC.toFixed(6) + " · Lots " + expHeld.toFixed(6) + " · Δ " + fmtSignedNum(m.netDiffHeldBTC, 6, ""))
      : ("核心 " + m.coreBTC.toFixed(6) + " · 子仓 " + expHeld.toFixed(6) + " · 较基准 " + fmtSignedNum(m.netDiffHeldBTC, 6, ""));

    $("kpiCashVal").textContent = fmtUsd(m.totalCashUSD, 2);
    var cashEqBtc = m.markPriceUSD > 0 ? m.totalCashUSD / m.markPriceUSD : 0;
    $("kpiCashSub").textContent = isEn()
      ? ("Buyback " + fmtUsd(m.pendingBuybackCashUSD, 0) + " · Reserve " + fmtUsd(m.externalReserveCashUSD, 0) + " (≈" + cashEqBtc.toFixed(6) + " BTC)")
      : ("待回购 " + fmtUsd(m.pendingBuybackCashUSD, 0) + " · 外部留存 " + fmtUsd(m.externalReserveCashUSD, 0) + "（折合 " + cashEqBtc.toFixed(6) + " BTC）");

    var eqEl = $("kpiEqVal");
    eqEl.textContent = m.eqBTC.toFixed(6) + " BTC";
    eqEl.className = "num " + (m.netDiffEqBTC > 1e-10 ? "up" : (m.netDiffEqBTC < -1e-10 ? "dn" : ""));
    $("kpiEqSub").textContent = (isEn() ? "vs Base " : "较基准 ") + fmtPct(m.netDiffEqPct, 2, true) + " (" + fmtSignedNum(m.netDiffEqBTC, 6, " BTC") + ")";

    $("kpiDdVal").textContent = MINUS + (m.maxEqBtcDrawdown * 100).toFixed(2) + "%";
    $("kpiDdSub").textContent = isEn()
      ? ("Unitized NAV · Gross sell-out loss " + m.soldOutLossBTC.toFixed(6) + " BTC")
      : ("份额化净值 · 累计卖飞损失 " + m.soldOutLossBTC.toFixed(6) + " BTC");

    // 未知起始成本明确显示「未填写」，不猜测成本
    var costTextHeld = m.costBasisKnown && m.netInvestedPerHeldBTC !== null
      ? fmtUsd(m.netInvestedPerHeldBTC, 0) + " / BTC"
      : (isEn() ? "Not entered (cost not guessed)" : "未填写（不猜测绝对成本）");
    var costTextEq = m.costBasisKnown && m.netInvestedPerEqBTC !== null
      ? fmtUsd(m.netInvestedPerEqBTC, 0) + " / eqBTC"
      : (isEn() ? "Not entered (cost not guessed)" : "未填写（不猜测绝对成本）");

    var rows = [
      [isEn() ? "Same-Cashflow Baseline eqBTC" : (baseName + " 期末等价 BTC"), m.baselineEqBTC.toFixed(6) + " BTC (" + fmtUsd(m.baselineCashUSD, 0) + ")"],
      [isEn() ? "VHE Fills / Completed / Failed Cycles" : "波段交易次数 / 完成回合 / 失败回合", m.vheTradeCount + " / " + m.completedCycles + " / " + m.failedCycles],
      [isEn() ? "Stop-Loss / Timeout Exits / Open Lots" : "止损回购 / 超时退出 / 未完成子仓", m.stopLossCount + " / " + m.timeoutExitCount + " / " + m.openLotsCount],
      [isEn() ? "Max Buyback Wait / End Pending Signals" : "最长等待天数 / 期末挂起未执行信号", m.maxWaitDays + (isEn() ? " d" : " 天") + " / " + m.pendingSignalsCount],
      [isEn() ? "Quote Fees + Est. Slippage" : "累计手续费 + 滑点折算（报价币）", fmtUsd(m.totalFeesUSD, 2) + " + " + fmtUsd(m.totalSlippageUSD, 2)],
      [isEn() ? "Period End Daily Ref Price" : "期末日参考价（非实时现价）", fmtUsd(m.markPriceUSD, 2) + " (" + m.endDay + ")"],
      [isEn() ? "Net Invested / Actual Held BTC" : "累计外部净投入 / 实际持仓 BTC", costTextHeld],
      [isEn() ? "Net Invested / eqBTC (Excl. Tax)" : "累计外部净投入 / 等价 eqBTC（不含税费）", costTextEq]
    ];
    $("diagKvGrid").innerHTML = rows.map(function (r) {
      return '<div class="kv-row"><span>' + escHtml(r[0]) + "</span><b>" + escHtml(r[1]) + "</b></div>";
    }).join("");

    var stateMapZh = {
      HOLDING: "持币待触发",
      PENDING_SELL: "T日信号挂起待卖",
      WAITING_BUYBACK: "空仓等待回购",
      PARTIAL_BUYBACK: "部分回购待完成"
    };
    var stateMapEn = {
      HOLDING: "Holding",
      PENDING_SELL: "Pending T+1 Sell",
      WAITING_BUYBACK: "Waiting Buyback",
      PARTIAL_BUYBACK: "Partial Buyback"
    };
    $("lotsGrid").innerHTML = bt.lots.map(function (L) {
      var isWait = L.state !== "HOLDING";
      var stLabel = isEn() ? (stateMapEn[L.state] || L.state) : (stateMapZh[L.state] || L.state);
      var tiersDone = L.tierFilled.filter(Boolean).length;
      var anchorLine = L.anchorPrice
        ? ((isEn() ? "Anchor " : "锚点 ") + fmtUsd(L.anchorPrice, 0) + " · " + (isEn() ? "Tiers " : "已成交档位 ") + tiersDone + "/3")
        : (isEn() ? ("Cross +" + Math.round(L.sellThreshold * 100) + "% above MA") : ("向上穿越 MA +" + Math.round(L.sellThreshold * 100) + "% 触发"));
      return '<div class="lot-card">'
        + '<div class="lot-top"><b>' + (isEn() ? "Lot " : "实验子仓 ") + escHtml(L.lotId) + " (+" + Math.round(L.sellThreshold * 100) + "%)</b>"
        + '<span class="lot-pill' + (isWait ? " wait" : "") + '">' + escHtml(stLabel) + "</span></div>"
        + '<div class="lot-meta">'
        + "<div>" + (isEn() ? "Held: " : "剩余持币：") + L.remainingBTC.toFixed(6) + " BTC · " + (isEn() ? "Cash: " : "待回购现金：") + fmtUsd(L.buybackCashUSD, 2) + "</div>"
        + "<div>" + escHtml(anchorLine) + "</div>"
        + "<div>" + (isEn() ? "To Core: +" : "累计转核心：+") + L.transferredToCoreBTC.toFixed(6) + " · " + (isEn() ? "vs Lot HODL: " : "较子仓持有：") + fmtSignedNum(L.netVsLotHodlBTC, 6, " BTC") + "</div>"
        + "</div></div>";
    }).join("");

    renderFailedAndOpenLots(bt);
  }

  function renderFailedAndOpenLots(bt) {
    var tbody = $("failedCyclesBody");
    var rows = [];

    for (var i = 0; i < bt.lots.length; i++) {
      var L = bt.lots[i];
      if (L.state === "WAITING_BUYBACK" || L.state === "PARTIAL_BUYBACK") {
        rows.push("<tr>"
          + '<td><b class="warn-txt">' + (isEn() ? ("Lot " + L.lotId + " · Open") : ("子仓 " + L.lotId + " · 未完成回购")) + "</b></td>"
          + "<td>" + escHtml((L.sellExecDay || "--") + " → " + bt.metrics.endDay) + "</td>"
          + '<td class="r">' + fmtUsd(L.anchorPrice, 0) + "</td>"
          + '<td class="r">--</td>'
          + '<td class="r">' + L.remainingBTC.toFixed(6) + "</td>"
          + '<td class="r warn-txt">' + (isEn() ? "Cash left " : "未回购现金 ") + fmtUsd(L.buybackCashUSD, 2) + "</td>"
          + "</tr>");
      }
    }

    var losing = bt.cycles.filter(function (c) { return c.netDeltaBTC < -1e-12; });
    for (var j = 0; j < losing.length; j++) {
      var c = losing[j];
      var tag = c.exitType === "STOP_LOSS_BUYBACK"
        ? (isEn() ? "Stop Exit" : "止损回购")
        : (c.exitType === "TIMEOUT_BUYBACK" ? (isEn() ? "Timeout" : "超时退出") : (isEn() ? "Fee Loss" : "费后净损"));
      rows.push("<tr>"
        + "<td><b>" + (isEn() ? "Lot " : "子仓 ") + escHtml(c.lotId) + " · " + escHtml(tag) + "</b></td>"
        + "<td>" + escHtml(c.sellExecDay + " → " + c.closeDay + " (" + c.waitDays + (isEn() ? "d)" : "天)")) + "</td>"
        + '<td class="r">' + fmtUsd(c.anchorPrice, 0) + "</td>"
        + '<td class="r">' + c.soldBTC.toFixed(6) + "</td>"
        + '<td class="r">' + c.repurchasedBTC.toFixed(6) + "</td>"
        + '<td class="r dn">' + fmtSignedNum(c.netDeltaBTC, 6, " BTC") + "</td>"
        + "</tr>");
    }

    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="tbl-empty">'
        + (isEn() ? "No failed cycles or open un-repurchased lots in this window." : "当前窗口内无失败回合或未完成待回购子仓。")
        + "</td></tr>";
    } else {
      tbody.innerHTML = rows.join("");
    }
  }

  // 子区 4：交易记录与数据（按执行时间升序排列 + 分页）
  function actionLabel(act) {
    if (isEn()) {
      if (act === "SELL") return "SELL";
      if (act === "BUYBACK_TIER") return "BUYBACK";
      if (act === "STOP_LOSS_BUYBACK") return "STOP BUYBACK";
      if (act === "TIMEOUT_BUYBACK") return "TIMEOUT BUY";
      if (act === "DCA_BUY") return "DCA BUY";
      return act;
    }
    if (act === "SELL") return "分批卖出";
    if (act === "BUYBACK_TIER") return "分层回购";
    if (act === "STOP_LOSS_BUYBACK") return "止损回购";
    if (act === "TIMEOUT_BUYBACK") return "超时回购";
    if (act === "DCA_BUY") return "外部定投买入";
    return act;
  }

  function formatTradeReason(t) {
    var r = String(t.reason || "");
    if (!isEn()) {
      if (r.indexOf("DCA_UNIFORM_") === 0) return "等额定投买入 (" + r.replace("DCA_UNIFORM_", "") + ")";
      if (r.indexOf("DCA_AHR999_") === 0) return "AHR999 动态定投 (" + r.replace("DCA_AHR999_", "") + ")";
      if (r === "INITIAL_CASH_DAY1_BUY") return "起始现金首日建仓";
      return r;
    }
    if (r.indexOf("DCA_UNIFORM_") === 0) return "Uniform DCA buy (" + r.replace("DCA_UNIFORM_", "") + ")";
    if (r.indexOf("DCA_AHR999_") === 0) return "AHR999 dynamic DCA (" + r.replace("DCA_AHR999_", "") + ")";
    if (r === "INITIAL_CASH_DAY1_BUY") return "Initial cash Day-1 buy";
    var mCross = /^偏离率向上穿越 (\+\d+%)（([^）]+)）$/.exec(r);
    if (mCross) return "Crossed MA " + mCross[1] + " (" + mCross[2] + ")";
    var mStop = /^较卖出成交锚点 (\$[\d.]+) 上涨 ≥([\d.]+%) 触发止损回购$/.exec(r);
    if (mStop) return "Rose ≥" + mStop[2] + " above anchor " + mStop[1] + " (stop buyback)";
    var mTime = /^等待回购满 (\d+) 天触发超时退出$/.exec(r);
    if (mTime) return "Waited " + mTime[1] + "d without full fill (timeout exit)";
    var mTier = /^较卖出成交锚点回撤达 ([^ ]+) 触发分层回购$/.exec(r);
    if (mTier) return "Drawdown hit " + mTier[1] + " vs sell anchor (tier buyback)";
    return r;
  }

  function renderTradeTablePaginated(bt) {
    var tbody = $("tradeTableBody");
    var pager = $("tradePager");
    if (!bt || !bt.ok) return;

    var list = bt.trades.filter(function (t) {
      if (state.tradeFilter === "sell") return t.action === "SELL";
      if (state.tradeFilter === "buy") return t.action !== "SELL";
      return true;
    }).slice().sort(function (a, b) {
      if (a.executionDay !== b.executionDay) return a.executionDay < b.executionDay ? -1 : 1;
      return (a.tradeId || 0) - (b.tradeId || 0);
    });

    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" class="tbl-empty">'
        + (isEn() ? "No simulated trades under current filter." : "当前筛选条件下无模拟成交记录。")
        + "</td></tr>";
      if (pager) pager.hidden = true;
      return;
    }

    var totalPages = Math.max(1, Math.ceil(list.length / TRADE_PAGE_SIZE));
    if (state.tradePage > totalPages) state.tradePage = totalPages;
    if (state.tradePage < 1) state.tradePage = 1;

    var startIdx = (state.tradePage - 1) * TRADE_PAGE_SIZE;
    var slice = list.slice(startIdx, startIdx + TRADE_PAGE_SIZE);

    tbody.innerHTML = slice.map(function (t) {
      var cls = t.action === "SELL" ? "dn" : "up";
      return "<tr>"
        + "<td>" + escHtml(t.signalDay) + "</td>"
        + "<td>" + escHtml(t.executionDay) + "</td>"
        + "<td><b>" + escHtml(t.lotId) + "</b></td>"
        + '<td class="' + cls + '">' + escHtml(actionLabel(t.action)) + "</td>"
        + '<td class="r">' + fmtUsd(t.execPrice, 2) + "</td>"
        + '<td class="r">' + t.qtyBTC.toFixed(6) + "</td>"
        + '<td class="r">' + fmtUsd(t.feeUSD + t.slippageUSD, 2) + "</td>"
        + '<td class="r">' + t.btcAfter.toFixed(6) + "</td>"
        + '<td class="r">' + fmtUsd(t.cashAfter, 2) + "</td>"
        + "<td>" + escHtml(formatTradeReason(t)) + "</td>"
        + "</tr>";
    }).join("");

    if (pager) {
      pager.hidden = totalPages <= 1;
      $("btnTradePrev").disabled = state.tradePage <= 1;
      $("btnTradeNext").disabled = state.tradePage >= totalPages;
      $("tradePageInfo").textContent = isEn()
        ? ("Page " + state.tradePage + " / " + totalPages + " (" + list.length + " fills)")
        : ("第 " + state.tradePage + " / " + totalPages + " 页（共 " + list.length + " 笔）");
    }
  }

  // ==================== CSV / JSON 导入导出 ====================
  function exportTradesCsv() {
    if (!state.bt || !state.bt.ok) return;
    var header = ["tradeId", "signalDay", "executionDay", "lotId", "action", "marketPrice", "execPrice", "qtyBTC", "feeUSD", "slippageUSD", "btcBefore", "btcAfter", "cashBefore", "cashAfter", "reason"];
    var lines = [header.join(",")];
    for (var i = 0; i < state.bt.trades.length; i++) {
      var t = state.bt.trades[i];
      var row = [
        t.tradeId,
        t.signalDay,
        t.executionDay,
        t.lotId,
        t.action,
        t.marketPrice.toFixed(2),
        t.execPrice.toFixed(2),
        t.qtyBTC.toFixed(8),
        t.feeUSD.toFixed(4),
        t.slippageUSD.toFixed(4),
        t.btcBefore.toFixed(8),
        t.btcAfter.toFixed(8),
        t.cashBefore.toFixed(2),
        t.cashAfter.toFixed(2),
        '"' + String(t.reason || "").replace(/"/g, '""') + '"'
      ];
      lines.push(row.join(","));
    }
    var blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "satsgarden-vhe-sim-trades-" + state.bt.metrics.startDay + ".csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    showToast(isEn() ? "Exported simulated trades CSV" : "已导出模拟成交记录 CSV");
  }

  function exportSettingsJson() {
    var payload = {
      schema: STORAGE_KEY,
      version: 1,
      exportedAt: new Date().toISOString(),
      note: "仅包含 SatsGarden VHE 波动增币模拟参数，不含真实定投账本记录。",
      config: state.config
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "satsgarden-vhe-settings.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    showToast(isEn() ? "Exported VHE settings JSON" : "已导出 VHE 实验设置 JSON");
  }

  function handleImportSettingsFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var obj = JSON.parse(String(reader.result || ""));
        if (!obj || obj.schema !== STORAGE_KEY || obj.version !== 1 || typeof obj.config !== "object") {
          showToast(isEn() ? "Invalid VHE settings JSON schema" : "JSON 格式不符：需要 schema=btc_vhe_config_v1");
          return;
        }
        var check = VHE.validateConfig(obj.config);
        if (!check.ok) {
          showToast((check.errors && check.errors[0]) || (isEn() ? "Invalid parameter range" : "参数校验未通过"));
          return;
        }
        state.config = check.config;
        saveConfigToLocal(state.config);
        syncFormFromConfig();
        executeSimulationFlow(true);
        showToast(isEn() ? "Imported VHE simulation settings" : "已导入 VHE 实验设置");
      } catch (_) {
        showToast(isEn() ? "Failed to parse JSON file" : "无法解析该 JSON 文件");
      }
    };
    reader.readAsText(file);
  }

  // ==================== 模式切换（保持参数与各自滚动位置，首次展示再重绘 Canvas） ====================
  function setViewMode(nextMode, resetTargetScroll) {
    var target = nextMode === "research" ? "research" : "overview";
    if (target === state.viewMode) return;

    state.scrollMemory[state.viewMode] = window.scrollY || window.pageYOffset || 0;
    state.viewMode = target;

    var isOv = target === "overview";
    $("overviewPanel").hidden = !isOv;
    $("researchPanel").hidden = isOv;

    $("tabModeOverview").classList.toggle("on", isOv);
    $("tabModeOverview").setAttribute("aria-selected", isOv ? "true" : "false");
    $("tabModeResearch").classList.toggle("on", !isOv);
    $("tabModeResearch").setAttribute("aria-selected", !isOv ? "true" : "false");

    var restoreY = resetTargetScroll ? 0 : (state.scrollMemory[target] || 0);
    window.scrollTo(0, restoreY);

    if (isOv) {
      if (state.bt && state.bt.ok) {
        if (typeof requestAnimationFrame === "function") {
          requestAnimationFrame(function () {
            drawSingleCurveCanvas("overviewMainCanvas", "overviewChartTip", state.bt, true, state.ovHoverIdx);
          });
        } else {
          drawSingleCurveCanvas("overviewMainCanvas", "overviewChartTip", state.bt, true, state.ovHoverIdx);
        }
      }
    } else {
      syncVisibleResearchSections(state.calcToken);
    }
  }

  // ==================== 语言切换（严禁重复执行引擎回测，仅重绘已缓存状态） ====================
  function applyI18nWithoutRecompute() {
    document.title = tr("docTitle");
    document.documentElement.lang = isEn() ? "en" : "zh-CN";
    $("langZhBtn").classList.toggle("on", !isEn());
    $("langEnBtn").classList.toggle("on", isEn());
    if ($("inpInitCost")) $("inpInitCost").placeholder = tr("initCostPh");
    if ($("btnThemeToggle")) $("btnThemeToggle").setAttribute("aria-label", isEn() ? "Toggle light/dark theme" : "切换明暗主题");
    if ($("vheToast")) {
      $("vheToast").classList.remove("show");
      $("vheToast").textContent = "";
    }

    var nodes = document.querySelectorAll("[data-i18n]");
    for (var i = 0; i < nodes.length; i++) {
      var key = nodes[i].getAttribute("data-i18n");
      if (key === "method1" || key === "method2" || key === "method3") {
        nodes[i].innerHTML = tr(key);
      } else {
        nodes[i].textContent = tr(key);
      }
    }

    setApplyButtonBusy(state.isCalculatingPrimary);

    if (state.isLoadingData) {
      setStatusBadge("loading");
      renderLoadingState();
      return;
    }

    if (!state.norm) {
      setStatusBadge("unavailable");
      renderClearedInvalidState(isEn()
        ? "Unavailable. Verified historical daily series is missing. Tap Update to retry."
        : "暂不可用。未找到通过连续性校验的历史日线数据。点按「更新」重试。", true);
      return;
    }

    var mmdd = state.norm.meta.lastDay ? state.norm.meta.lastDay.slice(5) : "--";
    setStatusBadge(state.norm.meta.isLagged ? "lagged" : "fresh", mmdd);
    renderGlobalWarnings(state.bt);

    if (!state.bt || !state.bt.ok) {
      var errMsg = (state.bt && state.bt.errors && state.bt.errors.length) ? state.bt.errors.join(" ") : (isEn() ? "Invalid parameters." : "参数无效。");
      renderClearedInvalidState(errMsg, false);
      return;
    }

    updateProvenanceDom(state.norm.meta, state.bt);
    $("tradesCountMeta").textContent = state.bt.trades.length + (isEn() ? " fills" : " 笔");
    $("auditBadgeText").textContent = state.bt.audit.passed
      ? (isEn() ? "Conservation OK" : "守恒通过")
      : (isEn() ? "Audit Mismatch" : "对账异常");

    renderOverviewPrimary(state.bt);
    if (state.viewMode === "overview") {
      drawSingleCurveCanvas("overviewMainCanvas", "overviewChartTip", state.bt, true, state.ovHoverIdx);
    } else {
      if ($("secResearchRisk") && $("secResearchRisk").open) {
        renderRiskAndExecutionSection(state.bt);
        drawResearchCharts();
      }
      if ($("secResearchTrades") && $("secResearchTrades").open) {
        renderTradeTablePaginated(state.bt);
      }
      if ($("secResearchVerify") && $("secResearchVerify").open) {
        if (state.matrixCache.status === "ready" && state.matrixCache.data) renderMatrixTable(state.matrixCache.data);
        if (state.rollingCache.status === "ready" && state.rollingCache.data) renderRollingWindowBlock(state.rollingCache.data);
        if (state.oosState.status === "ready" && state.oosState.data) renderOosTableInResearch(state.oosState.data);
        ensureVerifySectionComputed(state.calcToken);
      }
    }
  }

  // ==================== 只读导入本机持仓动作（概览与研究页共用） ====================
  function triggerReadLocalHoldings() {
    var snap = readLocalHoldingsSnapshotReadOnly();
    if (snap === null) {
      showToast(isEn() ? "No local holdings found; keeping 0.30 BTC example" : "未检测到本机持仓记录，保留 0.30 BTC 示例仓位");
      return;
    }
    state.config = Object.assign({}, state.config, { initialBTC: snap, positionSource: "local_snapshot" });
    saveConfigToLocal(state.config);
    syncFormFromConfig();
    executeSimulationFlow(true);
    showToast(isEn() ? ("Read-only quantity imported: " + snap + " BTC") : ("已只读导入本机数量：" + snap + " BTC（原账本未改动）"));
  }

  // ==================== 事件绑定 ====================
  function bindEvents() {
    $("btnThemeToggle").addEventListener("click", function () {
      state.theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = state.theme;
      try { localStorage.setItem(THEME_KEY, state.theme); } catch (_) {}
      // 仅重绘可见图表，不重算回测
      if (!state.bt || !state.bt.ok) return;
      if (state.viewMode === "overview") {
        drawSingleCurveCanvas("overviewMainCanvas", "overviewChartTip", state.bt, true, state.ovHoverIdx);
      } else {
        drawResearchCharts();
        if (state.rollingCache.status === "ready" && state.rollingCache.data && state.rollingCache.data.ok) {
          var curRoll = state.rollingCache.data.results.find(function (r) { return r.windowMonths === state.rollingMonths; });
          if (curRoll) drawRollingBars(curRoll);
        }
      }
    });

    $("langZhBtn").addEventListener("click", function () {
      if (state.lang === "zh") return;
      state.lang = "zh";
      window.BTC_LANG = "zh";
      try { localStorage.setItem(LANG_KEY, "zh"); } catch (_) {}
      applyI18nWithoutRecompute();
    });

    $("langEnBtn").addEventListener("click", function () {
      if (state.lang === "en") return;
      state.lang = "en";
      window.BTC_LANG = "en";
      try { localStorage.setItem(LANG_KEY, "en"); } catch (_) {}
      applyI18nWithoutRecompute();
    });

    $("btnRefreshData").addEventListener("click", function () {
      loadHistoryData(true);
    });

    $("btnToggleSourcePopover").addEventListener("click", function () {
      var panel = $("headerSourceDetail");
      var openNext = panel.hidden;
      panel.hidden = !openNext;
      $("btnToggleSourcePopover").setAttribute("aria-expanded", openNext ? "true" : "false");
    });

    $("viewModeSeg").addEventListener("click", function (ev) {
      var btn = ev.target.closest("button[data-view-mode]");
      if (!btn) return;
      setViewMode(btn.getAttribute("data-view-mode"), false);
    });

    $("btnGoResearch").addEventListener("click", function () {
      setViewMode("research", false);
    });

    $("btnOverviewReadLocal").addEventListener("click", triggerReadLocalHoldings);
    $("btnReadLocalBtc").addEventListener("click", triggerReadLocalHoldings);

    $("btnOverviewResetExample").addEventListener("click", function () {
      var v = VHE.validateConfig(Object.assign({}, state.config, { initialBTC: 0.3, positionSource: "example" }));
      if (v.ok) {
        state.config = v.config;
        saveConfigToLocal(state.config);
        syncFormFromConfig();
        executeSimulationFlow(true);
        showToast(isEn() ? "Restored 0.30 BTC example" : "已恢复 0.30 BTC 示例仓位");
      }
    });

    // 研究模式 4 个子折叠面板展开时按需计算并重绘非零宽高 Canvas
    ["secResearchParams", "secResearchVerify", "secResearchRisk", "secResearchTrades", "advParamFold"].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener("toggle", function () {
        saveSessionResearchFoldState();
        if (el.open && state.viewMode === "research") {
          syncVisibleResearchSections(state.calcToken);
        }
      });
    });

    // 监听表单改动 -> 标记「未应用」
    var formSec = $("secResearchParams");
    if (formSec) {
      formSec.addEventListener("input", checkFormDirty);
      formSec.addEventListener("change", checkFormDirty);
    }

    $("startPresetStrip").addEventListener("click", function (ev) {
      var btn = ev.target.closest("button[data-start-preset]");
      if (!btn) return;
      var sDate = btn.getAttribute("data-start-preset");
      $("inpStart").value = sDate;
      $("inpEnd").value = "";
      checkFormDirty();
    });

    document.querySelectorAll("[data-fee-preset]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var parts = btn.getAttribute("data-fee-preset").split(",");
        $("inpFee").value = parts[0];
        $("inpSlip").value = parts[1];
        checkFormDirty();
      });
    });

    $("btnApplyParams").addEventListener("click", function () {
      var raw = readConfigFromForm();
      var check = VHE.validateConfig(raw);
      if (!check.ok) {
        var errMsg = check.errors.join(" ");
        $("runErrorNotice").hidden = false;
        $("runErrorNotice").textContent = errMsg;
        // 严格清空旧结果，禁用导出，保留用户已存可恢复的 state.config
        renderClearedInvalidState(errMsg, false);
        showToast(check.errors[0]);
        return;
      }
      state.config = check.config;
      saveConfigToLocal(state.config);
      syncFormFromConfig();
      executeSimulationFlow(true);
      showToast(isEn() ? "Parameters applied" : "已应用参数并更新结果");
    });

    $("btnResetParams").addEventListener("click", function () {
      state.config = VHE.validateConfig(VHE.DEFAULT_CONFIG).config;
      try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
      syncFormFromConfig();
      executeSimulationFlow(true);
      showToast(isEn() ? "Restored defaults" : "已恢复默认实验参数");
    });

    $("chartModeSeg").addEventListener("click", function (ev) {
      var btn = ev.target.closest("button[data-chart-mode]");
      if (!btn) return;
      state.chartMode = btn.getAttribute("data-chart-mode");
      var all = $("chartModeSeg").querySelectorAll("button");
      for (var i = 0; i < all.length; i++) all[i].classList.toggle("on", all[i] === btn);
      drawResearchCharts();
    });

    $("matrixBatchSeg").addEventListener("click", function (ev) {
      var btn = ev.target.closest("button[data-batch]");
      if (!btn) return;
      state.activeBatch = btn.getAttribute("data-batch");
      var all = $("matrixBatchSeg").querySelectorAll("button");
      for (var i = 0; i < all.length; i++) all[i].classList.toggle("on", all[i] === btn);
      ensureVerifySectionComputed(state.calcToken);
    });

    $("matrixTableBody").addEventListener("click", function (ev) {
      var trEl = ev.target.closest("tr[data-strat-idx]");
      if (!trEl || state.matrixCache.status !== "ready" || !state.matrixCache.data || !state.bt || !state.bt.ok) return;
      var idx = Number(trEl.getAttribute("data-strat-idx"));
      var baseOverrides = {
        start: state.bt.metrics.startDay,
        end: state.config.end || null,
        initialBTC: state.config.initialBTC,
        feeRate: state.config.feeRate,
        slippageRate: state.config.slippageRate,
        monthlyUSD: state.config.monthlyUSD > 0 ? state.config.monthlyUSD : 500
      };
      var chosen = null;
      if (state.activeBatch === "batch1") {
        var b1Configs = [
          { contributionMode: "none", tradeRatio: 0 },
          { contributionMode: "none", tradeRatio: 0.10, exitPolicy: "stop_up_20pct", trendFilter: "none" },
          { contributionMode: "none", tradeRatio: 0.10, exitPolicy: "hold_wait", trendFilter: "none" },
          { contributionMode: "none", tradeRatio: 0.10, exitPolicy: "timeout_90d", trendFilter: "none" },
          { contributionMode: "none", tradeRatio: 0.10, exitPolicy: "stop_up_20pct", trendFilter: "ma_slope_cap" },
          { contributionMode: "none", tradeRatio: 0.05, exitPolicy: "stop_up_20pct", trendFilter: "none" }
        ];
        chosen = b1Configs[idx] || null;
      } else {
        var b2Configs = [
          { contributionMode: "monthly_uniform", tradeRatio: 0 },
          { contributionMode: "monthly_ahr999", tradeRatio: 0 },
          { contributionMode: "monthly_uniform", tradeRatio: 0.10, exitPolicy: "stop_up_20pct" },
          { contributionMode: "monthly_ahr999", tradeRatio: 0.10, exitPolicy: "stop_up_20pct" }
        ];
        chosen = b2Configs[idx] || null;
      }
      if (chosen) {
        var v = VHE.validateConfig(Object.assign({}, state.config, baseOverrides, chosen));
        if (v.ok) {
          state.config = v.config;
          saveConfigToLocal(state.config);
          syncFormFromConfig();
          executeSimulationFlow(true);
          showToast(isEn() ? "Loaded strategy into simulation" : "已载入该对照方案并同步更新");
        }
      }
    });

    $("rollingWinSeg").addEventListener("click", function (ev) {
      var btn = ev.target.closest("button[data-roll-months]");
      if (!btn) return;
      state.rollingMonths = Number(btn.getAttribute("data-roll-months"));
      var all = $("rollingWinSeg").querySelectorAll("button");
      for (var i = 0; i < all.length; i++) all[i].classList.toggle("on", all[i] === btn);
      if (state.rollingCache.status === "ready" && state.rollingCache.data) {
        renderRollingWindowBlock(state.rollingCache.data);
        updateVerifyFoldMeta();
      } else {
        ensureVerifySectionComputed(state.calcToken);
      }
    });

    $("tradeFilterSeg").addEventListener("click", function (ev) {
      var btn = ev.target.closest("button[data-trade-filter]");
      if (!btn || !state.bt || !state.bt.ok) return;
      state.tradeFilter = btn.getAttribute("data-trade-filter");
      state.tradePage = 1;
      var all = $("tradeFilterSeg").querySelectorAll("button");
      for (var i = 0; i < all.length; i++) all[i].classList.toggle("on", all[i] === btn);
      renderTradeTablePaginated(state.bt);
    });

    $("btnTradePrev").addEventListener("click", function () {
      if (!state.bt || !state.bt.ok || state.tradePage <= 1) return;
      state.tradePage -= 1;
      renderTradeTablePaginated(state.bt);
    });

    $("btnTradeNext").addEventListener("click", function () {
      if (!state.bt || !state.bt.ok) return;
      state.tradePage += 1;
      renderTradeTablePaginated(state.bt);
    });

    $("btnExportCsv").addEventListener("click", exportTradesCsv);
    $("btnExportJson").addEventListener("click", exportSettingsJson);
    $("btnImportJson").addEventListener("click", function () {
      $("fileImportJson").value = "";
      $("fileImportJson").click();
    });
    $("fileImportJson").addEventListener("change", function (ev) {
      var f = ev.target.files && ev.target.files[0];
      if (f) handleImportSettingsFile(f);
    });

    // 曲线触控与指针悬停查看
    function bindHoverWrap(wrapId, isOverview) {
      var el = $(wrapId);
      if (!el) return;
      function onPtr(ev) {
        if (!state.bt || !state.bt.ok || !state.bt.curve || state.bt.curve.length < 2) return;
        var rect = el.getBoundingClientRect();
        var clientX = ev.touches && ev.touches[0] ? ev.touches[0].clientX : ev.clientX;
        var padL = 56;
        var padR = 12;
        var plotW = Math.max(40, rect.width - padL - padR);
        var ratio = (clientX - rect.left - padL) / plotW;
        var idx = Math.round(Math.max(0, Math.min(1, ratio)) * (state.bt.curve.length - 1));
        if (isOverview) {
          state.ovHoverIdx = idx;
          drawSingleCurveCanvas("overviewMainCanvas", "overviewChartTip", state.bt, true, state.ovHoverIdx);
        } else {
          state.resHoverIdx = idx;
          drawResearchCharts();
        }
      }
      el.addEventListener("pointermove", onPtr);
      el.addEventListener("pointerdown", onPtr);
      el.addEventListener("pointerleave", function () {
        if (isOverview) {
          state.ovHoverIdx = -1;
          if (state.bt && state.bt.ok) drawSingleCurveCanvas("overviewMainCanvas", "overviewChartTip", state.bt, true, -1);
        } else {
          state.resHoverIdx = -1;
          drawResearchCharts();
        }
      });
    }

    bindHoverWrap("overviewChartWrap", true);
    bindHoverWrap("mainChartWrap", false);
    bindHoverWrap("cashChartWrap", false);

    window.addEventListener("resize", function () {
      if (!state.bt || !state.bt.ok) return;
      if (state.viewMode === "overview") {
        drawSingleCurveCanvas("overviewMainCanvas", "overviewChartTip", state.bt, true, state.ovHoverIdx);
      } else {
        drawResearchCharts();
        if (state.rollingCache.status === "ready" && state.rollingCache.data && state.rollingCache.data.ok) {
          var curRoll = state.rollingCache.data.results.find(function (r) { return r.windowMonths === state.rollingMonths; });
          if (curRoll) drawRollingBars(curRoll);
        }
      }
    });
  }

  function init() {
    loadSavedConfig();
    loadSessionResearchFoldState();
    syncFormFromConfig();
    bindEvents();
    applyI18nWithoutRecompute();
    loadHistoryData(false);
  }

  window.VHEUI = {
    init: init,
    reload: loadHistoryData,
    setMode: function (m) { setViewMode(m, false); },
    getStateSnapshot: function () {
      return {
        viewMode: state.viewMode,
        lang: state.lang,
        theme: state.theme,
        calcToken: state.calcToken,
        isFormDirty: state.isFormDirty,
        hasValidBacktest: Boolean(state.bt && state.bt.ok),
        oosStatus: state.oosState.status,
        matrixStatus: state.matrixCache.status,
        rollingStatus: state.rollingCache.status,
        workerReady: workerCtrl.ready,
        metricsLog: Object.assign({}, state.metricsLog),
        cacheKeys: {
          bt: state.btCache.key,
          oos: state.oosState.key,
          matrix: state.matrixCache.key,
          rolling: state.rollingCache.key
        }
      };
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
