import { DomainError } from './domain-error'
import { FailureCode } from './failure-code.enum'

export class InsufficientFundsError extends DomainError {
    constructor(message: string) {
        super(FailureCode.InsufficientFunds, message)
    }
}
