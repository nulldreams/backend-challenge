export interface ReceiveInboxMessageProps {
    messageId: string
    consumerName: string
    payloadHash: string
    receivedAt: Date
}

export interface InboxMessageState extends ReceiveInboxMessageProps {
    processedAt?: Date
}
