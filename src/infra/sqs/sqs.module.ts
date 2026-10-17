import { SQSClient } from '@aws-sdk/client-sqs'
import { env } from '@infra/config'
import { Module, OnApplicationShutdown } from '@nestjs/common'
import { SqsQueueUrls } from './sqs-queue-urls'

@Module({
    providers: [
        { provide: SQSClient, useFactory: () => new SQSClient({ region: env.aws.region, endpoint: env.aws.endpoint }) },
        SqsQueueUrls,
    ],
    exports: [SQSClient, SqsQueueUrls],
})
export class SqsModule implements OnApplicationShutdown {
    constructor(private readonly sqs: SQSClient) {}

    onApplicationShutdown(): void {
        this.sqs.destroy()
    }
}
