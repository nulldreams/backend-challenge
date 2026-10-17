import { EventPublisher } from '@application/messaging'
import { PublishOutboxBatchUseCase } from '@application/use-cases'
import { DatabaseModule } from '@infra/database'
import { SqsEventPublisher, SqsModule } from '@infra/sqs'
import { Module } from '@nestjs/common'
import { OutboxPublisherWorker } from './outbox-publisher.worker'

@Module({
    imports: [DatabaseModule, SqsModule],
    providers: [
        { provide: EventPublisher, useClass: SqsEventPublisher },
        PublishOutboxBatchUseCase,
        OutboxPublisherWorker,
    ],
})
export class OutboxPublisherModule {}
