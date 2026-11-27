# SatsGarden V28.2.1 · 波动增币（VHE）极简决策界面测试与审计报告

## 1. 基线与目标构建信息

| 项目 | 详情 |
|:--|:--|
| 唯一代码基线包 | `SatsGarden_V28.2.0.zip` |
| 基线包 SHA-256 | `c88aa5d0cee2eecf4fda1f4ad7f6521dfe9956405835250a1a4478581f0aa151` |
| 基线构建号 | `28.2.0-20261126`（`V28.2.0`） |
| 历史回退备份包 | `SatsGarden_V28.1.1.zip`（SHA-256: `5e6326da015f01c5c05be89c50b342650c36810bc4dafb1706e0e1892d3c79dc`） |
| 目标交付版本 | `V28.2.1` |
| 目标全站构建号 | `28.2.1-20261127` |
| 量化引擎状态 | `source/vhe-engine.js`（`VERSION = "28.2.0"`，构建产物 `assets/vhe-engine.f3956e0e74.js`）与 `docs/VHE_BACKTEST_RESULTS.json` 字节级 100% 未改动 |
| 核心交互结论 | 默认展示极简「概览」，5 秒内呈现样本外研究门槛状态、相对持有/定投增减聪数（`sats`）与 `eqBTC`、同口径持币/现金拆分及下一步建议；全部 15 项参数、策略矩阵、24/36/48 月滚动、OOS 明细、子仓状态机、现金曲线、失败回合与分页成交表完整保留于「策略研究」模式，并移入后台 Worker 按需计算 |

---

## 2. 变更文件清单

### 2.1 新增文件（3 项）

| 路径 | 说明 |
|:--|:--|
| `source/vhe-worker.js` | VHE 独立后台计算 Web Worker，通过 `importScripts` 加载同源 `vhe-engine.<hash>.js`，在后台线程执行 `runOutOfSampleEvaluation`、`compareStrategies` 与 `runRollingTests` |
| `assets/vhe-worker.866c41fc23.js` | 由 `tools/build.py split` 生成的带 10 位 SHA-256 哈希 Worker 脚本，自动注册至 `sw.js` 的 `OPTIONAL_ASSETS` |
| `tests/vhe_ui_test.py` | 新增 V28.2.1 双模式 UI、状态一致性、作用域分离、失败清空、广告拦截与 5 档视口（`390/402/430/768/1440px`）Playwright 端到端测试套件（28 项断言） |

### 2.2 修改文件（15 项）

| 路径 | 改动摘要 |
|:--|:--|
| `source/vhe.html` / `vhe.html` | 重构为「概览 / 策略研究」双模式结构；紧凑顶栏保留末数据日、滞后徽章与可展开详细来源；初始静态 HTML 统一显示「正在计算 / 待验证」，消除未验证前的「守恒通过 / 未证明增币能力」预判；研究模式按「回测设置（常用 + 高级设置折叠）/ 策略验证 / 风险与执行 / 交易记录与数据」四区组织；移除易命中广告拦截器的 `*banner*` 命名 |
| `source/vhe.css` / `assets/vhe.df65b8c01f.css` | 对齐主站深浅色变量与等宽数字规范；主结论标题 `24–26px`、唯一焦点聪数 `32–36px`、正文与表格 `>= 13px`、主操作触控高度 `>= 44px`；使用 `overflow-x: clip` 消除横向溢出同时保持原生 `position: sticky` 与跨模式滚动位置记忆 |
| `source/vhe-ui.js` / `assets/vhe-ui.28164c1f7a.js` | 首屏仅运行 `VHE.runBacktest` 并让出浏览器绘制帧；样本外评估移入后台 Worker（`file://` 或首次离线未缓存时自动降级为可取消宏任务），策略矩阵与全历史滚动延迟至展开「策略验证」时按需计算；5 维缓存键（数据指纹 + 引擎版本 + 配置哈希 + 作用域 + 费率场景）配合单槽队列与递增 `calcToken` 防竞态；严格区分预注册固定候选（`vhe_5pct_stop20`）与当前自定义参数；回测失败清空全部旧值并禁用 CSV 导出；修改参数未点按应用时显示「未应用」标记；成交表默认按时间排序并以每页 20 条分页；隐藏图表首次展开时通过 `requestAnimationFrame` 按非零尺寸重绘 |
| `source/index.html` + `index.html` + `assets/app.90de05af6a.js` + `assets/ext-bundle.3dc64d8b73.js` + `assets/i18n-en.4e01ed6adb.js` | 主站「定投」分区 `#vheEntry` 入口标题简化为「波动增币」、副标题改为「验证波段交易能否增加 BTC」（英文 `Volatility BTC` / `Test if swing trading adds more BTC`），右侧保留进入箭头；不加载 VHE 引擎、不增加底部导航 Tab、100% 保留 V28.1.1 URPD 筹码变动对比；清理上一版 `vhe.b73524d203.css`、`vhe-ui.e5c373bc8e.js`、`ext-bundle.0912c693b4.js`、`i18n-en.80ddd33c6c.js` |
| `sw.js` | `SW_BUILD` 升至 `28.2.1-20261127`；`OPTIONAL_ASSETS` 纳入 4 个 VHE 哈希资源（含 `vhe-worker.866c41fc23.js`） |
| `ahr999.html` / `old-coins.html` / `dca.html` | 同步页面构建号至 `28.2.1-20261127` |
| `tools/build.py` / `tools/check_deploy.py` / `tests/deploy_test.py` | 支持 `source/vhe-worker.js` 哈希注入、`vhe.html` 内联 `VHE_WORKER_SRC` / `VHE_ENGINE_SRC` 存在性与 SHA-256 校验、SW 注册检查，以及缺失 Worker 资源的负向必败测试（`deploy_test.py` 增至 10 项） |
| `README.md` / `升级说明.txt` / `docs/VHE.md` / `docs/VHE_TEST_REPORT.md` | 同步 `V28.2.1` 版本说明、双模式说明、账本隔离与原包回退指南 |

