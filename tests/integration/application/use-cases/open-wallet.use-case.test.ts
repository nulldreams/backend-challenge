import { WalletLedgerEntryRepository } from '@application/repositories'
import { OpenWalletUseCase } from '@application/use-cases'
import { WalletAlreadyExistsError } from '@domain/errors'
import { WalletLedgerEntry } from '@domain/ledger-entry'
import { MikroOrmTransactionManager, mikroOrmConfig } from '@infra/database'
import {
    MikroOrmOutboxMessageRepository,
    MikroOrmWagerTransactionRepository,
    MikroOrmWalletLedgerEntryRepository,
    MikroOrmWalletRepository,
} from '@infra/repositories'
import { MikroORM } from '@mikro-orm/postgresql'
import { captureRejection, testDatabase } from '@tests/support'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { PARALLEL_OPENINGS, type PlayerRowCounts, walletOpenings } from './open-wallet.data-provider'

class FailingWalletLedgerEntryRepository extends MikroOrmWalletLedgerEntryRepository {
    override listByWallet(walletId: string, afterVersion: number, limit: number): Promise<WalletLedgerEntry[]> {
        throw new Error('Method not implemented.')
    }

    override append(): Promise<void> {
        throw new Error('Ledger unavailable')
    }
}

let orm: MikroORM
const context = { correlationId: 'open-wallet-test' }

function createOpenWalletUseCase(
    walletLedgerEntryRepository: WalletLedgerEntryRepository = new MikroOrmWalletLedgerEntryRepository(orm.em),
): OpenWalletUseCase {
    return new OpenWalletUseCase(
        new MikroOrmTransactionManager(orm.em),
        new MikroOrmWalletRepository(orm.em),
        new MikroOrmWagerTransactionRepository(orm.em),
        walletLedgerEntryRepository,
        new MikroOrmOutboxMessageRepository(orm.em),
    )
}

async function countPlayerRows(playerId: string): Promise<PlayerRowCounts> {
    const [counts] = await testDatabase`
        SELECT (SELECT count(*)::int FROM wallets WHERE player_id = ${playerId}) AS wallets,
               (SELECT count(*)::int FROM wager_transactions WHERE player_id = ${playerId}) AS transactions,
               (SELECT count(*)::int FROM wallet_ledger_entries entry
                  JOIN wallets wallet ON wallet.id = entry.wallet_id
                 WHERE wallet.player_id = ${playerId}) AS entries`
    return counts
}

beforeAll(async () => {
    orm = await MikroORM.init(mikroOrmConfig)
})

afterAll(async () => {
    await orm.close()
})

describe('OpenWalletUseCase', () => {
    test.each(walletOpenings)('$description', async ({ initialBalance, expectedRows }) => {
        const playerId = Bun.randomUUIDv7()

        const wallet = await createOpenWalletUseCase().execute({
            playerId,
            initialBalance: { amount: initialBalance, currency: 'BRL' },
            context,
        })

        expect(wallet.balance.toJSON().amount).toBe(initialBalance)
        expect(await countPlayerRows(playerId)).toEqual(expectedRows)
    })

    test('rejects a second wallet for the same player and currency without writing anything', async () => {
        const playerId = Bun.randomUUIDv7()
        const openWallet = createOpenWalletUseCase()
        const input = { playerId, initialBalance: { amount: '10.00', currency: 'BRL' }, context }
        await openWallet.execute(input)

        expect(await captureRejection(openWallet.execute(input))).toBeInstanceOf(WalletAlreadyExistsError)
        expect(await countPlayerRows(playerId)).toEqual({ wallets: 1, transactions: 1, entries: 1 })
    })

    test('rolls back the wallet and the OPENING when the ledger entry fails', async () => {
        const playerId = Bun.randomUUIDv7()
        const openWallet = createOpenWalletUseCase(new FailingWalletLedgerEntryRepository(orm.em))

        const rejection = await captureRejection(
            openWallet.execute({ playerId, initialBalance: { amount: '10.00', currency: 'BRL' }, context }),
        )

        expect(rejection).toEqual(new Error('Ledger unavailable'))
        expect(await countPlayerRows(playerId)).toEqual({ wallets: 0, transactions: 0, entries: 0 })
    })

    test(`opens exactly one wallet out of ${PARALLEL_OPENINGS} parallel requests for the same player`, async () => {
        const playerId = Bun.randomUUIDv7()
        const openWallet = createOpenWalletUseCase()
        const input = { playerId, initialBalance: { amount: '10.00', currency: 'BRL' }, context }

        const results = await Promise.allSettled(
            Array.from({ length: PARALLEL_OPENINGS }, () => openWallet.execute(input)),
        )

        const rejections = results.filter((result) => result.status === 'rejected')
        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
        expect(rejections.every(({ reason }) => reason instanceof WalletAlreadyExistsError)).toBe(true)
        expect(await countPlayerRows(playerId)).toEqual({ wallets: 1, transactions: 1, entries: 1 })
    })
})
