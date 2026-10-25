// 历史信号计算的可靠性测试（V26.4.5）
// 用法：node tests/reliability_test.mjs <目录>   —— 目录可以是源码目录（index.html 内联）或部署包（assets/*.js）
// 用独立的朴素实现复算滚动阈值，验证：不用未来数据、排除本期、预热、有效零值、缺失值、缺日不跨越、按日期取收益、月度期限、样本不足。
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = process.argv[2] || ".";
function findModule() {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) if (m[1].includes("window.BTCInsight={")) return m[1];
  const dir = path.join(root, "assets");
  for (const f of fs.readdirSync(dir)) if (f.endsWith(".js")) { const t = fs.readFileSync(path.join(dir, f), "utf8"); if (t.includes("window.BTCInsight={")) return t; }
  throw new Error("找不到 BTCInsight 模块");
}
const win = { BTC_LANG: "zh", addEventListener() {} };
const ctx = { window: win, document: { getElementById: () => null, addEventListener() {}, querySelector: () => null }, console };
vm.createContext(ctx);
vm.runInContext(findModule(), ctx);
const BI = win.BTCInsight;

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; } else { fail++; console.log("✗ " + name); } }
const D = (d) => new Date(Date.UTC(2010, 0, 1) + d * 864e5).toISOString().slice(0, 10);
function rng(seed) { let s = seed; return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648; }

// 独立参考实现：逐日收集「此前 win 天、不含当天」的有效值，排序取 floor(n·q)
function refThr(rows, win, q, minN) {
  const K = rows.map((r) => Math.floor(Date.parse(r.day + "T00:00:00Z") / 864e5));
  return rows.map((r, i) => {
    const vals = [];
    for (let j = 0; j < i; j++) if (K[j] >= K[i] - win && typeof rows[j].value === "number" && isFinite(rows[j].value)) vals.push(rows[j].value);
    if (vals.length < minN) return null;
    vals.sort((a, b) => a - b);
    return vals[Math.min(vals.length - 1, Math.floor(vals.length * q))];
  });
}

// 1. 与参考实现一致（含缺日、缺失值、有效零值）
const r = rng(7), rows = [];
for (let d = 0; d < 2600; d++) {
  if (d % 97 === 5) continue;                                // 缺日
  const v = d % 131 === 3 ? null : d % 53 === 0 ? 0 : Math.round(r() * 1000) / 10;   // 缺失值与有效零值
  rows.push({ day: D(d), value: v, price: 100 + d + r() * 20 });
}
const O = { unit: "day", win: 1461, q: 0.9, minN: 730, gap: 60 };
const thr = BI.rollingThresholds(rows, O), ref = refThr(rows, 1461, 0.9, 730);
ok(thr.length === ref.length && thr.every((t, i) => t === ref[i]), "滚动阈值与独立参考实现一致");
ok(thr.slice(0, 700).every((t) => t === null), "预热不足（< 730 个有效值）时阈值不可用");
ok(rows.some((x, i) => x.value === 0) && thr.some((t) => t === 0) === ref.some((t) => t === 0), "有效零值计入样本");

// 2. 追加极端未来值，过去的阈值、事件不变
const base = BI.rollingEvents(rows, O);
const more = rows.concat(Array.from({ length: 400 }, (_, k) => ({ day: D(2600 + k), value: 1e9, price: 1 })));
const ext = BI.rollingEvents(more, O);
ok(base.thr.every((t, i) => t === ext.thr[i]), "追加未来数据后，过去的阈值不变");
ok(JSON.stringify(base.events) === JSON.stringify(ext.events.filter((i) => i < rows.length)), "追加未来数据后，过去的事件不变");

// 3. 改变某天的数值，不影响这一天自己的阈值
const i0 = 1800, mod = rows.map((x, i) => (i === i0 ? { ...x, value: 1e6 } : x));
ok(BI.rollingThresholds(mod, O)[i0] === thr[i0], "某天的数值不参与判断它自己的阈值");

// 4. 缺日时不跨缺口判定升破
const g = [];
for (let d = 0; d < 900; d++) g.push({ day: D(d), value: 1, price: 100 });
g.push({ day: D(905), value: 50, price: 100 });             // 缺 4 天后突然升高
const ge = BI.rollingEvents(g, { unit: "day", win: 1461, q: 0.9, minN: 730, gap: 1 });
ok(!ge.events.includes(900), "跨缺口不判定为一次升破");

// 5. 按日期取后续收益：目标日缺失时为缺失，不用下一行替代
const pr = [];
for (let d = 0; d < 400; d++) if (d !== 130) pr.push({ day: D(d), value: 1, price: 100 + d });
const iStart = pr.findIndex((x) => x.day === D(100));
ok(BI.fwdDate(pr, iStart, 30, "day") === null, "目标日缺失时收益为缺失");
ok(Math.abs(BI.fwdDate(pr, iStart, 31, "day") - (231 / 200 - 1)) < 1e-12, "按真实日期匹配 31 天后的价格");

// 6. 月度期限与样本不足
const mrows = [];
for (let m = 0; m < 120; m++) { const y = 2012 + Math.floor(m / 12), mo = (m % 12) + 1; mrows.push({ day: `${y}-${String(mo).padStart(2, "0")}-01`, value: m % 20 === 0 ? 0.5 : 2, price: 100 + m }); }
const mev = BI.crossEvents(mrows, (a, b) => a >= 1 && b < 1, 6, "month");
const el = { innerHTML: "" };
BI.signalCard(el, mrows, mev, { unit: "month", title: "t", titleEn: "t", rule: "r", ruleEn: "r" });
ok(/1 个月后/.test(el.innerHTML) && /3 个月后/.test(el.innerHTML) && /6 个月后/.test(el.innerHTML) && !/30 天后/.test(el.innerHTML), "月度卡片显示 1 / 3 / 6 个月");
const few = { innerHTML: "" };
BI.signalCard(few, mrows, mev.slice(0, 3), { unit: "month", title: "t", titleEn: "t", rule: "r", ruleEn: "r" });
ok(/样本不足，暂不判断/.test(few.innerHTML), "样本少于 5 个时不判断方向");
win.BTC_LANG = "en";
const en = { innerHTML: "" };
BI.signalCard(en, mrows, mev, { unit: "month", title: "t", titleEn: "t", rule: "r", ruleEn: "r" });
ok(/After 3 months/.test(en.innerHTML) && /After 6 months/.test(en.innerHTML), "英文月度期限");

console.log(`${fail ? "未通过" : "全部通过"}：通过 ${pass} 项，未通过 ${fail} 项`);
process.exit(fail ? 1 : 0);
