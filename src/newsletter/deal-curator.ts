import { db, Collections, type DealDoc } from '@/src/lib/firestore'
import { logger } from '@/src/lib/logger'

const GEO_ZONES: Record<string, string[]> = {
  europe:   ['LHR','AMS','BCN','FCO','MAD','LIS','BRU','VIE','ZRH','CPH'],
  amerique: ['JFK','LAX','MIA','YYZ','GRU','BOG','LIM','MEX','EZE','SCL'],
  asie:     ['BKK','NRT','SIN','HKG','DXB','DOH','KUL','ICN','BOM','DEL'],
  afrique:  ['CMN','DKR','ABJ','LOS','NBO','ACC','CPT','TUN','ALG','CAI'],
}

function getZone(destination: string): string {
  for (const [zone, codes] of Object.entries(GEO_ZONES)) {
    if (codes.includes(destination)) return zone
  }
  return 'autre'
}

export interface CuratedDeal {
  id: string
  route: string
  origin: string
  destination: string
  priceEur: number
  discountPct: number
  score: number
  optimalDepart: string
  optimalReturn: string | null
  airline: string | null
  zone: string
}

export async function curateDeals(limit = 10): Promise<CuratedDeal[]> {
  const snap = await db
    .collection(Collections.DEALS)
    .where('status',      '==', 'APPROVED')
    .where('score',       '>=', 70)
    .where('discountPct', '>=', 35)
    .orderBy('score', 'desc')
    .orderBy('discountPct', 'desc')
    .limit(50)
    .get()

  const zoneCount: Record<string, number> = {}
  const curated: CuratedDeal[] = []

  for (const doc of snap.docs) {
    if (curated.length >= limit) break
    const d = { id: doc.id, ...doc.data() } as DealDoc & { id: string }
    const zone  = getZone(d.destination)
    const count = zoneCount[zone] ?? 0
    if (count >= 2) continue
    zoneCount[zone] = count + 1

    curated.push({
      id:            d.id,
      route:         d.route,
      origin:        d.origin,
      destination:   d.destination,
      priceEur:      d.priceEur,
      discountPct:   d.discountPct,
      score:         d.score,
      optimalDepart: d.optimalDepart ? d.optimalDepart.toDate().toISOString().split('T')[0] : '',
      optimalReturn: d.optimalReturn ? d.optimalReturn.toDate().toISOString().split('T')[0] : null,
      airline:       d.airline,
      zone,
    })
  }

  logger.info({ count: curated.length }, 'Newsletter: deals curated')
  return curated
}
