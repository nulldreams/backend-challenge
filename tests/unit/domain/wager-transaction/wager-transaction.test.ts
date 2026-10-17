import { FailureCode, InvalidTransactionStateError, InvalidWagerTransactionError } from '@domain/errors'
import {
    MAX_REFERENCE_ATTEMPTS,
    WagerTransaction,
    WagerTransactionKind,
    WagerTransactionStatus,
} from '@domain/wager-transaction'
import { brl } from '@tests/fixtures'
import { describe, expect, test } from 'bun:test'
import {
    directions,
    invalidCreations,
    invalidReferences,
    referenceRetryDelays,
    type TransactionFields,
} from './wager-transaction.data-provider'

const at = new Date('2026-01-01T00:00:00.000Z')

const createTransaction = ({ kind = WagerTransactionKind.Bet, amount = '25.00', ...fields }: TransactionFields = {}) =>
    WagerTransaction.create({
        providerId: 'provider-a',
        externalTransactionId: Bun.randomUUIDv7(),
        idempotencyKey: Bun.randomUUIDv7(),
        payloadHash: 'hash-1',
        walletId: 'wallet-1',
        playerId: 'player-1',
        roundId: 'round-1',
        gameId: 'game-1',
        kind,
        money: brl(amount),
        referenceExternalTransactionId: undefined,
        createdAt: at,
        ...fields,
    })

const createProcessed = (fields: TransactionFields) => {
    const transaction = createTransaction(fields)
    transaction.markProcessed(undefined, brl('100.00'), at)
    return transaction
}

const createPendingRefund = () => {
    const refund = createTransaction({ kind: WagerTransactionKind.Refund, referenceExternalTransactionId: 'bet-1' })
    refund.markPendingReference(brl('100.00'), at)
    return refund
}

const captureCode = (action: () => void): FailureCode | undefined => {
    try {
        action()
    } catch (error) {
        if (error instanceof InvalidWagerTransactionError) return error.code
        throw error
    }
}

describe('WagerTransaction', () => {
    test('opening is internal, born PROCESSED and identified by the wallet', () => {
        const opening = WagerTransaction.opening({
            walletId: 'wallet-1',
            playerId: 'player-1',
            money: brl('100.00'),
            at,
        })

        expect(opening.kind).toBe(WagerTransactionKind.Opening)
        expect(opening.status).toBe(WagerTransactionStatus.Processed)
        expect(opening.processedAt).toEqual(at)
        expect(opening.providerId).toBe('internal')
        expect(opening.externalTransactionId).toBe('wallet-1')
        expect(opening.idempotencyKey).toBe('opening:wallet-1')
        expect(opening.money).toEqual(brl('100.00'))
    })

    test('rehydrate rebuilds the persisted state without revalidating', () => {
        const opening = WagerTransaction.opening({
            walletId: 'wallet-1',
            playerId: 'player-1',
            money: brl('100.00'),
            at,
        })

        const rebuilt = WagerTransaction.rehydrate({
            ...opening,
            status: opening.status,
            processedAt: opening.processedAt,
            observedBalance: opening.observedBalance,
        })

        expect(rebuilt).toEqual(opening)
    })

    test('a submitted transaction is born PENDING', () => {
        expect(createTransaction().status).toBe(WagerTransactionStatus.Pending)
    })

    test.each(invalidCreations)('create rejects $description', ({ fields, expectedCode }) => {
        expect(captureCode(() => createTransaction(fields))).toBe(expectedCode)
    })

    test('LOSS records the result without moving the balance, even with 0.00', () => {
        const loss = createTransaction({ kind: WagerTransactionKind.Loss, amount: '0.00' })

        expect(loss.affectsBalance()).toBe(false)
        expect(() => loss.ledgerDirectionFor()).toThrow()
    })

    test.each(directions)('$description', ({ kind, referenceKind, expected }) => {
        const reference = referenceKind ? createProcessed({ kind: referenceKind }) : undefined
        const transaction = createTransaction({
            kind,
            referenceExternalTransactionId: reference?.externalTransactionId,
        })

        expect(transaction.ledgerDirectionFor(reference)).toBe(expected)
    })

    test.each(invalidReferences)('rejects $description', ({ fields, reference, rejectReference, expectedCode }) => {
        const referenced = createTransaction(reference)

        if (rejectReference) referenced.reject(FailureCode.InsufficientFunds, brl('0.00'))
        else referenced.markProcessed(undefined, brl('100.00'), at)
        const transaction = createTransaction({ ...fields, referenceExternalTransactionId: 'tx-0' })

        expect(captureCode(() => transaction.assertValidReference(referenced))).toBe(expectedCode)
    })

    test('a terminal transaction does not change status again', () => {
        const transaction = createProcessed({ kind: WagerTransactionKind.Bet })

        expect(() => transaction.reject(FailureCode.InsufficientFunds, brl('0.00'))).toThrow(
            InvalidTransactionStateError,
        )
        expect(transaction.status).toBe(WagerTransactionStatus.Processed)
    })

    test('the same idempotency key with a different payload hash does not match', () => {
        const transaction = createTransaction()

        expect(transaction.matchesPayload('hash-1')).toBe(true)
        expect(transaction.matchesPayload('hash-2')).toBe(false)
    })

    test('a missing reference waits 1s before the first retry', () => {
        const refund = createPendingRefund()

        expect(refund.status).toBe(WagerTransactionStatus.PendingReference)
        expect(refund.observedBalance).toEqual(brl('100.00'))
        expect(refund.nextReferenceAttemptAt?.getTime()).toBe(at.getTime() + 1_000)
    })

    test.each(referenceRetryDelays)('$description', ({ attemptsBefore, expectedDelayMs }) => {
        const refund = createPendingRefund()

        for (let attempt = 0; attempt < attemptsBefore; attempt++) refund.referenceStillMissing(brl('100.00'), at)

        refund.referenceStillMissing(brl('90.00'), at)

        expect(refund.referenceAttempts).toBe(attemptsBefore + 1)
        expect(refund.observedBalance).toEqual(brl('90.00'))
        expect(refund.nextReferenceAttemptAt?.getTime()).toBe(at.getTime() + expectedDelayMs)
    })

    test(`after ${MAX_REFERENCE_ATTEMPTS} attempts the missing reference is rejected as REFERENCE_NOT_FOUND`, () => {
        const refund = createPendingRefund()

        for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt++) {
            refund.referenceStillMissing(brl('100.00'), at)
        }

        expect(refund.status).toBe(WagerTransactionStatus.Rejected)
        expect(refund.failureCode).toBe(FailureCode.ReferenceNotFound)
        expect(refund.nextReferenceAttemptAt).toBeUndefined()
    })

    test('only a transaction waiting for its reference can count a missing attempt', () => {
        const bet = createTransaction()

        expect(() => bet.referenceStillMissing(brl('100.00'), at)).toThrow(InvalidTransactionStateError)
    })

    test('processing a pending reference keeps the resolved reference and clears the retry schedule', () => {
        const refund = createPendingRefund()

        refund.markProcessed('bet-id', brl('110.00'), at)

        expect(refund.referenceTransactionId).toBe('bet-id')
        expect(refund.processedAt).toEqual(at)
        expect(refund.nextReferenceAttemptAt).toBeUndefined()
    })
})
