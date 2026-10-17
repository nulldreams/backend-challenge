import { CurrencyMismatchError, InvalidMoneyError } from '@domain/errors'
import { brl, usd } from '@tests/fixtures'
import { describe, expect, test } from 'bun:test'
import { additions, invalidAmounts, scaleCases, subtractions } from './money.data-provider'

describe('Money', () => {
    test.each(scaleCases)('fixed scale of 2 decimals: $description', ({ input, expected }) => {
        expect(brl(input).toJSON()).toEqual({ amount: expected, currency: 'BRL' })
    })

    test.each(invalidAmounts)('rejects invalid input: $description', ({ input }) => {
        expect(() => brl(input)).toThrow(InvalidMoneyError)
    })

    test.each(additions)('add: $description', ({ left, right, expected }) => {
        expect(brl(left).add(brl(right)).toJSON().amount).toBe(expected)
    })

    test.each(subtractions)('subtract: $description', ({ left, right, expected }) => {
        expect(brl(left).subtract(brl(right)).toJSON().amount).toBe(expected)
    })

    test('operation between different currencies throws CurrencyMismatchError', () => {
        expect(() => brl('10.00').add(usd('10.00'))).toThrow(CurrencyMismatchError)
        expect(() => brl('10.00').subtract(usd('10.00'))).toThrow(CurrencyMismatchError)
    })

    test('isLessThan compare amounts of the same currency', () => {
        expect(brl('10.00').isLessThan(brl('20.00'))).toBe(true)
        expect(brl('20.00').isLessThan(brl('10.00'))).toBe(false)
        expect(brl('10.00').isLessThan(brl('10.00'))).toBe(false)
    })

    test('isLessThan between different currencies throws CurrencyMismatchError', () => {
        expect(() => brl('10.00').isLessThan(usd('20.00'))).toThrow(CurrencyMismatchError)
    })

    test('toString should return a string with 2 decimals and the currency code', () => {
        expect(brl('10.00').toString()).toBe('10.00 BRL')
        expect(brl('0.05').subtract(brl('0.10')).toString()).toBe('-0.05 BRL')
    })
})
