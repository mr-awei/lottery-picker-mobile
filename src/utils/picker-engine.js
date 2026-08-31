// 本地统计选号引擎：冷热号加权 + 区间均衡 + 奇偶均衡 + 和值区间 + 连号限量
// 输入近 100 期开奖数据，输出 n 注推荐号码及各维度得分
// 声明：彩票为独立随机事件，本引擎仅基于历史统计生成参考组合，不提高中奖概率

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1))
}

function range(n) {
  const a = new Array(n)
  for (let i = 0; i < n; i++) a[i] = i + 1
  return a
}

/** Fisher-Yates 无偏采样 k 个（替代 splice 有偏洗牌，O(n)） */
function randPick(arr, k) {
  const a = [...arr]
  const n = Math.min(k, a.length)
  for (let i = 0; i < n; i++) {
    const j = randInt(i, a.length - 1)
    const t = a[i]
    a[i] = a[j]
    a[j] = t
  }
  return a.slice(0, n)
}

/**
 * 加权池无重复采样：池中含重复权重元素（热号出现多次），
 * 洗牌过程中跳过已取号码，一次遍历取满 k 个不同号码，避免无效重试。
 */
function randPickUnique(pool, k) {
  const a = [...pool]
  const n = a.length
  const picked = []
  const seen = new Set()
  for (let i = 0; i < n && picked.length < k; i++) {
    const j = randInt(i, n - 1)
    const t = a[i]
    a[i] = a[j]
    a[j] = t
    if (!seen.has(a[i])) {
      seen.add(a[i])
      picked.push(a[i])
    }
  }
  return picked
}

/** 用户锁定号码规范化：过滤非法值、去重、升序。max 为号码上限 */
export function normLocked(max, locked) {
  if (!Array.isArray(locked) || !locked.length) return []
  const seen = new Set()
  const out = []
  for (const n of locked) {
    const v = Number(n)
    if (!Number.isInteger(v) || v < 1 || v > max || seen.has(v)) continue
    seen.add(v)
    out.push(v)
  }
  return out.sort((a, b) => a - b)
}

/** 组合数 C(n, k) */
export function comb(n, k) {
  if (k < 0 || k > n) return 0
  k = Math.min(k, n - k)
  let r = 1
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1)
  return Math.round(r)
}

/** 统计近 N 期冷热/遗漏（独立导出供自选号评分复用） */
export function computeStats(cfg, draws) {
  const redFreq = new Array(cfg.redMax + 1).fill(0)
  const redMiss = new Array(cfg.redMax + 1).fill(-1)
  const blueFreq = new Array(cfg.blueMax + 1).fill(0)
  const blueMiss = new Array(cfg.blueMax + 1).fill(-1)
  const tailFreq = new Array(10).fill(0)
  const total = draws.length

  for (let idx = 0; idx < total; idx++) {
    const d = draws[idx]
    const red = d.red || []
    for (let i = 0; i < red.length; i++) {
      const n = red[i]
      if (n >= 1 && n <= cfg.redMax) {
        redFreq[n]++
        redMiss[n] = idx
        tailFreq[n % 10]++
      }
    }
    const b1 = d.blue
    if (b1 >= 1 && b1 <= cfg.blueMax) {
      blueFreq[b1]++
      blueMiss[b1] = idx
    }
    const b2 = d.blue2
    if (b2 != null && b2 >= 1 && b2 <= cfg.blueMax) {
      blueFreq[b2]++
      blueMiss[b2] = idx
    }
  }

  // 热号 = 近 10 期内出现 ≥3 次的号码（1.8.3 修复：原来误用全局 redFreq[n]>=3，
  // 近 10 期口径应统计 recent 内的频率）
  const recent = draws.slice(0, Math.min(10, total))
  const recentFreq = new Array(cfg.redMax + 1).fill(0)
  for (const d of recent) {
    const red = d.red || []
    for (let i = 0; i < red.length; i++) {
      const n = red[i]
      if (n >= 1 && n <= cfg.redMax) recentFreq[n]++
    }
  }
  const hotSet = new Set()
  for (let n = 1; n <= cfg.redMax; n++) {
    if (recentFreq[n] >= 3) hotSet.add(n)
  }
  const hot = [...hotSet]

  const cold = []
  for (let n = 1; n <= cfg.redMax; n++) {
    const miss = redMiss[n] === -1 ? total : total - redMiss[n]
    if (miss >= 10) cold.push(n)
  }

  const hotBlue = new Set()
  for (const d of recent) {
    if (d.blue != null) hotBlue.add(d.blue)
    if (d.blue2 != null) hotBlue.add(d.blue2)
  }

  const first = draws[0] || {}
  const lastRed = (first.red || []).filter((n) => n >= 1 && n <= cfg.redMax)
  const lastBlue = []
  if (first.blue != null && first.blue >= 1 && first.blue <= cfg.blueMax) lastBlue.push(first.blue)
  if (first.blue2 != null && first.blue2 >= 1 && first.blue2 <= cfg.blueMax) lastBlue.push(first.blue2)

  // 每个号码的遗漏期数（0 = 上期刚出）
  const omitVal = []
  for (let n = 1; n <= cfg.redMax; n++) {
    omitVal[n] = redMiss[n] === -1 ? total : total - redMiss[n]
  }
  const blueOmit = []
  for (let b = 1; b <= cfg.blueMax; b++) {
    blueOmit[b] = blueMiss[b] === -1 ? total : total - blueMiss[b]
  }

  // 近 5 期红球和值均值（均值回归策略用）
  const sumRecentArr = draws.slice(0, Math.min(5, total))
  const sumRecent = sumRecentArr.length
    ? sumRecentArr.reduce((acc, d) => acc + (d.red || []).reduce((a, b) => a + b, 0), 0) / sumRecentArr.length
    : 0

  return { redFreq, redMiss, blueFreq, blueMiss, hot, cold, hotBlue, total, lastRed, lastBlue, tailFreq, omitVal, blueOmit, sumRecent }
}

/** 质数集合（双色球/大乐透红球共用） */
const PRIMES = new Set([2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31])

