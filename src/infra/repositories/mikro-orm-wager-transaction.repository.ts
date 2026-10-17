import { WagerTransactionRepository } from '@application/repositories'
import { DuplicateWagerTransactionError, FailureCode, InvalidWagerTransactionError } from '@domain/errors'
import { WagerTransaction, WagerTransactionKind, WagerTransactionStatus } from '@domain/wager-transaction'
import { wagerTransactionMapper } from '@infra/mappers'
import { WagerTransactionRecord, type WagerTransactionRow } from '@infra/records'
import { type FilterQuery, LockMode } from '@mikro-orm/core'
import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable } from '@nestjs/common'
import { MikroOrmRepository } from './mikro-orm.repository'

@Injectable()
export class MikroOrmWagerTransactionRepository extends MikroOrmRepository implements WagerTransactionRepository {
    constructor(entityManager: EntityManager) {
        super(entityManager)
    }

    async insert(transaction: WagerTransaction): Promise<void> {
        await this.translateViolations(() =>
            this.entityManager.insert(WagerTransactionRecord, wagerTransactionMapper.toRow(transaction)),
        )
    }

    async update(transaction: WagerTransaction): Promise<void> {
        await this.translateViolations(() =>
            this.entityManager.nativeUpdate(
                WagerTransactionRecord,
                { id: transaction.id },
                wagerTransactionMapper.toStatusChange(transaction),
            ),
        )
    }

    findById(id: string): Promise<WagerTransaction | undefined> {
        return this.findOne({ id })
    }

    findByIdempotencyKey(idempotencyKey: string): Promise<WagerTransaction | undefined> {
        return this.findOne({ idempotencyKey })
    }

    findByProviderAndExternalId(
        providerId: string,
        externalTransactionId: string,
    ): Promise<WagerTransaction | undefined> {
        return this.findOne({ providerId, externalTransactionId })
    }

    async hasProcessedReversal(referenceTransactionId: string, kind: WagerTransactionKind): Promise<boolean> {
        const count = await this.entityManager.count(WagerTransactionRecord, {
            referenceTransaction: referenceTransactionId,
            kind,
            status: WagerTransactionStatus.Processed,
        })

        return count > 0
    }

    async findDuePendingReferences(now: Date, limit: number): Promise<WagerTransaction[]> {
        const rows = await this.entityManager.find(
            WagerTransactionRecord,
            { status: WagerTransactionStatus.PendingReference, nextReferenceAttemptAt: { $lte: now } },
            { orderBy: { nextReferenceAttemptAt: 'asc' }, limit, disableIdentityMap: true },
        )

        return rows.map(wagerTransactionMapper.toDomain)
    }

    async findDuePendingReferenceForUpdate(id: string, now: Date): Promise<WagerTransaction | undefined> {
        const row = await this.entityManager.findOne(
            WagerTransactionRecord,
            { id, status: WagerTransactionStatus.PendingReference, nextReferenceAttemptAt: { $lte: now } },
            { lockMode: LockMode.PESSIMISTIC_PARTIAL_WRITE, disableIdentityMap: true },
        )

        return row ? wagerTransactionMapper.toDomain(row) : undefined
    }

    async wakePendingReferencesTo(
        providerId: string,
        referenceExternalTransactionId: string,
        now: Date,
    ): Promise<void> {
        await this.entityManager.nativeUpdate(
            WagerTransactionRecord,
            { status: WagerTransactionStatus.PendingReference, providerId, referenceExternalTransactionId },
            { nextReferenceAttemptAt: now },
        )
    }

    private async findOne(where: FilterQuery<WagerTransactionRow>): Promise<WagerTransaction | undefined> {
        const row = await this.entityManager.findOne(WagerTransactionRecord, where, { disableIdentityMap: true })
        return row ? wagerTransactionMapper.toDomain(row) : undefined
    }

    private async translateViolations(write: () => Promise<unknown>): Promise<void> {
        try {
            await write()
        } catch (error) {
            if (this.isUniqueViolation(error, 'wager_transactions_single_reversal_uq')) {
                throw new InvalidWagerTransactionError(FailureCode.AlreadyReversed)
            }

            if (
                this.isUniqueViolation(error, 'wager_transactions_idempotency_key_uq') ||
                this.isUniqueViolation(error, 'wager_transactions_provider_external_id_uq')
            ) {
                throw new DuplicateWagerTransactionError((error as Error).message)
            }

            throw error
        }
    }
}
