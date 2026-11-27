/* SatsGarden V28.2.0 · VHE Lab Standalone UI Controller
 * 仅用于 vhe.html：按需加载、响应式高分屏 Canvas 绘图、中英双语、明暗主题同步。
 * 严格隔离本机真实定投账本（绝不写入 btc_dca_ledger_v1 或 btc_exec_v7）。
 */
(function () {
  "use strict";

  var VHE = window.VHEEngine;
  if (!VHE) return;

  var STORAGE_KEY = "btc_vhe_config_v1";
  var THEME_KEY = "btc_theme_v1";
  var LANG_KEY = "btc_lang_v1";
  var MINUS = "\u2212";

  var I18N = {
    zh: {
      docTitle: "波动增币实验室 · Sats Garden",
      backMain: "主站",
      pageTitle: "波动增币实验室",
      simBadge: "历史模拟",
      btnUpdate: "更新",
      provSource: "来源",
      provSpan: "首末数据日",
      provRows: "有效日线",
      provUpdated: "文件生成日",
      provWindow: "回测区间",
      provSemantics: "成交模型",
      semValue: "日参考价 · T信号→T+1收盘",
      secResultTitle: "币本位模拟结果",
      secResultSub: "比较相同起始资产与相同外部现金流下的最终 BTC 数量。现金与持币分开统计。",
      kpiHeldLabel: "实际持仓 BTC",
      kpiCashLabel: "待回购与储备现金",
      kpiEqLabel: "BTC 等价资产与相对基准",
      kpiDdLabel: "最差币本位回撤",
      secChartTitle: "基准与 VHE 对照曲线",
      secChartSub: "点按或滑动图表查看每日持币、待回购现金与买卖执行点。",
      modeEqBtc: "BTC 等价",
      modeHeldBtc: "实际持仓",
      pre2017: "2017-12 牛顶",
      pre2018: "2018-12 熊底",
      pre2021: "2021-11 牛顶",
      pre2022: "2022-11 熊底",
      pre2024: "2024-01 ETF",
      initCostPh: "未知留空",
      legSell: "卖出执行",
      legBuy: "分层回购",
      legExit: "止损/超时回购",
      secParamTitle: "实验参数设置",
      secParamSub: "仅修改本机模拟参数，不提供未经验证的推荐值，不修改真实定投账本。",
      btnExpandParam: "展开调整",
      btnCollapseParam: "收起参数",
      lblStart: "回测开始日",
      lblEnd: "回测结束日（留空至末数据日）",
      lblInitBtc: "起始 BTC（默认示例 0.30）",
      btnReadSnapshot: "只读带入本机持仓",
      lblTradeRatio: "波段实验仓上限（0%–10%）",
      lblMaLen: "算术均线长度（日）",
      lblSellThr: "A / B / C 卖出偏离阈值（%）",
      lblBuyThr: "分层回撤回购阈值（%）",
      lblExitPolicy: "风控退出策略",
      optExitStop20: "较卖出成交价上涨 20% 止损回购",
      optExitWait: "无限等待回撤回购",
      optExitTimeout90: "等待满 90 天超时回购",
      lblTrendFilter: "卖出前趋势过滤（仅用过去价格）",
      optTrendNone: "不启用趋势过滤",
      optTrendSlope: "近 20 日均线斜率过陡时禁止卖出",
      lblFee: "单边手续费率（%）",
      lblSlip: "单边滑点假设（%）",
      lblCooldown: "子仓完成后冷却期（天）",
      lblContribMode: "外部现金流模式",
      optContribNone: "无新增入金（纯存量对照）",
      optContribUniform: "每月等额定投（同入金日对照）",
      optContribAhr: "每月 AHR999 动态定投（保留未投现金）",
      lblMonthlyUsd: "每月外部入金（USD，仅定投模式生效）",
      lblInitCost: "起始仓位已知净投入 USD（可选）",
      feeZero: "零摩擦检验 (0%)",
      feeStd: "标准摩擦 (0.10%+0.05%)",
      feeHigh: "高压摩擦 (0.25%+0.15%)",
      btnRunSim: "运行模拟",
      btnResetDefault: "恢复实验默认",
      paramSnapshotNote: "0.30 BTC 为默认示例仓位。点按「只读带入本机持仓」仅读取数量，绝不写入或改动定投账本。",
      secRollingTitle: "同现金流对照与滚动样本检验",
      secRollingSub: "突出展示不利区间、失败回合与未回购现金。不因跑输基准而隐藏样本。",
      batch1Tab: "第一批 · 存量对照",
      batch2Tab: "第二批 · 定投对照",
      thStrategy: "对照方案（点按可载入曲线）",
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
      rollingOverlapWarn: "按月滚动窗口存在时间重叠，样本数不等于独立周期观测数。",
      subOosTitle: "预注册训练期（2013–2020）→ 样本外（2021–末数据日）检验",
      thCandidate: "预注册候选（共 6 组）",
      thTrainEx: "训练期超额",
      thOosEx: "样本外超额",
      thOosHighFee: "高费率压力超额",
      thOosCash: "样本外期末现金",
      thOosDd: "样本外回撤",
      subFailedCyclesTitle: "失败回合、止损退出与未完成子仓",
      thCycleLot: "子仓 / 状态",
      thCycleSpan: "卖出执行日 → 结束日",
      thAnchorPx: "卖出成交锚点",
      thSoldBtc: "卖出 BTC",
      thRepBtc: "已回购 BTC",
      thNetLoss: "净增减 / 待回购现金",
      secTradeTitle: "完整模拟成交记录与独立备份",
      secTradeSub: "交易记录导出为 CSV 表格；本页模拟参数独立导出为 JSON，不包含在主站定投账本备份中。",
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
      secMethodTitle: "指标说明、账本隔离与方法局限",
      method1: "<b>收盘后次日执行：</b>无全历史日内逐笔与高低价文件，所有信号在 T 日完成收盘后确认，并于 T+1 日参考价叠加单边滑点与报价币手续费模拟成交，不假设盘中触价成交或限价必成。",
      method2: "<b>均线与估值口径区分：</b>本页 MA200 为连续 200 个已完成有效日的算术均值；AHR999 使用 200 日调和均值定投成本，其 2026 新拟合系数用于早期历史重放存在模型选择后见风险。VHE 第一阶段不使用 URPD 快照构造历史信号。",
      method3: "<b>账本严格只读隔离：</b>本页参数仅存于独立键 btc_vhe_config_v1，不读写 btc_dca_ledger_v1 或 btc_exec_v7，不连接任何交易接口，不使用杠杆。若样本外未证明稳定增币优势，继续持有与纪律定投仍是默认基准。"
    },
    en: {
      docTitle: "VHE Volatility Lab · Sats Garden",
      backMain: "Home",
      pageTitle: "VHE Volatility Lab",
      simBadge: "Historical Sim",
      btnUpdate: "Update",
      provSource: "Source",
      provSpan: "Data Span",
      provRows: "Valid Days",
      provUpdated: "File Built",
      provWindow: "Test Window",
      provSemantics: "Fill Model",
      semValue: "Daily Ref · T Signal → T+1 Close",
      secResultTitle: "BTC-Denominated Simulation",
      secResultSub: "Compare final BTC under identical starting assets and external cashflows. Cash and held BTC are shown separately.",
      kpiHeldLabel: "Actual Held BTC",
      kpiCashLabel: "Pending & Reserve Cash",
      kpiEqLabel: "BTC Equivalent & vs Base",
      kpiDdLabel: "Max BTC Drawdown",
      secChartTitle: "Baseline vs VHE Comparison",
      secChartSub: "Tap or drag on the chart to inspect daily BTC, pending cash, and trade fills.",
      modeEqBtc: "BTC Equiv",
      modeHeldBtc: "Actual BTC",
      pre2017: "2017-12 Top",
      pre2018: "2018-12 Low",
      pre2021: "2021-11 Top",
      pre2022: "2022-11 Low",
      pre2024: "2024-01 ETF",
      initCostPh: "Blank if unknown",
      legSell: "Sell Fill",
      legBuy: "Tier Buyback",
      legExit: "Stop/Timeout Exit",
      secParamTitle: "Experimental Parameters",
      secParamSub: "Device-local simulation settings only. No unverified optimal recommendations; real ledgers stay untouched.",
      btnExpandParam: "Customize",
      btnCollapseParam: "Collapse",
      lblStart: "Start Date",
      lblEnd: "End Date (blank = last data day)",
      lblInitBtc: "Initial BTC (0.30 example)",
      btnReadSnapshot: "Read Local BTC (Read-Only)",
      lblTradeRatio: "Experimental Band Cap (0%–10%)",
      lblMaLen: "Arithmetic MA Length (Days)",
      lblSellThr: "Lot A / B / C Sell Deviation (%)",
      lblBuyThr: "Tiered Buyback Drawdown (%)",
      lblExitPolicy: "Risk Exit Policy",
      optExitStop20: "+20% Above Sell Fill Stop Buyback",
      optExitWait: "Hold & Wait Indefinitely",
      optExitTimeout90: "90-Day Timeout Buyback",
      lblTrendFilter: "Pre-Sell Trend Filter (Past Only)",
      optTrendNone: "No Trend Filter",
      optTrendSlope: "Block Sells When 20D MA Slope > 6%",
      lblFee: "One-Way Fee Rate (%)",
      lblSlip: "One-Way Slippage (%)",
      lblCooldown: "Post-Cycle Cooldown (Days)",
      lblContribMode: "External Cashflow Mode",
      optContribNone: "No New Cash (Lump-Sum Batch 1)",
      optContribUniform: "Monthly Uniform DCA (Batch 2)",
      optContribAhr: "Monthly AHR999 Dynamic DCA (Keep Cash)",
      lblMonthlyUsd: "Monthly Inflow (USD, DCA modes)",
      lblInitCost: "Known Initial Cost Basis USD (Optional)",
      feeZero: "Zero Friction (0%)",
      feeStd: "Standard (0.10%+0.05%)",
      feeHigh: "Stress (0.25%+0.15%)",
      btnRunSim: "Run Simulation",
      btnResetDefault: "Reset Defaults",
      paramSnapshotNote: "0.30 BTC is an example position. Tapping Read Local BTC only reads quantity and never modifies your DCA ledger.",
      secRollingTitle: "Same-Cashflow Matrix & Rolling Checks",
      secRollingSub: "Highlights unfavorable windows, failed cycles, and un-repurchased cash without hiding negative outcomes.",
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
      rollingOverlapWarn: "Monthly rolling windows overlap in time; window count does not equal independent cycle observations.",
      subOosTitle: "Pre-Registered Train (2013–2020) → Out-of-Sample (2021–End)",
      thCandidate: "Pre-Registered Candidate (6 Total)",
      thTrainEx: "Train Excess",
      thOosEx: "OOS Excess",
      thOosHighFee: "High-Fee OOS",
      thOosCash: "OOS End Cash",
      thOosDd: "OOS BTC DD",
      subFailedCyclesTitle: "Failed Cycles, Stop Exits & Open Lots",
      thCycleLot: "Lot / State",
      thCycleSpan: "Sell Exec → Close",
      thAnchorPx: "Sell Anchor",
      thSoldBtc: "Sold BTC",
      thRepBtc: "Bought BTC",
      thNetLoss: "Net BTC / Cash Left",
      secTradeTitle: "Complete Simulated Trades & Standalone Backup",
      secTradeSub: "Export simulated fills as CSV; export VHE lab parameters separately as JSON (not included in main DCA backup).",
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
      secMethodTitle: "Methodology, Ledger Isolation & Limitations",
      method1: "<b>Next-Close Execution:</b> Full historical intraday OHLC/tick files are unavailable; signals confirm at Day T close and execute at Day T+1 daily reference price with one-way fee and slippage. No intraday touch or limit-fill guarantee is assumed.",
      method2: "<b>MA200 vs AHR999:</b> MA200 here is the arithmetic mean of 200 contiguous valid closes, distinct from AHR999's 200D harmonic cost. Applying 2026 refit parameters to early history carries model-selection hindsight. URPD snapshots are never used as historical signals.",
      method3: "<b>Strict Read-Only Ledger Isolation:</b> Settings are stored solely under btc_vhe_config_v1; btc_dca_ledger_v1 and btc_exec_v7 are never written. No exchange APIs or leverage. Without proven OOS BTC alpha, disciplined HODL/DCA remains the baseline."
    }
  };

  var state = {
    lang: window.BTC_LANG === "en" ? "en" : "zh",
    theme: document.documentElement.dataset.theme === "dark" ? "dark" : "light",
    norm: null,
    unverifiedFallbackNote: null,
    config: Object.assign({}, VHE.DEFAULT_CONFIG),
    bt: null,
    chartMode: "eq",
    hoverIdx: -1,
    activeBatch: "batch1",
    matrixResult: null,
    rollingMonths: 24,
    rollingCache: null,
    oosResult: null,
    tradeFilter: "all"
  };

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

  function fmtBtc(val, digits) {
    if (!Number.isFinite(val)) return "--";
    var d = digits !== undefined ? digits : 6;
    var sign = val < -1e-12 ? MINUS : "";
    return sign + Math.abs(val).toFixed(d) + " BTC";
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

  // Status badge strictly obeys 文案规范.md Section B: 等待数据 / 更新中 / 数据日 · MM-DD / 滞后 · MM-DD / 暂不可用
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

  // Strictly READ-ONLY snapshot from local ledgers (never writes or mutates btc_dca_ledger_v1 or btc_exec_v7)
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

    var presetBtns = document.querySelectorAll("[data-start-preset]");
    for (var i = 0; i < presetBtns.length; i++) {
      presetBtns[i].classList.toggle("on", presetBtns[i].getAttribute("data-start-preset") === c.start && !c.end);
    }
  }

  function readConfigFromForm() {
    var initCostStr = $("inpInitCost") ? $("inpInitCost").value.trim() : "";
    return {
      start: $("inpStart") && $("inpStart").value ? $("inpStart").value : "2021-11-01",
      end: $("inpEnd") && $("inpEnd").value ? $("inpEnd").value : null,
      initialBTC: Number($("inpInitBtc").value),
      initialCash: state.config.initialCash || 0,
      positionSource: state.config.positionSource || "example",
      initialCostUSD: initCostStr === "" ? null : Number(initCostStr),
      tradeRatio: Number($("inpTradeRatio").value) / 100,
      maLength: Number($("inpMaLen").value),
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
      feeRate: Number($("inpFee").value) / 100,
      slippageRate: Number($("inpSlip").value) / 100,
      cooldownDays: Number($("inpCooldown").value),
      contributionMode: $("selContribMode").value,
      monthlyUSD: Number($("inpMonthlyUsd").value)
    };
  }

  async function loadHistoryData(isManualRefresh) {
    setStatusBadge("loading");
    state.unverifiedFallbackNote = null;
    var unavailCard = $("vheUnavailableCard");
    if (unavailCard) unavailCard.hidden = true;

    var loadedNorm = null;

    // 1. Prefer same-origin ./data/v28/charts.json over HTTP/HTTPS
    if (location.protocol === "http:" || location.protocol === "https:") {
      var ctrl = typeof AbortController === "function" ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function () { try { ctrl.abort(); } catch (_) {} }, 4500) : null;
      try {
        var res = await fetch("./data/v28/charts.json", {
          cache: "no-store",
          signal: ctrl ? ctrl.signal : undefined
        });
        if (timer) clearTimeout(timer);
        if (res && res.ok) {
          var ct = (res.headers.get("content-type") || "").toLowerCase();
          if (!ct.includes("text/html")) {
            var json = await res.json();
            var cand = VHE.normalizeHistory(json);
            if (cand.ok && cand.meta.verified) {
              loadedNorm = cand;
            } else if (cand.ok && !cand.meta.verified) {
              state.unverifiedFallbackNote = isEn()
                ? "Same-origin charts.json priceAll lacks explicit daily array d (unverified); switched cleanly to verified bundled CYCLE_SEED without mixing sources."
                : "同源 charts.json 的 priceAll 缺少显式日期校验字段 d（未验证序列不得进入正式回测），已独立切换至随包验证种子 CYCLE_SEED，未混合数据源。";
            }
          }
        }
      } catch (_) {
        if (timer) clearTimeout(timer);
      }
    }

    // 2. Fallback to verified bundled CYCLE_SEED (declared as global const CYCLE_SEED in seed-cycle.<hash>.js; never mixed with charts.json)
    var bundledSeed = (typeof CYCLE_SEED === "object" && CYCLE_SEED) ? CYCLE_SEED : (window.CYCLE_SEED || null);
    if (!loadedNorm && bundledSeed) {
      var seedCand = VHE.normalizeHistory(bundledSeed);
      if (seedCand.ok && seedCand.meta.verified) {
        loadedNorm = seedCand;
      }
    }

    if (!loadedNorm) {
      state.norm = null;
      state.bt = null;
      setStatusBadge("unavailable");
      renderUnavailableState();
      if (isManualRefresh) {
        showToast(isEn() ? "Data unavailable" : "数据暂不可用");
      }
      return;
    }

    state.norm = loadedNorm;
    state.rollingCache = null;
    state.oosResult = null;
    var mmdd = loadedNorm.meta.lastDay ? loadedNorm.meta.lastDay.slice(5) : "--";
    setStatusBadge(loadedNorm.meta.isLagged ? "lagged" : "fresh", mmdd);

    executeSimulationAndRender();
    if (isManualRefresh) {
      showToast(isEn() ? ("Updated · Data " + loadedNorm.meta.lastDay) : ("已更新 · 数据日 " + loadedNorm.meta.lastDay));
    }
  }

  function renderUnavailableState() {
    if ($("vheUnavailableCard")) {
      $("vheUnavailableCard").hidden = false;
      $("vheUnavailableMsg").textContent = isEn()
        ? "Unavailable. Historical price series is missing or failed integrity checks. Tap Update to retry."
        : "暂不可用。未找到通过连续性校验的历史日线数据。点按「更新」重试。";
    }
    $("provSourceVal").textContent = isEn() ? "Unavailable" : "暂不可用";
    $("provSpanVal").textContent = "--";
    $("provRowsVal").textContent = "--";
    $("provUpdatedVal").textContent = "--";
    $("provWindowVal").textContent = "--";
    $("provSemanticsVal").textContent = tr("semValue");
    $("auditBadge").className = "status-badge warn num";
    $("auditBadgeText").textContent = isEn() ? "Waiting" : "等待数据";
    $("verdictTitle").textContent = isEn() ? "Unavailable" : "暂不可用";
    $("verdictDesc").textContent = isEn() ? "No verified historical series available." : "当前无可用历史序列。";
    $("legBaseText").textContent = isEn() ? "Same-Cashflow Baseline" : "同现金流基准";
    $("legVheText").textContent = isEn() ? "VHE eqBTC" : "VHE 等价 BTC";
    $("kpiHeldVal").textContent = "--";
    $("kpiHeldSub").textContent = "--";
    $("kpiCashVal").textContent = "--";
    $("kpiCashSub").textContent = "--";
    $("kpiEqVal").textContent = "--";
    $("kpiEqSub").textContent = "--";
    $("kpiDdVal").textContent = "--";
    $("kpiDdSub").textContent = "--";
    $("diagKvGrid").innerHTML = "";
    $("lotsGrid").innerHTML = "";
    $("matrixTableBody").innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--ink3)">' + (isEn() ? "Unavailable" : "暂不可用") + "</td></tr>";
    $("oosTableBody").innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--ink3)">' + (isEn() ? "Unavailable" : "暂不可用") + "</td></tr>";
    $("failedCyclesBody").innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--ink3)">' + (isEn() ? "Unavailable" : "暂不可用") + "</td></tr>";
    $("tradeTableBody").innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--ink3)">' + (isEn() ? "Unavailable" : "暂不可用") + "</td></tr>";
  }

  function executeSimulationAndRender() {
    if (!state.norm) {
      renderUnavailableState();
      return;
    }
    var errBanner = $("runErrorBanner");
    var bt = VHE.runBacktest(state.norm, state.config);
    state.bt = bt;
    state.hoverIdx = -1;

    // Provenance bar
    var meta = state.norm.meta;
    $("provSourceVal").textContent = isEn()
      ? (meta.isSeed ? "Bundled Seed (CYCLE_SEED)" : "Same-Origin (charts.json)")
      : (meta.isSeed ? "随包历史种子 (CYCLE_SEED)" : "同源预生成 (charts.json)");
    $("provSpanVal").textContent = meta.firstDay + " → " + meta.lastDay;
    $("provRowsVal").textContent = meta.validCount + (meta.gapCount > 0 ? (" (缺口 " + meta.gapCount + ")") : "");
    $("provUpdatedVal").textContent = meta.updatedDay || "--";
    $("provSemanticsVal").textContent = tr("semValue");

    if (!bt.ok) {
      errBanner.hidden = false;
      errBanner.textContent = (bt.errors || []).join(" ");
      $("provWindowVal").textContent = "--";
      return;
    }
    errBanner.hidden = true;
    $("provWindowVal").textContent = bt.metrics.startDay + " → " + bt.metrics.endDay;

    renderPrimaryResults(bt);
    drawComparisonCharts();
    renderMatrixAndRolling();
    renderFailedAndOpenLots(bt);
    renderTradeTable(bt);
  }

  function translateBaselineLabel(cfg) {
    if (!isEn()) {
      if (cfg.contributionMode === "monthly_uniform") return "普通等额定投基准";
      if (cfg.contributionMode === "monthly_ahr999") return "AHR999 动态定投基准";
      return "纯持有基准 (HODL)";
    }
    if (cfg.contributionMode === "monthly_uniform") return "Uniform DCA Baseline";
    if (cfg.contributionMode === "monthly_ahr999") return "AHR999 Dynamic DCA";
    return "Pure HODL Baseline";
  }

  function renderPrimaryResults(bt) {
    var m = bt.metrics;
    var baseName = translateBaselineLabel(bt.config);

    // Audit badge
    var auditBadge = $("auditBadge");
    var auditTxt = $("auditBadgeText");
    if (bt.audit.passed) {
      auditBadge.className = "status-badge ok num";
      auditTxt.textContent = isEn() ? "Conservation Verified" : "守恒自检通过";
    } else {
      auditBadge.className = "status-badge bad num";
      auditTxt.textContent = isEn() ? "Audit Mismatch" : "对账异常";
    }

    // Warnings banner
    var warnHtml = [];
    if (state.unverifiedFallbackNote) {
      warnHtml.push('<div class="warn-banner">' + escHtml(state.unverifiedFallbackNote) + "</div>");
    }
    if (bt.config.contributionMode === "monthly_ahr999" && m.startDay < "2026-01-01") {
      warnHtml.push('<div class="warn-banner">' + escHtml(isEn()
        ? "Model hindsight note: AHR999 2026 refit coefficients (A=5.5856, B=−16.1567) replayed before 2026 carry in-sample hindsight."
        : "模型后见提示：AHR999 新拟合系数（A=5.5856, B=−16.1567）用于早期区间回放存在模型选择后见风险。") + "</div>");
    }
    $("runWarningsBox").innerHTML = warnHtml.join("");

    // Verdict Box
    var vBox = $("verdictBox");
    var vTitle = $("verdictTitle");
    var vDesc = $("verdictDesc");
    var posTag = bt.config.positionSource === "local_snapshot"
      ? (isEn() ? "Read-only local BTC snapshot used." : "已使用本机持仓只读快照。")
      : (isEn() ? (bt.config.initialBTC + " BTC is an example position, not your real holdings.") : (bt.config.initialBTC + " BTC 为示例模拟仓位，不代表你的真实持仓。"));

    if (bt.config.tradeRatio === 0) {
      vBox.className = "verdict-box";
      vTitle.textContent = isEn() ? "0% Band Baseline (Identical to Hold/DCA)" : "0% 波段基线（与同现金流基准完全一致）";
      vDesc.textContent = posTag + " " + (isEn() ? "Not a trading signal." : "不是买卖信号。");
    } else if (m.outperformedBaseline) {
      vBox.className = "verdict-box pos";
      vTitle.textContent = isEn()
        ? ("Window Outperformed " + baseName + " (" + fmtPct(m.netDiffEqPct, 2, true) + ")")
        : ("本区间跑赢" + baseName + "（" + fmtPct(m.netDiffEqPct, 2, true) + "）");
      vDesc.textContent = (isEn()
        ? "Single-window backtest does not prove out-of-sample persistence; verify rolling windows below. "
        : "单一窗口跑赢不代表样本外稳定优势，请结合下方跨起点滚动检验判断。") + posTag;
    } else {
      vBox.className = "verdict-box neg";
      vTitle.textContent = isEn() ? "BTC Alpha Unproven (Underperformed Baseline)" : "未证明增币能力";
      vDesc.textContent = (isEn()
        ? ("Final eqBTC trailed " + baseName + " by " + fmtPct(m.netDiffEqPct, 2, true) + " (" + fmtSignedNum(m.netDiffEqBTC, 6, " BTC") + "). ")
        : ("期末等价资产较" + baseName + "变化 " + fmtPct(m.netDiffEqPct, 2, true) + "（" + fmtSignedNum(m.netDiffEqBTC, 6, " BTC") + "）。不是买卖信号。")) + posTag;
    }

    // 4 KPI Cards (Cash NEVER mixed into heldBTC!)
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
      : ("现金流调整单位净值 · 累计卖飞损失 " + m.soldOutLossBTC.toFixed(6) + " BTC");

    // Key-value diagnostic list
    var costTextHeld = m.costBasisKnown && m.netInvestedPerHeldBTC !== null
      ? fmtUsd(m.netInvestedPerHeldBTC, 0) + " / BTC"
      : (isEn() ? "Initial principal unknown (hidden)" : "初始本金未知，不显示绝对成本");
    var costTextEq = m.costBasisKnown && m.netInvestedPerEqBTC !== null
      ? fmtUsd(m.netInvestedPerEqBTC, 0) + " / eqBTC"
      : (isEn() ? "Initial principal unknown (hidden)" : "初始本金未知，不显示绝对成本");

    var rows = [
      [isEn() ? "Same-Cashflow Baseline eqBTC" : (baseName + " 期末等价 BTC"), m.baselineEqBTC.toFixed(6) + " BTC (" + fmtUsd(m.baselineCashUSD, 0) + ")"],
      [isEn() ? "VHE Fills / Completed / Failed Cycles" : "VHE 交易次数 / 完成回合 / 失败回合", m.vheTradeCount + " / " + m.completedCycles + " / " + m.failedCycles],
      [isEn() ? "Stop-Loss / Timeout Exits / Open Lots" : "止损回购 / 超时退出 / 未完成子仓", m.stopLossCount + " / " + m.timeoutExitCount + " / " + m.openLotsCount],
      [isEn() ? "Max Buyback Wait / End Pending Signals" : "最长等待天数 / 期末挂起未执行信号", m.maxWaitDays + (isEn() ? " d" : " 天") + " / " + m.pendingSignalsCount],
      [isEn() ? "Quote Fees + Est. Slippage" : "累计手续费 + 滑点折算（报价币）", fmtUsd(m.totalFeesUSD, 2) + " + " + fmtUsd(m.totalSlippageUSD, 2)],
      [isEn() ? "Period End Daily Ref Price" : "期末日参考价（非实时现价）", fmtUsd(m.markPriceUSD, 2) + " (" + m.endDay + ")"],
      [isEn() ? "Net Invested / Actual Held BTC" : "累计外部净投入 / 实际持仓 BTC", costTextHeld],
      [isEn() ? "Net Invested / eqBTC (Non-Tax)" : "累计外部净投入 / 等价 eqBTC（非税务口径）", costTextEq]
    ];
    $("diagKvGrid").innerHTML = rows.map(function (r) {
      return '<div class="kv-row"><span>' + escHtml(r[0]) + "</span><b>" + escHtml(r[1]) + "</b></div>";
    }).join("");

    // Sub-lot A / B / C cards
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
  }

  function setupCanvas(canvas) {
    var rect = canvas.parentElement.getBoundingClientRect();
    var w = Math.max(260, Math.floor(rect.width));
    var h = Math.max(90, Math.floor(rect.height));
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

  function drawComparisonCharts() {
    var bt = state.bt;
    var mainCv = $("mainChartCanvas");
    var cashCv = $("cashChartCanvas");
    if (!bt || !bt.ok || !bt.curve || bt.curve.length < 2 || !mainCv || !cashCv) return;

    var curve = bt.curve;
    var n = curve.length;
    var useEq = state.chartMode === "eq";

    $("legBaseText").textContent = isEn()
      ? (useEq ? "Baseline eqBTC" : "Baseline Held BTC")
      : (useEq ? "基准等价 BTC" : "基准实际持仓");
    $("legVheText").textContent = isEn()
      ? (useEq ? "VHE eqBTC" : "VHE Actual BTC")
      : (useEq ? "VHE 等价 BTC" : "VHE 实际持仓");

    var ink = cssVar("--ink", "#11141a");
    var ink3 = cssVar("--ink3", "#7a8394");
    var hair = cssVar("--hair", "rgba(128,128,128,0.15)");
    var blue = cssVar("--blue", "#2563eb");
    var green = cssVar("--green", "#16a34a");
    var red = cssVar("--red", "#dc2626");
    var amber = cssVar("--amber", "#b45309");

    // 1. Main BTC Curve
    var mSetup = setupCanvas(mainCv);
    var ctx = mSetup.ctx;
    var W = mSetup.w;
    var H = mSetup.h;
    ctx.clearRect(0, 0, W, H);

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

    // Horizontal grid & Y labels
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
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

    // X date ticks
    ctx.textBaseline = "top";
    var tickIndices = [0, Math.floor((n - 1) * 0.33), Math.floor((n - 1) * 0.66), n - 1];
    for (var ti = 0; ti < tickIndices.length; ti++) {
      var tIdx = tickIndices[ti];
      var tx = xAt(tIdx);
      ctx.fillStyle = ink3;
      ctx.textAlign = ti === 0 ? "left" : (ti === tickIndices.length - 1 ? "right" : "center");
      ctx.fillText(curve[tIdx].date.slice(0, 7), tx, H - padB + 5);
    }

    // Baseline line (calm dashed blue)
    ctx.save();
    ctx.strokeStyle = blue;
    ctx.lineWidth = 1.6;
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

    // VHE line (solid crisp stroke)
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

    // Trade markers indexed by date
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
        ctx.arc(mx, my, 3.3, 0, Math.PI * 2);
      } else if (trd.action === "BUYBACK_TIER") {
        ctx.fillStyle = green;
        ctx.arc(mx, my, 3.3, 0, Math.PI * 2);
      } else {
        ctx.fillStyle = amber;
        ctx.rect(mx - 3, my - 3, 6, 6);
      }
      ctx.fill();
    }

    // Crosshair on Main Canvas
    var tip = $("mainChartTip");
    if (state.hoverIdx >= 0 && state.hoverIdx < n) {
      var hPt = curve[state.hoverIdx];
      var hx = xAt(state.hoverIdx);
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
        var devStr = hPt.dev !== null ? fmtPct(hPt.dev, 1, true) : "--";
        tip.textContent = hPt.date + " · " + fmtUsd(hPt.price, 0) + " (MA " + devStr + ") · "
          + (isEn() ? "Held " : "实持 ") + hPt.heldBTC.toFixed(6) + " · "
          + (isEn() ? "Cash " : "现金 ") + fmtUsd(hPt.totalCashUSD, 0) + " · "
          + "eqBTC " + hPt.eqBTC.toFixed(6);
      }
    } else if (tip) {
      tip.hidden = true;
    }

    // 2. Lower Pending Cash Area Canvas
    var cSetup = setupCanvas(cashCv);
    var cctx = cSetup.ctx;
    var CW = cSetup.w;
    var CH = cSetup.h;
    cctx.clearRect(0, 0, CW, CH);

    var cPadT = 12;
    var cPadB = 18;
    var cPlotH = Math.max(30, CH - cPadT - cPadB);
    var maxCash = 0;
    for (var ci = 0; ci < n; ci++) {
      if (curve[ci].totalCashUSD > maxCash) maxCash = curve[ci].totalCashUSD;
    }
    var yCashMax = maxCash > 1 ? maxCash * 1.12 : 100;

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

    cctx.font = '10.5px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
    cctx.fillStyle = ink3;
    cctx.textAlign = "right";
    cctx.textBaseline = "middle";
    cctx.fillText("$0", padL - 6, yCashAt(0));
    cctx.fillText(maxCash >= 1000 ? ("$" + (maxCash / 1000).toFixed(1) + "K") : fmtUsd(maxCash, 0), padL - 6, cPadT + 3);

    cctx.textAlign = "left";
    cctx.fillText(isEn() ? "Pending Cash (USD)" : "待回购与留存现金 (USD)", padL + 4, cPadT + 4);

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

    if (state.hoverIdx >= 0 && state.hoverIdx < n) {
      var chx = xAt(state.hoverIdx);
      cctx.strokeStyle = ink3;
      cctx.lineWidth = 1;
      cctx.beginPath();
      cctx.moveTo(chx, cPadT);
      cctx.lineTo(chx, CH - cPadB);
      cctx.stroke();
    }
  }

  function renderMatrixAndRolling() {
    if (!state.norm || !state.bt || !state.bt.ok) return;

    // 1. Strategy Matrix (Batch 1 or Batch 2 using current start/end/fees)
    var baseOverrides = {
      start: state.bt.metrics.startDay,
      end: state.config.end || null,
      initialBTC: state.config.initialBTC,
      feeRate: state.config.feeRate,
      slippageRate: state.config.slippageRate,
      monthlyUSD: state.config.monthlyUSD > 0 ? state.config.monthlyUSD : 500
    };
    var mat = VHE.compareStrategies(state.norm, state.activeBatch, baseOverrides);
    state.matrixResult = mat;
    var tbody = $("matrixTableBody");
    if (mat.ok) {
      tbody.innerHTML = mat.items.map(function (it, idx) {
        var m = it.metrics;
        var diffCls = it.vsGroupRefEqBTC > 1e-10 ? "up" : (it.vsGroupRefEqBTC < -1e-10 ? "dn" : "");
        var vText = idx === 0
          ? (isEn() ? "Group Baseline" : "本组对照基准")
          : (it.vsGroupRefEqBTC > 1e-10
            ? (isEn() ? "Window Ahead" : "本窗领先（非保证）")
            : (isEn() ? "Unproven" : "未证明增币能力"));
        return '<tr class="clickable" data-strat-idx="' + idx + '">'
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

    // 2. Rolling Windows (24/36/48m) for current config
    var rollKey = state.bt.config.hash;
    if (!state.rollingCache || state.rollingCache.key !== rollKey) {
      state.rollingCache = {
        key: rollKey,
        data: VHE.runRollingTests(state.norm, state.bt.config, [24, 36, 48])
      };
    }
    var rollRes = state.rollingCache.data;
    if (rollRes && rollRes.ok) {
      var curRoll = rollRes.results.find(function (r) { return r.windowMonths === state.rollingMonths; }) || rollRes.results[0];
      if (curRoll) {
        var wWorst = curRoll.worstWindow
          ? (fmtPct(curRoll.worstWindow.excessPct, 2, true) + " (" + curRoll.worstWindow.start.slice(0, 7) + ")")
          : "--";
        $("rollingKpiGrid").innerHTML = [
          [isEn() ? "Win Rate (Overlapping)" : "跑赢基准窗口占比", (curRoll.winRate * 100).toFixed(1) + "%", curRoll.winCount + " / " + curRoll.sampleCount + (isEn() ? " windows" : " 个月度起点")],
          [isEn() ? "Median Excess eqBTC" : "中位相对增币率", fmtPct(curRoll.medianExcessPct, 2, true), fmtSignedNum(curRoll.medianExcessBTC, 6, " BTC")],
          [isEn() ? "Worst Lagging Window" : "最差落后区间", wWorst, (isEn() ? "Unspent cash windows: " : "期末留有未回购现金：") + curRoll.openCashWindowCount],
          [isEn() ? "Rolling Verdict" : "滚动检验结论", curRoll.proven ? (isEn() ? "Median Positive" : "中位为正") : (isEn() ? "Unproven" : "未证明增币能力"), isEn() ? "Overlapping != independent" : "重叠窗口不代表独立胜率"]
        ].map(function (c) {
          return '<article class="kpi"><small>' + escHtml(c[0]) + '</small><b class="num">' + escHtml(c[1]) + '</b><span class="num">' + escHtml(c[2]) + "</span></article>";
        }).join("");
        drawRollingBars(curRoll);
      }
    }

    // 3. Pre-registered Out-of-Sample Evaluation (computed once per data source)
    if (!state.oosResult) {
      state.oosResult = VHE.runOutOfSampleEvaluation(state.norm);
    }
    if (state.oosResult && state.oosResult.ok) {
      var oos = state.oosResult;
      var labelEnMap = {
        hodl_0pct: "0% Band · Pure HODL Baseline",
        vhe_5pct_stop20: "5% Band · +20% Stop Buyback",
        vhe_10pct_stop20: "10% Band · +20% Stop Buyback",
        vhe_10pct_wait: "10% Band · Hold & Wait",
        vhe_10pct_timeout90: "10% Band · 90D Timeout",
        vhe_10pct_trend: "10% Band · Past Slope Filter"
      };
      $("oosTableBody").innerHTML = oos.trials.map(function (t) {
        var isSel = t.id === oos.trainSelectedCandidateId;
        var tag = isSel ? (isEn() ? " [Train #1]" : " [训练期最优非零仓]") : "";
        return "<tr" + (isSel ? ' class="active-row"' : "") + ">"
          + "<td><b>" + escHtml((isEn() ? (labelEnMap[t.id] || t.label) : t.label) + tag) + "</b></td>"
          + '<td class="r">' + fmtPct(t.trainExcessPct, 2, true) + "</td>"
          + '<td class="r ' + (t.oosExcessPct > 0 ? "up" : (t.oosExcessPct < 0 ? "dn" : "")) + '">' + fmtPct(t.oosExcessPct, 2, true) + "</td>"
          + '<td class="r">' + fmtPct(t.oosHighFeeExcessPct, 2, true) + "</td>"
          + '<td class="r">' + fmtUsd(t.oosCashUSD, 0) + "</td>"
          + '<td class="r">' + MINUS + (t.oosMaxDrawdownBTC * 100).toFixed(2) + "%</td>"
          + "</tr>";
      }).join("");
    }
  }

  function drawRollingBars(curRoll) {
    var cv = $("rollingChartCanvas");
    if (!cv || !curRoll || !curRoll.samples || curRoll.samples.length === 0) return;
    var setup = setupCanvas(cv);
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
    var ink3 = cssVar("--ink3", "#7a8394");
    var hair = cssVar("--hair", "rgba(128,128,128,0.18)");
    var green = cssVar("--green", "#16a34a");
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

    ctx.font = '10.5px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
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

  function renderFailedAndOpenLots(bt) {
    var tbody = $("failedCyclesBody");
    var rows = [];

    // Open un-repurchased lots first
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

    // Completed losing cycles
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
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--ink3)">'
        + (isEn() ? "No failed cycles or open un-repurchased lots in this window." : "当前窗口内无失败回合或未完成待回购子仓。")
        + "</td></tr>";
    } else {
      tbody.innerHTML = rows.join("");
    }
  }

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

  function renderTradeTable(bt) {
    var tbody = $("tradeTableBody");
    var list = bt.trades.filter(function (t) {
      if (state.tradeFilter === "sell") return t.action === "SELL";
      if (state.tradeFilter === "buy") return t.action !== "SELL";
      return true;
    });

    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--ink3)">'
        + (isEn() ? "No simulated trades under current filter." : "当前筛选条件下无模拟成交记录。")
        + "</td></tr>";
      return;
    }

    tbody.innerHTML = list.map(function (t) {
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
  }

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
      note: "仅包含 SatsGarden VHE 波动增币实验室模拟参数，不含真实定投账本记录。",
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
        executeSimulationAndRender();
        showToast(isEn() ? "Imported VHE simulation settings" : "已导入 VHE 实验设置");
      } catch (_) {
        showToast(isEn() ? "Failed to parse JSON file" : "无法解析该 JSON 文件");
      }
    };
    reader.readAsText(file);
  }

  function applyI18n() {
    document.title = tr("docTitle");
    document.documentElement.lang = isEn() ? "en" : "zh-CN";
    $("langZhBtn").classList.toggle("on", !isEn());
    $("langEnBtn").classList.toggle("on", isEn());
    if ($("inpInitCost")) $("inpInitCost").placeholder = tr("initCostPh");
    if ($("provSemanticsVal")) $("provSemanticsVal").textContent = tr("semValue");
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

    var fold = $("paramFold");
    var arrow = fold ? fold.querySelector(".fold-arrow") : null;
    if (fold && arrow) {
      arrow.textContent = fold.open ? tr("btnCollapseParam") : tr("btnExpandParam");
    }

    if (state.norm) {
      var mmdd = state.norm.meta.lastDay ? state.norm.meta.lastDay.slice(5) : "--";
      setStatusBadge(state.norm.meta.isLagged ? "lagged" : "fresh", mmdd);
      executeSimulationAndRender();
    } else if ($("vheUnavailableCard") && !$("vheUnavailableCard").hidden) {
      setStatusBadge("unavailable");
      renderUnavailableState();
    }
  }

  function bindEvents() {
    $("btnThemeToggle").addEventListener("click", function () {
      state.theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = state.theme;
      try { localStorage.setItem(THEME_KEY, state.theme); } catch (_) {}
      drawComparisonCharts();
      if (state.rollingCache && state.rollingCache.data && state.rollingCache.data.ok) {
        var curRoll = state.rollingCache.data.results.find(function (r) { return r.windowMonths === state.rollingMonths; });
        if (curRoll) drawRollingBars(curRoll);
      }
    });

    $("langZhBtn").addEventListener("click", function () {
      if (state.lang === "zh") return;
      state.lang = "zh";
      window.BTC_LANG = "zh";
      try { localStorage.setItem(LANG_KEY, "zh"); } catch (_) {}
      applyI18n();
    });

    $("langEnBtn").addEventListener("click", function () {
      if (state.lang === "en") return;
      state.lang = "en";
      window.BTC_LANG = "en";
      try { localStorage.setItem(LANG_KEY, "en"); } catch (_) {}
      applyI18n();
    });

    $("btnRefreshData").addEventListener("click", function () {
      loadHistoryData(true);
    });

    $("chartModeSeg").addEventListener("click", function (ev) {
      var btn = ev.target.closest("button[data-chart-mode]");
      if (!btn) return;
      state.chartMode = btn.getAttribute("data-chart-mode");
      var all = $("chartModeSeg").querySelectorAll("button");
      for (var i = 0; i < all.length; i++) all[i].classList.toggle("on", all[i] === btn);
      drawComparisonCharts();
    });

    $("startPresetStrip").addEventListener("click", function (ev) {
      var btn = ev.target.closest("button[data-start-preset]");
      if (!btn) return;
      var sDate = btn.getAttribute("data-start-preset");
      state.config = Object.assign({}, state.config, { start: sDate, end: null });
      saveConfigToLocal(state.config);
      syncFormFromConfig();
      executeSimulationAndRender();
    });

    $("paramFold").addEventListener("toggle", function () {
      var arrow = $("paramFold").querySelector(".fold-arrow");
      if (arrow) arrow.textContent = $("paramFold").open ? tr("btnCollapseParam") : tr("btnExpandParam");
    });

    $("btnReadLocalBtc").addEventListener("click", function () {
      var snap = readLocalHoldingsSnapshotReadOnly();
      if (snap === null) {
        showToast(isEn() ? "No local holdings found; keeping 0.30 BTC example" : "未检测到本机持仓记录，保留 0.30 BTC 示例仓位");
        return;
      }
      $("inpInitBtc").value = String(snap);
      state.config = Object.assign({}, state.config, { initialBTC: snap, positionSource: "local_snapshot" });
      saveConfigToLocal(state.config);
      executeSimulationAndRender();
      showToast(isEn() ? ("Read-only snapshot loaded: " + snap + " BTC") : ("已只读带入本机持仓：" + snap + " BTC（原账本未改动）"));
    });

    document.querySelectorAll("[data-fee-preset]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var parts = btn.getAttribute("data-fee-preset").split(",");
        $("inpFee").value = parts[0];
        $("inpSlip").value = parts[1];
        document.querySelectorAll("[data-fee-preset]").forEach(function (b) {
          b.classList.toggle("on", b === btn);
        });
      });
    });

    $("btnApplyParams").addEventListener("click", function () {
      var raw = readConfigFromForm();
      if (raw.initialBTC !== state.config.initialBTC && state.config.positionSource === "local_snapshot") {
        raw.positionSource = "example";
      }
      var check = VHE.validateConfig(raw);
      if (!check.ok) {
        $("runErrorBanner").hidden = false;
        $("runErrorBanner").textContent = check.errors.join(" ");
        showToast(check.errors[0]);
        return;
      }
      state.config = check.config;
      saveConfigToLocal(state.config);
      syncFormFromConfig();
      executeSimulationAndRender();
      showToast(isEn() ? "Simulation updated" : "已更新模拟结果");
    });

    $("btnResetParams").addEventListener("click", function () {
      state.config = VHE.validateConfig(VHE.DEFAULT_CONFIG).config;
      try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
      syncFormFromConfig();
      executeSimulationAndRender();
      showToast(isEn() ? "Restored experimental defaults" : "已恢复实验默认参数");
    });

    $("matrixBatchSeg").addEventListener("click", function (ev) {
      var btn = ev.target.closest("button[data-batch]");
      if (!btn) return;
      state.activeBatch = btn.getAttribute("data-batch");
      var all = $("matrixBatchSeg").querySelectorAll("button");
      for (var i = 0; i < all.length; i++) all[i].classList.toggle("on", all[i] === btn);
      renderMatrixAndRolling();
    });

    $("matrixTableBody").addEventListener("click", function (ev) {
      var trEl = ev.target.closest("tr[data-strat-idx]");
      if (!trEl || !state.matrixResult || !state.matrixResult.ok) return;
      var idx = Number(trEl.getAttribute("data-strat-idx"));
      var baseOverrides = {
        start: state.bt.metrics.startDay,
        end: state.config.end || null,
        initialBTC: state.config.initialBTC,
        feeRate: state.config.feeRate,
        slippageRate: state.config.slippageRate,
        monthlyUSD: state.config.monthlyUSD > 0 ? state.config.monthlyUSD : 500
      };
      if (state.activeBatch === "batch1") {
        var b1Configs = [
          { contributionMode: "none", tradeRatio: 0 },
          { contributionMode: "none", tradeRatio: 0.10, exitPolicy: "stop_up_20pct", trendFilter: "none" },
          { contributionMode: "none", tradeRatio: 0.10, exitPolicy: "hold_wait", trendFilter: "none" },
          { contributionMode: "none", tradeRatio: 0.10, exitPolicy: "timeout_90d", trendFilter: "none" },
          { contributionMode: "none", tradeRatio: 0.10, exitPolicy: "stop_up_20pct", trendFilter: "ma_slope_cap" },
          { contributionMode: "none", tradeRatio: 0.05, exitPolicy: "stop_up_20pct", trendFilter: "none" }
        ];
        if (b1Configs[idx]) {
          var v1 = VHE.validateConfig(Object.assign({}, state.config, baseOverrides, b1Configs[idx]));
          if (v1.ok) {
            state.config = v1.config;
            syncFormFromConfig();
            executeSimulationAndRender();
          }
        }
      } else {
        var b2Configs = [
          { contributionMode: "monthly_uniform", tradeRatio: 0 },
          { contributionMode: "monthly_ahr999", tradeRatio: 0 },
          { contributionMode: "monthly_uniform", tradeRatio: 0.10, exitPolicy: "stop_up_20pct" },
          { contributionMode: "monthly_ahr999", tradeRatio: 0.10, exitPolicy: "stop_up_20pct" }
        ];
        if (b2Configs[idx]) {
          var v2 = VHE.validateConfig(Object.assign({}, state.config, baseOverrides, b2Configs[idx]));
          if (v2.ok) {
            state.config = v2.config;
            syncFormFromConfig();
            executeSimulationAndRender();
          }
        }
      }
    });

    $("rollingWinSeg").addEventListener("click", function (ev) {
      var btn = ev.target.closest("button[data-roll-months]");
      if (!btn) return;
      state.rollingMonths = Number(btn.getAttribute("data-roll-months"));
      var all = $("rollingWinSeg").querySelectorAll("button");
      for (var i = 0; i < all.length; i++) all[i].classList.toggle("on", all[i] === btn);
      renderMatrixAndRolling();
    });

    $("tradeFilterSeg").addEventListener("click", function (ev) {
      var btn = ev.target.closest("button[data-trade-filter]");
      if (!btn || !state.bt || !state.bt.ok) return;
      state.tradeFilter = btn.getAttribute("data-trade-filter");
      var all = $("tradeFilterSeg").querySelectorAll("button");
      for (var i = 0; i < all.length; i++) all[i].classList.toggle("on", all[i] === btn);
      renderTradeTable(state.bt);
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

    // Pointer hover/touch inspection on main & cash charts
    function handleChartPointer(ev, wrapEl) {
      if (!state.bt || !state.bt.ok || !state.bt.curve || state.bt.curve.length < 2) return;
      var rect = wrapEl.getBoundingClientRect();
      var clientX = ev.touches && ev.touches[0] ? ev.touches[0].clientX : ev.clientX;
      var padL = 56;
      var padR = 12;
      var plotW = Math.max(40, rect.width - padL - padR);
      var ratio = (clientX - rect.left - padL) / plotW;
      var clamped = Math.max(0, Math.min(1, ratio));
      state.hoverIdx = Math.round(clamped * (state.bt.curve.length - 1));
      drawComparisonCharts();
    }

    ["mainChartWrap", "cashChartWrap"].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener("pointermove", function (ev) { handleChartPointer(ev, el); });
      el.addEventListener("pointerdown", function (ev) { handleChartPointer(ev, el); });
      el.addEventListener("pointerleave", function () {
        state.hoverIdx = -1;
        drawComparisonCharts();
      });
    });

    window.addEventListener("resize", function () {
      if (!state.bt || !state.bt.ok) return;
      drawComparisonCharts();
      if (state.rollingCache && state.rollingCache.data && state.rollingCache.data.ok) {
        var curRoll = state.rollingCache.data.results.find(function (r) { return r.windowMonths === state.rollingMonths; });
        if (curRoll) drawRollingBars(curRoll);
      }
    });
  }

  function init() {
    loadSavedConfig();
    syncFormFromConfig();
    bindEvents();
    applyI18n();
    loadHistoryData(false);
  }

  window.VHEUI = { init: init, reload: loadHistoryData };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
