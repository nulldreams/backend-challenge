import { DomainError } from './domain-error'
import { FailureCode } from './failure-code.enum'

export class WalletAlreadyExistsError extends DomainError {
    constructor(message: string) {
        super(FailureCode.WalletAlreadyExists, message)
    }
}
