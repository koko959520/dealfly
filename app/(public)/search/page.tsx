'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import type { FlightResult, Itinerary } from '@/app/api/search/flights/route'

// ── Constantes ────────────────────────────────────────────────────────────────

const AIRPORTS = [
  { code: 'CDG', label: 'Paris CDG' },
  { code: 'ORY', label: 'Paris Orly' },
  { code: 'LYS', label: 'Lyon' },
  { code: 'NCE', label: 'Nice' },
  { code: 'MRS', label: 'Marseille' },
  { code: 'BOD', label: 'Bordeaux' },
  { code: 'TLS', label: 'Toulouse' },
  { code: 'NTE', label: 'Nantes' },
  { code: 'SXB', label: 'Strasbourg' },
  { code: 'LIL', label: 'Lille' },
]

const POPULAR_DESTINATIONS = [
  { code: 'JFK', label: 'New York', country: '🇺🇸' },
  { code: 'BKK', label: 'Bangkok', country: '🇹🇭' },
  { code: 'DXB', label: 'Dubaï', country: '🇦🇪' },
  { code: 'LAX', label: 'Los Angeles', country: '🇺🇸' },
  { code: 'NRT', label: 'Tokyo', country: '🇯🇵' },
  { code: 'GRU', label: 'São Paulo', country: '🇧🇷' },
  { code: 'CMN', label: 'Casablanca', country: '🇲🇦' },
  { code: 'DKR', label: 'Dakar', country: '🇸🇳' },
  { code: 'BKO', label: 'Bamako', country: '🇲🇱' },
  { code: 'IST', label: 'Istanbul', country: '🇹🇷' },
  { code: 'BCN', label: 'Barcelone', country: '🇪🇸' },
  { code: 'LHR', label: 'Londres', country: '🇬🇧' },
  { code: 'MAD', label: 'Madrid', country: '🇪🇸' },
  { code: 'FCO', label: 'Rome', country: '🇮🇹' },
  { code: 'AMS', label: 'Amsterdam', country: '🇳🇱' },
  { code: 'MIA', label: 'Miami', country: '🇺🇸' },
  { code: 'SIN', label: 'Singapour', country: '🇸🇬' },
  { code: 'HKG', label: 'Hong Kong', country: '🇭🇰' },
  { code: 'YUL', label: 'Montréal', country: '🇨🇦' },
  { code: 'MEX', label: 'Mexico', country: '🇲🇽' },
]

const AIRLINE_NAMES: Record<string, string> = {
  AF: 'Air France', BA: 'British Airways', LH: 'Lufthansa', EK: 'Emirates',
  TK: 'Turkish Airlines', QR: 'Qatar Airways', AA: 'American Airlines',
  DL: 'Delta', UA: 'United', IB: 'Iberia', VY: 'Vueling', FR: 'Ryanair',
  U2: 'easyJet', W6: 'Wizz Air', SN: 'Brussels Airlines', KL: 'KLM',
  LX: 'Swiss', OS: 'Austrian', AY: 'Finnair', SK: 'SAS',
}

type SortKey = 'price' | 'duration' | 'departure'
type StopFilter = 'all' | '0' | '1' | '2+'

// ── Helpers ───────────────────────────────────────────────────────────────────

function today() { return format(new Date(), 'yyyy-MM-dd') }
function tomorrow() {
  const d = new Date(); d.setDate(d.getDate() + 1)
  return format(d, 'yyyy-MM-dd')
}
function nextWeek() {
  const d = new Date(); d.setDate(d.getDate() + 7)
  return format(d, 'yyyy-MM-dd')
}

function formatTime(iso: string) {
  return iso.substring(11, 16)
}
function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

function durationToMinutes(dur: string): number {
  const h = parseInt(dur.match(/(\d+)h/)?.[1] ?? '0')
  const m = parseInt(dur.match(/(\d+)m/)?.[1] ?? '0')
  return h * 60 + m
}

function googleFlightsUrl(origin: string, destination: string, departDate: string, returnDate?: string) {
  const base = `https://www.google.com/travel/flights/search?tfs=CBwQAhopagcIARIDCgFAAhIkCgoyMDI1LTAzLTI1EgNDREcaBgoDQ0RHIAJaAUo&hl=fr`
  const dep = departDate.replace(/-/g, '')
  const ret = returnDate ? returnDate.replace(/-/g, '') : ''
  return `https://www.google.com/travel/flights?q=vols+${origin}+${destination}+${dep}${ret ? '+'+ret : ''}&hl=fr&curr=EUR`
}

