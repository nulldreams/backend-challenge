import { FailureCode, InvalidTransactionStateError, InvalidWagerTransactionError } from '@domain/errors'
import { LedgerDirection } from '@domain/ledger-entry'
import { Money } from '@domain/money'
import { computePayloadHash } from './compute-payload-hash'
import { WagerTransactionKind } from './wager-transaction-kind.enum'
import { WagerTransactionStatus } from './wager-transaction-status.enum'
import {
    CreateWagerTransactionProps,
    OpeningTransactionProps,
    WagerTransactionState,
} from './wager-transaction.interface'

const { Opening, Bet, Win, Loss, Refund, Rollback } = WagerTransactionKind

const REFERENCEABLE_KINDS: Partial<Record<WagerTransactionKind, WagerTransactionKind[]>> = {
    [Win]: [Bet],
    [Refund]: [Bet],
    [Rollback]: [Bet, Win, Refund],
}

const REFERENCE_RETRY_BASE_DELAY_MS = 1_000
const REFERENCE_RETRY_MAX_DELAY_MS = 5 * 60_000
export const MAX_REFERENCE_ATTEMPTS = 10

const referenceRetryDelay = (attempts: number): number =>
    Math.min(REFERENCE_RETRY_BASE_DELAY_MS * 2 ** attempts, REFERENCE_RETRY_MAX_DELAY_MS)

const TERMINAL_STATUSES = [
    WagerTransactionStatus.Processed,
    WagerTransactionStatus.Rejected,
    WagerTransactionStatus.Failed,
]

export class WagerTransaction {
    private constructor(
        public readonly id: string,
        public readonly providerId: string,
        public readonly externalTransactionId: string,
        public readonly idempotencyKey: string,
        public readonly payloadHash: string,
        public readonly walletId: string,
        public readonly playerId: string,
        public readonly roundId: string,
        public readonly gameId: string,
        public readonly kind: WagerTransactionKind,
        public readonly money: Money,
        public readonly referenceExternalTransactionId: string | undefined,
        public readonly createdAt: Date,
        private _status: WagerTransactionStatus,
        private _referenceTransactionId?: string,
        private _failureCode?: FailureCode,
        private _processedAt?: Date,
        private _observedBalance?: Money,
        private _referenceAttempts = 0,
        private _nextReferenceAttemptAt?: Date,
    ) {}

    static create(props: CreateWagerTransactionProps): WagerTransaction {
        if (props.kind === Opening) {
            throw new InvalidWagerTransactionError(FailureCode.KindNotAllowed, 'OPENING is internal')
        }

        const transaction = WagerTransaction.rehydrate({
            ...props,
            id: Bun.randomUUIDv7(),
            status: WagerTransactionStatus.Pending,
        })

        if (transaction.requiresReference() && !props.referenceExternalTransactionId) {
            throw new InvalidWagerTransactionError(FailureCode.ReferenceRequired, `${props.kind} requires a reference`)
        }

        if (props.referenceExternalTransactionId && !REFERENCEABLE_KINDS[props.kind]) {
            throw new InvalidWagerTransactionError(
                FailureCode.ReferenceNotAllowed,
                `${props.kind} does not accept a reference`,
            )
        }

        if (transaction.affectsBalance() && !props.money.isPositive()) {
            throw new InvalidWagerTransactionError(FailureCode.InvalidAmount, `${props.kind} amount must be positive`)
        }

        return transaction
    }

    static opening({ walletId, playerId, money, at }: OpeningTransactionProps): WagerTransaction {
        const fields = {
            providerId: 'internal',
            externalTransactionId: walletId,
            playerId,
            walletId,
            roundId: 'opening',
            gameId: 'opening',
            kind: Opening,
        }

        return WagerTransaction.rehydrate({
            ...fields,
            id: Bun.randomUUIDv7(),
            idempotencyKey: `opening:${walletId}`,
            payloadHash: computePayloadHash({ ...fields, money: money.toJSON() }),
            money,
            referenceExternalTransactionId: undefined,
            createdAt: at,
            status: WagerTransactionStatus.Processed,
            processedAt: at,
            observedBalance: money,
        })
    }

    static rehydrate(state: WagerTransactionState): WagerTransaction {
        return new WagerTransaction(
            state.id,
            state.providerId,
            state.externalTransactionId,
            state.idempotencyKey,
            state.payloadHash,
            state.walletId,
            state.playerId,
            state.roundId,
            state.gameId,
            state.kind,
            state.money,
            state.referenceExternalTransactionId,
            state.createdAt,
            state.status,
            state.referenceTransactionId,
            state.failureCode,
            state.processedAt,
            state.observedBalance,
            state.referenceAttempts,
            state.nextReferenceAttemptAt,
        )
    }

