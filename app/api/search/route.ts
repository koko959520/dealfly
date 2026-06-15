import { z } from 'zod'
import { startOfMonth, endOfMonth, eachDayOfInterval, format } from 'date-fns'
import { db, Collections, toTS, type FlightDoc, type DealDoc, type PriceHistoryDoc } from '@/src/lib/firestore'
import { ok, err, withErrorHandler, getParams } from '@/src/lib/api'

const SearchSchema = z.object({
  origin:      z.string().length(3).toUpperCase(),
  destination: z.string().length(3).toUpperCase(),
  month:       z.string().regex(/^\d{4}-\d{2}$/),
})

export const GET = withErrorHandler(async (req) => {
  const params = getParams(req)
  const input  = SearchSchema.parse({
    origin:      params.get('origin'),
    destination: params.get('destination'),
    month:       params.get('month'),
  })

  const monthStart = startOfMonth(new Date(`${input.month}-01`))
  const monthEnd   = endOfMonth(monthStart)

  // Vols du mois
  const flightsSnap = await db
    .collection(Collections.FLIGHTS)
    .where('origin',      '==', input.origin)
    .where('destination', '==', input.destination)
    .where('departureDate', '>=', toTS(monthStart))
    .where('departureDate', '<=', toTS(monthEnd))
    .orderBy('departureDate')
    .orderBy('priceEur')
    .get()

  // Médiane 30j
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const histSnap = await db
    .collection(Collections.PRICE_HISTORY)
    .where('route', '==', `${input.origin}-${input.destination}`)
    .where('date', '>=', toTS(since7d))
    .orderBy('date', 'desc')
    .limit(1)
    .get()

  const median = histSnap.empty
    ? null
    : (histSnap.docs[0].data() as PriceHistoryDoc).medianPrice

  // Prix min par date
  const priceByDate = new Map<string, { price: number; airline: string | null }>()
  for (const doc of flightsSnap.docs) {
    const f = doc.data() as FlightDoc
    const dateStr = format(f.departureDate.toDate(), 'yyyy-MM-dd')
    const existing = priceByDate.get(dateStr)
    if (!existing || f.priceEur < existing.price) {
      priceByDate.set(dateStr, { price: f.priceEur, airline: f.airline })
    }
  }

  // Meilleur deal approuvé
  const dealSnap = await db
    .collection(Collections.DEALS)
    .where('route',  '==', `${input.origin}-${input.destination}`)
    .where('status', 'in', ['APPROVED', 'SENT'])
    .where('optimalDepart', '>=', toTS(monthStart))
    .where('optimalDepart', '<=', toTS(monthEnd))
    .orderBy('optimalDepart')
    .orderBy('score', 'desc')
    .limit(1)
    .get()

  const bestDealDoc = dealSnap.empty ? null : ({ id: dealSnap.docs[0].id, ...dealSnap.docs[0].data() } as DealDoc & { id: string })

  // Calendrier
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })
  const calendar = days.map((day) => {
    const dateStr  = format(day, 'yyyy-MM-dd')
    const data     = priceByDate.get(dateStr)
    const isOptimal = bestDealDoc?.optimalDepart
      ? format(bestDealDoc.optimalDepart.toDate(), 'yyyy-MM-dd') === dateStr
      : false
    const discount = median && data
      ? Math.round(((median - data.price) / median) * 100)
      : undefined
    return {
      date: dateStr,
      price: data?.price ?? null,
      isOptimal,
      ...(discount && discount > 0 ? { discount } : {}),
    }
  })

  const bestDeal = bestDealDoc
    ? {
        departureDate: format(bestDealDoc.optimalDepart!.toDate(), 'yyyy-MM-dd'),
        returnDate:    bestDealDoc.optimalReturn ? format(bestDealDoc.optimalReturn.toDate(), 'yyyy-MM-dd') : null,
        price:         bestDealDoc.priceEur,
        discountPct:   bestDealDoc.discountPct,
        airline:       bestDealDoc.airline,
      }
    : null

  return ok({ origin: input.origin, destination: input.destination, month: input.month, calendar, bestDeal })
})
