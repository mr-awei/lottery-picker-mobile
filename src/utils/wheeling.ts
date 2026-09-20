// 旋转矩阵（Wheeling System）：贪心覆盖设计动态生成，支持多保证等级
// 优化：随机重启贪心（多次洗牌取最优），注数逼近标准公式

export interface WheelingFormula {
  name: string
  poolSize: number
  pickSize: number
  guarantee: number
  lines: number[][]
  count: number
}

/** 枚举 n 选 k 的所有索引组合 */
function combos(n: number, k: number): number[][] {
  if (k < 0 || k > n) return []
  if (k === 0) return [[]]
  const out: number[][] = []
  const idx = Array.from({ length: k }, (_, i) => i)
  // eslint-disable-next-line no-constant-condition
  while (true) {
    out.push([...idx])
    let p = k - 1
    while (p >= 0 && idx[p] === n - k + p) p--
    if (p < 0) break
    idx[p]++
    for (let i = p + 1; i < k; i++) idx[i] = idx[i - 1] + 1
  }
  return out
}

/** 判断 subset（升序）是否包含于 line（升序） */
function containsAll(line: number[], subset: number[]): boolean {
  let i = 0
  for (const s of subset) {
    while (i < line.length && line[i] < s) i++
    if (i >= line.length || line[i] !== s) return false
    i++
  }
  return true
}

/** Fisher-Yates 洗牌 */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * 单次贪心覆盖：按行顺序遍历，每次选覆盖未覆盖 t-子集最多的行。
 * @param lines 候选行（可预洗牌实现随机重启）
 * @param subsets 全部 t-子集
 * @param guarantee t
 */
function greedyOnce(lines: number[][], subsets: number[][]): number[][] {
  const uncovered = new Set<number>(subsets.map((_, i) => i))
  const result: number[][] = []
  const lineOrder = lines

  while (uncovered.size > 0) {
    let bestIdx = -1
    let bestCount = -1
    let bestCovered: number[] = []

    for (let li = 0; li < lineOrder.length; li++) {
      const line = lineOrder[li]
      const covered: number[] = []
      for (const si of uncovered) {
        if (containsAll(line, subsets[si])) covered.push(si)
      }
      if (covered.length > bestCount) {
        bestCount = covered.length
        bestIdx = li
        bestCovered = covered
        if (bestCount === uncovered.size) break
      }
    }

    if (bestIdx < 0 || bestCount <= 0) break
    result.push(lineOrder[bestIdx])
    for (const si of bestCovered) uncovered.delete(si)
  }

  return result
}

/**
 * 随机重启贪心覆盖设计：多次洗牌贪心，取注数最少的解。
 * restarts 次迭代，poolSize≤12 时 <200ms。
 */
function greedyCovering(poolSize: number, pickSize: number, guarantee: number, restarts = 30): number[][] {
  const allLines = combos(poolSize, pickSize)
  const allSubsets = combos(poolSize, guarantee)
  let best: number[][] | null = null

  for (let r = 0; r < restarts; r++) {
    const lines = r === 0 ? allLines : shuffle(allLines)
    const result = greedyOnce(lines, allSubsets)
    if (!best || result.length < best.length) {
      best = result
      if (result.length <= Math.ceil(allSubsets.length / combos(pickSize, guarantee).length)) break
    }
  }

  return best || []
}

/** 全组合公式（中 k 保 k） */
function fullCombo(name: string, poolSize: number, pickSize: number): WheelingFormula {
  const lines = combos(poolSize, pickSize)
  return { name, poolSize, pickSize, guarantee: pickSize, lines, count: lines.length }
}

/** 支持旋转矩阵的彩种 → 选号位数 / 最大号码池 */
const PICK_SIZE: Record<string, number> = { ssq: 6, dlt: 5 }
const MAX_POOL: Record<string, number> = { ssq: 12, dlt: 10 }

/** 是否支持旋转矩阵（轻量检查，不触发任何公式生成） */
export function isWheelingSupported(gameKey: string): boolean {
  return !!PICK_SIZE[gameKey]
}

/**
 * 生成某彩种「单个号码池」的公式。
 * 保证等级：pickSize-2（激进缩水）、pickSize-1（标准缩水）、pickSize（全保）
 */
function buildPoolFormulas(pickSize: number, pool: number): WheelingFormula[] {
  const aggressive = greedyCovering(pool, pickSize, pickSize - 2, 20)
  const reduced = greedyCovering(pool, pickSize, pickSize - 1, 30)
  return [
    {
      name: `选${pool}中${pickSize}保${pickSize - 2}`,
      poolSize: pool,
      pickSize,
      guarantee: pickSize - 2,
      lines: aggressive,
      count: aggressive.length
    },
    {
      name: `选${pool}中${pickSize}保${pickSize - 1}`,
      poolSize: pool,
      pickSize,
      guarantee: pickSize - 1,
      lines: reduced,
      count: reduced.length
    },
    fullCombo(`选${pool}中${pickSize}全保`, pool, pickSize)
  ]
}

/**
 * 公式缓存：**按 (彩种, 号码池) 懒生成**。
 * ⚠️ 性能关键：绝不在模块加载期生成公式。旧实现在 import 时就为主流彩种的全部号码池
 * 跑数十次「随机重启贪心覆盖」（枚举 C(n,k) 组合），同步阻塞主线程数秒——这正是
 * 「首次进入复式拆票页要等好久、之后秒切」的根因。
 */
const POOL_CACHE: Record<string, WheelingFormula[]> = {}

function poolFormulas(gameKey: string, poolSize: number): WheelingFormula[] {
  const pickSize = PICK_SIZE[gameKey]
  const maxPool = MAX_POOL[gameKey]
  if (!pickSize || !maxPool || poolSize <= pickSize || poolSize > maxPool) return []
  const key = `${gameKey}:${poolSize}`
  if (!POOL_CACHE[key]) POOL_CACHE[key] = buildPoolFormulas(pickSize, poolSize)
  return POOL_CACHE[key]
}

/**
 * 某彩种全部公式（惰性拼装：访问该彩种时才生成对应池，之后走缓存）。
 * 仅为测试/兼容保留；应用内请优先用 getFormulasForPool / isWheelingSupported，
 * 避免一次性生成整表造成卡顿。
 */
export const WHEELING_TABLE: Record<string, WheelingFormula[]> = {}
for (const g of Object.keys(PICK_SIZE)) {
  Object.defineProperty(WHEELING_TABLE, g, {
    enumerable: true,
    configurable: true,
    get() {
      const pickSize = PICK_SIZE[g]
      const maxPool = MAX_POOL[g]
      const out: WheelingFormula[] = []
      for (let pool = pickSize + 1; pool <= maxPool; pool++) out.push(...poolFormulas(g, pool))
      return out
    }
  })
}

/** 应用旋转矩阵：索引映射为实际号码 */
export function applyWheeling(pool: number[], formula: WheelingFormula): number[][] {
  if (!pool || pool.length < formula.poolSize) return []
  return formula.lines.map((lineIdx) =>
    lineIdx.map((i) => pool[i]).sort((a, b) => a - b)
  )
}

/** 获取某彩种某号码池大小可用的公式列表（按需懒生成并缓存） */
export function getFormulasForPool(gameKey: string, poolSize: number): WheelingFormula[] {
  return poolFormulas(gameKey, poolSize)
}
