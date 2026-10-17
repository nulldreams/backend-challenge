import { WagerTransactionRepository } from '@application/repositories'
import { WagerTransactionNotFoundError } from '@domain/errors'
import { WagerTransaction } from '@domain/wager-transaction'
import { Injectable } from '@nestjs/common'
import { GetProviderWagerTransactionInput } from './get-provider-wager-transaction.interface'

@Injectable()
export class GetProviderWagerTransactionUseCase {
    constructor(private readonly wagerTransactionRepository: WagerTransactionRepository) {}

    async execute({ providerId, externalTransactionId }: GetProviderWagerTransactionInput): Promise<WagerTransaction> {
        const transaction = await this.wagerTransactionRepository.findByProviderAndExternalId(
            providerId,
            externalTransactionId,
        )

        if (!transaction) throw new WagerTransactionNotFoundError(`${providerId}:${externalTransactionId}`)

        return transaction
    }
}
