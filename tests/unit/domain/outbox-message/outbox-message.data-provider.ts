interface RetryCase {
    description: string
    attemptsBefore: number
    expectedDelayMs: number
}

export const retryDelays: RetryCase[] = [
    { description: 'first failure waits 1s', attemptsBefore: 0, expectedDelayMs: 1_000 },
    { description: 'second failure waits 2s', attemptsBefore: 1, expectedDelayMs: 2_000 },
    { description: 'third failure waits 4s', attemptsBefore: 2, expectedDelayMs: 4_000 },
    { description: 'ninth failure waits 256s', attemptsBefore: 8, expectedDelayMs: 256_000 },
    { description: 'tenth failure hits the 5 minute ceiling', attemptsBefore: 9, expectedDelayMs: 300_000 },
    { description: 'stays at the ceiling without giving up', attemptsBefore: 50, expectedDelayMs: 300_000 },
]
