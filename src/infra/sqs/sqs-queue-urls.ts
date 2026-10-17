import { GetQueueUrlCommand, SQSClient } from '@aws-sdk/client-sqs'
import { Injectable } from '@nestjs/common'

@Injectable()
export class SqsQueueUrls {
    private readonly urls = new Map<string, Promise<string>>()

    constructor(private readonly sqs: SQSClient) {}

    get(queueName: string): Promise<string> {
        const cached = this.urls.get(queueName)

        if (cached) return cached

        const url = this.sqs
            .send(new GetQueueUrlCommand({ QueueName: queueName }))
            .then((output) => output.QueueUrl as string)
        url.catch(() => this.urls.delete(queueName))
        this.urls.set(queueName, url)

        return url
    }
}
