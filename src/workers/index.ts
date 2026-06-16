import { Queue, Worker, type Job } from 'bullmq'
import { getRedis } from '@/src/lib/redis'
import { logger } from '@/src/lib/logger'
import { SerpApiCollector } from '@/src/collectors/serpapi.collector'
import { SkyScrapperCollector } from '@/src/collectors/skyscrapper.collector'
import { AviationstackCollector } from '@/src/collectors/aviationstack.collector'
import { KiwiCollector } from '@/src/collectors/kiwi.collector'
import { KayakCollector } from '@/src/collectors/kayak.collector'
import { normalizeAndStore } from '@/src/collectors/normalizer'
import { detectDeals } from '@/src/engine/deal-detector'

const ORIGINS      = ['CDG', 'ORY', 'LYS']
const DESTINATIONS = ['JFK', 'BKK', 'DXB', 'LAX', 'NRT', 'GRU', 'CMN', 'DKR', 'IST', 'BCN']

const connection = getRedis()

export const collectQueue = new Queue('collect', { connection })
export const detectQueue  = new Queue('detect',  { connection })

const collectWorker = new Worker(
  'collect',
  async (_job: Job) => {
    logger.info('Worker: starting collection cycle')

    const collectors = [
      new SerpApiCollector(),       // Google Flights — prix réels
      new SkyScrapperCollector(),   // Skyscanner via RapidAPI
      new AviationstackCollector(), // Vols planifiés
      new KiwiCollector(),          // Low-cost
    ]

    let totalInserted = 0

    for (const collector of collectors) {
      for (const origin of ORIGINS) {
        try {
          const offers   = await collector.collect(origin, DESTINATIONS)
          const inserted = await normalizeAndStore(offers)
          totalInserted += inserted
        } catch (err) {
          logger.error({ err, origin, collector: collector.constructor.name }, 'Collector error — skipping')
        }
      }
    }

    // Kayak scraper — tourne séparément (Playwright lourd)
    const kayak = new KayakCollector()
    for (const origin of ORIGINS) {
      try {
        const offers   = await kayak.collect(origin, DESTINATIONS)
        const inserted = await normalizeAndStore(offers)
        totalInserted += inserted
      } catch (err) {
        logger.error({ err, origin }, 'Kayak collector error — skipping')
      }
    }

    logger.info({ totalInserted }, 'Worker: collection cycle complete')
    await detectQueue.add('detect', {})
  },
  { connection, concurrency: 1 },
)

const detectWorker = new Worker(
  'detect',
  async (_job: Job) => {
    logger.info('Worker: starting deal detection')
    const count = await detectDeals()
    logger.info({ count }, 'Worker: deal detection complete')
  },
  { connection, concurrency: 1 },
)

async function scheduleJobs() {
  await collectQueue.add('collect', {}, {
    repeat: { pattern: '0 */6 * * *' },
    jobId:  'collect-cron',
  })
  logger.info('Workers started — collect cron: every 6h')
}

scheduleJobs().catch(logger.error.bind(logger))

process.on('SIGTERM', async () => {
  await collectWorker.close()
  await detectWorker.close()
  process.exit(0)
})
