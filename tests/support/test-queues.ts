import {
    CreateQueueCommand,
    DeleteMessageCommand,
    DeleteQueueCommand,
    GetQueueAttributesCommand,
    GetQueueUrlCommand,
    ListQueuesCommand,
    type Message,
    ReceiveMessageCommand,
    SendMessageCommand,
    SQSClient,
} from '@aws-sdk/client-sqs'
import { env } from '@infra/config'

export const testSqs = new SQSClient({ region: env.aws.region, endpoint: env.aws.endpoint })

const VISIBILITY_TIMEOUT_SECONDS = 2
const MAX_RECEIVE_COUNT = 5
const FIFO_ATTRIBUTES = { FifoQueue: 'true', ContentBasedDeduplication: 'false' }
const STALE_TEST_QUEUE = /\/t[0-9a-z]+-wager-[a-z-]+\.fifo$/

const queueUrlOf = async (name: string): Promise<string> =>
    (await testSqs.send(new GetQueueUrlCommand({ QueueName: name }))).QueueUrl as string

export const testQueues = {
    main: () => queueUrlOf(env.aws.queues.wagerTransactions),
    dlq: () => queueUrlOf(env.aws.queues.wagerTransactionsDlq),
    events: () => queueUrlOf(env.aws.queues.wagerEvents),
}

export interface WagerEnvelope {
    messageId: string
    data: Record<string, unknown>
    [field: string]: unknown
}

export interface SendOptions {
    groupId?: string
    rawBody?: string
}

export async function createTestQueues(): Promise<void> {
    await deleteStaleTestQueues()

    const dlqUrl = (
        await testSqs.send(
            new CreateQueueCommand({ QueueName: env.aws.queues.wagerTransactionsDlq, Attributes: FIFO_ATTRIBUTES }),
        )
    ).QueueUrl
    const { Attributes } = await testSqs.send(
        new GetQueueAttributesCommand({ QueueUrl: dlqUrl, AttributeNames: ['QueueArn'] }),
    )
    const redrivePolicy = { deadLetterTargetArn: Attributes?.QueueArn, maxReceiveCount: String(MAX_RECEIVE_COUNT) }

    await testSqs.send(new CreateQueueCommand({ QueueName: env.aws.queues.wagerEvents, Attributes: FIFO_ATTRIBUTES }))
    await testSqs.send(
        new CreateQueueCommand({
            QueueName: env.aws.queues.wagerTransactions,
            Attributes: {
                ...FIFO_ATTRIBUTES,
                VisibilityTimeout: String(VISIBILITY_TIMEOUT_SECONDS),
                RedrivePolicy: JSON.stringify(redrivePolicy),
            },
        }),
    )
}

async function deleteStaleTestQueues(): Promise<void> {
    const { QueueUrls = [] } = await testSqs.send(new ListQueuesCommand({ QueueNamePrefix: 't' }))
    const staleUrls = QueueUrls.filter((url) => STALE_TEST_QUEUE.test(url))

    await Promise.all(staleUrls.map((url) => testSqs.send(new DeleteQueueCommand({ QueueUrl: url }))))
}

export async function deleteTestQueues(): Promise<void> {
    const urls = await Promise.all([testQueues.main(), testQueues.dlq(), testQueues.events()])

    for (const url of urls) await testSqs.send(new DeleteQueueCommand({ QueueUrl: url }))
}

export async function sendWagerMessage(envelope: WagerEnvelope, options: SendOptions = {}): Promise<string> {
    const body =
        options.rawBody ??
        JSON.stringify({ type: 'WagerTransactionRequested', occurredAt: new Date().toISOString(), ...envelope })
    const output = await testSqs.send(
        new SendMessageCommand({
            QueueUrl: await testQueues.main(),
            MessageBody: body,
            MessageGroupId: options.groupId ?? String(envelope.data.walletId ?? 'group'),
            MessageDeduplicationId: Bun.randomUUIDv7(),
        }),
    )

    return output.MessageId as string
}

export async function drainQueue(queueUrl: string, emptyPolls = 2): Promise<Message[]> {
    const messages: Message[] = []

    for (let empty = 0; empty < emptyPolls; ) {
        const { Messages = [] } = await testSqs.send(
            new ReceiveMessageCommand({
                QueueUrl: queueUrl,
                MaxNumberOfMessages: 10,
                WaitTimeSeconds: 1,
                MessageAttributeNames: ['All'],
            }),
        )

        if (Messages.length === 0) {
            empty++
            continue
        }

        empty = 0
        messages.push(...Messages)

        for (const message of Messages) {
            await testSqs.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: message.ReceiptHandle }))
        }
    }

    return messages
}

export async function countQueueMessages(queueUrl: string): Promise<number> {
    const { Attributes } = await testSqs.send(
        new GetQueueAttributesCommand({
            QueueUrl: queueUrl,
            AttributeNames: ['ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible'],
        }),
    )

    return Number(Attributes?.ApproximateNumberOfMessages) + Number(Attributes?.ApproximateNumberOfMessagesNotVisible)
}
