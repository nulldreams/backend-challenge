import type { WalletLedgerPage } from '@application/use-cases'
import { LedgerDirection, WalletLedgerEntry } from '@domain/ledger-entry'
import { MoneyProps } from '@domain/money'
import { encodeLedgerCursor } from './ledger-cursor'

export interface LedgerEntryResponse {
    id: string
    transactionId: string
    walletVersion: number
    direction: LedgerDirection
    money: MoneyProps
    balanceBefore: MoneyProps
    balanceAfter: MoneyProps
    createdAt: string
}

export interface WalletLedgerResponse {
    items: LedgerEntryResponse[]
    nextCursor: string | null
}

const toLedgerEntryResponse = (entry: WalletLedgerEntry): LedgerEntryResponse => ({
    id: entry.id,
    transactionId: entry.transactionId,
    walletVersion: entry.walletVersion,
    direction: entry.direction,
    money: entry.money.toJSON(),
    balanceBefore: entry.balanceBefore.toJSON(),
    balanceAfter: entry.balanceAfter.toJSON(),
    createdAt: entry.createdAt.toISOString(),
})

export const toWalletLedgerResponse = ({ entries, nextAfterVersion }: WalletLedgerPage): WalletLedgerResponse => ({
    items: entries.map(toLedgerEntryResponse),
    nextCursor: nextAfterVersion === undefined ? null : encodeLedgerCursor(nextAfterVersion),
})
