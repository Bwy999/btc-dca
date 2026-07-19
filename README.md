<div align="center">

# ₿ BTC Intelligence

### AURUM V21

**A Local-First Bitcoin Accumulation Terminal**

周期判断 · 定投纪律 · 长期积累

[**Live Terminal →**](https://9992100.xyz/btc/) · [**AHR999 Tribute →**](https://9992100.xyz/btc/ahr999.html)

![Version](https://img.shields.io/badge/version-V21.1.1-F7931A?style=flat-square)
![Vanilla](https://img.shields.io/badge/vanilla-HTML%20%2F%20CSS%20%2F%20JS-111111?style=flat-square)
![No Build](https://img.shields.io/badge/build-none-00A86B?style=flat-square)
![Local First](https://img.shields.io/badge/data-local--first-347FD3?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-8C8C8E?style=flat-square)

</div>

---

> **不预测明天，只校准今天的行动。**

BTC Intelligence 是为长期比特币定投者设计的移动端情报与执行终端。

它将价格结构、周期估值、链上指标、资金情绪、个人预算与买入记录汇聚在一个界面中，把市场噪声转化为可以长期重复的纪律。

不自动交易，不鼓励杠杆，不承诺预测未来。

## Overview

| 模块 | 核心能力 |
|:---|:---|
| **今日情报** | 价格、阶段、估值、主要驱动、资金环境与数据置信度 |
| **市场图谱** | BTC 价格、长期趋势与减半坐标的多周期可视化 |
| **AHR999** | 200 日定投成本、幂律估值、经典值与重拟合值 |
| **21M 积累** | BTC、sats、永久仓目标与 2100 万分之一占比 |
| **周期雷达** | 指标变化、阶段持续与关键阈值事件 |
| **综合估值** | 七维质量加权评分与 `0.10x–3.00x` 定投倍数 |
| **资金体温** | 情绪、资金费率、现货溢价、稳定币与链上状态 |
| **执行系统** | 三池预算、五档回撤、持仓成本、买入记录与备份 |

## A Tribute to AHR999

AHR999 是这个项目的精神原点。

独立的 [`ahr999.html`](https://9992100.xyz/btc/ahr999.html) 展示完整公式、双锚点拆解、历史曲线、经典与重拟合模型，以及 `0.45 / 1 / 1.2 / 5` 四档关键价格。

它不是神谕，而是一把尺：在情绪最嘈杂的时候，把决定重新交还给时间、成本与规则。

## Valuation Engine

`AHR999` · `价格 / 200WMA` · `MVRV` · `恐惧贪婪` · `Puell Multiple` · `Reserve Risk` · `SOPR`

评分越高，代表长期估值越低。

系统按数据新鲜度与可靠性加权；实时、沿用、滞后和缺失均明确标注，不用过期数据制造确定性。

## DCA Discipline

| 资金池 | 默认额度 | 纪律 |
|:---|---:|:---|
| 基础定投 | ¥1,000 | 无条件执行 |
| 回撤加仓 | ¥700 | 回撤 `10% / 20% / 30%` 分档执行 |
| 极端预备金 | ¥300 | 回撤 `40% / 50%` 时使用 |

```text
不追涨 · 不改买点 · 不停定投
不加杠杆 · 不动备用金 · 买入后转冷钱包
```

## Design Principles

- **Local First** — 预算、持仓、历史与设置保存在当前浏览器
- **Data Honesty** — 不伪造历史，不掩盖缺失，不把缓存冒充实时
- **Graceful Degradation** — 多源接口自动降级，单点失败不阻断终端
- **Zero Build** — 原生 HTML / CSS / JavaScript，无 npm、无构建步骤
- **Privacy by Default** — 无账户、无自建后端、无分析埋点
- **Mobile Native** — 深浅色、iPhone 安全区与主屏幕 Web App 适配

数据主要来自 Binance、OKX、Coinbase、Coin Metrics、Alternative.me、DefiLlama、mempool.space、BGeometrics 与 Polymarket。

## Structure

```text
btc-dca/
├── index.html
├── ahr999.html
├── apple-touch-icon.png
└── README.md
```

直接部署到 GitHub Pages、Nginx、VPS 或任意静态托管即可运行。

## Access

- [正式站点](https://9992100.xyz/btc/)
- [GitHub Pages](https://bwy999.github.io/btc-dca/)
- iPhone：Safari → 分享 → 添加到主屏幕

> 数据保存在当前设备。清理浏览器或换机前，请先导出 JSON 备份。

## Disclaimer

本项目是个人信息整理与定投纪律工具，不构成投资建议、收益承诺或交易指令。

请根据自身财务状况独立判断，并始终保留生活备用金。

---

<div align="center">

*如果有一天你特难受，特绝望，特孤独。*  
*你感觉全世界只有你还相信比特币，*  
*你开始动摇了，你快要撑不住了。*  
*相信我，其实你并不孤独。*

### 我们都是中本聪！

<sub>—— ahr999 九神</sub>

</div>