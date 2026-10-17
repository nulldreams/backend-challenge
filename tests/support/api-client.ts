export interface WalletUnderTest {
    walletId: string
    playerId: string
}

export interface SubmitFields {
    kind?: string
    amount?: string
    externalTransactionId?: string
    referenceExternalTransactionId?: string
}

export interface ApiResponse {
    status: number
    body: Record<string, any>
}

export function apiClient(baseUrl: string) {
    const post = async (path: string, body: unknown, headers: Record<string, string> = {}): Promise<ApiResponse> => {
        const response = await fetch(`${baseUrl}${path}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...headers },
            body: JSON.stringify(body),
        })

        return { status: response.status, body: (await response.json()) as Record<string, any> }
    }

    return {
        async createWallet(amount = '100.00'): Promise<WalletUnderTest> {
            const playerId = Bun.randomUUIDv7()
            const { body } = await post('/wallets', { playerId, initialBalance: { amount, currency: 'BRL' } })

            return { walletId: body.id, playerId }
        },

        submit(wallet: WalletUnderTest, fields: SubmitFields = {}, idempotencyKey?: string): Promise<ApiResponse> {
            const externalTransactionId = fields.externalTransactionId ?? Bun.randomUUIDv7()
            const reference = fields.referenceExternalTransactionId

            return post(
                '/wagering/transactions',
                {
                    providerId: 'provider-test',
                    externalTransactionId,
                    playerId: wallet.playerId,
                    walletId: wallet.walletId,
                    roundId: 'round-1',
                    gameId: 'fortune-chimp',
                    kind: fields.kind ?? 'BET',
                    money: { amount: fields.amount ?? '10.00', currency: 'BRL' },
                    ...(reference ? { referenceExternalTransactionId: reference } : {}),
                },
                { 'Idempotency-Key': idempotencyKey ?? `provider-test:${externalTransactionId}` },
            )
        },
    }
}
