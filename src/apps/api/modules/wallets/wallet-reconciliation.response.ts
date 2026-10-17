import type { WalletReconciliation } from '@application/use-cases'
import { MoneyProps } from '@domain/money'

export interface WalletReconciliationResponse {
    walletId: string
    storedBalance: MoneyProps
    calculatedBalance: MoneyProps
    difference: MoneyProps
    consistent: boolean
    checkedEntries: number
}

export const toWalletReconciliationResponse = (reconciliation: WalletReconciliation): WalletReconciliationResponse => ({
    walletId: reconciliation.walletId,
    storedBalance: reconciliation.storedBalance.toJSON(),
    calculatedBalance: reconciliation.calculatedBalance.toJSON(),
    difference: reconciliation.difference.toJSON(),
    consistent: reconciliation.consistent,
    checkedEntries: reconciliation.checkedEntries,
})
