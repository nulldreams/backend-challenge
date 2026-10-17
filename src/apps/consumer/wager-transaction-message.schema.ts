import { boundedText, wagerPayloadSchema } from '@infra/validation'
import { z } from 'zod'

export const wagerTransactionMessageSchema = z.object({
    messageId: boundedText,
    type: z.literal('WagerTransactionRequested'),
    occurredAt: z.iso.datetime(),
    data: wagerPayloadSchema.extend({ idempotencyKey: boundedText }),
})

export type WagerTransactionMessage = z.output<typeof wagerTransactionMessageSchema>
