import { Money } from '@domain/money'
import { Wallet } from '@domain/wallet'
import { WalletRow } from '@infra/records'
import { RequiredEntityData } from '@mikro-orm/core'

export const walletMapper = {
    toDomain: (row: WalletRow): Wallet =>
        Wallet.rehydrate({
            id: row.id,
            playerId: row.playerId,
            currency: row.currency,
            balance: Money.from({ amount: row.balance, currency: row.currency }),
            version: row.version,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
        }),

    toRow: (wallet: Wallet): RequiredEntityData<WalletRow> => ({
        id: wallet.id,
        playerId: wallet.playerId,
        currency: wallet.currency,
        balance: wallet.balance.toJSON().amount,
        version: wallet.version,
        createdAt: wallet.createdAt,
        updatedAt: wallet.updatedAt,
    }),
}