/** 红球结构评分（独立导出） */
export function scoreRed(cfg, red, s) {
  const zones = [0, 0, 0]
  red.forEach((n) => {
    const z = n <= cfg.zoneEdges[0] ? 0 : n <= cfg.zoneEdges[1] ? 1 : 2
    zones[z]++
  })
  // 快乐8 选 N（1~10）：zoneTarget 固定 [3,4,3] 是"选十"的，切玩法时按实际号数比例动态分配，
  // 否则选1~选9 区间评分被压到接近 0（1.8.3 修复）
  let zoneTarget = cfg.zoneTarget
  if (cfg.kl8 && Array.isArray(zoneTarget)) {
    const n = red.length
    const a = Math.round(n * 3 / 10)
    const b = Math.round(n * 4 / 10)
    zoneTarget = [Math.max(0, a), Math.max(0, b), Math.max(0, n - a - b)]
  }
  let zoneScore = 0
  zoneTarget.forEach((t, i) => {
    zoneScore += Math.max(0, 1 - Math.abs(zones[i] - t) / t)
  })
  zoneScore = (zoneScore / zoneTarget.length) * 100

  const odds = red.filter((n) => n % 2 === 1).length
  const targetOdd = Math.round(cfg.redCount / 2)
  const oddScore = Math.max(0, 100 - Math.abs(odds - targetOdd) * 25)

  const sum = red.reduce((a, b) => a + b, 0)
  const mid = (cfg.sumMin + cfg.sumMax) / 2
  const sumScore = Math.max(0, 100 - (Math.abs(sum - mid) / (cfg.sumMax - cfg.sumMin)) * 220)

  const sorted = [...red].sort((a, b) => a - b)
  let cons = 0
  for (let i = 1; i < sorted.length; i++) if (sorted[i] - sorted[i - 1] === 1) cons++
  const consScore = cons <= 1 ? 100 : Math.max(0, 100 - (cons - 1) * 45)

  const hotIn = red.filter((n) => s.hot.includes(n)).length
  const coldIn = red.filter((n) => s.cold.includes(n)).length
  const hotScore = Math.min(100, hotIn * 25 + coldIn * 10)

  // 大小比：大号(>sizeSplit)个数接近目标
  const sizeSplit = cfg.sizeSplit || Math.floor(cfg.redMax / 2)
  const bigs = red.filter((n) => n > sizeSplit).length
  const targetBig = Math.round(cfg.redCount / 2)
  const sizeScore = Math.max(0, 100 - Math.abs(bigs - targetBig) * 30)

  // 质合比：质数个数接近 2
  const primes = red.filter((n) => PRIMES.has(n)).length
  const primeScore = Math.max(0, 100 - Math.abs(primes - 2) * 28)

  // 012路均衡：按 n%3 分三路，偏离均分惩罚
  const routes = [0, 0, 0]
  red.forEach((n) => routes[n % 3]++)
  const perRoute = cfg.redCount / 3
  const routeScore = Math.max(0, 100 - routes.reduce((a, c) => a + Math.abs(c - perRoute), 0) * 22)

  // 跨度：max-min 落在常见区间
  const span = sorted[sorted.length - 1] - sorted[0]
  const spanMin = cfg.spanMin != null ? cfg.spanMin : 16
  const spanMax = cfg.spanMax != null ? cfg.spanMax : 30
  const spanScore = span >= spanMin && span <= spanMax ? 100 : Math.max(0, 100 - Math.min(60, Math.abs(span - (spanMin + spanMax) / 2) * 6))

  // 尾数分散：重复尾数惩罚
  const tails = new Array(10).fill(0)
  red.forEach((n) => tails[n % 10]++)
  const tailPairs = tails.reduce((a, c) => a + Math.max(0, c - 1), 0)
  const tailScore = Math.max(0, 100 - tailPairs * 22)

  // 重号：与上期重复 1~2 个最自然
  let reps = 0
  if (s.lastRed && s.lastRed.length) red.forEach((n) => { if (s.lastRed.includes(n)) reps++ })
  const repeatScore = reps <= 2 ? 100 : reps === 3 ? 70 : Math.max(0, 100 - reps * 18)

  // 遗漏回补：包含适当数量的中遗漏号码（3~15 期未出）
  const omitOk = red.filter((n) => s.omitVal[n] >= 3 && s.omitVal[n] <= 15).length
  const omitScore = omitOk >= 2 ? 100 : omitOk === 1 ? 75 : 55

  // AC值（算术复杂度）：独特两两差值数 - (k-1)，适中区间加分
  const diffSet = new Set()
  for (let i = 0; i < sorted.length; i++) for (let j = i + 1; j < sorted.length; j++) diffSet.add(sorted[j] - sorted[i])
  const ac = diffSet.size - (sorted.length - 1)
  const acScore = ac >= 5 && ac <= 10 ? 100 : Math.max(0, 100 - Math.abs(ac - 7) * 12)

  // 邻号参照：与上期号码 ±1 的邻号命中 1~2 个最自然（老彩民"补位定胆"）
  const neighborSet = new Set()
  if (s.lastRed && s.lastRed.length) {
    s.lastRed.forEach((n) => { neighborSet.add(n - 1); neighborSet.add(n + 1) })
  }
  const neighborIn = red.filter((n) => neighborSet.has(n)).length
  const neighborScore = neighborIn === 2 ? 100 : neighborIn === 1 ? 90 : neighborIn === 0 ? 60 : Math.max(0, 100 - (neighborIn - 2) * 25)

  // 黄金分割：号码接近 redMax×0.382 / ×0.618 基点（动态适配双色球33/大乐透35）
  const g1 = Math.round(cfg.redMax * 0.382)
  const g2 = Math.round(cfg.redMax * 0.618)
  const goldenIn = red.filter((n) => Math.abs(n - g1) <= 2 || Math.abs(n - g2) <= 2).length
  const goldenScore = goldenIn >= 1 && goldenIn <= 2 ? 100 : goldenIn > 2 ? 80 : 60

  // 镜像对称：恒值对码（redMax+1-n）同出惩罚，避免全镜像畸形组合
  const mirrorVal = cfg.redMax + 1
  const redSet = new Set(red)
  let mirrorPairs = 0
  red.forEach((n) => {
    const p = mirrorVal - n
    if (p !== n && p >= 1 && p <= cfg.redMax && redSet.has(p)) mirrorPairs++
  })
  mirrorPairs = Math.floor(mirrorPairs / 2)
  const mirrorScore = mirrorPairs === 0 ? 100 : Math.max(0, 100 - mirrorPairs * 45)

  // 和值尾数：个位落 3~7 中段最常见
  const sumTail = sum % 10
  const sumTailScore = sumTail >= 3 && sumTail <= 7 ? 100 : sumTail === 0 || sumTail === 8 || sumTail === 9 ? 80 : 70

  // 均值回归：和值贴近近 5 期平均
  const meanScore = s.sumRecent != null && s.sumRecent > 0 ? Math.max(0, 100 - Math.min(60, (Math.abs(sum - s.sumRecent) / 15) * 100)) : 80

  // 斐波那契遗漏周期：遗漏值接近 8/13/21 的号码进入补号池
  const fiboHits = red.filter((n) => {
    const o = s.omitVal[n]
    return (o >= 7 && o <= 9) || (o >= 12 && o <= 14) || (o >= 20 && o <= 22)
  }).length
  const fiboScore = fiboHits >= 2 ? 100 : fiboHits === 1 ? 85 : 65

  // 龙头凤尾：龙头偏小、凤尾偏大的常见区间
  const headOk = sorted[0] <= (cfg.redMax <= 33 ? 9 : 11)
  const tailOk = sorted[sorted.length - 1] >= 28
  const headTailScore = headOk && tailOk ? 100 : headOk || tailOk ? 80 : 55

  // 夹号定位：落在上期任意两号之间的号码（0~1 个自然）
  const clampHits = red.filter((n) => {
    if (!s.lastRed || s.lastRed.length < 2) return false
    for (let i = 0; i < s.lastRed.length - 1; i++) {
      const a = s.lastRed[i]
      const b = s.lastRed[i + 1]
      if (b - a > 1 && n > a && n < b) return true
    }
    return false
  }).length
  const clampScore = clampHits <= 1 ? 100 : Math.max(0, 100 - (clampHits - 1) * 35)

  const total = Math.round(
    zoneScore * 0.1 + oddScore * 0.08 + sumScore * 0.09 + consScore * 0.05 + hotScore * 0.08 +
    sizeScore * 0.08 + primeScore * 0.04 + routeScore * 0.06 + spanScore * 0.04 + tailScore * 0.04 +
    repeatScore * 0.04 + omitScore * 0.03 + acScore * 0.02 + neighborScore * 0.04 + goldenScore * 0.03 +
    mirrorScore * 0.02 + sumTailScore * 0.03 + meanScore * 0.04 + fiboScore * 0.02 + headTailScore * 0.04 + clampScore * 0.03
  )
  return { zones, odds, sum, cons, hotIn, coldIn, bigs, primes, routes, span, tailPairs, reps, omitOk, ac,
    neighborIn, goldenIn, mirrorPairs, sumTail, meanScore, fiboHits, headOk, tailOk, clampHits,
    zoneScore, oddScore, sumScore, consScore, hotScore, sizeScore, primeScore, routeScore, spanScore, tailScore, repeatScore, omitScore, acScore,
    neighborScore, goldenScore, mirrorScore, sumTailScore, meanScore, fiboScore, headTailScore, clampScore, total }
}

/** 蓝球评分：热号 + 大小 + 012路 + 遗漏（无蓝球彩种返回 0 分） */
export function scoreBlue(cfg, blue, s) {
  if (!blue || !blue.length) return { hotIn: 0, hotScore: 0, sizeScore: 0, routeScore: 0, omitScore: 0, total: 0 }
  const hotIn = blue.filter((b) => s.hotBlue.has(b)).length
  const hotScore = Math.min(100, 40 + hotIn * 30)
  // 大乐透双蓝：一大一小偏好
  let sizeScore = 100
  if (blue.length > 1) {
    const split = cfg.blueSizeSplit || Math.floor(cfg.blueMax / 2)
    const bigs = blue.filter((b) => b > split).length
    const target = Math.round(blue.length / 2)
    sizeScore = Math.max(0, 100 - Math.abs(bigs - target) * 35)
  }
  // 012路分散
  let routeScore = 100
  if (blue.length > 1) {
    const routes = [0, 0, 0]
    blue.forEach((b) => routes[b % 3]++)
    const uniq = routes.filter((c) => c > 0).length
    routeScore = uniq >= blue.length ? 100 : Math.max(0, 100 - (blue.length - uniq) * 30)
  }
  // 遗漏适度（避免全热或全冷）
  const omitAvg = blue.reduce((a, b) => a + (s.blueOmit[b] != null ? s.blueOmit[b] : 5), 0) / blue.length
  const omitScore = omitAvg >= 2 && omitAvg <= 20 ? 100 : Math.max(0, 100 - Math.abs(omitAvg - 8) * 4)
  const total = Math.round(hotScore * 0.5 + sizeScore * 0.2 + routeScore * 0.15 + omitScore * 0.15)
  return { hotIn, hotScore, sizeScore, routeScore, omitScore, total }
}

