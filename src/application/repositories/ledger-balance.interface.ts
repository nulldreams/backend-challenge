import { Money } from '@domain/money'

export interface LedgerBalance {
    balance: Money
    entries: number
}
