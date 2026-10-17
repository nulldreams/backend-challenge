import { CurrencyMismatchError, FailureCode, InsufficientFundsError, InvalidMoneyError } from '@domain/errors'
import { LedgerDirection, WalletLedgerEntry } from '@domain/ledger-entry'
import { Money } from '@domain/money'
import { OpenWalletProps, OpenWalletResult, WalletMovementProps, WalletState } from './wallet.interface'

export class Wallet {
    private constructor(
        public readonly id: string,
        public readonly playerId: string,
        public readonly currency: string,
        private _balance: Money,
        private _version: number,
        public readonly createdAt: Date,
        private _updatedAt: Date,
    ) {}

    static open(props: OpenWalletProps): OpenWalletResult {
        const { id, playerId, initialBalance, openingTransactionId, at } = props
        if (initialBalance.isNegative())
            throw new InvalidMoneyError(FailureCode.InvalidAmount, 'Initial balance cannot be negative')

        const wallet = new Wallet(id, playerId, initialBalance.currency, initialBalance, 1, at, at)
        if (initialBalance.isZero()) return { wallet }

        const openingEntry = WalletLedgerEntry.create({
            walletId: id,
            transactionId: openingTransactionId,
            walletVersion: 1,
            direction: LedgerDirection.Credit,
            money: initialBalance,
            balanceBefore: Money.zero(initialBalance.currency),
            balanceAfter: initialBalance,
            createdAt: at,
        })

        return { wallet, openingEntry }
    }

    static rehydrate(state: WalletState): Wallet {
        return new Wallet(
            state.id,
            state.playerId,
            state.currency,
            state.balance,
            state.version,
            state.createdAt,
            state.updatedAt,
        )
    }

    get balance(): Money {
        return this._balance
    }

    get version(): number {
        return this._version
    }

    get updatedAt(): Date {
        return this._updatedAt
    }

    debit(props: WalletMovementProps): WalletLedgerEntry {
        return this.apply(LedgerDirection.Debit, props)
    }

    credit(props: WalletMovementProps): WalletLedgerEntry {
        return this.apply(LedgerDirection.Credit, props)
    }

    private apply(direction: LedgerDirection, { money, transactionId, at }: WalletMovementProps): WalletLedgerEntry {
        this.assertSameCurrency(money)
        if (!money.isPositive())
            throw new InvalidMoneyError(FailureCode.InvalidAmount, 'Movement amount must be positive')

        const balanceBefore = this._balance
        const balanceAfter =
            direction === LedgerDirection.Debit ? balanceBefore.subtract(money) : balanceBefore.add(money)
        if (balanceAfter.isNegative()) throw new InsufficientFundsError(`Insufficient funds in wallet ${this.id}`)

        const entry = WalletLedgerEntry.create({
            walletId: this.id,
            transactionId,
            walletVersion: this._version + 1,
            direction,
            money,
            balanceBefore,
            balanceAfter,
            createdAt: at,
        })

        this._balance = balanceAfter
        this._version++
        this._updatedAt = at

        return entry
    }

    private assertSameCurrency(money: Money): void {
        if (money.currency !== this.currency) {
            throw new CurrencyMismatchError(`Currency mismatch: wallet ${this.currency} vs ${money.currency}`)
        }
    }
}
