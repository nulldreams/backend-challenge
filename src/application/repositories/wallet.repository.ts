import { Wallet } from '@domain/wallet'

export abstract class WalletRepository {
    abstract insert(wallet: Wallet): Promise<void>
    abstract findById(id: string): Promise<Wallet | undefined>
    abstract findByIdForUpdate(id: string): Promise<Wallet | undefined>
    abstract update(wallet: Wallet): Promise<void>
}
