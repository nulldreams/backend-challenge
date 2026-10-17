import { type OutboxBacklog, OutboxMessageRepository } from '@application/repositories'
import { OutboxMessage } from '@domain/outbox-message'
import { outboxMessageMapper } from '@infra/mappers'
import { OutboxMessageRecord } from '@infra/records'
import { LockMode } from '@mikro-orm/core'
import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable } from '@nestjs/common'
import { MikroOrmRepository } from './mikro-orm.repository'

interface OutboxBacklogRow {
    pending: number
    lagSeconds: number
}

@Injectable()
export class MikroOrmOutboxMessageRepository extends MikroOrmRepository implements OutboxMessageRepository {
    constructor(entityManager: EntityManager) {
        super(entityManager)
    }

    async add(messages: OutboxMessage[]): Promise<void> {
        if (messages.length === 0) return

        await this.entityManager.insertMany(OutboxMessageRecord, messages.map(outboxMessageMapper.toRow))
    }

    async claimDue(limit: number, now: Date): Promise<OutboxMessage[]> {
        const rows = await this.entityManager.find(
            OutboxMessageRecord,
            { publishedAt: null, nextAttemptAt: { $lte: now } },
            {
                orderBy: { nextAttemptAt: 'asc' },
                limit,
                lockMode: LockMode.PESSIMISTIC_PARTIAL_WRITE,
                disableIdentityMap: true,
            },
        )

        return rows.map(outboxMessageMapper.toDomain)
    }

    async save(messages: OutboxMessage[]): Promise<void> {
        for (const message of messages) {
            await this.entityManager.nativeUpdate(
                OutboxMessageRecord,
                { id: message.id },
                outboxMessageMapper.toDeliveryAttempt(message),
            )
        }
    }

    async backlog(): Promise<OutboxBacklog> {
        const [{ pending, lagSeconds }] = await this.entityManager.execute<[OutboxBacklogRow]>(
            `SELECT count(*)::int AS pending,
                    coalesce(extract(epoch FROM now() - min(occurred_at)), 0)::float8 AS "lagSeconds"
               FROM outbox_messages
              WHERE published_at IS NULL`,
        )

        return { pending, lagSeconds }
    }
}
