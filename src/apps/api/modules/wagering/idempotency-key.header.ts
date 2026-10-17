import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { z } from 'zod'

export const idempotencyKeySchema = z.string({ error: 'Idempotency-Key header is required' }).trim().min(1).max(255)

export const IdempotencyKey = createParamDecorator(
    (_data: unknown, context: ExecutionContext) =>
        context.switchToHttp().getRequest<{ headers: Record<string, unknown> }>().headers['idempotency-key'],
)
