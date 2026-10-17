import { EventContext } from '@domain/events'
import { InboxMessage } from '@domain/inbox-message'
import { WagerPayload, WagerTransaction, WagerTransactionKind } from '@domain/wager-transaction'

export interface SubmitWagerTransactionInput {
    idempotencyKey: string
    payload: WagerPayload & { kind: WagerTransactionKind }
    context: EventContext
    inbox?: InboxMessage
}

export interface SubmitWagerTransactionResult {
    transaction: WagerTransaction
    idempotentReplay: boolean
}
