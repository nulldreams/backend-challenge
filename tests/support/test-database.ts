import { env } from '@infra/config'
import { SQL } from 'bun'

export const testDatabase = new SQL({
    hostname: env.postgres.host,
    port: env.postgres.port,
    username: env.postgres.user,
    password: env.postgres.password,
    database: env.postgres.database,
    max: 5,
})
