import { FailureCode } from '@domain/errors'
import { LedgerDirection } from '@domain/ledger-entry'
import { WagerTransactionKind } from '@domain/wager-transaction'

const { Opening, Bet, Win, Refund, Rollback } = WagerTransactionKind

export interface TransactionFields {
    kind?: WagerTransactionKind
    amount?: string
    roundId?: string
    referenceExternalTransactionId?: string
}

interface InvalidCreationCase {
    description: string
    fields: TransactionFields
    expectedCode: FailureCode
}

interface DirectionCase {
    description: string
    kind: WagerTransactionKind
    referenceKind?: WagerTransactionKind
    expected: LedgerDirection
}

interface ReferenceRetryCase {
    description: string
    attemptsBefore: number
    expectedDelayMs: number
}

interface InvalidReferenceCase {
    description: string
    fields: TransactionFields
    reference: TransactionFields
    rejectReference?: boolean
    expectedCode: FailureCode
}

export const invalidCreations: InvalidCreationCase[] = [
    { description: 'OPENING is internal', fields: { kind: Opening }, expectedCode: FailureCode.KindNotAllowed },
    { description: 'REFUND without reference', fields: { kind: Refund }, expectedCode: FailureCode.ReferenceRequired },
    {
        description: 'ROLLBACK without reference',
        fields: { kind: Rollback },
        expectedCode: FailureCode.ReferenceRequired,
    },
    {
        description: 'BET with a reference',
        fields: { kind: Bet, referenceExternalTransactionId: 'tx-0' },
        expectedCode: FailureCode.ReferenceNotAllowed,
    },
    { description: 'BET of zero', fields: { kind: Bet, amount: '0.00' }, expectedCode: FailureCode.InvalidAmount },
]

export const directions: DirectionCase[] = [
    { description: 'BET debits', kind: Bet, expected: LedgerDirection.Debit },
    { description: 'WIN credits', kind: Win, expected: LedgerDirection.Credit },
    { description: 'REFUND credits', kind: Refund, referenceKind: Bet, expected: LedgerDirection.Credit },
    { description: 'ROLLBACK of a BET credits', kind: Rollback, referenceKind: Bet, expected: LedgerDirection.Credit },
    { description: 'ROLLBACK of a WIN debits', kind: Rollback, referenceKind: Win, expected: LedgerDirection.Debit },
]

export const invalidReferences: InvalidReferenceCase[] = [
    {
        description: 'REFUND only references a BET',
        fields: { kind: Refund },
        reference: { kind: Win },
        expectedCode: FailureCode.InvalidReferenceKind,
    },
    {
        description: 'reference from another round',
        fields: { kind: Win },
        reference: { kind: Bet, roundId: 'round-2' },
        expectedCode: FailureCode.ReferenceMismatch,
    },
    {
        description: 'partial reversal',
        fields: { kind: Refund, amount: '10.00' },
        reference: { kind: Bet, amount: '25.00' },
        expectedCode: FailureCode.ReferenceAmountMismatch,
    },
    {
        description: 'reference that was REJECTED',
        fields: { kind: Refund },
        reference: { kind: Bet },
        rejectReference: true,
        expectedCode: FailureCode.ReferenceNotProcessed,
    },
]

export const referenceRetryDelays: ReferenceRetryCase[] = [
    { description: 'first missing attempt waits 2s', attemptsBefore: 0, expectedDelayMs: 2_000 },
    { description: 'second missing attempt waits 4s', attemptsBefore: 1, expectedDelayMs: 4_000 },
    { description: 'eighth missing attempt waits 256s', attemptsBefore: 7, expectedDelayMs: 256_000 },
    { description: 'ninth missing attempt hits the 5 minute ceiling', attemptsBefore: 8, expectedDelayMs: 300_000 },
]