/** 对单注号码按与引擎相同规则评分。s 可选：外部已算好的 computeStats 结果，避免重复统计 */
export function scoreTicket(cfg, draws, red, blue, s) {
  // 历史数据缺失时仍基于号码本身统计（区间/奇偶/和值/大小等不依赖历史），冷热/重号/遗漏等字段按空历史中性值处理
  const st = s || computeStats(cfg, draws || [])
  const rs = scoreRed(cfg, red, st)
  const bs = scoreBlue(cfg, blue || [], st)
  return { ...rs, blueHot: (blue || []).filter((b) => st.hotBlue.has(b)).length, blueScore: bs, stats: st }
}

/** 玩法定义 */
export const PLAY_TYPES = [
  { key: 'single', label: '单注', price: 2 },
  { key: 'multi', label: '多注', price: 2 },
  { key: 'duplex', label: '复式', price: 2 },
  { key: 'danTuo', label: '胆拖', price: 2 }
]

export const UNIT_PRICE = 2

/** 可选生成策略（方法）：覆盖经典冷热统计与老彩民经验型方法（21 种） */
export const ALL_METHODS = ['zone', 'odd', 'sum', 'cons', 'hot', 'size', 'prime', 'route', 'span', 'tail', 'repeat', 'omit', 'ac', 'neighbor', 'golden', 'mirror', 'sumTail', 'mean', 'fibo', 'headTail', 'clamp']
export const METHOD_LABELS = {
  zone: '区间均衡',
  odd: '奇偶均衡',
  sum: '和值区间',
  cons: '连号控制',
  hot: '冷热倾向',
  size: '大小均衡',
  prime: '质合配比',
  route: '012路均衡',
  span: '跨度优选',
  tail: '尾数分散',
  repeat: '重号参照',
  omit: '遗漏回补',
  ac: 'AC值优选',
  neighbor: '邻号参照',
  golden: '黄金分割',
  mirror: '镜像对称',
  sumTail: '和值尾数',
  mean: '均值回归',
  fibo: '斐波那契',
  headTail: '龙头凤尾',
  clamp: '夹号定位'
}

/** 归一化策略：不传=全部策略；传空数组=真随机（不用任何策略） */
export function normMethods(methods) {
  if (methods === undefined || methods === null) return ALL_METHODS
  if (!Array.isArray(methods) || !methods.length) return []
  const set = new Set(methods.filter((x) => ALL_METHODS.includes(x)))
  return ALL_METHODS.filter((x) => set.has(x))
}

/** 按选中策略归一化权重计算总分（只选部分策略时用于择优）。sc 可选：外部已算好的 scoreRed 结果 */
export function weightedScore(cfg, red, s, methods, sc) {
  const W = { zone: 0.1, odd: 0.08, sum: 0.09, cons: 0.05, hot: 0.08, size: 0.08, prime: 0.04, route: 0.06, span: 0.04, tail: 0.04, repeat: 0.04, omit: 0.03, ac: 0.02, neighbor: 0.04, golden: 0.03, mirror: 0.02, sumTail: 0.03, mean: 0.04, fibo: 0.02, headTail: 0.04, clamp: 0.03 }
  let wsum = 0
  methods.forEach((m) => { wsum += W[m] || 0 })
  if (!wsum) return 0
  const st = sc || scoreRed(cfg, red, s)
  let total = 0
  methods.forEach((m) => { total += st[m + 'Score'] * ((W[m] || 0) / wsum) })
  return Math.round(total)
}

/** 计算玩法注数与金额。play 形如：
 *  single: {}
 *  multi: { n: 3 }
 *  duplex: { redCount: 7, blueCount: 2 }
 *  danTuo: { danRed: [2], tuoRed: [6], blue: [2] }  （red 数组展开计算）
 *  大乐透追加（cfg.zhuijia && play.append）时每注 +1 元
 */
export function calcPlay(cfg, play) {
  // 直位数字型（福彩3D/排列3/排列5/7星彩）：定位复式/多注/单注
  if (cfg.playMode === 'direct') {
    return calcDirectPlay(cfg, play)
  }
  const type = play ? play.type : 'single'
  let combos = 0
  if (type === 'single') combos = 1
  else if (type === 'multi') combos = Math.max(1, play.n || (Array.isArray(play.tickets) ? play.tickets.length : 1))
  else if (type === 'duplex') {
    // 兼容两种入参：玩法配置（redCount/blueCount）或实际票（red/blue 数组）
    const r = Array.isArray(play.red) ? play.red.length : (play.redCount || cfg.redCount + 1)
    const b = Array.isArray(play.blue) ? play.blue.length : (play.blueCount || cfg.blueCount)
    combos = comb(r, cfg.redCount) * comb(b, cfg.blueCount)
  } else if (type === 'danTuo') {
    const dan = Array.isArray(play.danRed) ? play.danRed.length : 0
    const tuo = Array.isArray(play.tuoRed) ? play.tuoRed.length : 0
    if (dan >= cfg.redCount || tuo <= 0) {
      combos = 0
    } else {
      const redCombos = comb(tuo, cfg.redCount - dan)
      // 后区胆拖（大乐透）：蓝球由 blueDan 固定 + 组合(blueTuo, blueCount - blueDan.length) 构成
      const blueDan = Array.isArray(play.blueDan) ? play.blueDan.length : 0
      const blueTuo = Array.isArray(play.blueTuo) ? play.blueTuo.length : 0
      if (blueDan > 0 && blueTuo >= cfg.blueCount - blueDan && blueDan < cfg.blueCount) {
        combos = redCombos * comb(blueTuo, cfg.blueCount - blueDan)
      } else {
        const b = Array.isArray(play.blue) ? play.blue.length : cfg.blueCount
        combos = redCombos * comb(b, cfg.blueCount)
      }
    }
  }
  const append = !!(cfg.zhuijia && play && play.append)
  const multiple = Math.max(1, Math.min(99, (play && play.multiple) || 1))
  const price = append ? UNIT_PRICE + (cfg.zhuijiaPrice || 1) : UNIT_PRICE
  return { combos, amount: combos * price * multiple, append, multiple }
}

/** 组合枚举（k<0 或 k>n 时安全返回空；k=0 返回一个空组合，用于无蓝球乐透型复式/胆拖） */
function combosOf(arr, k) {
  const n = arr.length
  if (k < 0 || k > n) return []
  if (k === 0) return [[]]
  const out = []
  const idx = Array.from({ length: k }, (_, i) => i)
  while (true) {
    out.push(idx.map((i) => arr[i]))
    let p = k - 1
    while (p >= 0 && idx[p] === n - k + p) p--
    if (p < 0) break
    idx[p]++
    for (let i = p + 1; i < k; i++) idx[i] = idx[i - 1] + 1
  }
  return out
}

/** 智能提取 OCR 文本中的多注号码（1.8.5）
 * 用户建议架构："远程 OCR 负责提取文字返回，本地负责找彩票号码"——
 * OCR 只返回 raw text，本地用 extractTickets 把文字解析成多注数组。
 *
 * 支持的票面格式（按优先级检测）：
 *  1. 字母前缀多注： "A: 01 02 09 14 19 20+13" / "B: 13 19 20 28 30+01" ...
 *     （"+" 之前是前区红球，+ 之后是后区蓝球；可跨行；v1.9.6 起大小写不敏感 + 兼容 . 分隔）
 *  2. 编号列表多注： "1) 01 02 ... + 01 02" / "2. 03 04 ..."
 *  3. 单行"红区 ... - 蓝区 ..."分段（parseLine 已支持）
 *  4. 纯号码行 "01 02 03 04 05 06 07"（parseLine 已支持）
 */
