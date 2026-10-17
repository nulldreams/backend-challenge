import { type WagerPayloadRequest, wagerPayloadSchema } from '@infra/validation'

export const submitWagerTransactionRequestSchema = wagerPayloadSchema

export type SubmitWagerTransactionRequest = WagerPayloadRequest
