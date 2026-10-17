interface WalletOpeningCase {
    description: string
    initialBalance: string
    expectedRows: PlayerRowCounts
}

export interface PlayerRowCounts {
    wallets: number
    transactions: number
    entries: number
}

export const walletOpenings: WalletOpeningCase[] = [
    {
        description: 'positive initial balance writes the wallet, the OPENING and its CREDIT entry',
        initialBalance: '100.50',
        expectedRows: { wallets: 1, transactions: 1, entries: 1 },
    },
    {
        description: 'zero initial balance writes only the wallet',
        initialBalance: '0.00',
        expectedRows: { wallets: 1, transactions: 0, entries: 0 },
    },
]

export const PARALLEL_OPENINGS = 10
