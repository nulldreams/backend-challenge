import {
    GetWagerTransactionUseCase,
    type SubmitWagerTransactionResult,
    SubmitWagerTransactionUseCase,
} from '@application/use-cases'
import { CorrelationId, ProviderAuthGuard, ZodValidationPipe } from '@infra/http'
import { recordDuplicateConflict, recordLockConflict, recordSubmission, startProcessingTimer } from '@infra/metrics'
import { Body, Controller, Get, Logger, Param, Post, Res, UseGuards } from '@nestjs/common'
import { IdempotencyKey, idempotencyKeySchema } from './idempotency-key.header'
import {
    type SubmitWagerTransactionRequest,
    submitWagerTransactionRequestSchema,
} from './submit-wager-transaction.request'
import { transactionIdSchema } from './wager-transaction.params'
import {
    httpStatusOf,
    type SubmitWagerTransactionResponse,
    toSubmitWagerTransactionResponse,
    toWagerTransactionResponse,
    type WagerTransactionResponse,
} from './wager-transaction.response'

interface HttpResponse {
    status(code: number): void
}

@Controller('wagering')
@UseGuards(ProviderAuthGuard)
export class WageringController {
    private readonly logger = new Logger(WageringController.name)

    constructor(
        private readonly submitWagerTransactionUseCase: SubmitWagerTransactionUseCase,
        private readonly getWagerTransactionUseCase: GetWagerTransactionUseCase,
    ) {}

    @Post('transactions')
    async submit(
        @IdempotencyKey(new ZodValidationPipe(idempotencyKeySchema)) idempotencyKey: string,
        @Body(new ZodValidationPipe(submitWagerTransactionRequestSchema)) payload: SubmitWagerTransactionRequest,
        @CorrelationId() correlationId: string,
        @Res({ passthrough: true }) response: HttpResponse,
    ): Promise<SubmitWagerTransactionResponse> {
        const finishTimer = startProcessingTimer('http')

        try {
            const result = await this.submitWagerTransactionUseCase.execute({
                idempotencyKey,
                payload,
                context: { correlationId },
            })
            finishTimer(recordSubmission(result, 'http'))
            this.logSubmission(result)

            response.status(httpStatusOf(result.transaction))
            return toSubmitWagerTransactionResponse(result)
        } catch (error) {
            finishTimer('error')
            recordDuplicateConflict(error, 'http')
            recordLockConflict(error, 'http')
            throw error
        }
    }

    @Get('transactions/:transactionId')
    async get(
        @Param('transactionId', new ZodValidationPipe(transactionIdSchema)) transactionId: string,
    ): Promise<WagerTransactionResponse> {
        const transaction = await this.getWagerTransactionUseCase.execute(transactionId)

        return toWagerTransactionResponse(transaction)
    }

    private logSubmission({ transaction, idempotentReplay }: SubmitWagerTransactionResult): void {
        this.logger.log('Transaction submitted', {
            transactionId: transaction.id,
            walletId: transaction.walletId,
            providerId: transaction.providerId,
            kind: transaction.kind,
            status: transaction.status,
            failureCode: transaction.failureCode,
            idempotentReplay,
        })
    }
}
