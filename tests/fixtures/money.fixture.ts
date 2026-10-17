import { Money } from '@domain/money'

export function brl(amount: string) {
    return Money.from({ amount, currency: 'BRL' })
}

export function usd(amount: string) {
    return Money.from({ amount, currency: 'USD' })
}
