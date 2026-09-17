import { describe, it, expect } from 'vitest'
import {
  computeStats,
  scoreRed,
  scoreBlue,
  scoreTicket,
  normLocked,
  comb,
  normMethods,
  weightedScore,
  calcPlay,
  expandTicket,
  extractTickets,
  scoreItemsFor,
  createPickerEngine,
  computeDirectStats,
  scoreDigits,
  calcDirectPlay
} from '../src/utils/picker-engine'

// 双色球配置（与 game-config.js GAME_CONFIG.ssq 对齐）
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

describe('normLocked', () => {
  it('过滤非法值、去重、升序', () => {
    expect(normLocked(33, [5, 3, 5, 99, 0, -1, 1.5, '7', NaN])).toEqual([3, 5, 7])
  })

  it('null/undefined/空数组返回 []', () => {
    expect(normLocked(33, null)).toEqual([])
    expect(normLocked(33, undefined)).toEqual([])
    expect(normLocked(33, [])).toEqual([])
  })

  it('过滤超出范围的值', () => {
    expect(normLocked(16, [1, 16, 17, 0])).toEqual([1, 16])
  })
})

describe('comb', () => {
  it('计算标准组合数', () => {
    expect(comb(5, 2)).toBe(10)
    expect(comb(10, 3)).toBe(120)
    expect(comb(33, 6)).toBe(1107568)
  })

  it('边界情况', () => {
    expect(comb(5, 0)).toBe(1)
    expect(comb(5, 5)).toBe(1)
    expect(comb(5, 6)).toBe(0)
    expect(comb(5, -1)).toBe(0)
    expect(comb(0, 0)).toBe(1)
  })
})

describe('createPickerEngine 去重采样（内部 randPickUnique）', () => {
  const draws = []
  for (let i = 0; i < 15; i++) {
    draws.push({ red: [1, 2, 3, 4, 5, 6], blue: 1 })
  }

  it('生成的每注红球互不重复且升序、范围合法', () => {
    const engine = createPickerEngine(ssqCfg)
    const r = engine.generate(draws, 5)
    expect(r.ticket.tickets.length).toBe(5)
    r.ticket.tickets.forEach((t) => {
      expect(t.red).toHaveLength(6)
      expect(new Set(t.red).size).toBe(6)
      expect(t.red).toEqual([...t.red].sort((a, b) => a - b))
      t.red.forEach((n) => {
        expect(n).toBeGreaterThanOrEqual(1)
        expect(n).toBeLessThanOrEqual(33)
      })
    })
  })

  it('真随机模式（空策略）同样生成合法去重红球', () => {
    const engine = createPickerEngine(ssqCfg, [])
    const r = engine.generate(draws, 3)
    r.ticket.tickets.forEach((t) => {
      expect(new Set(t.red).size).toBe(6)
      expect(t.blue).toHaveLength(1)
    })
  })
})

describe('computeStats', () => {
  it('无开奖数据时返回空统计', () => {
    const s = computeStats(ssqCfg, [])
    expect(s.total).toBe(0)
    expect(s.hot).toEqual([])
    expect(s.cold).toEqual([])
    expect(s.redFreq[1]).toBe(0)
  })

  it('正确统计红球与蓝球频率', () => {
    const draws = [
      { red: [1, 2, 3, 4, 5, 6], blue: 1 },
      { red: [1, 2, 3, 7, 8, 9], blue: 2 },
      { red: [1, 4, 5, 10, 11, 12], blue: 1 }
    ]
    const s = computeStats(ssqCfg, draws)
    expect(s.total).toBe(3)
    expect(s.redFreq[1]).toBe(3)
    expect(s.redFreq[2]).toBe(2)
    expect(s.redFreq[6]).toBe(1)
    expect(s.blueFreq[1]).toBe(2)
    expect(s.blueFreq[2]).toBe(1)
  })

  it('近 10 期出现 >=3 次的号码识别为热号', () => {
    const draws = []
    for (let i = 0; i < 12; i++) {
      draws.push({ red: [1, 2, 3, 4, 5, 6], blue: 1 })
    }
    const s = computeStats(ssqCfg, draws)
    expect(s.hot).toContain(1)
  })

  it('遗漏 >=10 期的号码识别为冷号', () => {
    // 33 从未出现，total=12，遗漏=12 >=10
    const draws = []
    for (let i = 0; i < 12; i++) {
      draws.push({ red: [1, 2, 3, 4, 5, 6], blue: 1 })
    }
    const s = computeStats(ssqCfg, draws)
    expect(s.cold).toContain(33)
  })

  it('lastRed/lastBlue 取第一期开奖', () => {
    const draws = [
      { red: [7, 8, 9, 10, 11, 12], blue: 5 },
      { red: [1, 2, 3, 4, 5, 6], blue: 1 }
    ]
    const s = computeStats(ssqCfg, draws)
    expect(s.lastRed).toEqual([7, 8, 9, 10, 11, 12])
    expect(s.lastBlue).toEqual([5])
  })
})

