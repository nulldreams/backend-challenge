import { ReferenceWorkerModule } from '@apps/reference-worker'
import { ResolvePendingReferencesUseCase } from '@application/use-cases'
import type { INestApplicationContext } from '@nestjs/common'
import {
    apiClient,
    expectLedgerConsistent,
    type RunningApi,
    startApi,
    startContext,
    testDatabase,
    waitFor,
} from '@tests/support'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

let api: RunningApi
let worker: INestApplicationContext

beforeAll(async () => {
    api = await startApi()
    worker = await startContext(ReferenceWorkerModule)
})

afterAll(async () => {
    await worker.close()
    await api.close()
})

const readStatus = async (externalTransactionId: string): Promise<string | undefined> =>
    (
        await testDatabase`
            SELECT status FROM wager_transactions WHERE external_transaction_id = ${externalTransactionId}`
    )[0]?.status

describe('reversal delivered before its reference', () => {
    test('REFUND before the BET and ROLLBACK before the WIN wait and resolve once the reference arrives', async () => {
        const client = apiClient(api.url)
        const wallet = await client.createWallet('100.00')
        const [bet, refund, win, rollback] = [
            Bun.randomUUIDv7(),
            Bun.randomUUIDv7(),
            Bun.randomUUIDv7(),
            Bun.randomUUIDv7(),
        ]

        const early = await Promise.all([
            client.submit(wallet, {
                kind: 'REFUND',
                amount: '10.00',
                externalTransactionId: refund,
                referenceExternalTransactionId: bet,
            }),
            client.submit(wallet, {
                kind: 'ROLLBACK',
                amount: '5.00',
                externalTransactionId: rollback,
                referenceExternalTransactionId: win,
            }),
        ])
        expect(early.map(({ status, body }) => [status, body.status])).toEqual([
            [202, 'PENDING_REFERENCE'],
            [202, 'PENDING_REFERENCE'],
        ])

        await Promise.all([
            client.submit(wallet, { kind: 'BET', amount: '10.00', externalTransactionId: bet }),
            client.submit(wallet, { kind: 'WIN', amount: '5.00', externalTransactionId: win }),
        ])

        const resolvePendingReferences = worker.get(ResolvePendingReferencesUseCase)
        await waitFor(
            async () => {
                await resolvePendingReferences.execute()
                return (await readStatus(refund)) === 'PROCESSED' && (await readStatus(rollback)) === 'PROCESSED'
            },
            { description: 'reversals resolved' },
        )

        const [walletRow] = await testDatabase`
            SELECT balance::text AS balance, version FROM wallets WHERE id = ${wallet.walletId}`
        expect(walletRow).toEqual({ balance: '100.00', version: 5 })

        const [link] = await testDatabase`
            SELECT reference.external_transaction_id AS reference
              FROM wager_transactions transaction
              JOIN wager_transactions reference ON reference.id = transaction.reference_transaction_id
             WHERE transaction.external_transaction_id = ${refund}`
        expect(link.reference).toBe(bet)

        const replay = await client.submit(wallet, {
            kind: 'REFUND',
            amount: '10.00',
            externalTransactionId: refund,
            referenceExternalTransactionId: bet,
        })
        expect(replay.body).toMatchObject({ status: 'PROCESSED', idempotentReplay: true })
        await expectLedgerConsistent([wallet.walletId])
    })
})