export function extractTickets(text, cfg) {
  if (!text || !cfg) return []
  const out = []
  const seen = new Set()  // v1.9.7：按 red+blue 串去重，三策略共用
  if (cfg.playMode === 'direct') {
    // 直位彩种：每行 1 注（多位数字）
    const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    for (const line of lines) {
      const nums = (line.match(/\d/g) || []).map(Number)
      const nPos = cfg.digits ? cfg.digits.length : 0
      const need = nPos + (cfg.tail ? 1 : 0)
      if (nums.length < need) continue
      out.push({ digits: nums.slice(0, nPos), tail: cfg.tail ? nums[nPos] : null })
    }
    return out
  }

  // 乐透型（红+蓝）：三种策略**全部跑 + 按 red+blue 去重**（v1.9.7 修复）
  // 修复原因（v1.9.6 漏修）：之前 letterBlocks 命中 ≥1 就 `return out` 早退，
  // OCR 误读某行（如 "C"→"("、": "→" "、整行只剩数字）会直接丢一注且不进入 per-line 兜底。
  // 新逻辑：letterBlocks / numberedBlocks / perLine 全部跑完，按 red+blue 字符串去重。
  // 例："A: 01 02 09 14 19 20+13\nB: 13 19 20 28 30 31+01\nC: 08 13 20 22 25 30+12\n..."
  //     "C: 08..." 被 OCR 误成 "(: 08..." → letterBlocks 只匹配 4 注 → 之前直接 return 4 → 丢 C
  //     现在 perLine 兜底抓回 "08 13 20 22 25 30+12"，合计 5 注。

  // 从 body 字符串里抽 red/blue，返回 {red, blue} 或 null
  const parseBody = (body) => {
    const plusM = body.match(/^(.+?)\s*\+\s*(.+)$/)
    let redNums, blueNums
    if (plusM) {
      redNums = plusM[1].match(/\d+/g) || []
      blueNums = plusM[2].match(/\d+/g) || []
    } else {
      const all = body.match(/\d+/g) || []
      redNums = all.slice(0, cfg.redCount)
      blueNums = all.slice(cfg.redCount, cfg.redCount + cfg.blueCount)
    }
    const red = redNums.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= cfg.redMax).sort((a, b) => a - b)
    const blue = blueNums.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= cfg.blueMax).sort((a, b) => a - b)
    return (red.length === cfg.redCount && blue.length === cfg.blueCount) ? { red, blue } : null
  }
  const ticketKey = (t) => (t.red || []).join(',') + '|' + (t.blue || []).join(',')
  const addUnique = (t) => {
    if (!t) return
    const k = ticketKey(t)
    if (seen.has(k)) return
    seen.add(k)
    out.push(t)
  }

  // 策略 1：字母前缀 A: / B. / C  （可跨行；v1.9.6 已加 [:：. ] 兼容）
  for (const m of String(text).matchAll(/[ \t]*([A-Za-z])[ \t]*[:：. ][ \t]*([^\n]+)/g)) {
    addUnique(parseBody(m[2]))
  }
  // 策略 2：编号前缀 1) / 2. / 3、
  for (const m of String(text).matchAll(/[ \t]*\d+[)\.、][ \t]*([^\n]+)/g)) {
    addUnique(parseBody(m[1]))
  }
  // 策略 3：逐行兜底 —— 抓回 OCR 漏字母 / 漏冒号 / 整行只剩数字的注
  // 跳过明显头部/尾部（4+ 位数字 = 期号/日期/流水号/金额）
  // 内联 per-line 解析（不能调 FileCheck.vue 里的 parseLine —— 那是组件局部函数）
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    if (/\b\d{4,}/.test(line)) continue  // 2023013 / 2023-02-07 / 100024 / 3.60
    // 已被策略 1 / 2 处理的行：避免重复解析
    if (/^[A-Za-z][\s:：.)\]、]/.test(line)) continue
    if (/^\d+[)\.、]/.test(line)) continue
    // 简单按 + 切 + 抽数字（与原 parseLine 等价；不处理"红区/蓝区"分段 —— 那是 FileCheck 组件自己用）
    const plusM = line.match(/^(.+?)\s*\+\s*(.+)$/)
    let redNums, blueNums
    if (plusM) {
      redNums = plusM[1].match(/\d+/g) || []
      blueNums = plusM[2].match(/\d+/g) || []
    } else {
      const all = line.match(/\d+/g) || []
      redNums = all.slice(0, cfg.redCount)
      blueNums = all.slice(cfg.redCount, cfg.redCount + cfg.blueCount)
    }
    const red = [...new Set(redNums.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= cfg.redMax))].sort((a, b) => a - b)
    const blue = [...new Set(blueNums.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= cfg.blueMax))].sort((a, b) => a - b)
    if (red.length === cfg.redCount && blue.length === cfg.blueCount) {
      addUnique({ red, blue })
    }
  }

  // 策略 4（v1.9.10 兜底）：当 1+2+3 全部 0 命中、且 text 行数明显偏多但都拆不开时，
  // 说明 OCR 把"红区 XX XX XX XX XX XX / 蓝区 YY"这种号码行吞成空/乱码到无法按行解析。
  // 此时从**非元信息**行里启发式抽号码：丢弃含"销售期/期号/日期/机号/操作员/序号/倍数/中国福利彩票/CHINA/双色球|单式|组合|红区|蓝区|彩票"这类关键词的整行（这些行的数字几乎都是元数据：日期、金额、流水号、序号等，混进号码池会编造成绩）。
  // 真实号码字符大概率漂在"裸数字行"里（OCR 直接吐出 "01 02 09 12 18 22 27+03"，或拆碎后不带任何元信息关键词）。
  if (out.length === 0) {
    const META_RE = /(销售期|兑奖期|销售站|机号|操作员|序号|倍数|彩票|LOTTERY|CHINA|WELFARE|双色球|大乐透|七乐彩|快乐8|F3D|福彩3D|组合|^[ \t]*(单式|复式|胆拖|追加)[ \t]*$|红区|蓝区|期数|开奖日期|^[ \t]*[A-Za-z][):：\.]|\d{4}[-\/.]\d{1,2}[-\/.]\d{1,2}|\d{4,}|>\s*$|:\s*$|\.\.\.|^$|^\s*[A-Za-z]+\s*$)/i
    const redPool = []
    const bluePool = []
    for (const rawLine of String(text).split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line) continue
      if (META_RE.test(line)) continue
      const all = line.match(/\d+/g) || []
      for (const s of all) {
        const n = Number(s)
        if (!Number.isInteger(n)) continue
        if (n >= 1 && n <= cfg.redMax && !redPool.includes(n)) redPool.push(n)
        if (cfg.blueMax && n >= 1 && n <= cfg.blueMax && !bluePool.includes(n)) bluePool.push(n)
      }
    }
    // 取首个组合：按出现顺序的红/蓝
    if (redPool.length >= cfg.redCount && (!cfg.blueMax || bluePool.length >= cfg.blueCount)) {
      const t = { red: redPool.slice(0, cfg.redCount).sort((a, b) => a - b), blue: cfg.blueMax ? bluePool.slice(0, cfg.blueCount).sort((a, b) => a - b) : [] }
      addUnique(t)
    }
  }
  return out
}

/** 展开注数安全上限（防御组合爆炸）：快乐8 选10 从 20 个号展开 = C(20,10)=18.4 万注，
 *  双色球 33 红 16 蓝全复式 ≈ 1772 万注。超过上限返回空（调用方提示"展开过大"）。 */
export const MAX_EXPAND_LINES = 100000

