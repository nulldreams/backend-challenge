import 'reflect-metadata'

import { env } from '@infra/config'
import { bootstrapHttp } from '@infra/http'
import { ApiModule } from './api.module'

await bootstrapHttp(ApiModule, env.port)
