import { createHmac, randomBytes, timingSafeEqual } from 'crypto'

const SECRET = process.env.UNSUBSCRIBE_HMAC_SECRET ?? 'dev-secret'

/** Génère un token HMAC pour un email (unsubscribe / confirmation) */
export function generateToken(email: string, purpose: 'confirm' | 'unsub'): string {
  const payload = `${purpose}:${email}`
  const hmac = createHmac('sha256', SECRET).update(payload).digest('hex')
  return Buffer.from(`${payload}:${hmac}`).toString('base64url')
}

/** Vérifie et décode un token — retourne { email, purpose } ou null */
export function verifyToken(
  token: string,
): { email: string; purpose: 'confirm' | 'unsub' } | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8')
    const [purpose, email, hmac] = decoded.split(':')

    if (purpose !== 'confirm' && purpose !== 'unsub') return null

    const expected = createHmac('sha256', SECRET)
      .update(`${purpose}:${email}`)
      .digest('hex')

    const hmacBuf = Buffer.from(hmac, 'hex')
    const expectedBuf = Buffer.from(expected, 'hex')

    if (hmacBuf.length !== expectedBuf.length) return null
    if (!timingSafeEqual(hmacBuf, expectedBuf)) return null

    return { email, purpose: purpose as 'confirm' | 'unsub' }
  } catch {
    return null
  }
}
