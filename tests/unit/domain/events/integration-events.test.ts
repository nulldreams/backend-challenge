import {
    WagerTransactionPendingReference,
    WagerTransactionProcessed,
    WagerTransactionRejected,
    WalletBalanceChanged,
} from '@domain/events'
import { FailureCode } from '@domain/errors'
import { LedgerDirection } from '@domain/ledger-entry'
import { WagerTransactionKind, WagerTransactionStatus } from '@domain/wager-transaction'
import { Wallet } from '@domain/wallet'
import { brl } from '@tests/fixtures'
import { describe, expect, test } from 'bun:test'
import { at, buildTransaction, context, missingStateCases } from './integration-events.data-provider'

const transactionData = {
    transactionId: 'tx-1',
    providerId: 'provider-a',
    externalTransactionId: 'external-1',
    walletId: 'wallet-1',
    playerId: 'player-1',
    roundId: 'round-1',
    gameId: 'game-1',
    kind: WagerTransactionKind.Bet,
    money: { amount: '25.00', currency: 'BRL' },
}

describe('integration events', () => {
    test('WagerTransactionProcessed serializes the envelope with the observed balance', () => {
        const transaction = buildTransaction()
        transaction.markProcessed(undefined, brl('75.00'), at)

        const envelope = WagerTransactionProcessed.from(transaction, context).toJSON()

        expect(envelope).toEqual({
            eventId: envelope.eventId,
            eventType: 'WagerTransactionProcessed',
            aggregateId: 'tx-1',
            correlationId: 'correlation-1',
            causationId: 'msg-1',
            occurredAt: at.toISOString(),
            version: 1,
            data: {
                ...transactionData,
                balance: { amount: '75.00', currency: 'BRL' },
                processedAt: at.toISOString(),
            },
        })
    })

    test('a reversal carries the resolved reference and an envelope without causation omits it', () => {
        const refund = buildTransaction({ kind: WagerTransactionKind.Refund, referenceExternalTransactionId: 'bet-1' })
        refund.markProcessed('bet-id', brl('100.00'), at)

        const envelope = WagerTransactionProcessed.from(refund, { correlationId: 'correlation-1' }).toJSON()

        expect(envelope.data.referenceTransactionId).toBe('bet-id')
        expect(envelope).not.toHaveProperty('causationId')
    })

    test('event data is frozen', () => {
        const transaction = buildTransaction()
        transaction.markProcessed(undefined, brl('75.00'), at)

        const event = WagerTransactionProcessed.from(transaction, context)

        expect(Object.isFrozen(event.data)).toBe(true)
    })

    test('WagerTransactionRejected carries the failure code and the balance observed', () => {
        const transaction = buildTransaction()
        transaction.reject(FailureCode.InsufficientFunds, brl('10.00'))

        const event = WagerTransactionRejected.from(transaction, context, at)

        expect(event.eventType).toBe('WagerTransactionRejected')
        expect(event.data).toEqual({
            ...transactionData,
            failureCode: FailureCode.InsufficientFunds,
            balance: { amount: '10.00', currency: 'BRL' },
        })
    })

    test('WagerTransactionPendingReference carries the missing reference', () => {
        const refund = buildTransaction({
            kind: WagerTransactionKind.Refund,
            referenceExternalTransactionId: 'bet-1',
            status: WagerTransactionStatus.PendingReference,
        })

        const event = WagerTransactionPendingReference.from(refund, context, at)

        expect(event.eventType).toBe('WagerTransactionPendingReference')
        expect(event.data).toEqual({
            ...transactionData,
            kind: WagerTransactionKind.Refund,
            referenceExternalTransactionId: 'bet-1',
        })
    })

    test('WalletBalanceChanged mirrors the ledger entry', () => {
        const { wallet } = Wallet.open({
            id: 'wallet-1',
            playerId: 'player-1',
            initialBalance: brl('100.00'),
            openingTransactionId: 'opening-1',
            at,
        })
        const entry = wallet.debit({ money: brl('25.00'), transactionId: 'tx-1', at })

        const event = WalletBalanceChanged.from(wallet, entry, context)

        expect(event.eventType).toBe('WalletBalanceChanged')
        expect(event.aggregateId).toBe('wallet-1')
        expect(event.data).toEqual({
            walletId: 'wallet-1',
            transactionId: 'tx-1',
            direction: LedgerDirection.Debit,
            money: { amount: '25.00', currency: 'BRL' },
            balanceBefore: { amount: '100.00', currency: 'BRL' },
            balanceAfter: { amount: '75.00', currency: 'BRL' },
            walletVersion: 2,
        })
    })

    test.each(missingStateCases)('refuses a $description', ({ buildEvent, expectedMessage }) => {
        expect(buildEvent).toThrow(expectedMessage)
    })
})
