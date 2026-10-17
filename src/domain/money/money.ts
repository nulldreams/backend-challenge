import { CurrencyMismatchError, FailureCode, InvalidMoneyError } from '@domain/errors'
import { MoneyProps } from './money.interface'

const SCALE = 2
const FACTOR = 10n ** BigInt(SCALE)

const AMOUNT_PATTERN = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/
const CURRENCY_PATTERN = /^[A-Z]{3}$/

export class Money {
    private constructor(
        private readonly value: bigint,
        public readonly currency: string,
    ) {}

    static from(props: MoneyProps): Money {
        const { amount, currency } = props

        if (typeof currency !== 'string' || !CURRENCY_PATTERN.test(currency)) {
            throw new InvalidMoneyError(FailureCode.InvalidCurrency, `Invalid currency: ${currency}`)
        }

        const match = typeof amount === 'string' ? AMOUNT_PATTERN.exec(amount) : null
        if (!match) throw new InvalidMoneyError(FailureCode.InvalidAmount, `Invalid amount: ${amount}`)

        const [, integer, fraction = ''] = match
        return new Money(BigInt(`${integer}${fraction.padEnd(SCALE, '0')}`), currency)
    }

    static zero(currency: string): Money {
        return Money.from({ amount: '0', currency })
    }

    add(other: Money): Money {
        this.assertSameCurrency(other)
        return new Money(this.value + other.value, this.currency)
    }

    subtract(other: Money): Money {
        this.assertSameCurrency(other)
        return new Money(this.value - other.value, this.currency)
    }

    negate(): Money {
        return new Money(-this.value, this.currency)
    }

    isZero(): boolean {
        return this.value === 0n
    }

    isPositive(): boolean {
        return this.value > 0n
    }

    isNegative(): boolean {
        return this.value < 0n
    }

    isLessThan(other: Money): boolean {
        this.assertSameCurrency(other)
        return this.value < other.value
    }

    equals(other: Money): boolean {
        return this.currency === other.currency && this.value === other.value
    }

    toJSON(): MoneyProps {
        const abs = this.value < 0n ? -this.value : this.value
        const fraction = (abs % FACTOR).toString().padStart(SCALE, '0')
        const sign = this.value < 0n ? '-' : ''
        return { amount: `${sign}${abs / FACTOR}.${fraction}`, currency: this.currency }
    }

    toString(): string {
        return `${this.toJSON().amount} ${this.currency}`
    }

    private assertSameCurrency(other: Money): void {
        if (other.currency !== this.currency) {
            throw new CurrencyMismatchError(`Currency mismatch: ${this.currency} vs ${other.currency}`)
        }
    }
}
