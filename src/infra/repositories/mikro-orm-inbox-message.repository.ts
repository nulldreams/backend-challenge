import { InboxMessageRepository } from '@application/repositories'
import { InboxMessage } from '@domain/inbox-message'
import { inboxMessageMapper } from '@infra/mappers'
import { InboxMessageRecord } from '@infra/records'
import type { QueryResult } from '@mikro-orm/core'
import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable } from '@nestjs/common'
import { MikroOrmRepository } from './mikro-orm.repository'

@Injectable()
export class MikroOrmInboxMessageRepository extends MikroOrmRepository implements InboxMessageRepository {
    constructor(entityManager: EntityManager) {
        super(entityManager)
    }

    async insertIfAbsent(message: InboxMessage): Promise<boolean> {
        const result = await this.entityManager.execute<QueryResult>(
            `INSERT INTO inbox_messages (consumer_name, message_id, payload_hash, received_at, processed_at)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT (consumer_name, message_id) DO NOTHING`,
            [
                message.consumerName,
                message.messageId,
                message.payloadHash,
                message.receivedAt,
                message.processedAt ?? null,
            ],
            'run',
        )

        return result.affectedRows === 1
    }

    async find(consumerName: string, messageId: string): Promise<InboxMessage | undefined> {
        const row = await this.entityManager.findOne(
            InboxMessageRecord,
            { consumerName, messageId },
            { disableIdentityMap: true },
        )

        return row ? inboxMessageMapper.toDomain(row) : undefined
    }
}
