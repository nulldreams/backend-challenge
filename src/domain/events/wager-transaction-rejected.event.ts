import { FailureCode } from '@domain/errors'
import { MoneyProps } from '@domain/money'
import { WagerTransaction } from '@domain/wager-transaction'
import { IntegrationEvent } from './integration-event'
import { EventContext, IntegrationEventProps } from './integration-event.interface'
import {
    observedBalanceOf,
    toWagerTransactionEventData,
    WagerTransactionEventData,
} from './wager-transaction-event-data'

export interface WagerTransactionRejectedData extends WagerTransactionEventData {
    failureCode: FailureCode
    balance: MoneyProps
}

export class WagerTransactionRejected extends IntegrationEvent<WagerTransactionRejectedData> {
    readonly eventType = 'WagerTransactionRejected'
    readonly version = 1

    private constructor(props: IntegrationEventProps<WagerTransactionRejectedData>) {
        super(props)
    }

    static from(transaction: WagerTransaction, context: EventContext, occurredAt: Date): WagerTransactionRejected {
        if (!transaction.failureCode) throw new Error(`Transaction ${transaction.id} has no failure code`)

        return new WagerTransactionRejected({
            ...context,
            eventId: Bun.randomUUIDv7(),
            aggregateId: transaction.id,
            occurredAt,
            data: {
                ...toWagerTransactionEventData(transaction),
                failureCode: transaction.failureCode,
                balance: observedBalanceOf(transaction),
            },
        })
    }
}
