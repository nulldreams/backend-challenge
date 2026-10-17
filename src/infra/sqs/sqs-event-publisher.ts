import { EventPublisher, type PublishResult } from '@application/messaging'
import { SendMessageBatchCommand, SQSClient } from '@aws-sdk/client-sqs'
import { OutboxMessage } from '@domain/outbox-message'
import { env } from '@infra/config'
import { Injectable } from '@nestjs/common'
import { SqsQueueUrls } from './sqs-queue-urls'

const PUBLISH_TIMEOUT_MS = 5_000

@Injectable()
export class SqsEventPublisher extends EventPublisher {
    constructor(
        private readonly sqs: SQSClient,
        private readonly queueUrls: SqsQueueUrls,
    ) {
        super()
    }

    async publish(messages: OutboxMessage[]): Promise<PublishResult> {
        const output = await this.sqs.send(
            new SendMessageBatchCommand({
                QueueUrl: await this.queueUrls.get(env.aws.queues.wagerEvents),
                Entries: messages.map((message) => ({
                    Id: message.id,
                    MessageBody: JSON.stringify(message.payload),
                    MessageGroupId: message.aggregateId,
                    MessageDeduplicationId: message.id,
                    MessageAttributes: {
                        eventType: { DataType: 'String', StringValue: message.eventType },
                        correlationId: { DataType: 'String', StringValue: String(message.payload.correlationId) },
                    },
                })),
            }),
            { abortSignal: AbortSignal.timeout(PUBLISH_TIMEOUT_MS) },
        )

        return {
            publishedIds: (output.Successful ?? []).map((entry) => entry.Id as string),
            failed: (output.Failed ?? []).map((entry) => ({ id: entry.Id as string, reason: entry.Code ?? 'Unknown' })),
        }
    }
}
