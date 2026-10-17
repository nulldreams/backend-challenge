import { DomainError, FailureCode } from '@domain/errors'
import { ZodError } from 'zod'

export type MessageAction = 'ack' | 'retry' | 'dead-letter'

const ACK: MessageAction = 'ack'
const DEAD_LETTER: MessageAction = 'dead-letter'

const actionByFailureCode: Record<FailureCode, MessageAction> = {
    [FailureCode.InvalidAmount]: DEAD_LETTER,
    [FailureCode.InvalidCurrency]: DEAD_LETTER,
    [FailureCode.KindNotAllowed]: DEAD_LETTER,
    [FailureCode.ReferenceRequired]: DEAD_LETTER,
    [FailureCode.ReferenceNotAllowed]: DEAD_LETTER,
    [FailureCode.MessageIdConflict]: DEAD_LETTER,

    [FailureCode.WalletAlreadyExists]: ACK,
    [FailureCode.IdempotencyConflict]: ACK,
    [FailureCode.ExternalTransactionIdConflict]: ACK,
    [FailureCode.WalletNotFound]: ACK,
    [FailureCode.WagerTransactionNotFound]: ACK,
    [FailureCode.CurrencyMismatch]: ACK,
    [FailureCode.InsufficientFunds]: ACK,
    [FailureCode.WalletPlayerMismatch]: ACK,
    [FailureCode.InvalidReferenceKind]: ACK,
    [FailureCode.ReferenceMismatch]: ACK,
    [FailureCode.ReferenceAmountMismatch]: ACK,
    [FailureCode.ReferenceNotProcessed]: ACK,
    [FailureCode.AlreadyReversed]: ACK,
    [FailureCode.ReversalInsufficientFunds]: ACK,
    [FailureCode.ReferenceNotFound]: ACK,
}

export function messageActionFor(error: unknown): MessageAction {
    if (error instanceof ZodError || error instanceof SyntaxError) return DEAD_LETTER

    if (error instanceof DomainError) return actionByFailureCode[error.code]

    return 'retry'
}
