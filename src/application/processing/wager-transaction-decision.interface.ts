import { WalletLedgerEntry } from '@domain/ledger-entry'

export interface WagerTransactionDecision {
    entry?: WalletLedgerEntry
    awaitingReference: boolean
}
