import { describeError } from '@application/messaging'
import { type SubmitWagerTransactionResult, SubmitWagerTransactionUseCase } from '@application/use-cases'
import {
    ChangeMessageVisibilityCommand,
    DeleteMessageCommand,
    type Message,
    ReceiveMessageCommand,
    SendMessageCommand,
    SQSClient,
} from '@aws-sdk/client-sqs'
import { InboxMessage } from '@domain/inbox-message'
import { computePayloadHash } from '@domain/wager-transaction'
import { env } from '@infra/config'
import { currentContext, runWithContext } from '@infra/logging'
import {
    metrics,
    recordDuplicateConflict,
    recordLockConflict,
    recordSubmission,
    startProcessingTimer,
} from '@infra/metrics'
import { SqsQueueUrls } from '@infra/sqs'
import { WorkerLoop } from '@infra/workers'
import { Injectable } from '@nestjs/common'
import { messageActionFor } from './message-action'
import { wagerTransactionMessageSchema } from './wager-transaction-message.schema'

export const CONSUMER_NAME = 'wager-transaction-consumer'

const BATCH_SIZE = 10
const LONG_POLL_SECONDS = 20
const RETRY_JITTER = 0.2

const receiveCountOf = (message: Message): number => Number(message.Attributes?.ApproximateReceiveCount ?? 1)

const retryDelayFor = (message: Message): number => {
    const delays = env.consumer.retryDelaysSeconds
    const delay = delays[Math.min(receiveCountOf(message), delays.length) - 1] ?? 0
    return Math.round(delay * (1 + Math.random() * RETRY_JITTER))
}

@Injectable()
export class WagerTransactionConsumer extends WorkerLoop {
    constructor(
        private readonly sqs: SQSClient,
        private readonly queueUrls: SqsQueueUrls,
        private readonly submitWagerTransactionUseCase: SubmitWagerTransactionUseCase,
    ) {
        super()
    }

    protected async tick(): Promise<boolean> {
        const queueUrl = await this.queueUrls.get(env.aws.queues.wagerTransactions)
        const messages = await this.receive(queueUrl)
        const groups = [...this.groupByMessageGroup(messages).values()]

        await Promise.all(groups.map((group) => this.processGroup(queueUrl, group)))

        return messages.length === BATCH_SIZE
    }

    private async receive(queueUrl: string): Promise<Message[]> {
        try {
            const output = await this.sqs.send(
                new ReceiveMessageCommand({
                    QueueUrl: queueUrl,
                    MaxNumberOfMessages: BATCH_SIZE,
                    WaitTimeSeconds: LONG_POLL_SECONDS,
                    MessageAttributeNames: ['All'],
                    MessageSystemAttributeNames: ['ApproximateReceiveCount', 'MessageGroupId'],
                }),
                { abortSignal: this.shutdownSignal },
            )

            return output.Messages ?? []
        } catch (error) {
            if (this.shutdownSignal.aborted) return []

            throw error
        }
    }

    private groupByMessageGroup(messages: Message[]): Map<string, Message[]> {
        const groups = new Map<string, Message[]>()

        for (const message of messages) {
            const groupId = message.Attributes?.MessageGroupId ?? (message.MessageId as string)
            groups.set(groupId, [...(groups.get(groupId) ?? []), message])
        }

        return groups
    }

    private async processGroup(queueUrl: string, group: Message[]): Promise<void> {
        for (const [index, message] of group.entries()) {
            if (this.shutdownSignal.aborted) return this.release(queueUrl, group.slice(index), 0)

            const shouldRetry = await this.handle(queueUrl, message)

            if (shouldRetry) return this.release(queueUrl, group.slice(index), retryDelayFor(message))
        }
    }

    private handle(queueUrl: string, message: Message): Promise<boolean> {
        const correlationId = message.MessageAttributes?.correlationId?.StringValue

        return runWithContext({ correlationId: correlationId ?? (message.MessageId as string) }, async () => {
            const finishTimer = startProcessingTimer('sqs')

            try {
                const result = await this.submit(message, correlationId)
                finishTimer(recordSubmission(result, 'sqs'))
                this.logProcessed(result)
                await this.ack(queueUrl, message)
                return false
            } catch (error) {
                finishTimer('error')
                recordDuplicateConflict(error, 'sqs')
                recordLockConflict(error, 'sqs')
                return this.handleFailure(queueUrl, message, error)
            }
        })
    }

