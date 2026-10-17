import { WagerTransactionKind } from '@domain/wager-transaction'
import { z } from 'zod'

export const boundedText = z.string().trim().min(1).max(255)

export const wagerPayloadSchema = z.object({
    providerId: boundedText,
    externalTransactionId: boundedText,
    playerId: z.uuid(),
    walletId: z.uuid(),
    roundId: boundedText,
    gameId: boundedText,
    kind: z.enum(WagerTransactionKind),
    money: z.object({
        amount: z.string(),
        currency: z.string(),
    }),
    referenceExternalTransactionId: boundedText.optional(),
})

export type WagerPayloadRequest = z.output<typeof wagerPayloadSchema>
