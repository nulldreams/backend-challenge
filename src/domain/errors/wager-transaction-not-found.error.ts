import { DomainError } from './domain-error'
import { FailureCode } from './failure-code.enum'

export class WagerTransactionNotFoundError extends DomainError {
    constructor(transactionId: string) {
        super(FailureCode.WagerTransactionNotFound, `Wager transaction ${transactionId} not found`)
    }
}
