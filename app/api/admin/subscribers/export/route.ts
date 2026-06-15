import { getServerSession } from 'next-auth'
import { authOptions } from '@/src/lib/auth'
import { db, Collections, fromTS, type SubscriberDoc } from '@/src/lib/firestore'
import { NextResponse } from 'next/server'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const snap = await db
    .collection(Collections.SUBSCRIBERS)
    .orderBy('subscribedAt', 'desc')
    .get()

  const rows = snap.docs.map((doc) => {
    const s = doc.data() as SubscriberDoc
    return [
      s.email,
      s.originAirport,
      s.budgetMaxEur ?? '',
      s.confirmed,
      s.active,
      fromTS(s.subscribedAt).toISOString(),
    ].join(',')
  })

  const csv = ['email,origin,budget_max,confirmed,active,subscribed_at', ...rows].join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="subscribers-${new Date().toISOString().split('T')[0]}.csv"`,
    },
  })
}
