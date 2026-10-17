import { ConsumerModule, WagerTransactionConsumer } from '@apps/consumer'
import type { Message } from '@aws-sdk/client-sqs'
import type { INestApplicationContext } from '@nestjs/common'
import {
    apiClient,
    buildWagerMessage,
    countQueueMessages,
    drainQueue,
    expectLedgerConsistent,
    holdWalletLock,
    readTransactionEffects,
    type RunningApi,
    sendWagerMessage,
    startApi,
    startContext,
    testDatabase,
    testQueues,
    waitFor,
} from '@tests/support'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { deadLetterCases } from './wager-transaction.consumer.data-provider'

let api: RunningApi
let context: INestApplicationContext
let consumer: WagerTransactionConsumer
const deadLetters: Message[] = []

beforeAll(async () => {
    api = await startApi()
    context = await startContext(ConsumerModule)
    consumer = context.get(WagerTransactionConsumer)
})

afterAll(async () => {
    await context.close()
    await api.close()
})

const consumeUntil = <T>(check: () => Promise<T | undefined | false>, description: string, timeoutMs = 30_000) =>
    waitFor(
        async () => {
            await consumer.runOnce()
            return check()
        },
        { timeoutMs, intervalMs: 0, description },
    )

const findDeadLetter = async (matches: (message: Message) => boolean) => {
    deadLetters.push(...(await drainQueue(await testQueues.dlq(), 1)))
    return deadLetters.find(matches)
}

const bodyMessageIdOf = (message: Message): string | undefined => {
    try {
        return JSON.parse(message.Body ?? '').messageId
    } catch {
        return undefined
    }
}

const sourceMessageIdOf = (message: Message) => message.MessageAttributes?.sourceMessageId?.StringValue

describe('inbox and redelivery', () => {
    test('the same message delivered twice has a single effect', async () => {
        const wallet = await apiClient(api.url).createWallet('100.00')
        const message = buildWagerMessage(wallet)
        await sendWagerMessage(message)
        await sendWagerMessage(message)

        await consumeUntil(async () => (await countQueueMessages(await testQueues.main())) === 0, 'empty queue')

        expect(await readTransactionEffects(wallet.walletId, message.data.idempotencyKey, message.messageId)).toEqual({
            balance: '90.00',
            version: 2,
            transactions: 1,
            ledger: 1,
            inbox: 1,
            outbox: 2,
        })
        await expectLedgerConsistent([wallet.walletId])
    })

    test('the same messageId with another payload is not a redelivery: it goes to the DLQ', async () => {
        const wallet = await apiClient(api.url).createWallet('100.00')
        const original = buildWagerMessage(wallet)
        await sendWagerMessage(original)
        await consumeUntil(
            async () =>
                (await readTransactionEffects(wallet.walletId, original.data.idempotencyKey)).transactions === 1,
            'original processed',
        )

        const reused = buildWagerMessage(wallet, { amount: '20.00' }, { messageId: original.messageId })
        const sqsMessageId = await sendWagerMessage(reused)
        const deadLetter = await consumeUntil(
            () => findDeadLetter((message) => sourceMessageIdOf(message) === sqsMessageId),
            'message in the DLQ',
        )

        expect(deadLetter.MessageAttributes?.failureCode?.StringValue).toBe('MESSAGE_ID_CONFLICT')
        expect((await readTransactionEffects(wallet.walletId, reused.data.idempotencyKey)).transactions).toBe(0)
        await expectLedgerConsistent([wallet.walletId])
    })
})

describe('retry and DLQ', () => {
    test.each(deadLetterCases)('straight to the DLQ: $description', async ({ message, expectedFailureCode }) => {
        const wallet = await apiClient(api.url).createWallet('100.00')
        const { envelope, rawBody } = message(wallet)
        const sqsMessageId = await sendWagerMessage(envelope, { rawBody })

        const deadLetter = await consumeUntil(
            () => findDeadLetter((candidate) => sourceMessageIdOf(candidate) === sqsMessageId),
            'message in the DLQ',
        )

        expect(deadLetter.MessageAttributes?.failureCode?.StringValue).toBe(expectedFailureCode)
        expect(deadLetter.Body).toContain(rawBody ?? envelope.messageId)
        expect(
            await testDatabase`
                SELECT count(*)::int AS count FROM wager_transactions
                 WHERE wallet_id = ${wallet.walletId} AND kind <> 'OPENING'`,
        ).toEqual([{ count: 0 }])
    })

    test('a transient error goes back to the queue and is processed once it clears', async () => {
        const wallet = await apiClient(api.url).createWallet('100.00')
        const message = buildWagerMessage(wallet)
        const releaseLock = await holdWalletLock(wallet.walletId)

        await sendWagerMessage(message)
        await consumer.runOnce()
        expect((await readTransactionEffects(wallet.walletId, message.data.idempotencyKey)).transactions).toBe(0)

        await releaseLock()
        await consumeUntil(
            async () => (await readTransactionEffects(wallet.walletId, message.data.idempotencyKey)).transactions === 1,
            'processed',
        )

        expect(
            await readTransactionEffects(wallet.walletId, message.data.idempotencyKey, message.messageId),
        ).toMatchObject({
            balance: '90.00',
            ledger: 1,
            inbox: 1,
        })
        await expectLedgerConsistent([wallet.walletId])
    })

    test('a transient error that never clears reaches the DLQ by redrive after 5 receives', async () => {
        const wallet = await apiClient(api.url).createWallet('100.00')
        const message = buildWagerMessage(wallet)
        const releaseLock = await holdWalletLock(wallet.walletId)

        try {
            await sendWagerMessage(message)
            const deadLetter = await consumeUntil(
                () => findDeadLetter((candidate) => bodyMessageIdOf(candidate) === message.messageId),
                'redrive to the DLQ',
                60_000,
            )

            expect(deadLetter.MessageAttributes?.failureCode).toBeUndefined()
        } finally {
            await releaseLock()
        }

        expect((await readTransactionEffects(wallet.walletId, message.data.idempotencyKey)).transactions).toBe(0)
        await expectLedgerConsistent([wallet.walletId])
    }, 90_000)
})
