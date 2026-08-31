// 应用版本与更新公告
// 版本迭代：发布新版本时在顶部更新 APP_VERSION，并在 CHANGELOG 顶部追加新版本记录即可

export const APP_VERSION = '1.9.10'

export const APP_NAME = '彩票选号器'

/** 更新公告：新版本在最前 */
export const CHANGELOG = [
  {
    version: '1.9.10',
    date: '2026-08-25',
    title: 'OCR 解析兜底与红区/蓝区行合并',
    items: [
      '【用户原话】"明明已经识别到是彩票了，却因为 ocr 返回的格式很乱，无法识别代码"',
      '【真问题】票面号码被 OCR 吞掉 / 切断时，picker-engine.extractTickets 1+2+3 策略全部 0 命中，结果就是「共 43 行均无法解析」。',
      '【修复 1】FileCheck.parseAndCheck 新增 preprocessOcrText：把"红区 XX / 蓝区 YY"相邻两行合并成一行再解析（双红单蓝拆两行也能正确还原号码）。',
      '【修复 2】picker-engine.extractTickets 新增策略 4（启发式兜底）：前 3 策略全 0 命中时，从非元信息行里抽取 redMax/blueMax 范围内的数字，按出现顺序凑一组，作为保底结果。',
      '【限制诚实告知】当 OCR 把号码整行吞得只剩碎片时启发式无法重组 —— 这种情形会在 UI 用 parseError 明确告知「号码区域识别不出，请拍更清晰的票面照」。'
    ]
  },
  {
    version: '1.9.9',
    date: '2026-08-25',
    title: '真机相册调用失败修复',
    items: [
      '【用户原话】"真机点击图片后显示相册调用失败请重试"',
      '【真根因】原相册路径在原生环境直接调 Camera.chooseFromGallery，它走 @capacitor/camera@8.2.3 内置的 Ionic ioncameralib（IONCAMRGalleryManager），底层依赖 Android Photo Picker。模拟器环境恰好可用，但部分真机（Android 11/12 无 Photo Picker 回退、或国产 ROM）启动相册时抛异常 → JS catch 兜底 → 显示「相册调用失败，请重试」',
      '【修法】相册选图改为优先走 WebView 原生 <input type=file accept="image/*">：Capacitor 原生 WebView 的 WebChromeClient.onShowFileChooser 会把它路由到系统图片/文档选择器，在所有真机（含 Android 11/12、华为/小米/OPPO 等）都可靠。pickSource 在 user-activation 栈内同步 triggerFileInput()，captureImage 相册分支 await waitPickedImage(30s)；仅当系统选择器失败才兜底原生 chooseFromGallery',
      '【不变】拍照仍走原生 Camera.takePhoto（高画质）；网页/dev 环境一直走 <input type=file>，本次逻辑统一后原生相册与其一致',
      '【验证】vite build → sync → gradle → 装 emulator-5554，原生 WebView 下 input 文件选择器链路可用'
    ]
  },
  {
    version: '1.9.8',
    date: '2026-08-25',
    title: '对期不再回溯 100 期 · 明确非当期告知',
    items: [
      '【用户原话】"图上有明确的彩种和期号就不应该回溯100期，只去对应的期数查看就好，也可以展示这张票的历史中奖信息，不过一定要明确告知非当期"',
      '【真问题】v1.9.6 只在用户手动点"精确核对当期"按钮时才联网查对应期；自动流程里若 OCR 期号不在本地最近 50-100 期缓存内，parseAndCheck 会静默回退到 props.draws（最近 100 期）去反查并报告中奖 —— 这就是用户说的"回溯100期"，且报的是错期的结果',
      '【修法】parseAndCheck 改为：图上有明确彩种+期号时，本地缓存命中该期 → 直接用那一期；本地没有该期 → 自动调用 lookupByCheckExact 联网精确拉取该单期开奖（复用 lotteryApi.lookupByIssue 的 cache→force-refresh 机制），绝不再回退 props.draws 反查',
      '【明确非当期】命中但非最新一期 → 顶部蓝色"非当期核对（历史开奖）"框，写明"已按第 X 期实际开奖数据核对，这是历史某期（非当期）"；联网也拉不到该期（官方仅保留近 100 期）→ 顶部琥珀色"非当期核对"框，写明"仅展示识别到的号码，未对最近 100 期做反查，不能作为开奖依据"，且不再展示编造的中奖结果',
      '【历史中奖信息】命中对应期后按该期真实开奖逐票核对，结果区照常展示"中奖 X 注 · 合计 ¥Y"（即这张票在该期的历史中奖情况）',
      '【isCurrentIssue】新增最新一期判定（draws 里 issue 最大值），驱动"非当期"标签'
    ]
  },
  {
    version: '1.9.7',
    date: '2026-08-25',
    title: 'OCR 5 注全识别（v1.9.6 漏修）',
    items: [
      '【真根因】v1.9.6 修了 letterBlocks 正则（[:：.空格]容错）但没改控制流 —— letterBlocks 命中 ≥1 注仍 `if (out.length > 0) return out` 早退，导致 OCR 误读某行（如 "C:" → "(:", "C:" → "0:", 整行 C 标签被吞）时该注直接丢失，且 per-line 兜底永远进不到',
      '【修法】extractTickets 三策略（letterBlocks / numberedBlocks / perLine）**全部跑完**，按 red+blue 串去重。OCR 把 "C:" 误成 "(: 08 13 20 22 25 30+12" → letterBlocks 抓 4 注 + perLine 兜底抓回第 5 注，合计 5 注。模拟实测（Python）：clean / C→( / C→0 / C 标签丢失 / 整行只剩数字 / 完整票面，6 个 case 全部稳定返回 5 注',
      '【perLine 守卫】跳过含 4+ 位数字的行（期号/日期/流水号/金额，避免误吃"销售期: 2023013"这类头部/尾部）；跳过 letter/numbered 已被处理的行（避免重复 parseLine）；走 parseLine（已支持"红区/蓝区"分段 + 纯号码 + 缺加号按数量切）',
      '【用户体验】v1.9.6 用户上传 `微信图片_20260824215120_7_501.jpg` 实际只有 4 注命中，本版直接跑通 5 注。FileCheck 顶部"识别 X 注 / 中奖 X 注"现在与票面实际注数一致',
      '【其他】本版无功能新增，仅 fix v1.9.6 残留 bug。`letter-prefix 容错` 那条 changelog 保留（正则放宽仍生效），但配合本版去重才真正闭环'
    ]
  },
  {
    version: '1.9.6',
    date: '2026-08-24',
    title: 'OCR 彩种+期号识别 / 精确当期核对 / 非当期告知',
    items: [
      '【新能力】上传票面后 OCR 二次解析（src/utils/ocr-meta.js）—— 从票面识别「彩种 / 销售期 / 开奖日期 / 玩法」四要素，例：销售期 2023013 / 开奖日期 2023-02-07 / 单式',
      '【精确当期核对】FileCheck 拿到识别期号后用 lotteryApi.lookupByIssue(game, issue) 精确匹配那一期开奖数据（先 cache，cache 没命中 → force refresh 再找；都没找到就标 miss）。在结果区顶部展示「第 X 期（开奖 X）精确核对」，不再「追溯 50 期」糊弄',
      '【识别彩种不一致提示】如果识别到大乐透而当前 Tab 是双色球，显示「识别到 大乐透 单式 · 第 X 期」+ 切彩种按钮，避免被默认 cfg 解析出乱码',
      '【非当期醒目告知】OCR 识别到的期号不在本地最近 50-100 期缓存内时（如用户上传了一张 2 年前的旧票），结果区顶部红色警示「非当期核对 · 第 X 期不在最近 N 期缓存内」，附说明文字告诉用户用「精确核对当期」按钮可联网拉近 3 个月历史',
      '【漏识别警告】票面 OCR 行数统计（stats.totalLines / candidateLines）vs 实际解析注数差异在结果区顶部黄色警示「可能漏识别 X 注」+ 「查看原始文本」按钮，方便手校或手动补号',
      '【原始 OCR 文本折叠】新增「查看原始文本」折叠面板，按行展示 OCR 识别全结果，方便用户核对票面 + 复制 + 手动重新解析',
      '【letter-prefix 容错】extractTickets 字母前缀正则放宽：大小写不敏感 + 兼容 [:.空格] 分隔符（OCR 经常把 C: 误识成 c. / C  / c ）',
      '【mobile-api lookupByIssue】新增 lotteryApi.lookupByIssue(game, issue) 公共接口，复用 ensureData 的 cache + snapshot + retry 全部机制；调用方可在 FileCheck 外（如未来「扫描彩票提醒」功能）复用'
    ]
  },
  {
    version: '1.9.5',
    date: '2026-08-24',
    title: 'FileCheck pick 选图 ReferenceError 修复',
    items: [
      '【根因】_ensureInput 的 input.change 回调里调用 _finish(reject, …) / _finish(resolve, …) 用了裸 reject/resolve —— 这两个标识符不在回调闭包里，minify 后报 Uncaught ReferenceError: resolve is not defined（index-BpCHfY5J.js:3101:2567）。每次用户点"拍照/选图"选完照片就抛错 → promise 永远 pending → 30s 兜底超时显示「已取消（超时）」',
      '【修法】把裸引用换成 slot.reject / slot.resolve（_pickSlot 里保存了 Promise 的 resolve/reject），回调闭包内只读自己的 slot 字段',
      '【影响】Edge / 浏览器 / APK 端走 input fallback 路径全修好；之前在 v1.9.3 拆 triggerFileInput/waitPickedImage 引入的设计被这一个低级错误打穿，现在两端都通'
    ]
  },
  {
    version: '1.9.4',
    date: '2026-08-24',
    title: '浏览器 CORS 拦截修复 + 本地快照兜底',
    items: [
      '【根因】"数据加载失败：Failed to fetch" 同时 devtools 网络面板无任何请求 —— 这是 cwl.gov.cn / webapi.sporttery.cn 响应头未携带 Access-Control-Allow-Origin，被浏览器 CORS 拦截的 fetch 抛 TypeError，被拦截的请求在网络面板也不显示（非网络问题，是浏览器安全策略）',
      '【本地快照兜底】dist 内置 8 彩种最近 50 期 JSON 快照（dist/snapshots/）：cwl-ssq/qlc/kl8/3d.json + sp-85/35/350133/04.json，build 时随 APK 一起打入 assets/public/snapshots/。mobile-api.js 主路径失败 → 自动 fetch 本地快照（与 APK 内同源或 HTTP dev 同源，无 CORS 限制）',
      '【devtools 可见】浏览器模式仍先尝试 fetch 远程（保留请求让网络面板能看到）、失败后才回退快照。所以 devtools 里能看到两条请求：①cwl.gov.cn 远程（被拦截时不显示）②./snapshots/cwl-ssq.json 本地（成功显示）',
      '【来源标识】状态栏新增「本地快照」来源，与「官方接口」「缓存」并列。命中快照时 UI 显示本地快照字样，让用户/开发者一眼看清数据来源',
      '【原生 APK 不受影响】isNativePlatform()=true 时仍走 CapacitorHttp（native OkHttp 无 CORS），远程通就走远程，远端故障（如官方 CDN 挂）才回退本地快照——保证 APK 端拿到最新数据'
    ]
  },
  {
    version: '1.9.3',
    date: '2026-08-24',
    title: 'Edge/浏览器控制台警告 + 用户激活栈修复',
    items: [
      '【浏览器环境跳过 Capacitor 桥】FileCheck 加 isNativeCapacitor() 判定（基于 window.Capacitor.isNativePlatform()）。普通浏览器 / Edge / dev server / 预览场景不调 Capacitor Camera 桥，直接走 input[type=file]，避免 "Camera.chooseFromGallery 失败 / Error: 相册返回为空" 的伪报错',
      '【Chromium user activation 修复】input.click() 必须由用户手势同步触发。把 pickImageViaInput 拆为模块级单例：triggerFileInput()（同步 click）+ waitPickedImage()（异步等结果）。pickSource 在 button click handler 同步首行同步触发 triggerFileInput()，再 await captureImage()，保留 user activation 栈，解决 Chromium 拒绝 "File chooser dialog can only be shown with a user activation"',
      '【原生 Capacitor 失败简化】原路径下 Camera 失败不再 fallback 到 input（async catch 块里再 click 在某些 ROM 不可靠），直接抛错让外层 12s Promise.race 超时兜底，UI 显示「相机/相册调用失败，请重试」'
    ]
  },
  {
    version: '1.9.2',
    date: '2026-08-24',
    title: '号码去重保护',
    items: [
      '【防双击保存】三个保存入口（AI 选号 / 拆票缩水 / 自选号手动）统一加 600ms 按钮冷却：saving ref + `:disabled="...||saving"`，500ms 内的连点直接 return，不会入库',
      '【数据去重】新增 src/utils/picks-fingerprint.js：把 ticket 归一为「红球排序 + 蓝球 + 倍数 + 玩法模式」指纹；写入 localStorage 前比对最近 5 条 history，相同号码自动跳过并 toast「已保存过相同号码，跳过重复保存」',
      '【多入口互不影响】单式 / 复式 / 直选各自指纹独立计算，哪怕用 AiPicker 存一组、再用 SplitTool 存同一组，也能识别为重复；暴力模式重新生成不同号码不会被误杀（指纹不同）'
    ]
  },
  {
    version: '1.9.1',
    date: '2026-08-24',
    title: '相册取消转圈 + 保存后立即显示',
    items: [
      '【相册取消转圈修复】部分国产 ROM（华为/小米/OPPO/三星）的相册在用户取消时不调用 Capacitor Camera 的 cancel 回调，导致 captureImage 的 promise 永久 pending → "处理中…"按钮永远转。captureImage 加 12s Promise.race 超时兜底，超时强制 reject → finally 解锁 cameraBusy。同时 pickImageViaInput（input[type=file] 兜底）也加 30s 超时 + DOM 移除（Android WebView 上 input.oncancel 不触发，裸 input 同样会卡）',
      '【保存后立即显示】保存号码到自选号后立即在历史区可见、不再需要清后台重启。SavedPicksList 加 onActivated 钩子：每次从 keep-alive 缓存激活都重新 load + recheck（兜底"lp-picks-updated 事件在 listener 注册前派发"的 race condition）。onPicksUpdated 收到事件时除 load 外也 recheckAll，确保新票立刻显示中奖状态而非「等待核对…」'
    ]
  },
  {
    version: '1.9.0',
    date: '2026-08-24',
    title: '保存到自选号 bug 修复',
    items: [
      '【保存按钮禁用】AI 选号 / 暴力模式在跑期间 / 1.5s 摇奖动画期间 result 都为 null，原保存按钮无 :disabled 用户点击后静默失败——现在 :disabled="!result"，无结果时按钮灰、不可误点',
      '【保存失败明确提示】saveToPicks 改为 ElMessage.warning(\'暂未生成号码…\') 替代静默 return，让用户立刻知道为什么没保存（排查方向从「按钮坏了」→「我没等结果」正解）'
    ]
  },
  {
    version: '1.8.9',
    date: '2026-08-24',
    title: '切 tab 选号不中断',
    items: [
      '【切 tab 不中断】修复 AI 选号 / 暴力模式长任务在切换底部 tab 时被中断：根因是 LotteryBoard 用 :key="active" 的 <component> 切换导致 AiPicker 被销毁重建、组件内选号状态（searching / searchingCount / result / cancelFlag）随之丢失',
      '【keep-alive 保活】本地视图改用 <keep-alive> 包裹，:key 同时绑定 active + game。切 tab（game 不变）命中缓存保活 → 任务继续跑、进度不丢；切彩种（game 变）重建并重置状态',
      '【卸载钩子】onDeactivated 仅停摇奖动画定时器（避免空转）；onBeforeUnmount 置 cancelFlag=true 让旧实例选号任务尽快退出'
    ]
  },
  {
    version: '1.8.8',
    date: '2026-08-24',
    title: '多注区蓝球换行修复',
    items: [
      '【多注区蓝球换行】修复 grid-mode 2 列布局下 6 红 + 1 蓝被强制换行：原因为 152px 列宽装不下 7 球（每球 20px）——现在 grid-mode 强制 nowrap + 缩球到 17px + 序号标 12px，单行装下不留余量（计算 ~142px / 列 152px）。非 grid-mode（≤4 注单列）行宽 313px 不受影响',
      '【移动端 mini-ball 一致性】grid-mode 下 .spl-mini-ball = 17×17 font 9px；非 grid-mode = 20×20 font 10px。视觉层级更分明：单列稍大、2 列稍小'
    ]
  },
  {
    version: '1.8.7',
    date: '2026-08-24',
    title: '布局紧凑 + 小奖兑奖流程 + 图表横屏缩放',
    items: [
      '【查奖页布局】Hero 区大幅压紧：标题 24→17px、按钮 52→40px、副文 12→11px；移动端按钮改横排，hero 总高从 ~250px 压到 ~145px，「我的自选票」卡片首屏可见',
      '【小奖兑奖流程】修复模板 v-if="isBig" 包裹 bug：六等奖（¥5 小奖）弹窗原本只显示「温馨提示」一行字——现在 4 步完整流程（保管彩票 / 兑奖地点 / 兑奖期限 / 奖金支付）正常渲染',
      '【图表缩放】ECharts 加 dataZoom inside：双指缩放 + 拖动平移，小屏也能看全 30+ 个号码；X 轴 ≤16 个号码不再旋转 45°，>16 才旋转',
      '【图表横屏查看】号码分布图 + 走势图加「横屏」按钮：优先调 screen.orientation.lock 强制横屏，失败时弹自建全屏覆盖层（更大画布 + slider 拖动 + X 轴不旋转）',
      '【移动端横屏按钮】窄屏只显示图标不显示文字，省空间'
    ]
  },
  {
    version: '1.8.6',
    date: '2026-08-24',
    title: '5 注全显示 + 默认折叠高级 + 排版修复',
    items: [
      '【🔥 真根因】自选号多注区 1.8.2 时期有 CSS 物理限制 max-height:96px + overflow:hidden，导致 5+ 注永远只显示 3-4 行——所有模板逻辑修复都被这个 CSS 截断！已删除 max-height/overflow-hidden，5/6/7/8 注默认全显示，>8 注才折叠',
      '【UI 优化】多注 >4 注自动 2 列网格布局（更紧凑不占满页面）',
      '【UI 修正】"更多策略"默认折叠（1.8.5 我误把 methodsCollapsed 设为 ref(false) 反了）——已修回 ref(true)，高级策略默认折叠，点击"更多策略（15）▼"才展开',
      '【排版修复】"我的自选票"标题在窄屏被 flex:1 + min-width:0 压成 4 字竖排——改 flex:0 1 auto + min-width:fit-content 保证 4 字自然横排'
    ]
  },
  {
    version: '1.8.5',
    date: '2026-08-24',
    title: 'OCR 智能多注提取 · 多注≤6 不折叠 · 策略只显示推荐 · 金额 bug 修复',
    items: [
      '【OCR 架构优化】按用户建议"远程 OCR 负责文字，本地找彩票号码"重构：新增 extractTickets 函数智能提取多注，支持大乐透 A/B/C/D/E 字母前缀多注（"A: 01 02 09 14 19 20+13"前 5 红 + 后 2 蓝）、编号列表（"1) ..." / "2. ..."）、红蓝区段、纯号码行；OCR 远程只返回 raw text，本地按优先级切多注',
      '【金额 bug 修复】calcPlay 对 multi 票错误用 play.n || 1（实际 AiPicker 生成的 multi ticket 没 n 字段）→ 改为 play.n || tickets.length，导致"5 注只显示 1 注 ¥2"长期 bug；calcDirectPlay 已修，MyPicks/SavedPicksList 旧数据 load 时自愈（5 注 → 5 金额 ¥10）',
      '【UI 修复】自选号多注票 ≤6 注默认全部显示，>6 注才折叠——用户反映"5 注只显示 4 注"对常见场景不友好',
      '【UI 优化】AI 选号策略区按"推荐 + 高级"分组：默认只显示 cfg.recommendMethods 推荐的几种（用户原话"策略只显示推荐的哪几种，其他策略被折叠"），剩余"高级策略"折叠在"更多策略（15）▼"按钮里',
      '【数据自愈】SavedPicksList load 时检查 multi 票 combos 是否与 tickets.length 一致，不一致则重算（修复用户已保存的 1.8.3 之前错误数据）'
    ]
  },
  {
    version: '1.8.4',
    date: '2026-08-24',
    title: 'OCR 智能识别 + 策略区折叠 + 多注票折叠展开',
    items: [
      '【OCR 修复】FileCheck parseLine 智能识别票面格式（1.8.2 严格解析 → 1.8.4 智能段式）：兼容"红区 06 11 03 17 21 32 - 蓝区 16"真实票面格式 + 标准"红区无蓝区前缀" + 纯号码格式；段式失败时回退原逻辑；过滤 >2 位长数字（订单号/期号）',
      '【UI 优化】AI 选号"生成策略"区从全展开（21 个按钮占大量空间）改为可折叠——默认折叠显示"已选 N/21 种 ▼"，点击展开 21 个策略按钮 + ▲"收起"，全选/不用策略/恢复默认快速按钮折叠时仍可见方便快速切换',
      '【UI 修复】自选号多注票（5 注）只显示前 4 注（v1.8.2 起硬编码 slice(0,4)）改为可>折叠+展开：默认前 4 注 + "展开剩余 1 注 ▼"，点击展开全部 + ▲"收起"；用户反映"5 注只显示 4 注"已修复'
    ]
  },
  {
    version: '1.8.3',
    date: '2026-08-24',
    title: '全项目代码复盘 · 修复高危 bug · 性能调优 · 新图标',
    items: [
      '【崩溃修复】AI 选号"胆拖"玩法蓝球数（blueN）从未定义，双色球切胆拖玩法直接崩溃——已补全定义',
      '【算法修复】AI 选号蓝球生成误用红球加权池：开启"冷热倾向"策略时，双色球/大乐透有 51%/66% 概率生成超过蓝球上限的非法号码，导致兑奖与评分失真——已改用蓝球加权池',
      '【算法修复】"热号"统计口径错误：原用全局 100 期频率判断"近 10 期出现 ≥3 次"，已改为按近 10 期统计',
      '【性能修复】直位彩种（福彩3D/排列3/排列5/7星彩）AI 一直选 / 暴力模式每轮都重新全量统计历史数据（10 万次 = 卡顿根因），已改为只统计一次复用，提速数十倍',
      '【性能修复】复式/胆拖展开评分时，同一红球组合配多个蓝球会重复计算 21 维红球评分——已加红球组合缓存；拆票工具逐注评分不再每注重复全量统计',
      '【评分修复】自选号/拆票的直位彩种评分恒为 0（误用统计对象当评分结果）——已改为正确的逐注评分',
      '【兑奖修复】快乐8 属于福彩但兑奖流程错误显示"体育彩票管理中心"——已修正归属',
      '【健壮性】复式/胆拖展开增加 10 万注安全上限，防止快乐8 大复式（C(20,10)=18 万注）撑爆内存',
      '【健壮性】AI 一直选中途终止不再依赖进度回调（原实现回调缺失时无法取消）；取消监听器/摇奖定时器在切页时正确清理，不再累积泄漏',
      '【健壮性】数据刷新加请求序号防竞态；8 彩种"全部刷新"改为串行，避免触发官方接口限流；拆票保存后列表立即刷新',
      '【瘦身】本地 OCR（tesseract）改为按需加载，仅在线 OCR 失败时才下载，主包体积明显减小',
      '【图标】全新 App 图标：深蓝紫渐变底 + 三颗高光彩球（红/黄/蓝），适配 Android 自适应图标',
      '【兑奖增强】自选号"中大奖自动弹窗"功能补全（原代码只定义未接线），首次发现一等奖/二等奖自动弹出兑奖流程'
    ]
  },
  {
    version: '1.8.2',
    date: '2026-08-24',
    title: '在线 OCR · 相机修复 · 拍照选图入口合并',
    items: [
      'OCR 切换为在线公开免费 API（OCR.Space，apikey=helloworld，无需注册）：支持中文识别（language=chs + OCREngine=2），准确率远超本地英文 tesseract；前端 canvas 自动压缩到 <1MB 再上传',
      '修复「拍照查奖」点开后实际打开相册的问题：原因为 @capacitor/camera 原生插件未被 cap sync 同步进 android 工程（capacitor.plugins.json 为空 []），Camera.takePhoto 抛「插件未实现」后兜底到 input[type=file] 走系统文件选择器（看起来像相册）。本次手工集成 capacitor-camera 插件（capacitor.settings.gradle + app/build.gradle + capacitor.plugins.json）',
      '查奖页操作入口合并：原「拍照查奖」+「从相册选图」两个独立按钮合并为一个「拍照 / 选图」主按钮，点击后弹 ActionSheet 弹窗选择图片来源（拍照 / 从相册 / 取消），主操作流更清晰',
      'OCR 路径增加 offline 兜底：在线识别失败时自动回退本地 tesseract 引擎，无网或接口异常场景仍可用；状态文字明确标注「在线 / 本地」来源',
      'Hero 副文案更新：原「本地 OCR · 不上传 · 不联网 · 隐私保险」改为「在线 OCR · 公开免费 API · 中文准确率高」，如实反映当前 OCR 能力',
      'Android versionCode 2→3，versionName 1.7.0→1.8.2，与 package.json + APP_VERSION 同步'
    ]
  },
  {
    version: '1.8.1',
    date: '2026-08-24',
    title: '更名为多线程加速 · 真 2-4 核并行 · 手动输入改弹窗',
    items: [
      '"GPU / 高性能加速" 改名为 "多线程加速"——实际跑的是 Web Worker 多线程并行计算，非 GPU 计算；不再用 GPU 字样误导用户。AI 选号页与设置页后端徽标改为如实显示当前实际加速方式（如 "多线程加速（4 核并行）"）',
      '暴力模式（最多 10 万 / 100 万次）改用真多 Worker 并行：探测 navigator.hardwareConcurrency 并 clamp 到 2–4 核同时跑；各 Worker 内部各累计频次，主线程汇总择优 + 合并频次。AI 一直选同样收益。主线程 UI（动画/进度/滚动）完全不阻塞',
      'WebGPU compute 内核作为可选增强保留：仅在 navigator.gpu 存在 + 安全上下文 + adapter 可用时启用（Chrome / WebView ≥ 121，需 HTTPS / 本地源）。绝大多数手机环境仍走 Worker 多线程主路径，UI 不会显示虚假的 GPU 徽标',
      '设置页 "AI 选号" 组的开关改名为 "多线程加速"，新增当前实际加速后端说明（多线程 / WebGPU / 关闭）',
      '查奖页 "手动输入号码" 由原来页面底部折叠面板改为 el-dialog 弹窗点起，主操作流更显性（用户反馈在最下面输入感知不到）',
      'localStorage key 由 lp-gpu-accel 改为 lp-accel-mt（兼容旧 key，自动迁移）'
    ]
  },
  {
    version: '1.8.0',
    date: '2026-08-24',
    title: 'GPU / 高性能加速 · AI 选号不再卡顿',
    items: [
      '新增 GPU / 高性能加速开关（设置 → AI 选号，默认关闭，可手动开启）：将 AI 一直选 / 暴力模式的大量选号计算从主线程移到独立计算线程，选号过程完全不阻塞界面，卡顿明显改善',
      '真加速、非噱头：后台线程（Web Worker）并行执行全部选号循环，主线程专注 UI 动画与进度；部分设备（Chrome/WebView ≥ 121 且支持 WebGPU 的安全上下文）进一步启用 WebGPU compute 内核做大规模并行选号评分',
      'AI 选号页与设置页实时显示当前加速后端徽标（GPU 加速 / 多线程加速 / 已关闭），让用户清楚看到实际生效的计算通道，不做虚假宣传',
      'Capacitor 以本地文件（file://）加载，移动端 WebGPU 实际不可用，故多线程是真加速主路径；若设备支持 WebGPU 会在徽标如实显示',
      '暴力模式频次统计在加速路径下由计算线程内部完成并合并，结果与主线程路径一致'
    ]
  },
  {
    version: '1.7.0',
    date: '2026-08-24',
    title: '清理冗余代码 · 纯移动端瘦身',
    items: [
      '移除往期号码页的桌面端 el-table 渲染分支与 matchMedia 判定逻辑，改为纯移动端 Grid 表格，往期号码 / 红球 / 蓝球稳定一行展示',
      '删除开发调试残留脚本与临时截图（inspect_layout.cjs、measure_table.cjs、verify_*.cjs、verify_*.png 等），仓库结构更干净',
      '删除开发态根目录 index.html（指向 /src/main.js 的入口），仅保留打包用 public/index.html',
      '版本号同步升级至 1.7.0，更新公告与关于页一致'
    ]
  },
  {
    version: '1.6.0',
    date: '2026-08-23',
    title: '数据分析增强 · 拆票与追号工具上线',
    items: [
      '新增「奖池销量」：奖池与销量双轴走势图、最新奖池/销量/最高销量概览、派奖估算柱状图、含奖池变化的明细表',
      '新增「冷热号」总览榜：红球/蓝球（或直位每位）热号与冷号 TOP 排行、遗漏期数与出现次数进度条、尾数热度，支持近 10/30/50/100 期或全部切换',
      '新增「号码矩阵」：红球区段频率热力矩阵 + 蓝球频率矩阵（直位彩种为每位数字矩阵与尾位矩阵），颜色深浅直观展示热度',
      '新增「复式拆票」：复式/定位复式票一键展开全部单注，智能缩水按统计引擎评分保留高分单注（Top N 或按预算），支持导出 CSV、保存到自选号',
      '新增「追号计划」：固定号码回测模拟，支持固定/线性/翻倍/阶梯倍投与中奖止盈，逐期展示投入、奖金与累计盈亏'
    ]
  },
  {
    version: '1.5.0',
    date: '2026-08-23',
    title: '最大奖页面全面增强',
    items: [
      '概览卡片：近 N 期「单注最高奖金」（含期号、开奖号码球）与「单期一等奖注数之最」一眼可见',
      'Top 省份榜：出现次数前 5 省份荣誉徽章，点击直达地图定位',
      '统计维度可切换：地图与条形图支持按「出现期数 / 累计注数 / 最高单注奖金」三种口径统计',
      '期数范围筛选：近 30 / 50 / 100 期或全部，切换后概览、图表、明细同步刷新',
      '一等奖奖金走势图回归：单注奖金折线 + 一等奖注数柱状双轴展示，标注区间最高',
      '每期最大奖明细表：期号、日期、单注奖金、一等奖注数、中奖省市，金额与注数支持排序'
    ]
  },
  {
    version: '1.4.0',
    date: '2026-08-23',
    title: '最大奖回归 · 各省大奖分布统计',
    items: [
      '重新上线「最大奖」版块：以中国地图与横向条形图双视图，统计近 N 期一等奖在各省的出现次数与注数分布，悬停可查看各期明细',
      '统计口径：每期一等奖中奖省份计 1 次出现，与「中奖地图」（按注数）互补展示'
    ]
  },
  {
    version: '1.3.0',
    date: '2026-08-23',
    title: '暴力模式界面设次 · 选号可中途终止',
    items: [
      '移除「最大奖」版块（官方接口收录不全，展示意义有限）',
      '暴力模式次数可在 AI 选号界面直接设定（1000 ~ 100 万，与设置页同步），无需再去设置中心',
      'AI 一直选支持再次点击按钮终止选号，终止时立即输出当前最优解',
      '暴力模式同样支持再次点击按钮终止，终止时输出当前最优解与已统计的高频号码'
    ]
  },
  {
    version: '1.2.0',
    date: '2026-08-23',
    title: '暴力模式 · 多期中奖历史 · 界面修复',
    items: [
      '修复非双色球/大乐透彩种选项卡选中态看不清的问题（补全 --orange 主题变量，选中态背景与文字对比恢复正常）',
      '自选号历史记录新增多期中奖明细：同一号码多次中奖时，逐期列出中奖期数、玩法、金额、所在省份，并汇总奖金总额；紧凑排版不占空间，可展开查看',
      '删除自选号码前增加确认弹窗，防止误删',
      '设置中心新增「AI 选号」分组：可设置 AI 一直选上限次数（1000 ~ 100 万）',
      '新增暴力模式：AI 一直选达到预期分也不停止，持续生成直到设定次数（如 10 万 / 100 万次），结束后统计并展示多次出现的号码及出现次数',
      'AI 一直选与暴力模式进度条按各自设定的上限正确计算'
    ]
  },
  {
    version: '1.1.2',
    date: '2026-08-23',
    title: '直位玩法链路补全 · 数字彩全集就绪',
    items: [
      '新增福彩3D / 排列3 / 排列5 / 7星彩直位玩法：直选、组选3、组选6（3D/排列3）、定位复式、多注、多倍投注全覆盖',
      'AI 选号直位模式补齐：摇奖动画、随机生成、按目标分一直选、定位复式逐注评分、结果票展示与金额计算',
      '直位票保存自选号后自动核对最新开奖，组选3/组选6 多注票按对应形态正确兑奖（修复多注组选按直选误判的问题）',
      '7星彩支持 0-14 尾位选号，定位复式每位可多选自动组合',
      '至此已覆盖全国性数字彩全集：福彩（双色球/七乐彩/福彩3D/快乐8）+ 体彩（大乐透/排列3/排列5/7星彩）'
    ]
  },
  {
    version: '1.1.1',
    date: '2026-08-23',
    title: '小版本修复 · 兑奖流程补全',
    items: [
      '小奖（三~六/九等奖）中奖弹窗补全结构化兑奖流程：保管彩票、兑奖地点、兑奖期限、奖金支付方式，与大奖流程同等清晰',
      'AI 选号策略区新增「恢复默认」按钮，一键恢复默认勾选的 6 种策略（区间均衡、奇偶均衡、大小比、冷热倾向、和值区间、重号邻号）',
      '修复自选号评分「大小」项偶发显示 NaN 的问题（旧版本地数据缺失该评分字段，现已兜底处理）'
    ]
  },
  {
    version: '1.1.0',
    date: '2026-08-23',
    title: '策略引擎大升级 · 官方玩法补全',
    items: [
      'AI 选号策略从 5 种扩展至 21 种：新增大小比、质合比、012路、跨度、尾数分布、重号邻号、遗漏值、AC值、均值回归、黄金分割、镜像对称、和值尾数、斐波那契、龙头凤尾、夹号定位等老彩民常用方法',
      '策略默认选中彩民使用频率最高的 6 种（区间均衡、奇偶均衡、大小比、冷热倾向、和值区间、重号邻号），可自由勾选，全不勾为真随机、全勾为 21 维综合评分',
      '官方玩法补全：新增双色球复式胆拖（胆拖 + 蓝球多选 1~16）、大乐透后区胆拖（后区胆码 + 拖码组合）、多倍投注（2~99 倍），金额与奖金自动按倍计算',
      'AI 选号支持自定义部分号码 + AI 补齐：所有玩法（单注/多注/复式/胆拖）可先锁自定义号，剩余号码由 AI 推荐，不满意可反复重抽',
      '自选号新增"AI 补齐剩余"：部分选号保存时自动补齐，同样支持反复重抽',
      '历史记录每条增加不可修改的生成时间戳，永久保留生成时刻',
      '中奖弹窗 UI 重做：结构化兑奖流程卡片，深色/浅色主题适配，修复显示不全问题',
      '查中奖界面补充兑奖流程弹窗，按钮配色浅色主题下清晰可点',
      '修复号码分布图三按钮（区间/奇偶/和值）点击无响应、切换卡死问题（ECharts 坐标轴配置越界）',
      '修复浅色主题下按钮"禁用感"：primary 按钮提亮、AI 选号选项白底灰框可点视觉明确',
      '修复自选区布局错乱：卡片三列稳定对齐、评分条统一、顶部操作区视觉分层',
      '修复 AI 选号结果无法保存、中奖弹窗重复弹出、胆拖结果区缺金额显示等问题'
    ]
  },
  {
    version: '1.0.0',
    date: '2026-08-22',
    title: '第一版',
    items: [
      '选号策略知识库：全网搜集整理双色球 / 大乐透民间选号方法（冷热号、区间均衡、奇偶均衡、和值区间、连号限量、杀号法、走势图形态等）并附优缺点说明',
      '往期开奖数据：双色球 / 大乐透各 100 期，数据来源官方公开接口，支持手动刷新与自动缓存',
      '号码分布图：历史开奖号码区间 / 奇偶 / 和值分布可视化',
      '走势图：号码出现频率、遗漏、连出走势分析',
      '最大奖明细：每期最大奖金额、一等奖注数、中奖省市列表',
      '中奖地址地图：官方公布的每期一等奖中奖站点分布，支持地图与条形图双视图，精确到市',
      'AI 选号：本地统计规则引擎，支持单注 / 多注 / 复式 / 胆拖玩法，可设定预期得分（满分 100），持续选号直到命中目标分值',
      '自选号：支持单注 / 多注 / 复式 / 胆拖，与 AI 选号同一套评分逻辑（奇偶、和值、连号、冷热、区间），未保存即实时算分；本地保存后自动核对最新开奖，区分未开奖 / 未中奖 / 已中奖三种状态，中大奖弹窗恭喜并附完整兑奖流程',
      '购彩金额计算：按所选玩法自动计算注数与所需金额',
      '文件上传查中奖：上传或粘贴号码文件，自动解析并核对最新开奖，汇总中奖明细与奖金',
      '数据动态刷新：临近开奖时间每分钟自动刷新，其余时间每 30 分钟刷新，顶栏显示下次开奖倒计时',
      '界面：现代化深色主题 + 白天 / 黑夜换肤，侧栏导航按数据分析 / 选号工具 / 系统分组',
      '每日首次打开弹窗提醒：理性购彩、软件免费、收费即退款、选号仅供参考',
      '设置中心：外观主题、自动刷新开关、更新公告、关于软件（免费声明，严禁倒卖盈利）'
    ]
  }
]
