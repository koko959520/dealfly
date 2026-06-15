'use client'

import { useState } from 'react'
import { format, addMonths } from 'date-fns'
import PriceCalendar, { type CalendarDay } from '@/src/components/PriceCalendar'

// ── Constantes ────────────────────────────────────────────────────────────────

const AIRPORTS = [
  { code: 'CDG', label: 'Paris CDG' },
  { code: 'ORY', label: 'Paris Orly' },
  { code: 'LYS', label: 'Lyon' },
  { code: 'NCE', label: 'Nice' },
  { code: 'MRS', label: 'Marseille' },
]

const DESTINATIONS = [
  { code: 'JFK', label: 'New York JFK' },
  { code: 'BKK', label: 'Bangkok' },
  { code: 'DXB', label: 'Dubaï' },
  { code: 'LAX', label: 'Los Angeles' },
  { code: 'NRT', label: 'Tokyo' },
  { code: 'GRU', label: 'São Paulo' },
  { code: 'CMN', label: 'Casablanca' },
  { code: 'DKR', label: 'Dakar' },
  { code: 'BKO', label: 'Bamako' },
]

// ── Types ─────────────────────────────────────────────────────────────────────

interface SearchResult {
  origin: string
  destination: string
  month: string
  calendar: CalendarDay[]
  bestDeal: {
    departureDate: string
    returnDate: string | null
    price: number
    discountPct: number
    airline: string | null
  } | null
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SearchPage() {
  const [origin, setOrigin]           = useState('CDG')
  const [destination, setDestination] = useState('')
  const [month, setMonth]             = useState(format(new Date(), 'yyyy-MM'))
  const [loading, setLoading]         = useState(false)
  const [results, setResults]         = useState<SearchResult | null>(null)
  const [error, setError]             = useState<string | null>(null)
  const [selectedDepart, setSelectedDepart] = useState('')
  const [selectedReturn, setSelectedReturn] = useState('')

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!destination) return
    setLoading(true)
    setError(null)
    setResults(null)
    setSelectedDepart('')
    setSelectedReturn('')

    try {
      const res = await fetch(
        `/api/search?origin=${origin}&destination=${destination}&month=${month}`,
      )
      if (!res.ok) throw new Error('Erreur lors de la recherche')
      const data = await res.json()
      setResults(data)
    } catch (err) {
      setError('Impossible de charger les données. Réessayez.')
    } finally {
      setLoading(false)
    }
  }

  // Mois N et N+1
  const months = [month, format(addMonths(new Date(`${month}-01`), 1), 'yyyy-MM')]

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Rechercher un vol</h1>
      <p className="text-gray-500 mb-8">Trouvez les meilleurs jours pour voler grâce au calendrier de prix.</p>

      {/* Formulaire */}
      <form onSubmit={handleSearch} className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-wrap gap-4 items-end mb-10">
        <div className="flex flex-col gap-1 min-w-[160px]">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Départ</label>
          <select
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          >
            {AIRPORTS.map((a) => (
              <option key={a.code} value={a.code}>{a.label}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1 min-w-[180px]">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Destination</label>
          <select
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            required
          >
            <option value="">Choisir…</option>
            {DESTINATIONS.map((d) => (
              <option key={d.code} value={d.code}>{d.label}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Mois</label>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            min={format(new Date(), 'yyyy-MM')}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={loading || !destination}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold px-6 py-2 rounded-lg transition-colors"
        >
          {loading ? 'Recherche…' : 'Rechercher'}
        </button>
      </form>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-5 py-4 mb-8">
          {error}
        </div>
      )}

      {/* Résultats */}
      {results && (
        <div className="space-y-8 animate-fade-in">
          {/* Best deal banner */}
          {results.bestDeal && (
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-2xl px-6 py-5 flex flex-wrap gap-4 items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1">
                  ★ Meilleur deal détecté
                </div>
                <div className="text-2xl font-bold text-green-800">
                  {results.bestDeal.price}€
                  <span className="text-sm font-normal text-green-600 ml-2">
                    −{results.bestDeal.discountPct}% vs prix habituel
                  </span>
                </div>
                <div className="text-sm text-gray-600 mt-1">
                  {results.bestDeal.departureDate} → {results.bestDeal.returnDate ?? 'aller simple'}
                  {results.bestDeal.airline && ` · ${results.bestDeal.airline}`}
                </div>
              </div>
              <a
                href={`/deals`}
                className="bg-green-600 hover:bg-green-700 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm"
              >
                Voir le deal →
              </a>
            </div>
          )}

          {/* Sélection dates */}
          {(selectedDepart || selectedReturn) && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-3 flex gap-6 text-sm">
              <div>
                <span className="font-semibold text-blue-700">Aller :</span>{' '}
                {selectedDepart || '–'}
              </div>
              <div>
                <span className="font-semibold text-purple-700">Retour :</span>{' '}
                {selectedReturn || '–'}
              </div>
              {selectedDepart && selectedReturn && (
                <button
                  onClick={() => { setSelectedDepart(''); setSelectedReturn('') }}
                  className="ml-auto text-gray-400 hover:text-gray-600 text-xs"
                >
                  Effacer
                </button>
              )}
            </div>
          )}

          {/* Calendriers heatmap */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {months.map((m) => (
              <div key={m} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                <PriceCalendar
                  month={m}
                  days={m === month ? results.calendar : []}
                  onSelectDepart={setSelectedDepart}
                  onSelectReturn={setSelectedReturn}
                  selectedDepart={selectedDepart}
                  selectedReturn={selectedReturn}
                />
              </div>
            ))}
          </div>

          <p className="text-center text-xs text-gray-400">
            Cliquez sur une date pour sélectionner aller, puis retour. ★ = date optimale détectée.
          </p>
        </div>
      )}
    </div>
  )
}
