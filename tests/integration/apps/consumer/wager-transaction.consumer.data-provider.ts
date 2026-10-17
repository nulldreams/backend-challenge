import { buildWagerMessage, type WagerMessage, type WalletUnderTest } from '@tests/support'

interface DeadLetterCase {
    description: string
    message: (wallet: WalletUnderTest) => { envelope: WagerMessage; rawBody?: string }
    expectedFailureCode: string
}

export const deadLetterCases: DeadLetterCase[] = [
    {
        description: 'invalid JSON',
        message: (wallet) => ({ envelope: buildWagerMessage(wallet), rawBody: '{not json' }),
        expectedFailureCode: 'SyntaxError',
    },
    {
        description: 'unknown message type',
        message: (wallet) => ({ envelope: buildWagerMessage(wallet, {}, { type: 'SomethingElse' }) }),
        expectedFailureCode: 'ZodError',
    },
    {
        description: 'missing idempotencyKey',
        message: (wallet) => ({ envelope: buildWagerMessage(wallet, { idempotencyKey: undefined }) }),
        expectedFailureCode: 'ZodError',
    },
    {
        description: 'OPENING sent from outside',
        message: (wallet) => ({ envelope: buildWagerMessage(wallet, { kind: 'OPENING' }) }),
        expectedFailureCode: 'KIND_NOT_ALLOWED',
    },
]
