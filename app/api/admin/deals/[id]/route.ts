import { z } from 'zod'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/src/lib/auth'
import { db, Collections } from '@/src/lib/firestore'
import { ok, err, withErrorHandler } from '@/src/lib/api'

const PatchSchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']),
})

export const PATCH = withErrorHandler(async (
  req: Request,
  context: { params: { id: string } }
) => {
  const session = await getServerSession(authOptions)
  if (!session) return err('Unauthorized', 401)

  const { id } = context.params
  const body = await req.json()
  const { status } = PatchSchema.parse(body)

  await db.collection(Collections.DEALS).doc(id).update({ status })

  return ok({ success: true, status })
})
