// 高级条件缩水过滤：对复式展开后的全组合逐注做多维度条件过滤
// 所有计算维度与 picker-engine scoreRed 对齐，未勾选的条件不参与过滤
import type { GameConfig, ScoreStats } from './types'

/** 质数集合（与 picker-engine PRIMES 一致） */
const PRIMES = new Set([2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31])

/** 单注红球的结构维度（供条件过滤判定用） */
export interface RedDims {
  /** 和值 */
  sum: number
  /** AC 值（算术复杂度） */
  ac: number
  /** 奇数个数 */
  odds: number
  /** 大号个数（>sizeSplit） */
  bigs: number
  /** 跨度 max-min */
  span: number
  /** 连号个数（相邻差=1 的对数） */
  cons: number
  /** 与上期重号个数 */
  reps: number
  /** 012路分布 [0路,1路,2路] */
  routes: number[]
  /** 尾数重复个数（出现>1次的尾数多余部分之和） */
  tailPairs: number
  /** 质数个数 */
  primes: number
}

/** 条件过滤配置：每项 { enabled, ... }；未 enabled 的条件不参与过滤 */
export interface FilterConditions {
  sum: { enabled: boolean; min: number; max: number }
  ac: { enabled: boolean; min: number; max: number }
  oddEven: { enabled: boolean; ratio: string }
  bigSmall: { enabled: boolean; ratio: string }
  span: { enabled: boolean; min: number; max: number }
  consecutive: { enabled: boolean; count: string }
  repeat: { enabled: boolean; count: string }
  route012: { enabled: boolean; type: string }
  tailRepeat: { enabled: boolean; count: string }
  prime: { enabled: boolean; count: string }
}

/** 计算单注红球的结构维度（与 scoreRed 同口径，不依赖冷热/遗漏历史） */
export function computeRedDims(red: number[], cfg: GameConfig, lastRed?: number[]): RedDims {
  const sorted = [...red].sort((a, b) => a - b)
  const sum = sorted.reduce((a, b) => a + b, 0)

  // AC 值：独特两两差值数 - (k-1)
  const diffSet = new Set<number>()
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      diffSet.add(sorted[j] - sorted[i])
    }
  }
  const ac = diffSet.size - (sorted.length - 1)

  // 奇偶
  const odds = sorted.filter((n) => n % 2 === 1).length

  // 大小
  const sizeSplit = cfg.sizeSplit || Math.floor((cfg.redMax ?? 0) / 2)
  const bigs = sorted.filter((n) => n > sizeSplit).length

  // 跨度
  const span = sorted[sorted.length - 1] - sorted[0]

  // 连号
  let cons = 0
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] === 1) cons++
  }

  // 重号（与上期）
  let reps = 0
  if (lastRed && lastRed.length) {
    const lr = new Set(lastRed)
    sorted.forEach((n) => { if (lr.has(n)) reps++ })
  }

  // 012路
  const routes = [0, 0, 0]
  sorted.forEach((n) => routes[n % 3]++)

  // 尾数重复
  const tails = new Array<number>(10).fill(0)
  sorted.forEach((n) => tails[n % 10]++)
  const tailPairs = tails.reduce((a, c) => a + Math.max(0, c - 1), 0)

  // 质数
  const primes = sorted.filter((n) => PRIMES.has(n)).length

  return { sum, ac, odds, bigs, span, cons, reps, routes, tailPairs, primes }
}

/**
 * 判定单注是否满足全部已启用条件。
 * lines 的 red 字段为单注红球数组。stats 用于提供 lastRed（重号条件）。
 */
export function matchConditions(dims: RedDims, conds: FilterConditions): boolean {
  // 1. 和值范围
  if (conds.sum.enabled) {
    if (dims.sum < conds.sum.min || dims.sum > conds.sum.max) return false
  }
  // 2. AC 值范围
  if (conds.ac.enabled) {
    if (dims.ac < conds.ac.min || dims.ac > conds.ac.max) return false
  }
  // 3. 奇偶比 "odd:even"
  if (conds.oddEven.enabled) {
    const [oddPart] = conds.oddEven.ratio.split(':').map(Number)
    if (dims.odds !== oddPart) return false
  }
  // 4. 大小比 "big:small"
  if (conds.bigSmall.enabled) {
    const [bigPart] = conds.bigSmall.ratio.split(':').map(Number)
    if (dims.bigs !== bigPart) return false
  }
  // 5. 跨度范围
  if (conds.span.enabled) {
    if (dims.span < conds.span.min || dims.span > conds.span.max) return false
  }
  // 6. 连号个数
  if (conds.consecutive.enabled) {
    if (conds.consecutive.count !== 'any' && dims.cons !== Number(conds.consecutive.count)) return false
  }
  // 7. 重号个数
  if (conds.repeat.enabled) {
    if (conds.repeat.count !== 'any' && dims.reps !== Number(conds.repeat.count)) return false
  }
  // 8. 012路均衡（三路均不为 0 视为均衡）
  if (conds.route012.enabled && conds.route012.type === 'balanced') {
    if (dims.routes.some((r) => r === 0)) return false
  }
  // 9. 尾数重复个数
  if (conds.tailRepeat.enabled) {
    if (conds.tailRepeat.count !== 'any' && dims.tailPairs !== Number(conds.tailRepeat.count)) return false
  }
  // 10. 质数个数
  if (conds.prime.enabled) {
    if (conds.prime.count !== 'any' && dims.primes !== Number(conds.prime.count)) return false
  }
  return true
}

/**
 * 对展开后的单注数组做条件过滤。
 * @param lines 展开后的单注数组（含 red 字段）
 * @param conds 条件配置
 * @param cfg 彩种配置
 * @param stats computeStats 结果（提供 lastRed 重号参照）
 * @returns 过滤后的单注数组（保留原对象引用 + score 字段）
 */
export function filterByConditions<T extends { red?: number[] }>(
  lines: T[],
  conds: FilterConditions,
  cfg: GameConfig,
  stats?: ScoreStats
): T[] {
  const lastRed = stats?.lastRed || []
  return lines.filter((l) => {
    if (!l.red || !l.red.length) return false
    const dims = computeRedDims(l.red, cfg, lastRed)
    return matchConditions(dims, conds)
  })
}

/** 生成奇偶比下拉选项（按 redCount 动态） */
export function oddEvenOptions(redCount: number): Array<{ label: string; value: string }> {
  const opts: Array<{ label: string; value: string }> = []
  // 从偏均衡到偏极端，排除全奇/全偶
  for (let odd = 1; odd < redCount; odd++) {
    const even = redCount - odd
    // 只展示 odds >= evens 或常见组合，避免重复
    opts.push({ label: `${odd}:${even}`, value: `${odd}:${even}` })
  }
  // 去重：如果 redCount 为偶数，odd/even 和 even/odd 都会出现
  const seen = new Set<string>()
  return opts.filter((o) => {
    const [a, b] = o.value.split(':').map(Number)
    const key = a <= b ? `${a}:${b}` : `${b}:${a}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** 生成大小比下拉选项（按 redCount 动态） */
export function bigSmallOptions(redCount: number): Array<{ label: string; value: string }> {
  const opts: Array<{ label: string; value: string }> = []
  for (let big = 0; big <= redCount; big++) {
    const small = redCount - big
    opts.push({ label: `${big}:${small}`, value: `${big}:${small}` })
  }
  // 去重对称项
  const seen = new Set<string>()
  return opts.filter((o) => {
    const [a, b] = o.value.split(':').map(Number)
    const key = a <= b ? `${a}:${b}` : `${b}:${a}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
