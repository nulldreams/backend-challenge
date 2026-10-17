import { GetQueueUrlCommand, SQSClient } from '@aws-sdk/client-sqs'
import { env } from '@infra/config'
import { MikroORM } from '@mikro-orm/postgresql'
import { Controller, Get, HttpStatus, Res } from '@nestjs/common'

interface HttpResponse {
    status(code: number): void
}

type DependencyStatus = 'up' | 'down'

const CHECK_TIMEOUT_MS = 1_000

@Controller('health')
export class HealthController {
    constructor(
        private readonly orm: MikroORM,
        private readonly sqs: SQSClient,
    ) {}

    @Get('live')
    live() {
        return { status: 'ok' }
    }

    @Get('ready')
    async ready(@Res({ passthrough: true }) response: HttpResponse) {
        const [postgres, sqs] = await Promise.all([this.checkPostgres(), this.checkSqs()])
        const isReady = postgres === 'up' && sqs === 'up'

        response.status(isReady ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE)
        return { status: isReady ? 'ok' : 'unavailable', checks: { postgres, sqs } }
    }

    private checkPostgres(): Promise<DependencyStatus> {
        return this.probe(() => this.orm.em.getConnection().execute('SELECT 1'))
    }

    private checkSqs(): Promise<DependencyStatus> {
        return this.probe(() =>
            this.sqs.send(new GetQueueUrlCommand({ QueueName: env.aws.queues.wagerTransactions }), {
                abortSignal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
            }),
        )
    }

    private async probe(check: () => Promise<unknown>): Promise<DependencyStatus> {
        try {
            await check()
            return 'up'
        } catch {
            return 'down'
        }
    }
}
