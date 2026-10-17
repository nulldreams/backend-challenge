import { OutboxMessage } from '@domain/outbox-message'
import type { OutboxMessageRow } from '@infra/records'
import type { EntityData, RequiredEntityData } from '@mikro-orm/core'

export const outboxMessageMapper = {
    toDomain: (row: OutboxMessageRow): OutboxMessage =>
        OutboxMessage.rehydrate({
            id: row.id,
            aggregateId: row.aggregateId,
            eventType: row.eventType,
            payload: row.payload,
            occurredAt: row.occurredAt,
            attempts: row.attempts,
            nextAttemptAt: row.nextAttemptAt,
            publishedAt: row.publishedAt ?? undefined,
        }),

    toRow: (message: OutboxMessage): RequiredEntityData<OutboxMessageRow> => ({
        id: message.id,
        aggregateId: message.aggregateId,
        eventType: message.eventType,
        payload: { ...message.payload },
        occurredAt: message.occurredAt,
        attempts: message.attempts,
        nextAttemptAt: message.nextAttemptAt,
        publishedAt: message.publishedAt ?? null,
    }),

    toDeliveryAttempt: (message: OutboxMessage): EntityData<OutboxMessageRow> => ({
        attempts: message.attempts,
        nextAttemptAt: message.nextAttemptAt,
        publishedAt: message.publishedAt ?? null,
    }),
}
