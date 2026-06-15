import { db, Collections, toTS, type FlightDoc, type PriceHistoryDoc } from '@/src/lib/firestore'
import { logger } from '@/src/lib/logger'
import { deduplicationKey, type FlightOffer } from '@/src/types/flight'

const PRICE_TOLERANCE_EUR = 2

/**
 * Déduplique un tableau de FlightOffer et insère dans Firestore (append-only).
 * Retourne le nombre de documents insérés.
 */
export async function normalizeAndStore(offers: FlightOffer[]): Promise<number> {
  if (offers.length === 0) return 0

  // Déduplication en mémoire
  const seen = new Map<string, FlightOffer>()
  for (const offer of offers) {
    const key = deduplicationKey(offer)
    if (!seen.has(key)) seen.set(key, offer)
  }

  const deduped = [...seen.values()]
  logger.info({ total: offers.length, deduped: deduped.length }, 'Normalizer: deduplication done')

  // Batch Firestore — max 500 writes par batch
  const BATCH_SIZE = 400
  let inserted = 0

  for (let i = 0; i < deduped.length; i += BATCH_SIZE) {
    const batch = db.batch()
    const chunk = deduped.slice(i, i + BATCH_SIZE)

    for (const offer of chunk) {
      const ref = db.collection(Collections.FLIGHTS).doc()
      const doc: FlightDoc = {
        origin: offer.origin,
        destination: offer.destination,
        departureDate: toTS(new Date(offer.departureDate)),
        returnDate: offer.returnDate ? toTS(new Date(offer.returnDate)) : null,
        priceEur: offer.priceEur,
        airline: offer.airline ?? null,
        source: offer.source,
        scrapedAt: toTS(offer.scrapedAt),
      }
      batch.set(ref, doc)
      inserted++
    }

    await batch.commit()
  }

  logger.info({ inserted }, 'Normalizer: flights inserted into Firestore')
  return inserted
}

/**
 * Calcule la médiane des prix pour une route sur les 30 derniers jours
 * et met à jour la collection price_history.
 */
export async function updatePriceHistory(route: string): Promise<void> {
  const [origin, destination] = route.split('-')
  if (!origin || !destination) return

  const since = new Date()
  since.setDate(since.getDate() - 30)

  const snapshot = await db
    .collection(Collections.FLIGHTS)
    .where('origin', '==', origin)
    .where('destination', '==', destination)
    .where('scrapedAt', '>=', toTS(since))
    .get()

  if (snapshot.empty) return

  const prices = snapshot.docs
    .map((d) => d.data().priceEur as number)
    .sort((a, b) => a - b)

  const median = computeMedian(prices)
  const min = prices[0]
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // ID déterministe : route_date
  const docId = `${route}_${today.toISOString().split('T')[0]}`
  const doc: PriceHistoryDoc = {
    route,
    date: toTS(today),
    medianPrice: median,
    minPrice: min,
    sampleCount: prices.length,
  }

  await db.collection(Collections.PRICE_HISTORY).doc(docId).set(doc, { merge: true })
}

function computeMedian(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}
