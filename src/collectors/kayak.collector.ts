import { addDays, addMonths, format } from 'date-fns'
import { logger } from '@/src/lib/logger'
import type { FlightOffer } from '@/src/types/flight'

const TRIP_DURATIONS = [7, 10, 14] // nuits

interface KayakResult {
  price:       number
  airline:     string
  departure:   string // YYYY-MM-DD
  returnDate:  string // YYYY-MM-DD
  origin:      string
  destination: string
}

/**
 * Scrape Kayak.fr avec Playwright + stealth pour récupérer les prix
 * sur les routes populaires pour les 90 prochains jours.
 */
export class KayakCollector {
  readonly name = 'kayak'

  async collect(
    origin: string,
    destinations: string[],
  ): Promise<FlightOffer[]> {
    // Playwright est lourd — on l'importe dynamiquement pour ne pas alourdir le cold start
    const { chromium } = await import('playwright-extra')
    const stealth      = (await import('puppeteer-extra-plugin-stealth')).default

    chromium.use(stealth())

    const browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
      ],
    })

    const results: FlightOffer[] = []

    try {
      for (const destination of destinations) {
        for (const duration of TRIP_DURATIONS) {
          // Seulement quelques dates de départ sur 90j pour ne pas surcharger
          for (let daysOut = 14; daysOut <= 90; daysOut += 14) {
            const depDate = addDays(new Date(), daysOut)
            const retDate = addDays(depDate, duration)
            const dep     = format(depDate, 'yyyy-MM-dd')
            const ret     = format(retDate, 'yyyy-MM-dd')

            try {
              const page = await browser.newPage()
              await page.setExtraHTTPHeaders({ 'Accept-Language': 'fr-FR,fr;q=0.9' })

              const url = `https://www.kayak.fr/flights/${origin}-${destination}/${dep}/${ret}?sort=price_a&fs=stops=0,1`
              logger.info({ origin, destination, dep, ret }, 'Kayak: scraping')

              await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })

              // Attendre les résultats de vols
              await page.waitForSelector('[class*="price-text"], [class*="resultInner"], .nrc6', {
                timeout: 20000,
              }).catch(() => null)

              // Extraire les résultats
              const scraped = await page.evaluate((meta) => {
                const rows: Array<{ price: number; airline: string }> = []

                // Sélecteurs Kayak (peuvent changer — on essaie plusieurs)
                const cards = document.querySelectorAll(
                  '[class*="resultWrapper"], [class*="result-mod"], .nrc6-wrapper, [data-resultid]'
                )

                cards.forEach((card) => {
                  // Prix
                  const priceEl = card.querySelector(
                    '[class*="price-text"], [class*="price"], .f8F1-price-text, [class*="mainPrice"]'
                  )
                  const priceText = priceEl?.textContent?.replace(/[^0-9]/g, '') ?? ''
                  const price = parseInt(priceText, 10)

                  // Compagnie
                  const airlineEl = card.querySelector(
                    '[class*="airline-name"], [class*="carrier"], img[alt]'
                  )
                  const airline =
                    airlineEl?.getAttribute('alt') ??
                    airlineEl?.textContent?.trim() ??
                    'Unknown'

                  if (price > 0 && price < 10000) {
                    rows.push({ price, airline })
                  }
                })

                return rows.slice(0, 5) // Top 5 prix par combinaison
              }, { dep, ret, origin: meta.origin, destination: meta.destination })

              for (const r of scraped) {
                results.push({
                  origin,
                  destination,
                  departureDate: dep,
                  returnDate:    ret,
                  priceEur:      r.price,
                  airline:       r.airline,
                  source:        'kayak',
                  scrapedAt:     new Date(),
                })
              }

              await page.close()

              // Pause entre les requêtes pour éviter le rate-limiting
              await new Promise((r) => setTimeout(r, 3000 + Math.random() * 2000))
            } catch (err) {
              logger.warn({ origin, destination, dep, err }, 'Kayak: échec sur cette combinaison')
            }
          }
        }
      }
    } finally {
      await browser.close()
    }

    logger.info({ count: results.length, origin }, 'Kayak: scraping terminé')
    return results
  }
}
