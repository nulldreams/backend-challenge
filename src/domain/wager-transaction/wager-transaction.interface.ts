import { FailureCode } from '@domain/errors'
import { Money } from '@domain/money'
import { WagerTransactionKind } from './wager-transaction-kind.enum'
import { WagerTransactionStatus } from './wager-transaction-status.enum'

export interface CreateWagerTransactionProps {
    providerId: string
    externalTransactionId: string
    idempotencyKey: string
    payloadHash: string
    walletId: string
    playerId: string
    roundId: string
    gameId: string
    kind: WagerTransactionKind
    money: Money
    referenceExternalTransactionId: string | undefined
    createdAt: Date
}

export interface WagerTransactionState extends CreateWagerTransactionProps {
    id: string
    status: WagerTransactionStatus
    referenceTransactionId?: string
    failureCode?: FailureCode
    processedAt?: Date
    observedBalance?: Money
    referenceAttempts?: number
    nextReferenceAttemptAt?: Date
}

export interface OpeningTransactionProps {
    walletId: string
    playerId: string
    money: Money
    at: Date
}
