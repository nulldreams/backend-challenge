import { defineEntity, type InferEntity } from '@mikro-orm/core'
import { WagerTransactionRecord } from './wager-transaction.record'
import { WalletRecord } from './wallet.record'

const RAISE_APPEND_ONLY_VIOLATION =
    "RAISE EXCEPTION 'wallet_ledger_entries is append-only (% blocked)', TG_OP USING ERRCODE = 'restrict_violation';"

const RAISE_WALLET_CURRENCY_MISMATCH =
    'IF NEW.currency IS DISTINCT FROM (SELECT currency FROM wallets WHERE id = NEW.wallet_id) THEN ' +
    "RAISE EXCEPTION 'ledger entry currency % does not match wallet currency', NEW.currency USING ERRCODE = 'foreign_key_violation'; " +
    'END IF; RETURN NEW;'

export const LedgerEntryRecord = defineEntity({
    name: 'LedgerEntryRecord',
    tableName: 'wallet_ledger_entries',
    properties: (property) => ({
        id: property.uuid().primary(),
        wallet: property
            .manyToOne(WalletRecord)
            .fieldName('wallet_id')
            .foreignKeyName('wallet_ledger_entries_wallet_fk'),
        transaction: property
            .manyToOne(WagerTransactionRecord)
            .fieldName('transaction_id')
            .foreignKeyName('wallet_ledger_entries_transaction_fk'),
        walletVersion: property.integer(),
        direction: property.text(),
        amount: property.decimal().precision(18).scale(2),
        currency: property.string().columnType('char(3)'),
        balanceBefore: property.decimal().precision(18).scale(2),
        balanceAfter: property.decimal().precision(18).scale(2),
        createdAt: property.datetime(),
    }),
    uniques: [
        { name: 'wallet_ledger_entries_wallet_transaction_uq', properties: ['wallet', 'transaction'] },
        { name: 'wallet_ledger_entries_wallet_version_uq', properties: ['wallet', 'walletVersion'] },
    ],
    checks: [
        { name: 'wallet_ledger_entries_wallet_version_ck', expression: 'wallet_version >= 1' },
        { name: 'wallet_ledger_entries_direction_ck', expression: "direction IN ('DEBIT', 'CREDIT')" },
        { name: 'wallet_ledger_entries_amount_positive_ck', expression: 'amount > 0' },
        { name: 'wallet_ledger_entries_balance_before_ck', expression: 'balance_before >= 0' },
        { name: 'wallet_ledger_entries_balance_after_ck', expression: 'balance_after >= 0' },
        {
            name: 'wallet_ledger_entries_balanced_ck',
            expression: "balance_after = balance_before + CASE direction WHEN 'CREDIT' THEN amount ELSE -amount END",
        },
    ],
    triggers: [
        {
            name: 'ensure_wallet_currency',
            timing: 'before',
            events: ['insert'],
            forEach: 'row',
            body: RAISE_WALLET_CURRENCY_MISMATCH,
        },
        {
            name: 'block_update_delete',
            timing: 'before',
            events: ['update', 'delete'],
            forEach: 'row',
            body: RAISE_APPEND_ONLY_VIOLATION,
        },
        {
            name: 'block_truncate',
            timing: 'before',
            events: ['truncate'],
            forEach: 'statement',
            body: RAISE_APPEND_ONLY_VIOLATION,
        },
    ],
})

export type LedgerEntryRow = InferEntity<typeof LedgerEntryRecord>
