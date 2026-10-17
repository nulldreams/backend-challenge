import { WalletRepository } from '@application/repositories'
import { StaleWalletError, WalletAlreadyExistsError } from '@domain/errors'
import { Wallet } from '@domain/wallet'
import { walletMapper } from '@infra/mappers'
import { WalletRecord } from '@infra/records'
import { LockMode } from '@mikro-orm/core'
import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable } from '@nestjs/common'
import { MikroOrmRepository } from './mikro-orm.repository'

@Injectable()
export class MikroOrmWalletRepository extends MikroOrmRepository implements WalletRepository {
    constructor(entityManager: EntityManager) {
        super(entityManager)
    }

    async insert(wallet: Wallet): Promise<void> {
        try {
            await this.entityManager.insert(WalletRecord, walletMapper.toRow(wallet))
        } catch (error) {
            if (this.isUniqueViolation(error, 'wallets_player_currency_uq')) {
                throw new WalletAlreadyExistsError(
                    `Wallet already exists for player ${wallet.playerId} in ${wallet.currency}`,
                )
            }
            throw error
        }
    }

    async findById(id: string): Promise<Wallet | undefined> {
        const row = await this.entityManager.findOne(WalletRecord, { id }, { disableIdentityMap: true })
        return row ? walletMapper.toDomain(row) : undefined
    }

    async findByIdForUpdate(id: string): Promise<Wallet | undefined> {
        const row = await this.entityManager.findOne(
            WalletRecord,
            { id },
            { lockMode: LockMode.PESSIMISTIC_WRITE, disableIdentityMap: true },
        )
        return row ? walletMapper.toDomain(row) : undefined
    }

    async update(wallet: Wallet): Promise<void> {
        const { balance, version, updatedAt } = walletMapper.toRow(wallet)

        const affectedRows = await this.entityManager.nativeUpdate(
            WalletRecord,
            { id: wallet.id, version: wallet.version - 1 },
            { balance, version, updatedAt },
        )

        if (affectedRows !== 1) throw new StaleWalletError(`Wallet ${wallet.id} changed since it was read`)
    }
}
