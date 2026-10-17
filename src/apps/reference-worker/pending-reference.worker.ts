import { PENDING_REFERENCE_BATCH_SIZE, ResolvePendingReferencesUseCase } from '@application/use-cases'
import { metrics } from '@infra/metrics'
import { WorkerLoop } from '@infra/workers'
import { Injectable } from '@nestjs/common'

@Injectable()
export class PendingReferenceWorker extends WorkerLoop {
    constructor(private readonly resolvePendingReferencesUseCase: ResolvePendingReferencesUseCase) {
        super()
    }

    protected async tick(): Promise<boolean> {
        const { candidates, resolved, retried } = await this.resolvePendingReferencesUseCase.execute()

        for (const transaction of resolved) {
            metrics.transactions.inc({ status: transaction.status, kind: transaction.kind, source: 'reference_worker' })
        }

        if (retried > 0) metrics.retries.inc({ stage: 'pending_reference' }, retried)

        return candidates === PENDING_REFERENCE_BATCH_SIZE
    }
}
