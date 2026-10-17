import { Money } from '@domain/money'
import { LedgerDirection } from './ledger-direction.enum'

export interface LedgerEntryState {
    id: string
    walletId: string
    transactionId: string
    walletVersion: number
    direction: LedgerDirection
    money: Money
    balanceBefore: Money
    balanceAfter: Money
    createdAt: Date
}

export type CreateLedgerEntryProps = Omit<LedgerEntryState, 'id'>
