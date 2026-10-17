import { WagerTransaction, WagerTransactionKind } from '@domain/wager-transaction'

export abstract class WagerTransactionRepository {
    abstract insert(transaction: WagerTransaction): Promise<void>
    abstract update(transaction: WagerTransaction): Promise<void>
    abstract findById(id: string): Promise<WagerTransaction | undefined>
    abstract findByIdempotencyKey(idempotencyKey: string): Promise<WagerTransaction | undefined>
    abstract findByProviderAndExternalId(
        providerId: string,
        externalTransactionId: string,
    ): Promise<WagerTransaction | undefined>
    abstract hasProcessedReversal(referenceTransactionId: string, kind: WagerTransactionKind): Promise<boolean>
    abstract findDuePendingReferences(now: Date, limit: number): Promise<WagerTransaction[]>
    abstract findDuePendingReferenceForUpdate(id: string, now: Date): Promise<WagerTransaction | undefined>
    abstract wakePendingReferencesTo(
        providerId: string,
        referenceExternalTransactionId: string,
        now: Date,
    ): Promise<void>
}
