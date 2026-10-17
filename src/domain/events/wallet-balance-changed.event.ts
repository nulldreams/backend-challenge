import { LedgerDirection, WalletLedgerEntry } from '@domain/ledger-entry'
import { MoneyProps } from '@domain/money'
import { Wallet } from '@domain/wallet'
import { IntegrationEvent } from './integration-event'
import { EventContext, IntegrationEventProps } from './integration-event.interface'

export interface WalletBalanceChangedData {
    walletId: string
    transactionId: string
    direction: LedgerDirection
    money: MoneyProps
    balanceBefore: MoneyProps
    balanceAfter: MoneyProps
    walletVersion: number
}

export class WalletBalanceChanged extends IntegrationEvent<WalletBalanceChangedData> {
    readonly eventType = 'WalletBalanceChanged'
    readonly version = 1

    private constructor(props: IntegrationEventProps<WalletBalanceChangedData>) {
        super(props)
    }

    static from(wallet: Wallet, entry: WalletLedgerEntry, context: EventContext): WalletBalanceChanged {
        return new WalletBalanceChanged({
            ...context,
            eventId: Bun.randomUUIDv7(),
            aggregateId: wallet.id,
            occurredAt: entry.createdAt,
            data: {
                walletId: wallet.id,
                transactionId: entry.transactionId,
                direction: entry.direction,
                money: entry.money.toJSON(),
                balanceBefore: entry.balanceBefore.toJSON(),
                balanceAfter: entry.balanceAfter.toJSON(),
                walletVersion: entry.walletVersion,
            },
        })
    }
}
