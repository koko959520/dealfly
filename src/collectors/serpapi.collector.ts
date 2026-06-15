import axios from 'axios'
import { BaseCollector, type RawFlight } from './base.collector'
import { logger } from '@/src/lib/logger'

interface SerpApiResult {
  best_flights?: FlightOption[]
  other_flights?: FlightOption[]
}

interface FlightOption {
  flights: {
    departure_airport: { id: string; time: string }
    arrival_airport:   { id: string; time: string }
    airline:           string
  }[]
  price: number
  total_duration: number
}

export class SerpApiCollector extends BaseCollector {
  private apiKey: string
  private baseUrl = 'https://serpapi.com/search'

  constructor() {
    super()
    this.apiKey = process.env.SERPAPI_KEY ?? ''
    if (!this.apiKey) throw new Error('SERPAPI_KEY manquant')
  }

  async collect(origin: string, destinations: string[]): Promise<RawFlight[]> {
    const results: RawFlight[] = []

    // Dates de départ : dans 7, 14, 30 et 60 jours
    const departureDates = [7, 14, 30, 60].map((d) => {
      const date = new Date()
      date.setDate(date.getDate() + d)
      return date.toISOString().split('T')[0]
    })

    for (const destination of destinations) {
      for (const departureDate of departureDates) {
        try {
          const response = await axios.get(this.baseUrl, {
            params: {
              engine:           'google_flights',
              departure_id:     origin,
              arrival_id:       destination,
              outbound_date:    departureDate,
              currency:         'EUR',
              hl:               'fr',
              api_key:          this.apiKey,
              type:             '2', // aller simple
            },
            timeout: 15_000,
          })

          const data: SerpApiResult = response.data
          const flights = [...(data.best_flights ?? []), ...(data.other_flights ?? [])]

          for (const option of flights.slice(0, 3)) {
            const leg = option.flights[0]
            if (!leg) continue

            results.push({
              origin:        leg.departure_airport.id,
              destination:   leg.arrival_airport.id,
              departureDate: new Date(leg.departure_airport.time),
              returnDate:    null,
              priceEur:      option.price,
              airline:       leg.airline ?? null,
              source:        'serpapi',
              scrapedAt:     new Date(),
            })
          }

          logger.info({ origin, destination, departureDate, count: flights.length }, 'SerpApi: collected')
          // Respecter le quota (100/mois) — pause entre requêtes
          await new Promise((r) => setTimeout(r, 1000))
        } catch (err) {
          logger.error({ origin, destination, departureDate, err }, 'SerpApi: error')
        }
      }
    }

    return results
  }
}
