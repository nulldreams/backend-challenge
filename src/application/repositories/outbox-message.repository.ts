import { OutboxMessage } from '@domain/outbox-message'
import { OutboxBacklog } from './outbox-backlog.interface'

export abstract class OutboxMessageRepository {
    abstract add(messages: OutboxMessage[]): Promise<void>
    abstract claimDue(limit: number, now: Date): Promise<OutboxMessage[]>
    abstract save(messages: OutboxMessage[]): Promise<void>
    abstract backlog(): Promise<OutboxBacklog>
}
