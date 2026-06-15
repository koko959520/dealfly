import { z } from 'zod'
import { db, Collections, toTS, type SubscriberDoc } from '@/src/lib/firestore'
import { ok, err, withErrorHandler } from '@/src/lib/api'
import { generateToken } from '@/src/lib/tokens'
import { Resend } from 'resend'

function getResend() {
  return new Resend(process.env.RESEND_API_KEY)
}

const SubscribeSchema = z.object({
  email:      z.string().email(),
  origin:     z.string().length(3).toUpperCase().default('CDG'),
  budget_max: z.coerce.number().int().min(0).max(10000).optional(),
})

export const POST = withErrorHandler(async (req) => {
  const body  = await req.json()
  const input = SubscribeSchema.parse(body)

  // Vérifier si déjà inscrit (cherche par email)
  const existing = await db
    .collection(Collections.SUBSCRIBERS)
    .where('email', '==', input.email)
    .limit(1)
    .get()

  if (!existing.empty) {
    const sub = existing.docs[0].data() as SubscriberDoc
    if (sub.confirmed && sub.active) return err('Email déjà inscrit et confirmé', 409)
    // Réactiver
    await existing.docs[0].ref.update({
      originAirport: input.origin,
      budgetMaxEur:  input.budget_max ?? null,
      confirmed:     false,
      active:        true,
      unsubscribedAt: null,
    })
  } else {
    const doc: SubscriberDoc = {
      email:          input.email,
      originAirport:  input.origin,
      budgetMaxEur:   input.budget_max ?? null,
      confirmed:      false,
      active:         true,
      subscribedAt:   toTS(new Date()),
      unsubscribedAt: null,
    }
    await db.collection(Collections.SUBSCRIBERS).add(doc)
  }

  const token      = generateToken(input.email, 'confirm')
  const confirmUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/api/newsletter/confirm?token=${token}`

  await getResend().emails.send({
    from: process.env.EMAIL_FROM!,
    to:   input.email,
    subject: 'Confirmez votre inscription aux alertes deals',
    html: `<p>Confirmez votre inscription : <a href="${confirmUrl}">Cliquer ici</a></p>`,
  })

  return ok({ message: 'Email de confirmation envoyé.' }, 201)
})
