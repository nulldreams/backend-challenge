import { z } from 'zod'
import { ledgerCursorSchema } from './ledger-cursor'

export const walletLedgerQuerySchema = z.object({
    cursor: ledgerCursorSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
})

export type WalletLedgerQuery = z.output<typeof walletLedgerQuerySchema>
