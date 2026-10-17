import { WalletLedgerEntry } from '@domain/ledger-entry'
import { LedgerBalance } from './ledger-balance.interface'

export abstract class WalletLedgerEntryRepository {
    abstract append(entry: WalletLedgerEntry): Promise<void>
    abstract listByWallet(walletId: string, afterVersion: number, limit: number): Promise<WalletLedgerEntry[]>
    abstract calculateBalance(walletId: string, currency: string): Promise<LedgerBalance>
}
