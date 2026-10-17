import { UnbalancedLedgerEntryError } from '@domain/errors'
import { LedgerDirection, WalletLedgerEntry } from '@domain/ledger-entry'
import { brl } from '@tests/fixtures'
import { describe, expect, test } from 'bun:test'

describe('WalletLedgerEntry', () => {
    test('create rejects an entry where balanceBefore ± money ≠ balanceAfter', () => {
        expect(() =>
            WalletLedgerEntry.create({
                walletId: 'wallet-1',
                transactionId: 'tx-1',
                walletVersion: 2,
                direction: LedgerDirection.Debit,
                money: brl('80.00'),
                balanceBefore: brl('100.00'),
                balanceAfter: brl('30.00'), // should be 20.00
                createdAt: new Date(),
            }),
        ).toThrow(UnbalancedLedgerEntryError)
    })
})
