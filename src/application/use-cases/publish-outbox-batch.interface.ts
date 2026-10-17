export interface OutboxBatchResult {
    claimed: number
    published: number
    retried: number
}
