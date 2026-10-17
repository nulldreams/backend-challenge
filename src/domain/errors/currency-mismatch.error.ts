import { DomainError } from './domain-error'
import { FailureCode } from './failure-code.enum'

export class CurrencyMismatchError extends DomainError {
    constructor(message: string) {
        super(FailureCode.CurrencyMismatch, message)
    }
}
