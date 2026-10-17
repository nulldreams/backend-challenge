import { defineEntity, InferEntity } from '@mikro-orm/core'
import { WalletRecord } from './wallet.record'

export const WagerTransactionRecord = defineEntity({
    name: 'WagerTransactionRecord',
    tableName: 'wager_transactions',
    properties: (property) => ({
        id: property.uuid().primary(),
        providerId: property.text(),
        externalTransactionId: property.text(),
        idempotencyKey: property.text(),
        payloadHash: property.string().columnType('char(64)'),
        wallet: property.manyToOne(WalletRecord).fieldName('wallet_id').foreignKeyName('wager_transactions_wallet_fk'),
        playerId: property.uuid(),
        roundId: property.text(),
        gameId: property.text(),
        kind: property.text(),
        amount: property.decimal().precision(18).scale(2),
        currency: property.string().columnType('char(3)'),
        referenceExternalTransactionId: property.text().nullable(),
        referenceTransaction: () =>
            property
                .manyToOne(WagerTransactionRecord)
                .fieldName('reference_transaction_id')
                .foreignKeyName('wager_transactions_reference_fk')
                .deleteRule('no action')
                .nullable(),
        status: property.text(),
        failureCode: property.text().nullable(),
        observedBalanceAmount: property.decimal().precision(18).scale(2).nullable(),
        observedBalanceCurrency: property.string().columnType('char(3)').nullable(),
        referenceAttempts: property.integer().default(0),
        nextReferenceAttemptAt: property.datetime().nullable(),
        createdAt: property.datetime(),
        processedAt: property.datetime().nullable(),
    }),
    indexes: [
        {
            name: 'wager_transactions_pending_reference_idx',
            properties: ['nextReferenceAttemptAt'],
            where: "status = 'PENDING_REFERENCE'",
        },
        {
            name: 'wager_transactions_pending_by_reference_idx',
            properties: ['providerId', 'referenceExternalTransactionId'],
            where: "status = 'PENDING_REFERENCE'",
        },
    ],
    uniques: [
        { name: 'wager_transactions_idempotency_key_uq', properties: ['idempotencyKey'] },
        { name: 'wager_transactions_provider_external_id_uq', properties: ['providerId', 'externalTransactionId'] },
        { name: 'wager_transactions_single_opening_uq', properties: ['wallet'], where: "kind = 'OPENING'" },
        {
            name: 'wager_transactions_single_reversal_uq',
            properties: ['referenceTransaction', 'kind'],
            where: "status = 'PROCESSED' AND kind IN ('REFUND', 'ROLLBACK')",
        },
    ],
    checks: [
        { name: 'wager_transactions_reference_attempts_ck', expression: 'reference_attempts >= 0' },
        {
            name: 'wager_transactions_kind_ck',
            expression: "kind IN ('OPENING', 'BET', 'WIN', 'LOSS', 'REFUND', 'ROLLBACK')",
        },
        {
            name: 'wager_transactions_status_ck',
            expression: "status IN ('PENDING', 'PENDING_REFERENCE', 'PROCESSED', 'REJECTED', 'FAILED')",
        },
        { name: 'wager_transactions_amount_non_negative_ck', expression: 'amount >= 0' },
        { name: 'wager_transactions_processed_at_ck', expression: "status <> 'PROCESSED' OR processed_at IS NOT NULL" },
        {
            name: 'wager_transactions_reversal_requires_reference_ck',
            expression: "kind NOT IN ('REFUND', 'ROLLBACK') OR reference_external_transaction_id IS NOT NULL",
        },
        {
            name: 'wager_transactions_processed_reversal_resolved_ck',
            expression:
                "status <> 'PROCESSED' OR kind NOT IN ('REFUND', 'ROLLBACK') OR reference_transaction_id IS NOT NULL",
        },
        {
            name: 'wager_transactions_failure_code_ck',
            expression: "(status IN ('REJECTED', 'FAILED')) = (failure_code IS NOT NULL)",
        },
        {
            name: 'wager_transactions_observed_balance_ck',
            expression: '(observed_balance_amount IS NULL) = (observed_balance_currency IS NULL)',
        },
    ],
})

export type WagerTransactionRow = InferEntity<typeof WagerTransactionRecord>
