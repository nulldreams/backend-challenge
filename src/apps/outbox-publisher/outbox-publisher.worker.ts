import { OUTBOX_BATCH_SIZE, PublishOutboxBatchUseCase } from '@application/use-cases'
import { metrics } from '@infra/metrics'
import { WorkerLoop } from '@infra/workers'
import { Injectable } from '@nestjs/common'

@Injectable()
export class OutboxPublisherWorker extends WorkerLoop {
    constructor(private readonly publishOutboxBatchUseCase: PublishOutboxBatchUseCase) {
        super()
    }

    protected async tick(): Promise<boolean> {
        const { claimed, retried } = await this.publishOutboxBatchUseCase.execute()

        if (retried > 0) metrics.retries.inc({ stage: 'outbox_publish' }, retried)

        return claimed === OUTBOX_BATCH_SIZE
    }
}
