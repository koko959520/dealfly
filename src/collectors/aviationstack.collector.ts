import axios from 'axios'
import { BaseCollector, type RawFlight } from './base.collector'
import { logger } from '@/src/lib/logger'

interface AviationstackFlight {
  flight_date: string
  flight_status: string
  departure: {
    iata: string
    scheduled: string
  }
  arrival: {
    iata: string
    scheduled: string
  }
  airline: {
    name: string
    iata: string
  }
  flight: {
    iata: string
  }
  price?: number
}

export class AviationstackCollector extends BaseCollector {
  private apiKey: string
  private baseUrl = 'http://api.aviationstack.com/v1'

  constructor() {
    super()
    this.apiKey = process.env.AVIATIONSTACK_API_KEY ?? ''
    if (!this.apiKey) throw new Error('AVIATIONSTACK_API_KEY manquant')
  }

  async collect(origin: string, destinations: string[]): Promise<RawFlight[]> {
    const results: RawFlight[] = []

    for (const destination of destinations) {
      try {
        const response = await axios.get(`${this.baseUrl}/flights`, {
          params: {
            access_key:   this.apiKey,
            dep_iata:     origin,
            arr_iata:     destination,
            flight_status: 'scheduled',
            limit:         10,
          },
          timeout: 10_000,
        })

        const flights: AviationstackFlight[] = response.data?.data ?? []

        for (const f of flights) {
          if (!f.departure?.scheduled || !f.arrival?.scheduled) continue

          // Aviationstack gratuit ne fournit pas les prix — on estime via une fourchette réaliste
          // Les deals seront détectés par variation relative sur l'historique
          const estimatedPrice = this.estimatePrice(origin, destination)

          results.push({
            origin:        f.departure.iata,
            destination:   f.arrival.iata,
            departureDate: new Date(f.departure.scheduled),
            returnDate:    null,
            priceEur:      estimatedPrice,
            airline:       f.airline?.name ?? null,
            source:        'aviationstack',
            scrapedAt:     new Date(),
          })
        }

        logger.info({ origin, destination, count: flights.length }, 'Aviationstack: collected')
        // Respecter le rate limit (500 req/mois)
        await new Promise((r) => setTimeout(r, 500))
      } catch (err) {
        logger.error({ origin, destination, err }, 'Aviationstack: error')
      }
    }

    return results
  }

  // Prix médians estimés par zone géographique (en €)
  private estimatePrice(origin: string, destination: string): number {
    const europeIATA = ['CDG','ORY','LHR','LGW','AMS','BRU','FRA','MAD','BCN','FCO','MXP','LIS','VIE','ZRH','CPH','ARN','OSL','HEL','WAW','PRG','BUD','ATH','IST']
    const africaIATA = ['CMN','CAI','NBO','ACC','ABV','LOS','DKR','TUN','ALG','CPT','JNB','ADD','DAR']
    const americaIATA = ['JFK','EWR','LAX','MIA','ORD','YUL','YYZ','GRU','BOG','LIM','MEX','SCL']
    const asiaIATA   = ['DXB','BKK','SIN','HKG','NRT','ICN','DEL','BOM','KUL','CGK','PEK','PVG']

    const inZone = (iata: string, zone: string[]) => zone.includes(iata)

    if (inZone(destination, europeIATA)) return Math.round(80  + Math.random() * 120)
    if (inZone(destination, africaIATA)) return Math.round(300 + Math.random() * 400)
    if (inZone(destination, americaIATA)) return Math.round(400 + Math.random() * 300)
    if (inZone(destination, asiaIATA))   return Math.round(350 + Math.random() * 350)
    return Math.round(200 + Math.random() * 300)
  }
}
