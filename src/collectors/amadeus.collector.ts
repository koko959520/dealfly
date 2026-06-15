import Amadeus from 'amadeus'
import { addMonths, format, startOfMonth, endOfMonth } from 'date-fns'
import { BaseCollector } from './base.collector'
import { cacheGet, cacheSet } from '@/src/lib/redis'
import { logger } from '@/src/lib/logger'
import type { FlightOffer } from '@/src/types/flight'

const CACHE_TTL_SECONDS = 3600 // 1h

export class AmadeusCollector extends BaseCollector {
  private client: Amadeus

  constructor() {
    super({ name: 'amadeus', maxRetries: 3, retryDelayMs: 2000 })
    this.client = new Amadeus({
      clientId: process.env.AMADEUS_API_KEY!,
      clientSecret: process.env.AMADEUS_API_SECRET!,
    })
  }

  protected async fetchOffers(
    origin: string,
    destinations: string[],
    months: string[],
  ): Promise<FlightOffer[]> {
    const results: FlightOffer[] = []

    for (const destination of destinations) {
      for (const month of months) {
        const cacheKey = `amadeus:${origin}:${destination}:${month}`
        const cached = await cacheGet<FlightOffer[]>(cacheKey)

        if (cached) {
          logger.debug({ cacheKey }, 'Cache hit — Amadeus')
          results.push(...cached)
          continue
        }

        const offers = await this.fetchFlightOffers(origin, destination, month)
        await cacheSet(cacheKey, offers, CACHE_TTL_SECONDS)
        results.push(...offers)
      }
    }

    return results
  }

  private async fetchFlightOffers(
    origin: string,
    destination: string,
    month: string, // format YYYY-MM
  ): Promise<FlightOffer[]> {
    const startDate = startOfMonth(new Date(`${month}-01`))
    const endDate = endOfMonth(startDate)

    logger.info({ origin, destination, month }, 'Amadeus: fetching flight offers')

    // Cheapest Date Search — retourne les prix par date sur un mois
    const response = await this.client.shopping.flightOffersSearch.get({
      originLocationCode: origin,
      destinationLocationCode: destination,
      departureDate: format(startDate, 'yyyy-MM-dd'),
      returnDate: format(addMonths(startDate, 1), 'yyyy-MM-dd'),
      adults: 1,
      max: 50,
      currencyCode: 'EUR',
      nonStop: false,
    })

    const data = response.data as AmadeusFlightOffer[]
    const now = new Date()

    return data.map((offer) => ({
      origin,
      destination,
      departureDate: offer.itineraries[0].segments[0].departure.at.split('T')[0],
      returnDate:
        offer.itineraries.length > 1
          ? offer.itineraries[1].segments[0].departure.at.split('T')[0]
          : undefined,
      priceEur: parseFloat(offer.price.grandTotal),
      airline: offer.validatingAirlineCodes?.[0],
      source: 'amadeus',
      scrapedAt: now,
    }))
  }
}

// ── Types Amadeus API (subset nécessaire) ──────────────────────────────────────
interface AmadeusFlightOffer {
  price: { grandTotal: string }
  validatingAirlineCodes?: string[]
  itineraries: Array<{
    segments: Array<{
      departure: { at: string }
      arrival: { at: string }
      carrierCode: string
    }>
  }>
}
