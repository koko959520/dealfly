import { Redis } from 'ioredis'

let redis: Redis | null = null

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    })
    redis.on('error', (err) => {
      console.error('[Redis] Connection error:', err)
    })
  }
  return redis
}

/** Cache wrapper — retourne null si clé absente ou Redis indisponible */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const val = await getRedis().get(key)
    return val ? (JSON.parse(val) as T) : null
  } catch {
    return null
  }
}

/** Cache wrapper — TTL en secondes */
export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  try {
    await getRedis().set(key, JSON.stringify(value), 'EX', ttlSeconds)
  } catch {
    // Redis indisponible → on continue sans cache
  }
}
