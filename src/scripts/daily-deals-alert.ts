/**
 * Détecte les vols à -40% ou plus vs le prix médian de la route,
 * et envoie un email avec max 4 deals.
 * Cron : lundi, mercredi, vendredi à 8h (0 8 * * 1,3,5)
 */

import axios from 'axios'
import { Resend } from 'resend'
import { logger } from '@/src/lib/logger'

const RAPIDAPI_KEY  = process.env.RAPIDAPI_KEY ?? process.env.SKYSCANNER_RAPIDAPI_KEY ?? ''
const RAPIDAPI_HOST = 'sky-scrapper.p.rapidapi.com'
const ALERT_EMAIL   = process.env.DEALS_ALERT_EMAIL ?? 'bamba.kramoko95@gmail.com'
const BASE_URL      = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://dealfly-production.up.railway.app'

// Seuil : on n'envoie que les vols >= 40% moins chers que la médiane de la route
const DEAL_THRESHOLD = 0.40

const ORIGINS = ['CDG', 'ORY', 'LYS']
const DESTINATIONS = [
  { code: 'JFK', name: 'New York' },
  { code: 'BKK', name: 'Bangkok' },
  { code: 'DXB', name: 'Dubai' },
  { code: 'LAX', name: 'Los Angeles' },
  { code: 'NRT', name: 'Tokyo' },
  { code: 'GRU', name: 'São Paulo' },
  { code: 'CMN', name: 'Casablanca' },
  { code: 'DKR', name: 'Dakar' },
  { code: 'IST', name: 'Istanbul' },
  { code: 'BCN', name: 'Barcelone' },
]

const DURATIONS_DAYS = [7, 10, 14]

interface RawFlight {
  origin:     string
  dest:       string
  destName:   string
  depDate:    string
  retDate:    string
  price:      number
  airline:    string
  stops:      number
  deepLink:   string
}

