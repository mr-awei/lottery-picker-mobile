import { describe, it, expect } from 'vitest'
import {
  computeRedDims,
  matchConditions,
  filterByConditions,
  oddEvenOptions,
  bigSmallOptions
} from '../src/utils/filter'

// 双色球配置
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

describe('computeRedDims', () => {
  const red = [1, 5, 10, 15, 20, 25]

  it('计算和值', () => {
    const d = computeRedDims(red, ssqCfg)
    expect(d.sum).toBe(76)
  })

  it('计算跨度', () => {
    const d = computeRedDims(red, ssqCfg)
    expect(d.span).toBe(24) // 25 - 1
  })

  it('计算奇偶个数', () => {
    const redOdd = [1, 3, 5, 7, 9, 11]
    const d = computeRedDims(redOdd, ssqCfg)
    expect(d.odds).toBe(6)
  })

  it('计算大小个数（sizeSplit=16）', () => {
    const d = computeRedDims(red, ssqCfg)
    // 1,5,10,15 <=16 为小; 20,25 >16 为大
    expect(d.bigs).toBe(2)
  })

  it('计算连号个数', () => {
    const redCons = [1, 2, 3, 10, 20, 30]
    const d = computeRedDims(redCons, ssqCfg)
    expect(d.cons).toBe(2) // 1-2, 2-3
  })

  it('计算重号个数', () => {
    const lastRed = [1, 5, 10, 30, 31, 32]
    const d = computeRedDims(red, ssqCfg, lastRed)
    expect(d.reps).toBe(3) // 1, 5, 10
  })

  it('计算质数个数', () => {
    const redPrime = [2, 3, 5, 7, 11, 13]
    const d = computeRedDims(redPrime, ssqCfg)
    expect(d.primes).toBe(6)
  })

  it('计算 012 路分布', () => {
    const d = computeRedDims(red, ssqCfg)
    // 1%3=1, 5%3=2, 10%3=1, 15%3=0, 20%3=2, 25%3=1
    expect(d.routes).toEqual([1, 3, 2])
  })
})

describe('matchConditions', () => {
  const red = [1, 5, 10, 15, 20, 25]
  const dims = computeRedDims(red, ssqCfg, [1, 5, 10, 30, 31, 32])

  it('无启用条件时全部通过', () => {
    const conds = {
      sum: { enabled: false, min: 0, max: 999 },
      ac: { enabled: false, min: 0, max: 99 },
      oddEven: { enabled: false, ratio: '' },
      bigSmall: { enabled: false, ratio: '' },
      span: { enabled: false, min: 0, max: 99 },
      consecutive: { enabled: false, count: 'any' },
      repeat: { enabled: false, count: 'any' },
      route012: { enabled: false, type: 'any' },
      tailRepeat: { enabled: false, count: 'any' },
      prime: { enabled: false, count: 'any' }
    }
    expect(matchConditions(dims, conds, 6)).toBe(true)
  })

  it('和值范围过滤', () => {
    const conds = {
      sum: { enabled: true, min: 70, max: 80 },
      ac: { enabled: false, min: 0, max: 99 },
      oddEven: { enabled: false, ratio: '' },
      bigSmall: { enabled: false, ratio: '' },
      span: { enabled: false, min: 0, max: 99 },
      consecutive: { enabled: false, count: 'any' },
      repeat: { enabled: false, count: 'any' },
      route012: { enabled: false, type: 'any' },
      tailRepeat: { enabled: false, count: 'any' },
      prime: { enabled: false, count: 'any' }
    }
    expect(matchConditions(dims, conds, 6)).toBe(true) // sum=76
    conds.sum.min = 80
    expect(matchConditions(dims, conds, 6)).toBe(false)
  })

  it('奇偶比过滤', () => {
    const conds = {
      sum: { enabled: false, min: 0, max: 999 },
      ac: { enabled: false, min: 0, max: 99 },
      oddEven: { enabled: true, ratio: '3:3' },
      bigSmall: { enabled: false, ratio: '' },
      span: { enabled: false, min: 0, max: 99 },
      consecutive: { enabled: false, count: 'any' },
      repeat: { enabled: false, count: 'any' },
      route012: { enabled: false, type: 'any' },
      tailRepeat: { enabled: false, count: 'any' },
      prime: { enabled: false, count: 'any' }
    }
    // red [1,5,10,15,20,25]: odds = 1,5,15,25 = 4, evens = 10,20 = 2 → 4:2
    expect(matchConditions(dims, conds, 6)).toBe(false)
    conds.oddEven.ratio = '4:2'
    expect(matchConditions(dims, conds, 6)).toBe(true)
  })

  it('跨度范围过滤', () => {
    const conds = {
      sum: { enabled: false, min: 0, max: 999 },
      ac: { enabled: false, min: 0, max: 99 },
      oddEven: { enabled: false, ratio: '' },
      bigSmall: { enabled: false, ratio: '' },
      span: { enabled: true, min: 20, max: 30 },
      consecutive: { enabled: false, count: 'any' },
      repeat: { enabled: false, count: 'any' },
      route012: { enabled: false, type: 'any' },
      tailRepeat: { enabled: false, count: 'any' },
      prime: { enabled: false, count: 'any' }
    }
    expect(matchConditions(dims, conds, 6)).toBe(true) // span=24
    conds.span.min = 25
    expect(matchConditions(dims, conds, 6)).toBe(false)
  })

  it('重号个数过滤', () => {
    const conds = {
      sum: { enabled: false, min: 0, max: 999 },
      ac: { enabled: false, min: 0, max: 99 },
      oddEven: { enabled: false, ratio: '' },
      bigSmall: { enabled: false, ratio: '' },
      span: { enabled: false, min: 0, max: 99 },
      consecutive: { enabled: false, count: 'any' },
      repeat: { enabled: true, count: '3' },
      route012: { enabled: false, type: 'any' },
      tailRepeat: { enabled: false, count: 'any' },
      prime: { enabled: false, count: 'any' }
    }
    expect(matchConditions(dims, conds, 6)).toBe(true) // reps=3
    conds.repeat.count = '2'
    expect(matchConditions(dims, conds, 6)).toBe(false)
  })

  it('012路均衡过滤', () => {
    const conds = {
      sum: { enabled: false, min: 0, max: 999 },
      ac: { enabled: false, min: 0, max: 99 },
      oddEven: { enabled: false, ratio: '' },
      bigSmall: { enabled: false, ratio: '' },
      span: { enabled: false, min: 0, max: 99 },
      consecutive: { enabled: false, count: 'any' },
      repeat: { enabled: false, count: 'any' },
      route012: { enabled: true, type: 'balanced' },
      tailRepeat: { enabled: false, count: 'any' },
      prime: { enabled: false, count: 'any' }
    }
    // routes = [1, 3, 2] — 三路都不为 0，均衡
    expect(matchConditions(dims, conds, 6)).toBe(true)
    // 构造一个有零路的
    const redUneven = [1, 4, 7, 10, 13, 16] // 全部 %3=1
    const dimsUneven = computeRedDims(redUneven, ssqCfg)
    expect(matchConditions(dimsUneven, conds, 6)).toBe(false)
  })
})

