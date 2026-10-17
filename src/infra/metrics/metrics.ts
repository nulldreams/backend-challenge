import { DomainError, FailureCode } from '@domain/errors'
import { DriverException } from '@mikro-orm/core'
import { collectDefaultMetrics, Counter, Histogram, Registry } from 'prom-client'

export const metricsRegistry = new Registry()
collectDefaultMetrics({ register: metricsRegistry })

export type ProcessingSource = 'http' | 'sqs' | 'reference_worker'

export const metrics = {
    transactions: new Counter({
        name: 'wagering_transactions_total',
        help: 'Wager transaction decisions (replays excluded) by final status',
        labelNames: ['status', 'kind', 'source'] as const,
        registers: [metricsRegistry],
    }),
    duplicates: new Counter({
        name: 'wagering_duplicates_total',
        help: 'Detected duplicates: idempotent replays and key, external id or message id conflicts',
        labelNames: ['type', 'source'] as const,
        registers: [metricsRegistry],
    }),
    retries: new Counter({
        name: 'wagering_retries_total',
        help: 'Scheduled retries: SQS message, outbox publication, pending reference',
        labelNames: ['stage'] as const,
        registers: [metricsRegistry],
    }),
    deadLetters: new Counter({
        name: 'wagering_dlq_messages_total',
        help: 'Messages sent straight to the DLQ by the consumer',
        labelNames: ['reason'] as const,
        registers: [metricsRegistry],
    }),
    lockConflicts: new Counter({
        name: 'wagering_lock_conflicts_total',
        help: 'Database concurrency conflicts: lock timeout, deadlock, serialization',
        labelNames: ['type', 'source'] as const,
        registers: [metricsRegistry],
    }),
    processingDuration: new Histogram({
        name: 'wagering_processing_duration_seconds',
        help: 'Wager transaction processing latency, lock wait included',
        labelNames: ['source', 'outcome'] as const,
        buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
        registers: [metricsRegistry],
    }),
    reconciliations: new Counter({
        name: 'wallet_reconciliations_total',
        help: 'Wallet reconciliations by result',
        labelNames: ['result'] as const,
        registers: [metricsRegistry],
    }),
}

const LOCK_CONFLICT_BY_SQLSTATE: Record<string, string> = {
    '55P03': 'lock_timeout',
    '40P01': 'deadlock',
    '40001': 'serialization',
}

const DUPLICATE_BY_FAILURE_CODE: Partial<Record<FailureCode, string>> = {
    [FailureCode.IdempotencyConflict]: 'idempotency_conflict',
    [FailureCode.ExternalTransactionIdConflict]: 'external_id_conflict',
    [FailureCode.MessageIdConflict]: 'message_id_conflict',
}

export interface SubmissionOutcome {
    transaction: { status: string; kind: string }
    idempotentReplay: boolean
}

export function recordLockConflict(error: unknown, source: ProcessingSource): void {
    const type = error instanceof DriverException ? LOCK_CONFLICT_BY_SQLSTATE[error.code ?? ''] : undefined

    if (type) metrics.lockConflicts.inc({ type, source })
}

export function recordDuplicateConflict(error: unknown, source: ProcessingSource): void {
    const type = error instanceof DomainError ? DUPLICATE_BY_FAILURE_CODE[error.code] : undefined

    if (type) metrics.duplicates.inc({ type, source })
}

export function recordSubmission(
    { transaction, idempotentReplay }: SubmissionOutcome,
    source: ProcessingSource,
): string {
    if (idempotentReplay) {
        metrics.duplicates.inc({ type: 'idempotent_replay', source })
        return 'replay'
    }

    metrics.transactions.inc({ status: transaction.status, kind: transaction.kind, source })
    return transaction.status.toLowerCase()
}

export function startProcessingTimer(source: ProcessingSource): (outcome: string) => void {
    const end = metrics.processingDuration.startTimer({ source })
    return (outcome) => end({ outcome })
}