describe('scoreRed', () => {
  const makeStats = () => ({
    hot: [1],
    cold: [33],
    lastRed: [1, 2, 3, 4, 5, 6],
    omitVal: new Array(34).fill(1),
    sumRecent: 100
  })

  it('返回区间/和值/跨度等分量与总分', () => {
    const red = [1, 2, 3, 4, 5, 6]
    const sc = scoreRed(ssqCfg, red, makeStats())
    expect(sc.zones).toEqual([6, 0, 0])
    expect(sc.sum).toBe(21)
    expect(sc.span).toBe(5)
    expect(sc.total).toBeGreaterThan(0)
    expect(sc.total).toBeLessThanOrEqual(100)
  })

  it('正确统计奇偶个数', () => {
    const red = [1, 3, 5, 7, 9, 11]
    const sc = scoreRed(ssqCfg, red, makeStats())
    expect(sc.odds).toBe(6)
  })

  it('正确识别连号', () => {
    const red = [1, 2, 3, 10, 20, 30]
    const sc = scoreRed(ssqCfg, red, makeStats())
    expect(sc.cons).toBe(2)
  })

  it('区间分布按 zoneEdges 划分', () => {
    // ssq zoneEdges [11,22]: 1-11=区0, 12-22=区1, 23-33=区2
    const red = [1, 5, 10, 15, 20, 30]
    const sc = scoreRed(ssqCfg, red, makeStats())
    expect(sc.zones).toEqual([3, 2, 1])
  })
})

describe('normMethods', () => {
  it('不传/传 undefined 返回全部策略', () => {
    expect(normMethods(undefined).length).toBeGreaterThan(0)
    expect(normMethods(null).length).toBeGreaterThan(0)
  })

  it('空数组返回 []（真随机）', () => {
    expect(normMethods([])).toEqual([])
  })

  it('过滤非法策略名，保留合法的', () => {
    const r = normMethods(['zone', 'bogus', 'odd'])
    expect(r).toContain('zone')
    expect(r).toContain('odd')
    expect(r).not.toContain('bogus')
  })
})

describe('calcPlay', () => {
  it('单注：1 注 2 元', () => {
    const r = calcPlay(ssqCfg, { type: 'single' })
    expect(r.combos).toBe(1)
    expect(r.amount).toBe(2)
  })

  it('多注：n 注', () => {
    const r = calcPlay(ssqCfg, { type: 'multi', n: 3 })
    expect(r.combos).toBe(3)
    expect(r.amount).toBe(6)
  })

  it('复式：C(红,6)*C(蓝,1)', () => {
    const r = calcPlay(ssqCfg, { type: 'duplex', redCount: 7, blueCount: 1 })
    expect(r.combos).toBe(7)
    expect(r.amount).toBe(14)
  })

  it('胆拖：C(拖,6-胆)*C(蓝,1)', () => {
    const r = calcPlay(ssqCfg, { type: 'danTuo', danRed: [1], tuoRed: [2, 3, 4, 5, 6, 7, 8], blue: [1] })
    expect(r.combos).toBe(21)
  })
})

