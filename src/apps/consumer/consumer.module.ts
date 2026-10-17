import { WagerTransactionProcessor } from '@application/processing'
import { SubmitWagerTransactionUseCase } from '@application/use-cases'
import { DatabaseModule } from '@infra/database'
import { SqsModule } from '@infra/sqs'
import { Module } from '@nestjs/common'
import { WagerTransactionConsumer } from './wager-transaction.consumer'

@Module({
    imports: [DatabaseModule, SqsModule],
    providers: [WagerTransactionProcessor, SubmitWagerTransactionUseCase, WagerTransactionConsumer],
})
export class ConsumerModule {}
