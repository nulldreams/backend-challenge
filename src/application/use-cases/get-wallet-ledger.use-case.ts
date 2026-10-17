import { WalletLedgerEntryRepository, WalletRepository } from '@application/repositories'
import { WalletNotFoundError } from '@domain/errors'
import { Injectable } from '@nestjs/common'
import { GetWalletLedgerInput, WalletLedgerPage } from './get-wallet-ledger.interface'

@Injectable()
export class GetWalletLedgerUseCase {
    constructor(
        private readonly walletRepository: WalletRepository,
        private readonly walletLedgerEntryRepository: WalletLedgerEntryRepository,
    ) {}

    async execute({ walletId, afterVersion, limit }: GetWalletLedgerInput): Promise<WalletLedgerPage> {
        const wallet = await this.walletRepository.findById(walletId)
        if (!wallet) throw new WalletNotFoundError(walletId)

        const entries = await this.walletLedgerEntryRepository.listByWallet(walletId, afterVersion, limit + 1)
        const page = entries.slice(0, limit)
        const hasNextPage = entries.length > limit

        return { entries: page, nextAfterVersion: hasNextPage ? page.at(-1)?.walletVersion : undefined }
    }
}
