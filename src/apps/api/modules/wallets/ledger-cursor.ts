import z from 'zod'

export const encodeLedgerCursor = (walletVersion: number): string =>
    Buffer.from(String(walletVersion)).toString('base64url')

export const ledgerCursorSchema = z
    .base64url()
    .transform((cursor) => Buffer.from(cursor, 'base64url').toString())
    .pipe(z.coerce.number<string>().int().positive())
