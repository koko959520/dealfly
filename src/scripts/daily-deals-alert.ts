/**
 * Cherche les vols les moins chers sur 90 jours et envoie un email de résumé.
 * Lancé chaque nuit par le worker BullMQ (cron 0 7 * * *).
 */

import axios from 'axios'
import { Resend } from 'resend'
import { logger } from '@/src/lib/logger'

const RAPIDAPI_KEY  = process.env.RAPIDAPI_KEY ?? process.env.SKYSCANNER_RAPIDAPI_KEY ?? ''
const RAPIDAPI_HOST = 'sky-scrapper.p.rapidapi.com'
const ALERT_EMAIL   = process.env.DEALS_ALERT_EMAIL ?? 'bamba.kramoko95@gmail.com'
const BASE_URL      = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://dealfly-production.up.railway.app'

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

interface Deal {
  origin:      string
  destination: string
  destName:    string
  departDate:  string
  returnDate:  string
  price:       number
  airline:     string
  stops:       number
  duration:    string
  deepLink:    string
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

async function getEntityId(iata: string): Promise<string | null> {
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

async function searchFlights(
  origin: string, originEntityId: string,
  dest:   string, destEntityId:   string,
  depDate: string, retDate: string,
): Promise<Deal[]> {
  try {
    const res = await axios.get(`https://${RAPIDAPI_HOST}/api/v2/flights/searchFlights`, {
      params: {
        originSkyId:         origin,
        destinationSkyId:    dest,
        originEntityId,
        destinationEntityId: destEntityId,
        date:                depDate,
        returnDate:          retDate,
        cabinClass:          'economy',
        adults:              1,
        currency:            'EUR',
        market:              'FR',
        countryCode:         'FR',
        locale:              'fr-FR',
        sortBy:              'best',
      },
      headers: { 'x-rapidapi-key': RAPIDAPI_KEY, 'x-rapidapi-host': RAPIDAPI_HOST },
      timeout: 20000,
    })
    const itineraries = res.data?.data?.itineraries ?? []
    return itineraries.slice(0, 3).map((it: any) => {
      const leg      = it.legs[0]
      const airline  = leg.carriers?.marketing?.[0]?.name ?? '?'
      const stops    = Math.max(0, (leg.segments?.length ?? 1) - 1)
      const duration = (() => {
        const m = leg.durationInMinutes ?? 0
        return m > 0 ? `${Math.floor(m/60)}h${m%60 > 0 ? m%60+'m' : ''}` : '?'
      })()
      const deepLink = it.deeplink ?? `https://www.skyscanner.fr/transport/vols/${origin.toLowerCase()}/${dest.toLowerCase()}/${depDate.replace(/-/g,'')}/${retDate.replace(/-/g,'')}`
      return {
        origin, destination: dest,
        destName: DESTINATIONS.find(d => d.code === dest)?.name ?? dest,
        departDate: depDate, returnDate: retDate,
        price:    Math.round(it.price.raw),
        airline, stops, duration, deepLink,
      }
    })
  } catch {
    return []
  }
}

// ── Email HTML ────────────────────────────────────────────────────────────────

function buildHtml(deals: Deal[], scannedAt: string): string {
  const rows = deals.map((d, i) => `
    <tr style="background:${i % 2 === 0 ? '#ffffff' : '#f9f9f9'}">
      <td style="padding:12px 16px;font-weight:600">${d.origin} → ${d.destination}</td>
      <td style="padding:12px 16px">${d.destName}</td>
      <td style="padding:12px 16px">${d.departDate}</td>
      <td style="padding:12px 16px">${d.returnDate}</td>
      <td style="padding:12px 16px">${d.airline}</td>
      <td style="padding:12px 16px">${d.stops === 0 ? '✈️ Direct' : `${d.stops} escale${d.stops > 1 ? 's' : ''}`}</td>
      <td style="padding:12px 16px;font-size:20px;font-weight:700;color:#2563EB">${d.price}€</td>
      <td style="padding:12px 16px"><a href="${d.deepLink}" style="background:#2563EB;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none;font-weight:600">Voir →</a></td>
    </tr>
  `).join('')

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>DealFly — Alertes vols</title></head>
<body style="font-family:Arial,sans-serif;margin:0;padding:0;background:#f3f4f6">
  <div style="max-width:900px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1)">
    <div style="background:#2563EB;padding:32px;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:28px">✈️ DealFly — Top ${deals.length} deals du jour</h1>
      <p style="color:#bfdbfe;margin:8px 0 0">Scan du ${scannedAt} · 90 jours à venir · toutes origines</p>
    </div>
    <div style="padding:24px">
      <p style="color:#374151">Voici les <strong>prix les plus bas</strong> trouvés parmi 3 aéroports de départ, 10 destinations et 90 jours :</p>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <thead>
            <tr style="background:#1e40af;color:#fff">
              <th style="padding:10px 16px;text-align:left">Trajet</th>
              <th style="padding:10px 16px;text-align:left">Destination</th>
              <th style="padding:10px 16px;text-align:left">Départ</th>
              <th style="padding:10px 16px;text-align:left">Retour</th>
              <th style="padding:10px 16px;text-align:left">Compagnie</th>
              <th style="padding:10px 16px;text-align:left">Escales</th>
              <th style="padding:10px 16px;text-align:left">Prix</th>
              <th style="padding:10px 16px;text-align:left">Lien</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p style="margin-top:24px;color:#6b7280;font-size:13px">
        Prix en économique, 1 adulte. Les tarifs peuvent varier. Cliquez "Voir →" pour réserver directement sur Skyscanner.
      </p>
    </div>
    <div style="background:#f9fafb;padding:16px 24px;text-align:center;border-top:1px solid #e5e7eb">
      <a href="${BASE_URL}/search" style="color:#2563EB;text-decoration:none;font-size:14px">Rechercher un vol sur DealFly</a>
    </div>
  </div>
</body>
</html>`
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function runDailyDealsAlert(): Promise<void> {
  if (!RAPIDAPI_KEY) {
    logger.warn('RAPIDAPI_KEY manquant — skip daily deals alert')
    return
  }

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
    logger.warn('RESEND_API_KEY manquant — skip daily deals alert')
    return
  }

  logger.info('Daily deals alert: démarrage du scan...')

  const today    = new Date()
  const allDeals: Deal[] = []

  // Cache entityIds pour éviter de les re-fetcher
  const entityCache = new Map<string, string | null>()
  async function cachedEntityId(iata: string) {
    if (!entityCache.has(iata)) entityCache.set(iata, await getEntityId(iata))
    return entityCache.get(iata)!
  }

  // Scan : toutes les 2 semaines sur 90 jours pour chaque trajet/durée
  for (const origin of ORIGINS) {
    const originEntityId = await cachedEntityId(origin)
    if (!originEntityId) continue

    for (const dest of DESTINATIONS) {
      const destEntityId = await cachedEntityId(dest.code)
      if (!destEntityId) continue

      for (const duration of DURATIONS_DAYS) {
        // Dates de départ : tous les 14 jours sur 90 jours
        for (let daysOut = 14; daysOut <= 90; daysOut += 14) {
          const depDate = fmt(addDays(today, daysOut))
          const retDate = fmt(addDays(today, daysOut + duration))

          const results = await searchFlights(
            origin, originEntityId,
            dest.code, destEntityId,
            depDate, retDate,
          )
          allDeals.push(...results)

          // Pause pour ne pas dépasser le rate limit RapidAPI (10 req/s)
          await new Promise(r => setTimeout(r, 200))
        }
      }
    }
  }

  if (allDeals.length === 0) {
    logger.warn('Daily deals alert: aucun résultat trouvé')
    return
  }

  // Top 15 par prix
  const top = allDeals
    .sort((a, b) => a.price - b.price)
    .slice(0, 15)

  logger.info({ total: allDeals.length, top: top.length }, 'Daily deals alert: résultats collectés')

  const scannedAt = today.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const html = buildHtml(top, scannedAt)

  const resend = new Resend(resendKey)
  await resend.emails.send({
    from:    'DealFly Alerts <deals@dealfly-production.up.railway.app>',
    to:      ALERT_EMAIL,
    subject: `✈️ Top ${top.length} vols pas chers — à partir de ${top[0].price}€ (${scannedAt})`,
    html,
  })

  logger.info({ to: ALERT_EMAIL, dealsCount: top.length }, 'Daily deals alert: email envoyé ✅')
}