/** 把任意玩法票展开为单注数组 */
export function expandTicket(cfg, ticket) {
  if (!ticket || typeof ticket !== 'object') return []
  // 直位数字型：展开为 { digits, tail, zx } 单注
  if (cfg.playMode === 'direct') {
    return expandDirectTicket(cfg, ticket)
  }
  const type = ticket.type || 'single'
  const out = []
  if (type === 'single') {
    out.push({ red: [...(ticket.red || [])], blue: [...(ticket.blue || [])] })
  } else if (type === 'multi') {
    ;(ticket.tickets || []).forEach((t) => out.push({ red: [...(t.red || [])], blue: [...(t.blue || [])] }))
  } else if (type === 'duplex') {
    const reds = [...(ticket.red || [])].sort((a, b) => a - b)
    const blues = [...(ticket.blue || [])].sort((a, b) => a - b)
    // 先估算注数，超上限直接返回空，避免 combosOf 生成超大数组爆内存
    if (comb(reds.length, cfg.redCount) * comb(blues.length, cfg.blueCount) > MAX_EXPAND_LINES) return []
    combosOf(reds, cfg.redCount).forEach((r) => {
      combosOf(blues, cfg.blueCount).forEach((b) => out.push({ red: r, blue: b }))
    })
  } else if (type === 'danTuo') {
    const dan = [...(ticket.danRed || [])].sort((a, b) => a - b)
    const tuo = [...(ticket.tuoRed || [])].sort((a, b) => a - b)
    const blues = [...(ticket.blue || [])].sort((a, b) => a - b)
    const blueDan = [...(ticket.blueDan || [])].sort((a, b) => a - b)
    const blueTuo = [...(ticket.blueTuo || [])].sort((a, b) => a - b)
    // 后区胆拖（大乐透）：blueDan 固定 + 组合(blueTuo)
    let blueCombos = []
    if (blueDan.length > 0 && blueTuo.length >= cfg.blueCount - blueDan.length && blueDan.length < cfg.blueCount) {
      blueCombos = combosOf(blueTuo, cfg.blueCount - blueDan.length).map((t) =>
        [...blueDan, ...t].sort((a, b) => a - b)
      )
    } else {
      blueCombos = combosOf(blues, cfg.blueCount)
    }
    // 估算防护
    if (comb(tuo.length, cfg.redCount - dan.length) * blueCombos.length > MAX_EXPAND_LINES) return []
    combosOf(tuo, cfg.redCount - dan.length).forEach((t) => {
      blueCombos.forEach((b) => {
        out.push({ red: [...dan, ...t].sort((a, b) => a - b), blue: b })
      })
    })
  }
  return out
}

/** 对任意玩法票评分：展开所有单注分别评分，取平均分；附带最高分与最低分。s 可选：预计算 stats */
export function scoreTicketPlay(cfg, draws, ticket, s) {
  const lines = expandTicket(cfg, ticket)
  if (!lines.length) return { total: 0, lines: [], count: 0 }
  const st = s || computeStats(cfg, draws || [])
  // 性能优化（1.8.3）：复式/胆拖展开时，同一红球组合会配多个蓝球重复评分。
  // 按红球组合缓存 scoreRed（21 维红球评分），蓝球评分只对 blue 组合算一次。
  // 快乐8 等无蓝彩种直接退化为每注独立（red 即全部号码，无重复）。
  const redScoreCache = new Map()
  const scored = lines.map((l) => {
    const redArr = l.red || []
    const rkey = redArr.join(',')
    let rs = redScoreCache.get(rkey)
    if (!rs) {
      rs = scoreRed(cfg, redArr, st)
      redScoreCache.set(rkey, rs)
    }
    const bs = scoreBlue(cfg, l.blue || [], st)
    return {
      ...l,
      score: {
        ...rs,
        blueHot: (l.blue || []).filter((b) => st.hotBlue.has(b)).length,
        blueScore: bs,
        stats: st
      }
    }
  })
  const avg = scored.reduce((a, x) => a + (x.score.total || 0), 0) / scored.length
  const totals = scored.map((x) => x.score.total || 0)
  return {
    total: Math.round(avg),
    max: Math.round(Math.max(...totals)),
    min: Math.round(Math.min(...totals)),
    lines: scored,
    count: scored.length,
    stats: st
  }
}

/**
 * 加权池采样择优：从 pool 中随机取 k 个，满足约束则计分，多轮尝试取最高分。
 * opts: { forbidCold, strict, tries }
 *  - strict=true（单注/多注）：第一轮应用 和值/连号/区间 硬约束；不足 92 分时第二轮放宽约束继续择优
 *  - strict=false（复式/胆拖）：号码较多时区间约束不适用，直接按策略权重择优
 */
function pickBest(cfg, s, pool, k, m, opts) {
  const { forbidCold = false, strict = true, tries = 600 } = opts || {}
  const useZone = m.includes('zone')
  const useSum = m.includes('sum')
  const useCons = m.includes('cons')
  const useCold = m.includes('hot')
  let best = null

  const passes = (picked, applyStrict) => {
    if (useCold) {
      let coldIn = 0
      for (const n of picked) if (s.cold.includes(n)) coldIn++
      if (coldIn > 1) return false
      if (forbidCold && coldIn > 0) return false
    }
    if (applyStrict) {
      if (useSum) {
        let sum = 0
        for (const n of picked) sum += n
        if (sum < cfg.sumMin || sum > cfg.sumMax) return false
      }
      if (useCons) {
        let cons = 0
        for (let i = 1; i < picked.length; i++) if (picked[i] - picked[i - 1] === 1) cons++
        if (cons > 1) return false
      }
      if (useZone) {
        const z = scoreRed(cfg, picked, s).zones
        // 快乐8 选 N 时 zoneTarget 按实际号数动态（与 scoreRed 一致）
        let zt = cfg.zoneTarget
        if (cfg.kl8 && Array.isArray(zt)) {
          const nn = picked.length
          const a = Math.round(nn * 3 / 10)
          const b = Math.round(nn * 4 / 10)
          zt = [Math.max(0, a), Math.max(0, b), Math.max(0, nn - a - b)]
        }
        if (!z.every((v, i) => Math.abs(v - zt[i]) <= 1)) return false
      }
    }
    return true
  }

  const tryRound = (attempts, applyStrict) => {
    for (let attempt = 0; attempt < attempts; attempt++) {
      const picked = randPickUnique(pool, k).sort((a, b) => a - b)
      if (!passes(picked, applyStrict)) continue
      const sc = scoreRed(cfg, picked, s)
      const total = m.length && m.length < ALL_METHODS.length ? weightedScore(cfg, picked, s, m, sc) : sc.total
      if (!best || total > best.total) best = { red: picked, score: { ...sc, total } }
      if (best.total >= 92) break
    }
  }

  tryRound(tries, strict)
  if (strict && (!best || best.total < 92)) tryRound(300, false)
  if (!best) {
    const picked = randPick(range(cfg.redMax), k).sort((a, b) => a - b)
    return { red: picked, score: scoreRed(cfg, picked, s) }
  }
  return best
}

