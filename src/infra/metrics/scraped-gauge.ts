import { Logger } from '@nestjs/common'
import { Gauge } from 'prom-client'
import { metricsRegistry } from './metrics'

const logger = new Logger('Metrics')

export function registerScrapedGauge(name: string, help: string, read: () => Promise<number>): void {
    if (metricsRegistry.getSingleMetric(name)) return

    new Gauge({
        name,
        help,
        registers: [metricsRegistry],
        async collect() {
            try {
                this.set(await read())
            } catch (error) {
                logger.warn('Metric collection failed', {
                    metric: name,
                    error: error instanceof Error ? error.message : String(error),
                })
                throw error
            }
        },
    })
}
