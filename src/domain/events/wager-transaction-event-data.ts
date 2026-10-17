import { MoneyProps } from '@domain/money'
import { WagerTransaction, WagerTransactionKind } from '@domain/wager-transaction'

export interface WagerTransactionEventData {
    transactionId: string
    providerId: string
    externalTransactionId: string
    walletId: string
    playerId: string
    roundId: string
    gameId: string
    kind: WagerTransactionKind
    money: MoneyProps
}

export const toWagerTransactionEventData = (transaction: WagerTransaction): WagerTransactionEventData => ({
    transactionId: transaction.id,
    providerId: transaction.providerId,
    externalTransactionId: transaction.externalTransactionId,
    walletId: transaction.walletId,
    playerId: transaction.playerId,
    roundId: transaction.roundId,
    gameId: transaction.gameId,
    kind: transaction.kind,
    money: transaction.money.toJSON(),
})

export const observedBalanceOf = (transaction: WagerTransaction): MoneyProps => {
    if (!transaction.observedBalance) throw new Error(`Transaction ${transaction.id} has no observed balance`)

    return transaction.observedBalance.toJSON()
}
