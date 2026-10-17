import { DomainError } from './domain-error'
import { FailureCode } from './failure-code.enum'

export class MessageIdConflictError extends DomainError {
    constructor(consumerName: string, messageId: string) {
        super(
            FailureCode.MessageIdConflict,
            `Message ${messageId} was already consumed by ${consumerName} with a different payload`,
        )
    }
}
