import { ContextLogger } from '@infra/logging'
import { INestApplication, Type } from '@nestjs/common'
import { HttpAdapterHost, NestFactory } from '@nestjs/core'
import { correlationIdMiddleware } from './correlation-id'
import { HttpErrorFilter } from './http-error.filter'

export const configureHttpApp = (app: INestApplication): void => {
    app.enableShutdownHooks()
    app.use(correlationIdMiddleware)
    app.useGlobalFilters(new HttpErrorFilter(app.get(HttpAdapterHost)))
}

export async function bootstrapHttp(module: Type, port: number): Promise<void> {
    const app = await NestFactory.create(module, { logger: new ContextLogger() })
    configureHttpApp(app)
    await app.listen(port)
}
