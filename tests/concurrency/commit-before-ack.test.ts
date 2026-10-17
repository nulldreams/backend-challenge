import { ConsumerModule, WagerTransactionConsumer } from '@apps/consumer'
import { DeleteMessageCommand, SQSClient } from '@aws-sdk/client-sqs'
import type { INestApplicationContext } from '@nestjs/common'
import {
    apiClient,
    buildWagerMessage,
    countQueueMessages,
    expectLedgerConsistent,
    readTransactionEffects,
    type RunningApi,
    sendWagerMessage,
    startApi,
    startContext,
    testQueues,
    waitFor,
} from '@tests/support'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

let api: RunningApi
let dyingConsumer: INestApplicationContext
let healthyConsumer: INestApplicationContext

function failEveryAck(context: INestApplicationContext): void {
    const sqs = context.get(SQSClient)
    const send = sqs.send.bind(sqs) as (...args: unknown[]) => Promise<unknown>

    sqs.send = ((command: unknown, ...rest: unknown[]) =>
        command instanceof DeleteMessageCommand
            ? Promise.reject(new Error('process died before ack'))
            : send(command, ...rest)) as typeof sqs.send
}

beforeAll(async () => {
    api = await startApi()
    dyingConsumer = await startContext(ConsumerModule)
    healthyConsumer = await startContext(ConsumerModule)
    failEveryAck(dyingConsumer)
})

afterAll(async () => {
    await Promise.all([dyingConsumer.close(), healthyConsumer.close()])
    await api.close()
})

describe('worker dies after the commit and before the ack', () => {
    test('the message comes back, the inbox recognizes it and the effect happens once', async () => {
        const wallet = await apiClient(api.url).createWallet('100.00')
        const message = buildWagerMessage(wallet, { money: { amount: '25.00', currency: 'BRL' } })
        await sendWagerMessage(message)

        await dyingConsumer.get(WagerTransactionConsumer).runOnce()

        expect(
            await readTransactionEffects(wallet.walletId, message.data.idempotencyKey, message.messageId),
        ).toMatchObject({
            balance: '75.00',
            transactions: 1,
            inbox: 1,
        })
        expect(await countQueueMessages(await testQueues.main())).toBe(1)

        const consumer = healthyConsumer.get(WagerTransactionConsumer)
        await waitFor(
            async () => {
                await consumer.runOnce()
                return (await countQueueMessages(await testQueues.main())) === 0
            },
            { intervalMs: 0, description: 'redelivery recognized and acknowledged' },
        )

        expect(await readTransactionEffects(wallet.walletId, message.data.idempotencyKey, message.messageId)).toEqual({
            balance: '75.00',
            version: 2,
            transactions: 1,
            ledger: 1,
            inbox: 1,
            outbox: 2,
        })
        await expectLedgerConsistent([wallet.walletId])
    })
})