---

## 3. 修改前后自动化测试逐条记录

### 3.1 修改前基线复测（基于 `SatsGarden_V28.2.0.zip` 解包目录）

| 序号 | 执行命令 | 退出码 | 实际输出 |
|--:|:--|:--:|:--|
| 1 | `node tests/vhe_test.mjs .` | `0` | `全部通过：通过 97 项，未通过 0 项` |
| 2 | `node tests/reliability_test.mjs .` | `0` | `全部通过：通过 12 项，未通过 0 项` |

### 3.2 修改后全量构建、静态门禁与浏览器端到端回归（基于 `/home/antigravity/SatsGarden_V28.2.1`）

| 序号 | 执行命令 | 退出码 | 实际输出摘要 |
|--:|:--|:--:|:--|
| 1 | `python3 tools/build.py split source/index.html .` | `0` | 生成 `index.html`、`vhe.html`、主站哈希资源与 4 个 VHE 哈希资源（含 `vhe-worker.866c41fc23.js`），更新 `sw.js` |
| 2 | `python3 tools/check_deploy.py . --require-ledger` | `0` | `✓ 部署检查通过 · 构建号 28.2.1-20261127`（含 `VHE_WORKER_SRC` / `VHE_ENGINE_SRC` 哈希与 SW 缓存清单校验） |
| 3 | `node tests/vhe_test.mjs .` | `0` | `全部通过：通过 97 项，未通过 0 项`（全部 97 项引擎单元、守恒与历史基准复现零回退） |
| 4 | `node tests/reliability_test.mjs .` | `0` | `全部通过：通过 12 项，未通过 0 项` |
| 5 | `python3 tests/static_test.py .` | `0` | `全部通过：31 个被 try{} 调用的函数都有定义` |
| 6 | `python3 tests/syntax_check.py source/index.html` & `source/vhe.html` + `node --check source/vhe-ui.js source/vhe-worker.js` | `0` | `52 段 / 2 段内联脚本语法正确`，外部脚本语法全部通过 |
| 7 | `python3 tests/safari_compat.py source/index.html` & `source/vhe.html` | `0` | `目标 iOS 17.0 · 全部通过` |
| 8 | `python3 tools/build.py join . /tmp/rejoined_v28_2_1.html && python3 tests/syntax_check.py /tmp/rejoined_v28_2_1.html` | `0` | `join()` 无损还原并通过 52 段内联脚本语法检查 |
| 9 | `python3 tests/deploy_test.py source/index.html` | `0` | `全部通过：通过 10 项，未通过 0 项`（含新增 `drop_vhe_worker` 缺失 Worker 必败拦截） |
| 10 | `python3 tests/adblock_test.py .` | `0` | `全部通过：所有本地文件和元素名都不命中 36 条常见拦截规则` |
| 11 | `python3 tests/smoke_test.py .` | `0` | 主站 5 分区（`390px`/`1440px`、中英、深浅色）、`old-coins.html`、`dca.html`、`vhe.html`（`390px` 中/英）全部通过 |
| 12 | `python3 tests/vhe_ui_test.py .` | `0` | `全部通过：通过 28 项，未通过 0 项`：逐项核对 `docs/VHE_BACKTEST_RESULTS.json` 5 个固定起点与 OOS 指标、按需延迟计算验证、`0%` 持有基准、单窗正收益（`+247,761 聪`）标记「当前规则尚未验证」、固定候选通过但自定义参数不匹配区分、OOS 计算中显示「待验证」、数据缺失与回测失败清空旧结果并禁用导出、未应用标记、跨模式滚动恢复、折叠 Canvas 非零尺寸重绘、快速连续切换无竞态覆盖、中英与深浅色零重算、真实账本 `btc_dca_ledger_v1` / `btc_exec_v7` 字节级零改动、`390/402/430/768/1440px` 零横向溢出 |
| 13 | 子路径 `/btc/vhe.html` + Service Worker 离线二次打开 + V28.1.1 URPD 控件完整性回归 | `0` | `/btc/vhe.html` 断网重载仍完整渲染 `−376,387 聪` 与 OOS 证据；主站 URPD（不对比 / 近1日 / 近7日 / 近30日）完整保留 |
| 14 | 隔离 Git 仓库一键部署门禁回归（`SatsGarden_V28.2.0.zip` → `SatsGarden_V28.2.1.zip`） | `0` | `tools/deploy_zip.py` 正常解包通过全部门禁、保留服务器 `data/` 与紧邻上一版过渡哈希资源、清理更早陈旧资源；移除 `tests/vhe_test.mjs` 时严格阻断并保护原站点不变 |

