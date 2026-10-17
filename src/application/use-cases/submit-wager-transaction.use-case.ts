import { WagerTransactionProcessor } from '@application/processing'
import { InboxMessageRepository, WagerTransactionRepository, WalletRepository } from '@application/repositories'
import { TransactionManager } from '@application/transaction'
import {
    DuplicateWagerTransactionError,
    ExternalTransactionIdConflictError,
    IdempotencyConflictError,
    MessageIdConflictError,
    WalletNotFoundError,
} from '@domain/errors'
import { EventContext } from '@domain/events'
import { InboxMessage } from '@domain/inbox-message'
import { Money } from '@domain/money'
import { computePayloadHash, WagerTransaction } from '@domain/wager-transaction'
import { Injectable } from '@nestjs/common'
import { SubmitWagerTransactionInput, SubmitWagerTransactionResult } from './submit-wager-transaction.interface'

@Injectable()
export class SubmitWagerTransactionUseCase {
    constructor(
        private readonly transactionManager: TransactionManager,
        private readonly walletRepository: WalletRepository,
        private readonly wagerTransactionRepository: WagerTransactionRepository,
        private readonly inboxMessageRepository: InboxMessageRepository,
        private readonly wagerTransactionProcessor: WagerTransactionProcessor,
    ) {}

    async execute({
        idempotencyKey,
        payload,
        context,
        inbox,
    }: SubmitWagerTransactionInput): Promise<SubmitWagerTransactionResult> {
        const transaction = WagerTransaction.create({
            ...payload,
            money: Money.from(payload.money),
            referenceExternalTransactionId: payload.referenceExternalTransactionId,
            idempotencyKey,
            payloadHash: computePayloadHash(payload),
            createdAt: new Date(),
        })

        if (!inbox) {
            const replay = await this.findReplay(transaction)

            if (replay) return replay
        }

        try {
            return await this.transactionManager.run(() => this.process(transaction, context, inbox))
        } catch (error) {
            if (!(error instanceof DuplicateWagerTransactionError)) throw error

            const winner = await this.findReplay(transaction)

            if (winner) return winner
            throw new ExternalTransactionIdConflictError(transaction.providerId, transaction.externalTransactionId)
        }
    }

    private async process(
        transaction: WagerTransaction,
        context: EventContext,
        inbox: InboxMessage | undefined,
    ): Promise<SubmitWagerTransactionResult> {
        if (inbox) {
            const duplicate = await this.recordInbox(inbox, transaction)

            if (duplicate) return duplicate
        }

        const wallet = await this.walletRepository.findByIdForUpdate(transaction.walletId)

        if (!wallet) throw new WalletNotFoundError(transaction.walletId)

        const replay = await this.findReplay(transaction)

        if (replay) return replay

        const at = new Date()
        const { entry, awaitingReference } = await this.wagerTransactionProcessor.decide(transaction, wallet, at)

        if (awaitingReference) transaction.markPendingReference(wallet.balance, at)

        await this.wagerTransactionRepository.insert(transaction)

        const events = this.wagerTransactionProcessor.eventsFor(transaction, wallet, entry, context, at)
        await this.wagerTransactionProcessor.persistEffects(transaction, wallet, entry, events, at)

        return { transaction, idempotentReplay: false }
    }

    private async recordInbox(
        inbox: InboxMessage,
        transaction: WagerTransaction,
    ): Promise<SubmitWagerTransactionResult | undefined> {
        inbox.markProcessed(new Date())

        if (await this.inboxMessageRepository.insertIfAbsent(inbox)) return undefined

        const existing = await this.inboxMessageRepository.find(inbox.consumerName, inbox.messageId)

        if (!existing?.matchesPayload(inbox.payloadHash)) {
            throw new MessageIdConflictError(inbox.consumerName, inbox.messageId)
        }

        return this.findReplay(transaction)
    }

    private async findReplay(transaction: WagerTransaction): Promise<SubmitWagerTransactionResult | undefined> {
        const existing = await this.wagerTransactionRepository.findByIdempotencyKey(transaction.idempotencyKey)

        if (!existing) return undefined

        if (!existing.matchesPayload(transaction.payloadHash)) {
            throw new IdempotencyConflictError(transaction.idempotencyKey)
        }

        return { transaction: existing, idempotentReplay: true }
    }
}
