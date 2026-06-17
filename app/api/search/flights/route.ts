import { z } from 'zod'
import axios from 'axios'
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

const RAPIDAPI_HOST = 'sky-scrapper.p.rapidapi.com'

// ── Helpers ───────────────────────────────────────────────────────────────────

function minsToHm(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h${m}m` : `${h}h`
}

function buildItinerary(leg: SkyScrLeg): Itinerary {
  const durationMins = leg.durationInMinutes ?? 0
  return {
    duration: minsToHm(durationMins),
    stops:    Math.max(0, (leg.segments?.length ?? 1) - 1),
    segments: (leg.segments ?? []).map((s) => ({
      airline:   s.marketingCarrier?.name ?? s.operatingCarrier?.name ?? '?',
      flightNum: `${s.marketingCarrier?.alternateId ?? ''}${s.flightNumber ?? ''}`,
      from:      s.origin?.displayCode ?? leg.origin?.displayCode ?? '?',
      to:        s.destination?.displayCode ?? leg.destination?.displayCode ?? '?',
      departure: s.departure ?? leg.departure,
      arrival:   s.arrival ?? leg.arrival,
      duration:  minsToHm(s.durationInMinutes ?? 0),
    })),
  }
}

// ── Types Sky Scrapper ────────────────────────────────────────────────────────

interface SkyScrSegment {
  departure:         string
  arrival:           string
  durationInMinutes: number
  flightNumber:      string
  marketingCarrier:  { name: string; alternateId: string } | null
  operatingCarrier:  { name: string } | null
  origin:            { displayCode: string } | null
  destination:       { displayCode: string } | null
}

interface SkyScrLeg {
  departure:         string
  arrival:           string
  durationInMinutes: number
  origin:            { displayCode: string; name: string }
  destination:       { displayCode: string; name: string }
  carriers:          { marketing: Array<{ name: string; alternateId: string }> }
  segments:          SkyScrSegment[]
}

interface SkyScrItinerary {
  id:    string
  price: { raw: number; formatted: string }
  legs:  SkyScrLeg[]
  deeplink?: string
}

// ── Step 1 : récupérer l'entityId d'un aéroport ───────────────────────────────

async function getEntityId(iata: string, apiKey: string): Promise<string | null> {
  try {
    const res = await axios.get(`https://${RAPIDAPI_HOST}/api/v1/flights/searchAirport`, {
      params:  { query: iata, locale: 'fr-FR' },
      headers: { 'x-rapidapi-key': apiKey, 'x-rapidapi-host': RAPIDAPI_HOST },
      timeout: 8000,
    })
    const places: Array<{ navigation: { entityId: string; relevantFlightParams?: { skyId: string; entityId: string } } }> =
      res.data?.data ?? []
    const match =
      places.find((p) => p.navigation?.relevantFlightParams?.skyId?.toUpperCase() === iata)
      ?? places[0]
    return match?.navigation?.relevantFlightParams?.entityId ?? match?.navigation?.entityId ?? null
  } catch {
    return null
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const GET = withErrorHandler(async (req) => {
  const apiKey = process.env.RAPIDAPI_KEY ?? process.env.SKYSCANNER_RAPIDAPI_KEY
  if (!apiKey) return err('RAPIDAPI_KEY non configuré', 503)

  const params = getParams(req)
  const input  = Schema.parse({
    origin:        params.get('origin'),
    destination:   params.get('destination'),
    departureDate: params.get('departureDate'),
    returnDate:    params.get('returnDate') || undefined,
    adults:        params.get('adults') ?? '1',
  })

  // Récupérer les entityIds en parallèle
  const [originEntityId, destEntityId] = await Promise.all([
    getEntityId(input.origin, apiKey),
    getEntityId(input.destination, apiKey),
  ])

  if (!originEntityId || !destEntityId) {
    return err(`Aéroport introuvable : ${!originEntityId ? input.origin : input.destination}`, 400)
  }

  const searchParams: Record<string, string | number> = {
    originSkyId:           input.origin,
    destinationSkyId:      input.destination,
    originEntityId,
    destinationEntityId:   destEntityId,
    date:                  input.departureDate,
    cabinClass:            'economy',
    adults:                input.adults,
    currency:              'EUR',
    market:                'FR',
    countryCode:           'FR',
    locale:                'fr-FR',
    sortBy:                'best',
  }
  if (input.returnDate) searchParams.returnDate = input.returnDate

  const response = await axios.get(`https://${RAPIDAPI_HOST}/api/v2/flights/searchFlights`, {
    params:  searchParams,
    headers: { 'x-rapidapi-key': apiKey, 'x-rapidapi-host': RAPIDAPI_HOST },
    timeout: 20000,
  })

  const itineraries: SkyScrItinerary[] = response.data?.data?.itineraries ?? []

  const flights: FlightResult[] = itineraries.slice(0, 20).map((it) => {
    const outLeg = it.legs[0]
    const inLeg  = it.legs[1] ?? null
    return {
      id:       it.id,
      price:    Math.round(it.price.raw),
      currency: 'EUR',
      airline:  outLeg.carriers?.marketing?.[0]?.name ?? '?',
      outbound: buildItinerary(outLeg),
      inbound:  inLeg ? buildItinerary(inLeg) : null,
      deepLink: it.deeplink ?? `https://www.skyscanner.fr/transport/vols/${input.origin.toLowerCase()}/${input.destination.toLowerCase()}/${input.departureDate.replace(/-/g, '')}/${input.returnDate?.replace(/-/g, '') ?? ''}`,
    }
  })

  return ok({ flights, total: flights.length })
})
