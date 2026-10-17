import { WalletLedgerEntry } from '@domain/ledger-entry'

export interface GetWalletLedgerInput {
    walletId: string
    afterVersion: number
    limit: number
}

export interface WalletLedgerPage {
    entries: WalletLedgerEntry[]
    nextAfterVersion?: number
}
