import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { db, Collections, fromTS, type DealDoc } from '@/src/lib/firestore'
import { Timestamp } from 'firebase-admin/firestore'

export const dynamic = 'force-dynamic'

type DealRow = {
  id: string
  origin: string
  destination: string
  airline: string | null
  priceEur: number
  discountPct: number
  score: number
  optimalDepart: Date | null
  optimalReturn: Date | null
}

async function getDeals(): Promise<DealRow[]> {
  const now = Timestamp.now()

  const snap = await db
    .collection(Collections.DEALS)
    .where('status', 'in', ['APPROVED', 'SENT'])
    .where('discountPct', '>=', 35)
    .orderBy('discountPct', 'desc')
    .orderBy('score', 'desc')
    .limit(20)
    .get()

  return snap.docs
    .map((doc) => {
      const d = doc.data() as DealDoc
      // Filter out expired deals (expiresAt < now)
      if (d.expiresAt && d.expiresAt.toMillis() < now.toMillis()) return null
      return {
        id:            doc.id,
        origin:        d.origin,
        destination:   d.destination,
        airline:       d.airline,
        priceEur:      d.priceEur,
        discountPct:   d.discountPct,
        score:         d.score,
        optimalDepart: d.optimalDepart ? fromTS(d.optimalDepart) : null,
        optimalReturn: d.optimalReturn ? fromTS(d.optimalReturn) : null,
      }
    })
    .filter(Boolean) as DealRow[]
}

function DealCard({ deal }: { deal: DealRow }) {
  const discountColor =
    deal.discountPct >= 45 ? 'bg-green-100 text-green-700' :
    deal.discountPct >= 35 ? 'bg-lime-100 text-lime-700' :
                              'bg-amber-100 text-amber-700'

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow group">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-lg font-bold text-gray-900">
            {deal.origin} → {deal.destination}
          </div>
          {deal.airline && <div className="text-sm text-gray-500">{deal.airline}</div>}
        </div>
        <span className={`text-sm font-bold px-2.5 py-1 rounded-full ${discountColor}`}>
          −{deal.discountPct.toFixed(0)}%
        </span>
      </div>

      <div className="text-3xl font-black text-gray-900 mb-3">{deal.priceEur}€</div>

      <div className="text-xs text-gray-500 space-y-0.5 mb-4">
        {deal.optimalDepart && (
          <div>
            ✈️ Aller :{' '}
            <span className="font-medium text-gray-700">
              {format(deal.optimalDepart, 'd MMMM yyyy', { locale: fr })}
            </span>
          </div>
        )}
        {deal.optimalReturn && (
          <div>
            🔁 Retour :{' '}
            <span className="font-medium text-gray-700">
              {format(deal.optimalReturn, 'd MMMM yyyy', { locale: fr })}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-16 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${deal.score}%` }} />
          </div>
          <span className="text-xs text-gray-400">Score {deal.score}/100</span>
        </div>
        <a
          href={`/search?origin=${deal.origin}&destination=${deal.destination}`}
          className="text-sm font-semibold text-blue-600 group-hover:underline"
        >
          Voir les dates →
        </a>
      </div>
    </div>
  )
}

export default async function DealsPage() {
  const deals = await getDeals()

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Top Deals du moment</h1>
        <p className="text-gray-500">
          {deals.length} deal{deals.length !== 1 ? 's' : ''} détecté
          {deals.length !== 1 ? 's' : ''} — réductions de −35% à −50% sur les prix habituels.
        </p>
      </div>

      {deals.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <div className="text-5xl mb-4">✈️</div>
          <p className="font-medium">Aucun deal disponible pour le moment.</p>
          <p className="text-sm mt-1">
            Revenez dans quelques heures — notre radar tourne toutes les 6h.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {deals.map((deal) => (
            <DealCard key={deal.id} deal={deal} />
          ))}
        </div>
      )}
    </div>
  )
}
