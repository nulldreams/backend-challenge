import { WagerTransaction } from '@domain/wager-transaction'
import { IntegrationEvent } from './integration-event'
import { EventContext, IntegrationEventProps } from './integration-event.interface'
import { toWagerTransactionEventData, WagerTransactionEventData } from './wager-transaction-event-data'

export interface WagerTransactionPendingReferenceData extends WagerTransactionEventData {
    referenceExternalTransactionId: string
}

export class WagerTransactionPendingReference extends IntegrationEvent<WagerTransactionPendingReferenceData> {
    readonly eventType = 'WagerTransactionPendingReference'
    readonly version = 1

    private constructor(props: IntegrationEventProps<WagerTransactionPendingReferenceData>) {
        super(props)
    }

    static from(
        transaction: WagerTransaction,
        context: EventContext,
        occurredAt: Date,
    ): WagerTransactionPendingReference {
        if (!transaction.referenceExternalTransactionId)
            throw new Error(`Transaction ${transaction.id} has no reference`)

        return new WagerTransactionPendingReference({
            ...context,
            eventId: Bun.randomUUIDv7(),
            aggregateId: transaction.id,
            occurredAt,
            data: {
                ...toWagerTransactionEventData(transaction),
                referenceExternalTransactionId: transaction.referenceExternalTransactionId,
            },
        })
    }
}
