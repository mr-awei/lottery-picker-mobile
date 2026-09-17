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
function greedyOnce(lines: number[][], subsets: number[][], guarantee: number): number[][] {
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
    const result = greedyOnce(lines, allSubsets, guarantee)
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

/**
 * 动态生成某彩种全部公式。
 * 保证等级：pickSize-2（激进缩水）、pickSize-1（标准缩水）、pickSize（全保）
 */
function buildFormulas(gameKey: string, pickSize: number, maxPool: number): WheelingFormula[] {
  const formulas: WheelingFormula[] = []
  for (let pool = pickSize + 1; pool <= maxPool; pool++) {
    // 激进缩水：中 pickSize 保 pickSize-2（注数最少，老彩民资金有限常用）
    const aggressive = greedyCovering(pool, pickSize, pickSize - 2, 20)
    formulas.push({
      name: `选${pool}中${pickSize}保${pickSize - 2}`,
      poolSize: pool,
      pickSize,
      guarantee: pickSize - 2,
      lines: aggressive,
      count: aggressive.length
    })
    // 标准缩水：中 pickSize 保 pickSize-1（最常用，资金充裕型）
    const reduced = greedyCovering(pool, pickSize, pickSize - 1, 30)
    formulas.push({
      name: `选${pool}中${pickSize}保${pickSize - 1}`,
      poolSize: pool,
      pickSize,
      guarantee: pickSize - 1,
      lines: reduced,
      count: reduced.length
    })
    // 全保：中 pickSize 保 pickSize（全组合）
    formulas.push(fullCombo(`选${pool}中${pickSize}全保`, pool, pickSize))
  }
  return formulas
}

/** 公式表：模块加载时动态生成并缓存 */
const FORMULA_CACHE: Record<string, WheelingFormula[]> = {
  ssq: buildFormulas('ssq', 6, 12),
  dlt: buildFormulas('dlt', 5, 10)
}

export const WHEELING_TABLE: Record<string, WheelingFormula[]> = FORMULA_CACHE

/** 应用旋转矩阵：索引映射为实际号码 */
export function applyWheeling(pool: number[], formula: WheelingFormula): number[][] {
  if (!pool || pool.length < formula.poolSize) return []
  return formula.lines.map((lineIdx) =>
    lineIdx.map((i) => pool[i]).sort((a, b) => a - b)
  )
}

/** 获取某彩种某号码池大小可用的公式列表 */
export function getFormulasForPool(gameKey: string, poolSize: number): WheelingFormula[] {
  const all = FORMULA_CACHE[gameKey] || []
  return all.filter((f) => f.poolSize === poolSize)
}
