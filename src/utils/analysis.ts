// 数据分析视图共用的统计函数（策略回测 / 遗漏分析 / 蓝球分析 / 历史同期 / 号码关系）
// 说明：draws 统一为「最新在前」——draws[0] 是最新一期，draws[i] 越旧。
// 本文件纯函数、无 DOM 依赖，可被 Vue 组件与 vitest 单测直接引用。
import type { Draw, GameConfig } from './types'
import { createPickerEngine } from './picker-engine'
import { checkPrize } from './prize-check'

/** 单个号码的历史遗漏间隔统计 */
export interface OmitStat {
  /** 历次遗漏间隔均值（出现两次之间平均隔多少期） */
  avg: number
  /** 历史最大遗漏间隔 */
  max: number
  /** 历史上遗漏间隔的样本个数（出现次数-1） */
  samples: number
}

/**
 * 计算每个号码的历史平均遗漏 / 最大遗漏。
 * draws 最新在前；返回数组下标即号码本身（1..max），第 0 位占位。
 * 蓝球统计合并 draw.blue 与 draw.blue2（大乐透后区两个球）。
 */
export function computeOmitStats(cfg: GameConfig, draws: Draw[]): {
  redAvg: number[]
  redMax: number[]
  blueAvg: number[]
  blueMax: number[]
} {
  const redMax = cfg.redMax ?? 0
  const blueMax = cfg.blueMax ?? 0
  const redAvg = new Array<number>(redMax + 1).fill(0)
  const redMaxArr = new Array<number>(redMax + 1).fill(0)
  const blueAvg = new Array<number>(blueMax + 1).fill(0)
  const blueMaxArr = new Array<number>(blueMax + 1).fill(0)

  const walk = (max: number, collect: (d: Draw) => number[]): OmitStat[] => {
    // appearances[n] = 号码 n 出现的 draws 下标列表（下标小 = 更近）
    const appearances: number[][] = Array.from({ length: max + 1 }, () => [])
    for (let idx = 0; idx < draws.length; idx++) {
      for (const n of collect(draws[idx])) {
        if (n >= 1 && n <= max) appearances[n].push(idx)
      }
    }
    const out: OmitStat[] = Array.from({ length: max + 1 }, () => ({ avg: 0, max: 0, samples: 0 }))
    for (let n = 1; n <= max; n++) {
      const pos = appearances[n]
      if (pos.length < 2) {
        out[n] = { avg: 0, max: 0, samples: 0 }
        continue
      }
      // 相邻两次出现的下标差 = 遗漏间隔（期数）
      let sum = 0
      let mx = 0
      for (let i = 1; i < pos.length; i++) {
        const gap = pos[i] - pos[i - 1]
        sum += gap
        if (gap > mx) mx = gap
      }
      out[n] = { avg: sum / (pos.length - 1), max: mx, samples: pos.length - 1 }
    }
    return out
  }

  const redStats = walk(redMax, (d) => d.red || [])
  for (let n = 1; n <= redMax; n++) {
    redAvg[n] = Math.round(redStats[n].avg * 10) / 10
    redMaxArr[n] = redStats[n].max
  }
  if (blueMax > 0) {
    const blueStats = walk(blueMax, (d) =>
      [d.blue, d.blue2].filter((b): b is number => b != null)
    )
    for (let b = 1; b <= blueMax; b++) {
      blueAvg[b] = Math.round(blueStats[b].avg * 10) / 10
      blueMaxArr[b] = blueStats[b].max
    }
  }
  return { redAvg, redMax: redMaxArr, blueAvg, blueMax: blueMaxArr }
}

/**
 * 计算某号码在最近 keep 期内每一期当时的遗漏值序列（最新在前 → 旧）。
 * 返回与 slice(0, keep) 对齐的数组：out[k] = 该号码在 draws[k] 这一期时的遗漏值
 * （即在 draws[k] 之后、draws[k] 之前隔了多少期未出；0 = 当期开出）。
 */
export function omitSeriesFor(cfg: GameConfig, draws: Draw[], num: number, isBlue: boolean, keep = 50): number[] {
  const slice = draws.slice(0, keep)
  const out: number[] = []
  // 从最新向旧扫描，记录距上一次出现还有多少期
  let since = 0
  for (let i = 0; i < slice.length; i++) {
    const hit = isBlue
      ? (slice[i].blue === num || slice[i].blue2 === num)
      : (slice[i].red || []).includes(num)
    out.push(hit ? 0 : since)
    since = hit ? 0 : since + 1
  }
  return out
}

/** 质数集合（蓝球质合分布用） */
export const BLUE_PRIMES = new Set([2, 3, 5, 7, 11, 13])

/** 回测：单期一行结果 */
export interface BacktestRow {
  issue: string
  date: string
  /** 本期生成的全部注（红+蓝） */
  tickets: Array<{ red: number[]; blue: number[] }>
  drawRed: number[]
  drawBlue: number[]
  /** 本期最佳中奖等级（0 = 未中） */
  level: number
  prizeName: string
  /** 本期所有注中奖金额合计 */
  bonus: number
}

