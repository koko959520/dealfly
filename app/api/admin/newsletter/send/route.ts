import { getServerSession } from 'next-auth'
import { authOptions } from '@/src/lib/auth'
import { ok, err, withErrorHandler } from '@/src/lib/api'
import { sendNewsletter } from '@/src/newsletter/sender'

export const POST = withErrorHandler(async (req) => {
  const session = await getServerSession(authOptions)
  if (!session) return err('Unauthorized', 401)

  const result = await sendNewsletter()
  return ok(result)
})