interface Deal extends RawFlight {
  medianPrice: number
  discount:    number  // ex: 0.47 = -47%
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function fmt(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function median(arr: number[]): number {
  if (!arr.length) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

const ENTITY_IDS: Record<string, string> = {
  CDG: '95565041', ORY: '95565040', LYS: '95565055', NCE: '95565047',
  BCN: '95565059', MAD: '95565060', FCO: '95565064', LHR: '95565062',
  JFK: '95565058', LAX: '95565057', GRU: '95565090', EZE: '95565091',
  DXB: '95565069', DOH: '95565070', BKK: '95565071', NRT: '95565068',
  CMN: '95565085', DKR: '95565086', IST: '95565078', SIN: '95565080',
}

async function getEntityId(iata: string): Promise<string | null> {
  if (ENTITY_IDS[iata]) return ENTITY_IDS[iata]
  try {
    const res = await axios.get(`https://${RAPIDAPI_HOST}/api/v1/flights/searchAirport`, {
      params:  { query: iata, locale: 'fr-FR' },
      headers: { 'x-rapidapi-key': RAPIDAPI_KEY, 'x-rapidapi-host': RAPIDAPI_HOST },
      timeout: 8000,
    })
    const places = res.data?.data ?? []
    const match  = places.find((p: any) =>
      p.navigation?.relevantFlightParams?.skyId?.toUpperCase() === iata
    ) ?? places[0]
    return match?.navigation?.relevantFlightParams?.entityId ?? match?.navigation?.entityId ?? null
  } catch {
    return null
  }
}

async function fetchFlights(
  origin: string, oEid: string,
  dest:   string, dEid: string,
  depDate: string, retDate: string,
): Promise<RawFlight[]> {
  try {
    const res = await axios.get(`https://${RAPIDAPI_HOST}/api/v2/flights/searchFlights`, {
      params: {
        originSkyId: origin, destinationSkyId: dest,
        originEntityId: oEid, destinationEntityId: dEid,
        date: depDate, returnDate: retDate,
        cabinClass: 'economy', adults: 1,
        currency: 'EUR', market: 'FR', countryCode: 'FR', locale: 'fr-FR',
        sortBy: 'best',
      },
      headers: { 'x-rapidapi-key': RAPIDAPI_KEY, 'x-rapidapi-host': RAPIDAPI_HOST },
      timeout: 20000,
    })
    const itineraries = res.data?.data?.itineraries ?? []
    return itineraries.slice(0, 5).map((it: any) => {
      const leg     = it.legs[0]
      const airline = leg.carriers?.marketing?.[0]?.name ?? '?'
      const stops   = Math.max(0, (leg.segments?.length ?? 1) - 1)
      const deepLink = it.deeplink ?? `https://www.skyscanner.fr/transport/vols/${origin.toLowerCase()}/${dest.toLowerCase()}/${depDate.replace(/-/g,'')}/${retDate.replace(/-/g,'')}`
      return {
        origin, dest, destName: DESTINATIONS.find(d => d.code === dest)?.name ?? dest,
        depDate, retDate,
        price: Math.round(it.price.raw),
        airline, stops, deepLink,
      }
    })
  } catch {
    return []
  }
}

// ── Email HTML ────────────────────────────────────────────────────────────────

function buildHtml(deals: Deal[]): string {
  const cards = deals.map(d => `
    <div style="border:2px solid #2563EB;border-radius:12px;padding:20px 24px;margin-bottom:20px;background:#fff">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">
        <div>
          <div style="font-size:22px;font-weight:800;color:#111">${d.origin} → ${d.dest} <span style="color:#6b7280;font-weight:500;font-size:16px">(${d.destName})</span></div>
          <div style="margin-top:6px;color:#374151;font-size:15px">
            ✈️ ${d.airline} · ${d.stops === 0 ? 'Direct' : `${d.stops} escale${d.stops > 1 ? 's' : ''}`}
          </div>
          <div style="margin-top:4px;color:#6b7280;font-size:14px">
            📅 ${d.depDate} → ${d.retDate}
          </div>
        </div>
        <div style="text-align:right">
          <div style="font-size:32px;font-weight:900;color:#2563EB">${d.price}€</div>
          <div style="background:#dc2626;color:#fff;padding:4px 10px;border-radius:20px;font-size:13px;font-weight:700;display:inline-block;margin-top:4px">
            -${Math.round(d.discount * 100)}% vs prix normal
          </div>
          <div style="color:#9ca3af;font-size:12px;margin-top:4px;text-decoration:line-through">${Math.round(d.medianPrice)}€ habituellement</div>
        </div>
      </div>
      <div style="margin-top:16px">
        <a href="${d.deepLink}" style="background:#2563EB;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">
          Réserver maintenant →
        </a>
      </div>
    </div>
  `).join('')

  const bestDeal = deals[0]
  const subject  = `✈️ ${deals.length} deal${deals.length > 1 ? 's' : ''} dingue${deals.length > 1 ? 's' : ''} — dès ${bestDeal.price}€ (-${Math.round(bestDeal.discount * 100)}%)`

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;margin:0;padding:0;background:#f3f4f6">
  <div style="max-width:640px;margin:32px auto;background:#f3f4f6">
    <div style="background:#111827;padding:28px 32px;border-radius:12px 12px 0 0;text-align:center">
      <div style="font-size:28px;font-weight:900;color:#fff">✈️ DealFly</div>
      <div style="color:#9ca3af;margin-top:4px;font-size:15px">${deals.length} deal${deals.length > 1 ? 's' : ''} détecté${deals.length > 1 ? 's' : ''} à -${Math.round(bestDeal.discount * 100)}% ou plus</div>
    </div>
    <div style="background:#fff;padding:28px 32px;border-radius:0 0 12px 12px">
      <p style="color:#374151;margin:0 0 20px;font-size:15px">
        Notre radar a détecté des prix <strong>anormalement bas</strong> sur ces vols — ça ne dure jamais longtemps.
      </p>
      ${cards}
      <div style="margin-top:24px;padding-top:20px;border-top:1px solid #e5e7eb;text-align:center">
        <a href="${BASE_URL}/search" style="color:#2563EB;text-decoration:none;font-size:13px">
          Chercher d'autres vols sur DealFly
        </a>
      </div>
    </div>
  </div>
</body>
</html>`
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function runDailyDealsAlert(): Promise<void> {
  if (!RAPIDAPI_KEY) {
    logger.warn('RAPIDAPI_KEY manquant — skip deals alert')
    return
  }
  if (!process.env.RESEND_API_KEY) {
    logger.warn('RESEND_API_KEY manquant — skip deals alert')
    return
  }

  logger.info('Deals alert: scan en cours...')

  const today = new Date()

  // Cache entityIds
  const cache = new Map<string, string | null>()
  const eid = async (iata: string) => {
    if (!cache.has(iata)) cache.set(iata, await getEntityId(iata))
    return cache.get(iata)!
  }

  // Collecte TOUTES les dates pour calculer la médiane par route
  // routePrices[`${origin}-${dest}-${duration}`] = [price1, price2, ...]
  const routePrices = new Map<string, number[]>()
  const allFlights:  Array<{ key: string; flight: RawFlight }> = []

  for (const origin of ORIGINS) {
    const oEid = await eid(origin)
    if (!oEid) continue

    for (const dest of DESTINATIONS) {
      const dEid = await eid(dest.code)
      if (!dEid) continue

      for (const duration of DURATIONS_DAYS) {
        const key = `${origin}-${dest.code}-${duration}`

        for (let daysOut = 14; daysOut <= 90; daysOut += 14) {
          const depDate = fmt(addDays(today, daysOut))
          const retDate = fmt(addDays(today, daysOut + duration))

          const results = await fetchFlights(origin, oEid, dest.code, dEid, depDate, retDate)

          for (const f of results) {
            if (!routePrices.has(key)) routePrices.set(key, [])
            routePrices.get(key)!.push(f.price)
            allFlights.push({ key, flight: f })
          }

          await new Promise(r => setTimeout(r, 300))
        }
      }
    }
  }

  logger.info({ routes: routePrices.size, flights: allFlights.length }, 'Scan terminé')

  // Détecter les deals à -40% ou plus
  const deals: Deal[] = []

  for (const { key, flight } of allFlights) {
    const prices = routePrices.get(key) ?? []
    if (prices.length < 2) continue // pas assez de données pour comparer

    const med      = median(prices)
    const discount = (med - flight.price) / med

    if (discount >= DEAL_THRESHOLD) {
      deals.push({ ...flight, medianPrice: med, discount })
    }
  }

  if (deals.length === 0) {
    logger.info('Aucun deal à -40% détecté cette fois — pas d\'email envoyé')
    return
  }

  // Top 4 deals, triés par % de réduction
  const top4 = deals
    .sort((a, b) => b.discount - a.discount)
    .slice(0, 4)

  logger.info({ deals: top4.length, best: top4[0].discount }, 'Deals trouvés, envoi email...')

  const html    = buildHtml(top4)
  const subject = `✈️ ${top4.length} deal${top4.length > 1 ? 's' : ''} dingue${top4.length > 1 ? 's' : ''} — dès ${top4[0].price}€ (-${Math.round(top4[0].discount * 100)}%)`

  const resend = new Resend(process.env.RESEND_API_KEY)
  await resend.emails.send({
    from:    'DealFly <onboarding@resend.dev>',
    to:      ALERT_EMAIL,
    subject,
    html,
  })

  logger.info({ to: ALERT_EMAIL }, 'Email deals envoyé ✅')
}
