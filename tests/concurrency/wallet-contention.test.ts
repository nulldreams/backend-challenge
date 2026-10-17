import {
    apiClient,
    expectLedgerConsistent,
    holdWalletLock,
    type RunningApi,
    startApi,
    testDatabase,
} from '@tests/support'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

const PARALLEL_SUBMISSIONS = 50
const WALLETS = 10
const BETS_PER_WALLET = 20

let api: RunningApi
const client = () => apiClient(api.url)

beforeAll(async () => {
    api = await startApi()
})

afterAll(async () => {
    await api.close()
})

const countDebits = async (walletId: string): Promise<number> =>
    (
        await testDatabase`
            SELECT count(*)::int AS count FROM wallet_ledger_entries
             WHERE wallet_id = ${walletId} AND direction = 'DEBIT'`
    )[0].count

const readBalance = async (walletId: string): Promise<string> =>
    (await testDatabase`SELECT balance::text AS balance FROM wallets WHERE id = ${walletId}`)[0].balance

describe(`the same bet sent ${PARALLEL_SUBMISSIONS} times in parallel`, () => {
    test('debits once and every other response is a replay of the same transaction', async () => {
        const wallet = await client().createWallet('100.00')
        const externalTransactionId = Bun.randomUUIDv7()

        const responses = await Promise.all(
            Array.from({ length: PARALLEL_SUBMISSIONS }, () =>
                client().submit(wallet, { amount: '10.00', externalTransactionId }),
            ),
        )

        expect(new Set(responses.map(({ status }) => status))).toEqual(new Set([200]))
        expect(new Set(responses.map(({ body }) => body.transactionId)).size).toBe(1)
        expect(responses.filter(({ body }) => !body.idempotentReplay)).toHaveLength(1)
        expect(new Set(responses.map(({ body }) => body.balance.amount))).toEqual(new Set(['90.00']))
        expect(await countDebits(wallet.walletId)).toBe(1)
        await expectLedgerConsistent([wallet.walletId])
    })
})

describe('two concurrent bets competing for the same balance', () => {
    test('balance 100 and two bets of 80: one PROCESSED, one REJECTED, balance 20 and a single debit', async () => {
        const wallet = await client().createWallet('100.00')
        const bets = [Bun.randomUUIDv7(), Bun.randomUUIDv7()]
        const submitBoth = () =>
            Promise.all(
                bets.map((externalTransactionId) =>
                    client().submit(wallet, { amount: '80.00', externalTransactionId }),
                ),
            )

        const responses = await submitBoth()

        expect(responses.map(({ body }) => body.status).sort()).toEqual(['PROCESSED', 'REJECTED'])
        expect(responses.find(({ body }) => body.status === 'REJECTED')?.body.failureCode).toBe('INSUFFICIENT_FUNDS')
        expect(await readBalance(wallet.walletId)).toBe('20.00')
        expect(await countDebits(wallet.walletId)).toBe(1)

        const retries = await submitBoth()

        expect(retries.every(({ body }) => body.idempotentReplay)).toBe(true)
        expect(await readBalance(wallet.walletId)).toBe('20.00')
        expect(await countDebits(wallet.walletId)).toBe(1)
        await expectLedgerConsistent([wallet.walletId])
    })
})

describe('different wallets in parallel', () => {
    test(`${WALLETS} wallets with ${BETS_PER_WALLET} bets each, all mixed: every wallet ends correct`, async () => {
        const wallets = await Promise.all(Array.from({ length: WALLETS }, () => client().createWallet('100.00')))

        const responses = await Promise.all(
            Array.from({ length: WALLETS * BETS_PER_WALLET }, (_, index) =>
                client().submit(wallets[index % WALLETS]!, { amount: '1.00' }),
            ),
        )

        expect(responses.every(({ status }) => status === 200)).toBe(true)

        for (const wallet of wallets) expect(await readBalance(wallet.walletId)).toBe('80.00')

        await expectLedgerConsistent(wallets.map(({ walletId }) => walletId))
    })

    test('the lock is per wallet: a locked wallet does not block the others', async () => {
        const [locked, free] = await Promise.all([client().createWallet('100.00'), client().createWallet('100.00')])
        const releaseLock = await holdWalletLock(locked.walletId)

        try {
            const blocked = client().submit(locked, { amount: '1.00' })
            const startedAt = performance.now()
            const response = await client().submit(free, { amount: '1.00' })

            expect(response.status).toBe(200)
            expect(performance.now() - startedAt).toBeLessThan(1_000)
            expect(await blocked).toMatchObject({ status: 503, body: { code: 'SERVICE_UNAVAILABLE' } })
        } finally {
            await releaseLock()
        }

        expect(await readBalance(locked.walletId)).toBe('100.00')
        await expectLedgerConsistent([locked.walletId, free.walletId])
    })
})
