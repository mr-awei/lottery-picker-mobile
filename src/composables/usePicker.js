import { ref, computed, reactive, watch, onMounted, onBeforeUnmount, onDeactivated } from 'vue'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import { createPickerEngine, calcPlay, ALL_METHODS, METHOD_LABELS, calcDirectPlay, expandDirectTicket, createDirectPickerEngine, computeDirectStats, scoreDigits, generateDirect } from '../utils/picker-engine'
import { runAccelerated, getBackendLabel, isAccelEnabled } from '../utils/gpu-accel'
import { useRolling } from './useRolling'

// 选号核心逻辑（状态 / 生成 / 评分 / 锁定 / 方法切换 / 一直选 / 暴力模式 / 加速 / 保存自选）。
// 接收父组件的 props（含 cfg、draws，均为响应式），返回所有 refs / computed / methods，
// 由 AiPicker 主组件组合后下发给子组件（props 为同一上下文对象）。
export function usePicker(props) {
  const result = ref(null)
  const generatedAt = ref('')
  const playType = ref('single')
  const multiN = ref(5)
  const duplexRed = ref(props.cfg.redCount + 1)
  const duplexBlue = ref(props.cfg.blueCount)
  const danN = ref(props.cfg.redCount - 1)
  const tuoN = ref(3)
  // 复式胆拖的蓝球个数（双色球胆拖官方玩法：蓝球可 1~16 多选；从未定义是 1.6.0 遗留的崩溃级 bug）
  const blueN = ref(props.cfg.blueCount)
  // 后区胆拖（大乐透）：后区胆码数（0=不启用后区胆拖）
  const blueDanN = ref(0)
  const blueTuoN = ref(props.cfg.blueCount)
  // 倍数投注：1~99 倍，金额与奖金同倍
  const multiple = ref(1)
  const targetScore = ref(70)
  const searching = ref(false)
  const searchingCount = ref(0)
  // AI 选号设置（设置页写入同一 localStorage key）：一直选上限次数 / 暴力模式开关与次数
  const maxAttempts = ref(Number(localStorage.getItem('lp-ai-max-attempts')) || 20000)
  const violentAttempts = ref(Number(localStorage.getItem('lp-ai-violent-attempts')) || 100000)
  const isViolent = ref(false)
  const freq = reactive({})
  const stopping = ref(false)
  let cancelFlag = false
  // 摇奖动画（滚动号码球 → 定格结果）独立成 useRolling；result/generatedAt 由本 composable 持有
  const { rolling, rollBalls, stopRoll, playRoll } = useRolling(props, result, generatedAt)

  // 生成策略：空数组=真随机；默认全选
  const methodList = ALL_METHODS.map((k) => ({ key: k, label: METHOD_LABELS[k] }))
  // 默认选中老彩民使用频率最高、最经典的 6 种：区间分布 / 奇偶均衡 / 大小均衡 / 冷热倾向 / 和值区间 / 重号参照
  const DEFAULT_METHODS = ['zone', 'odd', 'size', 'hot', 'sum', 'repeat']
  // 按彩种推荐策略：切换彩种时默认勾选该彩种的推荐组合（直位数字彩推荐跨度/尾数/012路等，乐透彩推荐区间/奇偶/冷热等）
  function recommendedMethods() {
    const rec = props.cfg && props.cfg.recommendMethods
    return rec && rec.length ? rec : DEFAULT_METHODS
  }
  const methods = ref([...recommendedMethods()])
  // 修复（1.8.5+1.8.6 修正）：按"推荐"和"高级"分组——默认只显示 cfg.recommendMethods 推荐的几种，
  // 其余 15 种"高级策略"折叠到"更多策略"按钮里。用户原话："策略只显示推荐的哪几种，其他策略被折叠"。
  // 1.8.5 我把 methodsCollapsed 误设为 ref(false)（高级默认展开，反了），已修回 ref(true)。
  const recommendedMethodList = computed(() => {
    const rec = new Set(recommendedMethods())
    return methodList.filter((m) => rec.has(m.key))
  })
  const advancedMethodList = computed(() => {
    const rec = new Set(recommendedMethods())
    return methodList.filter((m) => !rec.has(m.key))
  })
  const methodsCollapsed = ref(true) // 修复（1.8.6）：默认 true（折叠），点"更多策略"翻转为 false 展开
  function toggleMethodsCollapse() { methodsCollapsed.value = !methodsCollapsed.value }
  const append = ref(false)

  // 暴力模式次数在 AI 选号界面可直接设定，与设置页共用 localStorage
  watch(violentAttempts, (v) => {
    const n = Math.max(1000, Math.min(1000000, Number(v) || 100000))
    violentAttempts.value = n
    localStorage.setItem('lp-ai-violent-attempts', String(n))
  })

  // 自定义号码：用户锁定必选号，剩余由 AI 补齐
  const lockedRed = ref([])
  const lockedBlue = ref([])
  // 杀号排除：用户标记不再出现的号码（生成时从采样池剔除）
  const excludedRed = ref([])
  const excludedBlue = ref([])

  // 直位玩法（3D/排列3/排列5/7星彩）：定位选号 + 组选方式
  const zxType = ref('direct')
  const posSel = ref(Array.from({ length: props.cfg.digits ? props.cfg.digits.length : 0 }, () => []))
  const tailSel = ref([])

  const zxLabel = computed(() => {
    const map = { direct: '直选', zuxuan3: '组选3', zuxuan6: '组选6' }
    return map[zxType.value] || '直选'
  })

  const hasPosSel = computed(() => posSel.value.some((a) => a.length) || tailSel.value.length > 0)

  function togglePos(p, v) {
    const arr = posSel.value[p]
    const i = arr.indexOf(v)
    if (i >= 0) arr.splice(i, 1)
    else arr.push(v)
  }

  function toggleTail(v) {
    const i = tailSel.value.indexOf(v)
    if (i >= 0) tailSel.value.splice(i, 1)
    else tailSel.value.push(v)
  }

  function clearPos() {
    posSel.value = posSel.value.map(() => [])
    tailSel.value = []
  }

  function isPosSel(p, v) {
    return posSel.value[p].includes(v)
  }

  // 切换彩种时重置直位状态并按彩种推荐策略
  watch(() => props.cfg.key, () => {
    zxType.value = 'direct'
    posSel.value = Array.from({ length: props.cfg.digits ? props.cfg.digits.length : 0 }, () => [])
    tailSel.value = []
    playType.value = 'single'
    methods.value = [...recommendedMethods()]
  })

  /** 各玩法可自定义号码上限（与彩票店玩法参数一致） */
  const lockLimit = computed(() => {
    if (playType.value === 'duplex') return { red: duplexRed.value, blue: duplexBlue.value }
    if (playType.value === 'danTuo') return { red: danN.value, blue: props.cfg.blueCount === 1 ? blueN.value : props.cfg.blueCount }
    return { red: props.cfg.redCount, blue: props.cfg.blueCount }
  })

  /** 自定义锁定玩法说明 */
  const lockHint = computed(() => {
    const r = lockLimit.value.red - lockedRed.value.length
    const b = lockLimit.value.blue - lockedBlue.value.length
    if (playType.value === 'single') return `已锁定 ${lockedRed.value.length} 红 ${lockedBlue.value.length} 蓝，剩余 ${r} 红 + ${b} 蓝由 AI 选出`
    if (playType.value === 'multi') return `已锁定 ${lockedRed.value.length} 红 ${lockedBlue.value.length} 蓝，每注均包含锁定号，剩余由 AI 为每注补全`
    if (playType.value === 'duplex') return `已锁定 ${lockedRed.value.length} 红 ${lockedBlue.value.length} 蓝，AI 补齐到 ${duplexRed.value} 红 + ${duplexBlue.value} 蓝复式集合`
    return `已锁定 ${lockedRed.value.length} 红全部作为胆码，AI 补齐到 ${danN.value} 胆 ${tuoN.value} 拖，剩余 ${b} 个${props.cfg.blueLabel}由 AI 选出`
  })

  /** 切换玩法或玩法参数时，裁剪超出上限的锁定号 */
  watch([playType, duplexRed, duplexBlue, danN], () => {
    const lim = lockLimit.value
    if (lockedRed.value.length > lim.red) lockedRed.value = lockedRed.value.slice(0, lim.red)
    if (lockedBlue.value.length > lim.blue) lockedBlue.value = lockedBlue.value.slice(0, lim.blue)
  })

  function toggleLockRed(n) {
    const i = lockedRed.value.indexOf(n)
    if (i >= 0) {
      lockedRed.value.splice(i, 1)
      return
    }
    if (lockedRed.value.length >= lockLimit.value.red) {
      ElMessage.warning(`当前玩法最多自定义 ${lockLimit.value.red} 个${props.cfg.redLabel}`)
      return
    }
    lockedRed.value.push(n)
  }

  function toggleLockBlue(n) {
    const i = lockedBlue.value.indexOf(n)
    if (i >= 0) {
      lockedBlue.value.splice(i, 1)
      return
    }
    if (lockedBlue.value.length >= lockLimit.value.blue) {
      ElMessage.warning(`当前玩法最多自定义 ${lockLimit.value.blue} 个${props.cfg.blueLabel}`)
      return
    }
    lockedBlue.value.push(n)
  }

  function clearLocked() {
    lockedRed.value = []
    lockedBlue.value = []
  }

  function isLockedRed(n) {
    return lockedRed.value.includes(n)
  }

  function isLockedBlue(n) {
    return lockedBlue.value.includes(n)
  }

  // 杀号排除：点击在"杀号"与"不杀"之间切换
  function toggleExcludeRed(n) {
    const i = excludedRed.value.indexOf(n)
    if (i >= 0) excludedRed.value.splice(i, 1)
    else excludedRed.value.push(n)
  }

  function toggleExcludeBlue(n) {
    const i = excludedBlue.value.indexOf(n)
    if (i >= 0) excludedBlue.value.splice(i, 1)
    else excludedBlue.value.push(n)
  }

  function isExcludedRed(n) {
    return excludedRed.value.includes(n)
  }

  function isExcludedBlue(n) {
    return excludedBlue.value.includes(n)
  }

  function clearExcluded() {
    excludedRed.value = []
    excludedBlue.value = []
  }

  /** 定胆：把推荐号码加入锁定（满员时提示） */
  function applyDanRed(n) {
    if (lockedRed.value.includes(n)) return
    if (excludedRed.value.includes(n)) toggleExcludeRed(n)
    if (lockedRed.value.length >= lockLimit.value.red) {
      ElMessage.warning(`当前玩法最多锁定 ${lockLimit.value.red} 个${props.cfg.redLabel}，请先解锁一个`)
      return
    }
    lockedRed.value.push(n)
  }

  /** 定胆：把推荐蓝球加入锁定 */
  function applyDanBlue(n) {
    if (lockedBlue.value.includes(n)) return
    if (excludedBlue.value.includes(n)) toggleExcludeBlue(n)
    if (lockedBlue.value.length >= lockLimit.value.blue) {
      ElMessage.warning(`当前玩法最多锁定 ${lockLimit.value.blue} 个${props.cfg.blueLabel}，请先解锁一个`)
      return
    }
    lockedBlue.value.push(n)
  }

  const currentPlay = computed(() => {
    const base = { append: append.value && props.cfg.zhuijia, multiple: multiple.value }
    // 直位玩法：3D/排列3/排列5/7星彩
    if (props.cfg.playMode === 'direct') {
      const pos = posSel.value.map((a) => [...a].sort((x, y) => x - y))
      const tail = props.cfg.tail ? [...tailSel.value].sort((x, y) => x - y) : []
      const hasPos = pos.some((a) => a.length) || tail.length > 0
      if (hasPos) {
        return { type: 'duplex', pos, tail: props.cfg.tail ? tail : undefined, zx: zxType.value, ...base }
      }
      return {
        type: playType.value === 'multi' ? 'multi' : 'single',
        ...(playType.value === 'multi' ? { n: multiN.value } : {}),
        zx: zxType.value,
        ...base
      }
    }
    const locked = {
      red: lockedRed.value.slice().sort((a, b) => a - b),
      blue: lockedBlue.value.slice().sort((a, b) => a - b)
    }
    const hasLock = locked.red.length > 0 || locked.blue.length > 0
    const excluded = {
      red: excludedRed.value.slice().sort((a, b) => a - b),
      blue: excludedBlue.value.slice().sort((a, b) => a - b)
    }
    const hasExclude = excluded.red.length > 0 || excluded.blue.length > 0
    const excl = hasExclude ? { excluded } : {}
    if (playType.value === 'single') return { type: 'single', ...base, ...(hasLock ? { locked } : {}), ...excl }
    if (playType.value === 'multi') return { type: 'multi', n: multiN.value, ...base, ...(hasLock ? { locked } : {}), ...excl }
    if (playType.value === 'duplex') return { type: 'duplex', redCount: duplexRed.value, blueCount: duplexBlue.value, ...base, ...(hasLock ? { locked } : {}), ...excl }
    const danTuoBase = { type: 'danTuo', danN: danN.value, tuoN: tuoN.value, ...base, ...(hasLock ? { locked } : {}), ...excl }
    // 复式胆拖：双色球胆拖蓝球多选（官方玩法）
    if (props.cfg.blueCount === 1 && blueN.value > 1) danTuoBase.blueCount = blueN.value
    // 大乐透后区胆拖：blueDanN>0 时启用后区胆码+拖码
    if (props.cfg.blueCount > 1 && blueDanN.value > 0) {
      danTuoBase.blueDanN = blueDanN.value
      danTuoBase.blueTuoN = blueTuoN.value
    }
    return danTuoBase
  })

  const liveCalc = computed(() => (props.cfg.playMode === 'direct' ? calcDirectPlay(props.cfg, currentPlay.value) : calcPlay(props.cfg, currentPlay.value)))
  const liveCombos = computed(() => liveCalc.value.combos)
  const liveAmount = computed(() => liveCalc.value.amount)

  // 后区胆拖边界修正：胆码不超过 blueCount-1，拖码至少补足 blueCount
  watch([blueDanN, blueTuoN, playType], () => {
    if (blueDanN.value < 0) blueDanN.value = 0
    const maxDan = props.cfg.blueCount - 1
    if (blueDanN.value > maxDan) blueDanN.value = maxDan
    const minTuo = props.cfg.blueCount - blueDanN.value
    if (blueTuoN.value < minTuo) blueTuoN.value = minTuo
    const maxTuo = props.cfg.blueMax - blueDanN.value
    if (blueTuoN.value > maxTuo) blueTuoN.value = maxTuo
  })

  /** 组选形态归一：zuxuan3 = 3位2种数字（1个重复）；zuxuan6 = 3位互不相同 */
  function normalizeGroupDigits(zx, digits) {
    const arr = (digits || []).map(Number)
    if (zx === 'direct') return arr.slice(0, 3)
    const uniq = [...new Set(arr)]
    const rnd = (exclude) => {
      let v = Math.floor(Math.random() * 10)
      while (exclude.includes(v)) v = Math.floor(Math.random() * 10)
      return v
    }
    if (zx === 'zuxuan3') {
      let out
      if (uniq.length === 3) out = [uniq[0], uniq[0], uniq[1]]
      else if (uniq.length === 2) out = [uniq[0], uniq[0], uniq[1]]
      else out = [uniq[0], uniq[0], rnd([uniq[0]])]
      return out.slice(0, 3).sort((a, b) => a - b)
    }
    // zuxuan6
    let out
    if (uniq.length === 3) out = uniq
    else if (uniq.length === 2) out = [uniq[0], uniq[1], rnd(uniq)]
    else out = [uniq[0], rnd([uniq[0]]), rnd([uniq[0]])]
    while (new Set(out).size < 3) out[2] = rnd(out.slice(0, 2))
    return out.slice(0, 3).sort((a, b) => a - b)
  }

  /** 直位结果票包装：单注/多注统一结构并带 zx */
  function directTicketFromLines(lines) {
    const zx = zxType.value
    const tickets = lines.map((l) => ({ digits: normalizeGroupDigits(zx, l.digits), tail: l.tail != null ? l.tail : null }))
    if (tickets.length > 1) return { type: 'multi', tickets, zx }
    return { type: 'single', digits: tickets[0].digits, tail: tickets[0].tail, zx }
  }

  /** 直位单次生成（同步） */
  function generateDirectOnce(n) {
    const lines = []
    const st = computeDirectStats(props.cfg, props.draws || [])
    for (let j = 0; j < n; j++) {
      const g = generateDirect(props.cfg, props.draws, { tries: 200, stats: st })
      if (g) lines.push(g)
    }
    if (!lines.length) return null
    const ticket = directTicketFromLines(lines)
    const totals = lines.map((l) => l.score.total || 0)
    return {
      ticket,
      total: Math.round(totals.reduce((a, b) => a + b, 0) / totals.length),
      max: Math.round(Math.max(...totals)),
      min: Math.round(Math.min(...totals)),
      count: totals.length,
      lines,
      stats: computeDirectStats(props.cfg, props.draws)
    }
  }

  /** 直位定位复式：展开每注并评分（同步） */
  function generateDirectDuplex() {
    const play = currentPlay.value
    const st = computeDirectStats(props.cfg, props.draws)
    const lines = expandDirectTicket(props.cfg, play).map((c) => ({
      ...c,
      score: st ? scoreDigits(props.cfg, c.digits, c.tail, st) : { total: 0 }
    }))
    const totals = lines.map((l) => l.score.total || 0)
    return {
      ticket: play,
      total: lines.length ? Math.round(totals.reduce((a, b) => a + b, 0) / lines.length) : 0,
      max: lines.length ? Math.round(Math.max(...totals)) : 0,
      min: lines.length ? Math.round(Math.min(...totals)) : 0,
      count: lines.length,
      lines,
      stats: st
    }
  }

  function generate() {
    if (props.cfg.playMode === 'direct') {
      const play = currentPlay.value
      const r = play.type === 'duplex' ? generateDirectDuplex() : generateDirectOnce(play.type === 'multi' ? play.n : 1)
      if (r) playRoll(r)
      return
    }
    const engine = createPickerEngine(props.cfg, methods.value)
    const r = engine.generatePlay(props.draws, currentPlay.value)
    if (r) {
      playRoll(r)
    }
  }

  function resetFreq() {
    Object.keys(freq).forEach((k) => delete freq[k])
  }

  // 统计一张票中各号码出现次数（暴力模式用）。组合彩：红/蓝球；直位彩：每位数字 + 尾位
  function collectTicketFreq(ticket) {
    if (!ticket) return
    if (props.cfg.playMode === 'direct') {
      const lines = ticket.type === 'multi' && ticket.tickets ? ticket.tickets : ticket.type === 'single' ? [ticket] : []
      for (const ln of lines) {
        if (ln && Array.isArray(ln.digits)) {
          ln.digits.forEach((v, pi) => {
            const k = 'p_' + pi + '_' + v
            freq[k] = (freq[k] || 0) + 1
          })
        }
        if (ln && ln.tail != null) {
          const k = 'tail_' + ln.tail
          freq[k] = (freq[k] || 0) + 1
        }
      }
      return
    }
    // 组合彩：复式/胆拖/定位复式展开过大，不做频次统计
    if (!ticket || (ticket.type !== 'multi' && ticket.type !== 'single')) return
    const lines = ticket.type === 'multi' && ticket.tickets ? ticket.tickets : [ticket]
    for (const ln of lines) {
      if (ln && Array.isArray(ln.red)) ln.red.forEach((v) => {
        const k = 'red_' + v
        freq[k] = (freq[k] || 0) + 1
      })
      if (ln && Array.isArray(ln.blue)) ln.blue.forEach((v) => {
        const k = 'blue_' + v
        freq[k] = (freq[k] || 0) + 1
      })
    }
  }

  /** 选号进行中再次点击按钮：请求终止，循环在下一个让出点停下并输出当前最优解 */
  function stopSearching() {
    if (!searching.value || stopping.value) return
    stopping.value = true
    cancelFlag = true
  }

  /** 渲染最终结果：手动终止直接定格展示（不再播摇奖动画），正常结束保留摇奖动画 */
  function renderResult(final) {
    if (final && final.stopped) {
      result.value = final
      generatedAt.value = nowTime()
    } else if (final) {
      playRoll(final)
    }
  }

  async function pickUntilTarget(violent) {
    if (!props.draws || !props.draws.length) return
    isViolent.value = !!violent
    const totalCap = violent ? Math.max(1000, violentAttempts.value) : Math.max(1000, maxAttempts.value)
    searching.value = true
    searchingCount.value = 0
    stopping.value = false
    cancelFlag = false
    if (violent) resetFreq()
    stopRoll()
    result.value = null
    if (props.cfg.playMode === 'direct') {
      const engine = createDirectPickerEngine(props.cfg)
      const play = currentPlay.value
      if (play.type === 'duplex') {
        searching.value = false
        playRoll(generateDirectDuplex())
        return
      }
      const r = await engine.generateUntil(props.draws, play, targetScore.value, totalCap, (i) => {
        searchingCount.value = i
      }, (rt) => {
        if (violent) collectTicketFreq(rt.ticket)
      }, violent, () => cancelFlag)
      searching.value = false
      stopping.value = false
      if (!r) return
      const src = r.ticket.type === 'multi' ? r.ticket.tickets : [{ digits: r.ticket.digits, tail: r.ticket.tail }]
      const st = computeDirectStats(props.cfg, props.draws)
      const lines = src.map((t) => ({ digits: t.digits, tail: t.tail, score: st ? scoreDigits(props.cfg, t.digits, t.tail, st) : { total: 0 } }))
      const ticket = directTicketFromLines(src.map((t) => ({ digits: t.digits, tail: t.tail })))
      renderResult({ ...r, ticket, lines, violentMode: violent })
      return
    }

    // 乐透型：优先尝试 GPU/多线程加速（开启且后端可用时）。返回非 null 即走加速路径。
    const accel = await runAccelerated(
      props.cfg, props.draws, currentPlay.value, methods.value, targetScore.value, totalCap, violent,
      (i) => { searchingCount.value = i },
      (rt) => { if (violent) collectTicketFreq(rt) },
      () => cancelFlag
    )
    if (accel) {
      // 加速路径成功：合并暴力频次（Worker 已在内部累计）
      if (violent && accel.freq) {
        Object.keys(accel.freq).forEach((k) => { freq[k] = accel.freq[k] })
      }
      searching.value = false
      stopping.value = false
      accelBackend.value = await getBackendLabel()
      renderResult({ ...accel, violentMode: violent })
      return
    }

    // 回退：主线程 generateUntil（含 setTimeout 让出，保证 UI 不彻底冻结）
    const engine = createPickerEngine(props.cfg, methods.value)
    const r = await engine.generateUntil(props.draws, currentPlay.value, targetScore.value, totalCap, (i) => {
      searchingCount.value = i
    }, (rt) => {
      if (violent) collectTicketFreq(rt.ticket)
    }, violent, () => cancelFlag)
    searching.value = false
    stopping.value = false
    if (r) renderResult({ ...r, violentMode: violent })
  }

  const searchProgress = computed(() => {
    const cap = isViolent.value ? violentAttempts.value : maxAttempts.value
    return Math.min(100, Math.round((searchingCount.value / Math.max(1, cap)) * 100))
  })

  function nowTime() {
    const now = new Date()
    const p = (x) => String(x).padStart(2, '0')
    return `${now.getHours()}:${p(now.getMinutes())}:${p(now.getSeconds())}`
  }

  /** 历史开奖数据是否已加载（决定 AI 评分是否包含冷热/重号等统计） */
  const hasDraws = computed(() => !!(props.draws && props.draws.length))

  const savedTip = ref('')
  /** 保存按钮冷却标记——挡双击/快速连点（600ms 内再点击直接 return，不会入库） */
  const saving = ref(false)

  // 多线程加速后端徽标：显示当前实际生效的加速方式（WebGPU / 多线程 N 核并行 / 已关闭）
  const accelBackend = ref('已关闭')
  let accelListener = null
  onMounted(async () => {
    accelBackend.value = isAccelEnabled() ? await getBackendLabel() : '已关闭'
    accelListener = async () => {
      accelBackend.value = isAccelEnabled() ? await getBackendLabel() : '已关闭'
    }
    // 当设置页开关变化后返回本页，需要刷新徽标；监听自定义事件（onBeforeUnmount 必须移除，避免切彩种累积监听器）
    window.addEventListener('lp-accel-change', accelListener)
  })

  // keep-alive 切走：任务继续跑（不取消），仅停掉摇奖动画的定时器避免空转占用 CPU
  onDeactivated(() => {
    stopRoll()
  })

  onBeforeUnmount(() => {
    if (accelListener) window.removeEventListener('lp-accel-change', accelListener)
    // 卸载时停掉摇奖定时器，避免组件销毁后 timer 继续跑
    stopRoll()
    // 真正卸载（如切彩种重建）时通知进行中的选号任务尽快退出，避免旧实例 Promise 占用后台
    cancelFlag = true
  })

  const accelClass = computed(() => {
    const v = accelBackend.value
    if (v.indexOf('GPU 计算') === 0) return 'badge-gpu'
    if (v.indexOf('多线程加速') === 0) return 'badge-worker'
    return 'badge-off'
  })
  const accelHint = computed(() => {
    const v = accelBackend.value
    if (v.indexOf('GPU 计算') === 0) return '已启用 GPU 并行计算（WebGPU，需设备支持）'
    if (v.indexOf('多线程加速') === 0) return '已启用后台多线程并行计算，不阻塞界面'
    if (v.indexOf('已关闭（设备不支持）') === 0) return '本设备暂不支持硬件加速，开启亦无效'
    return '可在「设置 → 选号与加速」开启多线程加速'
  })

  return {
    // state + computed + methods（供 AiPicker 主组件下发子组件）
    result, generatedAt, playType, multiN, duplexRed, duplexBlue, danN, tuoN, blueN,
    blueDanN, blueTuoN, multiple, targetScore, searching, searchingCount, maxAttempts,
    violentAttempts, isViolent, freq, stopping, rolling, rollBalls, methods, methodsCollapsed,
    append, lockedRed, lockedBlue, excludedRed, excludedBlue, zxType, posSel, tailSel, savedTip, saving, accelBackend,
    methodList, recommendedMethodList, advancedMethodList, zxLabel, hasPosSel, lockLimit,
    lockHint, currentPlay, liveCalc, liveCombos, liveAmount, searchProgress, hasDraws,
    accelClass, accelHint,
    recommendedMethods, toggleMethodsCollapse, togglePos, toggleTail, clearPos, isPosSel,
    toggleLockRed, toggleLockBlue, clearLocked, isLockedRed, isLockedBlue,
    toggleExcludeRed, toggleExcludeBlue, isExcludedRed, isExcludedBlue, clearExcluded,
    applyDanRed, applyDanBlue,
    stopRoll, playRoll,
    generate, resetFreq, collectTicketFreq, stopSearching, renderResult, pickUntilTarget,
    nowTime
  }
}
