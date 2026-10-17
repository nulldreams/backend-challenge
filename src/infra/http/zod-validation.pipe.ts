import { BadRequestException, PipeTransform } from '@nestjs/common'
import type { ZodType } from 'zod'

export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
    constructor(private readonly schema: ZodType<T>) {}

    transform(value: unknown): T {
        const result = this.schema.safeParse(value)
        if (result.success) return result.data

        throw new BadRequestException({
            statusCode: 400,
            code: 'INVALID_PAYLOAD',
            message: 'Invalid payload',
            issues: result.error.issues.map(({ path, message }) => ({ path: path.join('.'), message })),
        })
    }
}
