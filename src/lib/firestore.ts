/**
 * Client Firebase Admin — Firestore
 * Utilisé côté serveur (API routes, workers, admin).
 * Project : traveler-9051a
 */

import { initializeApp, getApps, cert, type ServiceAccount } from 'firebase-admin/app'
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore'

// Initialisation unique (Next.js hot-reload safe)
if (!getApps().length) {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    // En production (Cloud Run) : JSON injecté comme secret
    const serviceAccount = JSON.parse(
      process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
    ) as ServiceAccount
    initializeApp({ credential: cert(serviceAccount) })
  } else {
    // En local : utilise Application Default Credentials (gcloud auth application-default login)
    initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID ?? 'traveler-9051a' })
  }
}

export const db = getFirestore()
export { Timestamp, FieldValue }

// ── Collections ───────────────────────────────────────────────────────────────

export const Collections = {
  FLIGHTS:           'flights',
  PRICE_HISTORY:     'price_history',
  DEALS:             'deals',
  SUBSCRIBERS:       'subscribers',
  NEWSLETTER_SENDS:  'newsletter_sends',
} as const

// ── Types Firestore ───────────────────────────────────────────────────────────

export interface FlightDoc {
  id?: string
  origin: string
  destination: string
  departureDate: Timestamp
  returnDate: Timestamp | null
  priceEur: number
  airline: string | null
  source: string
  scrapedAt: Timestamp
}

export interface PriceHistoryDoc {
  route: string           // CDG-JFK
  date: Timestamp
  medianPrice: number | null
  minPrice: number | null
  sampleCount: number
}

export interface DealDoc {
  id?: string
  flightId: string
  route: string
  discountPct: number
  score: number
  optimalDepart: Timestamp | null
  optimalReturn: Timestamp | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SENT' | 'EXPIRED'
  detectedAt: Timestamp
  expiresAt: Timestamp | null
  // Dénormalisé pour éviter les joins
  origin: string
  destination: string
  priceEur: number
  airline: string | null
}

export interface SubscriberDoc {
  id?: string
  email: string
  originAirport: string
  budgetMaxEur: number | null
  confirmed: boolean
  active: boolean
  subscribedAt: Timestamp
  unsubscribedAt: Timestamp | null
}

export interface NewsletterSendDoc {
  id?: string
  dealIds: string[]
  sentAt: Timestamp
  recipientCount: number
  openRate: number | null
  clickRate: number | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convertit une date JS en Timestamp Firestore */
export function toTS(date: Date): Timestamp {
  return Timestamp.fromDate(date)
}

/** Convertit un Timestamp Firestore en date JS */
export function fromTS(ts: Timestamp): Date {
  return ts.toDate()
}

/** Génère un ID unique (compatible avec les anciens UUID) */
export function newId(): string {
  return db.collection('_').doc().id
}
