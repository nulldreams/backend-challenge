import { GetProviderWagerTransactionUseCase } from '@application/use-cases'
import { ProviderAuthGuard, ZodValidationPipe } from '@infra/http'
import { Controller, Get, Param, UseGuards } from '@nestjs/common'
import { type ProviderTransactionParams, providerTransactionParamsSchema } from './wager-transaction.params'
import { toWagerTransactionResponse, type WagerTransactionResponse } from './wager-transaction.response'

@Controller('providers')
@UseGuards(ProviderAuthGuard)
export class ProviderTransactionsController {
    constructor(private readonly getProviderWagerTransactionUseCase: GetProviderWagerTransactionUseCase) {}

    @Get(':providerId/wagering/transactions/:externalTransactionId')
    async get(
        @Param(new ZodValidationPipe(providerTransactionParamsSchema)) params: ProviderTransactionParams,
    ): Promise<WagerTransactionResponse> {
        const transaction = await this.getProviderWagerTransactionUseCase.execute(params)

        return toWagerTransactionResponse(transaction)
    }
}
