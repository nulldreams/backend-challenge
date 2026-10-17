import { OutboxMessageRepository } from '@application/repositories'
import { GetQueueAttributesCommand, SQSClient } from '@aws-sdk/client-sqs'
import { env } from '@infra/config'
import { SqsQueueUrls } from '@infra/sqs'
import { Injectable, OnModuleInit } from '@nestjs/common'
import { registerScrapedGauge } from './scraped-gauge'

const DLQ_SCRAPE_TIMEOUT_MS = 1_000

@Injectable()
export class BacklogMetrics implements OnModuleInit {
    constructor(
        private readonly outboxMessageRepository: OutboxMessageRepository,
        private readonly sqs: SQSClient,
        private readonly queueUrls: SqsQueueUrls,
    ) {}

    onModuleInit(): void {
        registerScrapedGauge(
            'wagering_outbox_pending',
            'Outbox events not published yet',
            async () => (await this.outboxMessageRepository.backlog()).pending,
        )
        registerScrapedGauge(
            'wagering_outbox_lag_seconds',
            'Age of the oldest pending outbox event (0 when none)',
            async () => (await this.outboxMessageRepository.backlog()).lagSeconds,
        )
        registerScrapedGauge('wagering_dlq_depth', 'Messages in the wager transactions DLQ (approximate)', () =>
            this.readDlqDepth(),
        )
    }

    private async readDlqDepth(): Promise<number> {
        const output = await this.sqs.send(
            new GetQueueAttributesCommand({
                QueueUrl: await this.queueUrls.get(env.aws.queues.wagerTransactionsDlq),
                AttributeNames: ['ApproximateNumberOfMessages'],
            }),
            { abortSignal: AbortSignal.timeout(DLQ_SCRAPE_TIMEOUT_MS) },
        )

        return Number(output.Attributes?.ApproximateNumberOfMessages ?? 0)
    }
}
