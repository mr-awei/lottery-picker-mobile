# 彩票选号器 · Lottery Picker Mobile

> **Marvis** · v1.9.10 · MIT License

一款**纯前端、免费无广告、离线可用**的中国数字彩选号与分析工具，运行于 Android（Capacitor 原生壳）与浏览器。

本软件**不含任何内购、付费功能或广告**，严禁倒卖、转售或通过付费渠道分发。

---

## 功能一览

### 🎯 支持彩种（8 种）

| 分类 | 彩种 | 玩法模式 |
|------|------|----------|
| 福彩 | 双色球 / 七乐彩 / 快乐8 / 福彩3D | 乐透型 + 直位型 |
| 体彩 | 大乐透 / 排列3 / 排列5 / 7星彩 | 乐透型 + 直位型 |

### 🧮 核心能力

- **往期开奖**：自动拉取官方接口近 100 期，CapacitorHttp 绕过 CORS，浏览器回退本地 JSON 快照
- **数据分析**：号码分布图（区间 / 奇偶 / 和值）、走势图、冷热号、号码矩阵热力图
- **奖池销量**：奖池+销量双轴走势、派奖估算、明细表
- **最大奖 / 中奖地图**：ECharts 中国地图 + 条形图，按省份统计一等奖分布
- **AI 选号引擎**：21 维评分策略（区间均衡 / 奇偶 / 大小 / 冷热 / 和值 / 重号邻号 / AC 值 / 012 路 / 跨度 …），单注 / 多注 / 复式 / 胆拖 / 定位复式全覆盖，支持"一直选到目标分"和"暴力模式"
- **多线程加速**：Web Worker 多线程并行（2~4 核），UI 全程不阻塞；WebGPU 可选增强
- **自选号**：本地持久化保存，自动核对最新开奖，历史多期中奖明细展示，中大奖弹窗恭喜 + 兑奖流程
- **OCR 拍照查奖**：在线 OCR（OCR.Space，免费 API，支持中文）+ 本地 tesseract.js 离线兜底；自动识别票面彩种 / 期号 / 多注号码并精确核对
- **拆票缩水**：复式一键展开全单注，按评分引擎智能 Top-N 缩水，支持导出 CSV
- **追号计划**：固定号码回测，支持固定 / 线性 / 翻倍 / 阶梯倍投
- **走势图横屏**：ECharts dataZoom 双指缩放 + 横屏全屏查看
- **深色 / 浅色主题**、每日理性购彩提醒、临近开奖倒计时自动刷新

---

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Vue 3 (Composition API) + Vite 5 |
| UI | Element Plus 2.7（中文 locale + 暗色主题） |
| 图表 | ECharts 5.5 |
| 原生壳 | Capacitor 8（Android） |
| 原生能力 | @capacitor/camera（拍照 + 相册）、@capacitor/core（Http 绕过 CORS） |
| OCR | tesseract.js 5（本地英文兜底） + OCR.Space API（在线中文） |
| 多线程 | Web Worker（暴力模式并行）、可选 WebGPU Compute |
| 状态持久化 | localStorage（缓存、自选号、设置） |
| 数据层 | 官方接口 → CapacitorHttp / fetch → 本地 JSON 快照兜底 |

---

## 项目结构

