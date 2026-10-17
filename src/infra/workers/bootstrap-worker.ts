import { env } from '@infra/config'
import { ContextLogger } from '@infra/logging'
import { serveMetrics } from '@infra/metrics'
import { Type } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { WorkerLoop } from './worker-loop'

export async function bootstrapWorker(module: Type, worker: Type<WorkerLoop>): Promise<void> {
    const app = await NestFactory.createApplicationContext(module, { logger: new ContextLogger() })
    app.enableShutdownHooks()
    serveMetrics(env.metricsPort)
    void app.get(worker).start()
}
