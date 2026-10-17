import { InboxMessage } from '@domain/inbox-message'

export abstract class InboxMessageRepository {
    abstract insertIfAbsent(message: InboxMessage): Promise<boolean>
    abstract find(consumerName: string, messageId: string): Promise<InboxMessage | undefined>
}