```
lottery-picker-mobile-v2/
├── src/                     # Vue 源代码
│   ├── App.vue              # 根组件（彩种切换 / 倒计时 / 每日提醒）
│   ├── main.js              # 应用入口
│   ├── assets/              # 全局样式 + 中国地图 GeoJSON
│   ├── components/          # 17 个功能组件
│   │   ├── AiPicker.vue         # AI 选号引擎 UI
│   │   ├── LotteryBoard.vue     # 彩种主面板（tab 容器）
│   │   ├── FileCheck.vue        # OCR 拍照查奖
│   │   ├── SplitTool.vue        # 复式拆票缩水
│   │   ├── ChasePlan.vue        # 追号计划
│   │   ├── MyPicks.vue          # 我的自选票
│   │   ├── SavedPicksList.vue   # 自选号历史列表
│   │   ├── DistributionChart.vue# 号码分布图
│   │   ├── TrendChart.vue       # 走势图
│   │   ├── HotColdBoard.vue     # 冷热号榜
│   │   ├── MatrixView.vue       # 号码矩阵热力图
│   │   ├── PoolView.vue         # 奖池销量
│   │   ├── PrizeMap.vue         # 中奖地图
│   │   ├── MaxPrizeCard.vue     # 最大奖概览
│   │   ├── HistoryTable.vue     # 往期开奖表
│   │   ├── KnowledgeView.vue    # 选号知识库
│   │   └── SettingsView.vue     # 设置中心
│   └── utils/               # 工具函数 / 引擎
│       ├── game-config.js       # 8 彩种玩法参数（红球池 / 蓝球池 / 三区 / 和值）
│       ├── picker-engine.js     # 选号评分核心（21 维加权）
│       ├── picker-worker.js     # Worker 入口（多线程加速）
│       ├── prize-check.js       # 兑奖规则（各彩种奖级判定）
│       ├── mobile-api.js        # 数据层（官方接口 + 缓存 + 快照兜底）
│       ├── ocr-engine.js        # OCR 调度（在线 → 本地兜底）
│       ├── ocr-meta.js          # 票面彩种/期号二次识别
│       ├── ui-state.js          # 主题 / 设置状态
│       └── version.js           # APP_VERSION + CHANGELOG
├── public/                  # 静态资源（随 dist 打入 APK）
│   ├── snapshots/           # 8 彩种近 50 期 JSON 快照（CORS/离线兜底）
│   ├── tessdata/            # tesseract 英文语言包
│   └── tesseract/           # tesseract.js wasm + worker
├── android/                 # Capacitor Android 原生工程
│   ├── app/build/outputs/apk/release/app-release.apk  # 已构建的 Release APK
│   ├── gradle/wrapper/      # Gradle 8.14.3
│   └── ...
├── dist/                    # Vite 构建产物（WebView 加载）
├── index.html               # Web 入口（含 CSP meta）
├── vite.config.js           # Vite 配置（base: './' 适配 file://）
├── capacitor.config.json    # Capacitor 配置（appId / webDir / Android 颜色）
└── package.json             # 依赖与脚本
```

---

## 快速开始

### 环境要求

- Node.js ≥ 18
- JDK ≥ 17（Android 构建）
- Android SDK（Android Studio 或 command-line tools）
- Windows / macOS / Linux

### 安装 & 开发

```bash
# 1. 安装依赖
npm install

# 2. 浏览器开发（Vite dev server，http://localhost:5173）
npm run dev

# 3. 构建 Web 产物
npm run build
```

### 构建 Android APK

```bash
# 方式 A：一键（构建 → 同步 → Gradle assembleDebug）
npm run cap:apk

# 方式 B：分步
npm run build                 # 先 web 产物
npm run cap:sync              # vite build + cap sync android（把 dist 拷到 android/app/src/main/assets/public/）
cd android
./gradlew assembleDebug       # 生成 android/app/build/outputs/apk/debug/app-debug.apk
```

> **签名密钥不会入库**（`.gitignore` 已屏蔽 `*.jks / *.apk`）。首次 Release 构建需自签：
> ```bash
> keytool -genkey -v -keystore android/app/release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias lottery
> ```
> 然后在 `android/app/build.gradle` 中配置 `signingConfigs.release.storeFile / storePassword / keyAlias / keyPassword`。

### 多仓库推送与自动构建（GitHub → Gitee）

项目同时托管于 **GitHub**（`origin`）与 **Gitee**（`gitee`），推送一次代码后：

```
git push                        # ① 只需推到 GitHub
        │
        ▼
GitHub Actions（.github/workflows/android.yml）
        ├─ ② 自动构建 APK：web 打包 → cap sync → Gradle assembleDebug
        │     · APK 上传到 Actions Artifacts（每次 push 均可下载）
        │     · 打 v* 标签时自动发布 GitHub Release（附带 APK）
        └─ ③ 自动镜像：把 main 分支 + 全部标签同步推送到 Gitee（需 GITEE_TOKEN）
```

**一次一次性配置（约 5 分钟）**

