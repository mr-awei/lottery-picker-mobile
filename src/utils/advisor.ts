// 智能推荐：杀号 / 定胆（仅乐透型 combo 彩种使用；直位型彩种由调用方隐藏该区域）
// 数据源：picker-engine.computeStats（redFreq/redMiss/omitVal/blueOmit/hot/lastRed 等）
// 声明：彩票为独立随机事件，本推荐仅基于历史统计，不提高中奖概率，不构成投注建议。
import type { Draw, GameConfig } from './types'
import { computeStats } from './picker-engine'

export interface AdvisorItem {
  num: number
  reason: string
}

export interface AdvisorResult {
  /** 红球杀号 Top-N */
  redKills: AdvisorItem[]
  /** 蓝球杀号 Top-N */
  blueKills: AdvisorItem[]
  /** 红球定胆 Top-N */
  redDans: AdvisorItem[]
}

const EMPTY: AdvisorResult = { redKills: [], blueKills: [], redDans: [] }

/**
 * 基于历史统计给出杀号 / 定胆推荐。
 * - 杀号：遗漏 > 15 期（或近 10 期 0 出现）的号码，按"超均值倍数 + 近期极冷"排序
 * - 定胆：热号（近 10 期 ≥3 次）优先，其次斐波那契回补期（遗漏 8~13），再次上期重号
 */
export function recommendKillAndDan(cfg: GameConfig, draws: Draw[] | null | undefined): AdvisorResult {
  if (!draws || !draws.length) return EMPTY
  // 直位型彩种不提供杀号定胆（规则差异过大，UI 侧也会隐藏）
  if (cfg.playMode === 'direct') return EMPTY
  const s = computeStats(cfg, draws)
  const redMax = cfg.redMax ?? 0
  const blueMax = cfg.blueMax ?? 0
  if (!redMax) return EMPTY

  // 近 10 期红球频率（computeStats 的 redFreq 是全量口径，这里单独算近窗）
  const recent = draws.slice(0, Math.min(10, draws.length))
  const recentFreq = new Array<number>(redMax + 1).fill(0)
  for (const d of recent) {
    for (const n of d.red || []) {
      if (n >= 1 && n <= redMax) recentFreq[n]++
    }
  }

  // 平均遗漏（用于"超均值倍数"文案）
  let omitSum = 0
  for (let n = 1; n <= redMax; n++) omitSum += s.omitVal[n] || 0
  const avgOmit = redMax ? omitSum / redMax : 0

  // ---------- 红球杀号 ----------
  interface Cand {
    num: number
    score: number
    reasons: string[]
  }
  const redCands: Cand[] = []
  for (let n = 1; n <= redMax; n++) {
    const omit = s.omitVal[n] || 0
    const rf = recentFreq[n]
    let score = 0
    const reasons: string[] = []
    if (omit > 15) {
      score += omit
      reasons.push(`遗漏 ${omit} 期，超均值 ${(omit / Math.max(1, avgOmit)).toFixed(1)} 倍`)
    }
    if (rf === 0) {
      score += 10
      reasons.push('近 10 期未出现')
    }
    // 振幅异常：全量频率远低于平均（极冷号）
    const avgFreq = s.total ? (s.total * (cfg.redCount ?? 0)) / redMax : 0
    if (avgFreq > 0 && s.redFreq[n] > 0 && s.redFreq[n] < avgFreq * 0.4) {
      score += 4
      reasons.push(`历史出现 ${s.redFreq[n]} 次，远低于均值`)
    }
    if (score > 0) redCands.push({ num: n, score, reasons })
  }
  redCands.sort((a, b) => b.score - a.score)
  const redKills = redCands.slice(0, 3).map((c) => ({ num: c.num, reason: c.reasons.join('；') }))

  // ---------- 蓝球杀号 Top-1：遗漏偏离均值最大 ----------
  const blueKills: AdvisorItem[] = []
  if (blueMax > 0) {
    let best: { num: number; score: number; reason: string } | null = null
    for (let b = 1; b <= blueMax; b++) {
      const o = s.blueOmit[b] || 0
      const dev = Math.abs(o - avgOmit)
      const reason = o > avgOmit * 1.5 ? `遗漏 ${o} 期，长期未出` : o < Math.max(1, avgOmit * 0.3) ? `刚出过，短期回补概率低` : `遗漏 ${o} 期`
      if (!best || dev > best.score) best = { num: b, score: dev, reason }
    }
    if (best) blueKills.push({ num: best.num, reason: best.reason })
  }

  // ---------- 红球定胆 Top-3 ----------
  const redDans: AdvisorItem[] = []
  const used = new Set<number>()
  const pushDan = (num: number, reason: string) => {
    if (used.has(num)) return
    used.add(num)
    redDans.push({ num, reason })
  }
  // 1) 热号（近 10 期 ≥3 次）
  for (const n of s.hot) {
    if (redDans.length >= 3) break
    pushDan(n, `近 10 期出现 ${recentFreq[n] || 0} 次（热号）`)
  }
  // 2) 斐波那契回补期（遗漏 8~13）
  for (let n = 1; n <= redMax; n++) {
    if (redDans.length >= 3) break
    const o = s.omitVal[n] || 0
    if (o >= 8 && o <= 13) pushDan(n, `遗漏 ${o} 期，接近斐波那契回补周期`)
  }
  // 3) 上期重号
  for (const n of s.lastRed || []) {
    if (redDans.length >= 3) break
    pushDan(n, '上期重号')
  }

  return { redKills, blueKills, redDans }
}
