import { OutboxPublisherModule } from '@apps/outbox-publisher'
import { PublishOutboxBatchUseCase } from '@application/use-cases'
import type { INestApplicationContext } from '@nestjs/common'
import {
    apiClient,
    drainQueue,
    type RunningApi,
    startApi,
    startContext,
    testDatabase,
    testQueues,
} from '@tests/support'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

const BETS = 100

let api: RunningApi
const publishers: INestApplicationContext[] = []

beforeAll(async () => {
    api = await startApi()
    publishers.push(await startContext(OutboxPublisherModule), await startContext(OutboxPublisherModule))
    await drainQueue(await testQueues.events())
})

afterAll(async () => {
    await Promise.all(publishers.map((publisher) => publisher.close()))
    await api.close()
})

const countPendingOutbox = async (): Promise<number> =>
    (await testDatabase`SELECT count(*)::int AS pending FROM outbox_messages WHERE published_at IS NULL`)[0].pending

const publishUntilEmpty = async (publisher: INestApplicationContext): Promise<number> => {
    const publishOutboxBatch = publisher.get(PublishOutboxBatchUseCase)
    let claimed = 0

    for (
        let batch = await publishOutboxBatch.execute();
        batch.claimed > 0;
        batch = await publishOutboxBatch.execute()
    ) {
        claimed += batch.claimed
    }

    return claimed
}

describe('two publishers over the same outbox', () => {
    test('each event is claimed and published by exactly one publisher', async () => {
        const client = apiClient(api.url)
        const wallet = await client.createWallet('10000.00')
        await Promise.all(Array.from({ length: BETS }, () => client.submit(wallet, { amount: '1.00' })))
        const pending = await countPendingOutbox()
        expect(pending).toBeGreaterThanOrEqual(2 + BETS * 2)

        const claims = await Promise.all(publishers.map(publishUntilEmpty))

        expect(claims.reduce((total, claimed) => total + claimed, 0)).toBe(pending)
        expect(claims.every((claimed) => claimed > 0)).toBe(true)
        expect(await countPendingOutbox()).toBe(0)

        const published = await drainQueue(await testQueues.events())
        const eventIds = published.map((message) => JSON.parse(message.Body ?? '{}').eventId as string)
        expect(eventIds).toHaveLength(pending)
        expect(new Set(eventIds).size).toBe(pending)
    }, 60_000)
})
