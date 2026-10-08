<p align="center">
  <img src="./btc-logo.png" width="88" height="88" alt="BTC Intelligence">
</p>

<h1 align="center">BTC Intelligence</h1>

<p align="center">
  比特币价格 · AHR999 估值 · 链上结构 · 定投纪律
</p>

<p align="center">
  <a href="https://9992100.xyz/btc/"><b>打开网站</b></a> ·
  <a href="https://bwy999.github.io/btc-dca/">GitHub Pages</a> ·
  <a href="https://9992100.xyz/btc/ahr999.html">AHR999 致敬专页</a>
</p>

---

为长期持有者做的比特币情报终端。首屏回答三个问题：**现在多少钱、估值在哪、支撑在哪。**

## 功能

**行情**
- 实时价格：Binance、OKX、Coinbase 三源交叉校验
- AHR999：新拟合 / 经典双模型，固定分界 0.45 · 1.2 · 5
- 走势图：30 日至 2011 年以来全部历史，附历史分位
- 价格关键位：16 条成本线与底价模型，支撑密度一目了然

**分析**
- 估值总览：七维评分与数据置信度
- 周期位置：五轮周期顶部回撤对比
- 长期趋势：200 日均线、均线结构、幂律走廊
- 底价模型：Bedrock 共识底价与 UTXO 压力带
- 资金与情绪：恐惧贪婪、资金费率、稳定币、预测市场

**链上**
- 周期底部 / 顶部探索：15 项经验信号，附历史触发记录
- 成本线：STH 实现价格、True Market Mean、资本化价格
- 长期持有者：亏损供应、筹码集中度、花费脉冲、NUPL
- 筹码分布、持币群体、矿工与网络

**我的**
- 月度预算、买入记录、持仓与 21M 积累
- 定投策略回测与真实复盘

## 语言

中文 / English 双语。首次打开跟随系统语言，首页右上角可随时切换，选择会被记住。

## 数据

| 类别 | 来源 |
|:--|:--|
| 实时价格 | Binance · OKX · Coinbase |
| 链上指标 | Bitview / Bitcoin Research Kit |
| 情绪与资金 | Alternative.me · OKX · DefiLlama |
| 网络与矿业 | mempool.space |

每个模块标注数据日期；超过 3 天未更新显示「滞后」。接口失败时保留已有数据，不使用模拟值。

## 隐私

无账号、无追踪、无广告。预算与买入记录只保存在本机浏览器，可导出为 JSON 备份。

## 部署

纯静态网站，上传到任意静态托管即可。

```
index.html      页面
sw.js           离线缓存与版本更新
assets/         样式、脚本与历史数据
ahr999.html     AHR999 致敬专页
```

本地预览：`python3 -m http.server 8080`

## 免责声明

本项目是个人研究与定投纪律工具，不构成投资建议。模型可能失效，历史底部可能被跌破。请独立判断，远离杠杆。

---

<p align="center"><b>我们都是中本聪</b></p>
