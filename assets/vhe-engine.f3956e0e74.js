/* SatsGarden V28.2.0 · VHE (Volatility Harvesting / BTC-Accumulating Lab) Pure Engine
 * 纯函数量化回测引擎：零 DOM、零存储、零网络、零未来数据泄漏（strict close-only T -> T+1）。
 * 目标资产口径：长期增加真实 BTC 持仓与 BTC 等价资产 eqBTC = heldBTC + cashUSD / markPriceUSD。
 * 本文件由 tools/build.py 发布为带内容哈希的 assets/vhe-engine.<hash>.js，并可直接由 Node 单元测试加载。
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.VHEEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var VERSION = "28.2.0";
  var GENESIS_UTC_MS = Date.UTC(2009, 0, 3);
  var DAY_MS = 86400000;
  var ISO_DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
  var AHR_REFIT_A = 5.5856;
  var AHR_REFIT_B = -16.1567;
  var AHR_CLASSIC_A = 5.84;
  var AHR_CLASSIC_B = -17.01;
  var EPS = 1e-12;

  var DEFAULT_CONFIG = Object.freeze({
    initialBTC: 0.3,
    initialCash: 0,
    positionSource: "example",
    initialCostUSD: null,
    start: "2021-11-01",
    end: null,
    tradeRatio: 0.10,
    maLength: 200,
    sellThresholds: Object.freeze([0.25, 0.40, 0.55]),
    lotWeights: Object.freeze([1 / 3, 1 / 3, 1 / 3]),
    buybackDrawdowns: Object.freeze([0.10, 0.20, 0.30]),
    buybackWeights: Object.freeze([1 / 3, 1 / 3, 1 / 3]),
    feeRate: 0.001,
    slippageRate: 0.0005,
    exitPolicy: "stop_up_20pct",
    stopUpPct: 0.20,
    timeoutDays: 90,
    trendFilter: "none",
    trendLookback: 20,
    trendMaxSlope: 0.06,
    cooldownDays: 0,
    contributionMode: "none",
    monthlyUSD: 500,
    externalContributionSchedule: null,
    initialCashBaselinePolicy: "hold_cash",
    gapPolicy: "reject_window",
    allowUnverified: false
  });

  function parseIsoDayMs(str) {
    if (typeof str !== "string") return NaN;
    var s = str.trim().slice(0, 10);
    var m = ISO_DAY_RE.exec(s);
    if (!m) return NaN;
    var y = Number(m[1]);
    var mo = Number(m[2]);
    var d = Number(m[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return NaN;
    var ms = Date.UTC(y, mo - 1, d);
    var dt = new Date(ms);
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return NaN;
    return ms;
  }

  function formatUtcDay(ms) {
    var dt = new Date(ms);
    var y = dt.getUTCFullYear();
    var m = String(dt.getUTCMonth() + 1).padStart(2, "0");
    var d = String(dt.getUTCDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  function resolveAsOfDay(asOfUtc) {
    if (asOfUtc == null) {
      return formatUtcDay(Date.now());
    }
    if (asOfUtc instanceof Date) {
      if (!Number.isFinite(asOfUtc.getTime())) return null;
      return formatUtcDay(asOfUtc.getTime());
    }
    if (typeof asOfUtc === "number") {
      if (!Number.isFinite(asOfUtc)) return null;
      var ms = asOfUtc > 1e11 ? asOfUtc : asOfUtc * 1000;
      return formatUtcDay(ms);
    }
    if (typeof asOfUtc === "string") {
      var trimmed = asOfUtc.trim();
      var dayMs = parseIsoDayMs(trimmed);
      if (Number.isFinite(dayMs) && trimmed.length === 10) {
        return formatUtcDay(dayMs);
      }
      var parsed = Date.parse(trimmed);
      if (Number.isFinite(parsed)) {
        return formatUtcDay(parsed);
      }
    }
    return null;
  }

  function diffDays(dayB, dayA) {
    var msB = parseIsoDayMs(dayB);
    var msA = parseIsoDayMs(dayA);
    if (!Number.isFinite(msB) || !Number.isFinite(msA)) return NaN;
    return Math.round((msB - msA) / DAY_MS);
  }

  function fnv1aHex(str) {
    var h1 = 0x811c9dc5;
    var h2 = 0x01000193;
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      h1 ^= c;
      h1 = Math.imul(h1, 0x01000193) >>> 0;
      h2 ^= (c + (i & 255));
      h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
    }
    return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
  }

  function canonicalize(val) {
    if (val === null || typeof val !== "object") {
      if (typeof val === "number" && Number.isFinite(val)) {
        return Number(val.toFixed(10));
      }
      return val;
    }
    if (Array.isArray(val)) {
      return val.map(canonicalize);
    }
    var keys = Object.keys(val).sort();
    var out = {};
    for (var i = 0; i < keys.length; i++) {
      out[keys[i]] = canonicalize(val[keys[i]]);
    }
    return out;
  }

  function configHash(config) {
    return "cfg-" + fnv1aHex(JSON.stringify(canonicalize(config || {})));
  }

  function dataFingerprint(norm) {
    if (!norm || !Array.isArray(norm.rows) || norm.rows.length === 0) {
      return "data-empty";
    }
    var parts = [
      norm.meta && norm.meta.sourceType ? norm.meta.sourceType : "unknown",
      norm.rows[0].date,
      norm.rows[norm.rows.length - 1].date,
      String(norm.rows.length)
    ];
    var rolling = 0x811c9dc5;
    for (var i = 0; i < norm.rows.length; i++) {
      var r = norm.rows[i];
      var s = r.date + ":" + (r.valid ? r.close.toFixed(2) : "null");
      for (var j = 0; j < s.length; j++) {
        rolling ^= s.charCodeAt(j);
        rolling = Math.imul(rolling, 0x01000193) >>> 0;
      }
    }
    return "dat-" + fnv1aHex(parts.join("|")) + rolling.toString(16).padStart(8, "0");
  }

  /**
   * 规范化历史日线序列：
   * - 支持同源 data/v28/charts.json（验证显式日期数组 d；旧版仅含 start/v 标为 verified:false）
   * - 支持随包 CYCLE_SEED（标记 isSeed:true，绝不冒充今日实时数据）
   * - 支持单元测试夹具 [{date, close}] 或 {rows:[...]}
   * - 排除当前未完成 UTC 日（date >= asOfDay）
   * - 严格拒绝重复日、乱序日、非法日期；缺日或无效价格在完整 UTC 日历网格保留 null 并记录 gaps，绝不前移后续日期
   */
  function normalizeHistory(raw, asOfUtc) {
    var warnings = [];
    var errors = [];
    var asOfDay = resolveAsOfDay(asOfUtc);
    if (!asOfDay) {
      return {
        ok: false,
        errorCode: "INVALID_AS_OF_DATE",
        rows: [],
        meta: { verified: false, rowCount: 0, validCount: 0, gaps: [] },
        warnings: warnings,
        errors: ["无效的基准 UTC 日期 asOfUtc。"]
      };
    }
    var asOfMs = parseIsoDayMs(asOfDay);

    if (!raw || (typeof raw !== "object" && !Array.isArray(raw))) {
      return {
        ok: false,
        errorCode: "EMPTY_HISTORY",
        rows: [],
        meta: { verified: false, asOfDay: asOfDay, rowCount: 0, validCount: 0, gaps: [] },
        warnings: warnings,
        errors: ["输入历史数据为空或格式无效。"]
      };
    }

    var sourceType = "fixture";
    var sourceLabel = "确定性测试序列";
    var verified = true;
    var unverifiedReason = null;
    var isSeed = false;
    var staleFlag = false;
    var updatedDay = null;
    var rawSha256 = null;
    var priceSemantics = "daily_reference";
    var ahrByDay = Object.create(null);
    var extracted = [];

    // Case 1: data/v28/charts.json
    if (!Array.isArray(raw) && raw.v === 1 && raw.priceAll && typeof raw.priceAll === "object") {
      var pa = raw.priceAll;
      staleFlag = Array.isArray(raw.stale) && (raw.stale.indexOf("priceAll") >= 0 || raw.stale.indexOf("daily") >= 0);
      if (Number.isFinite(Number(raw.ts)) && Number(raw.ts) > 0) {
        updatedDay = formatUtcDay(Number(raw.ts));
      }
      if (raw.ahrAll && typeof raw.ahrAll.start === "string" && Array.isArray(raw.ahrAll.v)) {
        var ahrStartMs = parseIsoDayMs(raw.ahrAll.start);
        if (Number.isFinite(ahrStartMs)) {
          for (var ai = 0; ai < raw.ahrAll.v.length; ai++) {
            var aval = raw.ahrAll.v[ai];
            if (aval !== null && Number.isFinite(Number(aval))) {
              ahrByDay[formatUtcDay(ahrStartMs + ai * DAY_MS)] = Number(aval);
            }
          }
        }
      }
      if (Array.isArray(pa.d) && Array.isArray(pa.v)) {
        if (pa.d.length === 0 || pa.d.length !== pa.v.length) {
          return {
            ok: false,
            errorCode: "MALFORMED_PRICE_ALL",
            rows: [],
            meta: { verified: false, asOfDay: asOfDay, rowCount: 0, validCount: 0, gaps: [] },
            warnings: warnings,
            errors: ["charts.json 的 priceAll.d 与 priceAll.v 为空或长度不一致。"]
          };
        }
        sourceType = "charts_v28";
        sourceLabel = "同源预生成日参考价 (data/v28/charts.json)";
        verified = true;
        for (var i = 0; i < pa.d.length; i++) {
          extracted.push({ date: String(pa.d[i]), close: pa.v[i] });
        }
      } else if (typeof pa.start === "string" && Array.isArray(pa.v) && pa.v.length > 0) {
        var sMs = parseIsoDayMs(pa.start);
        if (!Number.isFinite(sMs)) {
          return {
            ok: false,
            errorCode: "INVALID_START_DATE",
            rows: [],
            meta: { verified: false, asOfDay: asOfDay, rowCount: 0, validCount: 0, gaps: [] },
            warnings: warnings,
            errors: ["priceAll.start 日期格式无效。"]
          };
        }
        sourceType = "charts_v28_unverified";
        sourceLabel = "同源旧格式序列 (未含显式日期校验 d)";
        verified = false;
        unverifiedReason = "legacy_priceAll_missing_explicit_dates";
        warnings.push("旧版 priceAll 仅含 start 与 v，缺少显式逐日日期数组 d，无法独立证明无缺日错位，已标记为未验证序列。");
        for (var j = 0; j < pa.v.length; j++) {
          extracted.push({ date: formatUtcDay(sMs + j * DAY_MS), close: pa.v[j] });
        }
      } else {
        return {
          ok: false,
          errorCode: "EMPTY_HISTORY",
          rows: [],
          meta: { verified: false, asOfDay: asOfDay, rowCount: 0, validCount: 0, gaps: [] },
          warnings: warnings,
          errors: ["charts.json 中缺少可用的 priceAll 数据。"]
        };
      }
    } else if (!Array.isArray(raw) && raw.schema === 1 && Array.isArray(raw.rows)) {
      // Case 2: CYCLE_SEED
      sourceType = "cycle_seed";
      sourceLabel = "随包历史种子 (CYCLE_SEED · " + (raw.source || "Bitview / BRK") + ")";
      isSeed = true;
      verified = true;
      rawSha256 = raw.rawSha256 || null;
      if (typeof raw.capturedAt === "string" && raw.capturedAt.length >= 10) {
        updatedDay = raw.capturedAt.slice(0, 10);
      }
      if (raw.rows.length === 0) {
        return {
          ok: false,
          errorCode: "EMPTY_HISTORY",
          rows: [],
          meta: { verified: false, isSeed: true, asOfDay: asOfDay, rowCount: 0, validCount: 0, gaps: [] },
          warnings: warnings,
          errors: ["CYCLE_SEED 行数据为空。"]
        };
      }
      for (var si = 0; si < raw.rows.length; si++) {
        var sr = raw.rows[si];
        if (!sr || typeof sr !== "object") {
          return {
            ok: false,
            errorCode: "MALFORMED_ROW",
            rows: [],
            meta: { verified: false, isSeed: true, asOfDay: asOfDay, rowCount: 0, validCount: 0, gaps: [] },
            warnings: warnings,
            errors: ["CYCLE_SEED 存在损坏的数据行。"]
          };
        }
        if (typeof sr.date === "string") {
          extracted.push({ date: sr.date, close: sr.close });
        } else if (Number.isFinite(Number(sr.time))) {
          var tSec = Number(sr.time);
          if (tSec <= 0 || Math.abs(tSec % 86400) > 0) {
            return {
              ok: false,
              errorCode: "NON_UTC_MIDNIGHT_TIMESTAMP",
              rows: [],
              meta: { verified: false, isSeed: true, asOfDay: asOfDay, rowCount: 0, validCount: 0, gaps: [] },
              warnings: warnings,
              errors: ["CYCLE_SEED 时间戳未对齐 UTC 00:00:00：" + String(sr.time)]
            };
          }
          extracted.push({ date: formatUtcDay(tSec * 1000), close: sr.close });
        } else {
          return {
            ok: false,
            errorCode: "INVALID_DATE",
            rows: [],
            meta: { verified: false, isSeed: true, asOfDay: asOfDay, rowCount: 0, validCount: 0, gaps: [] },
            warnings: warnings,
            errors: ["CYCLE_SEED 缺少有效日期或时间戳。"]
          };
        }
      }
    } else {
      // Case 3: Plain array or { rows, sourceType, verified }
      var arr = Array.isArray(raw) ? raw : (Array.isArray(raw.rows) ? raw.rows : null);
      if (!arr || arr.length === 0) {
        return {
          ok: false,
          errorCode: "EMPTY_HISTORY",
          rows: [],
          meta: { verified: false, asOfDay: asOfDay, rowCount: 0, validCount: 0, gaps: [] },
          warnings: warnings,
          errors: ["输入历史数组为空。"]
        };
      }
      if (!Array.isArray(raw)) {
        if (typeof raw.sourceType === "string") sourceType = raw.sourceType;
        if (typeof raw.sourceLabel === "string") sourceLabel = raw.sourceLabel;
        if (typeof raw.verified === "boolean") verified = raw.verified;
        if (typeof raw.isSeed === "boolean") isSeed = raw.isSeed;
        if (typeof raw.updatedDay === "string") updatedDay = raw.updatedDay;
      }
      for (var fi = 0; fi < arr.length; fi++) {
        var item = arr[fi];
        if (!item || typeof item !== "object") {
          return {
            ok: false,
            errorCode: "MALFORMED_ROW",
            rows: [],
            meta: { verified: false, asOfDay: asOfDay, rowCount: 0, validCount: 0, gaps: [] },
            warnings: warnings,
            errors: ["存在无效的数据行对象。"]
          };
        }
        var dStr = typeof item.date === "string"
          ? item.date
          : (Number.isFinite(Number(item.time)) ? formatUtcDay(Number(item.time) * 1000) : "");
        extracted.push({
          date: dStr,
          close: item.close !== undefined ? item.close : item.price,
          ahr: item.ahr !== undefined ? item.ahr : null
        });
      }
    }

    // Validate strict date format, chronological order, uniqueness, and exclude incomplete UTC day (>= asOfDay)
    var byMs = new Map();
    var prevMs = null;
    var excludedIncompleteDays = 0;
    var invalidPriceDays = [];

    for (var k = 0; k < extracted.length; k++) {
      var rec = extracted[k];
      var dMs = parseIsoDayMs(rec.date);
      if (!Number.isFinite(dMs)) {
        return {
          ok: false,
          errorCode: "INVALID_DATE",
          rows: [],
          meta: { verified: false, asOfDay: asOfDay, rowCount: 0, validCount: 0, gaps: [] },
          warnings: warnings,
          errors: ["无效的日期字符串：" + String(rec.date)]
        };
      }
      if (prevMs !== null) {
        if (dMs === prevMs) {
          return {
            ok: false,
            errorCode: "DUPLICATE_DATE",
            rows: [],
            meta: { verified: false, asOfDay: asOfDay, rowCount: 0, validCount: 0, gaps: [] },
            warnings: warnings,
            errors: ["存在重复日期：" + formatUtcDay(dMs)]
          };
        }
        if (dMs < prevMs) {
          return {
            ok: false,
            errorCode: "OUT_OF_ORDER_DATE",
            rows: [],
            meta: { verified: false, asOfDay: asOfDay, rowCount: 0, validCount: 0, gaps: [] },
            warnings: warnings,
            errors: ["日期乱序：" + formatUtcDay(dMs) + " 早于 " + formatUtcDay(prevMs)]
          };
        }
      }
      prevMs = dMs;
      if (dMs >= asOfMs) {
        excludedIncompleteDays++;
        continue;
      }
      var rawPx = rec.close;
      var numPx = (rawPx === null || rawPx === undefined || rawPx === "" || typeof rawPx === "boolean") ? NaN : Number(rawPx);
      var isValidPx = Number.isFinite(numPx) && numPx > 0;
      var iso = formatUtcDay(dMs);
      if (!isValidPx) {
        invalidPriceDays.push(iso);
      }
      byMs.set(dMs, {
        close: isValidPx ? numPx : null,
        valid: isValidPx,
        ahrExternal: rec.ahr != null && Number.isFinite(Number(rec.ahr)) ? Number(rec.ahr) : (ahrByDay[iso] !== undefined ? ahrByDay[iso] : null)
      });
    }

    if (byMs.size === 0) {
      return {
        ok: false,
        errorCode: "NO_COMPLETED_DAYS",
        rows: [],
        meta: {
          verified: verified,
          isSeed: isSeed,
          asOfDay: asOfDay,
          excludedIncompleteDays: excludedIncompleteDays,
          rowCount: 0,
          validCount: 0,
          gaps: []
        },
        warnings: warnings,
        errors: ["排除未完成 UTC 当日后没有可用历史日线。"]
      };
    }

    // Build dense UTC calendar grid from firstMs to lastMs without shifting dates across gaps
    var keys = Array.from(byMs.keys());
    var firstMs = keys[0];
    var lastMs = keys[keys.length - 1];
    var spanDays = Math.round((lastMs - firstMs) / DAY_MS) + 1;
    var rows = [];
    var gaps = [];
    var validCount = 0;

    for (var g = 0; g < spanDays; g++) {
      var curMs = firstMs + g * DAY_MS;
      var curIso = formatUtcDay(curMs);
      var hit = byMs.get(curMs);
      if (!hit) {
        gaps.push({ date: curIso, reason: "missing_day" });
        rows.push({
          index: g,
          date: curIso,
          timeSec: Math.round(curMs / 1000),
          close: null,
          valid: false,
          gapReason: "missing_day",
          ahrExternal: null
        });
      } else if (!hit.valid) {
        gaps.push({ date: curIso, reason: "invalid_price" });
        rows.push({
          index: g,
          date: curIso,
          timeSec: Math.round(curMs / 1000),
          close: null,
          valid: false,
          gapReason: "invalid_price",
          ahrExternal: null
        });
      } else {
        validCount++;
        rows.push({
          index: g,
          date: curIso,
          timeSec: Math.round(curMs / 1000),
          close: hit.close,
          valid: true,
          gapReason: null,
          ahrExternal: hit.ahrExternal
        });
      }
    }

    if (validCount === 0) {
      return {
        ok: false,
        errorCode: "NO_VALID_PRICES",
        rows: rows,
        meta: {
          verified: verified,
          isSeed: isSeed,
          asOfDay: asOfDay,
          rowCount: rows.length,
          validCount: 0,
          gaps: gaps
        },
        warnings: warnings,
        errors: ["全部日线价格无效（NaN / 0 / 负数 / 空值）。"]
      };
    }

    // Find actual first and last VALID data days
    var firstValidDay = null;
    var lastValidDay = null;
    for (var vi = 0; vi < rows.length; vi++) {
      if (rows[vi].valid) {
        if (!firstValidDay) firstValidDay = rows[vi].date;
        lastValidDay = rows[vi].date;
      }
    }

    var ageDays = diffDays(asOfDay, lastValidDay);
    var isLagged = Boolean(staleFlag || isSeed || (Number.isFinite(ageDays) && ageDays > 3));

    if (excludedIncompleteDays > 0) {
      warnings.push("已自动排除 " + excludedIncompleteDays + " 条未完成或未来 UTC 日数据。");
    }
    if (gaps.length > 0) {
      warnings.push("日序列检测到 " + gaps.length + " 个缺口或无效价格日，已保留原日历位置而未前移后续日期。");
    }
    if (isSeed) {
      warnings.push("当前使用随包 CYCLE_SEED 历史种子（末数据日 " + lastValidDay + "），仅供历史研究，不代表今日行情。");
    } else if (isLagged) {
      warnings.push("最新已完成数据日为 " + lastValidDay + "（距基准日 " + ageDays + " 天），数据滞后。");
    }

    var meta = {
      sourceType: sourceType,
      sourceLabel: sourceLabel,
      priceSemantics: priceSemantics,
      verified: verified,
      unverifiedReason: unverifiedReason,
      isSeed: isSeed,
      staleFlag: staleFlag,
      isLagged: isLagged,
      asOfDay: asOfDay,
      firstDay: firstValidDay,
      lastDay: lastValidDay,
      gridStartDay: rows[0].date,
      gridEndDay: rows[rows.length - 1].date,
      updatedDay: updatedDay,
      ageDays: ageDays,
      rowCount: rows.length,
      validCount: validCount,
      excludedIncompleteDays: excludedIncompleteDays,
      hasGaps: gaps.length > 0,
      gapCount: gaps.length,
      gaps: gaps,
      rawSha256: rawSha256
    };
    meta.fingerprint = dataFingerprint({ rows: rows, meta: meta });

    return {
      ok: true,
      errorCode: null,
      rows: rows,
      meta: meta,
      warnings: warnings,
      errors: errors
    };
  }

  /**
   * 纯过去信息特征计算（严禁使用 t+1 及之后任何数据）：
   * - ma：连续 maLength 个已完成有效日参考价的算术均值（与 AHR999 200 日调和均值严格区分）
   * - dev：close / ma - 1
   * - maSlope：相对 trendLookback 天前算术均线的变化率（仅使用 <= t 价格）
   * - hm200 / ahrRefit / ahrClassic：近 200 连续有效日调和均值及幂律拟合指标
   */
  var FEATURE_MEMO = typeof WeakMap === "function" ? new WeakMap() : null;

  function computeFeatures(rowsOrNorm, params) {
    var opts = params || {};
    var maLength = Number.isInteger(opts.maLength) && opts.maLength >= 2 ? opts.maLength : 200;
    var trendLookback = Number.isInteger(opts.trendLookback) && opts.trendLookback >= 1 ? opts.trendLookback : 20;
    var srcRows = Array.isArray(rowsOrNorm) ? rowsOrNorm : (rowsOrNorm && Array.isArray(rowsOrNorm.rows) ? rowsOrNorm.rows : []);
    var memoKey = maLength + ":" + trendLookback;
    if (FEATURE_MEMO && srcRows.length > 0) {
      var subMap = FEATURE_MEMO.get(srcRows);
      if (subMap && subMap[memoKey]) {
        return subMap[memoKey];
      }
    }

    var out = new Array(srcRows.length);
    var contig = 0;

    for (var i = 0; i < srcRows.length; i++) {
      var r = srcRows[i];
      var valid = Boolean(r && r.valid && Number.isFinite(r.close) && r.close > 0);
      if (!valid) {
        contig = 0;
        out[i] = {
          index: i,
          date: r ? r.date : "",
          close: null,
          valid: false,
          gapReason: r ? r.gapReason || "invalid" : "invalid",
          contiguousValid: 0,
          ma: null,
          dev: null,
          maSlope: null,
          hm200: null,
          ahrRefit: null,
          ahrClassic: null
        };
        continue;
      }

      contig++;
      var ma = null;
      var dev = null;
      if (contig >= maLength) {
        // Exact arithmetic window sum over [i - maLength + 1 .. i] to avoid cumulative float drift
        var sumClose = 0;
        for (var j = i - maLength + 1; j <= i; j++) {
          sumClose += srcRows[j].close;
        }
        ma = sumClose / maLength;
        dev = r.close / ma - 1;
      }

      var maSlope = null;
      if (ma !== null && i >= trendLookback && out[i - trendLookback] && out[i - trendLookback].ma !== null && out[i - trendLookback].ma > 0) {
        maSlope = ma / out[i - trendLookback].ma - 1;
      }

      var hm200 = null;
      var ahrRefit = null;
      var ahrClassic = null;
      if (contig >= 200) {
        var invSum = 0;
        for (var h = i - 199; h <= i; h++) {
          invSum += 1 / srcRows[h].close;
        }
        hm200 = 200 / invSum;
        var dMs = parseIsoDayMs(r.date);
        var ageFromGenesis = Math.round((dMs - GENESIS_UTC_MS) / DAY_MS);
        if (ageFromGenesis > 0) {
          var logAge = Math.log10(ageFromGenesis);
          var fitRefit = Math.pow(10, AHR_REFIT_A * logAge + AHR_REFIT_B);
          var fitClassic = Math.pow(10, AHR_CLASSIC_A * logAge + AHR_CLASSIC_B);
          ahrRefit = (r.close * r.close) / (hm200 * fitRefit);
          ahrClassic = (r.close * r.close) / (hm200 * fitClassic);
        }
      }

      out[i] = {
        index: i,
        date: r.date,
        close: r.close,
        valid: true,
        gapReason: null,
        contiguousValid: contig,
        ma: ma,
        dev: dev,
        maSlope: maSlope,
        hm200: hm200,
        ahrRefit: r.ahrExternal != null && Number.isFinite(r.ahrExternal) ? r.ahrExternal : ahrRefit,
        ahrClassic: ahrClassic
      };
    }

    if (FEATURE_MEMO && srcRows.length > 0) {
      var bucket = FEATURE_MEMO.get(srcRows) || Object.create(null);
      bucket[memoKey] = out;
      FEATURE_MEMO.set(srcRows, bucket);
    }

    return out;
  }

  function validateNumberArray(arr, expectedLen, minVal, maxVal, requireStrictlyIncreasing, requireSumOne, label, errors) {
    if (!Array.isArray(arr) || arr.length !== expectedLen) {
      errors.push(label + " 必须是长度为 " + expectedLen + " 的数组。");
      return null;
    }
    var clean = [];
    var sum = 0;
    for (var i = 0; i < arr.length; i++) {
      var v = Number(arr[i]);
      if (!Number.isFinite(v) || v < minVal || v > maxVal) {
        errors.push(label + "[" + i + "] 超出合法数值范围 [" + minVal + ", " + maxVal + "]。");
        return null;
      }
      if (requireStrictlyIncreasing && i > 0 && v <= clean[i - 1]) {
        errors.push(label + " 必须严格递增。");
        return null;
      }
      clean.push(v);
      sum += v;
    }
    if (requireSumOne && Math.abs(sum - 1) > 1e-6) {
      errors.push(label + " 权重之和必须等于 1（当前为 " + sum.toFixed(6) + "）。");
      return null;
    }
    return clean;
  }

  function validateConfig(rawConfig) {
    var cfg = Object.assign({}, DEFAULT_CONFIG, rawConfig || {});
    var errors = [];

    var initialBTC = Number(cfg.initialBTC);
    if (!Number.isFinite(initialBTC) || initialBTC < 0 || initialBTC > 100000) {
      errors.push("初始 BTC 数量必须是 [0, 100000] 内的有限非负数。");
    }

    var initialCash = Number(cfg.initialCash);
    if (!Number.isFinite(initialCash) || initialCash < 0 || initialCash > 1e11) {
      errors.push("初始现金必须是有限非负数。");
    }

    var initialCostUSD = cfg.initialCostUSD === null || cfg.initialCostUSD === undefined || cfg.initialCostUSD === ""
      ? null
      : Number(cfg.initialCostUSD);
    if (initialCostUSD !== null && (!Number.isFinite(initialCostUSD) || initialCostUSD < 0)) {
      errors.push("初始净投入成本必须为空或有限非负数。");
    }

    var tradeRatio = Number(cfg.tradeRatio);
    if (!Number.isFinite(tradeRatio) || tradeRatio < 0 || tradeRatio > 0.10 + 1e-9) {
      errors.push("波段实验仓比例 tradeRatio 必须在 0%–10%（0–0.10）之间。");
    } else if (tradeRatio > 0.10) {
      tradeRatio = 0.10;
    }

    var maLength = Number(cfg.maLength);
    if (!Number.isInteger(maLength) || maLength < 2 || maLength > 400) {
      errors.push("均线长度 maLength 必须是 [2, 400] 的整数。");
    }

    var sellThresholds = validateNumberArray(cfg.sellThresholds, 3, 0.01, 10, true, false, "卖出偏离阈值 sellThresholds", errors);
    var lotWeights = validateNumberArray(cfg.lotWeights, 3, 0, 1, false, true, "子仓权重 lotWeights", errors);
    var buybackDrawdowns = validateNumberArray(cfg.buybackDrawdowns, 3, 0.01, 0.95, true, false, "分层回撤阈值 buybackDrawdowns", errors);
    var buybackWeights = validateNumberArray(cfg.buybackWeights, 3, 0, 1, false, true, "回购资金权重 buybackWeights", errors);

    var feeRate = Number(cfg.feeRate);
    if (!Number.isFinite(feeRate) || feeRate < 0 || feeRate > 0.05) {
      errors.push("单边手续费率 feeRate 必须在 [0, 0.05] 之间。");
    }

    var slippageRate = Number(cfg.slippageRate);
    if (!Number.isFinite(slippageRate) || slippageRate < 0 || slippageRate > 0.05) {
      errors.push("单边滑点率 slippageRate 必须在 [0, 0.05] 之间。");
    }

    var validExits = ["stop_up_20pct", "hold_wait", "timeout_90d"];
    if (validExits.indexOf(cfg.exitPolicy) < 0) {
      errors.push("退出策略 exitPolicy 无效：" + String(cfg.exitPolicy));
    }

    var stopUpPct = Number(cfg.stopUpPct);
    if (!Number.isFinite(stopUpPct) || stopUpPct <= 0 || stopUpPct > 5) {
      errors.push("止损回购涨幅 stopUpPct 必须在 (0, 5] 之间。");
    }

    var timeoutDays = Number(cfg.timeoutDays);
    if (!Number.isInteger(timeoutDays) || timeoutDays < 1 || timeoutDays > 3650) {
      errors.push("超时退出天数 timeoutDays 必须是 [1, 3650] 的整数。");
    }

    var validTrend = ["none", "ma_slope_cap"];
    if (validTrend.indexOf(cfg.trendFilter) < 0) {
      errors.push("趋势过滤模式 trendFilter 无效：" + String(cfg.trendFilter));
    }

    var trendLookback = Number(cfg.trendLookback);
    if (!Number.isInteger(trendLookback) || trendLookback < 1 || trendLookback > 200) {
      errors.push("趋势回看天数 trendLookback 必须是 [1, 200] 的整数。");
    }

    var trendMaxSlope = Number(cfg.trendMaxSlope);
    if (!Number.isFinite(trendMaxSlope) || trendMaxSlope <= 0 || trendMaxSlope > 5) {
      errors.push("趋势过滤斜率上限 trendMaxSlope 必须在 (0, 5] 之间。");
    }

    var cooldownDays = Number(cfg.cooldownDays);
    if (!Number.isInteger(cooldownDays) || cooldownDays < 0 || cooldownDays > 3650) {
      errors.push("冷却期天数 cooldownDays 必须是 [0, 3650] 的整数。");
    }

    var validContrib = ["none", "monthly_uniform", "monthly_ahr999", "custom"];
    if (validContrib.indexOf(cfg.contributionMode) < 0) {
      errors.push("外部资金流模式 contributionMode 无效：" + String(cfg.contributionMode));
    }

    var monthlyUSD = Number(cfg.monthlyUSD);
    if (!Number.isFinite(monthlyUSD) || monthlyUSD < 0 || monthlyUSD > 1e9) {
      errors.push("每月外部入金金额 monthlyUSD 必须是有限非负数。");
    }

    var validCashBase = ["hold_cash", "buy_day1"];
    if (validCashBase.indexOf(cfg.initialCashBaselinePolicy) < 0) {
      errors.push("初始现金基准策略 initialCashBaselinePolicy 无效。");
    }

    var validGapPolicies = ["reject_window", "pause_signals"];
    if (validGapPolicies.indexOf(cfg.gapPolicy) < 0) {
      errors.push("数据缺口策略 gapPolicy 无效。");
    }

    var customSchedule = null;
    if (Array.isArray(cfg.externalContributionSchedule)) {
      customSchedule = [];
      var seenDates = new Set();
      for (var si = 0; si < cfg.externalContributionSchedule.length; si++) {
        var item = cfg.externalContributionSchedule[si];
        if (!item || typeof item !== "object") {
          errors.push("外部入金计划项格式无效。");
          break;
        }
        var dMs = parseIsoDayMs(item.date);
        var amt = Number(item.amountUSD);
        if (!Number.isFinite(dMs) || !Number.isFinite(amt) || amt < 0) {
          errors.push("外部入金计划存在非法日期或负数金额。");
          break;
        }
        var dIso = formatUtcDay(dMs);
        if (seenDates.has(dIso)) {
          errors.push("外部入金计划存在重复日期：" + dIso);
          break;
        }
        seenDates.add(dIso);
        customSchedule.push({ date: dIso, amountUSD: amt });
      }
    }

    var hasExternal = (cfg.contributionMode === "monthly_uniform" || cfg.contributionMode === "monthly_ahr999") && monthlyUSD > 0
      || (customSchedule && customSchedule.some(function (x) { return x.amountUSD > 0; }));
    if (errors.length === 0 && initialBTC === 0 && initialCash === 0 && !hasExternal) {
      errors.push("起始 BTC、起始现金与外部现金流不能同时为 0。");
    }

    if (errors.length > 0) {
      return { ok: false, errors: errors, config: null };
    }

    var normalized = {
      initialBTC: initialBTC,
      initialCash: initialCash,
      positionSource: cfg.positionSource === "local_snapshot" ? "local_snapshot" : "example",
      initialCostUSD: initialCostUSD,
      start: cfg.start ? String(cfg.start).slice(0, 10) : null,
      end: cfg.end ? String(cfg.end).slice(0, 10) : null,
      tradeRatio: tradeRatio,
      maLength: maLength,
      sellThresholds: sellThresholds,
      lotWeights: lotWeights,
      buybackDrawdowns: buybackDrawdowns,
      buybackWeights: buybackWeights,
      feeRate: feeRate,
      slippageRate: slippageRate,
      exitPolicy: cfg.exitPolicy,
      stopUpPct: stopUpPct,
      timeoutDays: timeoutDays,
      trendFilter: cfg.trendFilter,
      trendLookback: trendLookback,
      trendMaxSlope: trendMaxSlope,
      cooldownDays: cooldownDays,
      contributionMode: cfg.contributionMode,
      monthlyUSD: monthlyUSD,
      externalContributionSchedule: customSchedule,
      initialCashBaselinePolicy: cfg.initialCashBaselinePolicy,
      gapPolicy: cfg.gapPolicy,
      allowUnverified: Boolean(cfg.allowUnverified)
    };
    normalized.hash = configHash(normalized);
    return { ok: true, errors: [], config: normalized };
  }

  /**
   * 生成按月外部入金日期表（每个自然月在 [startDay, endDay] 内的首个有效日）：
   * 外部现金在信号日注入现金池，买入指令严格在 T+1 执行（末日注入保留现金，不虚构 T+1 成交）。
   */
  function buildMonthlyContributionSchedule(rows, startIdx, endIdx, monthlyUSD) {
    if (!(monthlyUSD > 0)) return [];
    var out = [];
    var seenMonth = "";
    for (var i = startIdx; i <= endIdx; i++) {
      var r = rows[i];
      if (!r || !r.valid) continue;
      var ym = r.date.slice(0, 7);
      if (ym !== seenMonth) {
        seenMonth = ym;
        out.push({ date: r.date, amountUSD: monthlyUSD });
      }
    }
    return out;
  }

  function ahrDynamicMultiplier(ahrVal) {
    if (ahrVal === null || !Number.isFinite(ahrVal)) return 1.0;
    if (ahrVal < 0.45) return 1.5;
    if (ahrVal <= 1.20) return 1.0;
    return 0.0;
  }

  /**
   * 运行单次回测（严格 close-only，T 日收盘信号 -> T+1 收盘带滑点与费用模拟执行）。
   */
  function runBacktest(historyOrRows, rawConfig) {
    var val = validateConfig(rawConfig);
    if (!val.ok) {
      return {
        ok: false,
        errorCode: "INVALID_CONFIG",
        errors: val.errors,
        warnings: []
      };
    }
    var cfg = val.config;

    var norm;
    if (historyOrRows && typeof historyOrRows === "object" && Array.isArray(historyOrRows.rows) && historyOrRows.meta && historyOrRows.ok !== undefined) {
      norm = historyOrRows;
    } else {
      norm = normalizeHistory(historyOrRows, "9999-12-31");
    }

    if (!norm.ok) {
      return {
        ok: false,
        errorCode: norm.errorCode || "INVALID_HISTORY",
        errors: norm.errors || ["历史数据校验未通过。"],
        warnings: norm.warnings || [],
        meta: norm.meta || null
      };
    }

    if (!norm.meta.verified && !cfg.allowUnverified) {
      return {
        ok: false,
        errorCode: "UNVERIFIED_SERIES_REJECTED",
        errors: ["当前历史序列缺少显式日期连续性证明（verified=false），根据数据规范禁止进入正式回测。"],
        warnings: norm.warnings.slice(),
        meta: norm.meta
      };
    }

    var warnings = norm.warnings.slice();
    if (!norm.meta.verified && cfg.allowUnverified) {
      warnings.push("警告：正在未验证日期连续性的序列上运行实验模拟，结果不得作为正式结论。");
    }

    var fRows = computeFeatures(norm.rows, {
      maLength: cfg.maLength,
      trendLookback: cfg.trendLookback
    });

    // Locate startIdx and endIdx
    var startDayReq = cfg.start || fRows[Math.min(fRows.length - 1, cfg.maLength)].date;
    var endDayReq = cfg.end || norm.meta.lastDay;
    if (parseIsoDayMs(startDayReq) >= parseIsoDayMs(endDayReq)) {
      return {
        ok: false,
        errorCode: "INVALID_DATE_RANGE",
        errors: ["回测开始日必须早于结束日（" + startDayReq + " >= " + endDayReq + "）。"],
        warnings: warnings,
        meta: norm.meta
      };
    }

    var startIdx = -1;
    var endIdx = -1;
    for (var idx = 0; idx < fRows.length; idx++) {
      if (startIdx < 0 && fRows[idx].date >= startDayReq && fRows[idx].valid) {
        startIdx = idx;
      }
      if (fRows[idx].date <= endDayReq && fRows[idx].valid) {
        endIdx = idx;
      }
    }

    if (startIdx < 0 || endIdx < 0 || startIdx >= endIdx) {
      return {
        ok: false,
        errorCode: "EMPTY_BACKTEST_WINDOW",
        errors: ["选定区间内有效日线不足以构成回测窗口。"],
        warnings: warnings,
        meta: norm.meta
      };
    }

    // Require at least maLength completed prior days before startIdx so both startIdx-1 and startIdx have valid MA
    if (startIdx < cfg.maLength) {
      return {
        ok: false,
        errorCode: "INSUFFICIENT_WARMUP",
        errors: ["回测起点 " + fRows[startIdx].date + " 前有效历史不足 " + cfg.maLength + " 日预热期（最早有效日 " + norm.meta.firstDay + "）。"],
        warnings: warnings,
        meta: norm.meta
      };
    }

    // Check gaps inside [startIdx - cfg.maLength, endIdx]
    var windowGaps = [];
    for (var gi = startIdx - cfg.maLength; gi <= endIdx; gi++) {
      if (!fRows[gi].valid) {
        windowGaps.push(fRows[gi].date);
      }
    }
    if (windowGaps.length > 0) {
      if (cfg.gapPolicy === "reject_window") {
        return {
          ok: false,
          errorCode: "DATA_GAP_IN_WINDOW",
          errors: ["回测或预热区间内存在 " + windowGaps.length + " 个缺日或无效价格日（如 " + windowGaps[0] + "），已拒绝该窗口以防信号失真。"],
          warnings: warnings,
          meta: norm.meta
        };
      } else {
        warnings.push("回测或预热区间含 " + windowGaps.length + " 个缺口日，已在缺口后暂停信号直至重新积累连续 " + cfg.maLength + " 日收盘。");
      }
    }

    if (cfg.contributionMode === "monthly_ahr999" && fRows[startIdx].date < "2026-01-01") {
      warnings.push("AHR999 新拟合系数（A=5.5856, B=−16.1567）基于 2026 年前历史拟合，在早期区间回放存在模型选择后见风险。");
    }
    if (cfg.positionSource !== "local_snapshot") {
      warnings.push("初始仓位 " + cfg.initialBTC + " BTC 为示例模拟值，不代表你的真实持仓。");
    }

    // External contribution schedule map
    var scheduleList = [];
    if (cfg.contributionMode === "custom" && Array.isArray(cfg.externalContributionSchedule)) {
      scheduleList = cfg.externalContributionSchedule.filter(function (s) {
        return s.date >= fRows[startIdx].date && s.date <= fRows[endIdx].date && s.amountUSD > 0;
      });
    } else if (cfg.contributionMode === "monthly_uniform" || cfg.contributionMode === "monthly_ahr999") {
      scheduleList = buildMonthlyContributionSchedule(fRows, startIdx, endIdx, cfg.monthlyUSD);
    }
    var inflowByDate = Object.create(null);
    for (var sci = 0; sci < scheduleList.length; sci++) {
      inflowByDate[scheduleList[sci].date] = (inflowByDate[scheduleList[sci].date] || 0) + scheduleList[sci].amountUSD;
    }

    // Initialize VHE & Same-Cashflow Baseline accounts
    var expTotalBTC = cfg.initialBTC * cfg.tradeRatio;
    var coreBTC = cfg.initialBTC - expTotalBTC;
    var lotIds = ["A", "B", "C"];
    var lots = [];
    var assignedLotSum = 0;
    for (var li = 0; li < 3; li++) {
      var lBtc = li < 2 ? expTotalBTC * cfg.lotWeights[li] : Math.max(0, expTotalBTC - assignedLotSum);
      assignedLotSum += lBtc;
      lots.push({
        lotId: lotIds[li],
        sellThreshold: cfg.sellThresholds[li],
        initialBTC: lBtc,
        hodlRefBTC: lBtc,
        btc: lBtc,
        soldQtyBTC: 0,
        boughtQtyBTC: 0,
        transferredToCoreBTC: 0,
        cumulativeLostBTC: 0,
        state: "HOLDING",
        anchorPrice: null,
        sellSignalDay: null,
        sellExecDay: null,
        sellExecIdx: -1,
        lastCompleteIdx: -999999,
        cashUSD: 0,
        tierCashUSD: [0, 0, 0],
        tierTriggered: [false, false, false],
        tierFilled: [false, false, false],
        pending: null,
        completedCycles: 0,
        failedCycles: 0,
        stopLossExits: 0,
        timeoutExits: 0
      });
    }

    var externalCashUSD = cfg.initialCash;
    var pendingDcaSpendUSD = 0;
    var pendingDcaSignalDay = null;
    var pendingDcaReason = null;

    var baselineHeldBTC = cfg.initialBTC;
    var baselineCashUSD = cfg.initialCash;
    var pendingBaseSpendUSD = 0;

    // Conservation accumulators
    var totalExternalInflowUSD = 0;
    var totalVheSoldBTC = 0;
    var totalVheBoughtBTC = 0;
    var totalVheSellNetUSD = 0;
    var totalVheBuySpentUSD = 0;
    var totalDcaBoughtBTC = 0;
    var totalDcaSpentUSD = 0;
    var totalFeesUSD = 0;
    var totalSlippageUSD = 0;
    var baselineFeesUSD = 0;

    // Cycle & trade tracking
    var trades = [];
    var cycles = [];
    var cycleSeq = 0;
    var completedCycles = 0;
    var completedWinCycles = 0;
    var failedCycles = 0;
    var stopLossCount = 0;
    var timeoutExitCount = 0;
    var maxWaitDays = 0;
    var blockedByTrendCount = 0;

    // Unitized BTC-equivalent NAV for exact cashflow-adjusted BTC drawdown
    var firstPrice = fRows[startIdx].close;
    var initEqBTC = cfg.initialBTC + (cfg.initialCash > 0 ? cfg.initialCash / firstPrice : 0);
    var vheUnits = initEqBTC > 0 ? initEqBTC : 0;
    var baseUnits = initEqBTC > 0 ? initEqBTC : 0;
    var runningMaxVheNav = vheUnits > 0 ? 1.0 : 0;
    var runningMaxBaseNav = baseUnits > 0 ? 1.0 : 0;
    var maxEqBtcDrawdown = 0;
    var maxBaselineBtcDrawdown = 0;

    var curve = [];

    function currentHeldBTC() {
      return coreBTC + lots[0].btc + lots[1].btc + lots[2].btc;
    }
    function currentLotCashUSD() {
      return lots[0].cashUSD + lots[1].cashUSD + lots[2].cashUSD;
    }
    function currentTotalCashUSD() {
      return externalCashUSD + currentLotCashUSD();
    }

    for (var i = startIdx; i <= endIdx; i++) {
      var row = fRows[i];
      var day = row.date;
      var px = row.close;

      // If gapPolicy === "pause_signals" and today's price is missing, carry forward holdings/cash without executing or signaling
      if (!row.valid || !(px > 0)) {
        var prevPt = curve.length > 0 ? curve[curve.length - 1] : null;
        var lastMark = prevPt ? prevPt.price : firstPrice;
        var gHeld = currentHeldBTC();
        var gLotCash = currentLotCashUSD();
        var gTotCash = externalCashUSD + gLotCash;
        var gEq = gHeld + gTotCash / lastMark;
        var gBaseEq = baselineHeldBTC + baselineCashUSD / lastMark;
        curve.push({
          date: day,
          price: lastMark,
          gap: true,
          ma: null,
          dev: null,
          heldBTC: gHeld,
          coreBTC: coreBTC,
          lotCashUSD: gLotCash,
          externalCashUSD: externalCashUSD,
          totalCashUSD: gTotCash,
          eqBTC: gEq,
          baselineHeldBTC: baselineHeldBTC,
          baselineCashUSD: baselineCashUSD,
          baselineEqBTC: gBaseEq,
          unitNav: vheUnits > 0 ? gEq / vheUnits : 1,
          drawdownBTC: prevPt ? prevPt.drawdownBTC : 0
        });
        continue;
      }

      // 1. External cash inflow on day i (identical for VHE and same-cashflow baseline)
      var inflowToday = inflowByDate[day] || 0;
      if (inflowToday > 0) {
        var preEqVhe = currentHeldBTC() + currentTotalCashUSD() / px;
        var preNavVhe = vheUnits > 0 ? preEqVhe / vheUnits : 1.0;
        var inflowEqBtc = inflowToday / px;
        vheUnits += preNavVhe > 0 ? inflowEqBtc / preNavVhe : inflowEqBtc;
        if (runningMaxVheNav === 0) runningMaxVheNav = 1.0;

        var preEqBase = baselineHeldBTC + baselineCashUSD / px;
        var preNavBase = baseUnits > 0 ? preEqBase / baseUnits : 1.0;
        baseUnits += preNavBase > 0 ? inflowEqBtc / preNavBase : inflowEqBtc;
        if (runningMaxBaseNav === 0) runningMaxBaseNav = 1.0;

        externalCashUSD += inflowToday;
        baselineCashUSD += inflowToday;
        totalExternalInflowUSD += inflowToday;
      }

      // 2. Execute pending orders scheduled from prior valid day (strictly T+1 execution!)
      if (pendingBaseSpendUSD > 0) {
        var bSpend = Math.min(baselineCashUSD, pendingBaseSpendUSD);
        pendingBaseSpendUSD = 0;
        if (bSpend > EPS) {
          var bFee = bSpend * cfg.feeRate;
          var bGot = (bSpend * (1 - cfg.feeRate)) / (px * (1 + cfg.slippageRate));
          baselineCashUSD = Math.max(0, baselineCashUSD - bSpend);
          if (baselineCashUSD < EPS) baselineCashUSD = 0;
          baselineHeldBTC += bGot;
          baselineFeesUSD += bFee;
        }
      }

      if (pendingDcaSpendUSD > 0) {
        var dSpend = Math.min(externalCashUSD, pendingDcaSpendUSD);
        var dSigDay = pendingDcaSignalDay;
        var dReason = pendingDcaReason;
        pendingDcaSpendUSD = 0;
        pendingDcaSignalDay = null;
        pendingDcaReason = null;
        if (dSpend > EPS) {
          var cashBeforeDca = currentTotalCashUSD();
          var btcBeforeDca = currentHeldBTC();
          var dExecPx = px * (1 + cfg.slippageRate);
          var dFee = dSpend * cfg.feeRate;
          var dGot = (dSpend * (1 - cfg.feeRate)) / dExecPx;
          var dSlipUSD = dGot * px * cfg.slippageRate;
          externalCashUSD = Math.max(0, externalCashUSD - dSpend);
          if (externalCashUSD < EPS) externalCashUSD = 0;

          // Route DCA BTC: (1 - tradeRatio) to coreBTC, and tradeRatio * lotWeight to HOLDING lots (if mid-cycle, route to coreBTC so active lot cycle stays isolated)
          var expDcaTotal = dGot * cfg.tradeRatio;
          var routedToLots = 0;
          for (var dl = 0; dl < 3; dl++) {
            if (lots[dl].state === "HOLDING" && lots[dl].pending === null && cfg.tradeRatio > 0) {
              var addLot = expDcaTotal * cfg.lotWeights[dl];
              lots[dl].btc += addLot;
              lots[dl].hodlRefBTC += addLot;
              routedToLots += addLot;
            }
          }
          coreBTC += (dGot - routedToLots);

          totalDcaBoughtBTC += dGot;
          totalDcaSpentUSD += dSpend;
          totalFeesUSD += dFee;
          totalSlippageUSD += dSlipUSD;

          trades.push({
            tradeId: trades.length + 1,
            signalDay: dSigDay,
            executionDay: day,
            action: "DCA_BUY",
            lotId: "DCA",
            cycleId: null,
            reason: dReason,
            marketPrice: px,
            execPrice: dExecPx,
            qtyBTC: dGot,
            grossUSD: dSpend,
            netCashDeltaUSD: -dSpend,
            feeUSD: dFee,
            slippageUSD: dSlipUSD,
            cashBefore: cashBeforeDca,
            cashAfter: currentTotalCashUSD(),
            btcBefore: btcBeforeDca,
            btcAfter: currentHeldBTC()
          });
        }
      }

      for (var liExec = 0; liExec < 3; liExec++) {
        var lot = lots[liExec];
        if (!lot.pending) continue;
        var act = lot.pending;
        lot.pending = null;

        if (act.type === "SELL") {
          var qty = lot.btc;
          if (qty > EPS) {
            var cashBeforeSell = currentTotalCashUSD();
            var btcBeforeSell = currentHeldBTC();
            var sellExecPx = px * (1 - cfg.slippageRate);
            var grossSellUSD = qty * px;
            var afterSlipSellUSD = qty * sellExecPx;
            var slipSellUSD = grossSellUSD - afterSlipSellUSD;
            var feeSellUSD = afterSlipSellUSD * cfg.feeRate;
            var netSellUSD = afterSlipSellUSD * (1 - cfg.feeRate);

            cycleSeq++;
            lot.activeCycleId = cycleSeq;
            lot.btc = 0;
            lot.soldQtyBTC = qty;
            lot.boughtQtyBTC = 0;
            lot.cashUSD = netSellUSD;
            lot.anchorPrice = sellExecPx;
            lot.sellSignalDay = act.signalDay;
            lot.sellExecDay = day;
            lot.sellExecIdx = i;
            var t0 = netSellUSD * cfg.buybackWeights[0];
            var t1 = netSellUSD * cfg.buybackWeights[1];
            var t2 = Math.max(0, netSellUSD - t0 - t1);
            lot.tierCashUSD = [t0, t1, t2];
            lot.tierTriggered = [false, false, false];
            lot.tierFilled = [false, false, false];
            lot.state = "WAITING_BUYBACK";

            totalVheSoldBTC += qty;
            totalVheSellNetUSD += netSellUSD;
            totalFeesUSD += feeSellUSD;
            totalSlippageUSD += slipSellUSD;

            trades.push({
              tradeId: trades.length + 1,
              signalDay: act.signalDay,
              executionDay: day,
              action: "SELL",
              lotId: lot.lotId,
              cycleId: lot.activeCycleId,
              reason: act.reason,
              marketPrice: px,
              execPrice: sellExecPx,
              qtyBTC: qty,
              grossUSD: grossSellUSD,
              netCashDeltaUSD: netSellUSD,
              feeUSD: feeSellUSD,
              slippageUSD: slipSellUSD,
              cashBefore: cashBeforeSell,
              cashAfter: currentTotalCashUSD(),
              btcBefore: btcBeforeSell,
              btcAfter: currentHeldBTC()
            });
          } else {
            lot.state = "HOLDING";
          }
        } else if (act.type === "BUYBACK_TIER") {
          var spendTier = 0;
          for (var ti = 0; ti < act.tiers.length; ti++) {
            var tIdx = act.tiers[ti];
            spendTier += lot.tierCashUSD[tIdx];
            lot.tierCashUSD[tIdx] = 0;
            lot.tierFilled[tIdx] = true;
          }
          spendTier = Math.min(lot.cashUSD, spendTier);
          if (spendTier > EPS) {
            var cashBeforeBuy = currentTotalCashUSD();
            var btcBeforeBuy = currentHeldBTC();
            var buyExecPx = px * (1 + cfg.slippageRate);
            var feeBuyUSD = spendTier * cfg.feeRate;
            var gotBTC = (spendTier * (1 - cfg.feeRate)) / buyExecPx;
            var slipBuyUSD = gotBTC * px * cfg.slippageRate;

            lot.cashUSD = Math.max(0, lot.cashUSD - spendTier);
            if (lot.cashUSD < EPS) lot.cashUSD = 0;
            lot.btc += gotBTC;
            lot.boughtQtyBTC += gotBTC;

            totalVheBoughtBTC += gotBTC;
            totalVheBuySpentUSD += spendTier;
            totalFeesUSD += feeBuyUSD;
            totalSlippageUSD += slipBuyUSD;

            trades.push({
              tradeId: trades.length + 1,
              signalDay: act.signalDay,
              executionDay: day,
              action: "BUYBACK_TIER",
              lotId: lot.lotId,
              cycleId: lot.activeCycleId,
              reason: act.reason,
              marketPrice: px,
              execPrice: buyExecPx,
              qtyBTC: gotBTC,
              grossUSD: spendTier,
              netCashDeltaUSD: -spendTier,
              feeUSD: feeBuyUSD,
              slippageUSD: slipBuyUSD,
              cashBefore: cashBeforeBuy,
              cashAfter: currentTotalCashUSD(),
              btcBefore: btcBeforeBuy,
              btcAfter: currentHeldBTC()
            });
          }

          if (lot.tierFilled[0] && lot.tierFilled[1] && lot.tierFilled[2]) {
            if (lot.cashUSD > 0 && lot.cashUSD < 1e-9) lot.cashUSD = 0;
            var waitDaysDone = i - lot.sellExecIdx;
            if (waitDaysDone > maxWaitDays) maxWaitDays = waitDaysDone;
            var deltaBTC = lot.btc - lot.soldQtyBTC;
            var outcome = "COMPLETE_GAIN";
            if (deltaBTC > EPS) {
              coreBTC += deltaBTC;
              lot.transferredToCoreBTC += deltaBTC;
              lot.btc = lot.soldQtyBTC;
              completedWinCycles++;
            } else {
              if (deltaBTC < -EPS) {
                lot.cumulativeLostBTC += Math.abs(deltaBTC);
                failedCycles++;
                outcome = "COMPLETE_LOSS";
              }
            }
            completedCycles++;
            lot.completedCycles++;
            if (outcome === "COMPLETE_LOSS") lot.failedCycles++;
            cycles.push({
              cycleId: lot.activeCycleId,
              lotId: lot.lotId,
              sellSignalDay: lot.sellSignalDay,
              sellExecDay: lot.sellExecDay,
              closeDay: day,
              waitDays: waitDaysDone,
              anchorPrice: lot.anchorPrice,
              closePrice: px,
              soldBTC: lot.soldQtyBTC,
              repurchasedBTC: lot.boughtQtyBTC,
              netDeltaBTC: deltaBTC,
              exitType: "ALL_TIERS_FILLED",
              outcome: outcome
            });
            lot.state = "HOLDING";
            lot.lastCompleteIdx = i;
          } else {
            lot.state = "PARTIAL_BUYBACK";
          }
        } else if (act.type === "STOP_LOSS_BUYBACK" || act.type === "TIMEOUT_BUYBACK") {
          var spendRem = lot.cashUSD;
          lot.tierCashUSD = [0, 0, 0];
          if (spendRem > EPS) {
            var cashBeforeExit = currentTotalCashUSD();
            var btcBeforeExit = currentHeldBTC();
            var exitExecPx = px * (1 + cfg.slippageRate);
            var feeExitUSD = spendRem * cfg.feeRate;
            var exitGotBTC = (spendRem * (1 - cfg.feeRate)) / exitExecPx;
            var slipExitUSD = exitGotBTC * px * cfg.slippageRate;

            lot.cashUSD = 0;
            lot.btc += exitGotBTC;
            lot.boughtQtyBTC += exitGotBTC;

            totalVheBoughtBTC += exitGotBTC;
            totalVheBuySpentUSD += spendRem;
            totalFeesUSD += feeExitUSD;
            totalSlippageUSD += slipExitUSD;

            trades.push({
              tradeId: trades.length + 1,
              signalDay: act.signalDay,
              executionDay: day,
              action: act.type,
              lotId: lot.lotId,
              cycleId: lot.activeCycleId,
              reason: act.reason,
              marketPrice: px,
              execPrice: exitExecPx,
              qtyBTC: exitGotBTC,
              grossUSD: spendRem,
              netCashDeltaUSD: -spendRem,
              feeUSD: feeExitUSD,
              slippageUSD: slipExitUSD,
              cashBefore: cashBeforeExit,
              cashAfter: currentTotalCashUSD(),
              btcBefore: btcBeforeExit,
              btcAfter: currentHeldBTC()
            });
          } else {
            lot.cashUSD = 0;
          }

          var waitDaysExit = i - lot.sellExecIdx;
          if (waitDaysExit > maxWaitDays) maxWaitDays = waitDaysExit;
          if (act.type === "STOP_LOSS_BUYBACK") {
            stopLossCount++;
            lot.stopLossExits++;
          } else {
            timeoutExitCount++;
            lot.timeoutExits++;
          }

          var exitDeltaBTC = lot.btc - lot.soldQtyBTC;
          var exitOutcome = "EXIT_LOSS";
          if (exitDeltaBTC > EPS) {
            coreBTC += exitDeltaBTC;
            lot.transferredToCoreBTC += exitDeltaBTC;
            lot.btc = lot.soldQtyBTC;
            completedWinCycles++;
            exitOutcome = "EXIT_GAIN";
          } else if (exitDeltaBTC < -EPS) {
            lot.cumulativeLostBTC += Math.abs(exitDeltaBTC);
            failedCycles++;
            lot.failedCycles++;
          }
          completedCycles++;
          lot.completedCycles++;
          cycles.push({
            cycleId: lot.activeCycleId,
            lotId: lot.lotId,
            sellSignalDay: lot.sellSignalDay,
            sellExecDay: lot.sellExecDay,
            closeDay: day,
            waitDays: waitDaysExit,
            anchorPrice: lot.anchorPrice,
            closePrice: px,
            soldBTC: lot.soldQtyBTC,
            repurchasedBTC: lot.boughtQtyBTC,
            netDeltaBTC: exitDeltaBTC,
            exitType: act.type,
            outcome: exitOutcome
          });
          lot.state = "HOLDING";
          lot.lastCompleteIdx = i;
        }
      }

      // 3. End-of-day mark-to-market & unitized drawdown
      var eodHeld = currentHeldBTC();
      var eodLotCash = currentLotCashUSD();
      var eodTotCash = externalCashUSD + eodLotCash;
      var eodEqBTC = eodHeld + eodTotCash / px;
      var eodBaseEqBTC = baselineHeldBTC + baselineCashUSD / px;

      var unitNav = vheUnits > 0 ? eodEqBTC / vheUnits : 1.0;
      if (unitNav > runningMaxVheNav) runningMaxVheNav = unitNav;
      var ddVhe = runningMaxVheNav > 0 ? Math.max(0, 1 - unitNav / runningMaxVheNav) : 0;
      if (ddVhe > maxEqBtcDrawdown) maxEqBtcDrawdown = ddVhe;

      var baseNav = baseUnits > 0 ? eodBaseEqBTC / baseUnits : 1.0;
      if (baseNav > runningMaxBaseNav) runningMaxBaseNav = baseNav;
      var ddBase = runningMaxBaseNav > 0 ? Math.max(0, 1 - baseNav / runningMaxBaseNav) : 0;
      if (ddBase > maxBaselineBtcDrawdown) maxBaselineBtcDrawdown = ddBase;

      curve.push({
        date: day,
        price: px,
        gap: false,
        ma: row.ma,
        dev: row.dev,
        heldBTC: eodHeld,
        coreBTC: coreBTC,
        lotCashUSD: eodLotCash,
        externalCashUSD: externalCashUSD,
        totalCashUSD: eodTotCash,
        eqBTC: eodEqBTC,
        baselineHeldBTC: baselineHeldBTC,
        baselineCashUSD: baselineCashUSD,
        baselineEqBTC: eodBaseEqBTC,
        unitNav: unitNav,
        drawdownBTC: ddVhe
      });

      // 4. End-of-day T signal evaluation (scheduled for T+1; never peeks at i+1!)
      // 4a. Initial cash day-1 buy policy (if configured) or scheduled external DCA signal
      if (i === startIdx && cfg.initialCash > 0 && cfg.initialCashBaselinePolicy === "buy_day1") {
        pendingBaseSpendUSD += baselineCashUSD;
        pendingDcaSpendUSD += externalCashUSD;
        pendingDcaSignalDay = day;
        pendingDcaReason = "INITIAL_CASH_DAY1_BUY";
      }
      if (inflowToday > 0) {
        if (cfg.contributionMode === "monthly_ahr999") {
          var mult = ahrDynamicMultiplier(row.ahrRefit);
          var desired = Math.min(externalCashUSD, inflowToday * mult);
          if (desired > EPS) {
            pendingBaseSpendUSD += Math.min(baselineCashUSD, inflowToday * mult);
            pendingDcaSpendUSD += desired;
            pendingDcaSignalDay = day;
            pendingDcaReason = "DCA_AHR999_" + mult.toFixed(1) + "X";
          }
        } else {
          var uDesired = Math.min(externalCashUSD, inflowToday);
          if (uDesired > EPS) {
            pendingBaseSpendUSD += Math.min(baselineCashUSD, inflowToday);
            pendingDcaSpendUSD += uDesired;
            pendingDcaSignalDay = day;
            pendingDcaReason = "DCA_UNIFORM_1.0X";
          }
        }
      }

      // 4b. VHE risk exit & tiered buyback signals (same-day risk priority!)
      var riskTriggeredToday = false;
      for (var liSig = 0; liSig < 3; liSig++) {
        var wLot = lots[liSig];
        if ((wLot.state === "WAITING_BUYBACK" || wLot.state === "PARTIAL_BUYBACK") && wLot.pending === null) {
          var waited = i - wLot.sellExecIdx;
          if (waited > maxWaitDays) maxWaitDays = waited;

          if (cfg.exitPolicy === "stop_up_20pct" && px >= wLot.anchorPrice * (1 + cfg.stopUpPct)) {
            wLot.pending = {
              type: "STOP_LOSS_BUYBACK",
              signalDay: day,
              signalPrice: px,
              reason: "较卖出成交锚点 $" + wLot.anchorPrice.toFixed(2) + " 上涨 ≥" + (cfg.stopUpPct * 100).toFixed(1) + "% 触发止损回购"
            };
            riskTriggeredToday = true;
          } else if (cfg.exitPolicy === "timeout_90d" && waited >= cfg.timeoutDays) {
            wLot.pending = {
              type: "TIMEOUT_BUYBACK",
              signalDay: day,
              signalPrice: px,
              reason: "等待回购满 " + waited + " 天触发超时退出"
            };
            riskTriggeredToday = true;
          } else {
            var hitTiers = [];
            var hitLabels = [];
            for (var tb = 0; tb < 3; tb++) {
              if (!wLot.tierTriggered[tb] && px <= wLot.anchorPrice * (1 - cfg.buybackDrawdowns[tb])) {
                wLot.tierTriggered[tb] = true;
                hitTiers.push(tb);
                hitLabels.push("−" + (cfg.buybackDrawdowns[tb] * 100).toFixed(0) + "%");
              }
            }
            if (hitTiers.length > 0) {
              wLot.pending = {
                type: "BUYBACK_TIER",
                tiers: hitTiers,
                signalDay: day,
                signalPrice: px,
                reason: "较卖出成交锚点回撤达 " + hitLabels.join("/") + " 触发分层回购"
              };
            }
          }
        }
      }

      // 4c. VHE upward-crossing sell signals (blocked if any lot triggered risk exit today)
      if (!riskTriggeredToday && cfg.tradeRatio > 0 && row.dev !== null && i > 0 && fRows[i - 1].valid && fRows[i - 1].dev !== null) {
        var prevDev = fRows[i - 1].dev;
        var curDev = row.dev;
        var trendBlocked = cfg.trendFilter === "ma_slope_cap" && (row.maSlope === null || row.maSlope > cfg.trendMaxSlope);
        for (var ls = 0; ls < 3; ls++) {
          var sLot = lots[ls];
          if (sLot.state === "HOLDING" && sLot.pending === null && sLot.btc > EPS) {
            if (i - sLot.lastCompleteIdx <= cfg.cooldownDays) continue;
            if (prevDev < sLot.sellThreshold && curDev >= sLot.sellThreshold) {
              if (trendBlocked) {
                blockedByTrendCount++;
              } else {
                sLot.pending = {
                  type: "SELL",
                  signalDay: day,
                  signalPrice: px,
                  signalDev: curDev,
                  reason: "偏离率向上穿越 +" + (sLot.sellThreshold * 100).toFixed(0) + "%（" + (prevDev * 100).toFixed(1) + "% → +" + (curDev * 100).toFixed(1) + "%）"
                };
                sLot.state = "PENDING_SELL";
              }
            }
          }
        }
      }
    }

    // Final settlement & metrics (without forcefully closing open lots or executing last-day pending signals!)
    var lastCurve = curve[curve.length - 1];
    var markPrice = lastCurve.price;
    var finalHeldBTC = currentHeldBTC();
    var finalLotCashUSD = currentLotCashUSD();
    var finalExternalCashUSD = externalCashUSD;
    var finalTotalCashUSD = finalLotCashUSD + finalExternalCashUSD;
    var finalEqBTC = finalHeldBTC + finalTotalCashUSD / markPrice;
    var finalBaselineEqBTC = baselineHeldBTC + baselineCashUSD / markPrice;

    var openLotsCount = 0;
    var pendingSignals = [];
    var unrealizedOpenSellOutLossBTC = 0;
    var realizedCycleLossBTC = 0;
    var realizedCycleGainBTC = 0;

    for (var ci = 0; ci < cycles.length; ci++) {
      if (cycles[ci].netDeltaBTC < 0) realizedCycleLossBTC += Math.abs(cycles[ci].netDeltaBTC);
      else if (cycles[ci].netDeltaBTC > 0) realizedCycleGainBTC += cycles[ci].netDeltaBTC;
    }

    var lotSummaries = [];
    for (var q = 0; q < 3; q++) {
      var L = lots[q];
      var isOpen = L.state === "WAITING_BUYBACK" || L.state === "PARTIAL_BUYBACK";
      if (isOpen) {
        openLotsCount++;
        var openWait = endIdx - L.sellExecIdx;
        if (openWait > maxWaitDays) maxWaitDays = openWait;
        var openEq = L.btc + L.cashUSD / markPrice;
        if (openEq < L.soldQtyBTC) {
          unrealizedOpenSellOutLossBTC += (L.soldQtyBTC - openEq);
        }
      }
      if (L.pending) {
        pendingSignals.push({
          lotId: L.lotId,
          type: L.pending.type,
          signalDay: L.pending.signalDay,
          signalPrice: L.pending.signalPrice,
          reason: L.pending.reason
        });
      }
      var lotTotalEq = L.transferredToCoreBTC + L.btc + L.cashUSD / markPrice;
      lotSummaries.push({
        lotId: L.lotId,
        sellThreshold: L.sellThreshold,
        initialBTC: L.initialBTC,
        hodlRefBTC: L.hodlRefBTC,
        remainingBTC: L.btc,
        buybackCashUSD: L.cashUSD,
        anchorPrice: isOpen ? L.anchorPrice : null,
        sellSignalDay: isOpen || L.state === "PENDING_SELL" ? (L.pending && L.pending.type === "SELL" ? L.pending.signalDay : L.sellSignalDay) : null,
        sellExecDay: isOpen ? L.sellExecDay : null,
        state: L.state,
        tierTriggered: L.tierTriggered.slice(),
        tierFilled: L.tierFilled.slice(),
        pendingAction: L.pending ? { type: L.pending.type, signalDay: L.pending.signalDay, reason: L.pending.reason } : null,
        transferredToCoreBTC: L.transferredToCoreBTC,
        cumulativeLostBTC: L.cumulativeLostBTC,
        netVsLotHodlBTC: lotTotalEq - L.hodlRefBTC,
        completedCycles: L.completedCycles,
        failedCycles: L.failedCycles,
        stopLossExits: L.stopLossExits,
        timeoutExits: L.timeoutExits
      });
    }

    if (pendingDcaSpendUSD > EPS) {
      pendingSignals.push({
        lotId: "DCA",
        type: "DCA_BUY",
        signalDay: pendingDcaSignalDay,
        signalPrice: markPrice,
        reason: pendingDcaReason
      });
    }

    var soldOutLossBTC = realizedCycleLossBTC + unrealizedOpenSellOutLossBTC;
    var netDiffEqBTC = finalEqBTC - finalBaselineEqBTC;
    var netDiffEqPct = finalBaselineEqBTC > 0 ? netDiffEqBTC / finalBaselineEqBTC : 0;
    var netDiffHeldBTC = finalHeldBTC - baselineHeldBTC;

    // Net invested cost basis (only shown when total external cost is strictly known!)
    var costBasisKnown = (cfg.initialBTC === 0) || (cfg.initialCostUSD !== null && Number.isFinite(cfg.initialCostUSD));
    var totalExternalInvestedUSD = costBasisKnown
      ? ((cfg.initialCostUSD || 0) + cfg.initialCash + totalExternalInflowUSD)
      : null;
    var netInvestedPerHeldBTC = (costBasisKnown && finalHeldBTC > EPS)
      ? totalExternalInvestedUSD / finalHeldBTC
      : null;
    var netInvestedPerEqBTC = (costBasisKnown && finalEqBTC > EPS)
      ? totalExternalInvestedUSD / finalEqBTC
      : null;

    // Strict conservation audit (tolerance 1e-10)
    var expectedHeldBTC = cfg.initialBTC + totalDcaBoughtBTC + totalVheBoughtBTC - totalVheSoldBTC;
    var expectedCashUSD = cfg.initialCash + totalExternalInflowUSD + totalVheSellNetUSD - totalDcaSpentUSD - totalVheBuySpentUSD;
    var btcConservationError = Math.abs(expectedHeldBTC - finalHeldBTC);
    var cashConservationError = Math.abs(expectedCashUSD - finalTotalCashUSD);
    var nonNegativePass = coreBTC >= -1e-12 && finalHeldBTC >= -1e-12 && finalTotalCashUSD >= -1e-12
      && lots.every(function (x) { return x.btc >= -1e-12 && x.cashUSD >= -1e-12; });
    var executionOrderPass = trades.every(function (t) {
      return parseIsoDayMs(t.executionDay) > parseIsoDayMs(t.signalDay);
    });
    var audit = {
      passed: btcConservationError <= 1e-10 && cashConservationError <= 1e-10 && nonNegativePass && executionOrderPass,
      tolerance: 1e-10,
      btcConservationError: btcConservationError,
      cashConservationError: cashConservationError,
      nonNegativePass: nonNegativePass,
      executionOrderPass: executionOrderPass
    };

    var baselineLabel = cfg.contributionMode === "monthly_uniform"
      ? "普通等额定投基准"
      : (cfg.contributionMode === "monthly_ahr999"
        ? "AHR999 动态定投基准"
        : (cfg.contributionMode === "custom" ? "同现金流定投基准" : "纯持有基准 (HODL)"));

    var metrics = {
      baselineLabel: baselineLabel,
      startDay: fRows[startIdx].date,
      endDay: fRows[endIdx].date,
      tradingDays: curve.length,
      startPriceUSD: firstPrice,
      markPriceUSD: markPrice,
      coreBTC: coreBTC,
      heldBTC: finalHeldBTC,
      pendingBuybackCashUSD: finalLotCashUSD,
      externalReserveCashUSD: finalExternalCashUSD,
      totalCashUSD: finalTotalCashUSD,
      eqBTC: finalEqBTC,
      baselineHeldBTC: baselineHeldBTC,
      baselineCashUSD: baselineCashUSD,
      baselineEqBTC: finalBaselineEqBTC,
      netDiffEqBTC: netDiffEqBTC,
      netDiffEqPct: netDiffEqPct,
      netDiffHeldBTC: netDiffHeldBTC,
      maxEqBtcDrawdown: maxEqBtcDrawdown,
      maxBaselineBtcDrawdown: maxBaselineBtcDrawdown,
      tradeCount: trades.length,
      vheTradeCount: trades.filter(function (t) { return t.lotId !== "DCA"; }).length,
      completedCycles: completedCycles,
      completedWinCycles: completedWinCycles,
      failedCycles: failedCycles,
      stopLossCount: stopLossCount,
      timeoutExitCount: timeoutExitCount,
      openLotsCount: openLotsCount,
      pendingSignalsCount: pendingSignals.length,
      maxWaitDays: maxWaitDays,
      blockedByTrendCount: blockedByTrendCount,
      totalFeesUSD: totalFeesUSD,
      totalSlippageUSD: totalSlippageUSD,
      baselineFeesUSD: baselineFeesUSD,
      realizedCycleGainBTC: realizedCycleGainBTC,
      realizedCycleLossBTC: realizedCycleLossBTC,
      unrealizedOpenSellOutLossBTC: unrealizedOpenSellOutLossBTC,
      soldOutLossBTC: soldOutLossBTC,
      costBasisKnown: costBasisKnown,
      totalExternalInvestedUSD: totalExternalInvestedUSD,
      netInvestedPerHeldBTC: netInvestedPerHeldBTC,
      netInvestedPerEqBTC: netInvestedPerEqBTC,
      outperformedBaseline: netDiffEqBTC > 1e-10,
      verdictLabel: netDiffEqBTC > 1e-10 ? "本区间跑赢同现金流基准（非未来保证）" : "未证明增币能力"
    };

    return {
      ok: true,
      errorCode: null,
      meta: Object.assign({}, norm.meta, {
        actualStartDay: fRows[startIdx].date,
        actualEndDay: fRows[endIdx].date,
        warmupStartDay: fRows[startIdx - cfg.maLength].date,
        configHash: cfg.hash
      }),
      config: cfg,
      curve: curve,
      trades: trades,
      cycles: cycles,
      lots: lotSummaries,
      pendingSignals: pendingSignals,
      metrics: metrics,
      audit: audit,
      warnings: warnings,
      errors: []
    };
  }

  function addCalendarMonthsIso(isoDay, monthsToAdd) {
    var ms = parseIsoDayMs(isoDay);
    if (!Number.isFinite(ms)) return null;
    var dt = new Date(ms);
    var y = dt.getUTCFullYear();
    var m = dt.getUTCMonth() + monthsToAdd;
    var targetY = y + Math.floor(m / 12);
    var targetM = ((m % 12) + 12) % 12;
    var maxDay = new Date(Date.UTC(targetY, targetM + 1, 0)).getUTCDate();
    var targetD = Math.min(dt.getUTCDate(), maxDay);
    return formatUtcDay(Date.UTC(targetY, targetM, targetD));
  }

  function computeMedian(sortedNums) {
    var n = sortedNums.length;
    if (n === 0) return 0;
    var mid = Math.floor(n / 2);
    return n % 2 === 1 ? sortedNums[mid] : (sortedNums[mid - 1] + sortedNums[mid]) / 2;
  }

  /**
   * 滚动窗口检验（默认 24 / 36 / 48 个月）：
   * 按每个历史自然月首个有效日为起点滚动测试，显式标注窗口重叠不等于独立样本。
   */
  function runRollingTests(historyOrRows, rawConfig, windows) {
    var winList = Array.isArray(windows) && windows.length > 0 ? windows : [24, 36, 48];
    var norm = (historyOrRows && historyOrRows.meta && Array.isArray(historyOrRows.rows) && historyOrRows.ok !== undefined)
      ? historyOrRows
      : normalizeHistory(historyOrRows, "9999-12-31");

    if (!norm.ok) {
      return { ok: false, errorCode: norm.errorCode || "INVALID_HISTORY", errors: norm.errors, results: [] };
    }

    var baseVal = validateConfig(rawConfig);
    if (!baseVal.ok) {
      return { ok: false, errorCode: "INVALID_CONFIG", errors: baseVal.errors, results: [] };
    }
    var baseCfg = baseVal.config;

    // Collect monthly candidate start indices (>= maLength warmup)
    var monthStarts = [];
    var seenYm = "";
    for (var i = baseCfg.maLength; i < norm.rows.length; i++) {
      var r = norm.rows[i];
      if (!r.valid) continue;
      var ym = r.date.slice(0, 7);
      if (ym !== seenYm) {
        seenYm = ym;
        monthStarts.push(r.date);
      }
    }

    var lastAvailable = norm.meta.lastDay;
    var results = [];

    for (var wi = 0; wi < winList.length; wi++) {
      var months = Number(winList[wi]);
      if (!Number.isInteger(months) || months < 1) continue;
      var samples = [];
      var skippedCount = 0;

      for (var si = 0; si < monthStarts.length; si++) {
        var sDay = monthStarts[si];
        var eDay = addCalendarMonthsIso(sDay, months);
        if (!eDay || eDay > lastAvailable) continue;

        var bt = runBacktest(norm, Object.assign({}, baseCfg, { start: sDay, end: eDay }));
        if (!bt.ok) {
          skippedCount++;
          continue;
        }
        var m = bt.metrics;
        samples.push({
          start: m.startDay,
          end: m.endDay,
          heldBTC: m.heldBTC,
          cashUSD: m.totalCashUSD,
          eqBTC: m.eqBTC,
          baselineEqBTC: m.baselineEqBTC,
          excessBTC: m.netDiffEqBTC,
          excessPct: m.netDiffEqPct,
          maxDrawdownBTC: m.maxEqBtcDrawdown,
          tradeCount: m.vheTradeCount,
          failedCycles: m.failedCycles,
          stopLossCount: m.stopLossCount,
          openLotsCount: m.openLotsCount
        });
      }

      var winCount = 0;
      var lossCount = 0;
      var tieCount = 0;
      var sumExcessPct = 0;
      var worst = null;
      var best = null;
      var openCashEndCount = 0;

      for (var k = 0; k < samples.length; k++) {
        var sp = samples[k];
        sumExcessPct += sp.excessPct;
        if (sp.excessBTC > 1e-10) winCount++;
        else if (sp.excessBTC < -1e-10) lossCount++;
        else tieCount++;
        if (sp.cashUSD > 1e-2) openCashEndCount++;
        if (!worst || sp.excessPct < worst.excessPct) worst = sp;
        if (!best || sp.excessPct > best.excessPct) best = sp;
      }

      var sortedPct = samples.map(function (x) { return x.excessPct; }).sort(function (a, b) { return a - b; });
      var sortedBtc = samples.map(function (x) { return x.excessBTC; }).sort(function (a, b) { return a - b; });
      var medianPct = computeMedian(sortedPct);
      var medianBtc = computeMedian(sortedBtc);
      var winRate = samples.length > 0 ? winCount / samples.length : 0;
      var proven = samples.length > 0 && medianPct > 0 && winRate > 0.5;

      results.push({
        windowMonths: months,
        sampleCount: samples.length,
        skippedCount: skippedCount,
        overlappingNotice: "按月滚动窗口存在重叠，样本数不等于独立周期观测数。",
        winCount: winCount,
        lossCount: lossCount,
        tieCount: tieCount,
        winRate: winRate,
        medianExcessPct: medianPct,
        medianExcessBTC: medianBtc,
        meanExcessPct: samples.length > 0 ? sumExcessPct / samples.length : 0,
        openCashWindowCount: openCashEndCount,
        worstWindow: worst,
        bestWindow: best,
        proven: proven,
        verdict: proven ? "滚动样本中位占优（仍属重叠样本观察）" : "未证明增币能力",
        samples: samples
      });
    }

    return {
      ok: true,
      configHash: baseCfg.hash,
      dataFingerprint: norm.meta.fingerprint,
      results: results
    };
  }

  /**
   * 策略矩阵对照（严格同外部现金流公平对比；禁止将无新增入金的纯 HODL 与持续入金策略混排）。
   */
  function compareStrategies(historyOrRows, configsOrPreset, baseOverrides) {
    var norm = (historyOrRows && historyOrRows.meta && Array.isArray(historyOrRows.rows) && historyOrRows.ok !== undefined)
      ? historyOrRows
      : normalizeHistory(historyOrRows, "9999-12-31");

    if (!norm.ok) {
      return { ok: false, errorCode: norm.errorCode || "INVALID_HISTORY", errors: norm.errors, items: [] };
    }

    var overrides = baseOverrides || {};
    var specs = [];

    if (configsOrPreset === "batch1" || !configsOrPreset) {
      specs = [
        { id: "hodl_0pct", labelZh: "纯持有基准 (0% 波段)", labelEn: "Pure HODL (0% Band)", config: Object.assign({}, overrides, { contributionMode: "none", tradeRatio: 0 }) },
        { id: "vhe_stop20", labelZh: "MA200 VHE · 涨20%止损回购", labelEn: "MA200 VHE · +20% Stop Buyback", config: Object.assign({}, overrides, { contributionMode: "none", tradeRatio: 0.10, exitPolicy: "stop_up_20pct", stopUpPct: 0.20, trendFilter: "none" }) },
        { id: "vhe_wait", labelZh: "MA200 VHE · 无限等待回购", labelEn: "MA200 VHE · Hold & Wait", config: Object.assign({}, overrides, { contributionMode: "none", tradeRatio: 0.10, exitPolicy: "hold_wait", trendFilter: "none" }) },
        { id: "vhe_timeout90", labelZh: "MA200 VHE · 90天超时回购", labelEn: "MA200 VHE · 90D Timeout", config: Object.assign({}, overrides, { contributionMode: "none", tradeRatio: 0.10, exitPolicy: "timeout_90d", timeoutDays: 90, trendFilter: "none" }) },
        { id: "vhe_trend_stop20", labelZh: "趋势过滤 VHE · 涨20%止损", labelEn: "Trend-Filtered VHE · +20% Stop", config: Object.assign({}, overrides, { contributionMode: "none", tradeRatio: 0.10, exitPolicy: "stop_up_20pct", stopUpPct: 0.20, trendFilter: "ma_slope_cap" }) },
        { id: "vhe_5pct_stop20", labelZh: "5% 小仓位 VHE · 涨20%止损", labelEn: "5% Cap VHE · +20% Stop", config: Object.assign({}, overrides, { contributionMode: "none", tradeRatio: 0.05, exitPolicy: "stop_up_20pct", stopUpPct: 0.20, trendFilter: "none" }) }
      ];
    } else if (configsOrPreset === "batch2") {
      var mUsd = Number.isFinite(Number(overrides.monthlyUSD)) && Number(overrides.monthlyUSD) > 0 ? Number(overrides.monthlyUSD) : 500;
      var initBtcB2 = Number.isFinite(Number(overrides.initialBTC)) ? Number(overrides.initialBTC) : 0.3;
      specs = [
        { id: "dca_uniform", labelZh: "普通等额定投 (0% VHE)", labelEn: "Uniform DCA (0% VHE)", config: Object.assign({}, overrides, { initialBTC: initBtcB2, contributionMode: "monthly_uniform", monthlyUSD: mUsd, tradeRatio: 0 }) },
        { id: "dca_ahr999", labelZh: "AHR999 动态定投 (保留未投现金)", labelEn: "AHR999 Dynamic DCA (Keep Cash)", config: Object.assign({}, overrides, { initialBTC: initBtcB2, contributionMode: "monthly_ahr999", monthlyUSD: mUsd, tradeRatio: 0 }) },
        { id: "dca_uniform_vhe", labelZh: "普通定投 + 10% VHE (涨20%止损)", labelEn: "Uniform DCA + 10% VHE (+20% Stop)", config: Object.assign({}, overrides, { initialBTC: initBtcB2, contributionMode: "monthly_uniform", monthlyUSD: mUsd, tradeRatio: 0.10, exitPolicy: "stop_up_20pct", stopUpPct: 0.20 }) },
        { id: "dca_ahr999_vhe", labelZh: "动态定投 + 10% VHE (涨20%止损)", labelEn: "Dynamic DCA + 10% VHE (+20% Stop)", config: Object.assign({}, overrides, { initialBTC: initBtcB2, contributionMode: "monthly_ahr999", monthlyUSD: mUsd, tradeRatio: 0.10, exitPolicy: "stop_up_20pct", stopUpPct: 0.20 }) }
      ];
    } else if (Array.isArray(configsOrPreset)) {
      specs = configsOrPreset.map(function (c, idx) {
        return {
          id: c.id || ("strat_" + idx),
          labelZh: c.labelZh || c.label || ("策略 " + (idx + 1)),
          labelEn: c.labelEn || c.label || ("Strategy " + (idx + 1)),
          config: c.config || c
        };
      });
    } else {
      return { ok: false, errorCode: "INVALID_PRESET", errors: ["未知的对照策略集合。"], items: [] };
    }

    var items = [];
    var refExternalCashflowKey = null;
    for (var s = 0; s < specs.length; s++) {
      var bt = runBacktest(norm, specs[s].config);
      if (!bt.ok) {
        return {
          ok: false,
          errorCode: bt.errorCode,
          errors: bt.errors,
          failedStrategyId: specs[s].id,
          items: []
        };
      }
      // Verify identical external capital & contribution schedule across all compared strategies!
      var hasMonthly = bt.config.contributionMode === "monthly_uniform" || bt.config.contributionMode === "monthly_ahr999";
      var cfKey = [
        bt.config.initialBTC.toFixed(8),
        bt.config.initialCash.toFixed(2),
        hasMonthly ? ("monthly:" + bt.config.monthlyUSD.toFixed(2)) : (bt.config.contributionMode === "custom" ? JSON.stringify(bt.config.externalContributionSchedule) : "none"),
        bt.metrics.startDay,
        bt.metrics.endDay
      ].join("|");
      if (refExternalCashflowKey === null) {
        refExternalCashflowKey = cfKey;
      } else if (refExternalCashflowKey !== cfKey) {
        return {
          ok: false,
          errorCode: "CASHFLOW_MISMATCH",
          errors: ["禁止直接混排外部入金规则或起始资产不一致的策略（" + specs[s].id + "）。"],
          items: []
        };
      }
      items.push({
        id: specs[s].id,
        labelZh: specs[s].labelZh,
        labelEn: specs[s].labelEn,
        configHash: bt.config.hash,
        metrics: bt.metrics,
        audit: bt.audit
      });
    }

    // Reference benchmark is items[0] (HODL in batch1, Uniform DCA in batch2)
    var refEq = items.length > 0 ? items[0].metrics.eqBTC : 0;
    var refHeld = items.length > 0 ? items[0].metrics.heldBTC : 0;
    for (var rIdx = 0; rIdx < items.length; rIdx++) {
      var m = items[rIdx].metrics;
      items[rIdx].vsGroupRefEqBTC = m.eqBTC - refEq;
      items[rIdx].vsGroupRefEqPct = refEq > 0 ? (m.eqBTC - refEq) / refEq : 0;
      items[rIdx].vsGroupRefHeldBTC = m.heldBTC - refHeld;
    }

    return {
      ok: true,
      preset: typeof configsOrPreset === "string" ? configsOrPreset : "custom",
      dataFingerprint: norm.meta.fingerprint,
      referenceId: items.length > 0 ? items[0].id : null,
      items: items
    };
  }

  /**
   * 预注册训练期 -> 样本外（Out-of-Sample）严格分段评估（Section 9.1）：
   * 训练期：trainStart..trainEnd（默认 2013-09-01..2020-12-31，不与测试期重叠）
   * 样本外测试期：oosStart..lastDay（默认 2021-01-01..lastDay）
   * 固定有限候选集，报告全部候选的训练期与样本外结果，不挑选测试集赢家。
   */
  function runOutOfSampleEvaluation(historyOrRows, options) {
    var opts = options || {};
    var norm = (historyOrRows && historyOrRows.meta && Array.isArray(historyOrRows.rows) && historyOrRows.ok !== undefined)
      ? historyOrRows
      : normalizeHistory(historyOrRows, "9999-12-31");

    if (!norm.ok) {
      return { ok: false, errorCode: norm.errorCode || "INVALID_HISTORY", errors: norm.errors };
    }

    var trainStart = opts.trainStart || "2013-09-01";
    var trainEnd = opts.trainEnd || "2020-12-31";
    var oosStart = opts.oosStart || "2021-01-01";
    var oosEnd = opts.oosEnd || norm.meta.lastDay;

    if (parseIsoDayMs(trainEnd) >= parseIsoDayMs(oosStart)) {
      return {
        ok: false,
        errorCode: "TRAIN_TEST_OVERLAP",
        errors: ["训练期结束日必须早于样本外起点，禁止训练与样本外重叠。"]
      };
    }

    var candidates = [
      { id: "hodl_0pct", label: "0% 波段 · 纯 HODL 基线", params: { tradeRatio: 0, exitPolicy: "stop_up_20pct" } },
      { id: "vhe_5pct_stop20", label: "5% 波段 · 涨20%止损", params: { tradeRatio: 0.05, exitPolicy: "stop_up_20pct", stopUpPct: 0.20, trendFilter: "none" } },
      { id: "vhe_10pct_stop20", label: "10% 波段 · 涨20%止损", params: { tradeRatio: 0.10, exitPolicy: "stop_up_20pct", stopUpPct: 0.20, trendFilter: "none" } },
      { id: "vhe_10pct_wait", label: "10% 波段 · 无限等待", params: { tradeRatio: 0.10, exitPolicy: "hold_wait", trendFilter: "none" } },
      { id: "vhe_10pct_timeout90", label: "10% 波段 · 90天超时", params: { tradeRatio: 0.10, exitPolicy: "timeout_90d", timeoutDays: 90, trendFilter: "none" } },
      { id: "vhe_10pct_trend", label: "10% 波段 · 过去斜率趋势过滤", params: { tradeRatio: 0.10, exitPolicy: "stop_up_20pct", stopUpPct: 0.20, trendFilter: "ma_slope_cap" } }
    ];

    var trials = [];
    var bestTrainNonZero = null;

    for (var c = 0; c < candidates.length; c++) {
      var cand = candidates[c];
      var trainBt = runBacktest(norm, Object.assign({ initialBTC: 0.3, start: trainStart, end: trainEnd }, cand.params));
      var oosBt = runBacktest(norm, Object.assign({ initialBTC: 0.3, start: oosStart, end: oosEnd }, cand.params));
      var oosHighFeeBt = runBacktest(norm, Object.assign({ initialBTC: 0.3, start: oosStart, end: oosEnd, feeRate: 0.002, slippageRate: 0.001 }, cand.params));
      if (!trainBt.ok || !oosBt.ok || !oosHighFeeBt.ok) {
        continue;
      }
      var rec = {
        id: cand.id,
        label: cand.label,
        configHash: oosBt.config.hash,
        trainExcessPct: trainBt.metrics.netDiffEqPct,
        trainMaxDrawdownBTC: trainBt.metrics.maxEqBtcDrawdown,
        oosExcessPct: oosBt.metrics.netDiffEqPct,
        oosExcessBTC: oosBt.metrics.netDiffEqBTC,
        oosHeldBTC: oosBt.metrics.heldBTC,
        oosCashUSD: oosBt.metrics.totalCashUSD,
        oosEqBTC: oosBt.metrics.eqBTC,
        oosMaxDrawdownBTC: oosBt.metrics.maxEqBtcDrawdown,
        oosHighFeeExcessPct: oosHighFeeBt.metrics.netDiffEqPct
      };
      trials.push(rec);
      if (cand.params.tradeRatio > 0) {
        if (!bestTrainNonZero || rec.trainExcessPct > bestTrainNonZero.trainExcessPct) {
          bestTrainNonZero = rec;
        }
      }
    }

    // Check OOS 24m rolling on the train-selected candidate (strictly selected by trainExcessPct, NOT OOS!)
    var selectedRolling = null;
    var gatePassed = false;
    if (bestTrainNonZero) {
      var selSpec = candidates.find(function (x) { return x.id === bestTrainNonZero.id; });
      // Slice OOS only via start >= oosStart filter on rolling windows
      var fullRoll = runRollingTests(norm, Object.assign({ initialBTC: 0.3 }, selSpec.params), [24]);
      if (fullRoll.ok && fullRoll.results.length > 0) {
        var oosSamples = fullRoll.results[0].samples.filter(function (s) { return s.start >= oosStart; });
        var wWins = oosSamples.filter(function (s) { return s.excessBTC > 1e-10; }).length;
        var wSorted = oosSamples.map(function (s) { return s.excessPct; }).sort(function (a, b) { return a - b; });
        var wMedian = computeMedian(wSorted);
        var wWinRate = oosSamples.length > 0 ? wWins / oosSamples.length : 0;
        selectedRolling = {
          windowMonths: 24,
          oosSampleCount: oosSamples.length,
          winRate: wWinRate,
          medianExcessPct: wMedian
        };
        gatePassed = bestTrainNonZero.oosExcessPct > 0
          && bestTrainNonZero.oosHighFeeExcessPct > 0
          && wMedian > 0
          && wWinRate > 0.5;
      }
    }

    return {
      ok: true,
      dataFingerprint: norm.meta.fingerprint,
      trainRange: { start: trainStart, end: trainEnd },
      oosRange: { start: oosStart, end: oosEnd },
      totalTrialsCount: trials.length,
      trainSelectedCandidateId: bestTrainNonZero ? bestTrainNonZero.id : null,
      selectedOosRolling24m: selectedRolling,
      researchGatePassed: gatePassed,
      verdict: gatePassed ? "满足初步样本外门槛（仅限模拟观察，非实盘信号）" : "未证明增币能力",
      trials: trials
    };
  }

  return Object.freeze({
    VERSION: VERSION,
    DEFAULT_CONFIG: DEFAULT_CONFIG,
    normalizeHistory: normalizeHistory,
    computeFeatures: computeFeatures,
    validateConfig: validateConfig,
    configHash: configHash,
    dataFingerprint: dataFingerprint,
    buildMonthlyContributionSchedule: buildMonthlyContributionSchedule,
    runBacktest: runBacktest,
    runRollingTests: runRollingTests,
    compareStrategies: compareStrategies,
    runOutOfSampleEvaluation: runOutOfSampleEvaluation
  });
});
