import { describeError } from '@application/messaging'
import { WagerTransactionProcessor } from '@application/processing'
import { WagerTransactionRepository, WalletRepository } from '@application/repositories'
import { TransactionManager } from '@application/transaction'
import { WagerTransaction, WagerTransactionStatus } from '@domain/wager-transaction'
import { Injectable, Logger } from '@nestjs/common'
import { PendingReferencesResult } from './resolve-pending-references.interface'

export const PENDING_REFERENCE_BATCH_SIZE = 10

@Injectable()
export class ResolvePendingReferencesUseCase {
    private readonly logger = new Logger(ResolvePendingReferencesUseCase.name)

    constructor(
        private readonly transactionManager: TransactionManager,
        private readonly walletRepository: WalletRepository,
        private readonly wagerTransactionRepository: WagerTransactionRepository,
        private readonly wagerTransactionProcessor: WagerTransactionProcessor,
    ) {}

    async execute(): Promise<PendingReferencesResult> {
        const candidates = await this.wagerTransactionRepository.findDuePendingReferences(
            new Date(),
            PENDING_REFERENCE_BATCH_SIZE,
        )
        const result: PendingReferencesResult = { candidates: candidates.length, resolved: [], retried: 0 }

        for (const candidate of candidates) {
            try {
                const transaction = await this.transactionManager.run(() => this.resolve(candidate))

                if (transaction?.status === WagerTransactionStatus.PendingReference) result.retried++
                else if (transaction) result.resolved.push(transaction)
            } catch (error) {
                this.logger.error('Pending reference not resolved', {
                    transactionId: candidate.id,
                    error: describeError(error),
                })
            }
        }

        return result
    }

    private async resolve(candidate: WagerTransaction): Promise<WagerTransaction | undefined> {
        const wallet = await this.walletRepository.findByIdForUpdate(candidate.walletId)

        if (!wallet) return undefined

        const now = new Date()
        const transaction = await this.wagerTransactionRepository.findDuePendingReferenceForUpdate(candidate.id, now)

        if (!transaction) return undefined

        const { entry, awaitingReference } = await this.wagerTransactionProcessor.decide(transaction, wallet, now)

        if (awaitingReference) transaction.referenceStillMissing(wallet.balance, now)

        await this.wagerTransactionRepository.update(transaction)

        const stillPending = transaction.status === WagerTransactionStatus.PendingReference
        const context = { correlationId: transaction.id, causationId: transaction.id }
        const events = stillPending
            ? []
            : this.wagerTransactionProcessor.eventsFor(transaction, wallet, entry, context, now)
        await this.wagerTransactionProcessor.persistEffects(transaction, wallet, entry, events, now)

        if (!stillPending) {
            this.logger.log('Pending reference resolved', {
                transactionId: transaction.id,
                walletId: transaction.walletId,
                providerId: transaction.providerId,
                status: transaction.status,
                failureCode: transaction.failureCode,
                attempts: transaction.referenceAttempts,
            })
        }

        return transaction
    }
}