1. 在 Gitee 创建同名**空仓库** `lottery-picker-mobile`（不要勾选“初始化 README”，否则首推会被拒绝）。
2. 生成 Gitee 私人令牌：Gitee → 设置 → 安全设置 → **私人令牌** → 生成新令牌，勾选 `projects` 的**读写**权限并复制。
3. 在 GitHub 仓库 → Settings → Secrets and variables → Actions 中新增 Secret：
   | Secret 名 | 值 |
   |---|---|
   | `GITEE_TOKEN` | 第 2 步复制的 Gitee 私人令牌（必填，镜像到 Gitee 用） |
   | `ANDROID_KEYSTORE_BASE64` | （可选）Release 签名 keystore 的 base64，用于构建**正式签名**的 `app-release.apk`，且 keystore 别名/密码须与 `android/gradle.properties` 一致 |
4. 推送到 GitHub 即可：`git push`，之后 Actions 会自动构建并同步 Gitee。

**日常使用**

```bash
git push                 # 推到 GitHub，Actions 自动构建 APK + 镜像 Gitee
git push origin v1.9.10  # 打标签：构建 + 发布 GitHub Release
npm run push:all         # 或本机一次性手动推 GitHub + Gitee 两端（首次会提示输入 Gitee 凭据）
```

> 想让本地每次 `git push` 都自动双发（GitHub + Gitee），可执行：
> ```bash
> git remote set-url --add --push origin git@github.com:mr-awei/lottery-picker-mobile.git
> git remote set-url --add --push origin https://gitee.com/mr-awei/lottery-picker-mobile.git
> ```
> ⚠️ 配置后每次 push 都会尝试推送两端，任一端鉴权失败会让命令以非零退出，请确保两端凭据都有效。

### 数据来源说明

| 路径 | 说明 |
|------|------|
| 官方接口（优先） | `https://www.cwl.gov.cn/`（福彩）/ `https://webapi.sporttery.cn/`（体彩） |
| 本地 JSON 快照 | `public/snapshots/*.json`（浏览器 CORS 拦截 / 官方接口故障时自动回退） |
| localStorage 缓存 | `lp-data-{game}`，24h 新鲜度 |

---

## 选号引擎简述

评分模型基于"历史统计 → 多维特征加权 → 综合得分"：

- **统计**：从最近 100 期开奖中实时计算各号码的出现频次、遗漏值、区间分布、奇偶比、大小比、和值分布、冷热倾向、连号邻号等 21 项特征
- **评分**：每注号码逐项计算特征分（0~100），按各策略的权重加权汇总为综合得分
- **选号**：`一直选到目标分`（默认 70 分）或 `暴力模式`（1 万 ~ 100 万次全量跑，输出 Top-N）
- **加速**：暴力模式将选号循环派发到 2~4 个 Web Worker 并行执行

> ⚠️ 所有选号、评分与推荐**均不提高中奖概率**，开奖为独立随机事件，仅供娱乐参考。

---

## OCR 识别流程

```
拍照/相册 → canvas 压缩 <1MB
    ├─ 在线 OCR.Space API（language=chs, engine=2）→ 中文准确率高
    └─ 失败兜底 → 本地 tesseract.js（英文 + wasm）
        ↓
OCR 原始文本
    ↓
ocr-meta.js 二次解析 → 彩种 / 销售期 / 开奖日期 / 玩法
    ↓
picker-engine.extractTickets → 多注号码（letterBlocks / numberedBlocks / perLine 四策略全跑）
    ↓
精确核对 → lotteryApi.lookupByIssue(game, issue) → 历史开奖数据（本地缓存 / 快照 / 官方接口）
    ↓
中奖结果 + 兑奖流程弹窗
```

---

## 注意事项

1. **CSP 限制**：`index.html` 内的 `Content-Security-Policy` meta 严格限制资源来源，修改依赖时需同步更新
2. **Capacitor file:// 路径**：Vite `base: './'` 配置确保 APK 内 WebView 能正确加载相对路径资源
3. **Android 签名**：`lottery-release-key-v2.jks` 包含在仓库中，用于 Release APK 自签名；迁移到其他机器构建 Release 时请使用自己的 keystore
4. **原生相册兜底**：部分国产 ROM（华为/小米/OPPO/三星）相册取消时不回调 Capacitor，已用 `<input type=file>` + 12s 超时兜底
5. **浏览器 CORS**：cwl.gov.cn / sporttery.cn 不返回 `Access-Control-Allow-Origin`，浏览器 fetch 会被拦截；已自动回退本地快照，APK 走 CapacitorHttp 无此问题

---

## License

MIT — 本软件完全免费，不含内购、广告或任何付费功能。严禁倒卖、转售、付费安装或其他形式的商业化分发。
