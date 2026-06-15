import { addDays, format } from 'date-fns'
import { db, Collections, toTS, type FlightDoc } from '@/src/lib/firestore'
import { scoreDeal } from './deal-scorer'
import { logger } from '@/src/lib/logger'

const WINDOW_DAYS = 3

export interface OptimizedRoute {
  optimalDepart: string
  optimalReturn: string
  bestPrice: number
  score: number
  hasFlexibleDates: boolean
}

export async function optimizeRoute(
  origin: string,
  destination: string,
  baseDepartDate: string,
  baseReturnDate: string,
  medianPrice: number,
  scrapedAt: Date,
): Promise<OptimizedRoute | null> {
  const candidates: Array<{ depart: string; ret: string; price: number }> = []

  for (let dOffset = -WINDOW_DAYS; dOffset <= WINDOW_DAYS; dOffset++) {
    for (let rOffset = -WINDOW_DAYS; rOffset <= WINDOW_DAYS; rOffset++) {
      const depart = format(addDays(new Date(baseDepartDate), dOffset), 'yyyy-MM-dd')
      const ret    = format(addDays(new Date(baseReturnDate), rOffset), 'yyyy-MM-dd')
      if (new Date(ret) <= new Date(depart)) continue

      const departDate = new Date(depart)
      const nextDay    = new Date(departDate)
      nextDay.setDate(nextDay.getDate() + 1)

      const snap = await db
        .collection(Collections.FLIGHTS)
        .where('origin', '==', origin)
        .where('destination', '==', destination)
        .where('departureDate', '>=', toTS(departDate))
        .where('departureDate', '<', toTS(nextDay))
        .orderBy('departureDate')
        .orderBy('priceEur')
        .limit(1)
        .get()

      if (!snap.empty) {
        const data = snap.docs[0].data() as FlightDoc
        candidates.push({ depart, ret, price: data.priceEur })
      }
    }
  }

  if (candidates.length === 0) return null

  let best: OptimizedRoute | null = null
  let bestScore = -1

  for (const candidate of candidates) {
    const discountPct = medianPrice > 0
      ? ((medianPrice - candidate.price) / medianPrice) * 100
      : 0
    const { score } = scoreDeal({
      discountPct,
      hasFlexibleDates: candidates.length > 1,
      scrapedAt,
    })
    if (score > bestScore) {
      bestScore = score
      best = {
        optimalDepart: candidate.depart,
        optimalReturn: candidate.ret,
        bestPrice: candidate.price,
        score,
        hasFlexibleDates: candidates.length > 1,
      }
    }
  }

  logger.debug({ origin, destination, candidates: candidates.length, bestScore }, 'Route optimizer result')
  return best
}
