import { InboxMessage } from '@domain/inbox-message'
import type { InboxMessageRow } from '@infra/records'

export const inboxMessageMapper = {
    toDomain: (row: InboxMessageRow): InboxMessage =>
        InboxMessage.rehydrate({
            messageId: row.messageId,
            consumerName: row.consumerName,
            payloadHash: row.payloadHash,
            receivedAt: row.receivedAt,
            processedAt: row.processedAt ?? undefined,
        }),
}
