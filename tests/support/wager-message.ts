import type { WalletUnderTest } from './api-client'
import type { WagerEnvelope } from './test-queues'

export interface WagerMessage extends WagerEnvelope {
    data: Record<string, unknown> & { idempotencyKey: string; walletId: string }
}

export function buildWagerMessage(
    wallet: WalletUnderTest,
    data: Record<string, unknown> = {},
    envelope: Record<string, unknown> = {},
): WagerMessage {
    const externalTransactionId = String(data.externalTransactionId ?? Bun.randomUUIDv7())

    return {
        messageId: `msg-${Bun.randomUUIDv7()}`,
        ...envelope,
        data: {
            providerId: 'provider-test',
            externalTransactionId,
            idempotencyKey: `provider-test:${externalTransactionId}`,
            playerId: wallet.playerId,
            walletId: wallet.walletId,
            roundId: 'round-1',
            gameId: 'fortune-chimp',
            kind: 'BET',
            money: { amount: '10.00', currency: 'BRL' },
            ...data,
        },
    }
}
