import { computePayloadHash, WagerPayload } from '@domain/wager-transaction'
import { describe, expect, test } from 'bun:test'

const payload: WagerPayload = {
    providerId: 'provider-a',
    externalTransactionId: 'tx-1',
    playerId: 'player-1',
    walletId: 'wallet-1',
    roundId: 'round-1',
    gameId: 'game-1',
    kind: 'BET',
    money: { amount: '25.00', currency: 'BRL' },
}

describe('computePayloadHash', () => {
    test('same value in a different format yields the same hash', () => {
        expect(computePayloadHash({ ...payload, money: { amount: '25', currency: 'BRL' } })).toBe(
            computePayloadHash(payload),
        )
    })

    test('key order does not change the hash', () => {
        const reordered = Object.fromEntries(Object.entries(payload).reverse()) as WagerPayload
        expect(computePayloadHash(reordered)).toBe(computePayloadHash(payload))
    })

    test('fields outside the business payload are ignored', () => {
        const withMetadata = { ...payload, idempotencyKey: 'key-1' } as WagerPayload
        expect(computePayloadHash(withMetadata)).toBe(computePayloadHash(payload))
    })

    test('a different business value yields a different hash', () => {
        expect(computePayloadHash({ ...payload, money: { amount: '25.01', currency: 'BRL' } })).not.toBe(
            computePayloadHash(payload),
        )
    })
})
