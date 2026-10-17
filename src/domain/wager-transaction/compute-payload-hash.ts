import { Money } from '@domain/money'
import { createHash } from 'node:crypto'
import { WagerPayload } from './wager-payload.interface'

/**
 * Creates a hash of the business fields
 * - only WagerPayload fields: idempotencyKey, messageId and other fields are ignored;
 * - money is normalized ex: ("10") -> ("10.00") so the same value results the same hash;
 * - sorts the payload alphabetically to prevent different hashes for the same payload
 */
export const computePayloadHash = (payload: WagerPayload): string => {
    const businessFields: WagerPayload = {
        providerId: payload.providerId,
        externalTransactionId: payload.externalTransactionId,
        playerId: payload.playerId,
        walletId: payload.walletId,
        roundId: payload.roundId,
        gameId: payload.gameId,
        kind: payload.kind,
        money: Money.from(payload.money).toJSON(),
        referenceExternalTransactionId: payload.referenceExternalTransactionId,
    }

    return createHash('sha256')
        .update(JSON.stringify(canonicalizePayload(businessFields)))
        .digest('hex')
}

/**
 * Sorts object keys alphabetically to ensure equivalent payloads produce the same hash,
 * regardless of key order
 */
function canonicalizePayload(value: unknown): unknown {
    if (value === null || typeof value !== 'object') return value
    if (Array.isArray(value)) return value.map(canonicalizePayload)

    const record = value as Record<string, unknown>
    return Object.fromEntries(
        Object.keys(record)
            .sort()
            .map((key) => [key, canonicalizePayload(record[key])]),
    )
}
