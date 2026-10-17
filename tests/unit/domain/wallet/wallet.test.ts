import { CurrencyMismatchError, InsufficientFundsError, InvalidMoneyError } from '@domain/errors'
import { LedgerDirection } from '@domain/ledger-entry'
import { Wallet } from '@domain/wallet'
import { brl, usd } from '@tests/fixtures'
import { describe, expect, test } from 'bun:test'

const at = new Date('2026-01-01T00:00:00.000Z')
const openWallet = (initialBalance = '100.00') =>
    Wallet.open({
        id: 'wallet-1',
        playerId: 'player-1',
        initialBalance: brl(initialBalance),
        openingTransactionId: 'tx-opening',
        at,
    })

describe('Wallet', () => {
    test('opens at version 1 with an opening CREDIT entry', () => {
        const { wallet, openingEntry } = openWallet('100.00')

        expect(wallet.version).toBe(1)
        expect(wallet.balance).toEqual(brl('100.00'))
        expect(openingEntry?.direction).toBe(LedgerDirection.Credit)
        expect(openingEntry?.balanceBefore).toEqual(brl('0.00'))
        expect(openingEntry?.balanceAfter).toEqual(brl('100.00'))
    })

    test('opening with zero balance produce no entry', () => {
        const { wallet, openingEntry } = openWallet('0.00')

        expect(wallet.version).toBe(1)
        expect(openingEntry).toBeUndefined()
    })

    test('rehydrate should rebuild the persisted state without revalidating', () => {
        const createdAt = new Date('2025-01-01T00:00:00.000Z')
        const wallet = Wallet.rehydrate({
            id: 'wallet-1',
            playerId: 'player-1',
            currency: 'BRL',
            balance: brl('50.00'),
            version: 7,
            createdAt,
            updatedAt: at,
        })

        expect(wallet.id).toBe('wallet-1')
        expect(wallet.playerId).toBe('player-1')
        expect(wallet.currency).toBe('BRL')
        expect(wallet.balance).toEqual(brl('50.00'))
        expect(wallet.version).toBe(7)
        expect(wallet.createdAt).toEqual(createdAt)
        expect(wallet.updatedAt).toEqual(at)
    })

    test('a movement updates updatedAt and keeps createdAt unchanged', () => {
        const { wallet } = openWallet('100.00')
        const later = new Date('2026-01-02T00:00:00.000Z')

        wallet.credit({ money: brl('50.00'), transactionId: 'tx-win', at: later })

        expect(wallet.updatedAt).toEqual(later)
        expect(wallet.createdAt).toEqual(at)
    })

    test('debit changes the balance, increments version and returns the matching entry', () => {
        const { wallet } = openWallet('100.00')
        const entry = wallet.debit({ money: brl('80.00'), transactionId: 'tx-bet-1', at })

        expect(wallet.balance).toEqual(brl('20.00'))
        expect(wallet.version).toBe(2)
        expect(entry.direction).toBe(LedgerDirection.Debit)
        expect(entry.transactionId).toBe('tx-bet-1')
        expect(entry.balanceBefore).toEqual(brl('100.00'))
        expect(entry.balanceAfter).toEqual(brl('20.00'))
    })

    test('credit changes the balance, increments version and returns the matching entry', () => {
        const { wallet } = openWallet('100.00')

        const entry = wallet.credit({ money: brl('50.00'), transactionId: 'tx-win', at })

        expect(wallet.balance).toEqual(brl('150.00'))
        expect(wallet.version).toBe(2)
        expect(entry.direction).toBe(LedgerDirection.Credit)
        expect(entry.balanceAfter).toEqual(brl('150.00'))
    })

    test('balance never negative: debit above balance throws and leaves state unchanged', () => {
        const { wallet } = openWallet('100.00')
        wallet.debit({ money: brl('80.00'), transactionId: 'tx-bet-1', at })

        expect(() => wallet.debit({ money: brl('20.01'), transactionId: 'tx-bet-2', at })).toThrow(
            InsufficientFundsError,
        )
        expect(wallet.balance).toEqual(brl('20.00'))
        expect(wallet.version).toBe(2)
    })

    test('opening currency must match wallet currency', () => {
        const { wallet } = openWallet('100.00')
        const usdMoney = usd('10.00')

        expect(() => wallet.debit({ money: usdMoney, transactionId: 'tx-1', at })).toThrow(CurrencyMismatchError)
        expect(() => wallet.credit({ money: usdMoney, transactionId: 'tx-2', at })).toThrow(CurrencyMismatchError)
        expect(wallet.version).toBe(1)
    })

    test('version only changes when the balance changes: zero amount movement is rejected', () => {
        const { wallet } = openWallet('100.00')

        expect(() => wallet.debit({ money: brl('0.00'), transactionId: 'tx-1', at })).toThrow(InvalidMoneyError)
        expect(wallet.version).toBe(1)
    })
})
