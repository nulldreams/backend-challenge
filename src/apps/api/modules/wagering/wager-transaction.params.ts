import { boundedText } from '@infra/validation'
import { z } from 'zod'

export const transactionIdSchema = z.uuid()

export const providerTransactionParamsSchema = z.object({
    providerId: boundedText,
    externalTransactionId: boundedText,
})

export type ProviderTransactionParams = z.output<typeof providerTransactionParamsSchema>
