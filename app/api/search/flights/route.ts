import { z } from 'zod'
import { addDays, format } from 'date-fns'
import { ok, err, withErrorHandler, getParams } from '@/src/lib/api'
import { db, Collections, toTS, type FlightDoc } from '@/src/lib/firestore'

const Schema = z.object({
  origin:        z.string().length(3).toUpperCase(),
  destination:   z.string().length(3).toUpperCase(),
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  returnDate:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  adults:        z.coerce.number().int().min(1).max(9).default(1),
})

export interface FlightResult {
  id:       string
  price:    number
  currency: string
  airline:  string
  source:   string
  outbound: Itinerary
  inbound:  Itinerary | null
  deepLink: string
}

export interface Itinerary {
  duration: string
  stops:    number
  segments: Segment[]
}

export interface Segment {
  airline:   string
  flightNum: string
  from:      string
  to:        string
  departure: string
  arrival:   string
  duration:  string
}

function buildItinerary(flight: FlightDoc, isReturn: boolean): Itinerary {
  // Les données Firestore ne stockent pas les segments détaillés —
  // on construit un segment unique depuis les champs disponibles
  const depDate = isReturn && flight.returnDate
    ? format(flight.returnDate.toDate(), "yyyy-MM-dd'T'HH:mm:ss")
    : format(flight.departureDate.toDate(), "yyyy-MM-dd'T'HH:mm:ss")

  const from = isReturn ? flight.destination : flight.origin
  const to   = isReturn ? flight.origin      : flight.destination

  return {
    duration: '—',
    stops:    0,
    segments: [{
      airline:   flight.airline ?? '?',
      flightNum: '',
      from,
      to,
      departure: depDate,
      arrival:   depDate,
      duration:  '—',
    }],
  }
}

export const GET = withErrorHandler(async (req) => {
  const params = getParams(req)
  const input  = Schema.parse({
    origin:        params.get('origin'),
    destination:   params.get('destination'),
    departureDate: params.get('departureDate'),
    returnDate:    params.get('returnDate') || undefined,
    adults:        params.get('adults') ?? '1',
  })

  // Fenêtre ±2 jours autour de la date demandée
  const depDate  = new Date(input.departureDate)
  const depStart = addDays(depDate, -2)
  const depEnd   = addDays(depDate, 2)

  const snap = await db
    .collection(Collections.FLIGHTS)
    .where('origin',        '==', input.origin)
    .where('destination',   '==', input.destination)
    .where('departureDate', '>=', toTS(depStart))
    .where('departureDate', '<=', toTS(depEnd))
    .orderBy('departureDate')
    .orderBy('priceEur')
    .limit(50)
    .get()

  if (snap.empty) {
    return ok({
      flights: [],
      total:   0,
      message: 'Aucun vol en base pour cette route et cette date. Le scraper collecte des données toutes les 6h.',
    })
  }

  // Dédupliquer par (date + prix + compagnie) et ajuster par nb passagers
  const seen = new Set<string>()
  const flights: FlightResult[] = []

  for (const doc of snap.docs) {
    const f   = doc.data() as FlightDoc
    const key = `${f.departureDate.toDate().toDateString()}-${f.priceEur}-${f.airline}`
    if (seen.has(key)) continue
    seen.add(key)

    const unitPrice = Math.round(f.priceEur * input.adults)
    const hasReturn = !!f.returnDate && !!input.returnDate

    flights.push({
      id:       doc.id,
      price:    unitPrice,
      currency: 'EUR',
      airline:  f.airline ?? 'Compagnie inconnue',
      source:   f.source ?? 'scraper',
      outbound: buildItinerary(f, false),
      inbound:  hasReturn ? buildItinerary(f, true) : null,
      deepLink: `https://www.kayak.fr/flights/${input.origin}-${input.destination}/${input.departureDate}${input.returnDate ? '/'+input.returnDate : ''}?sort=price_a`,
    })
  }

  return ok({ flights, total: flights.length })
})