    get status(): WagerTransactionStatus {
        return this._status
    }

    get referenceTransactionId(): string | undefined {
        return this._referenceTransactionId
    }

    get failureCode(): FailureCode | undefined {
        return this._failureCode
    }

    get processedAt(): Date | undefined {
        return this._processedAt
    }

    get observedBalance(): Money | undefined {
        return this._observedBalance
    }

    get referenceAttempts(): number {
        return this._referenceAttempts
    }

    get nextReferenceAttemptAt(): Date | undefined {
        return this._nextReferenceAttemptAt
    }

    markProcessed(referenceTransactionId: string | undefined, observedBalance: Money, at: Date): void {
        this.assertNotTerminal()
        this._nextReferenceAttemptAt = undefined
        this._status = WagerTransactionStatus.Processed
        this._referenceTransactionId = referenceTransactionId
        this._observedBalance = observedBalance
        this._processedAt = at
    }

    markPendingReference(observedBalance: Money, at: Date): void {
        this.assertNotTerminal()
        this._status = WagerTransactionStatus.PendingReference
        this._observedBalance = observedBalance
        this._nextReferenceAttemptAt = new Date(at.getTime() + referenceRetryDelay(this._referenceAttempts))
    }

    referenceStillMissing(observedBalance: Money, now: Date): void {
        if (this._status !== WagerTransactionStatus.PendingReference) {
            throw new InvalidTransactionStateError(`Transaction ${this.id} is not waiting for a reference`)
        }

        this._referenceAttempts++

        if (this._referenceAttempts >= MAX_REFERENCE_ATTEMPTS) {
            this.reject(FailureCode.ReferenceNotFound, observedBalance)
            return
        }

        this._observedBalance = observedBalance
        this._nextReferenceAttemptAt = new Date(now.getTime() + referenceRetryDelay(this._referenceAttempts))
    }

    reject(code: FailureCode, observedBalance: Money): void {
        this.assertNotTerminal()
        this._nextReferenceAttemptAt = undefined
        this._status = WagerTransactionStatus.Rejected
        this._failureCode = code
        this._observedBalance = observedBalance
    }

    isTerminal(): boolean {
        return TERMINAL_STATUSES.includes(this._status)
    }

    affectsBalance(): boolean {
        return this.kind !== Loss
    }

    requiresReference(): boolean {
        return this.kind === Refund || this.kind === Rollback
    }

    matchesPayload(payloadHash: string): boolean {
        return this.payloadHash === payloadHash
    }

    ledgerDirectionFor(reference?: WagerTransaction): LedgerDirection {
        switch (this.kind) {
            case Bet:
                return LedgerDirection.Debit
            case Opening:
            case Win:
            case Refund:
                return LedgerDirection.Credit
            case Rollback:
                if (!reference) throw new Error('ROLLBACK direction requires the reference transaction')
                return reference.ledgerDirectionFor() === LedgerDirection.Debit
                    ? LedgerDirection.Credit
                    : LedgerDirection.Debit
            case Loss:
                throw new Error('LOSS does not move the balance')
        }
    }

    assertValidReference(reference: WagerTransaction): void {
        if (!REFERENCEABLE_KINDS[this.kind]?.includes(reference.kind)) {
            throw new InvalidWagerTransactionError(FailureCode.InvalidReferenceKind)
        }

        const sameContext =
            reference.providerId === this.providerId &&
            reference.playerId === this.playerId &&
            reference.walletId === this.walletId &&
            reference.roundId === this.roundId &&
            reference.money.currency === this.money.currency

        if (!sameContext) throw new InvalidWagerTransactionError(FailureCode.ReferenceMismatch)

        if (this.requiresReference() && !reference.money.equals(this.money)) {
            throw new InvalidWagerTransactionError(FailureCode.ReferenceAmountMismatch)
        }

        if (reference.isTerminal() && reference.status !== WagerTransactionStatus.Processed) {
            throw new InvalidWagerTransactionError(FailureCode.ReferenceNotProcessed)
        }
    }

    private assertNotTerminal(): void {
        if (this.isTerminal()) {
            throw new InvalidTransactionStateError(`Transaction ${this.id} is already ${this._status}`)
        }
    }
}