export interface BacktestResult {
  rows: BacktestRow[]
  /** 总投入（注数×2元×期数） */
  totalCost: number
  /** 总中奖金额 */
  totalBonus: number
  /** 净盈亏 = 总中奖 - 总投入 */
  net: number
  /** ROI = 净盈亏 / 总投入 × 100 */
  roi: number
  /** 各奖级命中次数 level -> count */
  levelCounts: Record<number, number>
  /** 至少中一注的期数 */
  winPeriods: number
  /** 回测总期数 */
  totalPeriods: number
  /** 中奖率 = 中奖期数 / 总期数 */
  winRate: number
  /** 逐期累计净盈亏（旧→新），用于折线图 */
  cumulative: Array<{ issue: string; net: number }>
}

export interface BacktestOptions {
  /** 选中的策略 key（ALL_METHODS 子集） */
  methods: string[]
  /** 回测期数（近 N 期） */
  periods: number
  /** 每期生成几注 1/3/5 */
  perTicket: number
  /** 进度回调（已完成期数, 总期数） */
  onProgress?: (done: number, total: number) => void
  /** 中途取消检查（返回 true 立即停止） */
  shouldStop?: () => boolean
}

const UNIT_PRICE = 2
/**
 * 策略回测核心引擎。
 * draws 最新在前；对每个回测期 i，只用 draws[i+1..]（该期开奖之前的数据）生成号码，
 * 再与 draws[i] 实际开奖比对——严格避免用未来数据。
 * 最早期无历史数据时引擎退化为随机选号，不预留训练期。
 * 异步分批：每 10 期让出一次主线程（setTimeout 0），避免长任务卡死 UI。
 */
export async function runBacktest(cfg: GameConfig, draws: Draw[], opts: BacktestOptions): Promise<BacktestResult | null> {
  if (!draws || draws.length < 1) return null
  const periods = Math.max(1, Math.min(opts.periods, draws.length))
  const perTicket = Math.max(1, Math.min(10, opts.perTicket))
  const engine = createPickerEngine(cfg, opts.methods)

  const rows: BacktestRow[] = []
  const levelCounts: Record<number, number> = {}
  let totalBonus = 0
  let winPeriods = 0

  // i 从 0（最新）到 periods-1：回测 draws[i]，训练数据 draws.slice(i+1)
  for (let i = 0; i < periods; i++) {
    if (opts.shouldStop && opts.shouldStop()) return null
    const train = draws.slice(i + 1)
    const draw = draws[i]
    const res = engine.generate(train, perTicket)
    const tickets = ((res && res.ticket && res.ticket.tickets) || []) as Array<{ red: number[]; blue: number[] }>

    let bestLevel = 0
    let periodBonus = 0
    let periodName = '未中奖'
    for (const t of tickets) {
      const p = checkPrize(cfg, t.red || [], t.blue || [], draw)
      if (p.level > 0) {
        levelCounts[p.level] = (levelCounts[p.level] || 0) + 1
        periodBonus += p.bonus || 0
        if (p.level < bestLevel || bestLevel === 0) {
          bestLevel = p.level
          periodName = p.name
        }
      }
    }
    if (bestLevel > 0) winPeriods++
    totalBonus += periodBonus
    rows.push({
      issue: draw.issue,
      date: draw.date,
      tickets: tickets.map((t) => ({ red: t.red || [], blue: t.blue || [] })),
      drawRed: draw.red || [],
      drawBlue: [draw.blue, draw.blue2].filter((b): b is number => b != null),
      level: bestLevel,
      prizeName: periodName,
      bonus: periodBonus
    })

    // 分批让出主线程
    if ((i + 1) % 10 === 0 || i === periods - 1) {
      if (opts.onProgress) opts.onProgress(i + 1, periods)
      await new Promise((r) => setTimeout(r, 0))
    }
  }

  // rows 当前是 新→旧；累计盈亏按时间 旧→新 绘制
  const chrono = [...rows].reverse()
  const cumulative: Array<{ issue: string; net: number }> = []
  let acc = 0
  for (const row of chrono) {
    acc += row.bonus - UNIT_PRICE * perTicket
    cumulative.push({ issue: row.issue, net: Math.round(acc * 100) / 100 })
  }

  const totalCost = UNIT_PRICE * perTicket * periods
  const net = totalBonus - totalCost
  return {
    rows,
    totalCost,
    totalBonus: Math.round(totalBonus * 100) / 100,
    net: Math.round(net * 100) / 100,
    roi: totalCost ? Math.round((net / totalCost) * 10000) / 100 : 0,
    levelCounts,
    winPeriods,
    totalPeriods: periods,
    winRate: periods ? Math.round((winPeriods / periods) * 1000) / 10 : 0,
    cumulative
  }
}

/** 振幅工具：两个号码集合同位置差值绝对值分布的公共骨架（组件内按需） */
export function sumOf(red: number[] | undefined): number {
  return (red || []).reduce((a, b) => a + b, 0)
}

export function spanOf(red: number[] | undefined): number {
  const r = (red || []).slice().sort((a, b) => a - b)
  return r.length ? r[r.length - 1] - r[0] : 0
}
