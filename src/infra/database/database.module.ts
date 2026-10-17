import {
    InboxMessageRepository,
    OutboxMessageRepository,
    WagerTransactionRepository,
    WalletLedgerEntryRepository,
    WalletRepository,
} from '@application/repositories'
import { TransactionManager } from '@application/transaction'
import {
    MikroOrmInboxMessageRepository,
    MikroOrmOutboxMessageRepository,
    MikroOrmWagerTransactionRepository,
    MikroOrmWalletLedgerEntryRepository,
    MikroOrmWalletRepository,
} from '@infra/repositories'
import { EntityManager, MikroORM } from '@mikro-orm/postgresql'
import { Module, OnApplicationShutdown } from '@nestjs/common'
import { MikroOrmTransactionManager } from './mikro-orm-transaction-manager'
import { mikroOrmConfig } from './mikro-orm.config'

const repositoryBindings = [
    { provide: WalletRepository, useClass: MikroOrmWalletRepository },
    { provide: WagerTransactionRepository, useClass: MikroOrmWagerTransactionRepository },
    { provide: WalletLedgerEntryRepository, useClass: MikroOrmWalletLedgerEntryRepository },
    { provide: InboxMessageRepository, useClass: MikroOrmInboxMessageRepository },
    { provide: OutboxMessageRepository, useClass: MikroOrmOutboxMessageRepository },
]

@Module({
    providers: [
        { provide: MikroORM, useFactory: () => MikroORM.init(mikroOrmConfig) },
        { provide: EntityManager, useFactory: (orm: MikroORM) => orm.em, inject: [MikroORM] },
        { provide: TransactionManager, useClass: MikroOrmTransactionManager },
        ...repositoryBindings,
    ],
    exports: [MikroORM, TransactionManager, ...repositoryBindings.map(({ provide }) => provide)],
})
export class DatabaseModule implements OnApplicationShutdown {
    constructor(private readonly orm: MikroORM) {}

    async onApplicationShutdown(): Promise<void> {
        await this.orm.close()
    }
}
