import { DomainError } from './domain-error'
import { FailureCode } from './failure-code.enum'

export class ExternalTransactionIdConflictError extends DomainError {
    constructor(providerId: string, externalTransactionId: string) {
        super(
            FailureCode.ExternalTransactionIdConflict,
            `Transaction ${providerId}:${externalTransactionId} already exists with a different Idempotency-Key`,
        )
    }
}