describe('expandTicket', () => {
  it('单注展开为 1 注', () => {
    const lines = expandTicket(ssqCfg, { type: 'single', red: [1, 2, 3, 4, 5, 6], blue: [7] })
    expect(lines).toHaveLength(1)
    expect(lines[0].red).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('复式展开为多注', () => {
    const lines = expandTicket(ssqCfg, { type: 'duplex', red: [1, 2, 3, 4, 5, 6, 7], blue: [7, 8] })
    expect(lines).toHaveLength(14) // C(7,6)*C(2,1) = 7*2
  })

  it('空输入返回 []', () => {
    expect(expandTicket(ssqCfg, null)).toEqual([])
  })
})

describe('scoreBlue', () => {
  const stats = { hotBlue: new Set([7]), blueOmit: new Array(17).fill(5) }

  it('有蓝球时返回评分', () => {
    const sc = scoreBlue(ssqCfg, [7], stats)
    expect(sc.total).toBeGreaterThan(0)
  })

  it('空蓝球返回 0 分', () => {
    const sc = scoreBlue(ssqCfg, [], stats)
    expect(sc.total).toBe(0)
  })
})

describe('scoreTicket / weightedScore', () => {
  const draws = [{ red: [1, 2, 3, 4, 5, 6], blue: 7 }]

  it('scoreTicket 返回总分与分量', () => {
    const r = scoreTicket(ssqCfg, draws, [1, 5, 10, 15, 20, 30], [7])
    expect(r.total).toBeGreaterThan(0)
    expect(r.stats.total).toBe(1)
  })

  it('weightedScore 按策略权重汇总', () => {
    const st = computeStats(ssqCfg, draws)
    const total = weightedScore(ssqCfg, [1, 5, 10, 15, 20, 30], st, ['zone', 'odd'])
    expect(typeof total).toBe('number')
  })
})

describe('extractTickets', () => {
  it('解析字母前缀多注格式', () => {
    const tickets = extractTickets('A: 01 02 03 04 05 06+07', ssqCfg)
    expect(tickets).toHaveLength(1)
    expect(tickets[0].red).toEqual([1, 2, 3, 4, 5, 6])
    expect(tickets[0].blue).toEqual([7])
  })

  it('空文本返回 []', () => {
    expect(extractTickets('', ssqCfg)).toEqual([])
    expect(extractTickets(null, ssqCfg)).toEqual([])
  })
})

describe('scoreItemsFor', () => {
  it('从评分对象提取展示项', () => {
    const st = computeStats(ssqCfg, [{ red: [1, 2, 3, 4, 5, 6], blue: 7 }])
    const sc = scoreRed(ssqCfg, [1, 5, 10, 15, 20, 30], st)
    const items = scoreItemsFor(ssqCfg, sc)
    expect(items.length).toBeGreaterThan(0)
    expect(items[0]).toHaveProperty('label')
    expect(items[0]).toHaveProperty('value')
  })
})

describe('直位数字型引擎', () => {
  const directCfg = {
    key: 'fc3d',
    playMode: 'direct',
    digits: [0, 1, 2],
    tailMax: null,
    sumMin: 0,
    sumMax: 27
  }
  const draws = [{ digits: [1, 2, 3] }, { digits: [4, 5, 6] }, { digits: [1, 2, 3] }]

  it('computeDirectStats 统计频率', () => {
    const s = computeDirectStats(directCfg, draws)
    expect(s.total).toBe(3)
    expect(s.freq[0][1]).toBe(2) // 第0位出现1两次
  })

  it('scoreDigits 返回总分', () => {
    const s = computeDirectStats(directCfg, draws)
    const sc = scoreDigits(directCfg, [1, 2, 3], null, s)
    expect(sc.total).toBeGreaterThan(0)
    expect(sc.sum).toBe(6)
  })

  it('calcDirectPlay 计算直位注数', () => {
    expect(calcDirectPlay(directCfg, { type: 'single' }).combos).toBe(1)
    expect(calcDirectPlay(directCfg, { type: 'multi', n: 5 }).combos).toBe(5)
  })
})

describe('createPickerEngine 复式与胆拖', () => {
  const draws = []
  for (let i = 0; i < 15; i++) {
    draws.push({ red: [1, 2, 3, 4, 5, 6], blue: 1 })
  }

  it('复式生成：红球数 > 6', () => {
    const engine = createPickerEngine(ssqCfg)
    const r = engine.generatePlay(draws, { type: 'duplex', redCount: 7, blueCount: 1 })
    expect(r.ticket.type).toBe('duplex')
    expect(r.ticket.red.length).toBe(7)
  })

  it('胆拖生成：含胆码与拖码', () => {
    const engine = createPickerEngine(ssqCfg)
    const r = engine.generatePlay(draws, { type: 'danTuo', danN: 1, tuoN: 7 })
    expect(r.ticket.type).toBe('danTuo')
    expect(r.ticket.danRed.length).toBeGreaterThanOrEqual(1)
  })
})
