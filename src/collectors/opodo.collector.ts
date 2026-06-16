import { addDays, format } from 'date-fns'
import { logger } from '@/src/lib/logger'
import type { FlightOffer } from '@/src/types/flight'

const TRIP_DURATIONS = [7, 10, 14]

export class OpodoCollector {
  readonly name = 'opodo'

  async collect(origin: string, destinations: string[]): Promise<FlightOffer[]> {
    const { chromium } = await import('playwright-extra')
    const stealth      = (await import('puppeteer-extra-plugin-stealth')).default
    chromium.use(stealth())

    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
    })

    const results: FlightOffer[] = []

    try {
      for (const destination of destinations) {
        for (const duration of TRIP_DURATIONS) {
          for (let daysOut = 14; daysOut <= 90; daysOut += 14) {
            const depDate = addDays(new Date(), daysOut)
            const retDate = addDays(depDate, duration)
            const dep     = format(depDate, 'yyyy-MM-dd')
            const ret     = format(retDate, 'yyyy-MM-dd')

            try {
              const page = await browser.newPage()
              await page.setExtraHTTPHeaders({ 'Accept-Language': 'fr-FR,fr;q=0.9' })
              await page.setViewportSize({ width: 1280, height: 800 })

              // URL Opodo aller-retour
              const url = `https://www.opodo.fr/vols/recherche/?adults=1&children=0&infants=0&dep_airport=${origin}&dest_airport=${destination}&dep_date=${dep}&ret_date=${ret}&cabin_class=M&currency=EUR&sort=price`
              logger.info({ origin, destination, dep, ret }, 'Opodo: scraping')

              await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 })

              // Fermer les popups éventuels (cookies, newsletter)
              await page.click('[id*="cookie"] button, [class*="cookie"] button, [aria-label*="Accept"], [aria-label*="Accepter"]')
                .catch(() => null)

              // Attendre les résultats
              await page.waitForSelector(
                '[class*="flight-card"], [class*="result-item"], [class*="flightCard"], [data-testid*="flight"]',
                { timeout: 25000 }
              ).catch(() => null)

              const scraped = await page.evaluate(() => {
                const rows: Array<{ price: number; airline: string }> = []

                const cards = document.querySelectorAll(
                  '[class*="flight-card"], [class*="result-item"], [class*="flightCard"], [class*="FlightCard"], [data-testid*="flight-result"]'
                )

                cards.forEach((card) => {
                  // Prix — Opodo affiche les prix avec "€" ou "EUR"
                  const priceEl = card.querySelector(
                    '[class*="price"], [class*="Price"], [data-testid*="price"], [class*="amount"]'
                  )
                  const priceText = priceEl?.textContent?.replace(/[^0-9]/g, '') ?? ''
                  const price = parseInt(priceText, 10)

                  // Compagnie
                  const airlineEl = card.querySelector(
                    'img[alt], [class*="airline"], [class*="carrier"], [class*="Carrier"]'
                  )
                  const airline =
                    airlineEl?.getAttribute('alt') ??
                    airlineEl?.textContent?.trim() ??
                    'Unknown'

                  if (price > 0 && price < 10000) {
                    rows.push({ price, airline: airline.trim() })
                  }
                })

                return rows.slice(0, 5)
              })

              for (const r of scraped) {
                results.push({
                  origin,
                  destination,
                  departureDate: dep,
                  returnDate:    ret,
                  priceEur:      r.price,
                  airline:       r.airline,
                  source:        'opodo',
                  scrapedAt:     new Date(),
                })
              }

              await page.close()
              await new Promise((r) => setTimeout(r, 4000 + Math.random() * 3000))
            } catch (err) {
              logger.warn({ origin, destination, dep, err }, 'Opodo: échec sur cette combinaison')
            }
          }
        }
      }
    } finally {
      await browser.close()
    }

    logger.info({ count: results.length, origin }, 'Opodo: scraping terminé')
    return results
  }
}
