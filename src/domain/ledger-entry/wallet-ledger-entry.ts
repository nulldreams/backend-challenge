import { UnbalancedLedgerEntryError } from '@domain/errors'
import { Money } from '@domain/money'
import { LedgerDirection } from './ledger-direction.enum'
import { CreateLedgerEntryProps, LedgerEntryState } from './wallet-ledger-entry.interface'

export class WalletLedgerEntry {
    private constructor(
        public readonly id: string,
        public readonly walletId: string,
        public readonly transactionId: string,
        public readonly walletVersion: number,
        public readonly direction: LedgerDirection,
        public readonly money: Money,
        public readonly balanceBefore: Money,
        public readonly balanceAfter: Money,
        public readonly createdAt: Date,
    ) {}

    static create(props: CreateLedgerEntryProps): WalletLedgerEntry {
        const entry = WalletLedgerEntry.rehydrate({ id: Bun.randomUUIDv7(), ...props })

        if (!entry.isBalanced()) {
            throw new UnbalancedLedgerEntryError(`Unbalanced ledger entry for transaction ${props.transactionId}`)
        }

        return entry
    }

    static rehydrate(state: LedgerEntryState): WalletLedgerEntry {
        return new WalletLedgerEntry(
            state.id,
            state.walletId,
            state.transactionId,
            state.walletVersion,
            state.direction,
            state.money,
            state.balanceBefore,
            state.balanceAfter,
            state.createdAt,
        )
    }

    isBalanced(): boolean {
        const signed = this.direction === LedgerDirection.Debit ? this.money.negate() : this.money
        return this.balanceBefore.add(signed).equals(this.balanceAfter)
    }
}
