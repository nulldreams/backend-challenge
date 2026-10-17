import { OutboxMessage } from '@domain/outbox-message'
import { PublishResult } from './publish-result.interface'

export abstract class EventPublisher {
    abstract publish(messages: OutboxMessage[]): Promise<PublishResult>
}
