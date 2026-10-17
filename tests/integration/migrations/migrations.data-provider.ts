export interface ConstraintFixture {
    walletId: string
    playerId: string
    openingId: string
    betId: string
}

interface ConstraintViolationCase {
    description: string
    buildSql: (fixture: ConstraintFixture) => string
    expectedError: string
}

interface TransactionFields {
    id?: string
    idempotencyKey?: string
    externalTransactionId?: string
    kind?: string
}

interface LedgerEntryFields {
    transactionId: string
    walletVersion: number
    currency?: string
    balanceAfter?: number
}

const newId = () => Bun.randomUUIDv7()

export const buildInsertTransactionSql = (fixture: ConstraintFixture, fields: TransactionFields = {}) => `
    INSERT INTO wager_transactions
        (id, provider_id, external_transaction_id, idempotency_key, payload_hash, wallet_id, player_id,
         round_id, game_id, kind, amount, currency, status, created_at, processed_at)
    VALUES
        ('${fields.id ?? newId()}', 'provider-a', '${fields.externalTransactionId ?? newId()}', '${fields.idempotencyKey ?? newId()}',
         repeat('a', 64), '${fixture.walletId}', '${fixture.playerId}', 'round-1', 'game-1', '${fields.kind ?? 'BET'}',
         10, 'BRL', 'PROCESSED', now(), now())`

export const buildInsertLedgerEntrySql = (fixture: ConstraintFixture, fields: LedgerEntryFields) => `
    INSERT INTO wallet_ledger_entries
        (id, wallet_id, transaction_id, wallet_version, direction, amount, currency, balance_before, balance_after, created_at)
    VALUES
        ('${newId()}', '${fixture.walletId}', '${fields.transactionId}', ${fields.walletVersion}, 'DEBIT', 10,
         '${fields.currency ?? 'BRL'}', 100, ${fields.balanceAfter ?? 90}, now())`

export const constraintViolations: ConstraintViolationCase[] = [
    {
        description: 'negative balance',
        buildSql: (fixture) => `UPDATE wallets SET balance = -0.01 WHERE id = '${fixture.walletId}'`,
        expectedError: 'wallets_balance_non_negative_ck',
    },
    {
        description: 'second wallet for the same player and currency',
        buildSql: (fixture) => `
            INSERT INTO wallets (id, player_id, currency, balance, version, created_at, updated_at)
            VALUES ('${newId()}', '${fixture.playerId}', 'BRL', 0, 1, now(), now())`,
        expectedError: 'wallets_player_currency_uq',
    },
    {
        description: 'repeated idempotency key',
        buildSql: (fixture) => buildInsertTransactionSql(fixture, { idempotencyKey: `key-${fixture.betId}` }),
        expectedError: 'wager_transactions_idempotency_key_uq',
    },
    {
        description: 'repeated external id for the same provider',
        buildSql: (fixture) => buildInsertTransactionSql(fixture, { externalTransactionId: `ext-${fixture.betId}` }),
        expectedError: 'wager_transactions_provider_external_id_uq',
    },
    {
        description: 'second opening for the same wallet',
        buildSql: (fixture) => buildInsertTransactionSql(fixture, { kind: 'OPENING' }),
        expectedError: 'wager_transactions_single_opening_uq',
    },
    {
        description: 'second entry for the same transaction',
        buildSql: (fixture) =>
            buildInsertLedgerEntrySql(fixture, { transactionId: fixture.openingId, walletVersion: 2 }),
        expectedError: 'wallet_ledger_entries_wallet_transaction_uq',
    },
    {
        description: 'unbalanced entry',
        buildSql: (fixture) =>
            buildInsertLedgerEntrySql(fixture, { transactionId: fixture.betId, walletVersion: 2, balanceAfter: 95 }),
        expectedError: 'wallet_ledger_entries_balanced_ck',
    },
    {
        description: 'repeated ledger version (lost update)',
        buildSql: (fixture) => buildInsertLedgerEntrySql(fixture, { transactionId: fixture.betId, walletVersion: 1 }),
        expectedError: 'wallet_ledger_entries_wallet_version_uq',
    },
    {
        description: 'entry currency different from the wallet',
        buildSql: (fixture) =>
            buildInsertLedgerEntrySql(fixture, { transactionId: fixture.betId, walletVersion: 2, currency: 'USD' }),
        expectedError: 'does not match wallet currency',
    },
    {
        description: 'UPDATE on the ledger',
        buildSql: (fixture) => `UPDATE wallet_ledger_entries SET amount = 1 WHERE wallet_id = '${fixture.walletId}'`,
        expectedError: 'append-only (UPDATE blocked)',
    },
    {
        description: 'DELETE on the ledger',
        buildSql: (fixture) => `DELETE FROM wallet_ledger_entries WHERE wallet_id = '${fixture.walletId}'`,
        expectedError: 'append-only (DELETE blocked)',
    },
    {
        description: 'TRUNCATE on the ledger',
        buildSql: () => 'TRUNCATE wallet_ledger_entries CASCADE',
        expectedError: 'append-only (TRUNCATE blocked)',
    },
]
