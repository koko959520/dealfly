import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

/** Réponse JSON succès */
export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status })
}

/** Réponse JSON erreur */
export function err(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status })
}

/** Wrapper pour les handlers — catch automatique des erreurs */
export function withErrorHandler(
  handler: (req: Request) => Promise<NextResponse>,
) {
  return async (req: Request): Promise<NextResponse> => {
    try {
      return await handler(req)
    } catch (error) {
      if (error instanceof ZodError) {
        return err(error.errors.map((e) => e.message).join(', '), 400)
      }
      console.error('[API Error]', error)
      return err('Internal server error', 500)
    }
  }
}

/** Parse les query params d'une URL */
export function getParams(req: Request): URLSearchParams {
  return new URL(req.url).searchParams
}
