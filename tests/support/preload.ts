import { SQL } from 'bun'
import { afterAll, beforeAll } from 'bun:test'

const runId = Date.now().toString(36)

Object.assign(process.env, {
    POSTGRES_DB: 'wagering_test',
    WAGER_TRANSACTIONS_QUEUE: `t${runId}-wager-transactions.fifo`,
    WAGER_TRANSACTIONS_DLQ: `t${runId}-wager-transactions-dlq.fifo`,
    WAGER_EVENTS_QUEUE: `t${runId}-wager-events.fifo`,
    CONSUMER_RETRY_DELAYS_SECONDS: '1,1,1,1',
})

const { env } = await import('@infra/config')
const { createTestQueues, deleteTestQueues } = await import('./test-queues')

async function recreateTestDatabase(): Promise<void> {
    const admin = new SQL({
        hostname: env.postgres.host,
        port: env.postgres.port,
        username: env.postgres.user,
        password: env.postgres.password,
        database: 'postgres',
    })

    await admin.unsafe(`DROP DATABASE IF EXISTS ${env.postgres.database} WITH (FORCE)`)
    await admin.unsafe(`CREATE DATABASE ${env.postgres.database}`)
    await admin.close()
}

async function applyMigrations(): Promise<void> {
    const { MikroORM } = await import('@mikro-orm/postgresql')
    const { mikroOrmConfig } = await import('@infra/database')
    const orm = await MikroORM.init(mikroOrmConfig)
    await orm.migrator.up()
    await orm.close()
}

beforeAll(async () => {
    await recreateTestDatabase()
    await applyMigrations()
    await createTestQueues()
}, 60_000)

afterAll(async () => {
    await deleteTestQueues()
    const { testDatabase } = await import('./test-database')
    await testDatabase.close()
})
