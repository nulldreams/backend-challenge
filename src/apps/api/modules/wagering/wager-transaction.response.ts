import type { SubmitWagerTransactionResult } from '@application/use-cases'
import { FailureCode } from '@domain/errors'
import { MoneyProps } from '@domain/money'
import { WagerTransaction, WagerTransactionKind, WagerTransactionStatus } from '@domain/wager-transaction'
import { HttpStatus } from '@nestjs/common'

export interface SubmitWagerTransactionResponse {
    transactionId: string
    status: WagerTransactionStatus
    failureCode?: FailureCode
    balance?: MoneyProps
    idempotentReplay: boolean
}

export interface WagerTransactionResponse {
    transactionId: string
    providerId: string
    externalTransactionId: string
    walletId: string
    playerId: string
    roundId: string
    gameId: string
    kind: WagerTransactionKind
    money: MoneyProps
    status: WagerTransactionStatus
    failureCode?: FailureCode
    referenceExternalTransactionId?: string
    referenceTransactionId?: string
    balance?: MoneyProps
    createdAt: string
    processedAt?: string
}

export const httpStatusOf = ({ status }: WagerTransaction): HttpStatus => {
    if (status === WagerTransactionStatus.PendingReference) return HttpStatus.ACCEPTED

    if (status === WagerTransactionStatus.Rejected) return HttpStatus.UNPROCESSABLE_ENTITY

    return HttpStatus.OK
}

export const toSubmitWagerTransactionResponse = ({
    transaction,
    idempotentReplay,
}: SubmitWagerTransactionResult): SubmitWagerTransactionResponse => ({
    transactionId: transaction.id,
    status: transaction.status,
    failureCode: transaction.failureCode,
    balance: transaction.observedBalance?.toJSON(),
    idempotentReplay,
})

export const toWagerTransactionResponse = (transaction: WagerTransaction): WagerTransactionResponse => ({
    transactionId: transaction.id,
    providerId: transaction.providerId,
    externalTransactionId: transaction.externalTransactionId,
    walletId: transaction.walletId,
    playerId: transaction.playerId,
    roundId: transaction.roundId,
    gameId: transaction.gameId,
    kind: transaction.kind,
    money: transaction.money.toJSON(),
    status: transaction.status,
    failureCode: transaction.failureCode,
    referenceExternalTransactionId: transaction.referenceExternalTransactionId,
    referenceTransactionId: transaction.referenceTransactionId,
    balance: transaction.observedBalance?.toJSON(),
    createdAt: transaction.createdAt.toISOString(),
    processedAt: transaction.processedAt?.toISOString(),
})
