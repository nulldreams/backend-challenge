import { z } from 'zod'

export const openWalletRequestSchema = z.object({
    playerId: z.uuid(),
    initialBalance: z.object({
        amount: z.string(),
        currency: z.string(),
    }),
})

export type OpenWalletRequest = z.output<typeof openWalletRequestSchema>
