import { addDays, format } from 'date-fns'
import { logger } from '@/src/lib/logger'
import type { FlightOffer } from '@/src/types/flight'

const TRIP_DURATIONS = [7, 10, 14]

export class GoVoyagesCollector {
  readonly name = 'govoyages'

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
            // GoVoyages utilise le format DD/MM/YYYY dans l'URL
            const depFr   = format(depDate, 'dd/MM/yyyy')
            const retFr   = format(retDate, 'dd/MM/yyyy')

            try {
              const page = await browser.newPage()
              await page.setExtraHTTPHeaders({ 'Accept-Language': 'fr-FR,fr;q=0.9' })
              await page.setViewportSize({ width: 1280, height: 800 })

              // URL GoVoyages aller-retour
              const url = `https://www.govoyages.com/vols/recherche?from=${origin}&to=${destination}&departure=${depFr}&return=${retFr}&adult=1&child=0&infant=0&cabin=Y&directFlight=false`
              logger.info({ origin, destination, dep, ret }, 'GoVoyages: scraping')

              await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 })

              // Accepter les cookies si présents
              await page.click(
                'button[id*="accept"], button[class*="accept"], [aria-label*="Accepter"], #didomi-notice-agree-button'
              ).catch(() => null)

              // Attendre les cartes de résultats
              await page.waitForSelector(
                '[class*="flight-result"], [class*="FlightResult"], [class*="result-card"], [class*="flight-item"]',
                { timeout: 25000 }
              ).catch(() => null)

              const scraped = await page.evaluate(() => {
                const rows: Array<{ price: number; airline: string }> = []

                const cards = document.querySelectorAll(
                  '[class*="flight-result"], [class*="FlightResult"], [class*="result-card"], [class*="flight-item"], [class*="flightResult"]'
                )

                cards.forEach((card) => {
                  // Prix
                  const priceEl = card.querySelector(
                    '[class*="price"], [class*="Price"], [class*="amount"], [class*="Amount"], [data-price]'
                  )
                  const priceText = priceEl?.textContent?.replace(/[^0-9]/g, '') ?? ''
                  const price = parseInt(priceText, 10)

                  // Compagnie
                  const airlineEl = card.querySelector(
                    'img[alt], [class*="airline"], [class*="Airline"], [class*="carrier"], [class*="company"]'
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
                  source:        'govoyages',
                  scrapedAt:     new Date(),
                })
              }

              await page.close()
              await new Promise((r) => setTimeout(r, 4000 + Math.random() * 3000))
            } catch (err) {
              logger.warn({ origin, destination, dep, err }, 'GoVoyages: échec sur cette combinaison')
            }
          }
        }
      }
    } finally {
      await browser.close()
    }

    logger.info({ count: results.length, origin }, 'GoVoyages: scraping terminé')
    return results
  }
}
