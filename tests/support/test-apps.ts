import 'reflect-metadata'

import { ApiModule } from '@apps/api'
import { configureHttpApp } from '@infra/http'
import type { INestApplicationContext, Type } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'

export interface RunningApi {
    url: string
    close: () => Promise<void>
}

export async function startApi(): Promise<RunningApi> {
    const app = await NestFactory.create(ApiModule, { logger: false })
    configureHttpApp(app)
    await app.listen(0)

    return { url: await app.getUrl(), close: () => app.close() }
}

export function startContext(module: Type): Promise<INestApplicationContext> {
    return NestFactory.createApplicationContext(module, { logger: false })
}