export function createPickerEngine(cfg, methods) {
  // cfg: GAME_CONFIG 中的 ssq / dlt
  // methods: 可选策略数组 ['zone','odd','sum','cons','hot']；空数组=真随机；不传=全部策略
  const m = normMethods(methods)
  const useHot = m.includes('hot')

  function buildPool(s) {
    const pool = []
    for (let n = 1; n <= cfg.redMax; n++) {
      let w = 2
      if (useHot && s.hot.includes(n)) w = 4
      if (useHot && s.cold.includes(n)) w = 1
      for (let i = 0; i < w; i++) pool.push(n)
    }
    return pool
  }

  function generateRed(s, pool, forbidCold, locked) {
    const lr = normLocked(cfg.redMax, locked)
    const need = cfg.redCount - lr.length
    if (need <= 0) return { red: lr.slice(0, cfg.redCount), score: null }
    // 真随机：不应用任何策略
    if (!m.length) {
      const poolArr = range(cfg.redMax).filter((n) => !lr.includes(n))
      return { red: [...lr, ...randPick(poolArr, need)].sort((a, b) => a - b), score: null }
    }
    const filteredPool = pool.filter((n) => !lr.includes(n))
    const r = pickBest(cfg, s, filteredPool, need, m, { forbidCold, strict: true, tries: 600 })
    return { red: [...lr, ...r.red].sort((a, b) => a - b), score: r.score }
  }

  function generateRedSet(s, pool, k, forbidCold, locked) {
    const lr = normLocked(cfg.redMax, locked)
    const need = k - lr.length
    if (need <= 0) return { red: lr.slice(0, k), score: null }
    if (!m.length) {
      const poolArr = range(cfg.redMax).filter((n) => !lr.includes(n))
      return { red: [...lr, ...randPick(poolArr, need)].sort((a, b) => a - b), score: null }
    }
    const filteredPool = pool.filter((n) => !lr.includes(n))
    const r = pickBest(cfg, s, filteredPool, need, m, { forbidCold, strict: false, tries: 800 })
    return { red: [...lr, ...r.red].sort((a, b) => a - b), score: r.score }
  }

  function buildBluePool(s) {
    const pool = []
    for (let b = 1; b <= cfg.blueMax; b++) {
      const w = useHot && s.hotBlue.has(b) ? 3 : 1
      for (let j = 0; j < w; j++) pool.push(b)
    }
    return pool
  }

  function generateBlue(s, pool, locked) {
    const lb = normLocked(cfg.blueMax, locked)
    const need = cfg.blueCount - lb.length
    if (need <= 0) return lb.slice(0, cfg.blueCount)
    if (!useHot) {
      const poolArr = range(cfg.blueMax).filter((n) => !lb.includes(n))
      return [...lb, ...randPick(poolArr, need)].sort((a, b) => a - b)
    }
    // 修复（1.8.3）：原来误用传入的红球加权池（pool 是 buildPool 的红球池！），
    // useHot 路径下生成 17~33 的"非法蓝球"，双色球/大乐透兑奖与评分全失真。
    // 蓝球必须用蓝球加权池 buildBluePool(s)。
    const bp = buildBluePool(s).filter((n) => !lb.includes(n))
    const blues = []
    for (let i = 0; i < need; i++) {
      let b = bp[randInt(0, bp.length - 1)]
      if (blues.includes(b) && bp.length > 1) {
        b = bp[randInt(0, bp.length - 1)]
      }
      blues.push(b)
    }
    return [...lb, ...blues].sort((a, b) => a - b)
  }

  /** 按玩法生成一票。s/pool 可选：外部已预计算（generateUntil 循环内复用，避免重复统计）
   *  play.locked = { red: [固定红球], blue: [固定蓝球] } 可选：锁定号码必含，剩余由算法补齐 */
  function generatePlay(draws, play, preS, prePool) {
    if (!draws) draws = []
    const s = preS || computeStats(cfg, draws)
    const pool = prePool || buildPool(s)
    const type = play ? play.type : 'single'
    const append = !!(cfg.zhuijia && play && play.append)
    const locked = (play && play.locked) || {}
    const lockedRed = normLocked(cfg.redMax, locked.red)
    const lockedBlue = normLocked(cfg.blueMax, locked.blue)

    if (type === 'multi') {
      const n = Math.max(1, Math.min(20, (play && play.n) || 3))
      const tickets = []
      for (let i = 0; i < n; i++) {
        const t = generateRed(s, pool, i === 0, lockedRed)
        const blue = generateBlue(s, pool, lockedBlue)
        const score = t.score || scoreRed(cfg, t.red, s)
        tickets.push({ red: t.red, blue, score })
      }
      const ticket = { type: 'multi', tickets, append }
      const scored = scoreTicketPlay(cfg, draws, ticket, s)
      return { ticket, stats: s, ...scored }
    }

    if (type === 'duplex') {
      const r = Math.max(cfg.redCount + 1, Math.min(cfg.redMax, (play && play.redCount) || cfg.redCount + 1))
      const b = Math.max(cfg.blueCount, Math.min(cfg.blueMax, (play && play.blueCount) || cfg.blueCount))
      const lr = lockedRed.slice(0, r)
      const rs = generateRedSet(s, pool, r, false, lr)
      const lb = lockedBlue.slice(0, b)
      const needB = b - lb.length
      const bluePool = buildBluePool(s).filter((n) => !lb.includes(n))
      const blues = [...lb, ...randPickUnique(bluePool, needB)].sort((a, b) => a - b)
      const ticket = { type: 'duplex', red: rs.red, blue: blues, append }
      const scored = scoreTicketPlay(cfg, draws, ticket, s)
      return { ticket, stats: s, ...scored }
    }

    if (type === 'danTuo') {
      const danN = Math.max(1, Math.min(cfg.redCount - 1, (play && play.danN) || cfg.redCount - 1))
      const tuoN = Math.max(cfg.redCount - danN + 1, Math.min(cfg.redMax - danN, (play && play.tuoN) || cfg.redCount - danN + 2))
      // 锁定红球优先作为胆码；超出部分忽略
      const lr = lockedRed.slice(0, danN)
      const dan = generateRedSet(s, pool, danN, false, lr)
      const restPool = []
      for (let i = 1; i <= cfg.redMax; i++) {
        if (dan.red.includes(i)) continue
        let w = 2
        if (useHot && s.hot.includes(i)) w = 4
        if (useHot && s.cold.includes(i)) w = 1
        for (let j = 0; j < w; j++) restPool.push(i)
      }
      const tuo = randPickUnique(restPool, tuoN).sort((a, b) => a - b)
      // 后区胆拖（大乐透）：blueDanN>0 时蓝球也拆胆拖；lockedBlue 作为后区胆码锁定
      const blueDanN = Math.max(0, Math.min(cfg.blueCount - 1, (play && play.blueDanN) || 0))
      const blueTuoN = Math.max(cfg.blueCount - blueDanN, Math.min(cfg.blueMax - blueDanN, (play && play.blueTuoN) || cfg.blueCount))
      let ticket
      if (blueDanN > 0) {
        const lb = normLocked(cfg.blueMax, lockedBlue).slice(0, blueDanN)
        const needD = blueDanN - lb.length
        const bpool = buildBluePool(s).filter((n) => !lb.includes(n))
        const blueDan = needD > 0
          ? [...lb, ...randPickUnique(bpool, needD)].sort((a, b) => a - b).slice(0, blueDanN)
          : [...lb].sort((a, b) => a - b)
        const restBpool = bpool.filter((n) => !blueDan.includes(n))
        const blueTuo = randPickUnique(restBpool.length >= blueTuoN ? restBpool : [...restBpool, ...range(cfg.blueMax).filter((n) => !blueDan.includes(n))], blueTuoN).sort((a, b) => a - b)
        ticket = { type: 'danTuo', danRed: dan.red, tuoRed: tuo, blueDan, blueTuo, blue: [...blueDan, ...blueTuo].slice(0, cfg.blueMax), append }
      } else {
        // 复式胆拖：蓝球多选（官方玩法，双色球蓝球 1~16 任选、大乐透后区多选）
        const blueN = Math.max(cfg.blueCount, Math.min(cfg.blueMax, (play && play.blueCount) || cfg.blueCount))
        const lb = normLocked(cfg.blueMax, lockedBlue).slice(0, blueN)
        const needB = blueN - lb.length
        const bpool = buildBluePool(s).filter((n) => !lb.includes(n))
        const blues = needB > 0 ? [...lb, ...randPickUnique(bpool, needB)].sort((a, b) => a - b) : [...lb].sort((a, b) => a - b)
        ticket = { type: 'danTuo', danRed: dan.red, tuoRed: tuo, blue: blues, append }
      }
      const scored = scoreTicketPlay(cfg, draws, ticket, s)
      return { ticket, stats: s, ...scored }
    }

    // single（默认）
    const t = generateRed(s, pool, true, lockedRed)
    const blue = generateBlue(s, pool, lockedBlue)
    const score = t.score || scoreRed(cfg, t.red, s)
    const ticket = { type: 'single', red: t.red, blue, append }
    const scored = scoreTicketPlay(cfg, draws, ticket, s)
    return { ticket, stats: s, ...scored }
  }

  /**
   * 持续选号：循环生成直到平均分达到目标，返回尝试次数与最终票。
   * 异步实现：onProgress 回调 + 定时让出主线程，避免长循环卡死 UI。
   * stats/pool 只计算一次，全程复用，性能远优于逐次 generatePlay。
   */
  async function generateUntil(draws, play, target, maxAttempts, onProgress, onTicket, forceFull, stopCheck) {
    if (!draws || draws.length === 0) return null
    const cap = Math.max(1, maxAttempts || 20000)
    const t = Math.max(1, Math.min(100, target == null ? 70 : target))
    const s = computeStats(cfg, draws)
    const pool = buildPool(s)
    let best = null
    let hitOnce = false
    let stopped = false
    for (let i = 1; i <= cap; i++) {
      const r = generatePlay(draws, play, s, pool)
      if (!r) return null
      if (onTicket) onTicket(r, i)
      if (!best || r.total > best.total) {
        best = { ...r, attempts: i }
      }
      if (r.total >= t) {
        r.attempts = i
        r.hitTarget = true
        hitOnce = true
        if (!forceFull) return r
      }
      if (i % 200 === 0) {
        if (onProgress) {
          onProgress(i, best)
          await new Promise((res) => setTimeout(res, 0))
        }
        // 修复（1.8.3）：stopCheck 独立于 onProgress——原来只在 onProgress 存在且 i%200 时才检查，
        // 若调用方没传 onProgress，中途终止永远失效
        if (stopCheck && stopCheck()) {
          stopped = true
          break
        }
      }
    }
    if (best) {
      if (!stopped) best.attempts = cap
      if (!hitOnce) best.hitTarget = false
      if (stopped) best.stopped = true
    }
    return best
  }

  return {
    generate(draws, n = 3) {
      return generatePlay(draws, { type: 'multi', n })
    },
    generatePlay,
    generateUntil
  }
}

