import { MoneyProps } from '@domain/money'
import { WagerTransaction } from '@domain/wager-transaction'
import { IntegrationEvent } from './integration-event'
import { EventContext, IntegrationEventProps } from './integration-event.interface'
import {
    observedBalanceOf,
    toWagerTransactionEventData,
    WagerTransactionEventData,
} from './wager-transaction-event-data'

export interface WagerTransactionProcessedData extends WagerTransactionEventData {
    referenceTransactionId?: string
    balance: MoneyProps
    processedAt: string
}

export class WagerTransactionProcessed extends IntegrationEvent<WagerTransactionProcessedData> {
    readonly eventType = 'WagerTransactionProcessed'
    readonly version = 1

    private constructor(props: IntegrationEventProps<WagerTransactionProcessedData>) {
        super(props)
    }

    static from(transaction: WagerTransaction, context: EventContext): WagerTransactionProcessed {
        if (!transaction.processedAt) throw new Error(`Transaction ${transaction.id} is not processed`)

        return new WagerTransactionProcessed({
            ...context,
            eventId: Bun.randomUUIDv7(),
            aggregateId: transaction.id,
            occurredAt: transaction.processedAt,
            data: {
                ...toWagerTransactionEventData(transaction),
                ...(transaction.referenceTransactionId
                    ? { referenceTransactionId: transaction.referenceTransactionId }
                    : {}),
                balance: observedBalanceOf(transaction),
                processedAt: transaction.processedAt.toISOString(),
            },
        })
    }
}
