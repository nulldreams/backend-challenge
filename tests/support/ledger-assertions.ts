import { expect } from 'bun:test'
import { testDatabase } from './test-database'

export interface TransactionEffects {
    balance: string
    version: number
    transactions: number
    ledger: number
    inbox: number
    outbox: number
}

export async function expectLedgerConsistent(walletIds: string[]): Promise<void> {
    const rows = await testDatabase`
        SELECT wallet.id,
               wallet.balance::text AS stored,
               coalesce(sum(CASE entry.direction WHEN 'CREDIT' THEN entry.amount ELSE -entry.amount END), 0)
                   ::numeric(18,2)::text AS calculated,
               count(entry.id)::int AS entries,
               coalesce(max(entry.wallet_version), 0)::int AS "lastVersion"
          FROM wallets wallet
          LEFT JOIN wallet_ledger_entries entry ON entry.wallet_id = wallet.id
         WHERE wallet.id IN ${testDatabase(walletIds)}
         GROUP BY wallet.id, wallet.balance`

    expect(rows).toHaveLength(walletIds.length)

    for (const row of rows) {
        expect({ wallet: row.id, balance: row.stored }).toEqual({ wallet: row.id, balance: row.calculated })
        expect({ wallet: row.id, lastVersion: row.lastVersion }).toEqual({ wallet: row.id, lastVersion: row.entries })
    }
}

export async function readTransactionEffects(
    walletId: string,
    idempotencyKey: string,
    messageId = '',
): Promise<TransactionEffects> {
    const [effects] = await testDatabase`
        SELECT (SELECT balance::text FROM wallets WHERE id = ${walletId}) AS balance,
               (SELECT version FROM wallets WHERE id = ${walletId}) AS version,
               (SELECT count(*)::int FROM wager_transactions WHERE idempotency_key = ${idempotencyKey}) AS transactions,
               (SELECT count(*)::int FROM wallet_ledger_entries entry
                  JOIN wager_transactions transaction ON transaction.id = entry.transaction_id
                 WHERE transaction.idempotency_key = ${idempotencyKey}) AS ledger,
               (SELECT count(*)::int FROM inbox_messages WHERE message_id = ${messageId}) AS inbox,
               (SELECT count(*)::int FROM outbox_messages outbox
                  JOIN wager_transactions transaction ON outbox.payload->'data'->>'transactionId' = transaction.id::text
                 WHERE transaction.idempotency_key = ${idempotencyKey}) AS outbox`

    return effects
}

export async function holdWalletLock(walletId: string): Promise<() => Promise<void>> {
    const connection = await testDatabase.reserve()
    await connection`BEGIN`
    await connection`SELECT id FROM wallets WHERE id = ${walletId} FOR UPDATE`

    return async () => {
        await connection`ROLLBACK`
        connection.release()
    }
}
