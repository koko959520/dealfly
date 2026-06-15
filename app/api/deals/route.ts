import { z } from 'zod'
import { format } from 'date-fns'
import { db, Collections, type DealDoc } from '@/src/lib/firestore'
import { ok, withErrorHandler, getParams } from '@/src/lib/api'

const DealsSchema = z.object({
  origin:       z.string().length(3).toUpperCase().optional(),
  limit:        z.coerce.number().int().min(1).max(50).default(20),
  min_discount: z.coerce.number().min(0).max(100).default(35),
  status:       z.enum(['APPROVED', 'SENT', 'PENDING']).default('APPROVED'),
})

export const GET = withErrorHandler(async (req) => {
  const params = getParams(req)
  const input  = DealsSchema.parse({
    origin:       params.get('origin') ?? undefined,
    limit:        params.get('limit') ?? 20,
    min_discount: params.get('min_discount') ?? 35,
    status:       params.get('status') ?? 'APPROVED',
  })

  let query = db
    .collection(Collections.DEALS)
    .where('status',      '==', input.status)
    .where('discountPct', '>=', input.min_discount)
    .orderBy('discountPct', 'desc')
    .orderBy('score', 'desc')
    .limit(input.limit)

  if (input.origin) {
    query = db
      .collection(Collections.DEALS)
      .where('status',      '==', input.status)
      .where('origin',      '==', input.origin)
      .where('discountPct', '>=', input.min_discount)
      .orderBy('discountPct', 'desc')
      .orderBy('score', 'desc')
      .limit(input.limit)
  }

  const snap = await query.get()

  const deals = snap.docs.map((doc) => {
    const d = { id: doc.id, ...doc.data() } as DealDoc & { id: string }
    return {
      id:            d.id,
      route:         d.route,
      origin:        d.origin,
      destination:   d.destination,
      discountPct:   d.discountPct,
      score:         d.score,
      priceEur:      d.priceEur,
      airline:       d.airline,
      optimalDepart: d.optimalDepart ? format(d.optimalDepart.toDate(), 'yyyy-MM-dd') : null,
      optimalReturn: d.optimalReturn ? format(d.optimalReturn.toDate(), 'yyyy-MM-dd') : null,
      status:        d.status,
      expiresAt:     d.expiresAt?.toDate().toISOString() ?? null,
      detectedAt:    d.detectedAt.toDate().toISOString(),
    }
  })

  return ok({ deals, total: deals.length })
})
