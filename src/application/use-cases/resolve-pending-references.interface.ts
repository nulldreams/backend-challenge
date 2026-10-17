import { WagerTransaction } from '@domain/wager-transaction'

export interface PendingReferencesResult {
    candidates: number
    resolved: WagerTransaction[]
    retried: number
}
