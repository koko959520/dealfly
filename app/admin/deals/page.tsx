import { getServerSession } from 'next-auth'
import { authOptions } from '@/src/lib/auth'
import { redirect } from 'next/navigation'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { db, Collections, fromTS, type DealDoc } from '@/src/lib/firestore'
import DealActions from './DealActions'

export const revalidate = 0

async function getDeals() {
  const snap = await db
    .collection(Collections.DEALS)
    .where('status', 'in', ['PENDING', 'APPROVED'])
    .orderBy('score', 'desc')
    .get()

  return snap.docs.map((doc) => {
    const d = doc.data() as DealDoc
    return {
      id:           doc.id,
      origin:       d.origin,
      destination:  d.destination,
      airline:      d.airline,
      priceEur:     d.priceEur,
      discountPct:  d.discountPct,
      score:        d.score,
      status:       d.status,
      optimalDepart: d.optimalDepart ? fromTS(d.optimalDepart) : null,
    }
  })
}

export default async function DealsAdminPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/admin/login')

  const deals   = await getDeals()
  const pending  = deals.filter((d) => d.status === 'PENDING')
  const approved = deals.filter((d) => d.status === 'APPROVED')

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Gestion des deals</h1>

      {[
        { title: '🕐 En attente de validation', items: pending,  badge: 'bg-amber-100 text-amber-700' },
        { title: '✅ Approuvés',               items: approved, badge: 'bg-green-100 text-green-700'  },
      ].map(({ title, items, badge }) => (
        <div key={title} className="mb-8">
          <h2 className="font-semibold text-gray-700 mb-3">
            {title}{' '}
            <span className={`text-sm px-2 py-0.5 rounded-full font-bold ml-1 ${badge}`}>
              {items.length}
            </span>
          </h2>

          {items.length === 0 ? (
            <p className="text-sm text-gray-400 bg-white rounded-xl border border-gray-200 px-5 py-4">
              Aucun deal.
            </p>
          ) : (
            <div className="space-y-3">
              {items.map((deal) => (
                <div
                  key={deal.id}
                  className="bg-white rounded-2xl border border-gray-200 p-5 flex flex-wrap gap-4 items-center"
                >
                  <div className="flex-1 min-w-[200px]">
                    <div className="font-bold text-gray-900">
                      {deal.origin} → {deal.destination}
                    </div>
                    <div className="text-sm text-gray-500">{deal.airline ?? '—'}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-black text-gray-900">{deal.priceEur}€</div>
                    <div className="text-sm text-green-600 font-semibold">
                      −{deal.discountPct.toFixed(0)}%
                    </div>
                  </div>
                  <div className="text-sm text-gray-500 text-center">
                    <div>
                      Score <span className="font-bold text-blue-600">{deal.score}/100</span>
                    </div>
                    {deal.optimalDepart && (
                      <div>{format(deal.optimalDepart, 'd MMM', { locale: fr })}</div>
                    )}
                  </div>
                  <DealActions dealId={deal.id} currentStatus={deal.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
