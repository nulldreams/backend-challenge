import { TransactionManager } from '@application/transaction'
import { IsolationLevel } from '@mikro-orm/core'
import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable } from '@nestjs/common'

const LOCK_TIMEOUT = '2s'

@Injectable()
export class MikroOrmTransactionManager extends TransactionManager {
    constructor(private readonly entityManager: EntityManager) {
        super()
    }

    run<T>(work: () => Promise<T>): Promise<T> {
        return this.entityManager.transactional(async (transactionEntityManager) => {
            await transactionEntityManager.execute(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`)
            return work()
        })
    }

    runReadOnlySnapshot<T>(work: () => Promise<T>): Promise<T> {
        return this.entityManager.transactional(() => work(), {
            isolationLevel: IsolationLevel.REPEATABLE_READ,
            readOnly: true,
        })
    }
}
