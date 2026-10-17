import { WalletLedgerEntry } from '@domain/ledger-entry'
import { Money } from '@domain/money'
import { Wallet } from './wallet'

export interface WalletState {
    id: string
    playerId: string
    currency: string
    balance: Money
    version: number
    createdAt: Date
    updatedAt: Date
}

export interface OpenWalletProps {
    id: string
    playerId: string
    initialBalance: Money
    openingTransactionId: string
    at: Date
}

export interface OpenWalletResult {
    wallet: Wallet
    openingEntry?: WalletLedgerEntry
}

export interface WalletMovementProps {
    money: Money
    transactionId: string
    at: Date
}
