import { getServerSession } from 'next-auth'
import { authOptions } from '@/src/lib/auth'
import { redirect } from 'next/navigation'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { db, Collections, fromTS, type NewsletterSendDoc } from '@/src/lib/firestore'

export const revalidate = 60

async function getStats() {
  const [pendingSnap, approvedSnap, sentSnap, subsSnap, lastSendSnap] = await Promise.all([
    db.collection(Collections.DEALS).where('status', '==', 'PENDING').count().get(),
    db.collection(Collections.DEALS).where('status', '==', 'APPROVED').count().get(),
    db.collection(Collections.DEALS).where('status', '==', 'SENT').count().get(),
    db
      .collection(Collections.SUBSCRIBERS)
      .where('confirmed', '==', true)
      .where('active', '==', true)
      .count()
      .get(),
    db.collection(Collections.NEWSLETTER_SENDS).orderBy('sentAt', 'desc').limit(1).get(),
  ])

  const lastSendDoc = lastSendSnap.empty
    ? null
    : (lastSendSnap.docs[0].data() as NewsletterSendDoc)

  return {
    pending:     pendingSnap.data().count,
    approved:    approvedSnap.data().count,
    sent:        sentSnap.data().count,
    subscribers: subsSnap.data().count,
    lastSend:    lastSendDoc
      ? { ...lastSendDoc, sentAt: fromTS(lastSendDoc.sentAt) }
      : null,
  }
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/admin/login')

  const stats = await getStats()

  const kpis = [
    { label: 'Deals en attente', value: stats.pending,     color: 'text-amber-600',  bg: 'bg-amber-50',  href: '/admin/deals' },
    { label: 'Deals approuvés',  value: stats.approved,    color: 'text-green-600',  bg: 'bg-green-50',  href: '/admin/deals' },
    { label: 'Deals envoyés',    value: stats.sent,        color: 'text-blue-600',   bg: 'bg-blue-50',   href: '/admin/deals' },
    { label: 'Abonnés actifs',   value: stats.subscribers, color: 'text-purple-600', bg: 'bg-purple-50', href: '/admin/subscribers' },
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {kpis.map(({ label, value, color, bg, href }) => (
          <a key={label} href={href} className={`${bg} rounded-2xl p-5 hover:shadow-md transition-shadow block`}>
            <div className={`text-3xl font-black ${color}`}>{value}</div>
            <div className="text-sm text-gray-600 mt-1">{label}</div>
          </a>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-700 mb-3">Dernier envoi newsletter</h2>
        {stats.lastSend ? (
          <div className="text-sm text-gray-600 space-y-1">
            <div>📅 {format(stats.lastSend.sentAt, "d MMMM yyyy 'à' HH:mm", { locale: fr })}</div>
            <div>📨 {stats.lastSend.recipientCount} destinataires</div>
            {stats.lastSend.openRate != null && (
              <div>👁 Taux d'ouverture : {Number(stats.lastSend.openRate).toFixed(1)}%</div>
            )}
            {stats.lastSend.clickRate != null && (
              <div>🖱 Taux de clic : {Number(stats.lastSend.clickRate).toFixed(1)}%</div>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-400">Aucun envoi pour le moment.</p>
        )}
        <div className="mt-4">
          <a
            href="/admin/newsletter"
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2 rounded-xl transition-colors"
          >
            Préparer le prochain envoi →
          </a>
        </div>
      </div>
    </div>
  )
}
