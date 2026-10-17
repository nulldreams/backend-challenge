import { DatabaseModule } from '@infra/database'
import { BacklogMetrics } from '@infra/metrics'
import { SqsModule } from '@infra/sqs'
import { Module } from '@nestjs/common'
import { HealthController } from './health.controller'
import { MetricsController } from './metrics.controller'

@Module({
    imports: [DatabaseModule, SqsModule],
    controllers: [HealthController, MetricsController],
    providers: [BacklogMetrics],
})
export class HealthModule {}
