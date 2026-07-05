<div align="center">

# ₿ BTC DCA Dashboard

**比特币定投执行台**

纪律驱动 · 数据说话 · 拒绝情绪交易

[**Live →**](https://bwy999.github.io/btc-dca/)

![Pure HTML](https://img.shields.io/badge/pure-HTML%2FJS-F7931A?style=flat-square)
![Zero Dependencies](https://img.shields.io/badge/dependencies-0-00c805?style=flat-square)
![PWA Ready](https://img.shields.io/badge/PWA-ready-000000?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-8c8c8e?style=flat-square)

</div>

---

> 你最该防的，不是踏空，而是：**高位焦虑追买，低位反而不敢买。**

一个单文件、零依赖的比特币定投执行系统。不预测行情，只执行纪律。

## ✦ 核心功能

**7 维度估值引擎** — AHR999 · 200 周均线 · MVRV · 恐惧贪婪 · Puell Multiple · Reserve Risk · SOPR，加权合成 0–100 综合评分，自动映射定投倍数（0.1x – 3.0x）。低估重仓，高估轻仓，机器决策替代情绪。

**三池预算体系** — 每月资金三分法：

| 资金池 | 额度 | 用途 |
|:---|:---|:---|
| 基础定投 | ¥1,000 | 每月 1–5 号无条件执行 |
| 回撤加仓 | ¥700 | 跌 10% / 20% / 30% 分档触发 |
| 极端预备金 | ¥300 | 跌 40% / 50% 深渊子弹 |

**五档回撤触发** — 以阶段高点为基准，跌到即买，价格实时监控，触发状态自动点亮。

**实时数据** — 60 秒自动刷新价格，指标 5 分钟缓存，多源冗余自动降级。

## ✦ 数据源

| 指标 | 来源 |
|:---|:---|
| 价格 / 200DMA / Mayer Multiple | bitcoin.com Charts API |
| 200 周均线 / K线 | Binance |
| AHR999 | 幂律模型本地计算 |
| 恐惧贪婪指数 | alternative.me |
| MVRV | CoinMetrics Community |
| 减半倒计时 | mempool.space |
| Puell / Reserve Risk / SOPR | checkonchain（手动） |

## ✦ 五条铁律

```
1. 不因涨而动用回撤资金 —— 700 元只等跌才用
2. 不修改已设定的买点 —— 触发就买，不临时再等
3. 不暂停基础定投 —— 每月 1000，不管涨跌
4. 不加杠杆 —— 现货已有足够敞口
5. 不动生活备用金 —— 25% 收入是上限
```

## ✦ 使用

**网页** — 直接访问 [bwy999.github.io/btc-dca](https://bwy999.github.io/btc-dca/)

**iPhone** — Safari 打开 → 分享 → 添加到主屏幕，全屏运行如原生 App

**数据** — 所有记录存储于浏览器 localStorage，纯本地，无服务器，无追踪

---

<div align="center">

*如果有一天你特难受，特绝望，特孤独。*<br>
*你感觉全世界只有你还相信比特币，*<br>
*你开始动摇了，你快要撑不住了。*<br>
*相信我，其实你并不孤独。*

### 我们都是中本聪！

<sub>—— ahr999 九神</sub>

</div>
