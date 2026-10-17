import { WalletRepository } from '@application/repositories'
import { WalletNotFoundError } from '@domain/errors'
import { Wallet } from '@domain/wallet'
import { Injectable } from '@nestjs/common'

@Injectable()
export class GetWalletUseCase {
    constructor(private readonly walletRepository: WalletRepository) {}

    async execute(walletId: string): Promise<Wallet> {
        const wallet = await this.walletRepository.findById(walletId)
        if (!wallet) throw new WalletNotFoundError(walletId)

        return wallet
    }
}
