import { env } from '@infra/config'
import { mikroOrmConfig } from '@infra/database'
import { MikroORM } from '@mikro-orm/postgresql'
import { testDatabase } from '@tests/support'
import { SQL } from 'bun'
import { beforeAll, describe, expect, test } from 'bun:test'
import { buildInsertTransactionSql, type ConstraintFixture, constraintViolations } from './migrations.data-provider'

const SCHEMA_TABLES = ['inbox_messages', 'outbox_messages', 'wager_transactions', 'wallet_ledger_entries', 'wallets']

const adminConnectionOptions = () => ({
    hostname: env.postgres.host,
    port: env.postgres.port,
    username: env.postgres.user,
    password: env.postgres.password,
    database: 'postgres',
})

async function listSchemaTables(orm: MikroORM): Promise<string[]> {
    const rows = await orm.em.getConnection().execute<{ table_name: string }[]>(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name <> 'mikro_orm_migrations'
          ORDER BY 1`,
    )
    return rows.map((row) => row.table_name)
}

describe('migrations', () => {
    test('entities and migrations are in sync: no pending schema change', async () => {
        const orm = await MikroORM.init(mikroOrmConfig)
        try {
            expect(await orm.migrator.checkSchema()).toBe(false)
        } finally {
            await orm.close()
        }
    })

    test('up, down to the start and up again: reversible and reapplicable', async () => {
        const migrationsDatabase = `${env.postgres.database}_migrations`
        const admin = new SQL(adminConnectionOptions())
        await admin.unsafe(`DROP DATABASE IF EXISTS ${migrationsDatabase} WITH (FORCE)`)
        await admin.unsafe(`CREATE DATABASE ${migrationsDatabase}`)

        const orm = await MikroORM.init({ ...mikroOrmConfig, dbName: migrationsDatabase })
        try {
            const applied = await orm.migrator.up()
            expect(await listSchemaTables(orm)).toEqual(SCHEMA_TABLES)

            const reverted = await orm.migrator.down({ to: 0 })
            expect(reverted).toHaveLength(applied.length)
            expect(await listSchemaTables(orm)).toEqual([])

            await orm.migrator.up()
            expect(await listSchemaTables(orm)).toEqual(SCHEMA_TABLES)
        } finally {
            await orm.close()
            await admin.unsafe(`DROP DATABASE IF EXISTS ${migrationsDatabase} WITH (FORCE)`)
            await admin.close()
        }
    })
})

describe('constraints: the database does not let a bug become wrong data', () => {
    const fixture: ConstraintFixture = {
        walletId: Bun.randomUUIDv7(),
        playerId: Bun.randomUUIDv7(),
        openingId: Bun.randomUUIDv7(),
        betId: Bun.randomUUIDv7(),
    }

    beforeAll(async () => {
        await testDatabase.unsafe(`
            INSERT INTO wallets (id, player_id, currency, balance, version, created_at, updated_at)
            VALUES ('${fixture.walletId}', '${fixture.playerId}', 'BRL', 100, 1, now(), now())`)
        await testDatabase.unsafe(buildInsertTransactionSql(fixture, { id: fixture.openingId, kind: 'OPENING' }))

        await testDatabase.unsafe(
            buildInsertTransactionSql(fixture, {
                id: fixture.betId,
                idempotencyKey: `key-${fixture.betId}`,
                externalTransactionId: `ext-${fixture.betId}`,
            }),
        )
        await testDatabase.unsafe(`
            INSERT INTO wallet_ledger_entries
                (id, wallet_id, transaction_id, wallet_version, direction, amount, currency, balance_before, balance_after, created_at)
            VALUES ('${Bun.randomUUIDv7()}', '${fixture.walletId}', '${fixture.openingId}', 1, 'CREDIT', 100, 'BRL', 0, 100, now())`)
    })

    test.each(constraintViolations)('rejects: $description', async ({ buildSql, expectedError }) => {
        const error = await testDatabase.unsafe(buildSql(fixture)).then(
            () => undefined,
            (rejection: Error) => rejection,
        )
        expect(error?.message).toContain(expectedError)
    })
})