// ==================== 直位数字型引擎（福彩3D/排列3/排列5/7星彩） ====================

/** 直位统计：每位频率/遗漏 + 尾位频率（7星彩） */
export function computeDirectStats(cfg, draws) {
  const nPos = cfg.digits.length
  const freq = Array.from({ length: nPos }, () => new Array(10).fill(0))
  const miss = Array.from({ length: nPos }, () => new Array(10).fill(-1))
  const tailFreq = cfg.tailMax != null ? new Array(cfg.tailMax + 1).fill(0) : null
  const tailMiss = cfg.tailMax != null ? new Array(cfg.tailMax + 1).fill(-1) : null
  const sumTailFreq = new Array(10).fill(0)
  const total = draws.length
  for (let idx = 0; idx < total; idx++) {
    const d = draws[idx] || {}
    const digs = d.digits || []
    for (let p = 0; p < nPos && p < digs.length; p++) {
      const v = Number(digs[p])
      if (Number.isInteger(v) && v >= 0 && v <= 9) {
        freq[p][v]++
        miss[p][v] = idx
      }
    }
    if (tailFreq && d.tail != null) {
      const t = Number(d.tail)
      if (Number.isInteger(t) && t >= 0 && t <= cfg.tailMax) {
        tailFreq[t]++
        tailMiss[t] = idx
      }
    }
    // 和值尾数热度（直位选号常用：和值尾 0-9 冷热）
    let sSum = 0
    let sCnt = 0
    for (let p = 0; p < nPos && p < digs.length; p++) {
      const v = Number(digs[p])
      if (Number.isInteger(v) && v >= 0 && v <= 9) { sSum += v; sCnt++ }
    }
    if (sCnt) sumTailFreq[sSum % 10]++
  }
  const hotPos = []
  const coldPos = []
  for (let p = 0; p < nPos; p++) {
    const hot = []
    const cold = []
    for (let v = 0; v <= 9; v++) {
      if (freq[p][v] >= 3) hot.push(v)
      const m = miss[p][v] === -1 ? total : total - miss[p][v]
      if (m >= 10) cold.push(v)
    }
    hotPos.push(hot)
    coldPos.push(cold)
  }
  const lastDraw = draws[0] || {}
  return {
    freq,
    miss,
    tailFreq,
    tailMiss,
    sumTailFreq,
    total,
    hotPos,
    coldPos,
    lastDigits: lastDraw.digits || [],
    lastTail: lastDraw.tail != null ? lastDraw.tail : null
  }
}

/** 直位评分：每位热度 + 和值 + 奇偶 + 大小 + 形态 + 重号 + 跨度 + 尾位热度 */
export function scoreDigits(cfg, digits, tail, s) {
  if (!digits || !digits.length) return { total: 0 }
  let hotScore = 0
  digits.forEach((v, p) => {
    if (s.hotPos[p] && s.hotPos[p].includes(v)) hotScore += 1
    if (s.coldPos[p] && s.coldPos[p].includes(v)) hotScore -= 0.6
  })
  hotScore = Math.max(0, Math.min(100, 60 + hotScore * 25))

  const sum = digits.reduce((a, b) => a + b, 0)
  const mid = (cfg.sumMin + cfg.sumMax) / 2
  const sumScore = Math.max(0, 100 - (Math.abs(sum - mid) / Math.max(1, (cfg.sumMax - cfg.sumMin) / 2)) * 55)

  const target = digits.length / 2
  const odds = digits.filter((n) => n % 2 === 1).length
  const oddScore = Math.max(0, 100 - Math.abs(odds - target) * 30)
  const bigs = digits.filter((n) => n >= 5).length
  const sizeScore = Math.max(0, 100 - Math.abs(bigs - target) * 30)

  const uniq = new Set(digits).size
  let formScore = 100
  if (uniq === 1) formScore = 55
  else if (uniq === 2) formScore = 85
  else formScore = 95

  let reps = 0
  if (s.lastDigits && s.lastDigits.length) {
    digits.forEach((v, p) => { if (s.lastDigits[p] === v) reps++ })
  }
  const repeatScore = reps <= 1 ? 100 : Math.max(0, 100 - reps * 30)

  const sorted = [...digits].sort((a, b) => a - b)
  const span = sorted[sorted.length - 1] - sorted[0]
  const spanScore = span >= 2 && span <= 8 ? 100 : Math.max(0, 100 - Math.abs(span - 5) * 10)

  let tailScore = 100
  if (cfg.tailMax != null && tail != null && s.tailFreq) {
    const tf = s.tailFreq[tail] || 0
    tailScore = Math.max(0, Math.min(100, 60 + tf * 8))
  }

  // 012路：每位 %3 分布，三类出现越均衡分越高
  const routes = [0, 0, 0]
  digits.forEach((n) => routes[n % 3]++)
  const routeUniq = routes.filter((c) => c > 0).length
  const routeScore = routeUniq >= 3 ? 100 : Math.max(0, 100 - (3 - routeUniq) * 25)

  // 质合配比：质数个数接近半数
  const DP = new Set([2, 3, 5, 7])
  const primes = digits.filter((n) => DP.has(n)).length
  const primeScore = Math.max(0, 100 - Math.abs(primes - target) * 30)

  // 镜像对称：0-5、1-6、2-7、3-8、4-9 互补成对，成对越多越对称
  const mirrorPair = { 0: 5, 1: 6, 2: 7, 3: 8, 4: 9, 5: 0, 6: 1, 7: 2, 8: 3, 9: 4 }
  let paired = 0
  const seen = new Set()
  digits.forEach((n) => {
    const m = mirrorPair[n]
    if (m != null && seen.has(m)) { paired++; seen.delete(m) }
    else seen.add(n)
  })
  const mirrorScore = paired >= Math.floor(digits.length / 2) ? 100 : Math.max(0, 100 - (Math.floor(digits.length / 2) - paired) * 40)

  // 龙头凤尾：首位偏小、末位偏大
  let headTailScore = 100
  if (digits.length >= 2) {
    const head = digits[0]
    const tailLast = digits[digits.length - 1]
    headTailScore = 50 + Math.max(0, 3 - head) * 10 + Math.max(0, tailLast - 6) * 10
    headTailScore = Math.max(0, Math.min(100, headTailScore))
  }

  // 和值尾数热度
  let sumTailScore = 100
  if (s.sumTailFreq && s.sumTailFreq.length) {
    const stf = s.sumTailFreq[sum % 10] || 0
    sumTailScore = Math.max(0, Math.min(100, 60 + stf * 6))
  }

  // 遗漏回补：每位数字遗漏适中（5~20期）加分，过热过冷减分
  let omitScore = 100
  if (s.miss) {
    let penalty = 0
    digits.forEach((v, p) => {
      const mv = s.miss[p] != null ? s.miss[p][v] : -1
      const m = mv === -1 ? s.total : s.total - mv
      if (m >= 5 && m <= 20) penalty += 0
      else penalty += 0.35
    })
    omitScore = Math.max(0, Math.min(100, 100 - penalty * 20))
  }

  const total = Math.round(
    hotScore * 0.18 + sumScore * 0.14 + oddScore * 0.1 + sizeScore * 0.08 +
    formScore * 0.06 + repeatScore * 0.06 + spanScore * 0.06 + tailScore * 0.06 +
    routeScore * 0.06 + primeScore * 0.06 + mirrorScore * 0.04 + headTailScore * 0.04 +
    sumTailScore * 0.04 + omitScore * 0.02
  )
  return { hotScore, sumScore, oddScore, sizeScore, formScore, repeatScore, spanScore, tailScore, routeScore, primeScore, mirrorScore, headTailScore, sumTailScore, omitScore, total, sum }
}

/** 生成一注直位号码：每位按热度加权池采样，多次择优取最高分。
 *  stats 可选：外部已算好的 computeDirectStats 结果，避免循环内反复全量统计（性能关键）。
 */
