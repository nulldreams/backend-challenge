import { defineEntity, InferEntity } from '@mikro-orm/core'

export const InboxMessageRecord = defineEntity({
    name: 'InboxMessageRecord',
    tableName: 'inbox_messages',
    properties: (property) => ({
        consumerName: property.text().primary(),
        messageId: property.text().primary(),
        payloadHash: property.string().columnType('char(64)'),
        receivedAt: property.datetime(),
        processedAt: property.datetime().nullable(),
    }),
})

export type InboxMessageRow = InferEntity<typeof InboxMessageRecord>
