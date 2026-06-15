import { db, Collections, toTS, type PriceHistoryDoc } from '@/src/lib/firestore'
import { logger } from '@/src/lib/logger'

export interface PriceAnalysis {
  route: string
  currentPrice: number
  medianPrice30d: number | null
  discountPct: number | null
  isAnomaly: boolean
}

export async function analyzePrice(
  origin: string,
  destination: string,
  currentPrice: number,
): Promise<PriceAnalysis> {
  const route = `${origin}-${destination}`
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const snapshot = await db
    .collection(Collections.PRICE_HISTORY)
    .where('route', '==', route)
    .where('date', '>=', toTS(since))
    .orderBy('date', 'desc')
    .limit(1)
    .get()

  if (snapshot.empty) {
    logger.debug({ route }, 'No price history — skipping analysis')
    return { route, currentPrice, medianPrice30d: null, discountPct: null, isAnomaly: false }
  }

  const data = snapshot.docs[0].data() as PriceHistoryDoc
  const median = data.medianPrice ?? 0
  if (median === 0) return { route, currentPrice, medianPrice30d: null, discountPct: null, isAnomaly: false }

  const discountPct = ((median - currentPrice) / median) * 100

  return {
    route,
    currentPrice,
    medianPrice30d: median,
    discountPct: Math.round(discountPct * 100) / 100,
    isAnomaly: discountPct >= 35,
  }
}
