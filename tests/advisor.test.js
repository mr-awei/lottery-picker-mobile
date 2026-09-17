import { describe, it, expect } from 'vitest'
import { recommendKillAndDan } from '../src/utils/advisor'
import { GAME_CONFIG } from '../src/utils/game-config'

// 双色球配置
const ssq = GAME_CONFIG.ssq

// 造一批假历史：号码 1 长期遗漏（很久没出），号码 7 近期很热
function makeDraws() {
  const draws = []
  // 最近 10 期：7,12,18 高频出现；1 从不出现
  for (let i = 0; i < 10; i++) {
    draws.push({ issue: '2024' + i, red: [7, 12, 18, 23, 28, 31], blue: (i % 3) + 1 } )
  }
  // 更早的 20 期：让 1 长期遗漏（不出现）
  for (let i = 0; i < 20; i++) {
    draws.push({ issue: '2023' + i, red: [5, 9, 14, 20, 25, 30], blue: 5 })
  }
  return draws
}

describe('recommendKillAndDan', () => {
  it('空历史返回空推荐', () => {
    const r = recommendKillAndDan(ssq, [])
    expect(r.redKills).toEqual([])
    expect(r.blueKills).toEqual([])
    expect(r.redDans).toEqual([])
  })

  it('直位型彩种返回空推荐', () => {
    const r = recommendKillAndDan(GAME_CONFIG.fc3d, makeDraws())
    expect(r.redKills).toEqual([])
  })

  it('冷号被推荐杀号且带理由', () => {
    const r = recommendKillAndDan(ssq, makeDraws())
    expect(r.redKills.length).toBeGreaterThan(0)
    const killNums = r.redKills.map((k) => k.num)
    expect(killNums).toContain(1) // 长期遗漏 + 近10期0次
    expect(r.redKills[0].reason).toMatch(/遗漏|近 10 期/)
  })

  it('热号被推荐定胆且带理由', () => {
    const r = recommendKillAndDan(ssq, makeDraws())
    expect(r.redDans.length).toBeGreaterThan(0)
    const danNums = r.redDans.map((d) => d.num)
    expect(danNums).toContain(7)
    expect(r.redDans[0].reason).toMatch(/热号|回补|重号/)
  })

  it('杀号不与定胆重复', () => {
    const r = recommendKillAndDan(ssq, makeDraws())
    const overlap = r.redKills.map((k) => k.num).filter((n) => r.redDans.some((d) => d.num === n))
    expect(overlap).toEqual([])
  })

  it('蓝球杀号恰好 1 个', () => {
    const r = recommendKillAndDan(ssq, makeDraws())
    expect(r.blueKills.length).toBe(1)
    expect(r.blueKills[0].num).toBeGreaterThanOrEqual(1)
    expect(r.blueKills[0].num).toBeLessThanOrEqual(16)
  })
})