describe('filterByConditions', () => {
  const lines = [
    { red: [1, 5, 10, 15, 20, 25], blue: [1] },
    { red: [2, 6, 11, 16, 21, 26], blue: [1] },
    { red: [1, 2, 3, 4, 5, 6], blue: [1] }
  ]

  it('无条件时返回全部', () => {
    const conds = {
      sum: { enabled: false, min: 0, max: 999 },
      ac: { enabled: false, min: 0, max: 99 },
      oddEven: { enabled: false, ratio: '' },
      bigSmall: { enabled: false, ratio: '' },
      span: { enabled: false, min: 0, max: 99 },
      consecutive: { enabled: false, count: 'any' },
      repeat: { enabled: false, count: 'any' },
      route012: { enabled: false, type: 'any' },
      tailRepeat: { enabled: false, count: 'any' },
      prime: { enabled: false, count: 'any' }
    }
    const result = filterByConditions(lines, conds, ssqCfg, null)
    expect(result.length).toBe(3)
  })

  it('和值范围过滤掉不符合的注', () => {
    const conds = {
      sum: { enabled: true, min: 70, max: 80 },
      ac: { enabled: false, min: 0, max: 99 },
      oddEven: { enabled: false, ratio: '' },
      bigSmall: { enabled: false, ratio: '' },
      span: { enabled: false, min: 0, max: 99 },
      consecutive: { enabled: false, count: 'any' },
      repeat: { enabled: false, count: 'any' },
      route012: { enabled: false, type: 'any' },
      tailRepeat: { enabled: false, count: 'any' },
      prime: { enabled: false, count: 'any' }
    }
    // line1 sum=76, line2 sum=82, line3 sum=21
    const result = filterByConditions(lines, conds, ssqCfg, null)
    expect(result.length).toBe(1)
    expect(result[0].red).toEqual([1, 5, 10, 15, 20, 25])
  })
})

describe('oddEvenOptions', () => {
  it('redCount=6 生成合理选项', () => {
    const opts = oddEvenOptions(6)
    expect(opts.length).toBeGreaterThan(0)
    expect(opts.some((o) => o.value === '3:3')).toBe(true)
  })

  it('redCount=5 生成合理选项', () => {
    const opts = oddEvenOptions(5)
    expect(opts.length).toBeGreaterThan(0)
  })
})

describe('bigSmallOptions', () => {
  it('redCount=6 生成合理选项', () => {
    const opts = bigSmallOptions(6)
    expect(opts.length).toBeGreaterThan(0)
    expect(opts.some((o) => o.value === '3:3')).toBe(true)
  })
})
