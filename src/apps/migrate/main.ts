import { mikroOrmConfig } from '@infra/database'
import { MikroORM } from '@mikro-orm/postgresql'

type MigrationCommand = 'up' | 'down' | 'create'

const migrationCommands: Record<MigrationCommand, (orm: MikroORM) => Promise<string[]>> = {
    up: async (orm) => (await orm.migrator.up()).map((migration) => migration.name),
    down: async (orm) => (await orm.migrator.down()).map((migration) => migration.name),
    // empty fileName means the entities match the snapshot: nothing to generate
    create: async (orm) => {
        const { fileName } = await orm.migrator.create()
        return fileName ? [fileName] : []
    },
}

function parseMigrationCommand(argument: string | undefined): MigrationCommand {
    if (argument === 'up' || argument === 'down' || argument === 'create') return argument
    throw new Error(`Unknown migration command: ${argument}. Use up, down or create.`)
}

const command = parseMigrationCommand(process.argv[2])
const orm = await MikroORM.init(mikroOrmConfig)
try {
    const migrations = await migrationCommands[command](orm)
    console.log(JSON.stringify({ message: `migrations ${command}`, migrations }))
} finally {
    await orm.close()
}
