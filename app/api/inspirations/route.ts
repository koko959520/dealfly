import { z } from 'zod'
import { startOfMonth, endOfMonth, format } from 'date-fns'
import { Timestamp } from 'firebase-admin/firestore'
import { db, Collections, fromTS, type FlightDoc, type PriceHistoryDoc } from '@/src/lib/firestore'
import { ok, withErrorHandler, getParams } from '@/src/lib/api'

const InspirationsSchema = z.object({
  origin: z.string().length(3).toUpperCase(),
  budget: z.coerce.number().int().min(1).max(10000),
  month:  z.string().regex(/^\d{4}-\d{2}$/, 'Format attendu: YYYY-MM'),
  limit:  z.coerce.number().int().min(1).max(20).default(10),
})

export const GET = withErrorHandler(async (req) => {
  const params = getParams(req)
  const input  = InspirationsSchema.parse({
    origin: params.get('origin'),
    budget: params.get('budget'),
    month:  params.get('month'),
    limit:  params.get('limit') ?? 10,
  })

  const monthStart = startOfMonth(new Date(`${input.month}-01`))
  const monthEnd   = endOfMonth(monthStart)

  // Query flights from this origin within budget and month
  const flightsSnap = await db
    .collection(Collections.FLIGHTS)
    .where('origin', '==', input.origin)
    .where('departureDate', '>=', Timestamp.fromDate(monthStart))
    .where('departureDate', '<=', Timestamp.fromDate(monthEnd))
    .where('priceEur', '<=', input.budget)
    .orderBy('departureDate')
    .orderBy('priceEur')
    .get()

  // Group by destination — keep cheapest
  const byDest = new Map<string, { price: number; departureDate: Date; returnDate: Date | null; airline: string | null }>()
  for (const doc of flightsSnap.docs) {
    const f = doc.data() as FlightDoc
    const existing = byDest.get(f.destination)
    if (!existing || f.priceEur < existing.price) {
      byDest.set(f.destination, {
        price:         f.priceEur,
        departureDate: fromTS(f.departureDate),
        returnDate:    f.returnDate ? fromTS(f.returnDate) : null,
        airline:       f.airline ?? null,
      })
    }
  }

  if (byDest.size === 0) {
    return ok({ origin: input.origin, month: input.month, budget: input.budget, inspirations: [] })
  }

  // Fetch recent price history for median
  const routes     = [...byDest.keys()].map((dest) => `${input.origin}-${dest}`)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  // Firestore: query history per route (batch if needed — here we do individual queries to avoid IN limit)
  const medianByRoute = new Map<string, number>()
  await Promise.all(
    routes.map(async (route) => {
      const hSnap = await db
        .collection(Collections.PRICE_HISTORY)
        .where('route', '==', route)
        .where('date', '>=', Timestamp.fromDate(sevenDaysAgo))
        .orderBy('date', 'desc')
        .limit(1)
        .get()
      if (!hSnap.empty) {
        const h = hSnap.docs[0].data() as PriceHistoryDoc
        medianByRoute.set(route, h.medianPrice)
      }
    }),
  )

  const inspirations = [...byDest.entries()]
    .map(([destination, data]) => {
      const route      = `${input.origin}-${destination}`
      const median     = medianByRoute.get(route)
      const discountPct = median ? Math.round(((median - data.price) / median) * 100) : null
      return {
        destination,
        priceEur:       data.price,
        airline:        data.airline,
        departureDate:  format(data.departureDate, 'yyyy-MM-dd'),
        returnDate:     data.returnDate ? format(data.returnDate, 'yyyy-MM-dd') : null,
        discountPct,
        medianPriceEur: median ?? null,
      }
    })
    .sort((a, b) => a.priceEur - b.priceEur)
    .slice(0, input.limit)

  return ok({ origin: input.origin, month: input.month, budget: input.budget, inspirations })
})
