import {
    OutboxMessageRepository,
    WagerTransactionRepository,
    WalletLedgerEntryRepository,
    WalletRepository,
} from '@application/repositories'
import {
    CurrencyMismatchError,
    DomainError,
    FailureCode,
    InsufficientFundsError,
    InvalidWagerTransactionError,
} from '@domain/errors'
import {
    EventContext,
    IntegrationEvent,
    WagerTransactionPendingReference,
    WagerTransactionProcessed,
    WagerTransactionRejected,
    WalletBalanceChanged,
} from '@domain/events'
import { LedgerDirection, WalletLedgerEntry } from '@domain/ledger-entry'
import { OutboxMessage } from '@domain/outbox-message'
import { WagerTransaction, WagerTransactionStatus } from '@domain/wager-transaction'
import { Wallet } from '@domain/wallet'
import { Injectable } from '@nestjs/common'
import { WagerTransactionDecision } from './wager-transaction-decision.interface'

@Injectable()
export class WagerTransactionProcessor {
    constructor(
        private readonly walletRepository: WalletRepository,
        private readonly walletLedgerEntryRepository: WalletLedgerEntryRepository,
        private readonly wagerTransactionRepository: WagerTransactionRepository,
        private readonly outboxMessageRepository: OutboxMessageRepository,
    ) {}

    async decide(transaction: WagerTransaction, wallet: Wallet, at: Date): Promise<WagerTransactionDecision> {
        try {
            if (wallet.playerId !== transaction.playerId) {
                throw new InvalidWagerTransactionError(FailureCode.WalletPlayerMismatch)
            }

            if (wallet.currency !== transaction.money.currency) {
                throw new CurrencyMismatchError(`Currency mismatch: wallet ${wallet.currency} vs ${transaction.money}`)
            }

            if (!transaction.affectsBalance()) {
                transaction.markProcessed(undefined, wallet.balance, at)
                return { awaitingReference: false }
            }

            const reference = await this.findReference(transaction)

            if (transaction.referenceExternalTransactionId && reference?.status !== WagerTransactionStatus.Processed) {
                return { awaitingReference: true }
            }

            const movement = { money: transaction.money, transactionId: transaction.id, at }
            const entry =
                transaction.ledgerDirectionFor(reference) === LedgerDirection.Debit
                    ? wallet.debit(movement)
                    : wallet.credit(movement)
            transaction.markProcessed(reference?.id, wallet.balance, at)

            return { entry, awaitingReference: false }
        } catch (error) {
            if (!(error instanceof DomainError)) throw error

            const code =
                error instanceof InsufficientFundsError && transaction.requiresReference()
                    ? FailureCode.ReversalInsufficientFunds
                    : error.code
            transaction.reject(code, wallet.balance)

            return { awaitingReference: false }
        }
    }

    eventsFor(
        transaction: WagerTransaction,
        wallet: Wallet,
        entry: WalletLedgerEntry | undefined,
        context: EventContext,
        at: Date,
    ): IntegrationEvent<unknown>[] {
        switch (transaction.status) {
            case WagerTransactionStatus.Processed:
                return [
                    WagerTransactionProcessed.from(transaction, context),
                    ...(entry ? [WalletBalanceChanged.from(wallet, entry, context)] : []),
                ]
            case WagerTransactionStatus.Rejected:
                return [WagerTransactionRejected.from(transaction, context, at)]
            case WagerTransactionStatus.PendingReference:
                return [WagerTransactionPendingReference.from(transaction, context, at)]
            default:
                return []
        }
    }

    async persistEffects(
        transaction: WagerTransaction,
        wallet: Wallet,
        entry: WalletLedgerEntry | undefined,
        events: IntegrationEvent<unknown>[],
        at: Date,
    ): Promise<void> {
        if (entry) {
            await this.walletRepository.update(wallet)
            await this.walletLedgerEntryRepository.append(entry)
        }

        await this.outboxMessageRepository.add(events.map(OutboxMessage.enqueue))

        if (transaction.isTerminal()) {
            await this.wagerTransactionRepository.wakePendingReferencesTo(
                transaction.providerId,
                transaction.externalTransactionId,
                at,
            )
        }
    }

    private async findReference(transaction: WagerTransaction): Promise<WagerTransaction | undefined> {
        if (!transaction.referenceExternalTransactionId) return undefined

        const reference = await this.wagerTransactionRepository.findByProviderAndExternalId(
            transaction.providerId,
            transaction.referenceExternalTransactionId,
        )

        if (!reference) return undefined

        transaction.assertValidReference(reference)
        const alreadyReversed =
            transaction.requiresReference() &&
            (await this.wagerTransactionRepository.hasProcessedReversal(reference.id, transaction.kind))

        if (alreadyReversed) throw new InvalidWagerTransactionError(FailureCode.AlreadyReversed)

        return reference
    }
}
