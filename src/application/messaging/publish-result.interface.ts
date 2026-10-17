export interface PublishFailure {
    id: string
    reason: string
}

export interface PublishResult {
    publishedIds: string[]
    failed: PublishFailure[]
}
