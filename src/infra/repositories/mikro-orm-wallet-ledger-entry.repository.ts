import { type LedgerBalance, WalletLedgerEntryRepository } from '@application/repositories'
import { WalletLedgerEntry } from '@domain/ledger-entry'
import { Money } from '@domain/money'
import { walletLedgerEntryMapper } from '@infra/mappers'
import { LedgerEntryRecord } from '@infra/records'
import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable } from '@nestjs/common'
import { MikroOrmRepository } from './mikro-orm.repository'

interface LedgerBalanceRow {
    balance: string
    entries: number
}

const toSignedMoney = (amount: string, currency: string): Money => {
    const absolute = Money.from({ amount: amount.replace(/^-/, ''), currency })

    return amount.startsWith('-') ? absolute.negate() : absolute
}

@Injectable()
export class MikroOrmWalletLedgerEntryRepository extends MikroOrmRepository implements WalletLedgerEntryRepository {
    constructor(entityManager: EntityManager) {
        super(entityManager)
    }

    async listByWallet(walletId: string, afterVersion: number, limit: number): Promise<WalletLedgerEntry[]> {
        const rows = await this.entityManager.find(
            LedgerEntryRecord,
            { wallet: walletId, walletVersion: { $gt: afterVersion } },
            { orderBy: { walletVersion: 'asc' }, limit, disableIdentityMap: true },
        )

        return rows.map(walletLedgerEntryMapper.toDomain)
    }

    async append(entry: WalletLedgerEntry): Promise<void> {
        await this.entityManager.insert(LedgerEntryRecord, walletLedgerEntryMapper.toRow(entry))
    }

    async calculateBalance(walletId: string, currency: string): Promise<LedgerBalance> {
        const [{ balance, entries }] = await this.entityManager.execute<[LedgerBalanceRow]>(
            `SELECT COALESCE(SUM(CASE direction WHEN 'CREDIT' THEN amount ELSE -amount END), 0)::text AS balance,
                    COUNT(*)::int AS entries
               FROM wallet_ledger_entries
              WHERE wallet_id = ?`,
            [walletId],
        )

        return { balance: toSignedMoney(balance, currency), entries }
    }
}