---

## 4. 同设备同数据实测性能对比（V28.2.0 vs V28.2.1）

测试条件：同一台 Ubuntu 24.04 Linux 云端开发机、同一 Playwright Chromium 浏览器版本、`402×874` 视口、本地 HTTP 静态服务、同一随包真实历史种子 `CYCLE_SEED`（`2010-08-18` 至 `2026-09-26`，`5,884` 条日线），每个版本连续测量 `N = 6` 个全新隔离浏览器上下文：

- **首次结果可见时间**：从导航开始至首屏主结果完成填充后的下一绘制帧（`performance.now()` + `requestAnimationFrame`）。
- **参数切换可见耗时**：在已加载页面将起点从默认 `2021-11-01` 切换至冷缓存配置 `2017-12-01` 并触发计算后，至主线程恢复绘制下一帧（`requestAnimationFrame`）的耗时。

| 指标 | V28.2.0 实测 | V28.2.1 实测 | 变化幅度 | 原因说明 |
|:--|--:|--:|--:|:--|
| **首次结果可见中位数** | `1,169.35 ms` | **`273.70 ms`** | **`−76.6%`（快 `4.27×`）** | 首屏仅计算当前单窗口回测并立即让出绘制帧；样本外移入 Worker 后台线程，策略矩阵与全历史 453 个滚动窗口改为展开研究子区时按需计算 |
| 首次结果可见均值 | `1,182.30 ms` | `289.93 ms` | `−75.5%` | 6 次原始样本：`V28.2.0` `[1151.6, 1187.1, 1270.1, 1296.0, 1093.0, 1096.0]` vs `V28.2.1` `[330.3, 261.9, 333.7, 276.8, 266.3, 270.6]` |
| **参数切换主线程阻塞中位数** | `291.65 ms` | **`40.90 ms`** | **`−86.0%`（快 `7.13×`）** | 消除每次参数切换同步重算策略矩阵、全历史滚动与全量 DOM 成交表的主线程阻塞 |
| 参数切换主线程阻塞均值 | `295.18 ms` | `42.08 ms` | `−85.7%` | 6 次原始样本：`V28.2.0` `[318.1, 276.9, 272.0, 287.6, 295.7, 320.8]` vs `V28.2.1` `[56.3, 40.4, 31.6, 42.5, 40.3, 41.4]` |

