import {
    type EventContext,
    WagerTransactionPendingReference,
    WagerTransactionProcessed,
    WagerTransactionRejected,
} from '@domain/events'
import { WagerTransaction, WagerTransactionKind, WagerTransactionStatus } from '@domain/wager-transaction'
import { brl } from '@tests/fixtures'

export const at = new Date('2026-01-01T00:00:00.000Z')
export const context: EventContext = { correlationId: 'correlation-1', causationId: 'msg-1' }

export const buildTransaction = (overrides: Partial<Parameters<typeof WagerTransaction.rehydrate>[0]> = {}) =>
    WagerTransaction.rehydrate({
        id: 'tx-1',
        providerId: 'provider-a',
        externalTransactionId: 'external-1',
        idempotencyKey: 'provider-a:external-1',
        payloadHash: 'hash-1',
        walletId: 'wallet-1',
        playerId: 'player-1',
        roundId: 'round-1',
        gameId: 'game-1',
        kind: WagerTransactionKind.Bet,
        money: brl('25.00'),
        referenceExternalTransactionId: undefined,
        createdAt: at,
        status: WagerTransactionStatus.Pending,
        ...overrides,
    })

interface MissingStateCase {
    description: string
    buildEvent: () => unknown
    expectedMessage: string
}

export const missingStateCases: MissingStateCase[] = [
    {
        description: 'processed event for a transaction that was not processed',
        buildEvent: () => WagerTransactionProcessed.from(buildTransaction(), context),
        expectedMessage: 'Transaction tx-1 is not processed',
    },
    {
        description: 'processed event without an observed balance',
        buildEvent: () =>
            WagerTransactionProcessed.from(
                buildTransaction({ status: WagerTransactionStatus.Processed, processedAt: at }),
                context,
            ),
        expectedMessage: 'Transaction tx-1 has no observed balance',
    },
    {
        description: 'rejected event without a failure code',
        buildEvent: () => WagerTransactionRejected.from(buildTransaction(), context, at),
        expectedMessage: 'Transaction tx-1 has no failure code',
    },
    {
        description: 'pending reference event without a reference',
        buildEvent: () => WagerTransactionPendingReference.from(buildTransaction(), context, at),
        expectedMessage: 'Transaction tx-1 has no reference',
    },
]
