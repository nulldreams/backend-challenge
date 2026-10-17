import { describeError, EventPublisher } from '@application/messaging'
import { OutboxMessageRepository } from '@application/repositories'
import { TransactionManager } from '@application/transaction'
import { OutboxMessage } from '@domain/outbox-message'
import { Injectable, Logger } from '@nestjs/common'
import { OutboxBatchResult } from './publish-outbox-batch.interface'

export const OUTBOX_BATCH_SIZE = 10
const ALERT_AFTER_ATTEMPTS = 10

@Injectable()
export class PublishOutboxBatchUseCase {
    private readonly logger = new Logger(PublishOutboxBatchUseCase.name)

    constructor(
        private readonly transactionManager: TransactionManager,
        private readonly outboxMessageRepository: OutboxMessageRepository,
        private readonly eventPublisher: EventPublisher,
    ) {}

    execute(): Promise<OutboxBatchResult> {
        return this.transactionManager.run(async () => {
            const messages = await this.outboxMessageRepository.claimDue(OUTBOX_BATCH_SIZE, new Date())

            if (messages.length === 0) return { claimed: 0, published: 0, retried: 0 }

            const publishedIds = new Set(await this.publish(messages))
            const now = new Date()

            for (const message of messages) this.recordAttempt(message, publishedIds.has(message.id), now)

            await this.outboxMessageRepository.save(messages)

            return {
                claimed: messages.length,
                published: publishedIds.size,
                retried: messages.length - publishedIds.size,
            }
        })
    }

    private recordAttempt(message: OutboxMessage, published: boolean, now: Date): void {
        if (published) {
            message.markPublished(now)
            return
        }

        message.scheduleRetry(now)

        if (message.attempts >= ALERT_AFTER_ATTEMPTS) {
            this.logger.warn('Outbox message keeps failing', { eventId: message.id, attempts: message.attempts })
        }
    }

    private async publish(messages: OutboxMessage[]): Promise<string[]> {
        try {
            const { publishedIds, failed } = await this.eventPublisher.publish(messages)

            if (failed.length > 0) this.logger.error('Some events were not published', { failed })

            return publishedIds
        } catch (error) {
            this.logger.error('Event batch not published', { count: messages.length, error: describeError(error) })
            return []
        }
    }
}
