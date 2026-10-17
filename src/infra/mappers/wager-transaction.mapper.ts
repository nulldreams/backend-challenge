import { FailureCode } from '@domain/errors'
import { Money } from '@domain/money'
import { WagerTransaction, WagerTransactionKind, WagerTransactionStatus } from '@domain/wager-transaction'
import type { WagerTransactionRow } from '@infra/records'
import type { EntityData, RequiredEntityData } from '@mikro-orm/core'

const toObservedBalance = ({ observedBalanceAmount, observedBalanceCurrency }: WagerTransactionRow) =>
    observedBalanceAmount && observedBalanceCurrency
        ? Money.from({ amount: observedBalanceAmount, currency: observedBalanceCurrency })
        : undefined

export const wagerTransactionMapper = {
    toDomain: (row: WagerTransactionRow): WagerTransaction =>
        WagerTransaction.rehydrate({
            id: row.id,
            providerId: row.providerId,
            externalTransactionId: row.externalTransactionId,
            idempotencyKey: row.idempotencyKey,
            payloadHash: row.payloadHash,
            walletId: row.wallet.id,
            playerId: row.playerId,
            roundId: row.roundId,
            gameId: row.gameId,
            kind: row.kind as WagerTransactionKind,
            money: Money.from({ amount: row.amount, currency: row.currency }),
            referenceExternalTransactionId: row.referenceExternalTransactionId ?? undefined,
            referenceTransactionId: row.referenceTransaction?.id,
            createdAt: row.createdAt,
            status: row.status as WagerTransactionStatus,
            failureCode: (row.failureCode as FailureCode | null) ?? undefined,
            processedAt: row.processedAt ?? undefined,
            observedBalance: toObservedBalance(row),
            referenceAttempts: row.referenceAttempts,
            nextReferenceAttemptAt: row.nextReferenceAttemptAt ?? undefined,
        }),

    toRow: (transaction: WagerTransaction): RequiredEntityData<WagerTransactionRow> => ({
        id: transaction.id,
        providerId: transaction.providerId,
        externalTransactionId: transaction.externalTransactionId,
        idempotencyKey: transaction.idempotencyKey,
        payloadHash: transaction.payloadHash,
        wallet: transaction.walletId,
        playerId: transaction.playerId,
        roundId: transaction.roundId,
        gameId: transaction.gameId,
        kind: transaction.kind,
        amount: transaction.money.toJSON().amount,
        currency: transaction.money.currency,
        referenceExternalTransactionId: transaction.referenceExternalTransactionId ?? null,
        referenceTransaction: transaction.referenceTransactionId ?? null,
        status: transaction.status,
        failureCode: transaction.failureCode ?? null,
        observedBalanceAmount: transaction.observedBalance?.toJSON().amount ?? null,
        observedBalanceCurrency: transaction.observedBalance?.currency ?? null,
        referenceAttempts: transaction.referenceAttempts,
        nextReferenceAttemptAt: transaction.nextReferenceAttemptAt ?? null,
        createdAt: transaction.createdAt,
        processedAt: transaction.processedAt ?? null,
    }),

    toStatusChange: (transaction: WagerTransaction): EntityData<WagerTransactionRow> => ({
        status: transaction.status,
        referenceTransaction: transaction.referenceTransactionId ?? null,
        failureCode: transaction.failureCode ?? null,
        processedAt: transaction.processedAt ?? null,
        observedBalanceAmount: transaction.observedBalance?.toJSON().amount ?? null,
        observedBalanceCurrency: transaction.observedBalance?.currency ?? null,
        referenceAttempts: transaction.referenceAttempts,
        nextReferenceAttemptAt: transaction.nextReferenceAttemptAt ?? null,
    }),
}
