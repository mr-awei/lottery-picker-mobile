import { describe, it, expect } from 'vitest'
import { checkPrize, PRIZE_RULES, kl8Prize, fmtBonus, isFucai, checkPrizeHistory, checkTicket, checkTicketHistoryMulti } from '../src/utils/prize-check'

// 双色球配置
const ssqCfg = {
  key: 'ssq',
  redCount: 6,
  redMax: 33,
  blueCount: 1,
  blueMax: 16
}

// 大乐透配置（支持追加）
const dltCfg = {
  key: 'dlt',
  redCount: 5,
  redMax: 35,
  blueCount: 2,
  blueMax: 12,
  zhuijia: true,
  zhuijiaPrice: 1
}

// 双色球开奖：红 1-6，蓝 7
const ssqDraw = { red: [1, 2, 3, 4, 5, 6], blue: 7, blue2: null, firstPrizePerBet: 5000000 }

describe('双色球各奖级', () => {
  it('一等奖：6红+1蓝', () => {
    const p = checkPrize(ssqCfg, [1, 2, 3, 4, 5, 6], [7], ssqDraw)
    expect(p.level).toBe(1)
    expect(p.name).toBe('一等奖')
    expect(p.redMatch).toBe(6)
    expect(p.blueMatch).toBe(1)
    expect(p.bonus).toBe(5000000)
  })

  it('二等奖：6红+0蓝', () => {
    const p = checkPrize(ssqCfg, [1, 2, 3, 4, 5, 6], [8], ssqDraw)
    expect(p.level).toBe(2)
    expect(p.name).toBe('二等奖')
    expect(p.blueMatch).toBe(0)
  })

  it('三等奖：5红+1蓝（3000元）', () => {
    const p = checkPrize(ssqCfg, [1, 2, 3, 4, 5, 10], [7], ssqDraw)
    expect(p.level).toBe(3)
    expect(p.bonus).toBe(3000)
  })

  it('四等奖：5红+0蓝（200元）', () => {
    const p = checkPrize(ssqCfg, [1, 2, 3, 4, 5, 10], [8], ssqDraw)
    expect(p.level).toBe(4)
    expect(p.bonus).toBe(200)
  })

  it('四等奖：4红+1蓝（200元）', () => {
    const p = checkPrize(ssqCfg, [1, 2, 3, 4, 10, 11], [7], ssqDraw)
    expect(p.level).toBe(4)
    expect(p.bonus).toBe(200)
  })

  it('五等奖：4红+0蓝（10元）', () => {
    const p = checkPrize(ssqCfg, [1, 2, 3, 4, 10, 11], [8], ssqDraw)
    expect(p.level).toBe(5)
    expect(p.bonus).toBe(10)
  })

  it('五等奖：3红+1蓝（10元）', () => {
    const p = checkPrize(ssqCfg, [1, 2, 3, 10, 11, 12], [7], ssqDraw)
    expect(p.level).toBe(5)
    expect(p.bonus).toBe(10)
  })

  it('六等奖：2红+1蓝（5元）', () => {
    const p = checkPrize(ssqCfg, [1, 2, 10, 11, 12, 13], [7], ssqDraw)
    expect(p.level).toBe(6)
    expect(p.bonus).toBe(5)
  })

  it('六等奖：1红+1蓝（5元）', () => {
    const p = checkPrize(ssqCfg, [1, 10, 11, 12, 13, 14], [7], ssqDraw)
    expect(p.level).toBe(6)
    expect(p.bonus).toBe(5)
  })

  it('六等奖：0红+1蓝（5元）', () => {
    const p = checkPrize(ssqCfg, [10, 11, 12, 13, 14, 15], [7], ssqDraw)
    expect(p.level).toBe(6)
    expect(p.bonus).toBe(5)
  })

  it('未中奖：3红+0蓝', () => {
    const p = checkPrize(ssqCfg, [1, 2, 3, 10, 11, 12], [8], ssqDraw)
    expect(p.level).toBe(0)
    expect(p.name).toBe('未中奖')
    expect(p.bonus).toBe(0)
  })
})

// 大乐透开奖：前区 1-5，后区 6、7
const dltDraw = { red: [1, 2, 3, 4, 5], blue: 6, blue2: 7, firstPrizePerBet: 1000000 }

