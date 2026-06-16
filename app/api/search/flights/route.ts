import { z } from 'zod'
import Amadeus from 'amadeus'
import { ok, withErrorHandler, getParams } from '@/src/lib/api'

const Schema = z.object({
  origin:      z.string().length(3).toUpperCase(),
  destination: z.string().length(3).toUpperCase(),
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  returnDate:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  adults:      z.coerce.number().int().min(1).max(9).default(1),
})

export interface FlightResult {
  id: string
  price: number
  currency: string
  seats: number
  airline: string
  outbound: Itinerary
  inbound:  Itinerary | null
}

export interface Itinerary {
  duration: string
  stops: number
  segments: Segment[]
}

export interface Segment {
  airline:    string
  flightNum:  string
  from:       string
  to:         string
  departure:  string
  arrival:    string
  duration:   string
}

function parseDuration(iso: string): string {
  // PT10H30M → 10h30
  return iso.replace('PT', '').replace('H', 'h').replace('M', 'm').toLowerCase()
}

function parseItinerary(itin: AmadeusItinerary): Itinerary {
  return {
    duration: parseDuration(itin.duration),
    stops: itin.segments.length - 1,
    segments: itin.segments.map((s) => ({
      airline:   s.carrierCode,
      flightNum: s.number,
      from:      s.departure.iataCode,
      to:        s.arrival.iataCode,
      departure: s.departure.at,
      arrival:   s.arrival.at,
      duration:  parseDuration(s.duration),
    })),
  }
}

interface AmadeusItinerary {
  duration: string
  segments: Array<{
    carrierCode: string
    number: string
    duration: string
    departure: { iataCode: string; at: string }
    arrival:   { iataCode: string; at: string }
  }>
}

interface AmadeusOffer {
  id: string
  price: { grandTotal: string; currency: string }
  numberOfBookableSeats: number
  validatingAirlineCodes?: string[]
  itineraries: AmadeusItinerary[]
}

export const GET = withErrorHandler(async (req) => {
  if (!process.env.AMADEUS_API_KEY || !process.env.AMADEUS_API_SECRET) {
    return err('AMADEUS_API_KEY / AMADEUS_API_SECRET non configurés', 503)
  }

  const params = getParams(req)
  const input  = Schema.parse({
    origin:        params.get('origin'),
    destination:   params.get('destination'),
    departureDate: params.get('departureDate'),
    returnDate:    params.get('returnDate') || undefined,
    adults:        params.get('adults') ?? '1',
  })

  const client = new Amadeus({
    clientId:     process.env.AMADEUS_API_KEY,
    clientSecret: process.env.AMADEUS_API_SECRET,
  })

  const query: Record<string, string | number | boolean> = {
    originLocationCode:      input.origin,
    destinationLocationCode: input.destination,
    departureDate:           input.departureDate,
    adults:                  input.adults,
    max:                     20,
    currencyCode:            'EUR',
  }
  if (input.returnDate) query.returnDate = input.returnDate

  const response = await client.shopping.flightOffersSearch.get(query)
  const raw: AmadeusOffer[] = response.data

  const flights: FlightResult[] = raw.map((offer) => ({
    id:       offer.id,
    price:    parseFloat(offer.price.grandTotal),
    currency: offer.price.currency,
    seats:    offer.numberOfBookableSeats,
    airline:  offer.validatingAirlineCodes?.[0] ?? offer.itineraries[0].segments[0].carrierCode,
    outbound: parseItinerary(offer.itineraries[0]),
    inbound:  offer.itineraries[1] ? parseItinerary(offer.itineraries[1]) : null,
  }))

  return ok({ flights, total: flights.length })
})
