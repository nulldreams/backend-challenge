import { env } from '@infra/config'
import { databaseRecords } from '@infra/records'
import * as migrations from '@migrations'
import type { MigrationObject } from '@mikro-orm/core'
import { Migrator } from '@mikro-orm/migrations'
import { defineConfig } from '@mikro-orm/postgresql'

const migrationsList: MigrationObject[] = Object.entries(migrations)
    .sort(([nameA], [nameB]) => nameA.localeCompare(nameB))
    .map(([name, migration]) => ({ name, class: migration as MigrationObject['class'] }))

export const mikroOrmConfig = defineConfig({
    host: env.postgres.host,
    port: env.postgres.port,
    user: env.postgres.user,
    password: env.postgres.password,
    dbName: env.postgres.database,
    driverOptions: { connectionTimeoutMillis: 2_000 },
    extensions: [Migrator],
    entities: databaseRecords,
    migrations: {
        path: './migrations', // where migration:create writes the generated file
        migrationsList,
        snapshot: true, // the generator diffs entities against the snapshot, not against the live database
        snapshotName: '.snapshot', // fixed name: the default embeds dbName (.snapshot-wagering_test differs from .snapshot-wagering)
        snapshotOnMigrate: false, // up/down would rewrite the snapshot from introspection, which cannot see TRUNCATE triggers
    },
})
