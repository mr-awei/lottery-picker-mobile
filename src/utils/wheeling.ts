// 旋转矩阵（Wheeling System）：从号码池中按矩阵公式生成保证覆盖的精简组合
// 架构：公式表 WHEELING_TABLE[gameKey] 存储标准矩阵；applyWheeling 将索引映射为实际号码

/** 旋转矩阵公式定义 */
export interface WheelingFormula {
  /** 公式名，如 "选7中6保5" */
  name: string
  /** 用户号码池大小 */
  poolSize: number
  /** 每注选取个数（= 彩种 redCount） */
  pickSize: number
  /** 保证命中数（中 Y 保 Z） */
  guarantee: number
  /** 矩阵行：每行是一组索引（0-based，对应用户号码池下标） */
  lines: number[][]
  /** 总注数 */
  count: number
}

/** 从 arr 中枚举所有 k 组合（索引数组） */
function combosOfIndices(n: number, k: number): number[][] {
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

/** 构建"全组合"公式（中 k 保 k，即不缩水的基准矩阵） */
function fullComboFormula(name: string, poolSize: number, pickSize: number): WheelingFormula {
  const lines = combosOfIndices(poolSize, pickSize)
  return { name, poolSize, pickSize, guarantee: pickSize, lines, count: lines.length }
}

/**
 * 双色球旋转矩阵公式表（pickSize=6）
 * 基准：全组合 C(n,6) 即"中6保6"
 * 缩水：选7中6保5 = 6 注（去掉 7 个全组合中的 {0,1,2,3,4,5} 行，保证任意 5 个号共线）
 */
const SSQ_FORMULAS: WheelingFormula[] = [
  // 选7中6保5（缩水版，6注）
  {
    name: '选7中6保5',
    poolSize: 7,
    pickSize: 6,
    guarantee: 5,
    // 6 行，分别缺少索引 6,5,4,3,2,1（即不缺 0）
    // 任意 5 个号的子集必然不包含全部 6 个缺号 → 至少一行覆盖
    lines: [
      [0, 1, 2, 3, 4, 5],
      [0, 1, 2, 3, 4, 6],
      [0, 1, 2, 3, 5, 6],
      [0, 1, 2, 4, 5, 6],
      [0, 1, 3, 4, 5, 6],
      [0, 2, 3, 4, 5, 6]
    ],
    count: 6
  },
  // 以下为全组合基准（中6保6）
  fullComboFormula('选7中6全保', 7, 6),
  fullComboFormula('选8中6全保', 8, 6),
  fullComboFormula('选9中6全保', 9, 6),
  fullComboFormula('选10中6全保', 10, 6),
  fullComboFormula('选11中6全保', 11, 6),
  fullComboFormula('选12中6全保', 12, 6)
]

/**
 * 大乐透旋转矩阵公式表（pickSize=5）
 * 基准：全组合 C(n,5) 即"中5保5"
 */
const DLT_FORMULAS: WheelingFormula[] = [
  fullComboFormula('选7中5全保', 7, 5),
  fullComboFormula('选8中5全保', 8, 5),
  fullComboFormula('选9中5全保', 9, 5),
  fullComboFormula('选10中5全保', 10, 5)
]

/** 旋转矩阵公式表：key = 彩种 key */
export const WHEELING_TABLE: Record<string, WheelingFormula[]> = {
  ssq: SSQ_FORMULAS,
  dlt: DLT_FORMULAS
}

/**
 * 应用旋转矩阵：将公式中的索引映射为号码池中的实际号码。
 * @param pool 用户选定的号码池（升序数字数组）
 * @param formula 旋转矩阵公式
 * @returns 矩阵生成的每注号码数组（每注 pickSize 个红球）
 */
export function applyWheeling(pool: number[], formula: WheelingFormula): number[][] {
  if (!pool || pool.length < formula.poolSize) return []
  return formula.lines.map((lineIdx) =>
    lineIdx.map((i) => pool[i]).sort((a, b) => a - b)
  )
}

/**
 * 获取某彩种某号码池大小可用的公式列表
 * @param gameKey 彩种 key
 * @param poolSize 号码池大小
 */
export function getFormulasForPool(gameKey: string, poolSize: number): WheelingFormula[] {
  const all = WHEELING_TABLE[gameKey] || []
  return all.filter((f) => f.poolSize === poolSize)
}
