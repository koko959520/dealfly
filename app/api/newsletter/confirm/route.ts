import { redirect } from 'next/navigation'
import { db, Collections, type SubscriberDoc } from '@/src/lib/firestore'
import { err, withErrorHandler, getParams } from '@/src/lib/api'
import { verifyToken } from '@/src/lib/tokens'

export const GET = withErrorHandler(async (req) => {
  const token = getParams(req).get('token')
  if (!token) return err('Token manquant', 400)

  const payload = verifyToken(token)
  if (!payload || payload.purpose !== 'confirm') return err('Token invalide', 400)

  const snap = await db
    .collection(Collections.SUBSCRIBERS)
    .where('email', '==', payload.email)
    .limit(1)
    .get()

  if (snap.empty) return err('Abonné introuvable', 404)

  await snap.docs[0].ref.update({ confirmed: true, active: true })
  redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/?confirmed=true`)
})
