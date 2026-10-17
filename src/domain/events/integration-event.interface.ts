export interface EventContext {
    correlationId: string
    causationId?: string
}

export interface IntegrationEventProps<T> extends EventContext {
    eventId: string
    aggregateId: string
    occurredAt: Date
    data: T
}

export interface IntegrationEventEnvelope<T> {
    eventId: string
    eventType: string
    aggregateId: string
    correlationId: string
    causationId?: string
    occurredAt: string
    version: number
    data: T
}
