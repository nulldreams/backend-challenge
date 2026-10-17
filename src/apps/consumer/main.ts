import 'reflect-metadata'

import { bootstrapWorker } from '@infra/workers'
import { ConsumerModule } from './consumer.module'
import { WagerTransactionConsumer } from './wager-transaction.consumer'

await bootstrapWorker(ConsumerModule, WagerTransactionConsumer)
