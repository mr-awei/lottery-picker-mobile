import { describe, it, expect } from 'vitest'
import { WHEELING_TABLE, applyWheeling, getFormulasForPool } from '../src/utils/wheeling'

describe('WHEELING_TABLE', () => {
  it('双色球有公式表', () => {
    expect(WHEELING_TABLE.ssq).toBeDefined()
    expect(WHEELING_TABLE.ssq.length).toBeGreaterThan(0)
  })

  it('大乐透有公式表', () => {
    expect(WHEELING_TABLE.dlt).toBeDefined()
    expect(WHEELING_TABLE.dlt.length).toBeGreaterThan(0)
  })

  it('未知彩种返回空表', () => {
    expect(WHEELING_TABLE.foo || []).toEqual([])
  })
})

describe('applyWheeling - 选7中6保5', () => {
  const formula = WHEELING_TABLE.ssq.find((f) => f.name === '选7中6保5')

  it('公式存在且 poolSize=7, pickSize=6', () => {
    expect(formula).toBeDefined()
    expect(formula.poolSize).toBe(7)
    expect(formula.pickSize).toBe(6)
  })

  it('输入 7 个号码输出正确注数', () => {
    const pool = [1, 5, 10, 15, 20, 25, 30]
    const lines = applyWheeling(pool, formula)
    expect(lines.length).toBe(formula.count)
    expect(lines.length).toBe(6)
  })

  it('每注恰好 6 个号码', () => {
    const pool = [1, 5, 10, 15, 20, 25, 30]
    const lines = applyWheeling(pool, formula)
    lines.forEach((line) => {
      expect(line).toHaveLength(6)
    })
  })

  it('所有号码都在池内', () => {
    const pool = [1, 5, 10, 15, 20, 25, 30]
    const poolSet = new Set(pool)
    const lines = applyWheeling(pool, formula)
    lines.forEach((line) => {
      line.forEach((n) => {
        expect(poolSet.has(n)).toBe(true)
      })
    })
  })

  it('每注号码升序排列', () => {
    const pool = [1, 5, 10, 15, 20, 25, 30]
    const lines = applyWheeling(pool, formula)
    lines.forEach((line) => {
      expect(line).toEqual([...line].sort((a, b) => a - b))
    })
  })

  it('号码池不足时返回空', () => {
    const pool = [1, 5, 10, 15]
    const lines = applyWheeling(pool, formula)
    expect(lines).toEqual([])
  })
})

describe('applyWheeling - 全组合公式', () => {
  it('选7中6全保 = C(7,6) = 7 注', () => {
    const formula = WHEELING_TABLE.ssq.find((f) => f.name === '选7中6全保')
    expect(formula).toBeDefined()
    expect(formula.count).toBe(7)
    const pool = [1, 2, 3, 4, 5, 6, 7]
    const lines = applyWheeling(pool, formula)
    expect(lines.length).toBe(7)
    lines.forEach((line) => expect(line).toHaveLength(6))
  })

  it('选8中6全保 = C(8,6) = 28 注', () => {
    const formula = WHEELING_TABLE.ssq.find((f) => f.name === '选8中6全保')
    expect(formula).toBeDefined()
    expect(formula.count).toBe(28)
  })
})

describe('getFormulasForPool', () => {
  it('poolSize=7 时返回对应公式', () => {
    const formulas = getFormulasForPool('ssq', 7)
    expect(formulas.length).toBeGreaterThan(0)
    formulas.forEach((f) => expect(f.poolSize).toBe(7))
  })

  it('poolSize=13 时无匹配公式', () => {
    const formulas = getFormulasForPool('ssq', 13)
    expect(formulas).toEqual([])
  })

  it('未知彩种返回空', () => {
    expect(getFormulasForPool('foo', 7)).toEqual([])
  })
})
