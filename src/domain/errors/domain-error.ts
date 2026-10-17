import { FailureCode } from './failure-code.enum'

export abstract class DomainError extends Error {
    constructor(
        public readonly code: FailureCode,
        message: string = code,
    ) {
        super(message)
        this.name = new.target.name
    }
}
