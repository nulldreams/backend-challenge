import { MoneyProps } from '@domain/money'
import { Wallet } from '@domain/wallet'

export interface WalletResponse {
    id: string
    playerId: string
    balance: MoneyProps
    version: number
}

export const toWalletResponse = (wallet: Wallet): WalletResponse => ({
    id: wallet.id,
    playerId: wallet.playerId,
    balance: wallet.balance.toJSON(),
    version: wallet.version,
})
