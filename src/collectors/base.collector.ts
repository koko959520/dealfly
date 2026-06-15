import { logger } from '@/src/lib/logger'
import type { FlightOffer } from '@/src/types/flight'

export interface CollectorConfig {
  name: string
  maxRetries?: number       // défaut: 3
  retryDelayMs?: number     // défaut: 2000
  circuitBreakerThreshold?: number  // échecs consécutifs avant pause (défaut: 5)
  circuitBreakerResetMs?: number    // durée pause en ms (défaut: 30 min)
}

type CircuitState = 'CLOSED' | 'OPEN'

/**
 * Classe de base pour tous les collecteurs de données de vol.
 * Fournit : retry automatique, circuit breaker, logging structuré.
 */
export abstract class BaseCollector {
  protected readonly name: string
  private readonly maxRetries: number
  private readonly retryDelayMs: number
  private readonly circuitBreakerThreshold: number
  private readonly circuitBreakerResetMs: number

  private consecutiveFailures = 0
  private circuitState: CircuitState = 'CLOSED'
  private circuitOpenedAt: Date | null = null

  constructor(config: CollectorConfig) {
    this.name = config.name
    this.maxRetries = config.maxRetries ?? 3
    this.retryDelayMs = config.retryDelayMs ?? 2000
    this.circuitBreakerThreshold = config.circuitBreakerThreshold ?? 5
    this.circuitBreakerResetMs = config.circuitBreakerResetMs ?? 30 * 60 * 1000
  }

  /** Point d'entrée public — vérifie le circuit breaker, retry, logging */
  async collect(origin: string, destinations: string[], months: string[]): Promise<FlightOffer[]> {
    if (this.isCircuitOpen()) {
      logger.warn({ collector: this.name }, 'Circuit OPEN — skipping collector')
      return []
    }

    try {
      const result = await this.withRetry(() => this.fetchOffers(origin, destinations, months))
      this.onSuccess()
      return result
    } catch (err) {
      this.onFailure(err)
      return []
    }
  }

  /** À implémenter dans chaque sous-classe */
  protected abstract fetchOffers(
    origin: string,
    destinations: string[],
    months: string[],
  ): Promise<FlightOffer[]>

  // ── Circuit Breaker ────────────────────────────────────────────────────────

  private isCircuitOpen(): boolean {
    if (this.circuitState === 'OPEN' && this.circuitOpenedAt) {
      const elapsed = Date.now() - this.circuitOpenedAt.getTime()
      if (elapsed >= this.circuitBreakerResetMs) {
        logger.info({ collector: this.name }, 'Circuit RESET — trying again')
        this.circuitState = 'CLOSED'
        this.consecutiveFailures = 0
        this.circuitOpenedAt = null
        return false
      }
      return true
    }
    return false
  }

  private onSuccess(): void {
    this.consecutiveFailures = 0
  }

  private onFailure(err: unknown): void {
    this.consecutiveFailures++
    logger.error(
      { collector: this.name, failures: this.consecutiveFailures, err },
      'Collector failure',
    )
    if (this.consecutiveFailures >= this.circuitBreakerThreshold) {
      this.circuitState = 'OPEN'
      this.circuitOpenedAt = new Date()
      logger.warn(
        { collector: this.name, resetIn: `${this.circuitBreakerResetMs / 60000} min` },
        'Circuit OPEN — pausing collector',
      )
    }
  }

  // ── Retry Logic ────────────────────────────────────────────────────────────

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn()
      } catch (err) {
        lastError = err
        if (attempt < this.maxRetries) {
          const delay = this.retryDelayMs * attempt
          logger.warn(
            { collector: this.name, attempt, nextRetryMs: delay },
            'Retrying after error',
          )
          await sleep(delay)
        }
      }
    }
    throw lastError
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
