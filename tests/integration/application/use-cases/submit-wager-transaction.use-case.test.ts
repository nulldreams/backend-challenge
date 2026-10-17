import { WagerTransactionProcessor } from '@application/processing'
import { OpenWalletUseCase, SubmitWagerTransactionUseCase } from '@application/use-cases'
import { FailureCode, IdempotencyConflictError } from '@domain/errors'
import { WagerTransactionKind, WagerTransactionStatus } from '@domain/wager-transaction'
import { MikroOrmTransactionManager, mikroOrmConfig } from '@infra/database'
import {
    MikroOrmInboxMessageRepository,
    MikroOrmOutboxMessageRepository,
    MikroOrmWagerTransactionRepository,
    MikroOrmWalletLedgerEntryRepository,
    MikroOrmWalletRepository,
} from '@infra/repositories'
import { MikroORM } from '@mikro-orm/postgresql'
import { captureRejection, testDatabase } from '@tests/support'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import {
    type LedgerConsistency,
    PARALLEL_SUBMISSIONS,
    type WagerFields,
    type WalletUnderTest,
} from './submit-wager-transaction.data-provider'

let orm: MikroORM
let openWalletUseCase: OpenWalletUseCase
let submitWagerTransactionUseCase: SubmitWagerTransactionUseCase

async function openWallet(initialBalance: string): Promise<WalletUnderTest> {
    const wallet = await openWalletUseCase.execute({
        playerId: Bun.randomUUIDv7(),
        initialBalance: { amount: initialBalance, currency: 'BRL' },
        context: { correlationId: Bun.randomUUIDv7() },
    })
    return { walletId: wallet.id, playerId: wallet.playerId }
}

function submit({ walletId, playerId }: WalletUnderTest, fields: WagerFields = {}, idempotencyKey?: string) {
    const externalTransactionId = fields.externalTransactionId ?? Bun.randomUUIDv7()
    return submitWagerTransactionUseCase.execute({
        idempotencyKey: idempotencyKey ?? `provider-a:${externalTransactionId}`,
        payload: {
            providerId: 'provider-a',
            externalTransactionId,
            playerId,
            walletId,
            roundId: 'round-1',
            gameId: 'game-1',
            kind: fields.kind ?? WagerTransactionKind.Bet,
            money: { amount: fields.amount ?? '25.00', currency: 'BRL' },
            referenceExternalTransactionId: fields.referenceExternalTransactionId,
        },
        context: { correlationId: externalTransactionId },
    })
}

async function readLedgerConsistency(walletId: string): Promise<LedgerConsistency> {
    const [consistency] = await testDatabase`
        SELECT wallet.balance::text AS "storedBalance",
               (SELECT balance_after::text FROM wallet_ledger_entries
                 WHERE wallet_id = wallet.id ORDER BY wallet_version DESC LIMIT 1) AS "lastBalanceAfter",
               (SELECT sum(CASE direction WHEN 'CREDIT' THEN amount ELSE -amount END)::text
                  FROM wallet_ledger_entries WHERE wallet_id = wallet.id) AS "ledgerSum"
          FROM wallets wallet WHERE wallet.id = ${walletId}`
    return consistency
}

async function countDebits(walletId: string): Promise<number> {
    const [{ debits }] = await testDatabase`
        SELECT count(*)::int AS debits FROM wallet_ledger_entries WHERE wallet_id = ${walletId} AND direction = 'DEBIT'`
    return debits
}

beforeAll(async () => {
    orm = await MikroORM.init(mikroOrmConfig)
    const transactionManager = new MikroOrmTransactionManager(orm.em)
    const walletRepository = new MikroOrmWalletRepository(orm.em)
    const wagerTransactionRepository = new MikroOrmWagerTransactionRepository(orm.em)
    const walletLedgerEntryRepository = new MikroOrmWalletLedgerEntryRepository(orm.em)
    const outboxMessageRepository = new MikroOrmOutboxMessageRepository(orm.em)

    openWalletUseCase = new OpenWalletUseCase(
        transactionManager,
        walletRepository,
        wagerTransactionRepository,
        walletLedgerEntryRepository,
        outboxMessageRepository,
    )
    submitWagerTransactionUseCase = new SubmitWagerTransactionUseCase(
        transactionManager,
        walletRepository,
        wagerTransactionRepository,
        new MikroOrmInboxMessageRepository(orm.em),
        new WagerTransactionProcessor(
            walletRepository,
            walletLedgerEntryRepository,
            wagerTransactionRepository,
            outboxMessageRepository,
        ),
    )
})

