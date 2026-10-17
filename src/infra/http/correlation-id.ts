import { runWithContext } from '@infra/logging'
import { createParamDecorator, ExecutionContext, Logger } from '@nestjs/common'
import { z } from 'zod'

export const CORRELATION_ID_HEADER = 'x-correlation-id'

const correlationIdSchema = z.string().trim().min(1).max(128)
const UNLOGGED_PATHS = /^\/(health\/|metrics$)/

interface HttpRequest {
    method: string
    originalUrl: string
    headers: Record<string, string | string[] | undefined>
}

interface HttpResponse {
    statusCode: number
    setHeader(name: string, value: string): void
    once(event: 'finish', listener: () => void): void
}

const logger = new Logger('HTTP')

export function correlationIdMiddleware(request: HttpRequest, response: HttpResponse, next: () => void): void {
    const parsed = correlationIdSchema.safeParse(request.headers[CORRELATION_ID_HEADER])
    const correlationId = parsed.success ? parsed.data : Bun.randomUUIDv7()
    request.headers[CORRELATION_ID_HEADER] = correlationId
    response.setHeader('X-Correlation-Id', correlationId)

    const path = request.originalUrl.split('?')[0] ?? request.originalUrl
    const startedAt = performance.now()

    runWithContext({ correlationId }, () => {
        if (!UNLOGGED_PATHS.test(path)) {
            response.once('finish', () =>
                logger.log('Request completed', {
                    method: request.method,
                    path,
                    status: response.statusCode,
                    durationMs: Math.round(performance.now() - startedAt),
                }),
            )
        }

        next()
    })
}

export const CorrelationId = createParamDecorator(
    (_data: unknown, context: ExecutionContext): string =>
        context.switchToHttp().getRequest<HttpRequest>().headers[CORRELATION_ID_HEADER] as string,
)
