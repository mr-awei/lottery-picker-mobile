// 旋转矩阵（Wheeling System）：从号码池中按矩阵公式生成保证覆盖的精简组合
// 用贪心覆盖设计（Covering Design）动态生成任意 poolSize 的缩水公式，无需硬编码

/** 旋转矩阵公式定义 */
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

/**
 * 贪心覆盖设计：生成最少的 pickSize-子集，使得任意 guarantee-子集至少被一行覆盖。
 * 每轮选覆盖未覆盖 t-子集最多的那行，直到全部覆盖。
 * 复杂度可接受：poolSize≤12, pickSize≤6 时 <100ms。
 */
function greedyCovering(poolSize: number, pickSize: number, guarantee: number): number[][] {
  const allLines = combos(poolSize, pickSize)
  const allSubsets = combos(poolSize, guarantee)
  const uncovered = new Set<number>(allSubsets.map((_, i) => i))
  const subsetArr = allSubsets
  const result: number[][] = []

  while (uncovered.size > 0) {
    let bestLine: number[] | null = null
    let bestCount = -1
    let bestCovered: number[] = []

    for (const line of allLines) {
      const covered: number[] = []
      for (const si of uncovered) {
        if (containsAll(line, subsetArr[si])) {
          covered.push(si)
        }
      }
      if (covered.length > bestCount) {
        bestCount = covered.length
        bestLine = line
        bestCovered = covered
        if (bestCount === uncovered.size) break
      }
    }

    if (!bestLine || bestCount <= 0) break
    result.push(bestLine)
    for (const si of bestCovered) uncovered.delete(si)
  }

  return result
}

/** 全组合公式（中 k 保 k） */
function fullCombo(name: string, poolSize: number, pickSize: number): WheelingFormula {
  const lines = combos(poolSize, pickSize)
  return { name, poolSize, pickSize, guarantee: pickSize, lines, count: lines.length }
}

/** 动态生成某彩种的全部公式（每个 poolSize 两个：缩水保 pickSize-1 + 全保） */
function buildFormulas(gameKey: string, pickSize: number, maxPool: number): WheelingFormula[] {
  const formulas: WheelingFormula[] = []
  for (let pool = pickSize + 1; pool <= maxPool; pool++) {
    // 缩水版：中 pickSize 保 pickSize-1
    const reducedLines = greedyCovering(pool, pickSize, pickSize - 1)
    formulas.push({
      name: `选${pool}中${pickSize}保${pickSize - 1}`,
      poolSize: pool,
      pickSize,
      guarantee: pickSize - 1,
      lines: reducedLines,
      count: reducedLines.length
    })
    // 全保版：中 pickSize 保 pickSize
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
