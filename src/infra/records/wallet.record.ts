import { defineEntity, InferEntity } from '@mikro-orm/core'

export const WalletRecord = defineEntity({
    name: 'WalletRecord',
    tableName: 'wallets',
    properties: (property) => ({
        id: property.uuid().primary(),
        playerId: property.uuid(),
        currency: property.string().columnType('char(3)'),
        balance: property.decimal().precision(18).scale(2),
        version: property.integer(),
        createdAt: property.datetime(),
        updatedAt: property.datetime(),
    }),
    uniques: [{ name: 'wallets_player_currency_uq', properties: ['playerId', 'currency'] }],
    checks: [
        { name: 'wallets_currency_format_ck', expression: "currency ~ '^[A-Z]{3}$'" },
        { name: 'wallets_balance_non_negative_ck', expression: 'balance >= 0' },
        { name: 'wallets_version_positive_ck', expression: 'version >= 1' },
    ],
})

export type WalletRow = InferEntity<typeof WalletRecord>