describe('大乐透各奖级', () => {
  it('一等奖：5红+2蓝', () => {
    const p = checkPrize(dltCfg, [1, 2, 3, 4, 5], [6, 7], dltDraw)
    expect(p.level).toBe(1)
    expect(p.bonus).toBe(1000000)
  })

  it('一等奖追加：奖金 ×1.8', () => {
    const p = checkPrize(dltCfg, [1, 2, 3, 4, 5], [6, 7], dltDraw, true)
    expect(p.level).toBe(1)
    expect(p.bonus).toBe(1800000)
    expect(p.append).toBe(true)
  })

  it('二等奖：5红+1蓝', () => {
    const p = checkPrize(dltCfg, [1, 2, 3, 4, 5], [6, 8], dltDraw)
    expect(p.level).toBe(2)
  })

  it('三等奖：5红+0蓝（10000元）', () => {
    const p = checkPrize(dltCfg, [1, 2, 3, 4, 5], [8, 9], dltDraw)
    expect(p.level).toBe(3)
    expect(p.bonus).toBe(10000)
  })

  it('四等奖：4红+2蓝（3000元）', () => {
    const p = checkPrize(dltCfg, [1, 2, 3, 4, 10], [6, 7], dltDraw)
    expect(p.level).toBe(4)
    expect(p.bonus).toBe(3000)
  })

  it('五等奖：4红+1蓝（300元）', () => {
    const p = checkPrize(dltCfg, [1, 2, 3, 4, 10], [6, 8], dltDraw)
    expect(p.level).toBe(5)
    expect(p.bonus).toBe(300)
  })

  it('六等奖：3红+2蓝（200元）', () => {
    const p = checkPrize(dltCfg, [1, 2, 3, 10, 11], [6, 7], dltDraw)
    expect(p.level).toBe(6)
    expect(p.bonus).toBe(200)
  })

  it('七等奖：4红+0蓝（100元）', () => {
    const p = checkPrize(dltCfg, [1, 2, 3, 4, 10], [8, 9], dltDraw)
    expect(p.level).toBe(7)
    expect(p.bonus).toBe(100)
  })

  it('八等奖：3红+1蓝（15元）', () => {
    const p = checkPrize(dltCfg, [1, 2, 3, 10, 11], [6, 8], dltDraw)
    expect(p.level).toBe(8)
    expect(p.bonus).toBe(15)
  })

  it('八等奖：2红+2蓝（15元）', () => {
    const p = checkPrize(dltCfg, [1, 2, 10, 11, 12], [6, 7], dltDraw)
    expect(p.level).toBe(8)
    expect(p.bonus).toBe(15)
  })

  it('九等奖：3红+0蓝（5元）', () => {
    const p = checkPrize(dltCfg, [1, 2, 3, 10, 11], [8, 9], dltDraw)
    expect(p.level).toBe(9)
    expect(p.bonus).toBe(5)
  })

  it('九等奖：2红+1蓝（5元）', () => {
    const p = checkPrize(dltCfg, [1, 2, 10, 11, 12], [6, 8], dltDraw)
    expect(p.level).toBe(9)
    expect(p.bonus).toBe(5)
  })

  it('九等奖：1红+2蓝（5元）', () => {
    const p = checkPrize(dltCfg, [1, 10, 11, 12, 13], [6, 7], dltDraw)
    expect(p.level).toBe(9)
    expect(p.bonus).toBe(5)
  })

  it('九等奖：0红+2蓝（5元）', () => {
    const p = checkPrize(dltCfg, [10, 11, 12, 13, 14], [6, 7], dltDraw)
    expect(p.level).toBe(9)
    expect(p.bonus).toBe(5)
  })

  it('未中奖：0红+0蓝', () => {
    const p = checkPrize(dltCfg, [10, 11, 12, 13, 14], [8, 9], dltDraw)
    expect(p.level).toBe(0)
    expect(p.name).toBe('未中奖')
  })
})

describe('draw 为 null 边界', () => {
  it('双色球 draw null 返回未开奖', () => {
    const p = checkPrize(ssqCfg, [1, 2, 3, 4, 5, 6], [7], null)
    expect(p.level).toBe(0)
    expect(p.name).toBe('未开奖')
    expect(p.bonus).toBe(0)
    expect(p.draw).toBeNull()
  })

  it('大乐透 draw null 返回未开奖', () => {
    const p = checkPrize(dltCfg, [1, 2, 3, 4, 5], [6, 7], null)
    expect(p.level).toBe(0)
    expect(p.name).toBe('未开奖')
  })
})

