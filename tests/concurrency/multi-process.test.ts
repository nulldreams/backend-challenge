import {
    apiClient,
    type AppProcess,
    buildWagerMessage,
    countLogLines,
    countQueueMessages,
    expectLedgerConsistent,
    killHard,
    type RunningApi,
    sendWagerMessage,
    spawnApp,
    startApi,
    testDatabase,
    testQueues,
    type WagerMessage,
    type WalletUnderTest,
    waitFor,
    type WorkerApp,
} from '@tests/support'
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'

const WALLETS = 10
const CHAOS_BATCH = 50
const CHAOS_MESSAGES = 450
const TOTAL_MESSAGES = 600

interface Workload {
    wallets: WalletUnderTest[]
    providerId: string
    messages: WagerMessage[]
}

let api: RunningApi
let running: AppProcess[] = []

beforeAll(async () => {
    api = await startApi()
})

afterEach(async () => {
    await Promise.all(running.map(killHard))
    running = []
})

afterAll(async () => {
    await api.close()
})

function spawn(app: WorkerApp, count = 1): AppProcess[] {
    const started = Array.from({ length: count }, () => spawnApp(app))
    running.push(...started)
    return started
}

async function prepareWorkload(count: number): Promise<Workload> {
    const client = apiClient(api.url)
    const wallets = await Promise.all(Array.from({ length: WALLETS }, () => client.createWallet('100.00')))
    const providerId = `provider-${Bun.randomUUIDv7()}`
    const messages = Array.from({ length: count }, (_, index) =>
        buildWagerMessage(wallets[index % WALLETS]!, { providerId, money: { amount: '1.00', currency: 'BRL' } }),
    )

    return { wallets, providerId, messages }
}

const sendTwice = (messages: WagerMessage[]) =>
    Promise.all(messages.flatMap((message) => [sendWagerMessage(message), sendWagerMessage(message)]))

const countProcessed = async (providerId: string): Promise<number> =>
    (await testDatabase`SELECT count(*)::int AS count FROM wager_transactions WHERE provider_id = ${providerId}`)[0]
        .count

const isQueueDrained = async (providerId: string, expected: number): Promise<boolean> =>
    (await countProcessed(providerId)) === expected && (await countQueueMessages(await testQueues.main())) === 0

async function expectFinalConsistency({ wallets, providerId, messages }: Workload): Promise<void> {
    const [totals] = await testDatabase`
        SELECT count(*)::int AS transactions,
               count(DISTINCT idempotency_key)::int AS keys,
               count(*) FILTER (WHERE status = 'PROCESSED')::int AS processed
          FROM wager_transactions WHERE provider_id = ${providerId}`
    expect(totals).toEqual({ transactions: messages.length, keys: messages.length, processed: messages.length })

    const messageIds = messages.map(({ messageId }) => messageId)
    const [{ inbox }] = await testDatabase`
        SELECT count(*)::int AS inbox FROM inbox_messages WHERE message_id IN ${testDatabase(messageIds)}`
    expect(inbox).toBe(messages.length)

    const walletIds = wallets.map(({ walletId }) => walletId)
    const expectedBalance = (100 - messages.length / WALLETS).toFixed(2)
    const balances = await testDatabase`
        SELECT balance::text AS balance FROM wallets WHERE id IN ${testDatabase(walletIds)}`
    expect(new Set(balances.map(({ balance }: { balance: string }) => balance))).toEqual(new Set([expectedBalance]))
    await expectLedgerConsistent(walletIds)
}

describe('real processes', () => {
    test('three consumers at once split the work without duplicating effects', async () => {
        const workload = await prepareWorkload(150)
        await sendTwice(workload.messages)
        const consumers = spawn('consumer', 3)

        await waitFor(() => isQueueDrained(workload.providerId, 150), {
            timeoutMs: 90_000,
            intervalMs: 500,
            description: 'every message processed',
        })

        await expectFinalConsistency(workload)
        expect(consumers.every((consumer) => countLogLines(consumer, 'Message processed') > 0)).toBe(true)
    }, 120_000)

    test('random SIGKILL during the load, then everything killed and restarted: final consistency', async () => {
        const workload = await prepareWorkload(TOTAL_MESSAGES)
        spawn('consumer', 3)
        spawn('outbox-publisher', 2)

        let kills = 0

        for (let start = 0; start < CHAOS_MESSAGES; start += CHAOS_BATCH) {
            await sendTwice(workload.messages.slice(start, start + CHAOS_BATCH))
            await Bun.sleep(300)

            const working = running.filter(
                (process) => process.app === 'consumer' && countLogLines(process, 'Message processed') > 0,
            )
            const victim = working[Math.floor(Math.random() * working.length)]

            if (!victim) continue

            await killHard(victim)
            running = running.filter((process) => process !== victim)
            spawn('consumer')
            kills++
        }

        expect(kills).toBeGreaterThanOrEqual(6)

        await sendTwice(workload.messages.slice(CHAOS_MESSAGES))
        await Promise.all(running.map(killHard))
        running = []

        expect(await countProcessed(workload.providerId)).toBeLessThan(TOTAL_MESSAGES)
        await expectLedgerConsistent(workload.wallets.map(({ walletId }) => walletId))

        spawn('consumer', 3)
        spawn('outbox-publisher', 2)
        await waitFor(() => isQueueDrained(workload.providerId, TOTAL_MESSAGES), {
            timeoutMs: 120_000,
            intervalMs: 500,
            description: 'everything processed after the restart',
        })
        await expectFinalConsistency(workload)

        await waitFor(
            async () =>
                (
                    await testDatabase`
                        SELECT count(*)::int AS count FROM outbox_messages outbox
                          JOIN wager_transactions transaction
                            ON outbox.payload->'data'->>'transactionId' = transaction.id::text
                         WHERE transaction.provider_id = ${workload.providerId} AND outbox.published_at IS NULL`
                )[0].count === 0,
            { timeoutMs: 60_000, intervalMs: 500, description: 'outbox published' },
        )
    }, 300_000)
})
