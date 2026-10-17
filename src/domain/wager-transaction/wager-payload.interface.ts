import { MoneyProps } from '@domain/money'

export interface WagerPayload {
    providerId: string
    externalTransactionId: string
    playerId: string
    walletId: string
    roundId: string
    gameId: string
    kind: string
    money: MoneyProps
    referenceExternalTransactionId?: string
}