export function generateDirect(cfg, draws, opts = {}) {
  if (!draws) draws = []
  const s = opts.stats || computeDirectStats(cfg, draws)
  const nPos = cfg.digits.length
  const tries = Math.max(1, opts.tries || 200)
  let best = null
  for (let i = 0; i < tries; i++) {
    const digits = []
    for (let p = 0; p < nPos; p++) {
      const pool = []
      for (let v = 0; v <= 9; v++) {
        let w = 2
        if (s.hotPos[p].includes(v)) w = 4
        if (s.coldPos[p].includes(v)) w = 1
        for (let j = 0; j < w; j++) pool.push(v)
      }
      digits.push(pool[randInt(0, pool.length - 1)])
    }
    let tail = null
    if (cfg.tailMax != null) {
      const tpool = []
      for (let t = 0; t <= cfg.tailMax; t++) {
        let w = 2
        if (s.tailFreq && s.tailFreq[t] >= 3) w = 4
        for (let j = 0; j < w; j++) tpool.push(t)
      }
      tail = tpool[randInt(0, tpool.length - 1)]
    }
    const score = scoreDigits(cfg, digits, tail, s)
    if (!best || score.total > best.score.total) best = { digits, tail, score }
  }
  return best
}

/** 直位玩法注数与金额计算：单注/多注/定位复式 */
export function calcDirectPlay(cfg, play) {
  const type = play ? play.type : 'single'
  let combos = 0
  if (type === 'single') combos = 1
  else if (type === 'multi') combos = Math.max(1, play.n || (Array.isArray(play.tickets) ? play.tickets.length : 1))
  else if (type === 'duplex') {
    let c = 1
    ;(play.pos || []).forEach((arr) => {
      if (Array.isArray(arr) && arr.length) c *= arr.length
    })
    if (play.tail && Array.isArray(play.tail) && play.tail.length) c *= play.tail.length
    combos = c
  }
  const multiple = Math.max(1, Math.min(99, (play && play.multiple) || 1))
  return { combos, amount: combos * 2 * multiple, append: false, multiple }
}

/** 直位票展开为单注数组（定位复式做笛卡尔积；7星彩含尾位）。估算注数超上限时返回空。 */
export function expandDirectTicket(cfg, ticket) {
  const type = ticket.type || 'single'
  const out = []
  if (type === 'single') {
    out.push({ digits: [...(ticket.digits || [])], tail: ticket.tail != null ? ticket.tail : null, zx: ticket.zx || 'direct' })
  } else if (type === 'multi') {
    ;(ticket.tickets || []).forEach((t) => {
      out.push({ digits: [...(t.digits || [])], tail: t.tail != null ? t.tail : null, zx: ticket.zx || t.zx || 'direct' })
    })
  } else if (type === 'duplex') {
    const pos = (ticket.pos || []).map((arr) => [...arr])
    const tails = ticket.tail && Array.isArray(ticket.tail) && ticket.tail.length ? [...ticket.tail] : [null]
    // 组合爆炸防护：每位候选数乘积 × 尾位数
    let est = 1
    for (const arr of pos) est *= Math.max(1, arr.length)
    est *= Math.max(1, tails.length)
    if (est > MAX_EXPAND_LINES) return []
    let combos = [[]]
    pos.forEach((arr) => {
      const next = []
      combos.forEach((c) => arr.forEach((v) => next.push([...c, v])))
      combos = next
    })
    combos.forEach((c) => {
      tails.forEach((t) => out.push({ digits: c, tail: t, zx: ticket.zx || 'direct' }))
    })
  }
  return out
}

/** 直位生成器：持续生成直到平均分达到目标 */
export function createDirectPickerEngine(cfg) {
  async function generateUntil(draws, play, target, maxAttempts, onProgress, onTicket, forceFull, stopCheck) {
    if (!draws || !draws.length) return null
    const cap = Math.max(1, maxAttempts || 20000)
    const t = Math.max(1, Math.min(100, target == null ? 70 : target))
    const n = play && play.type === 'multi' ? Math.max(1, Math.min(20, play.n || 3)) : 1
    // 性能修复（1.8.3）：stats 只算一次并传给 generateDirect，
    // 原来每次迭代 generateDirect 内部都重新 computeDirectStats（10 万次全量统计 = 卡顿根因）
    const st = computeDirectStats(cfg, draws)
    let best = null
    let hitOnce = false
    let stopped = false
    for (let i = 1; i <= cap; i++) {
      const lines = []
      for (let j = 0; j < n; j++) {
        const g = generateDirect(cfg, draws, { tries: 80, stats: st })
        if (g) lines.push(g)
      }
      if (!lines.length) return null
      const avg = Math.round(lines.reduce((a, x) => a + x.score.total, 0) / lines.length)
      const ticket =
        n > 1
          ? { type: 'multi', tickets: lines.map((l) => ({ digits: l.digits, tail: l.tail })) }
          : { type: 'single', digits: lines[0].digits, tail: lines[0].tail }
      const r = { ticket, total: avg, count: n, stats: st }
      if (onTicket) onTicket(r, i)
      if (!best || avg > best.total) best = { ...r, attempts: i }
      if (avg >= t) {
        r.attempts = i
        r.hitTarget = true
        hitOnce = true
        if (!forceFull) return r
      }
      if (i % 200 === 0) {
        if (onProgress) {
          onProgress(i, best)
          await new Promise((res) => setTimeout(res, 0))
        }
        // 修复（1.8.3）：stopCheck 独立于 onProgress——原来只在 onProgress 存在且 i%200 时才检查，
        // 若调用方没传 onProgress，中途终止永远失效
        if (stopCheck && stopCheck()) {
          stopped = true
          break
        }
      }
    }
    if (best) {
      if (!stopped) best.attempts = cap
      if (!hitOnce) best.hitTarget = false
      if (stopped) best.stopped = true
    }
    return best
  }
  return {
    generate(draws, n = 3) {
      const lines = []
      const st = computeDirectStats(cfg, draws || [])
      for (let j = 0; j < n; j++) {
        const g = generateDirect(cfg, draws, { stats: st })
        if (g) lines.push(g)
      }
      return {
        ticket: { type: 'multi', tickets: lines.map((l) => ({ digits: l.digits, tail: l.tail })) },
        total: lines.length ? Math.round(lines.reduce((a, x) => a + x.score.total, 0) / lines.length) : 0,
        count: lines.length,
        stats: st
      }
    },
    generateUntil
  }
}

/**
 * 按彩种推荐策略动态生成评分条（AiPicker / MyPicks 共用）。
 * 每个彩种按 cfg.recommendMethods 展示对应维度的评分，数量与推荐策略一致（≥6），
 * 缺失字段兜底 0，避免旧数据/直位字段不存在时显示 NaN。
 */
const SCORE_ITEM_DEFS = {
  // 乐透型（红蓝球）
  zone: { label: '区间', key: 'zoneScore' },
  odd: { label: '奇偶', key: 'oddScore' },
  sum: { label: '和值', key: 'sumScore' },
  cons: { label: '连号', key: 'consScore' },
  hot: { label: '冷热', key: 'hotScore' },
  size: { label: '大小', key: 'sizeScore' },
  prime: { label: '质合', key: 'primeScore' },
  route: { label: '012路', key: 'routeScore' },
  span: { label: '跨度', key: 'spanScore' },
  tail: { label: '尾数', key: 'tailScore' },
  repeat: { label: '重号', key: 'repeatScore' },
  omit: { label: '遗漏', key: 'omitScore' },
  ac: { label: 'AC值', key: 'acScore' },
  neighbor: { label: '邻号', key: 'neighborScore' },
  golden: { label: '黄金分割', key: 'goldenScore' },
  mirror: { label: '镜像对称', key: 'mirrorScore' },
  sumTail: { label: '和值尾', key: 'sumTailScore' },
  mean: { label: '均值回归', key: 'meanScore' },
  fibo: { label: '斐波那契', key: 'fiboScore' },
  headTail: { label: '龙头凤尾', key: 'headTailScore' },
  clamp: { label: '夹号定位', key: 'clampScore' }
}
export function scoreItemsFor(cfg, score) {
  const safe = (v) => (Number.isFinite(v) ? v : 0)
  const methods = (cfg && cfg.recommendMethods && cfg.recommendMethods.length) ? cfg.recommendMethods : ALL_METHODS
  const items = []
  methods.forEach((m) => {
    const def = SCORE_ITEM_DEFS[m]
    if (!def || !score) return
    if (Number.isFinite(score[def.key])) items.push({ label: def.label, value: safe(score[def.key]), method: m })
  })
  // 直位彩种额外兼容 formScore（形态组合）
  if (cfg && cfg.playMode === 'direct' && Number.isFinite(score.formScore)) {
    items.push({ label: '形态', value: safe(score.formScore), method: 'form' })
  }
  if (!items.length && score) {
    // 兜底：至少展示总分
    items.push({ label: '综合', value: safe(score.total), method: 'total' })
  }
  return items
}
