/**
 * Algorithme de scoring documenté dans le cahier des charges :
 *
 *   score = (discount_weight × 60) + (flexibility_bonus × 20) + (recency_bonus × 20)
 *
 *   discount_weight   = min(discount_pct / 50, 1)        — plafonné à 50 %
 *   flexibility_bonus = 1 si dates ±2j disponibles, sinon 0
 *   recency_bonus     = 1 si scrapedAt < 2h, 0.5 si < 6h, 0 sinon
 *
 *   Deal éligible : score ≥ 70 ET discount_pct ≥ 35 %
 */

export interface ScoringInput {
  discountPct: number
  hasFlexibleDates: boolean  // des combinaisons ±2j ont été trouvées
  scrapedAt: Date
}

export interface ScoringResult {
  score: number          // 0–100
  isEligible: boolean    // score ≥ 70 ET discount ≥ 35%
  breakdown: {
    discountWeight: number
    flexibilityBonus: number
    recencyBonus: number
  }
}

export function scoreDeal(input: ScoringInput): ScoringResult {
  const discountWeight = Math.min(input.discountPct / 50, 1)
  const flexibilityBonus = input.hasFlexibleDates ? 1 : 0

  const ageMs = Date.now() - input.scrapedAt.getTime()
  const ageH = ageMs / (1000 * 60 * 60)
  const recencyBonus = ageH < 2 ? 1 : ageH < 6 ? 0.5 : 0

  const score = Math.round(
    discountWeight * 60 + flexibilityBonus * 20 + recencyBonus * 20,
  )

  return {
    score,
    isEligible: score >= 70 && input.discountPct >= 35,
    breakdown: { discountWeight, flexibilityBonus, recencyBonus },
  }
}
