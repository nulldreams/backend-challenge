import { DomainError } from './domain-error'
import { FailureCode } from './failure-code.enum'

export class WalletNotFoundError extends DomainError {
    constructor(walletId: string) {
        super(FailureCode.WalletNotFound, `Wallet ${walletId} not found`)
    }
}
