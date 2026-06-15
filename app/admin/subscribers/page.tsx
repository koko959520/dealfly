import { getServerSession } from 'next-auth'
import { authOptions } from '@/src/lib/auth'
import { redirect } from 'next/navigation'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { db, Collections, fromTS, type SubscriberDoc } from '@/src/lib/firestore'

export const revalidate = 60

async function getSubscribers() {
  const snap = await db
    .collection(Collections.SUBSCRIBERS)
    .orderBy('subscribedAt', 'desc')
    .limit(200)
    .get()

  return snap.docs.map((doc) => {
    const s = doc.data() as SubscriberDoc
    return {
      id:            doc.id,
      email:         s.email,
      originAirport: s.originAirport,
      budgetMaxEur:  s.budgetMaxEur,
      confirmed:     s.confirmed,
      active:        s.active,
      subscribedAt:  fromTS(s.subscribedAt),
    }
  })
}

export default async function SubscribersPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/admin/login')

  const subscribers = await getSubscribers()
  const active   = subscribers.filter((s) => s.confirmed && s.active).length
  const pending  = subscribers.filter((s) => !s.confirmed).length
  const inactive = subscribers.filter((s) => !s.active).length

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Abonnés</h1>
        <a
          href="/api/admin/subscribers/export"
          className="text-sm text-blue-600 hover:underline font-medium"
        >
          ↓ Exporter CSV
        </a>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Actifs confirmés', value: active,   color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'En attente',       value: pending,  color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Désinscrits',      value: inactive, color: 'text-gray-500',  bg: 'bg-gray-50'  },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`${bg} rounded-2xl p-4 text-center`}>
            <div className={`text-2xl font-black ${color}`}>{value}</div>
            <div className="text-xs text-gray-600 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
              <th className="text-left px-5 py-3">Email</th>
              <th className="text-left px-5 py-3">Aéroport</th>
              <th className="text-left px-5 py-3">Budget</th>
              <th className="text-left px-5 py-3">Statut</th>
              <th className="text-left px-5 py-3">Inscription</th>
            </tr>
          </thead>
          <tbody>
            {subscribers.map((s) => (
              <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3 font-medium text-gray-900">{s.email}</td>
                <td className="px-5 py-3 text-gray-600">{s.originAirport}</td>
                <td className="px-5 py-3 text-gray-600">{s.budgetMaxEur ? `${s.budgetMaxEur}€` : '–'}</td>
                <td className="px-5 py-3">
                  {!s.active ? (
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Désinscrit</span>
                  ) : s.confirmed ? (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Actif</span>
                  ) : (
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">En attente</span>
                  )}
                </td>
                <td className="px-5 py-3 text-gray-500">
                  {format(s.subscribedAt, 'd MMM yyyy', { locale: fr })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