afterAll(async () => {
    await orm.close()
})

describe('SubmitWagerTransactionUseCase', () => {
    test('two concurrent bets of 80.00 on 100.00: one PROCESSED, one REJECTED, balance 20.00', async () => {
        const wallet = await openWallet('100.00')

        const results = await Promise.all([submit(wallet, { amount: '80.00' }), submit(wallet, { amount: '80.00' })])

        const statuses = results.map(({ transaction }) => transaction.status).sort()
        expect(statuses).toEqual([WagerTransactionStatus.Processed, WagerTransactionStatus.Rejected])
        expect(results.find(({ transaction }) => transaction.failureCode)?.transaction.failureCode).toBe(
            FailureCode.InsufficientFunds,
        )
        expect(await countDebits(wallet.walletId)).toBe(1)
        expect(await readLedgerConsistency(wallet.walletId)).toEqual({
            storedBalance: '20.00',
            lastBalanceAfter: '20.00',
            ledgerSum: '20.00',
        })
    })

    test(`the same bet sent ${PARALLEL_SUBMISSIONS} times in parallel debits once`, async () => {
        const wallet = await openWallet('100.00')
        const externalTransactionId = Bun.randomUUIDv7()

        const results = await Promise.all(
            Array.from({ length: PARALLEL_SUBMISSIONS }, () => submit(wallet, { externalTransactionId })),
        )

        expect(new Set(results.map(({ transaction }) => transaction.id)).size).toBe(1)
        expect(results.filter(({ idempotentReplay }) => !idempotentReplay)).toHaveLength(1)
        expect(await countDebits(wallet.walletId)).toBe(1)
        expect(await readLedgerConsistency(wallet.walletId)).toEqual({
            storedBalance: '75.00',
            lastBalanceAfter: '75.00',
            ledgerSum: '75.00',
        })
    })

    test('a replay returns the original result, including the balance observed back then', async () => {
        const wallet = await openWallet('100.00')
        const bet = { externalTransactionId: Bun.randomUUIDv7() }
        await submit(wallet, bet)
        await submit(wallet, { kind: WagerTransactionKind.Win, amount: '10.00' })

        const replay = await submit(wallet, bet)

        expect(replay.idempotentReplay).toBe(true)
        expect(replay.transaction.observedBalance?.toJSON().amount).toBe('75.00')
    })

    test('the same idempotency key with a different payload is a conflict, not a replay', async () => {
        const wallet = await openWallet('100.00')
        await submit(wallet, { amount: '25.00' }, 'key-conflict')

        const rejection = await captureRejection(submit(wallet, { amount: '30.00' }, 'key-conflict'))

        expect(rejection).toBeInstanceOf(IdempotencyConflictError)
        expect(await countDebits(wallet.walletId)).toBe(1)
    })

    test('a REFUND that arrives before its BET waits as PENDING_REFERENCE without moving the balance', async () => {
        const wallet = await openWallet('100.00')

        const { transaction } = await submit(wallet, {
            kind: WagerTransactionKind.Refund,
            referenceExternalTransactionId: 'bet-not-received-yet',
        })

        expect(transaction.status).toBe(WagerTransactionStatus.PendingReference)
        expect((await readLedgerConsistency(wallet.walletId)).storedBalance).toBe('100.00')
    })

    test('a BET is refunded only once', async () => {
        const wallet = await openWallet('100.00')
        const bet = { externalTransactionId: Bun.randomUUIDv7() }
        await submit(wallet, bet)
        const refund = { kind: WagerTransactionKind.Refund, referenceExternalTransactionId: bet.externalTransactionId }

        const first = await submit(wallet, refund)
        const second = await submit(wallet, refund)

        expect(first.transaction.status).toBe(WagerTransactionStatus.Processed)
        expect(second.transaction.failureCode).toBe(FailureCode.AlreadyReversed)
        expect(await readLedgerConsistency(wallet.walletId)).toEqual({
            storedBalance: '100.00',
            lastBalanceAfter: '100.00',
            ledgerSum: '100.00',
        })
    })
})
