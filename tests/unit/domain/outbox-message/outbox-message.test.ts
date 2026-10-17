import { WalletBalanceChanged } from '@domain/events'
import { OutboxMessage } from '@domain/outbox-message'
import { Wallet } from '@domain/wallet'
import { brl } from '@tests/fixtures'
import { describe, expect, test } from 'bun:test'
import { retryDelays } from './outbox-message.data-provider'

const now = new Date('2026-01-01T00:00:00.000Z')

const pendingMessageWith = (attempts: number) =>
    OutboxMessage.rehydrate({
        id: 'event-1',
        aggregateId: 'wallet-1',
        eventType: 'WalletBalanceChanged',
        payload: {},
        occurredAt: now,
        attempts,
        nextAttemptAt: now,
    })

const buildWalletBalanceChanged = () => {
    const { wallet, openingEntry } = Wallet.open({
        id: 'wallet-1',
        playerId: 'player-1',
        initialBalance: brl('100.00'),
        openingTransactionId: 'opening-1',
        at: now,
    })

    return WalletBalanceChanged.from(wallet, openingEntry!, { correlationId: 'correlation-1' })
}

describe('OutboxMessage', () => {
    test('an enqueued event is pending, due right away and keeps the serialized envelope', () => {
        const event = buildWalletBalanceChanged()

        const message = OutboxMessage.enqueue(event)

        expect(message.id).toBe(event.eventId)
        expect(message.aggregateId).toBe('wallet-1')
        expect(message.eventType).toBe('WalletBalanceChanged')
        expect(message.payload).toEqual(event.toJSON() as unknown as Record<string, unknown>)
        expect(message.attempts).toBe(0)
        expect(message.isPending()).toBe(true)
        expect(message.isDue(now)).toBe(true)
    })

    test('a published message is no longer pending nor due', () => {
        const message = pendingMessageWith(0)

        message.markPublished(now)

        expect(message.publishedAt).toEqual(now)
        expect(message.isPending()).toBe(false)
        expect(message.isDue(now)).toBe(false)
    })

    test.each(retryDelays)('$description', ({ attemptsBefore, expectedDelayMs }) => {
        const message = pendingMessageWith(attemptsBefore)

        message.scheduleRetry(now)

        expect(message.attempts).toBe(attemptsBefore + 1)
        expect(message.nextAttemptAt.getTime() - now.getTime()).toBe(expectedDelayMs)
        expect(message.isDue(now)).toBe(false)
        expect(message.isDue(message.nextAttemptAt)).toBe(true)
    })
})
