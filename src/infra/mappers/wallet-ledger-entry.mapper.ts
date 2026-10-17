import { LedgerDirection, WalletLedgerEntry } from '@domain/ledger-entry'
import { Money } from '@domain/money'
import type { LedgerEntryRow } from '@infra/records'
import type { RequiredEntityData } from '@mikro-orm/core'

export const walletLedgerEntryMapper = {
    toDomain: (row: LedgerEntryRow): WalletLedgerEntry => {
        const toMoney = (amount: string) => Money.from({ amount, currency: row.currency })
        return WalletLedgerEntry.rehydrate({
            id: row.id,
            walletId: row.wallet.id,
            transactionId: row.transaction.id,
            walletVersion: row.walletVersion,
            direction: row.direction as LedgerDirection,
            money: toMoney(row.amount),
            balanceBefore: toMoney(row.balanceBefore),
            balanceAfter: toMoney(row.balanceAfter),
            createdAt: row.createdAt,
        })
    },

    toRow: (entry: WalletLedgerEntry): RequiredEntityData<LedgerEntryRow> => ({
        id: entry.id,
        wallet: entry.walletId,
        transaction: entry.transactionId,
        walletVersion: entry.walletVersion,
        direction: entry.direction,
        amount: entry.money.toJSON().amount,
        currency: entry.money.currency,
        balanceBefore: entry.balanceBefore.toJSON().amount,
        balanceAfter: entry.balanceAfter.toJSON().amount,
        createdAt: entry.createdAt,
    }),
}
