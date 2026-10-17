import { TransactionContext, UniqueConstraintViolationException } from '@mikro-orm/core'
import { EntityManager } from '@mikro-orm/postgresql'

export abstract class MikroOrmRepository {
    constructor(private readonly rootEntityManager: EntityManager) {}

    protected get entityManager(): EntityManager {
        const transactionEntityManager = TransactionContext.getEntityManager() as EntityManager | undefined
        return transactionEntityManager ?? this.rootEntityManager.fork()
    }

    protected isUniqueViolation(error: unknown, constraintName: string): boolean {
        return error instanceof UniqueConstraintViolationException && error.message.includes(constraintName)
    }
}