---

## 5. 量化回测基准结果核对（与 V28.2.0 完全一致）

全部数值均直接由 `source/vhe-engine.js` 实时计算并与 `docs/VHE_BACKTEST_RESULTS.json` 逐项核对一致，无任何硬编码：

- **默认概览窗口（`2021-11-01` → `2026-09-26`，初始 `0.300000 BTC`，10% 波段仓，涨 20% 止损，单边费率 `0.10%` + 滑点 `0.05%`）**：
  - 纯持有基准：`0.300000 BTC`；波段策略：`0.296236 BTC`（实际持币 `0.296236 BTC`，待回购现金 `\$0.00`，累计费用 `\$18.19`）。
  - 净增减：`−376,387 聪`（`−0.00376387 BTC`，`−1.25%` 等价资产），最大回撤 `−4.14%`。
- **5 个代表性固定起点**（`2017-12-01`、`2018-12-01`、`2021-11-01`、`2022-11-01`、`2024-01-01`）：相对纯持有分别为 `−0.07%`、`−1.10%`、`−1.25%`、`−3.23%`、`−2.17%`（`0/5` 跑赢）。
- **预注册两阶段样本外评估**：`2013-09-01..2020-12-31` 训练期选出损耗最小非零候选 `vhe_5pct_stop20`（5% 波段 · 涨 20% 止损），其在 `2021-01-01..2026-09-26` 样本外 `24` 个月重叠滚动窗口（共 `45` 个窗口）跑赢率为 **`24.44%`**，中位超额 **`−0.86%`**，`researchGatePassed: false`。概览页如实展示「尚未证明增币优势」并明确声明该跑赢率对应 5% 预注册候选而非默认 10% 规则。

---

## 6. 交付预览截图清单

以下 6 张高清实机渲染截图均由本地 HTTP 静态服务器 + Playwright Chromium 生成：

1. `v28_2_1_402_dark_overview.png`（`402px` iPhone 宽度 · 中文 · 深色 · 概览模式）
2. `v28_2_1_402_light_overview.png`（`402px` iPhone 宽度 · 中文 · 浅色 · 概览模式）
3. `v28_2_1_402_light_en_overview.png`（`402px` iPhone 宽度 · English · 浅色 · 概览模式）
4. `v28_2_1_402_dark_research.png`（`402px` iPhone 宽度 · 中文 · 深色 · 策略研究模式展开视图）
5. `v28_2_1_1440_desktop_overview.png`（`1440px` 桌面宽度 · 深色 · 双列概览模式）
6. `v28_2_1_1440_desktop_research.png`（`1440px` 桌面宽度 · 深色 · 策略研究模式完整矩阵/滚动/执行/交易表）

---

## 7. 测试局限性与安全回退说明

1. **浏览器与硬件覆盖边界（如实声明）**：本次多视口（`390px`、`402px`、`430px`、`768px`、`1440px`）渲染、交互与性能基准均在 Linux 环境的自动化 Playwright Chromium 中完成，并配合 `tests/safari_compat.py` 静态校验了 iOS 17 Safari 语法兼容性；**未在实体 iPhone / iOS Safari 真机硬件上进行触控实测**。
2. **线上同源行情说明**：交付包不含线上定时任务生成的 `data/v28/charts.json`；随包真实历史种子 `CYCLE_SEED` 末数据日为 `2026-09-26`，本地打开时顶栏如实标明 `滞后 · 09-26` 与 `数据末日 2026-09-26`。上线后若服务器 `charts.json` 为包含显式日期数组 `d` 的 `schema=2` 新格式则自动优先采用，若仍为旧格式则按原规则安全独立回退至 `CYCLE_SEED`，不会混拼数据源。
3. **一键安全回退**：原基线包 `SatsGarden_V28.2.0.zip` 与 `SatsGarden_V28.1.1.zip` 均原封不动保留。如需回退，直接将 `SatsGarden_V28.2.0.zip` 上传至仓库根目录运行 `tools/deploy_zip.py`（或覆盖静态文件并保留服务器 `data/` 目录）即可无损恢复；用户浏览器内的真实定投账本（`btc_dca_ledger_v1` / `btc_exec_v7`）与实验设置（`btc_vhe_config_v1`）均完全兼容、零数据丢失。
