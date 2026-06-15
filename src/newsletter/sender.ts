import { Resend } from 'resend'
import { render } from '@react-email/render'
import { db, Collections, toTS, type SubscriberDoc, type NewsletterSendDoc } from '@/src/lib/firestore'
import { logger } from '@/src/lib/logger'
import { generateToken } from '@/src/lib/tokens'
import { curateDeals } from './deal-curator'
import NewsletterEmail from '@/emails/newsletter'

function getResend() {
  return new Resend(process.env.RESEND_API_KEY)
}
const BATCH   = 100
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'

export async function sendNewsletter(): Promise<{ sent: number; dealIds: string[] }> {
  const deals = await curateDeals(10)
  if (deals.length === 0) {
    logger.warn('Newsletter: no eligible deals — aborting')
    return { sent: 0, dealIds: [] }
  }

  // Abonnés confirmés et actifs
  const subSnap = await db
    .collection(Collections.SUBSCRIBERS)
    .where('confirmed', '==', true)
    .where('active',    '==', true)
    .get()

  const emails = subSnap.docs.map((d) => (d.data() as SubscriberDoc).email)
  logger.info({ subscribers: emails.length, deals: deals.length }, 'Newsletter: starting send')

  let totalSent = 0

  for (let i = 0; i < emails.length; i += BATCH) {
    const batch = emails.slice(i, i + BATCH)
    await Promise.all(batch.map(async (email) => {
      try {
        const unsubUrl = `${BASE_URL}/api/newsletter/unsubscribe?token=${generateToken(email, 'unsub')}`
        const html     = render(NewsletterEmail({ deals, unsubscribeUrl: unsubUrl, baseUrl: BASE_URL }))
        await getResend().emails.send({
          from: process.env.EMAIL_FROM!,
          to: email,
          subject: `✈️ ${deals.length} deals — jusqu'à -${Math.max(...deals.map((d) => Math.round(d.discountPct)))}%`,
          html,
          headers: {
            'List-Unsubscribe':      `<${unsubUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        })
        totalSent++
      } catch (err) {
        logger.error({ email, err }, 'Newsletter: send failed')
      }
    }))
    if (i + BATCH < emails.length) await new Promise((r) => setTimeout(r, 1000))
  }

  const dealIds = deals.map((d) => d.id)

  // Marquer deals SENT
  const firestoreBatch = db.batch()
  for (const id of dealIds) {
    firestoreBatch.update(db.collection(Collections.DEALS).doc(id), { status: 'SENT' })
  }
  await firestoreBatch.commit()

  // Historique
  const sendDoc: NewsletterSendDoc = {
    dealIds,
    sentAt: toTS(new Date()),
    recipientCount: totalSent,
    openRate: null,
    clickRate: null,
  }
  await db.collection(Collections.NEWSLETTER_SENDS).add(sendDoc)

  logger.info({ sent: totalSent, deals: dealIds.length }, 'Newsletter: complete')
  return { sent: totalSent, dealIds }
}
