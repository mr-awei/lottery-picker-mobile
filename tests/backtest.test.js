import { describe, it, expect } from 'vitest'
import { runBacktest, computeOmitStats, omitSeriesFor } from '../src/utils/analysis'

// 双色球配置（与 game-config GAME_CONFIG.ssq 对齐，单测不依赖网络）
const ssqCfg = {
  key: 'ssq',
  redCount: 6,
  redMax: 33,
  blueCount: 1,
  blueMax: 16,
  sumMin: 85,
  sumMax: 120,
  zoneEdges: [11, 22],
  zoneTarget: [2, 2, 2],
  sizeSplit: 16,
  spanMin: 16,
  spanMax: 30
}

function pickReds(seedOffset) {
  const set = new Set()
  let i = 0
  while (set.size < 6) {
    set.add(1 + ((seedOffset * 7 + i * 5) % 33))
    i++
  }
  return [...set].sort((a, b) => a - b)
}

// 构造 40 期 mock 开奖（draws[0] = 最新）
const mockDraws = Array.from({ length: 40 }, (_, i) => {
  const age = i // 0 最新
  return {
    issue: String(2024001 + age),
    date: `2024-01-${String(1 + age).padStart(2, '0')}`,
    red: pickReds(age),
    blue: 1 + ((age * 3) % 16),
    blue2: null,
    prizeMap: {}
  }
})

describe('runBacktest', () => {
  it('返回完整结果结构（期数/成本/盈亏/奖级统计/累计曲线）', async () => {
    const r = await runBacktest(ssqCfg, mockDraws, {
      methods: ['zone', 'odd', 'sum', 'hot', 'size'],
      periods: 10,
      perTicket: 3
    })
    expect(r).not.toBeNull()
    expect(r.rows.length).toBe(10)
    expect(r.totalPeriods).toBe(10)
    // 每注 2 元 × 3 注 × 10 期 = 60 元
    expect(r.totalCost).toBe(60)
    expect(typeof r.totalBonus).toBe('number')
    expect(typeof r.net).toBe('number')
    expect(typeof r.roi).toBe('number')
    expect(typeof r.winRate).toBe('number')
    expect(typeof r.winPeriods).toBe('number')
    expect(r.winPeriods).toBeLessThanOrEqual(10)
    expect(r.winRate).toBeGreaterThanOrEqual(0)
    expect(r.winRate).toBeLessThanOrEqual(100)
    // 各奖级统计对象
    expect(r.levelCounts).toBeTypeOf('object')
    // 每行字段完整
    for (const row of r.rows) {
      expect(row.issue).toBeTruthy()
      expect(Array.isArray(row.red) === false)
      expect(row.tickets.length).toBe(3)
      expect(row.drawRed.length).toBe(6)
      expect(typeof row.level).toBe('number')
      expect(typeof row.bonus).toBe('number')
    }
    // 累计曲线长度 = 回测期数，旧→新
    expect(r.cumulative.length).toBe(10)
    expect(r.cumulative[0].issue).toBe(r.rows[9].issue)
    expect(r.cumulative[9].issue).toBe(r.rows[0].issue)
  })

  it('空数据时返回 null', async () => {
    const r = await runBacktest(ssqCfg, [], { periods: 10, perTicket: 1, methods: ['zone'] })
    expect(r).toBeNull()
  })

  it('shouldStop 触发后返回 null', async () => {
    let i = 0
    const r = await runBacktest(ssqCfg, mockDraws, {
      periods: 10,
      perTicket: 1,
      methods: ['zone', 'odd'],
      shouldStop: () => { i++; return i > 5 }
    })
    expect(r).toBeNull()
  })
})

describe('computeOmitStats', () => {
  it('返回红蓝平均/最大遗漏数组', () => {
    const o = computeOmitStats(ssqCfg, mockDraws)
    expect(o.redAvg.length).toBe(34)
    expect(o.redMax.length).toBe(34)
    expect(o.blueAvg.length).toBe(17)
    expect(o.blueMax.length).toBe(17)
    // 曾出现的号码应有均值
    expect(o.redAvg[1]).toBeGreaterThan(0)
  })
})

describe('omitSeriesFor', () => {
  it('返回与窗口对齐的遗漏序列（当期开出为 0）', () => {
    const n = mockDraws[0].red[0]
    const series = omitSeriesFor(ssqCfg, mockDraws, n, false, 10)
    expect(series.length).toBe(10)
    expect(series[0]).toBe(0) // 最新一期该号开出
  })
})
