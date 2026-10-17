import { ConnectionException, DeadlockException, DriverException } from '@mikro-orm/core'

const LOCK_NOT_AVAILABLE = '55P03'
const NETWORK_ERROR_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'])

export function isTransientDatabaseError(error: unknown): boolean {
    if (error instanceof ConnectionException || error instanceof DeadlockException) return true

    if (error instanceof DriverException) return error.code === LOCK_NOT_AVAILABLE

    if (error instanceof AggregateError) return error.errors.some(isTransientDatabaseError)

    const code = (error as { code?: unknown } | null)?.code
    return typeof code === 'string' && NETWORK_ERROR_CODES.has(code)
}
