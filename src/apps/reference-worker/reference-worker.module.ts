import { WagerTransactionProcessor } from '@application/processing'
import { ResolvePendingReferencesUseCase } from '@application/use-cases'
import { DatabaseModule } from '@infra/database'
import { Module } from '@nestjs/common'
import { PendingReferenceWorker } from './pending-reference.worker'

@Module({
    imports: [DatabaseModule],
    providers: [WagerTransactionProcessor, ResolvePendingReferencesUseCase, PendingReferenceWorker],
})
export class ReferenceWorkerModule {}
