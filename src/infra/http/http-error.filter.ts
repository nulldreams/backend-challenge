import { DomainError, FailureCode } from '@domain/errors'
import { isTransientDatabaseError } from '@infra/database'
import { ArgumentsHost, Catch, HttpStatus } from '@nestjs/common'
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core'

const statusByFailureCode: Record<FailureCode, HttpStatus> = {
    [FailureCode.InvalidAmount]: HttpStatus.BAD_REQUEST,
    [FailureCode.InvalidCurrency]: HttpStatus.BAD_REQUEST,
    [FailureCode.KindNotAllowed]: HttpStatus.BAD_REQUEST,
    [FailureCode.ReferenceRequired]: HttpStatus.BAD_REQUEST,
    [FailureCode.ReferenceNotAllowed]: HttpStatus.BAD_REQUEST,

    [FailureCode.WalletAlreadyExists]: HttpStatus.CONFLICT,
    [FailureCode.IdempotencyConflict]: HttpStatus.CONFLICT,
    [FailureCode.ExternalTransactionIdConflict]: HttpStatus.CONFLICT,
    [FailureCode.MessageIdConflict]: HttpStatus.CONFLICT,

    [FailureCode.WalletNotFound]: HttpStatus.NOT_FOUND,
    [FailureCode.WagerTransactionNotFound]: HttpStatus.NOT_FOUND,

    [FailureCode.CurrencyMismatch]: HttpStatus.UNPROCESSABLE_ENTITY,
    [FailureCode.InsufficientFunds]: HttpStatus.UNPROCESSABLE_ENTITY,
    [FailureCode.WalletPlayerMismatch]: HttpStatus.UNPROCESSABLE_ENTITY,
    [FailureCode.InvalidReferenceKind]: HttpStatus.UNPROCESSABLE_ENTITY,
    [FailureCode.ReferenceMismatch]: HttpStatus.UNPROCESSABLE_ENTITY,
    [FailureCode.ReferenceAmountMismatch]: HttpStatus.UNPROCESSABLE_ENTITY,
    [FailureCode.ReferenceNotProcessed]: HttpStatus.UNPROCESSABLE_ENTITY,
    [FailureCode.AlreadyReversed]: HttpStatus.UNPROCESSABLE_ENTITY,
    [FailureCode.ReversalInsufficientFunds]: HttpStatus.UNPROCESSABLE_ENTITY,
    [FailureCode.ReferenceNotFound]: HttpStatus.UNPROCESSABLE_ENTITY,
}

@Catch()
export class HttpErrorFilter extends BaseExceptionFilter {
    constructor(private readonly adapterHost: HttpAdapterHost) {
        super(adapterHost.httpAdapter)
    }

    override catch(error: unknown, host: ArgumentsHost): void {
        const { httpAdapter } = this.adapterHost
        const response = host.switchToHttp().getResponse()

        if (error instanceof DomainError) {
            const statusCode = statusByFailureCode[error.code]
            httpAdapter.reply(response, { statusCode, code: error.code, message: error.message }, statusCode)
            return
        }

        if (isTransientDatabaseError(error)) {
            const statusCode = HttpStatus.SERVICE_UNAVAILABLE
            const body = { statusCode, code: 'SERVICE_UNAVAILABLE', message: 'Retry with the same Idempotency-Key' }
            httpAdapter.setHeader(response, 'Retry-After', '1')
            httpAdapter.reply(response, body, statusCode)
            return
        }

        super.catch(error, host)
    }
}
