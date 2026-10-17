import { WagerTransactionKind } from '@domain/wager-transaction'

export const PARALLEL_SUBMISSIONS = 50

export interface WalletUnderTest {
    walletId: string
    playerId: string
}

export interface WagerFields {
    kind?: WagerTransactionKind
    amount?: string
    externalTransactionId?: string
    referenceExternalTransactionId?: string
}

export interface LedgerConsistency {
    storedBalance: string
    lastBalanceAfter: string
    ledgerSum: string
}
