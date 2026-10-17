import { InboxMessageRecord } from './inbox-message.record'
import { LedgerEntryRecord } from './ledger-entry.record'
import { OutboxMessageRecord } from './outbox-message.record'
import { WagerTransactionRecord } from './wager-transaction.record'
import { WalletRecord } from './wallet.record'

export * from './inbox-message.record'
export * from './ledger-entry.record'
export * from './outbox-message.record'
export * from './wager-transaction.record'
export * from './wallet.record'

export const databaseRecords = [
    WalletRecord,
    WagerTransactionRecord,
    LedgerEntryRecord,
    InboxMessageRecord,
    OutboxMessageRecord,
]
