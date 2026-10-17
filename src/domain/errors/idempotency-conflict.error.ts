import { DomainError } from './domain-error'
import { FailureCode } from './failure-code.enum'

export class IdempotencyConflictError extends DomainError {
    constructor(idempotencyKey: string) {
        super(
            FailureCode.IdempotencyConflict,
            `Idempotency-Key ${idempotencyKey} was already used with a different payload`,
        )
    }
}
