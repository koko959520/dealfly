import axios from 'axios'
import { BaseCollector, type RawFlight } from './base.collector'
import { logger } from '@/src/lib/logger'

export class SkyScrapperCollector extends BaseCollector {
  private apiKey: string
  private baseUrl = 'https://sky-scrapper.p.rapidapi.com/api/v1'

  constructor() {
    super()
    this.apiKey = process.env.RAPIDAPI_KEY ?? ''
    if (!this.apiKey) throw new Error('RAPIDAPI_KEY manquant')
  }

  async collect(origin: string, destinations: string[]): Promise<RawFlight[]> {
    const results: RawFlight[] = []

    const departureDates = [7, 14, 30, 60].map((d) => {
      const date = new Date()
      date.setDate(date.getDate() + d)
      return date.toISOString().split('T')[0]
    })

    for (const destination of destinations) {
      for (const departureDate of departureDates) {
        try {
          const response = await axios.get(`${this.baseUrl}/flights/searchFlightEverywhere`, {
            params: {
              fromEntityId: origin,
              toEntityId:   destination,
              departDate:   departureDate,
              currency:     'EUR',
              oneWay:       'true',
            },
            headers: {
              'x-rapidapi-key':  this.apiKey,
              'x-rapidapi-host': 'sky-scrapper.p.rapidapi.com',
            },
            timeout: 15_000,
          })

          const itineraries = response.data?.data?.itineraries ?? []

          for (const item of itineraries.slice(0, 3)) {
            const leg = item.legs?.[0]
            if (!leg) continue

            results.push({
              origin:        leg.origin?.displayCode ?? origin,
              destination:   leg.destination?.displayCode ?? destination,
              departureDate: new Date(leg.departure),
              returnDate:    null,
              priceEur:      item.price?.raw ?? 0,
              airline:       leg.carriers?.marketing?.[0]?.name ?? null,
              source:        'skyscrapper',
              scrapedAt:     new Date(),
            })
          }

          logger.info({ origin, destination, departureDate, count: itineraries.length }, 'SkyScrapper: collected')
          await new Promise((r) => setTimeout(r, 800))
        } catch (err) {
          logger.error({ origin, destination, err }, 'SkyScrapper: error')
        }
      }
    }

    return results
  }
}
