import { InboxMessage } from '@domain/inbox-message'
import { describe, expect, test } from 'bun:test'

const receivedAt = new Date('2026-01-01T00:00:00.000Z')

const receiveMessage = () =>
    InboxMessage.receive({ messageId: 'msg-1', consumerName: 'consumer-a', payloadHash: 'hash-1', receivedAt })

describe('InboxMessage', () => {
    test('a received message is not processed yet', () => {
        const message = receiveMessage()

        expect(message.isProcessed()).toBe(false)
        expect(message.processedAt).toBeUndefined()
    })

    test('marking it processed records when', () => {
        const message = receiveMessage()
        const processedAt = new Date('2026-01-01T00:00:01.000Z')

        message.markProcessed(processedAt)

        expect(message.isProcessed()).toBe(true)
        expect(message.processedAt).toEqual(processedAt)
    })

    test('the same messageId with another payload does not match', () => {
        const message = receiveMessage()

        expect(message.matchesPayload('hash-1')).toBe(true)
        expect(message.matchesPayload('hash-2')).toBe(false)
    })

    test('rehydrate rebuilds the persisted state', () => {
        const processedAt = new Date('2026-01-01T00:00:01.000Z')

        const message = InboxMessage.rehydrate({
            messageId: 'msg-1',
            consumerName: 'consumer-a',
            payloadHash: 'hash-1',
            receivedAt,
            processedAt,
        })

        expect(message.isProcessed()).toBe(true)
        expect(message.processedAt).toEqual(processedAt)
    })
})
