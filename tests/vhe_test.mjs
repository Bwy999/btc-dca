#!/usr/bin/env node
/**
 * SatsGarden V28.2.0 · VHE 确定性单元测试与历史回放验收测试
 * 用法：node tests/vhe_test.mjs [仓库或解压根目录，默认 .] [--write-results docs/VHE_BACKTEST_RESULTS.json]
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const rootArg = args.find((a) => !a.startsWith("--")) || ".";
const root = path.resolve(rootArg);
const writeIdx = args.indexOf("--write-results");
const writeResultsRel = writeIdx >= 0 && args[writeIdx + 1] ? args[writeIdx + 1] : null;

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, name, detail = "") {
  if (cond) {
    passed++;
  } else {
    failed++;
    const msg = detail ? `${name} (${detail})` : name;
    failures.push(msg);
    console.error("✗ " + msg);
  }
}

function approx(a, b, tol = 1e-6) {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol;
}

// 1. Resolve VHEEngine (prefer built hashed asset referenced by vhe.html when present, else source/vhe-engine.js)
let enginePath = path.join(root, "source", "vhe-engine.js");
const vheHtmlPath = path.join(root, "vhe.html");
if (fs.existsSync(vheHtmlPath)) {
  const html = fs.readFileSync(vheHtmlPath, "utf8");
  const m = html.match(/assets\/vhe-engine\.[0-9a-f]{10}\.js/);
  assert(Boolean(m), "vhe.html 引用带 10 位哈希的 vhe-engine 资源");
  if (m) {
    enginePath = path.join(root, m[0]);
  }
}
assert(fs.existsSync(enginePath), "VHE 引擎文件存在", enginePath);

const engineCode = fs.readFileSync(enginePath, "utf8");
// Verify pure-function isolation: no DOM, no storage, no network APIs in engine
for (const forbidden of ["localStorage", "sessionStorage", "document.", "window.", "fetch(", "XMLHttpRequest", "btc_dca_ledger_v1", "btc_exec_v7"]) {
  assert(!engineCode.includes(forbidden), `引擎纯函数隔离：不含 ${forbidden}`);
}

const VHE = require(enginePath);
assert(typeof VHE.normalizeHistory === "function" && typeof VHE.runBacktest === "function", "VHEEngine 导出核心纯函数接口");

// 2. Load real bundled CYCLE_SEED via hashed asset
let seedAssetPath = null;
const assetsDir = path.join(root, "assets");
if (fs.existsSync(assetsDir)) {
  const seedFn = fs.readdirSync(assetsDir).find((f) => /^seed-cycle\.[0-9a-f]{10}\.js$/.test(f));
  if (seedFn) seedAssetPath = path.join(assetsDir, seedFn);
}
assert(Boolean(seedAssetPath && fs.existsSync(seedAssetPath)), "找到随包哈希种子 assets/seed-cycle.<hash>.js");
const seedSandbox = {};
vm.runInNewContext(fs.readFileSync(seedAssetPath, "utf8") + "\n;globalThis.__SEED = CYCLE_SEED;", seedSandbox);
const CYCLE_SEED = seedSandbox.__SEED;
assert(CYCLE_SEED && Array.isArray(CYCLE_SEED.rows) && CYCLE_SEED.rows.length === 5884, "CYCLE_SEED 包含 5884 条完整 UTC 日收盘");

function buildSyntheticSeries(startIso, prices) {
  const ms0 = Date.parse(startIso + "T00:00:00Z");
  return prices.map((close, idx) => ({
    date: new Date(ms0 + idx * 86400000).toISOString().slice(0, 10),
    close
  }));
}

// ============================================================================
// Test Group A: Synthetic Exact Math, Fee/Slippage, State Machine & Risk Priority
// ============================================================================
{
  // 205 warmup days at $62,000 -> MA200 = $62,000 -> +25% at $77,500, +40% at $86,800 (so $80,000 stays < +40%, isolating Lot A!)
  const warmup = new Array(205).fill(62000);
  // Day 205 (signal T): 78000 (+25.6% >= +25%, < +40%) -> Lot A SELL signal
  // Day 206 (exec T+1): 80000 (+28.7% < +40%) -> Lot A sells 0.01 BTC @ 80000 -> $800 cash, anchor = 80000
  // Day 207 (signal T): 55000 (<= 80000 * 0.70 = 56000, hits all 3 tiers -10/-20/-30%)
  // Day 208 (exec T+1): 60000 -> Lot A buys back with $800 @ 60000 -> 0.013333333333 BTC
  // Day 209: 60000 settle
  const prices = warmup.concat([78000, 80000, 55000, 60000, 60000]);
  const rows = buildSyntheticSeries("2023-01-01", prices);
  const startDay = rows[204].date; // 1 day before 64000 so upward cross happens on day 205

  // A1. Zero tradeRatio => identical to HODL
  const zeroBt = VHE.runBacktest(rows, {
    initialBTC: 0.3,
    start: startDay,
    tradeRatio: 0,
    feeRate: 0.001,
    slippageRate: 0.0005
  });
  assert(zeroBt.ok && zeroBt.audit.passed, "0% 波段回测运行并守恒通过");
  assert(zeroBt.trades.length === 0 && zeroBt.metrics.heldBTC === 0.3 && zeroBt.metrics.totalCashUSD === 0, "0% 波段与纯 HODL 完全一致（0 交易）");
  assert(approx(zeroBt.metrics.eqBTC, zeroBt.metrics.baselineEqBTC, 1e-12), "0% 波段期末 eqBTC === HODL");

  // A2. Synthetic zero-fee exact test (Spec Section 9 line 140)
  const synNoFee = VHE.runBacktest(rows, {
    initialBTC: 0.3,
    start: startDay,
    tradeRatio: 0.10,
    feeRate: 0,
    slippageRate: 0,
    exitPolicy: "stop_up_20pct"
  });
  assert(synNoFee.ok && synNoFee.audit.passed, "无费合成测试通过守恒审计");
  assert(synNoFee.trades.length === 2, "无费合成测试仅产生 1 次卖出 + 1 次回购成交", `actual=${synNoFee.trades.length}`);
  assert(approx(synNoFee.trades[0].netCashDeltaUSD, 800, 1e-9), "卖出 0.01 BTC @80000 净得 $800");
  assert(approx(synNoFee.trades[1].qtyBTC, 800 / 60000, 1e-10), "60000 全额回购得 0.0133333333 BTC");
  assert(approx(synNoFee.metrics.heldBTC, 0.3 + (800 / 60000 - 0.01), 1e-10), "原仓 0.3 -> 0.3033333333 BTC");
  assert(approx(synNoFee.metrics.coreBTC, 0.27 + (800 / 60000 - 0.01), 1e-10), "正净增币转入核心仓 coreBTC");

  // A3. Synthetic with fee=0.1%, slippage=0.05% formula verification
  const fee = 0.001;
  const slip = 0.0005;
  const synWithFee = VHE.runBacktest(rows, {
    initialBTC: 0.3,
    start: startDay,
    tradeRatio: 0.10,
    feeRate: fee,
    slippageRate: slip,
    exitPolicy: "stop_up_20pct"
  });
  const expSellNet = 0.01 * 80000 * (1 - slip) * (1 - fee);
  const expBuyBtc = (expSellNet * (1 - fee)) / (60000 * (1 + slip));
  assert(synWithFee.ok && synWithFee.audit.passed, "含费率与滑点合成测试通过守恒审计");
  assert(approx(synWithFee.trades[0].netCashDeltaUSD, expSellNet, 1e-10), "含费卖出净现金精确符合 qty*px*(1-slip)*(1-fee)");
  assert(approx(synWithFee.trades[1].qtyBTC, expBuyBtc, 1e-12), "含费买入币量精确符合 spend*(1-fee)/[px*(1+slip)]");
  assert(approx(synWithFee.metrics.heldBTC, 0.29 + expBuyBtc, 1e-12), "含费期末总持币精确核对");

  // A4. +20% Stop-loss buyback + Same-day risk priority + Core isolation (Spec Section 9 line 141)
  const warmup50k = new Array(205).fill(50000);
  const stopPrices = warmup50k.concat([64000, 65000, 79000, 80000, 78000]);
  const stopRows = buildSyntheticSeries("2023-01-01", stopPrices);
  const stopBt = VHE.runBacktest(stopRows, {
    initialBTC: 0.3,
    start: stopRows[204].date,
    tradeRatio: 0.10,
    feeRate: 0.001,
    slippageRate: 0.0005,
    exitPolicy: "stop_up_20pct"
  });
  assert(stopBt.ok && stopBt.audit.passed, "+20% 止损测试通过守恒审计");
  assert(stopBt.metrics.stopLossCount === 1 && stopBt.metrics.failedCycles === 1, "+20% 止损准确记录止损次数与失败回合");
  assert(approx(stopBt.metrics.coreBTC, 0.27, 1e-12), "止损亏损时核心仓 0.27 BTC 绝不减少、不补仓");
  assert(stopBt.metrics.heldBTC < 0.3 && stopBt.metrics.soldOutLossBTC > 0, "止损回购如实展示筹码损失与卖飞损失");
  const lotBTrades = stopBt.trades.filter((t) => t.lotId === "B" || t.lotId === "C");
  assert(lotBTrades.length === 0, "同日风险优先：止损触发当日禁止新增 B/C 子仓卖出信号");

  // A5. Sustained above threshold & single-tier trigger deduplication (Spec Section 9 line 142)
  const dupPrices = warmup50k.concat(new Array(15).fill(64000)).concat(new Array(10).fill(57000));
  const dupRows = buildSyntheticSeries("2023-01-01", dupPrices);
  const dupBt = VHE.runBacktest(dupRows, {
    initialBTC: 0.3,
    start: dupRows[204].date,
    tradeRatio: 0.10,
    feeRate: 0,
    slippageRate: 0,
    exitPolicy: "hold_wait"
  });
  assert(dupBt.ok && dupBt.audit.passed, "防重复成交与部分回购测试通过守恒审计");
  assert(dupBt.trades.filter((t) => t.action === "SELL").length === 1, "连续多日高于阈值只触发一次卖出");
  assert(dupBt.trades.filter((t) => t.action === "BUYBACK_TIER").length === 1, "连续处于同一回撤档位只触发一次该档回购");
  assert(approx(dupBt.metrics.pendingBuybackCashUSD, (640 * 2) / 3, 1e-9), "部分回购（1/3）后期末准确保留剩余 2/3 待回购现金");
  assert(dupBt.metrics.openLotsCount === 1, "未完成回合数量为 1，不强行假装回购完成");

  // A6. Last-day pending signal not fake-executed (Spec Section 9 line 143)
  const lastDayPrices = warmup50k.concat([64000]); // Signal happens on the very last day!
  const lastDayRows = buildSyntheticSeries("2023-01-01", lastDayPrices);
  const lastDayBt = VHE.runBacktest(lastDayRows, {
    initialBTC: 0.3,
    start: lastDayRows[204].date,
    tradeRatio: 0.10,
    feeRate: 0.001,
    slippageRate: 0.0005
  });
  assert(lastDayBt.ok && lastDayBt.trades.length === 0, "末日触发卖出信号不计为已成交记录、不偷用下一日");
  assert(lastDayBt.pendingSignals.length === 1 && lastDayBt.pendingSignals[0].type === "SELL", "末日挂起信号准确保留在 pendingSignals");
  assert(approx(lastDayBt.metrics.heldBTC, 0.3, 1e-12), "末日未执行信号不扣减真实持仓");
}

// ============================================================================
// Test Group B: Data Hygiene, Continuity, Unverified Rejection & Incomplete UTC Day
// ============================================================================
{
  // B1. Empty, duplicate, out-of-order
  assert(VHE.normalizeHistory(null, "2026-10-01").errorCode === "EMPTY_HISTORY", "空数据返回确定性 EMPTY_HISTORY");
  assert(VHE.normalizeHistory([], "2026-10-01").errorCode === "EMPTY_HISTORY", "空数组返回确定性 EMPTY_HISTORY");

  const dup = VHE.normalizeHistory([
    { date: "2025-01-01", close: 90000 },
    { date: "2025-01-01", close: 91000 }
  ], "2026-10-01");
  assert(!dup.ok && dup.errorCode === "DUPLICATE_DATE", "重复日期被严格拒绝 (DUPLICATE_DATE)");

  const ooo = VHE.normalizeHistory([
    { date: "2025-01-02", close: 91000 },
    { date: "2025-01-01", close: 90000 }
  ], "2026-10-01");
  assert(!ooo.ok && ooo.errorCode === "OUT_OF_ORDER_DATE", "乱序日期被严格拒绝 (OUT_OF_ORDER_DATE)");

  // B2. Missing day & NaN / 0 / negative price: grid alignment preserved without shifting dates!
  const gappy = VHE.normalizeHistory([
    { date: "2025-01-01", close: 90000 },
    // 2025-01-02 missing!
    { date: "2025-01-03", close: 0 },
    { date: "2025-01-04", close: Number.NaN },
    { date: "2025-01-05", close: 95000 }
  ], "2025-01-10");
  assert(gappy.ok && gappy.rows.length === 5 && gappy.meta.gapCount === 3, "缺日与 0/NaN 价格保留完整 5 日网格并标记 3 个缺口");
  assert(gappy.rows[1].date === "2025-01-02" && !gappy.rows[1].valid && gappy.rows[4].date === "2025-01-05" && gappy.rows[4].close === 95000, "缺日绝不把后续日期提前");

  // Window with gap rejected by default, and pauses MA under pause_signals
  const gapSeries = buildSyntheticSeries("2023-01-01", new Array(240).fill(50000));
  gapSeries[150].close = 0; // Invalid price inside warmup
  const gapNorm = VHE.normalizeHistory(gapSeries, "2025-01-01");
  const gapReject = VHE.runBacktest(gapNorm, { start: gapSeries[210].date });
  assert(!gapReject.ok && gapReject.errorCode === "DATA_GAP_IN_WINDOW", "含缺口窗口默认严格拒绝 (DATA_GAP_IN_WINDOW)");
  const gapPause = VHE.runBacktest(gapNorm, { start: gapSeries[210].date, gapPolicy: "pause_signals" });
  assert(gapPause.ok && gapPause.warnings.some((w) => w.includes("缺口")), "pause_signals 模式下缺口后重置均线预热并暂停信号");

  // B3. Incomplete current UTC day exclusion & staleness detection
  const incNorm = VHE.normalizeHistory([
    { date: "2026-11-24", close: 91000 },
    { date: "2026-11-25", close: 92000 },
    { date: "2026-11-26", close: 93000 } // Incomplete today!
  ], "2026-11-26T14:20:00Z");
  assert(incNorm.ok && incNorm.meta.lastDay === "2026-11-25" && incNorm.meta.excludedIncompleteDays === 1, "自动排除未完成 UTC 当日");
  assert(!incNorm.meta.isLagged, "距今 1 日的数据不标滞后");

  const lagNorm = VHE.normalizeHistory([
    { date: "2026-11-15", close: 90000 },
    { date: "2026-11-16", close: 91000 }
  ], "2026-11-26T14:20:00Z");
  assert(lagNorm.ok && lagNorm.meta.isLagged && lagNorm.meta.ageDays === 10, "超过 3 天准确标记滞后数据");

  // B4. Legacy unverified charts.json vs Schema-2 verified charts.json & file timestamp non-spoofing
  const legacyCharts = {
    v: 1,
    ts: Date.parse("2026-11-26T12:00:00Z"), // Recent file timestamp, old actual data!
    stale: [],
    priceAll: {
      start: "2023-01-01",
      v: new Array(250).fill(42000)
    }
  };
  const legNorm = VHE.normalizeHistory(legacyCharts, "2026-11-26T18:00:00Z");
  assert(legNorm.ok && legNorm.meta.verified === false, "旧版无显式 d 数组的 priceAll 标记为 verified=false");
  assert(legNorm.meta.lastDay === "2023-09-07" && legNorm.meta.updatedDay === "2026-11-26", "严禁用文件生成时间 ts 冒充末数据日 lastDay");
  const legBt = VHE.runBacktest(legNorm, { start: "2023-08-01" });
  assert(!legBt.ok && legBt.errorCode === "UNVERIFIED_SERIES_REJECTED", "未验证序列禁止进入正式回测");

  const verifiedCharts = {
    v: 1,
    ts: Date.parse("2026-11-26T12:00:00Z"),
    stale: [],
    priceAll: {
      schema: 2,
      start: "2023-01-01",
      d: buildSyntheticSeries("2023-01-01", new Array(250).fill(42000)).map((r) => r.date),
      v: new Array(250).fill(42000)
    }
  };
  const verNorm = VHE.normalizeHistory(verifiedCharts, "2026-11-26T18:00:00Z");
  assert(verNorm.ok && verNorm.meta.verified === true, "含显式 d 数组的 schema=2 priceAll 通过连续性校验");
  const verBt = VHE.runBacktest(verNorm, { start: "2023-08-01" });
  assert(verBt.ok && verBt.audit.passed, "已验证 schema=2 priceAll 可正常正式回测");

  // B5. Config validation boundaries
  assert(!VHE.validateConfig({ initialBTC: -0.1 }).ok, "拒绝负初始持仓");
  assert(!VHE.validateConfig({ tradeRatio: 0.15 }).ok, "拒绝超过 10% 上限的波段仓位");
  assert(!VHE.validateConfig({ buybackWeights: [0.5, 0.5, 0.2] }).ok, "拒绝权重和不为 1 的配置");
  assert(!VHE.validateConfig({ initialBTC: 0, initialCash: 0, contributionMode: "none" }).ok, "拒绝全零起始资产且无外部现金流");
}

// ============================================================================
// Test Group C: Prefix Invariance (Zero Look-Ahead Bias) & Execution Order
// ============================================================================
const seedNorm = VHE.normalizeHistory(CYCLE_SEED, "2026-11-26T00:00:00Z");
assert(seedNorm.ok && seedNorm.meta.isSeed && seedNorm.meta.isLagged && seedNorm.meta.validCount === 5884, "CYCLE_SEED 规范化通过且明确标为历史滞后种子");

{
  const baseCutoff = "2024-06-01";
  const shortRows = seedNorm.rows.filter((r) => r.date <= baseCutoff).map((r) => ({ date: r.date, close: r.close }));
  // Append 90 extreme future days (10x pump then 95% crash)
  const extremeFuture = [];
  const cutMs = Date.parse(baseCutoff + "T00:00:00Z");
  for (let d = 1; d <= 90; d++) {
    const dt = new Date(cutMs + d * 86400000).toISOString().slice(0, 10);
    const px = d <= 45 ? 500000 + d * 10000 : 8000;
    extremeFuture.push({ date: dt, close: px });
  }
  const longRows = shortRows.concat(extremeFuture);

  const btShort = VHE.runBacktest(shortRows, { initialBTC: 0.3, start: "2020-10-01", end: baseCutoff });
  const btLong = VHE.runBacktest(longRows, { initialBTC: 0.3, start: "2020-10-01", end: extremeFuture[extremeFuture.length - 1].date });

  assert(btShort.ok && btLong.ok, "Prefix Invariance 前后缀回测均成功运行");
  assert(btLong.curve.length === btShort.curve.length + 90, "扩展行情曲线长度精确增加 90 天");

  let curveIdentical = true;
  for (let i = 0; i < btShort.curve.length; i++) {
    const a = btShort.curve[i];
    const b = btLong.curve[i];
    if (a.date !== b.date || Math.abs(a.heldBTC - b.heldBTC) > 1e-15 || Math.abs(a.totalCashUSD - b.totalCashUSD) > 1e-12 || Math.abs(a.eqBTC - b.eqBTC) > 1e-15) {
      curveIdentical = false;
      break;
    }
  }
  assert(curveIdentical, "Prefix Invariance：追加极端未来行情后，此前每一日的持币、现金与 eqBTC 完全不变");

  const longPrefixTrades = btLong.trades.filter((t) => t.executionDay <= baseCutoff);
  assert(JSON.stringify(btShort.trades) === JSON.stringify(longPrefixTrades), "Prefix Invariance：此前全部已执行成交记录逐字段完全一致");
  assert(btLong.trades.every((t) => t.executionDay > t.signalDay), "全部成交严格满足 executionDay > signalDay");
}

// ============================================================================
// Test Group D: Section 11 Real Historical Replay Benchmarks + Rolling + Batch 1/2 + OOS
// ============================================================================
const expectedBenchmarks = [
  { start: "2017-12-01", exitPolicy: "stop_up_20pct", eqBTC: 0.299786, cashUSD: 0, relPct: -0.07, maxDDPct: 2.52 },
  { start: "2018-12-01", exitPolicy: "stop_up_20pct", eqBTC: 0.296712, cashUSD: 0, relPct: -1.10, maxDDPct: 2.54 },
  { start: "2021-11-01", exitPolicy: "stop_up_20pct", eqBTC: 0.296236, cashUSD: 0, relPct: -1.25, maxDDPct: 4.14 },
  { start: "2022-11-01", exitPolicy: "stop_up_20pct", eqBTC: 0.290296, cashUSD: 0, relPct: -3.23, maxDDPct: 4.22 },
  { start: "2024-01-01", exitPolicy: "stop_up_20pct", eqBTC: 0.293489, cashUSD: 0, relPct: -2.17, maxDDPct: 2.99 },
  { start: "2017-12-01", exitPolicy: "hold_wait", eqBTC: 0.287403, relPct: -4.20 },
  { start: "2017-12-01", exitPolicy: "timeout_90d", eqBTC: 0.283161, relPct: -5.61 }
];

const fixedWindowReport = [];
for (const b of expectedBenchmarks) {
  const res = VHE.runBacktest(seedNorm, {
    initialBTC: 0.3,
    start: b.start,
    tradeRatio: 0.10,
    exitPolicy: b.exitPolicy,
    feeRate: 0.001,
    slippageRate: 0.0005
  });
  assert(res.ok && res.audit.passed, `真实历史回放守恒通过 (${b.start} · ${b.exitPolicy})`);
  assert(approx(res.metrics.eqBTC, b.eqBTC, 1e-6), `真实历史回放 eqBTC 精确对齐参考值 (${b.start} · ${b.exitPolicy})`, `got=${res.metrics.eqBTC.toFixed(6)} exp=${b.eqBTC}`);
  assert(approx(res.metrics.netDiffEqPct * 100, b.relPct, 0.015), `真实历史回放相对 HODL 增币率一致 (${b.start} · ${b.exitPolicy})`);
  if (b.maxDDPct !== undefined) {
    assert(approx(res.metrics.maxEqBtcDrawdown * 100, b.maxDDPct, 0.015), `真实历史回放最大币本位回撤一致 (${b.start})`);
  }
  fixedWindowReport.push({
    start: res.metrics.startDay,
    end: res.metrics.endDay,
    exitPolicy: b.exitPolicy,
    configHash: res.config.hash,
    heldBTC: Number(res.metrics.heldBTC.toFixed(8)),
    pendingBuybackCashUSD: Number(res.metrics.pendingBuybackCashUSD.toFixed(2)),
    eqBTC: Number(res.metrics.eqBTC.toFixed(8)),
    baselineEqBTC: Number(res.metrics.baselineEqBTC.toFixed(8)),
    netDiffEqBTC: Number(res.metrics.netDiffEqBTC.toFixed(8)),
    netDiffEqPct: Number((res.metrics.netDiffEqPct * 100).toFixed(4)),
    maxEqBtcDrawdownPct: Number((res.metrics.maxEqBtcDrawdown * 100).toFixed(4)),
    vheTradeCount: res.metrics.vheTradeCount,
    completedCycles: res.metrics.completedCycles,
    failedCycles: res.metrics.failedCycles,
    stopLossCount: res.metrics.stopLossCount,
    soldOutLossBTC: Number(res.metrics.soldOutLossBTC.toFixed(8)),
    totalFeesUSD: Number(res.metrics.totalFeesUSD.toFixed(2)),
    verdict: res.metrics.verdictLabel
  });
}

// Batch 1 & Batch 2 strategy matrix & cashflow-parity enforcement
const batch1 = VHE.compareStrategies(seedNorm, "batch1", { start: "2021-11-01", initialBTC: 0.3 });
assert(batch1.ok && batch1.items.length === 6 && batch1.items.every((x) => x.audit.passed), "第一批无新增资金策略对照矩阵运行通过（6 组均守恒）");

const batch2 = VHE.compareStrategies(seedNorm, "batch2", { start: "2021-11-01", initialBTC: 0.1, monthlyUSD: 500 });
assert(batch2.ok && batch2.items.length === 4 && batch2.items.every((x) => x.audit.passed), "第二批同月度入金定投对照矩阵运行通过（4 组均守恒）");

const unfairMix = VHE.compareStrategies(seedNorm, [
  { id: "pure_hodl", config: { start: "2021-11-01", initialBTC: 0.3, contributionMode: "none" } },
  { id: "dca_plus", config: { start: "2021-11-01", initialBTC: 0.3, contributionMode: "monthly_uniform", monthlyUSD: 500 } }
]);
assert(!unfairMix.ok && unfairMix.errorCode === "CASHFLOW_MISMATCH", "禁止将无新增资金的纯 HODL 与持续入金策略混排比较");

// Rolling 24/36/48 months & Pre-registered Out-of-Sample Evaluation
const rolling = VHE.runRollingTests(seedNorm, {
  initialBTC: 0.3,
  tradeRatio: 0.10,
  exitPolicy: "stop_up_20pct",
  feeRate: 0.001,
  slippageRate: 0.0005
}, [24, 36, 48]);
assert(rolling.ok && rolling.results.length === 3 && rolling.results.every((r) => r.sampleCount > 50), "24/36/48 个月跨起点滚动检验全部完成");

const oosEval = VHE.runOutOfSampleEvaluation(seedNorm);
assert(oosEval.ok && oosEval.totalTrialsCount === 6, "预注册训练期 -> 样本外分段检验完成并报告全部 6 组试验");
assert(oosEval.researchGatePassed === false && oosEval.verdict === "未证明增币能力", "样本外未跑赢时如实输出『未证明增币能力』");

if (writeResultsRel) {
  const outFile = path.resolve(root, writeResultsRel);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const payload = {
    schema: 1,
    engineVersion: VHE.VERSION,
    generatedNote: "由 node tests/vhe_test.mjs 基于随包真实历史种子 CYCLE_SEED 确定性生成；未修改样本、未筛选赢家。",
    dataSource: {
      sourceType: seedNorm.meta.sourceType,
      sourceLabel: seedNorm.meta.sourceLabel,
      firstDay: seedNorm.meta.firstDay,
      lastDay: seedNorm.meta.lastDay,
      validCount: seedNorm.meta.validCount,
      rawSha256: seedNorm.meta.rawSha256,
      dataFingerprint: seedNorm.meta.fingerprint
    },
    fixedStartBenchmarks: fixedWindowReport,
    batch1LumpSum2021: batch1.items.map((it) => ({
      id: it.id,
      label: it.labelZh,
      configHash: it.configHash,
      heldBTC: Number(it.metrics.heldBTC.toFixed(8)),
      cashUSD: Number(it.metrics.totalCashUSD.toFixed(2)),
      eqBTC: Number(it.metrics.eqBTC.toFixed(8)),
      vsHodlEqPct: Number((it.vsGroupRefEqPct * 100).toFixed(4)),
      maxDrawdownPct: Number((it.metrics.maxEqBtcDrawdown * 100).toFixed(4)),
      failedCycles: it.metrics.failedCycles,
      verdict: it.metrics.verdictLabel
    })),
    batch2MonthlyDca2021: batch2.items.map((it) => ({
      id: it.id,
      label: it.labelZh,
      configHash: it.configHash,
      heldBTC: Number(it.metrics.heldBTC.toFixed(8)),
      cashUSD: Number(it.metrics.totalCashUSD.toFixed(2)),
      eqBTC: Number(it.metrics.eqBTC.toFixed(8)),
      vsUniformDcaEqPct: Number((it.vsGroupRefEqPct * 100).toFixed(4)),
      unitizedMaxDrawdownPct: Number((it.metrics.maxEqBtcDrawdown * 100).toFixed(4)),
      verdict: it.metrics.verdictLabel
    })),
    rollingWindowsStop20: rolling.results.map((r) => ({
      windowMonths: r.windowMonths,
      sampleCount: r.sampleCount,
      winCount: r.winCount,
      lossCount: r.lossCount,
      tieCount: r.tieCount,
      winRatePct: Number((r.winRate * 100).toFixed(2)),
      medianExcessPct: Number((r.medianExcessPct * 100).toFixed(4)),
      medianExcessBTC: Number(r.medianExcessBTC.toFixed(8)),
      openCashWindowCount: r.openCashWindowCount,
      worstWindow: r.worstWindow ? {
        start: r.worstWindow.start,
        end: r.worstWindow.end,
        excessPct: Number((r.worstWindow.excessPct * 100).toFixed(4)),
        cashUSD: Number(r.worstWindow.cashUSD.toFixed(2))
      } : null,
      bestWindow: r.bestWindow ? {
        start: r.bestWindow.start,
        end: r.bestWindow.end,
        excessPct: Number((r.bestWindow.excessPct * 100).toFixed(4))
      } : null,
      overlappingNotice: r.overlappingNotice,
      verdict: r.verdict
    })),
    outOfSampleEvaluation: oosEval
  };
  fs.writeFileSync(outFile, JSON.stringify(payload, null, 2) + "\n", "utf8");
}

if (failed > 0) {
  console.error(`未通过：通过 ${passed} 项，未通过 ${failed} 项`);
  process.exit(1);
}
console.log(`全部通过：通过 ${passed} 项，未通过 0 项`);
