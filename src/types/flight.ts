// ──────────────────────────────────────────────────────────────────────────────
// Types partagés — Flight Domain
// ──────────────────────────────────────────────────────────────────────────────

export type DataSource = 'amadeus' | 'kiwi' | 'skyscanner' | 'scraper'

/** Format normalisé commun à tous les collecteurs */
export interface FlightOffer {
  origin: string          // IATA 3-lettres ex: CDG
  destination: string     // IATA 3-lettres ex: JFK
  departureDate: string   // ISO date YYYY-MM-DD
  returnDate?: string     // ISO date YYYY-MM-DD ou undefined (aller simple)
  priceEur: number
  airline?: string
  source: DataSource
  scrapedAt: Date
}

/** Clé de déduplication */
export function deduplicationKey(offer: FlightOffer): string {
  return `${offer.origin}-${offer.destination}-${offer.departureDate}-${offer.returnDate ?? ''}-${Math.round(offer.priceEur)}`
}
