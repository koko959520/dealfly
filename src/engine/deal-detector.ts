import { db, Collections, toTS, newId, type FlightDoc, type DealDoc } from '@/src/lib/firestore'
import { logger } from '@/src/lib/logger'
import { analyzePrice } from './price-analyzer'
import { scoreDeal } from './deal-scorer'
import { optimizeRoute } from './route-optimizer'
import { addDays, format } from 'date-fns'

export async function detectDeals(): Promise<number> {
  const since = new Date(Date.now() - 6 * 60 * 60 * 1000)

  const snapshot = await db
    .collection(Collections.FLIGHTS)
    .where('scrapedAt', '>=', toTS(since))
    .where('returnDate', '!=', null)
    .orderBy('returnDate')
    .orderBy('priceEur')
    .limit(500)
    .get()

  logger.info({ count: snapshot.size }, 'Deal detector: analyzing recent flights')

  let detected = 0

  for (const doc of snapshot.docs) {
    const flight = { id: doc.id, ...doc.data() } as FlightDoc & { id: string }

    try {
      const analysis = await analyzePrice(
        flight.origin,
        flight.destination,
        flight.priceEur,
      )

      if (!analysis.isAnomaly || analysis.discountPct === null) continue

      const departDateStr = flight.departureDate.toDate().toISOString().split('T')[0]
      const returnDateStr = flight.returnDate
        ? flight.returnDate.toDate().toISOString().split('T')[0]
        : format(addDays(flight.departureDate.toDate(), 7), 'yyyy-MM-dd')

      const optimized = await optimizeRoute(
        flight.origin,
        flight.destination,
        departDateStr,
        returnDateStr,
        analysis.medianPrice30d ?? flight.priceEur,
        flight.scrapedAt.toDate(),
      )

      const finalPrice   = optimized?.bestPrice ?? flight.priceEur
      const finalDiscount = analysis.medianPrice30d
        ? ((analysis.medianPrice30d - finalPrice) / analysis.medianPrice30d) * 100
        : analysis.discountPct

      const { score, isEligible } = scoreDeal({
        discountPct: finalDiscount,
        hasFlexibleDates: optimized?.hasFlexibleDates ?? false,
        scrapedAt: flight.scrapedAt.toDate(),
      })

      if (!isEligible) continue

      const deal: DealDoc = {
        flightId: flight.id,
        route: `${flight.origin}-${flight.destination}`,
        discountPct: Math.round(finalDiscount * 100) / 100,
        score,
        optimalDepart: optimized?.optimalDepart ? toTS(new Date(optimized.optimalDepart)) : flight.departureDate,
        optimalReturn: optimized?.optimalReturn ? toTS(new Date(optimized.optimalReturn)) : flight.returnDate,
        status: 'PENDING',
        detectedAt: toTS(new Date()),
        expiresAt: toTS(new Date(Date.now() + 48 * 60 * 60 * 1000)),
        // Dénormalisé
        origin: flight.origin,
        destination: flight.destination,
        priceEur: finalPrice,
        airline: flight.airline,
      }

      await db.collection(Collections.DEALS).add(deal)
      detected++

      logger.info(
        { route: deal.route, score, discountPct: finalDiscount },
        'Deal detected',
      )
    } catch (err) {
      logger.error({ flightId: flight.id, err }, 'Error analyzing flight')
    }
  }

  logger.info({ detected }, 'Deal detection complete')
  return detected
}
