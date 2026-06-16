import { z } from 'zod'
import axios from 'axios'
import { format } from 'date-fns'
import { ok, err, withErrorHandler, getParams } from '@/src/lib/api'

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
  seats:    number | null
  airline:  string
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

// ── Types Kiwi API ────────────────────────────────────────────────────────────

interface KiwiRoute {
  id:           string
  flyFrom:      string
  flyTo:        string
  airline:      string
  flight_no:    number
  operating_carrier: string
  dTime:        number  // unix timestamp
  aTime:        number
  return:       0 | 1
}

interface KiwiFlight {
  id:           string
  price:        number
  availability: { seats: number | null }
  airlines:     string[]
  deep_link:    string
  utc_departure: string
  utc_arrival:   string
  duration:      { departure: number; return: number; total: number }
  route:         KiwiRoute[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function secsToHm(secs: number): string {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  return m > 0 ? `${h}h${m}m` : `${h}h`
}

function toISO(unix: number): string {
  return new Date(unix * 1000).toISOString()
}

function buildItinerary(routes: KiwiRoute[], dir: 0 | 1, durationSecs: number): Itinerary {
  const legs = routes.filter((r) => r.return === dir)
  return {
    duration: secsToHm(durationSecs),
    stops:    Math.max(0, legs.length - 1),
    segments: legs.map((r) => ({
      airline:   r.airline,
      flightNum: String(r.flight_no),
      from:      r.flyFrom,
      to:        r.flyTo,
      departure: toISO(r.dTime),
      arrival:   toISO(r.aTime),
      duration:  secsToHm(r.aTime - r.dTime),
    })),
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const GET = withErrorHandler(async (req) => {
  if (!process.env.KIWI_API_KEY) {
    return err('KIWI_API_KEY non configuré', 503)
  }

  const params = getParams(req)
  const input  = Schema.parse({
    origin:        params.get('origin'),
    destination:   params.get('destination'),
    departureDate: params.get('departureDate'),
    returnDate:    params.get('returnDate') || undefined,
    adults:        params.get('adults') ?? '1',
  })

  // Kiwi date format: dd/MM/yyyy
  const depFormatted = format(new Date(input.departureDate), 'dd/MM/yyyy')

  const query: Record<string, string | number> = {
    fly_from:    input.origin,
    fly_to:      input.destination,
    date_from:   depFormatted,
    date_to:     depFormatted,
    adults:      input.adults,
    curr:        'EUR',
    limit:       20,
    sort:        'price',
    locale:      'fr',
  }

  if (input.returnDate) {
    const retFormatted = format(new Date(input.returnDate), 'dd/MM/yyyy')
    query.return_from = retFormatted
    query.return_to   = retFormatted
    // durée min/max en nuits estimée
    const dep = new Date(input.departureDate)
    const ret = new Date(input.returnDate)
    const nights = Math.round((ret.getTime() - dep.getTime()) / 86400000)
    query.nights_in_dst_from = Math.max(1, nights - 2)
    query.nights_in_dst_to   = nights + 2
  }

  const response = await axios.get('https://api.tequila.kiwi.com/v2/search', {
    headers: { apikey: process.env.KIWI_API_KEY },
    params:  query,
    timeout: 15000,
  })

  const raw: KiwiFlight[] = response.data?.data ?? []

  const flights: FlightResult[] = raw.map((f) => {
    const hasReturn = f.route.some((r) => r.return === 1)
    return {
      id:       f.id,
      price:    Math.round(f.price),
      currency: 'EUR',
      seats:    f.availability?.seats ?? null,
      airline:  f.airlines?.[0] ?? f.route[0]?.airline ?? '?',
      outbound: buildItinerary(f.route, 0, f.duration.departure),
      inbound:  hasReturn ? buildItinerary(f.route, 1, f.duration.return) : null,
      deepLink: f.deep_link,
    }
  })

  return ok({ flights, total: flights.length })
})
