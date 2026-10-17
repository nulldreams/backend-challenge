import 'reflect-metadata'

import { bootstrapWorker } from '@infra/workers'
import { OutboxPublisherModule } from './outbox-publisher.module'
import { OutboxPublisherWorker } from './outbox-publisher.worker'

await bootstrapWorker(OutboxPublisherModule, OutboxPublisherWorker)
