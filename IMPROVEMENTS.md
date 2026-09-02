# 彩票选号器 v1.9.x — 优化 / Bug / 未来功能 全清单

> 生成日期：2026-09-01
> 扫描范围：src/ 下 17 个 .vue 组件 + 15 个 .js utils + package.json
> 状态：**分析完成，待实施**
> 
> ⚠️ **路径说明**：项目实际位于 `e:\lottery-picker-mobile`，当前工作目录为符号链接/别名。请将本文件复制到 `e:\lottery-picker-mobile\IMPROVEMENTS.md` 再查阅。

---

## 目录

- [一、Bug 清单](#一bug-清单)
- [二、UI 层优化](#二ui-层优化)
- [三、文案层优化](#三文案层优化)
- [四、数据层优化](#四数据层优化)
- [五、功能层优化](#五功能层优化)
- [六、性能层优化](#六性能层优化)
- [七、未来功能建议](#七未来功能建议)
- [八、优先级总览（按投入产出比）](#八优先级总览按投入产出比)
- [九、快速修复 Top 10](#九快速修复-top-10)

---

## 一、Bug 清单

### 🔴 B1. 版本号三处不同步（必修）

| 位置 | 当前值 | 正确值 |
|---|---|---|
| package.json:4 | "version": "1.8.6" | 1.9.10 |
| src/utils/version.js:4 | "APP_VERSION": "1.9.10" | ✅ |
| CHANGELOG（同文件） | v1.9.10 最新 | ✅ |

**风险**：Capacitor 打包 AndroidManifest 版本号滞后；GitHub tag 混乱。

**修复**：
1. package.json 的 "version" 改为 "1.9.10"
2. 加 npm script 自动同步：
```json
"sync-version": "node -e \"const v=require('./src/utils/version.js').APP_VERSION; const p=require('./package.json'); p.version=v; require('fs').writeFileSync('package.json', JSON.stringify(p,null,2))\""
```

**复杂度**：⚡ 5 分钟

---

### 🔴 B2. PRIZE_RULES 数组遍历语义脆弱（必修）

**位置**：src/utils/prize-check.js

**问题**：双色球四等奖有两条规则（red:5,blue:1 和 red:4,blue:1），checkPrize 用 rules.find() 返回第一条匹配。虽然当前顺序下结果正确（4+1 和 5+1 都命中四等奖，奖金都是 200 元），但这是"数组遍历顺序"依赖，不是"取匹配最严奖级"的显式逻辑。

**修复**：遍历所有命中条件，取 level 最小（奖级最高）的那条：
```js
let best = null
for (const r of rules) {
  if (match(r) && (!best || r.level < best.level)) best = r
}
return best
```

**复杂度**：🔧 15 分钟

---

### 🟡 B3. ui-state.js 三状态源冗余（建议修复）

**位置**：src/utils/ui-state.js

**问题**：
```js
const uiState   = reactive({ tab: 'history' })   // 管底部 tab
const themeState = reactive({ mode: 'dark' })    // 管深/浅色
const theme      = ref('light')                  // 又一个 theme！
```
theme 和 themeState.mode 从未联动——改 A 不影响 B。如果部分组件读 theme.value、部分读 themeState.mode，会出现"明明切到深色但某块还是浅色"的幽灵 bug。

**修复**：只留一个 theme = ref('light')，删掉 themeState。initTheme 里给 theme 赋初值 + 统一驱动 Element Plus dark mode：
```js
document.documentElement.classList.toggle('dark', theme.value === 'dark')
```

**复杂度**：🔧 30 分钟（需 grep 全项目确认引用点）

---

### 🟡 B4. 官方接口域名无 HTTPS 降级（建议修复）

**位置**：src/utils/mobile-api.js

**问题**：cwl.gov.cn / webapi.sporttery.cn 直接写死 HTTPS。Android API 23 以下（Android 6.0）TLS 可能握手失败 → 全部开奖数据拿不到。

**修复**：
```js
const primary = 'https://www.cwl.gov.cn/...'
const fallback = 'http://www.cwl.gov.cn/...'
try { return await fetch(primary) }
catch { return await fetch(fallback) }
```

**复杂度**：⚡ 20 分钟

---

### 🟡 B5. LotteryBoard.vue watch import 位置突兀（代码异味）

**位置**：src/components/LotteryBoard.vue:102

**问题**：其他 Vue imports 在 script setup 顶部，import { watch } from 'vue' 单独一行插在中间。

**修复**：挪到顶部 import 块。

**复杂度**：⚡ 2 分钟

---

### 🟡 B6. picker-worker.js 复刻 picker-engine 未导出函数（维护隐患）

**位置**：src/utils/picker-worker.js:17-28

**问题**：buildPool 逻辑在 Worker 里完整复刻了一份。主引擎改加权规则时 Worker 不会同步 → 主线程和 Worker 选号分布不一致。

**修复**：把 buildPool 从 picker-engine.js 导出，Worker 直接 import。

**复杂度**：⚡ 10 分钟

---

### 🟡 B7. ocr-online.js 公开 API Key 硬编码

**位置**：src/utils/ocr-online.js:19

**问题**：APIKEY = 'helloworld' 是 OCR.Space 免费 key，写死前端 → 反编译 APK 可拿走刷爆额度。额度耗尽后所有用户的在线 OCR 挂掉。

**修复**：至少做一个"APIKEY 可在设置页填入自己的 key"，helloworld 只作默认兜底。

**复杂度**：🔧 45 分钟

---

## 二、UI 层优化

### 🔴 U1. ECharts 全量引入 —— 拖包 500KB（高优先级）

**位置**：src/utils/echarts-setup.js:1

**问题**：
```js
import * as echarts from 'echarts'  // 全量 ~1MB gzip
```

**修复**：按需引入 + 手动注册：
```js
import * as echarts from 'echarts/core'
import { LineChart, BarChart, PieChart, ScatterChart } from 'echarts/charts'
import { TitleComponent, TooltipComponent, GridComponent, LegendComponent, VisualMapComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
echarts.use([LineChart, BarChart, PieChart, ScatterChart, CanvasRenderer, TitleComponent, TooltipComponent, GridComponent, LegendComponent, VisualMapComponent])
```

**预期收益**：bundle 减少 400~600KB（gzip 后 150~200KB），App 冷启动明显变快。

**复杂度**：🔧 45 分钟

---

### 🟡 U2. GameList 硬编码与 game-config.js 重复

**位置**：src/App.vue 顶部横滚胶囊

**问题**：App.vue 硬编码了 8 个彩种列表，game-config.js 已定义 GAME_KEYS + GAME_GROUPS。两处不同步 → 加彩种要改两处。

**修复**：App.vue 改为遍历 GAME_GROUPS，game-config.js 统一数据源。

**复杂度**：⚡ 30 分钟

---

### 🟡 U3. LotteryBoard.vue 15 个大组件无代码分割

**问题**：所有 .vue 组件静态 import → 首屏 bundle 包含 AiPicker 50KB、FileCheck 60KB 等所有 tab 代码。用户只看走势图也要加载选号引擎。

**修复**：改成动态 import：
```js
const TrendChart = () => import('./TrendChart.vue')
const AiPicker   = () => import('./AiPicker.vue')
```

**预期收益**：首屏 bundle 减少 200~300KB，非首屏 tab 按需加载。

**复杂度**：⚡ 30 分钟

---

### 🟢 U4. 摇奖动画复式场景视觉信息量不足

**位置**：src/components/AiPicker.vue

**问题**：复式/胆拖选中时摇奖动画只摇第一注的球。

**建议**：复式场景展示多注摇奖（格子布局展示每注红球蓝球）。

**复杂度**：🔧 2 小时（可选）

---

### 🟢 U5. 策略名称增加 tooltip 说明

**位置**：AiPicker.vue 策略列表

**问题**：21 种策略只有短名（"012路均衡"、"黄金分割"等），新用户看不懂。

**建议**：hover/点击策略时弹出简短解释。

**复杂度**：⚡ 30 分钟（可选）

---

## 三、文案层优化

### 🟡 C1. 理性购彩弹窗无"本周不再提醒"选项

**位置**：src/App.vue

**问题**：localStorage.getItem(DAILY_TIP_KEY) === todayStr() 逻辑，清 localStorage 或改系统时钟就重新弹；没有"已读过这周别烦我"。

**修复**：加一个"本周不再提醒"按钮，存 acknowledgedUntil = nextMonday()。判断改为 today < acknowledgedUntil 才弹。

**复杂度**：⚡ 20 分钟

---

### 🟡 C2. 错误提示文案不统一

**问题**：
- FileCheck.vue 直接显示 e.message → 出现技术栈对用户无意义
- mobile-api.js 显示开发友好但用户看不懂的消息
- AiPicker.vue 的 ElMessage.warning 中英文夹杂

**修复**：加 translateError(e) 友好中文翻译函数，所有错误消息先过翻译。

**复杂度**：🔧 1 小时

---

### 🟡 C3. 选号引擎说明文案（彩票声明）可加强

**位置**：picker-engine.js 顶部已有"彩票为独立随机事件，本引擎仅基于历史统计生成参考组合"。

**建议**：在 AiPicker 选号结果卡片底部加一行小字提示，避免用户把 AI 推荐当必中。

**复杂度**：⚡ 10 分钟

---

## 四、数据层优化

### 🔴 D1. localStorage key 散落无统一常量

**分布**：6 个文件（App.vue / AiPicker.vue / SettingsView.vue / ui-state.js / gpu-accel.js / mobile-api.js），共 ~12 个 key。

**隐患**：改 key 名要 grep 全项目；拼写错误运行时才发现。

**修复**：新建 src/utils/storage-keys.js 集中定义，所有文件从这里 import：
```js
export const STORAGE_KEYS = {
  THEME: 'lottery-picker-theme',
  DAILY_TIP: 'lp-daily-tip',
  AUTO_REFRESH: 'lp-auto-refresh',
  ACCEL_MODE: 'lp-accel-mode',
  AI_MAX_ATTEMPTS: 'lp-ai-max-attempts',
  AI_VIOLENT: 'lp-ai-violent',
  AI_VIOLENT_ATTEMPTS: 'lp-ai-violent-attempts',
  GAME_DATA: (game) => 'lp-data-' + game,
  ACKNOWLEDGED_UNTIL: 'lp-ack-until'
}
```

**复杂度**：🔧 1 小时（全项目替换）

---

### 🟡 D2. 开奖数据缓存无主动失效机制

**位置**：src/utils/mobile-api.js

**问题**：
- 官方接口停售期间不更新，但 FRESH_HOURS=24 内仍被视为有效
- 切网络（4G→WiFi）不会重新拉
- 无"最后更新于 xx 秒前"UI 提示

**修复**：
1. 缓存存 { data, lastFetchAt } 结构
2. 设置页加"立即刷新开奖数据"按钮
3. App.vue 倒计时 banner 显示 lastFetchAt 相对时间
4. 开奖数据过期但官方停售时提示"本期未开奖"

**复杂度**：⚡ 20 分钟

---

### 🟡 D3. DRAW_SCHEDULE 与 game-config.js drawDaysText 重复

**位置**：App.vue 硬编码 + game-config.js cfg.drawDaysText

**修复**：开奖时间逻辑全部移到 game-config.js，App.vue 倒计时从 cfg 读。

**复杂度**：⚡ 40 分钟

---

### 🟢 D4. ws 依赖疑似冗余

**位置**：package.json dependencies

**问题**："ws": "^8.21.3" 全项目 grep 不到任何 import → 早期 Electron 桌面版遗留。

**修复**：删掉 "ws" 后 npm install。

**复杂度**：⚡ 2 分钟

---

## 五、功能层优化

### 🟡 F1. WebGPU 不支持时不应先尝试再报错

**位置**：src/utils/gpu-accel.js runWebGPU

**问题**：Android 低端机（不支持 WebGPU）点"GPU 加速"时，先进入 runWebGPU 分支 → 等动态导入 → 等 WGSL 编译 → 等不支持报错 → fallback。

**修复**：AiPicker.vue 点击"开始选号"时先探测：
```js
const gpuSupported = typeof navigator !== 'undefined' && !!navigator.gpu?.requestAdapter
```
不支持直接跳过 WebGPU 分支。

**复杂度**：⚡ 15 分钟

---

### 🟡 F2. 在线 OCR 失败无自动重试

**位置**：src/components/FileCheck.vue runOcr

**问题**：OCR.Space 偶尔超时是网络抖动（30s timeout），重试一次成功率很高。当前失败直接回退本地 tesseract。

**修复**：在线 OCR 失败 → 自动重试 1 次（total 2 次）→ 还失败再回退本地。

**复杂度**：⚡ 20 分钟

---

### 🟡 F3. App.vue 8 套 loadSeq + reactive 容器代码重复

**问题**：为 8 个彩种各写了 loadSeq_xx + draws_xx + loading_xx + error_xx。加彩种要复制一遍。

**修复**：抽 data-manager.js 单例：
```js
const managers = {}
GAME_KEYS.forEach(k => managers[k] = createManager(k))
```

**复杂度**：🏗️ 2~3 小时（涉及 App.vue 重构，需覆盖 8 个彩种测试）

---

### 🟢 F4. prize-check.js 直位彩种规则散落

**问题**：只集中了 ssq/dlt/qlc。fc3d/pl3/pl5/qxc 的 checkPrize 逻辑散在各组件。

**建议**：抽 PRIZE_RULES_FC3D / PRIZE_RULES_PL3 / PRIZE_RULES_PL5 / PRIZE_RULES_QXC 集中到 prize-check.js。

**复杂度**：🏗️ 1~2 小时（需逐个核对官方奖级规则）

---

## 六、性能层优化

### 🔴 P1. Worker cancel 用 80ms setInterval 主线程轮询

**位置**：src/utils/gpu-accel.js runWorkerParallel

**问题**：每秒 12.5 次 setInterval 在主线程跑，用户滚动/点击时也空转。Worker 已有 {type:'cancel'} postMessage 机制，但主线程同时又开了轮询。

**修复**：删掉轮询，cancel 时只 postMessage + worker.terminate()：
```js
workers.forEach(w => w.postMessage({ type: 'cancel' }))
workers.forEach(w => w.terminate())
```

**复杂度**：⚡ 15 分钟

---

### 🟡 P2. 并行 Worker 重复 computeStats + buildPool + createPickerEngine

**问题**：4 个 Worker 各自 runLotto → 各自算 3 个相同的初始化操作。

**修复**：主线程预先算好 stats + pool，postMessage 给每个 Worker 作为参数。

**预期收益**：并行模式冷启动时间减少 30%+。

**复杂度**：🔧 45 分钟（改 Worker message 协议 + 主线程 runAccelerated）

---

### 🟡 P3. chartTheme() 每次重建新对象

**位置**：src/utils/echarts-setup.js

**修复**：
```js
const _theme = { textStyle: { color: '#ddd' }, ... }
export const chartTheme = () => _theme  // 同一对象复用
```

**复杂度**：⚡ 5 分钟

---

### 🟡 P4. 重组件 keep-alive 缓存无数量限制

**问题**：LotteryBoard 切 tab keep-alive 缓存 15 个视图。暴力模式 10 万次 run 出来的 freq 对象可能数 KB。频繁切 tab 堆内存。

**修复**：`<keep-alive :max="8">` 或 onDeactivated 时清空 freq。

**复杂度**：⚡ 10 分钟

---

### 🟡 P5. debug-hooks.js 生产环境也执行

**位置**：src/main.js:14-16

**问题**：import('./utils/debug-hooks').then(m => window.__lp = m) 是 CDP 验收用的，生产用户用不到。

**修复**：
```js
if (import.meta.env.DEV) {
  import('./utils/debug-hooks').then(m => window.__lp = m)
}
```

**复杂度**：⚡ 5 分钟

---

## 七、未来功能建议（值得做的）

### 🟢 N1. 自选票中奖自动通知

**现状**：MyPicks.vue 的自选票要手动点"核对最新"。

**建议**：开奖数据更新后自动对所有自选票跑 checkTicketHistory，有中奖弹系统通知（Capacitor Push Notifications API）。

**复杂度**：🔧 1~2 天（需 Capacitor push 插件 + 后台定时）

---

### 🟢 N2. 走势图遗漏值双色标记

**现状**：TrendChart.vue 只画线 + 冷热颜色。

**建议**：每个号码格点显示遗漏值（连续 N 期未出），遗漏大的红色加粗——老彩民最常看的"补位选号"依据。

**复杂度**：🔧 1 天

---

### 🟢 N3. 选号引擎历史回测（验证引擎价值）

**核心诉求**：21 维评分到底有没有用？

**实现**：用历史 N 期做回测——假设回到 X 期前，用当时历史数据选号，看选出来的号在 X 期实际命中了几个。输出：
- 历史胜率 vs 随机基准
- 平均命中红球数
- 不同策略组合的效果对比

这是**判断引擎是否有参考价值**的关键功能。

**复杂度**：🏗️ 2~3 天

---

### 🟢 N4. 数据备份与云同步

**现状**：所有自选票/选号历史/设置存 localStorage → 换手机全没。

**方案**：
- 基础版：导出 JSON 文件到手机存储，导入恢复（2 小时）
- 进阶版：接 GitHub Gist 同步（半天）
- 商业化版：用户账号云同步

---

### 🟡 N5. 自定义选号策略权重

**现状**：21 种策略权重硬编码在 picker-engine.js。

**建议**：设置页加"策略权重自定义"面板，滑条调各策略权重 0~100%，存 localStorage。

**复杂度**：🔧 1 天（UI + 持久化）

---

### 🟡 N6. 倍投计算器 + 追号盈亏模拟

**现状**：AiPicker.vue 能算 amount，但不会帮用户规划追号。

**建议**：ChasePlan.vue 增强——输入"追几期 / 每期几倍 / 选中某胆码"，自动算每期投多少、累计成本、中几等奖能回本。联动 PrizeMap.vue 奖金数据。

**复杂度**：🔧 1~2 天

---

### 🟢 N7. PWA 离线安装 + 开奖推送

**现状**：纯 Capacitor Android，iPhone 用户用不到。

**建议**：
1. 加 Vite PWA 插件 + manifest + serviceWorker
2. Android Chrome "添加到主屏幕" → 像 App 一样用
3. iOS Safari 也"添加到主屏幕"
4. 开奖日凌晨 10:00 推"最新开奖结果已更新"

**复杂度**：🔧 1 天

---

### 🟢 N8. 双色球蓝球"连出序列"视图

**现状**：HotColdBoard.vue 显示冷热号，但没连出模式。

**建议**：增加"连出序列"——显示"蓝球 03 已连续出 4 期"、"红球 15 近 10 期出了 6 次"，高亮显示。

**复杂度**：⚡ 半天

---

## 八、优先级总览（按投入产出比排序）

| # | 类别 | 项 | 优先级 | 复杂度 | 预期收益 |
|---|---|---|---|---|---|
| 1 | Bug | 版本号三处不同步 | 🔴 | ⚡5min | 打包正确 |
| 2 | 性能 | ECharts 按需引入 | 🔴 | 🔧45min | Bundle -500KB |
| 3 | Bug | ui-state 三状态源统一 | 🔴 | 🔧30min | 消除幽灵 bug |
| 4 | 性能 | debug-hooks 生产守卫 | 🟡 | ⚡5min | Bundle 干净 |
| 5 | Bug | LotteryBoard watch import 位置 | 🟡 | ⚡2min | 代码整洁 |
| 6 | 数据 | ws 冗余依赖删除 | 🟢 | ⚡2min | 依赖清理 |
| 7 | 数据 | localStorage key 集中 | 🟡 | 🔧1h | 可维护性 |
| 8 | Bug | 在线 OCR 加重试 | 🟡 | ⚡20min | OCR 成功率↑ |
| 9 | 功能 | WebGPU 不支持探测跳过 | 🟡 | ⚡15min | 低端机提速 |
| 10 | 性能 | Worker stats/pool 预计算 | 🟡 | 🔧45min | 并行提速 30% |
| 11 | 性能 | Worker cancel 删轮询 | 🟡 | ⚡15min | 主线程减负 |
| 12 | 性能 | chartTheme 缓存 | 🟡 | ⚡5min | 微小但免费 |
| 13 | UI | LotteryBoard 代码分割 | 🟡 | ⚡30min | 首屏 -200KB |
| 14 | UI | GameList 与 cfg 统一 | 🟡 | ⚡30min | 单一数据源 |
| 15 | 数据 | DRAW_SCHEDULE 与 cfg 统一 | 🟡 | ⚡40min | 单一数据源 |
| 16 | Bug | PRIZE_RULES 遍历修复 | 🔴 | 🔧15min | 逻辑严谨 |
| 17 | Bug | mobile-api HTTPS 降级 | 🟡 | ⚡20min | 旧机型兼容 |
| 18 | Bug | picker-worker buildPool 导出 | 🟡 | ⚡10min | 避免逻辑分叉 |
| 19 | Bug | ocr-online APIKEY 设置化 | 🟡 | 🔧45min | 用户可自定义 |
| 20 | 功能 | App.vue data-manager 单例 | 🟡 | 🏗️2~3h | 代码量减半 |
| 21 | 未来 | 走势图遗漏值标记 | 🟢 | 1天 | 老彩民最爱 |
| 22 | 未来 | 选号引擎历史回测 | 🟢 | 2~3天 | 引擎价值验证 |
| 23 | 未来 | 自选票中奖自动通知 | 🟡 | 1~2天 | 核心体验提升 |

**符号说明**：
- 🔴 必修 / 高优先级
- 🟡 建议 / 中优先级
- 🟢 可选 / 低优先级
- ⚡ 低复杂度（<30min）
- 🔧 中复杂度（30min ~ 2h）
- 🏗️ 高复杂度（跨模块重构）

---

## 九、快速修复 Top 10

（按时间从短到长排序，总耗时约 3 小时，完成后项目状态显著提升）

| 序号 | 项 | 耗时 | 步骤 |
|---|---|---|---|
| 1 | ws 冗余依赖删除 | 2min | package.json 删 ws 行 → npm install |
| 2 | LotteryBoard watch import 位置 | 2min | 挪到顶部 import 块 |
| 3 | chartTheme() 缓存 | 5min | const _theme = {...}; export const chartTheme = () => _theme |
| 4 | debug-hooks 生产守卫 | 5min | main.js 用 import.meta.env.DEV 包 |
| 5 | 版本号同步 | 5min | package.json version 改 1.9.10 |
| 6 | picker-worker buildPool 导出 | 10min | picker-engine 导出 buildPool → Worker import |
| 7 | Worker cancel 删轮询 | 15min | 删掉 setInterval，只 postMessage + terminate |
| 8 | WebGPU 不支持探测跳过 | 15min | runAccelerated 入口加 navigator.gpu 探测 |
| 9 | 在线 OCR 加重试 | 20min | runOcr 里 catch 住再 try 一次 |
| 10 | PRIZE_RULES 遍历修复 | 15min | rules.find() → 遍历取 level 最小 |

---

## 附录：涉及文件清单

```
src/
├── App.vue                          → U2, D3, C1, F3
├── components/
│   ├── AiPicker.vue                 → U4, U5, F1, C3
│   ├── FileCheck.vue                → F2, C2
│   ├── LotteryBoard.vue             → U3, B5, P4
│   ├── SettingsView.vue             → B7
│   ├── ChasePlan.vue                → N6
│   ├── TrendChart.vue               → N2
│   └── HotColdBoard.vue             → N8
├── utils/
│   ├── echarts-setup.js             → U1, P3
│   ├── gpu-accel.js                 → P1, P2, F1
│   ├── mobile-api.js                → B4, D2
│   ├── ocr-online.js                → B7
│   ├── picker-engine.js             → B6, P2, N5
│   ├── picker-worker.js             → B6, P2
│   ├── prize-check.js               → B2, F4
│   ├── ui-state.js                  → B3, U5
│   └── game-config.js               → U2, D3
└── main.js                          → P5
package.json                         → B1, D4
```

---

**文档版本**：v1.0 · 2026-09-01 · 对应彩票选号器 APP v1.9.10
