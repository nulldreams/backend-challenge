import {
    OutboxMessageRepository,
    WagerTransactionRepository,
    WalletLedgerEntryRepository,
    WalletRepository,
} from '@application/repositories'
import { TransactionManager } from '@application/transaction'
import { WagerTransactionProcessed, WalletBalanceChanged } from '@domain/events'
import { Money } from '@domain/money'
import { OutboxMessage } from '@domain/outbox-message'
import { WagerTransaction } from '@domain/wager-transaction'
import { Wallet } from '@domain/wallet'
import { Injectable } from '@nestjs/common'
import { OpenWalletInput } from './open-wallet.interface'

@Injectable()
export class OpenWalletUseCase {
    constructor(
        private readonly transactionManager: TransactionManager,
        private readonly walletRepository: WalletRepository,
        private readonly wagerTransactionRepository: WagerTransactionRepository,
        private readonly walletLedgerEntryRepository: WalletLedgerEntryRepository,
        private readonly outboxMessageRepository: OutboxMessageRepository,
    ) {}

    async execute({ playerId, initialBalance, context }: OpenWalletInput): Promise<Wallet> {
        const money = Money.from(initialBalance)
        const at = new Date()
        const walletId = Bun.randomUUIDv7()

        const opening = WagerTransaction.opening({ walletId, playerId, money, at })
        const { wallet, openingEntry } = Wallet.open({
            id: walletId,
            playerId,
            initialBalance: money,
            openingTransactionId: opening.id,
            at,
        })

        await this.transactionManager.run(async () => {
            await this.walletRepository.insert(wallet)

            if (!openingEntry) return

            await this.wagerTransactionRepository.insert(opening)
            await this.walletLedgerEntryRepository.append(openingEntry)
            await this.outboxMessageRepository.add(
                [
                    WagerTransactionProcessed.from(opening, context),
                    WalletBalanceChanged.from(wallet, openingEntry, context),
                ].map(OutboxMessage.enqueue),
            )
        })

        return wallet
    }
}
