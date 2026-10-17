import { WagerTransactionProcessor } from '@application/processing'
import {
    GetProviderWagerTransactionUseCase,
    GetWagerTransactionUseCase,
    SubmitWagerTransactionUseCase,
} from '@application/use-cases'
import { DatabaseModule } from '@infra/database'
import { Module } from '@nestjs/common'
import { ProviderTransactionsController } from './provider-transactions.controller'
import { WageringController } from './wagering.controller'

@Module({
    imports: [DatabaseModule],
    controllers: [WageringController, ProviderTransactionsController],
    providers: [
        WagerTransactionProcessor,
        SubmitWagerTransactionUseCase,
        GetWagerTransactionUseCase,
        GetProviderWagerTransactionUseCase,
    ],
})
export class WageringModule {}
