import { WagerTransactionRepository } from '@application/repositories'
import { WagerTransactionNotFoundError } from '@domain/errors'
import { WagerTransaction } from '@domain/wager-transaction'
import { Injectable } from '@nestjs/common'

@Injectable()
export class GetWagerTransactionUseCase {
    constructor(private readonly wagerTransactionRepository: WagerTransactionRepository) {}

    async execute(transactionId: string): Promise<WagerTransaction> {
        const transaction = await this.wagerTransactionRepository.findById(transactionId)

        if (!transaction) throw new WagerTransactionNotFoundError(transactionId)

        return transaction
    }
}