function stopsLabel(stops: number) {
  if (stops === 0) return { text: 'Direct', cls: 'bg-green-100 text-green-700' }
  if (stops === 1) return { text: '1 escale', cls: 'bg-yellow-100 text-yellow-700' }
  return { text: `${stops} escales`, cls: 'bg-red-100 text-red-700' }
}

function airlineName(code: string) {
  return AIRLINE_NAMES[code] ?? code
}

// ── Composants ────────────────────────────────────────────────────────────────

function ItineraryBlock({ itin, label }: { itin: Itinerary; label: string }) {
  const first = itin.segments[0]
  const last  = itin.segments[itin.segments.length - 1]
  const stops = stopsLabel(itin.stops)

  return (
    <div className="flex-1 min-w-0">
      <div className="text-xs text-gray-400 font-medium mb-1">{label}</div>
      <div className="flex items-center gap-3">
        <div className="text-center">
          <div className="text-xl font-bold text-gray-900">{formatTime(first.departure)}</div>
          <div className="text-xs text-gray-500">{first.from}</div>
        </div>
        <div className="flex-1 text-center">
          <div className="text-xs text-gray-400 mb-0.5">{itin.duration}</div>
          <div className="relative">
            <div className="h-px bg-gray-300 w-full" />
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center">
              {itin.stops > 0 && (
                <div className="w-2 h-2 rounded-full bg-gray-400 border-2 border-white" />
              )}
            </div>
          </div>
          <div className="text-xs mt-0.5">
            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${stops.cls}`}>
              {stops.text}
            </span>
          </div>
        </div>
        <div className="text-center">
          <div className="text-xl font-bold text-gray-900">{formatTime(last.arrival)}</div>
          <div className="text-xs text-gray-500">{last.to}</div>
        </div>
      </div>
    </div>
  )
}

function FlightCard({ flight, returnDate }: { flight: FlightResult; returnDate: string }) {
  const [open, setOpen] = useState(false)
  const airline = airlineName(flight.airline)
  const bookUrl = googleFlightsUrl(
    flight.outbound.segments[0].from,
    flight.outbound.segments[flight.outbound.segments.length - 1].to,
    flight.outbound.segments[0].departure.split('T')[0],
    flight.inbound ? flight.inbound.segments[0].departure.split('T')[0] : undefined,
  )

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
      <div className="p-5 flex flex-wrap gap-4 items-center">
        {/* Airline */}
        <div className="w-20 shrink-0 text-center">
          <div className="text-xs font-bold text-gray-700">{flight.airline}</div>
          <div className="text-xs text-gray-400 truncate">{airline}</div>
        </div>

        {/* Itineraries */}
        <div className="flex-1 flex flex-col gap-3 min-w-0">
          <ItineraryBlock itin={flight.outbound} label="Aller" />
          {flight.inbound && <ItineraryBlock itin={flight.inbound} label="Retour" />}
        </div>

        {/* Price + CTA */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="text-3xl font-bold text-blue-600">{flight.price}€</div>
          <div className="text-xs text-gray-400">par personne</div>
          {flight.seats <= 5 && (
            <div className="text-xs text-red-500 font-medium">
              ⚡ {flight.seats} place{flight.seats > 1 ? 's' : ''} restante{flight.seats > 1 ? 's' : ''}
            </div>
          )}
          <a
            href={bookUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2 rounded-xl transition-colors"
          >
            Voir →
          </a>
          <button
            onClick={() => setOpen(!open)}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            {open ? 'Masquer détails' : 'Voir détails'}
          </button>
        </div>
      </div>

      {/* Détails segments */}
      {open && (
        <div className="border-t border-gray-100 px-5 py-4 space-y-4 text-sm">
          {[flight.outbound, ...(flight.inbound ? [flight.inbound] : [])].map((itin, i) => (
            <div key={i}>
              <div className="font-semibold text-gray-700 mb-2">
                {i === 0 ? 'Aller' : 'Retour'} — {itin.duration}
              </div>
              {itin.segments.map((seg, j) => (
                <div key={j} className="flex items-center gap-3 py-1.5 border-b border-gray-50 last:border-0">
                  <div className="w-14 text-xs font-bold text-gray-500">{seg.airline}{seg.flightNum}</div>
                  <div className="flex-1 flex items-center gap-2">
                    <span className="font-semibold">{formatTime(seg.departure)}</span>
                    <span className="text-gray-400">{seg.from}</span>
                    <span className="text-gray-300 text-xs">──</span>
                    <span className="font-semibold">{formatTime(seg.arrival)}</span>
                    <span className="text-gray-400">{seg.to}</span>
                  </div>
                  <div className="text-xs text-gray-400">{seg.duration}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SearchPage() {
  const [tripType, setTripType] = useState<'roundtrip' | 'oneway'>('roundtrip')
  const [origin, setOrigin] = useState('CDG')
  const [destination, setDestination] = useState('')
  const [departDate, setDepartDate] = useState(nextWeek())
  const [returnDate, setReturnDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 14)
    return format(d, 'yyyy-MM-dd')
  })
  const [adults, setAdults] = useState(1)
  const [loading, setLoading] = useState(false)
  const [flights, setFlights] = useState<FlightResult[]>([])
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filtres & tri
  const [sortKey, setSortKey] = useState<SortKey>('price')
  const [stopFilter, setStopFilter] = useState<StopFilter>('all')
  const [maxPrice, setMaxPrice] = useState<number>(9999)

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!destination) return
    setLoading(true)
    setError(null)
    setFlights([])
    setSearched(false)

    try {
      const params = new URLSearchParams({
        origin,
        destination,
        departureDate: departDate,
        adults: String(adults),
      })
      if (tripType === 'roundtrip' && returnDate) params.set('returnDate', returnDate)

      const res = await fetch(`/api/search/flights?${params}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Erreur lors de la recherche')
      }
      const data = await res.json()
      setFlights(data.flights ?? [])
      setSearched(true)

      // Réinitialise les filtres
      setStopFilter('all')
      setSortKey('price')
      if (data.flights?.length) {
        setMaxPrice(Math.ceil(Math.max(...data.flights.map((f: FlightResult) => f.price)) / 100) * 100)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }

  // Filtrage + tri
  const filtered = flights
    .filter((f) => {
      if (stopFilter === '0' && f.outbound.stops !== 0) return false
      if (stopFilter === '1' && f.outbound.stops !== 1) return false
      if (stopFilter === '2+' && f.outbound.stops < 2) return false
      if (f.price > maxPrice) return false
      return true
    })
    .sort((a, b) => {
      if (sortKey === 'price') return a.price - b.price
      if (sortKey === 'duration') return durationToMinutes(a.outbound.duration) - durationToMinutes(b.outbound.duration)
      if (sortKey === 'departure') return a.outbound.segments[0].departure.localeCompare(b.outbound.segments[0].departure)
      return 0
    })

  const destLabel = POPULAR_DESTINATIONS.find((d) => d.code === destination)?.label ?? destination

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero search bar */}
      <div className="bg-blue-600 pt-10 pb-16 px-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-white mb-1">Comparez les vols</h1>
          <p className="text-blue-200 mb-8">Trouvez le meilleur prix parmi toutes les compagnies</p>

          <div className="bg-white rounded-2xl shadow-xl p-5">
            {/* Aller simple / AR */}
            <div className="flex gap-3 mb-5">
              {(['roundtrip', 'oneway'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTripType(t)}
                  className={`text-sm font-medium px-4 py-1.5 rounded-full transition-colors ${
                    tripType === t
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {t === 'roundtrip' ? 'Aller-retour' : 'Aller simple'}
                </button>
              ))}
            </div>

            <form onSubmit={handleSearch} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Origine */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Départ</label>
                <select
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50"
                >
                  {AIRPORTS.map((a) => (
                    <option key={a.code} value={a.code}>{a.label} ({a.code})</option>
                  ))}
                </select>
              </div>

              {/* Destination */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Destination</label>
                <select
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  required
                  className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50"
                >
                  <option value="">Choisir…</option>
                  {POPULAR_DESTINATIONS.map((d) => (
                    <option key={d.code} value={d.code}>{d.country} {d.label} ({d.code})</option>
                  ))}
                </select>
              </div>

              {/* Dates */}
              <div className={`flex flex-col gap-1 ${tripType === 'roundtrip' ? 'sm:col-span-2 lg:col-span-1' : ''}`}>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {tripType === 'roundtrip' ? 'Aller' : 'Date de départ'}
                </label>
                <input
                  type="date"
                  value={departDate}
                  min={today()}
                  onChange={(e) => setDepartDate(e.target.value)}
                  className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50"
                />
              </div>

              {tripType === 'roundtrip' && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Retour</label>
                  <input
                    type="date"
                    value={returnDate}
                    min={departDate}
                    onChange={(e) => setReturnDate(e.target.value)}
                    className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50"
                  />
                </div>
              )}

              {/* Passagers + Search */}
              <div className="flex gap-3 sm:col-span-2 lg:col-span-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Passagers</label>
                  <select
                    value={adults}
                    onChange={(e) => setAdults(Number(e.target.value))}
                    className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50 w-36"
                  >
                    {[1,2,3,4,5,6,7,8,9].map((n) => (
                      <option key={n} value={n}>{n} adulte{n > 1 ? 's' : ''}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end flex-1">
                  <button
                    type="submit"
                    disabled={loading || !destination}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold px-8 py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                        </svg>
                        Recherche…
                      </>
                    ) : (
                      '🔍 Rechercher'
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Résultats */}
      <div className="max-w-4xl mx-auto px-4 -mt-6 pb-16">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-5 py-4 mb-6">
            {error}
          </div>
        )}

        {searched && (
          <div className="space-y-4 animate-fade-in">
            {/* Header résultats */}
            <div className="flex flex-wrap gap-3 items-center justify-between bg-white rounded-2xl px-5 py-3 shadow-sm border border-gray-100">
              <div className="text-sm text-gray-700">
                <span className="font-bold text-gray-900">{filtered.length}</span> vol{filtered.length !== 1 ? 's' : ''} trouvé{filtered.length !== 1 ? 's' : ''}
                {destination && (
                  <span className="text-gray-500 ml-1">
                    — {origin} → {destLabel}
                    {', '}{new Date(departDate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                    {tripType === 'roundtrip' && returnDate && ` → ${new Date(returnDate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}`}
                    {', '}{adults} adulte{adults > 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {/* Tri */}
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">Trier :</span>
                {(['price', 'duration', 'departure'] as SortKey[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => setSortKey(k)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      sortKey === k ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {k === 'price' ? 'Prix' : k === 'duration' ? 'Durée' : 'Départ'}
                  </button>
                ))}
              </div>
            </div>

            {/* Filtres */}
            {flights.length > 0 && (
              <div className="bg-white rounded-2xl px-5 py-3 shadow-sm border border-gray-100 flex flex-wrap gap-4 items-center text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">Escales :</span>
                  {(['all', '0', '1', '2+'] as StopFilter[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => setStopFilter(s)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                        stopFilter === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {s === 'all' ? 'Tous' : s === '0' ? 'Direct' : s === '1' ? '1 escale' : '2+'}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-gray-500">Max :</span>
                  <span className="font-semibold text-blue-600">{maxPrice}€</span>
                  <input
                    type="range"
                    min={Math.min(...flights.map(f => f.price))}
                    max={Math.ceil(Math.max(...flights.map(f => f.price)) / 100) * 100}
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(Number(e.target.value))}
                    className="w-28 accent-blue-600"
                  />
                </div>
              </div>
            )}

            {/* Liste vols */}
            {filtered.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <div className="text-4xl mb-3">✈️</div>
                <div className="font-medium">Aucun vol ne correspond à vos filtres</div>
                <button onClick={() => { setStopFilter('all'); setMaxPrice(9999) }} className="text-blue-600 text-sm mt-2 hover:underline">
                  Réinitialiser les filtres
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((flight) => (
                  <FlightCard key={flight.id} flight={flight} returnDate={returnDate} />
                ))}
              </div>
            )}

            <p className="text-center text-xs text-gray-400 pt-2">
              Prix indicatifs · Cliquez sur "Voir" pour réserver sur Google Flights
            </p>
          </div>
        )}

        {!searched && !loading && (
          <div className="text-center py-20 text-gray-400">
            <div className="text-5xl mb-4">✈️</div>
            <div className="font-medium text-lg text-gray-500">Recherchez votre prochain voyage</div>
            <div className="text-sm mt-1">Comparez les prix de toutes les compagnies aériennes</div>
          </div>
        )}
      </div>
    </div>
  )
}
