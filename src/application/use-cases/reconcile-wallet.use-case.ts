import { WalletLedgerEntryRepository, WalletRepository } from '@application/repositories'
import { TransactionManager } from '@application/transaction'
import { WalletNotFoundError } from '@domain/errors'
import { Injectable, Logger } from '@nestjs/common'
import { WalletReconciliation } from './reconcile-wallet.interface'

@Injectable()
export class ReconcileWalletUseCase {
    private readonly logger = new Logger(ReconcileWalletUseCase.name)

    constructor(
        private readonly transactionManager: TransactionManager,
        private readonly walletRepository: WalletRepository,
        private readonly walletLedgerEntryRepository: WalletLedgerEntryRepository,
    ) {}

    async execute(walletId: string): Promise<WalletReconciliation> {
        const { wallet, ledgerBalance } = await this.transactionManager.runReadOnlySnapshot(async () => {
            const wallet = await this.walletRepository.findById(walletId)

            if (!wallet) throw new WalletNotFoundError(walletId)

            const ledgerBalance = await this.walletLedgerEntryRepository.calculateBalance(wallet.id, wallet.currency)
            return { wallet, ledgerBalance }
        })

        const difference = wallet.balance.subtract(ledgerBalance.balance)
        const reconciliation: WalletReconciliation = {
            walletId: wallet.id,
            storedBalance: wallet.balance,
            calculatedBalance: ledgerBalance.balance,
            difference,
            consistent: difference.isZero(),
            checkedEntries: ledgerBalance.entries,
        }

        if (!reconciliation.consistent) this.logDivergence(reconciliation)

        return reconciliation
    }

    private logDivergence(reconciliation: WalletReconciliation): void {
        this.logger.error('Wallet balance diverges from ledger', {
            walletId: reconciliation.walletId,
            storedBalance: reconciliation.storedBalance.toJSON(),
            calculatedBalance: reconciliation.calculatedBalance.toJSON(),
            difference: reconciliation.difference.toJSON(),
            checkedEntries: reconciliation.checkedEntries,
        })
    }
}
