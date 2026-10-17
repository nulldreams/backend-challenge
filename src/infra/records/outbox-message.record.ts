import { defineEntity, InferEntity } from '@mikro-orm/core'

export const OutboxMessageRecord = defineEntity({
    name: 'OutboxMessageRecord',
    tableName: 'outbox_messages',
    properties: (property) => ({
        id: property.uuid().primary(),
        aggregateId: property.uuid(),
        eventType: property.text(),
        payload: property.json<Record<string, unknown>>(),
        occurredAt: property.datetime(),
        attempts: property.integer().default(0),
        nextAttemptAt: property.datetime(),
        publishedAt: property.datetime().nullable(),
    }),
    indexes: [{ name: 'outbox_messages_pending_idx', properties: ['nextAttemptAt'], where: 'published_at IS NULL' }],
    checks: [{ name: 'outbox_messages_attempts_ck', expression: 'attempts >= 0' }],
})

export type OutboxMessageRow = InferEntity<typeof OutboxMessageRecord>
