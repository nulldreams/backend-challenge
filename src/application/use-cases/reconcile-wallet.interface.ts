import { Money } from '@domain/money'

export interface WalletReconciliation {
    walletId: string
    storedBalance: Money
    calculatedBalance: Money
    difference: Money
    consistent: boolean
    checkedEntries: number
}
