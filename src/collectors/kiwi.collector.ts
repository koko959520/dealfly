import axios from 'axios'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { BaseCollector } from './base.collector'
import { cacheGet, cacheSet } from '@/src/lib/redis'
import { logger } from '@/src/lib/logger'
import type { FlightOffer } from '@/src/types/flight'

const KIWI_BASE_URL = 'https://api.tequila.kiwi.com/v2'
const CACHE_TTL_SECONDS = 3600

export class KiwiCollector extends BaseCollector {
  constructor() {
    super({ name: 'kiwi', maxRetries: 3, retryDelayMs: 2000 })
  }

  protected async fetchOffers(
    origin: string,
    destinations: string[],
    months: string[],
  ): Promise<FlightOffer[]> {
    const results: FlightOffer[] = []

    for (const destination of destinations) {
      for (const month of months) {
        const cacheKey = `kiwi:${origin}:${destination}:${month}`
        const cached = await cacheGet<FlightOffer[]>(cacheKey)

        if (cached) {
          logger.debug({ cacheKey }, 'Cache hit — Kiwi')
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
    month: string,
  ): Promise<FlightOffer[]> {
    const startDate = startOfMonth(new Date(`${month}-01`))
    const endDate = endOfMonth(startDate)

    logger.info({ origin, destination, month }, 'Kiwi: fetching flight offers')

    const response = await axios.get(`${KIWI_BASE_URL}/search`, {
      headers: { apikey: process.env.KIWI_API_KEY },
      params: {
        fly_from: origin,
        fly_to: destination,
        date_from: format(startDate, 'dd/MM/yyyy'),
        date_to: format(endDate, 'dd/MM/yyyy'),
        return_from: format(startDate, 'dd/MM/yyyy'),
        return_to: format(endDate, 'dd/MM/yyyy'),
        nights_in_dst_from: 3,
        nights_in_dst_to: 21,
        curr: 'EUR',
        limit: 50,
        sort: 'price',
      },
    })

    const now = new Date()
    const data = response.data.data as KiwiFlightData[]

    return data.map((flight) => ({
      origin,
      destination,
      departureDate: format(new Date(flight.dTime * 1000), 'yyyy-MM-dd'),
      returnDate: flight.route?.find((r) => r.return === 1)
        ? format(new Date(flight.route.find((r) => r.return === 1)!.dTime * 1000), 'yyyy-MM-dd')
        : undefined,
      priceEur: flight.price,
      airline: flight.airlines?.[0],
      source: 'kiwi',
      scrapedAt: now,
    }))
  }
}

interface KiwiFlightData {
  price: number
  dTime: number
  airlines: string[]
  route: Array<{ return: number; dTime: number }>
}