    private async submit(message: Message, correlationId: string | undefined): Promise<SubmitWagerTransactionResult> {
        const envelope = wagerTransactionMessageSchema.parse(JSON.parse(message.Body ?? ''))
        const context = currentContext()

        if (context)
            Object.assign(context, {
                messageId: envelope.messageId,
                correlationId: correlationId ?? envelope.messageId,
            })

        const { idempotencyKey, ...payload } = envelope.data

        return this.submitWagerTransactionUseCase.execute({
            idempotencyKey,
            payload,
            context: { correlationId: correlationId ?? envelope.messageId, causationId: envelope.messageId },
            inbox: InboxMessage.receive({
                messageId: envelope.messageId,
                consumerName: CONSUMER_NAME,
                payloadHash: computePayloadHash(payload),
                receivedAt: new Date(),
            }),
        })
    }

    private async handleFailure(queueUrl: string, message: Message, error: unknown): Promise<boolean> {
        const action = messageActionFor(error)
        const details = {
            sqsMessageId: message.MessageId,
            receiveCount: receiveCountOf(message),
            action,
            error: describeError(error),
        }

        if (action === 'retry') {
            metrics.retries.inc({ stage: 'sqs_message' })
            this.logger.warn('Message will be retried', details)
            return true
        }

        if (action === 'dead-letter') {
            this.logger.error('Message sent to DLQ', details)
            await this.deadLetter(queueUrl, message, error)
            return false
        }

        this.logger.warn('Message acknowledged without effect', details)
        await this.ack(queueUrl, message)
        return false
    }

    private logProcessed({ transaction, idempotentReplay }: SubmitWagerTransactionResult): void {
        this.logger.log('Message processed', {
            transactionId: transaction.id,
            walletId: transaction.walletId,
            providerId: transaction.providerId,
            kind: transaction.kind,
            status: transaction.status,
            failureCode: transaction.failureCode,
            idempotentReplay,
        })
    }

    private async ack(queueUrl: string, message: Message): Promise<void> {
        try {
            await this.sqs.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: message.ReceiptHandle }))
        } catch (error) {
            this.logger.error('Ack failed, message will be redelivered', {
                sqsMessageId: message.MessageId,
                error: describeError(error),
            })
        }
    }

    private async deadLetter(queueUrl: string, message: Message, error: unknown): Promise<void> {
        const { name, code, message: reason } = describeError(error)
        const failureCode = String(code ?? name ?? 'Unknown')
        metrics.deadLetters.inc({ reason: failureCode })

        await this.sqs.send(
            new SendMessageCommand({
                QueueUrl: await this.queueUrls.get(env.aws.queues.wagerTransactionsDlq),
                MessageBody: message.Body ?? '',
                MessageGroupId: message.Attributes?.MessageGroupId ?? 'dead-letter',
                MessageDeduplicationId: message.MessageId,
                MessageAttributes: {
                    failureCode: { DataType: 'String', StringValue: failureCode },
                    reason: { DataType: 'String', StringValue: reason.slice(0, 1000) },
                    sourceMessageId: { DataType: 'String', StringValue: message.MessageId as string },
                },
            }),
        )
        await this.ack(queueUrl, message)
    }

    private async release(queueUrl: string, messages: Message[], delaySeconds: number): Promise<void> {
        await Promise.all(messages.map((message) => this.changeVisibility(queueUrl, message, delaySeconds)))
    }

    private async changeVisibility(queueUrl: string, message: Message, delaySeconds: number): Promise<void> {
        try {
            await this.sqs.send(
                new ChangeMessageVisibilityCommand({
                    QueueUrl: queueUrl,
                    ReceiptHandle: message.ReceiptHandle,
                    VisibilityTimeout: delaySeconds,
                }),
            )
        } catch (error) {
            this.logger.error('Visibility change failed', {
                sqsMessageId: message.MessageId,
                error: describeError(error),
            })
        }
    }
}
