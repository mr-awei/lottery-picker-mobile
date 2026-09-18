import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import { checkTicketHistory, isBigWin, bigWinFlow, smallWinNote, fmtBonus } from '../utils/prize-check'
import { Camera } from '@capacitor/camera'
// 在线 OCR 为主路径；本地 tesseract 兜底改为 dynamic import（1.8.3）：只在在线识别失败时才加载
import { recognizeTicketOnline } from '../utils/ocr-online'
// 1.8.5：智能号码提取（OCR 远程返回文字，本地找号码）
import { extractTickets } from '../utils/picker-engine'
// v1.9.6：OCR 元数据（彩种/期号/开奖日期）+ 历史期号查找工具
import { findDrawByIssue, findDrawByDate } from '../utils/ocr-meta'
// v1.9.6：精确当期数据查找（CapacitorHttp 走原生，浏览器走 fetch/snapshot 兜底）
import { lotteryApi } from '../utils/mobile-api'
import { GAME_CONFIG } from '../utils/game-config'

// OCR / 兑奖核心逻辑（图片采集、在线+本地识别、号码解析、历史/精确期号核对、兑奖流程弹窗）。
// 接收父组件 props（cfg、draws），返回所有 refs/computed/methods 供 FileCheck 主组件下发子组件。
export function useOcrCheck(props) {
  const pasteDialog = ref(false)
  const pasteText = ref('')
  const actionSheet = ref(false)
  const parseError = ref('')
  const rows = ref([])
  const flowVisible = ref(false)
  const flowData = ref(null)

  function openPasteDialog() {
    pasteDialog.value = true
  }

  function confirmPaste() {
    const text = pasteText.value
    if (!text || !text.trim()) return
    parseAndCheck(text)
    pasteDialog.value = false
  }

  // 图片/OCR 状态
  const imagePreview = ref('')
  const imageBlob = ref(null)
  const imageName = ref('')
  const cameraBusy = ref(false)
  const ocrRunning = ref(false)
  const ocrError = ref('')
  const ocrStatusText = ref('正在识别…')

  // v1.9.6：OCR 票面识别元数据（彩种/期号/开奖日期/玩法）
  const ocrMeta = ref({ gameKey: null, gameName: null, issue: null, drawDate: null, playHint: null, foundAny: false })
  // v1.9.6：OCR 原始文本（折叠区展示，方便用户手校）
  const ocrRawVisible = ref(false)
  const ocrRawText = ref('')
  // v1.9.6：OCR 行数统计（用于漏注警告：候选 > 实际解析）
  const ocrStats = ref({ totalLines: 0, candidateLines: 0 })
  // v1.9.6：精确当期核对结果
  const lookupState = ref({ gameKey: null, issue: null, hit: null, miss: null, nonCurrent: false, loading: false, error: '' })
  // v1.9.6：识别彩种与当前 Tab 不一致时的目标 cfg
  const isWrongGame = computed(() => !!ocrMeta.value.gameKey && ocrMeta.value.gameKey !== props.cfg.key)
  // v1.9.6：漏注警告（在 result 区上方显示）
  const partialParseWarn = computed(() => {
    const c = ocrStats.value.candidateLines || 0
    const p = rows.value.length
    return c > p && p > 0
  })

  const winCount = computed(() => rows.value.filter((r) => r.prize && r.prize.level > 0).length)
  const totalBonus = computed(() => rows.value.reduce((a, r) => a + (r.prize && r.prize.bonus || 0), 0))

  /** 把 Capacitor Camera Photo 转成 dataURL（base64）用于 <img> 预览 */
  async function photoToDataUrl(photo) {
    if (photo.dataUrl) return photo.dataUrl
    if (!photo.path && !photo.webPath) return ''
    const src = photo.webPath || photo.path
    try {
      const r = await fetch(src)
      const blob = await r.blob()
      return await new Promise((resolve, reject) => {
        const fr = new FileReader()
        fr.onload = () => resolve(String(fr.result || ''))
        fr.onerror = () => reject(fr.error)
        fr.readAsDataURL(blob)
      })
    } catch (e) {
      console.error('photo → dataUrl 失败', e)
      return ''
    }
  }

  // Web 回退：从 <input type="file"> 直接选图（兼容 dev/pc 浏览器/Capacitor 失败时）。
  // input.click() 必须在 user activation 上下文里由 pickSource 同步触发，这里只挂监听+等待+清理。
  let _fileInput = null
  let _pickSlot = null // { resolve, reject, settled, timer }

  function _ensureInput() {
    if (_fileInput) return _fileInput
    _fileInput = document.createElement('input')
    _fileInput.type = 'file'
    _fileInput.accept = 'image/*'
    _fileInput.style.display = 'none'
    _fileInput.addEventListener('change', () => {
      const slot = _pickSlot
      if (!slot || slot.settled) return
      const f = _fileInput.files && _fileInput.files[0]
      if (!f) return _finish(slot.reject, new Error('未选图'))
      const fr = new FileReader()
      fr.onload = () =>
        _finish(slot.resolve, { dataUrl: String(fr.result || ''), name: f.name, blob: f })
      fr.onerror = () => _finish(slot.reject, fr.error)
      fr.readAsDataURL(f)
    })
    return _fileInput
  }

  function _finish(fn, arg) {
    const slot = _pickSlot
    if (!slot || slot.settled) return
    slot.settled = true
    clearTimeout(slot.timer)
    _pickSlot = null
    fn(arg)
  }

  /** 必须由调用方在 user activation 上下文（点击 handler 同步部分）内调用。 */
  function triggerFileInput() {
    const input = _ensureInput()
    if (!document.body.contains(input)) document.body.appendChild(input)
    input.value = ''
    input.click()
    return input
  }

  /** 等待上一次 triggerFileInput 的结果。30s 兜底超时。 */
  function waitPickedImage(timeoutMs = 30000) {
    _ensureInput()
    return new Promise((resolve, reject) => {
      if (_pickSlot && !_pickSlot.settled) return reject(new Error('选图进行中'))
      _pickSlot = {
        resolve,
        reject,
        settled: false,
        timer: setTimeout(() => _finish(reject, new Error('已取消（超时）')), timeoutMs)
      }
    })
  }

  function isNativeCapacitor() {
    return typeof window !== 'undefined' && window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()
  }

  /** 一站式：拿到图像 dataURL + 文件信息。优先用 Capacitor Camera，失败 fallback 到 input */
  async function captureImage(source) {
    cameraBusy.value = true
    try {
      // 浏览器/dev/web 环境：input.click() 已由 pickSource 在 click handler 同步部分触发，这里只 await 结果。
      if (!isNativeCapacitor()) {
        return await waitPickedImage()
      }
      if (source === 'camera') {
        const work = (async () => {
          try {
            const photo = await Camera.takePhoto({
              quality: 92,
              resultType: 'dataUrl',
              allowEditing: false,
              saveToGallery: false,
              correctOrientation: true,
              source: 'CAMERA',
              presentationStyle: 'fullScreen'
            })
            const dataUrl = photo.dataUrl || await photoToDataUrl(photo)
            if (!dataUrl) throw new Error('相机返回为空')
            return { dataUrl, name: '拍照-' + Date.now() + '.jpg', blob: null }
          } catch (e) {
            console.warn('Camera.takePhoto 失败:', e)
            throw new Error('相机调用失败，请重试')
          }
        })()
        const timeout = new Promise((_, reject) => setTimeout(
          () => reject(new Error('拍照超时（12s 无回调），请重试')), 12000))
        return await Promise.race([work, timeout])
      }
      // 相册：优先系统文件选择器(<input type=file>)；失败再回退原生 chooseFromGallery。
      try {
        const r = await waitPickedImage(30000)
        if (r && r.dataUrl) return r
      } catch (e1) {
        console.warn('系统选择器选图失败，回退原生相册:', e1)
      }
      const work = (async () => {
        try {
          const result = await Camera.chooseFromGallery({ quality: 92, presentationStyle: 'fullScreen' })
          const photo = Array.isArray(result.photos) ? result.photos[0] : result
          const dataUrl = (photo && photo.dataUrl) || await photoToDataUrl(photo)
          if (!dataUrl) throw new Error('相册返回为空')
          return { dataUrl, name: '相册-' + Date.now() + '.jpg', blob: null }
        } catch (e2) {
          console.warn('Camera.chooseFromGallery 失败:', e2)
          throw new Error('相册调用失败，请重试')
        }
      })()
      const timeout = new Promise((_, reject) => setTimeout(
        () => reject(new Error('选图超时（12s 无回调），请重试')), 12000))
      return await Promise.race([work, timeout])
    } finally {
      cameraBusy.value = false
    }
  }

  /** button click handler：必须同步触发 input.click()（浏览器路径下），否则 Chromium 报 user activation 错误 */
  async function pickSource(source) {
    // 相册在所有平台都走 <input type=file>，必须在 user activation 栈里触发
    if (source === 'gallery') triggerFileInput()
    actionSheet.value = false
    try {
      const r = await captureImage(source)
      await applyImage(r)
    } catch (e) {
      ElMessage.warning(e.message || (source === 'camera' ? '拍照已取消' : '选图已取消'))
    }
  }

  async function applyImage({ dataUrl, name, blob }) {
    clearRows()
    imagePreview.value = dataUrl
    imageName.value = name || ''
    imageBlob.value = blob || null
    ocrError.value = ''
    await runOcr()
  }

  async function runOcr() {
    if (!imagePreview.value) return
    ocrRunning.value = true
    ocrError.value = ''
    ocrStatusText.value = '压缩图片…'
    let result = null
    let used = ''
    try {
      try {
        result = await recognizeTicketOnline(imagePreview.value, (s) => {
          ocrStatusText.value = s
        })
        used = 'online'
      } catch (e) {
        console.warn('在线 OCR 失败，回退本地：', e)
        ocrStatusText.value = '在线识别失败，尝试本地…'
        try {
          // 动态加载本地 OCR（懒加载，tesseract 不进主 bundle）
          const { recognizeTicket: recognizeTicketLocal } = await import('../utils/ocr-engine')
          result = await recognizeTicketLocal(imagePreview.value, (s) => {
            ocrStatusText.value = s
          })
          used = 'local'
        } catch (e2) {
          throw new Error(`在线 OCR 失败（${e.message || e}）；本地兜底也失败（${e2.message || e2}））
`)
        }
      }
    } catch (e) {
      console.error(e)
      ocrError.value = e.message || String(e)
      return
    } finally {
      ocrRunning.value = false
    }
    const text = (result && result.text) || ''
    pasteText.value = text
    // v1.9.6：保存元数据 + 原始文本 + 行统计
    ocrRawText.value = (result && result.raw) || text
    ocrMeta.value = (result && result.meta) || { gameKey: null, foundAny: false }
    ocrStats.value = (result && result.stats) || { totalLines: 0, candidateLines: 0 }
    // 重置精确当期 lookup 状态（重新识别后旧结果丢弃）
    lookupState.value = { gameKey: null, issue: null, hit: null, miss: null, loading: false, error: '' }
    if (!text) {
      ocrError.value = `未能识别到号码（${used === 'online' ? '在线' : '本地'} OCR）— 请改用「手动输入号码」，或调整拍照角度/光线后重试`
      return
    }
    ocrStatusText.value = `识别完成（${used === 'online' ? '在线' : '本地'}）`
    parseAndCheck(pasteText.value)
  }

  /**
   * v1.9.6：精确当期核对 —— OCR 识别到期号且 lotteryApi.lookupByIssue 命中时，
   * 用对应当期开奖数据重算奖金。识别到非当前彩种的票也能跨彩种查找。调用后会覆盖 rows。
   */
  async function lookupAndCheckExact() {
    const meta = ocrMeta.value
    if (!meta || !meta.issue || !meta.gameKey) {
      ElMessage.warning('未识别到"销售期"或彩种，无法精确匹配当期')
      return
    }
    lookupState.value = { gameKey: meta.gameKey, issue: meta.issue, hit: null, miss: null, loading: true, error: '' }
    try {
      const cfg = GAME_CONFIG[meta.gameKey]
      if (!cfg) throw new Error(`未知彩种 ${meta.gameKey}`)
      // 解析号码（按识别 cfg 解析）
      const tickets = extractTickets(pasteText.value || '', cfg)
      if (!tickets.length) {
        lookupState.value.loading = false
        lookupState.value.error = '未解析出号码，无法核对'
        return
      }
      const r = await lotteryApi.lookupByIssue(meta.gameKey, meta.issue)
      if (!r.ok) throw new Error(r.error || '查询失败')
      if (!r.draw) {
        // 联网也拉不到这一期（官方接口仅保留近 100 期）→ 明确告知非当期，绝不对最近 100 期反查
        const out = tickets.map((nums) => ({ ...nums, prize: null }))
        rows.value = out
        lookupState.value = { gameKey: meta.gameKey, issue: meta.issue, hit: null, miss: r.miss || `第 ${meta.issue} 期开奖数据无法获取（官方接口仅保留近 100 期）`, nonCurrent: false, loading: false, error: '' }
        return
      }
      // 用精确当期开奖数据逐票核对
      const out = []
      tickets.forEach((nums) => {
        const ticket = cfg.playMode === 'direct'
          ? { type: 'single', digits: nums.digits, tail: nums.tail }
          : { type: 'single', red: nums.red, blue: nums.blue }
        const checked = checkTicketHistory(cfg, ticket, [r.draw])
        out.push({ ...nums, prize: checked })
      })
      rows.value = out
      lookupState.value = { gameKey: meta.gameKey, issue: meta.issue, hit: r.draw, miss: null, nonCurrent: !isCurrentIssue(props.draws, r.draw.issue), loading: false, error: '' }
    } catch (e) {
      console.error(e)
      lookupState.value = { gameKey: meta.gameKey, issue: meta.issue, hit: null, miss: null, loading: false, error: e.message || String(e) }
      ElMessage.error('精确当期核对失败：' + (e.message || e))
    }
  }

  /** v1.9.6：把文本回填进"手动输入号码"对话框 —— 用于 OCR 漏注时用户手校后再次解析。 */
  function refillPasteFromOcr() {
    pasteText.value = ocrRawText.value || pasteText.value
    pasteDialog.value = true
  }

  async function retryOcr() {
    // 防重入（1.8.3）：识别进行中忽略重复点击，避免并发 OCR 覆盖状态
    if (ocrRunning.value) return
    await runOcr()
  }

  function clearImage() {
    imagePreview.value = ''
    imageBlob.value = null
    imageName.value = ''
    ocrRunning.value = false
    ocrError.value = ''
    ocrStatusText.value = '正在识别…'
    pasteText.value = ''
    clearRows()
  }

  function buildFlowData(prize, text) {
    const isBig = isBigWin(prize)
    const lines = (text || '').split('\n').map((s) => s.trim()).filter(Boolean)
    const steps = []
    let note = ''
    lines.forEach((line) => {
      const m = line.match(/^(\d+)\.\s*([^：:]+)[：:]\s*(.*)$/)
      if (m) {
        steps.push({ no: Number(m[1]), title: m[2], desc: m[3] || '' })
      } else if (line.indexOf('温馨提示') === 0) {
        note = line
      }
    })
    return {
      isBig,
      name: prize ? prize.name : '',
      bonusText: prize ? fmtBonus(prize.bonus) : '',
      winCount: prize ? prize.winCount || 1 : 1,
      draw: prize && prize.draw ? prize.draw : null,
      steps,
      note
    }
  }

  function showFlow(row) {
    const pr = row.prize && row.prize.best ? row.prize.best : row.prize
    flowData.value = buildFlowData(pr, isBigWin(pr) ? bigWinFlow(props.cfg, pr) : smallWinNote(props.cfg, pr))
    flowVisible.value = true
  }

  // v1.9.7：判断某期是否"当期"（最新一期）。用于明确告知用户这是历史某期（非当期）。
  function latestIssueOf(draws) {
    if (!draws || !draws.length) return null
    let max = null
    for (const d of draws) {
      const n = Number(d.issue)
      if (!Number.isNaN(n) && (max == null || n > max)) max = n
    }
    return max
  }
  function isCurrentIssue(draws, issue) {
    const latest = latestIssueOf(draws)
    if (latest == null || issue == null) return false
    return Number(issue) === Number(latest)
  }

  /** v1.9.10 OCR 文本预处理：把"红区 X / 蓝区 Y"相邻两行 join 成一行的"红区 X 蓝区 Y"。 */
  function preprocessOcrText(text) {
    if (!text) return text
    const lines = String(text).split(/\r?\n/).map((l) => l)
    for (let i = 0; i < lines.length - 1; i++) {
      const a = lines[i].trim()
      const b = lines[i + 1].trim()
      if (!a || !b) continue
      if (/^红区\b/.test(a) && /^蓝区\b/.test(b)) {
        lines[i] = a + ' ' + b
        lines[i + 1] = ''
        i++ // 跳过已合并的下一行
      }
    }
    return lines.filter((l) => l.trim().length > 0).join('\n')
  }

  async function parseAndCheck(text) {
    parseError.value = ''
    // v1.9.6：根据识别的 gameKey 决定用什么 cfg（识别到大乐透的票却用双色球 cfg 解析会丢行）
    const useCfg = (ocrMeta.value && ocrMeta.value.gameKey && GAME_CONFIG[ocrMeta.value.gameKey])
      ? GAME_CONFIG[ocrMeta.value.gameKey]
      : props.cfg
    // v1.9.10：合并"红区/蓝区"相邻行 + 启发式策略才走 extractTickets
    const tickets = extractTickets(preprocessOcrText(text || ''), useCfg)
    if (!tickets.length) {
      const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
      const nPos = useCfg.digits ? useCfg.digits.length : 0
      const needDesc = useCfg.playMode === 'direct'
        ? `每行需 ${nPos} 个数字${useCfg.tail ? ' + 1 个尾位' : ''}`
        : `每行需 ${useCfg.redCount} 个红球 + ${useCfg.blueCount} 个蓝球（票面格式：可为 "A: 01 02...+13" 大乐透多注 / "1) 01 02..." 编号列表 / "红区 ... - 蓝区 ..." 分段 / 纯号码行）`
      parseError.value = `共 ${lines.length} 行，均无法解析（${needDesc}）`
      rows.value = []
      return
    }
    // v1.9.7 对期修正：图上有明确彩种+期号时，绝不回溯 100 期。
    // 本地缓存命中该期 → 直接精确核对；本地没有 → 自动联网精确拉取（lookupAndCheckExact），不回退 props.draws 反查。
    const meta = ocrMeta.value || {}
    const metaIssue = meta.issue
    const metaGame = meta.gameKey
    const exact = metaIssue ? findDrawByIssue(props.draws, metaIssue) : null
    const exactByDate = !exact && meta.drawDate ? findDrawByDate(props.draws, meta.drawDate) : null
    if (metaIssue && metaGame && !exact && !exactByDate) {
      // 本地缓存没有这一期 → 自动精确联网拉取该期开奖（不再对最近 100 期反查）
      await lookupAndCheckExact()
      return
    }
    const useDraws = exact ? [exact] : (exactByDate ? [exactByDate] : (props.draws || []))
    lookupState.value = {
      gameKey: useCfg.key,
      issue: metaIssue || (exact && exact.issue) || (exactByDate && exactByDate.issue) || null,
      hit: exact || exactByDate || null,
      miss: (!exact && !exactByDate && metaIssue) ? `第 ${metaIssue} 期不在最近 ${(props.draws || []).length} 期缓存内` : null,
      nonCurrent: !!(exact || exactByDate) && !isCurrentIssue(props.draws, (exact || exactByDate).issue),
      loading: false,
      error: ''
    }
    const out = []
    tickets.forEach((nums) => {
      const ticket = useCfg.playMode === 'direct'
        ? { type: 'single', digits: nums.digits, tail: nums.tail }
        : { type: 'single', red: nums.red, blue: nums.blue }
      const checked = useDraws && useDraws.length ? checkTicketHistory(useCfg, ticket, useDraws) : null
      out.push({ ...nums, prize: checked })
    })
    rows.value = out
    const valid = out.filter((r) => useCfg.playMode === 'direct' ? r.digits.length : r.red.length).length
    if (valid === 0) {
      parseError.value = `共 ${tickets.length} 注，但均未通过奖级核对`
    }
    const big = out.find((r) => r.prize && r.prize.best && isBigWin(r.prize.best))
    if (big) {
      flowData.value = buildFlowData(big.prize.best, bigWinFlow(useCfg, big.prize.best))
      flowVisible.value = true
    }
  }

  function loadSample() {
    const sample = props.cfg.playMode === 'direct'
      ? (() => {
          const nPos = props.cfg.digits ? props.cfg.digits.length : 0
          const rows = []
          for (let r = 0; r < 3; r++) {
            const line = []
            for (let i = 0; i < nPos; i++) line.push((r * 3 + i) % 10)
            if (props.cfg.tail) line.push((r * 7 + 3) % (props.cfg.tailMax + 1))
            rows.push(line.join(' '))
          }
          return rows.join('\n')
        })()
      : props.cfg.key === 'ssq'
        ? '01 02 03 04 05 06 07\n08 09 10 11 12 13 14\n15 16 17 18 19 20 21'
        : '01 02 03 04 05 06 07\n08 09 10 11 12 13 14\n15 16 17 18 19 20 21 22'
    pasteText.value = sample
    parseAndCheck(sample)
  }

  function clearRows() {
    rows.value = []
    parseError.value = ''
  }

  watch(() => props.draws, () => {
    if (!props.draws || !props.draws.length || !rows.value.length) return
    rows.value = rows.value.map((r) => {
      if (props.cfg.playMode === 'direct' ? !r.digits.length : !r.red.length) return r
      const ticket = props.cfg.playMode === 'direct'
        ? { type: 'single', digits: r.digits, tail: r.tail }
        : { type: 'single', red: r.red, blue: r.blue }
      const checked = checkTicketHistory(props.cfg, ticket, props.draws)
      return { ...r, prize: checked }
    })
  }, { immediate: true })

  return {
    pasteDialog, pasteText, actionSheet, parseError, rows, flowVisible, flowData,
    imagePreview, imageBlob, imageName, cameraBusy, ocrRunning, ocrError, ocrStatusText,
    ocrMeta, ocrRawVisible, ocrRawText, ocrStats, lookupState, isWrongGame, partialParseWarn,
    winCount, totalBonus,
    openPasteDialog, confirmPaste, pickSource, applyImage, runOcr, lookupAndCheckExact,
    refillPasteFromOcr, retryOcr, clearImage, buildFlowData, showFlow,
    preprocessOcrText, parseAndCheck, loadSample, clearRows, fmtBonus
  }
}
