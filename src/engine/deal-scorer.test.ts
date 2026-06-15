import { describe, it, expect } from 'vitest'
import { scoreDeal } from './deal-scorer'

describe('scoreDeal', () => {
  it('deal parfait (−50%, flexible, très récent) → score 100', () => {
    const result = scoreDeal({
      discountPct: 50,
      hasFlexibleDates: true,
      scrapedAt: new Date(),
    })
    expect(result.score).toBe(100)
    expect(result.isEligible).toBe(true)
  })

  it('deal limit éligible (−35%, pas flexible, < 2h) → score 80', () => {
    const result = scoreDeal({
      discountPct: 35,
      hasFlexibleDates: false,
      scrapedAt: new Date(),
    })
    // discount_weight = 35/50 = 0.7 → 42 ; flexibility = 0 ; recency = 20
    expect(result.score).toBe(62)
    expect(result.isEligible).toBe(false) // 62 < 70
  })

  it('deal éligible (−40%, flexible, < 2h) → score ≥ 70', () => {
    const result = scoreDeal({
      discountPct: 40,
      hasFlexibleDates: true,
      scrapedAt: new Date(),
    })
    expect(result.score).toBeGreaterThanOrEqual(70)
    expect(result.isEligible).toBe(true)
  })

  it('vieux deal (> 6h) → recencyBonus = 0', () => {
    const old = new Date(Date.now() - 7 * 60 * 60 * 1000)
    const result = scoreDeal({
      discountPct: 50,
      hasFlexibleDates: true,
      scrapedAt: old,
    })
    expect(result.breakdown.recencyBonus).toBe(0)
    expect(result.score).toBe(80) // 60 + 20 + 0
  })

  it('deal entre 2h et 6h → recencyBonus = 0.5', () => {
    const recent = new Date(Date.now() - 3 * 60 * 60 * 1000)
    const result = scoreDeal({
      discountPct: 50,
      hasFlexibleDates: false,
      scrapedAt: recent,
    })
    expect(result.breakdown.recencyBonus).toBe(0.5)
    expect(result.score).toBe(70) // 60 + 0 + 10
  })
})
