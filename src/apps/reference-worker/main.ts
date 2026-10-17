import 'reflect-metadata'

import { bootstrapWorker } from '@infra/workers'
import { PendingReferenceWorker } from './pending-reference.worker'
import { ReferenceWorkerModule } from './reference-worker.module'

await bootstrapWorker(ReferenceWorkerModule, PendingReferenceWorker)
