<p align="center">
  <img src="./btc-logo.png" width="96" height="96" alt="BTC Intelligence">
</p>

<h1 align="center">BTC Intelligence</h1>

<p align="center">
  <b>比特币价格 · AHR999 估值 · 链上结构 · 定投纪律</b><br>
  为长期持有者做的比特币情报终端
</p>

<p align="center">
  <img src="https://img.shields.io/badge/%E7%89%88%E6%9C%AC-V26.3.0-f7931a?style=flat-square" alt="版本 V26.3.0">
  <img src="https://img.shields.io/badge/%E8%AF%AD%E8%A8%80-%E4%B8%AD%E6%96%87%20%7C%20English-3a7bd5?style=flat-square" alt="中文 | English">
  <img src="https://img.shields.io/badge/%E6%95%B0%E6%8D%AE-Bitview%20%2F%20BRK-6a5ae0?style=flat-square" alt="数据 Bitview / BRK">
  <img src="https://img.shields.io/badge/%E9%9A%90%E7%A7%81-%E6%97%A0%E8%B4%A6%E5%8F%B7%20%C2%B7%20%E6%97%A0%E5%B9%BF%E5%91%8A-2e9d6a?style=flat-square" alt="无账号 无广告">
</p>

<p align="center">
  <a href="https://9992100.xyz/btc/"><b>打开网站</b></a> ·
  <a href="https://bwy999.github.io/btc-dca/">GitHub Pages 镜像</a> ·
  <a href="https://9992100.xyz/btc/ahr999.html">AHR999 致敬专页</a>
</p>

<p align="center">
  <img src="./docs/cover.jpg" width="720" alt="BTC Intelligence V26">
</p>

---

## 一眼看懂

打开首页，三个问题一屏回答：

- 💰 **现在多少钱**：Binance、OKX、Coinbase 三家报价交叉校验，24 小时与 30 日涨跌。
- 🧭 **估值在哪**：AHR999 实时值与所在分区，历史分位告诉你「比 2011 年以来多少比例的日子更便宜」。
- 🪜 **支撑在哪**：16 条成本线与底价模型按真实比例排列，紫色光带越亮，支撑越厚。

紧接着是**今日结论**：AHR999 分区、顶底区间与牛市风控合成一句话，并给出对应的定投提示。再往下，是减半倒计时与一块接一块推进的最新区块。

## 四个分区

### 📈 行情
实时价格 · AHR999（新拟合 / 经典双模型，固定分界 0.45 · 1.2 · 5）· 走势图（30 日到 2011 年至今，背景按估值分区着色）· 历史分位 · 减半倒计时 · 价格关键位

### 🔍 分析
七维估值评分 · 周期位置与五轮回撤对比 · 200 周均线与幂律走廊 · Bedrock 十模型共识底价 · 恐惧贪婪、资金费率、稳定币与预测市场

### ⛓️ 链上
- **顶底区间**：5 类指标（估值利润、短期情绪、矿工、老币行为、趋势）先类内平均再合成；底部看综合分，顶部看 Reserve Risk，附历史回测
- **牛市后期风控**：进入牛市后期后，月线收盘较本轮高点回撤 20% 提示一次
- **长期持有者四件套**：LTH_PSIL · LTH NUPL · 老币重新流通（≥6 个月 / ≥1 年）· LTH 筹码集中度
- 周期底部 / 顶部探索（15 项信号）· 成本线 · 筹码分布 · 持币群体 · 矿工收入 · 算力与难度

### 👤 我的
月度预算与三档分配 · 买入记录 · 持仓与 21M 积累进度 · 定投策略回测（含信号联动定投）与真实复盘

## 每个指标都回答两个问题

> **现在处在历史的什么位置？出现信号之后，BTC 通常怎么走？**

长期持有者与分析页的主要指标都配有：

- **历史位置卡**：当前值在全部历史中的分位，附历史最高与最低。
- **信号回测表**：信号之后 30 / 90 / 180 天的涨跌中位数与上涨概率，并与「任意一天」对比。信号列更好偏底部，更差偏顶部。

<details>
<summary><b>顶底区间的规则</b></summary>

<br>

门槛一律使用「过去 4 年的分位」，每个月只用当时已知的数据。估值类指标高度重复（MVRV 与 NUPL 相关 1.00），因此先在类内平均，再合成综合分。

- **底部区**：综合分 ≤ 25。
- **顶部区**：Reserve Risk ≥ 75% 分位；Pi Cycle 或老币放量也 ≥ 75 时为「强」。

2012 年以来：底部区命中 4 次底部（含 2020 年 3 月），81% 的亮灯月份在真实底部前后 6 个月内；顶部区命中 5 个顶部（含 2021 年 11 月），95% 在真实顶部前后 6 个月内，但可能提前数月出现。样本只有 4 轮周期，仅供参考。

</details>

## 数据

| 类别 | 来源 |
|:--|:--|
| 实时价格 | Binance · OKX · Coinbase |
| 链上指标 | Bitview / Bitcoin Research Kit |
| 区块与网络 | mempool.space |
| 情绪与资金 | Alternative.me · OKX · DefiLlama |

**三条原则**

1. **只用真实数据**：接口失败时保留已有数据并标明日期，不使用模拟值。
2. **不偷看未来**：所有回测在每个时间点只用当时已知的数据。
3. **标明新鲜度**：每个模块都显示数据日期，超过 3 天未更新显示「滞后」。

## 隐私

无账号、无追踪、无广告。预算、买入记录与设置只保存在你的浏览器里，可随时导出为 JSON 备份。

## 部署

纯静态网站，上传到任意静态托管即可。

```
index.html      页面
sw.js           离线缓存与版本更新
assets/         样式、脚本与内置历史数据
ahr999.html     AHR999 致敬专页
```

<details>
<summary><b>本地预览与版本规则</b></summary>

<br>

本地预览：

```bash
python3 -m http.server 8080
```

版本规则：

- **正式版**（如 V26.3.0）：上传 GitHub，VPS 每 5 分钟自动同步。
- **测试版**（如 V26 Beta 24）：只在本地验证，不上传。

上传顺序：先上传 `assets/`，再一次性上传 `index.html`、`ahr999.html`、`sw.js`。

</details>

## 免责声明

本项目是个人研究与定投纪律工具，不构成投资建议。模型可能失效，历史底部可能被跌破。请独立判断，远离杠杆。

---

<p align="center">
  <sub>致敬九神 · AHR999 的提出者</sub><br>
  <b>我们都是中本聪</b>
</p>