describe('PRIZE_RULES 结构校验', () => {
  it('双色球规则覆盖一至六等奖', () => {
    const levels = PRIZE_RULES.ssq.map((r) => r.level)
    for (let lv = 1; lv <= 6; lv++) expect(levels).toContain(lv)
  })

  it('大乐透配置支持追加投注', () => {
    expect(dltCfg.zhuijia).toBe(true)
  })
})

describe('kl8Prize 快乐8', () => {
  const kl8Draw = { red: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], firstPrizePerBet: 1000, prizeMap: { x5z3: 5 } }

  it('选十全中得一等奖', () => {
    const r = kl8Prize([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], kl8Draw)
    expect(r.level).toBe(1)
    expect(r.bonus).toBe(1000)
  })

  it('选5中3 按 prizeMap 派奖', () => {
    const r = kl8Prize([1, 2, 3, 20, 21], kl8Draw)
    expect(r.level).toBe(2)
    expect(r.bonus).toBe(5)
  })

  it('未中奖', () => {
    const r = kl8Prize([20, 21, 22, 23, 24], kl8Draw)
    expect(r.level).toBe(0)
    expect(r.bonus).toBe(0)
  })

  it('draw 为 null 返回未开奖', () => {
    const r = kl8Prize([1, 2, 3], null)
    expect(r.level).toBe(0)
    expect(r.name).toBe('未开奖')
  })
})

describe('fmtBonus / isFucai 工具函数', () => {
  it('fmtBonus 格式化金额', () => {
    expect(fmtBonus(5)).toBe('5')
    expect(fmtBonus(50000)).toBe('5.0 万')
    expect(fmtBonus(null)).toBe('浮动待定')
  })

  it('isFucai 判断福彩/体彩', () => {
    expect(isFucai({ key: 'ssq' })).toBe(true)
    expect(isFucai({ key: 'kl8' })).toBe(true)
    expect(isFucai({ key: 'dlt' })).toBe(false)
    expect(isFucai({ key: 'pl3' })).toBe(false)
  })
})

describe('checkPrizeHistory 历史追溯', () => {
  it('遍历多期，命中即返回', () => {
    const draws = [
      { red: [10, 11, 12, 13, 14, 15], blue: 8 },
      ssqDraw
    ]
    const p = checkPrizeHistory(ssqCfg, [1, 2, 3, 4, 5, 6], [7], draws)
    expect(p.level).toBe(1)
  })

  it('无命中时返回最新一期未中奖', () => {
    const draws = [{ red: [10, 11, 12, 13, 14, 15], blue: 8 }]
    const p = checkPrizeHistory(ssqCfg, [1, 2, 3, 4, 5, 6], [7], draws)
    expect(p.level).toBe(0)
  })
})

describe('checkTicket 整票核对', () => {
  it('单注票命中一等奖', () => {
    const ticket = { type: 'single', red: [1, 2, 3, 4, 5, 6], blue: [7] }
    const r = checkTicket(ssqCfg, ticket, ssqDraw)
    expect(r.level).toBe(1)
    expect(r.winCount).toBe(1)
    expect(r.totalCount).toBe(1)
  })

  it('draw 为 null 返回未开奖', () => {
    const ticket = { type: 'single', red: [1, 2, 3, 4, 5, 6], blue: [7] }
    const r = checkTicket(ssqCfg, ticket, null)
    expect(r.level).toBe(0)
    expect(r.name).toBe('未开奖')
  })
})

describe('checkTicketHistoryMulti 多期追溯', () => {
  it('遍历多期收集命中记录', () => {
    const ticket = { type: 'single', red: [1, 2, 3, 4, 5, 6], blue: [7] }
    const draws = [
      { red: [1, 2, 3, 4, 5, 6], blue: 7, firstPrizePerBet: 5000000, winners: [{ province: '北京' }, { province: '上海' }] },
      { red: [10, 11, 12, 13, 14, 15], blue: 8 }
    ]
    const r = checkTicketHistoryMulti(ssqCfg, ticket, draws)
    expect(r.hitCount).toBe(1)
    expect(r.totalBonus).toBeGreaterThan(0)
    expect(r.hits[0].provinceText).toBe('北京、上海')
  })

  it('无命中返回空数组', () => {
    const ticket = { type: 'single', red: [20, 21, 22, 23, 24, 25], blue: [9] }
    const draws = [{ red: [1, 2, 3, 4, 5, 6], blue: 7 }]
    const r = checkTicketHistoryMulti(ssqCfg, ticket, draws)
    expect(r.hitCount).toBe(0)
    expect(r.totalBonus).toBe(0)
  })
})
