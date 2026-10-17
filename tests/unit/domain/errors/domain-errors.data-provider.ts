import {
    CurrencyMismatchError,
    DuplicateWagerTransactionError,
    ExternalTransactionIdConflictError,
    FailureCode,
    IdempotencyConflictError,
    InsufficientFundsError,
    InvalidMoneyError,
    InvalidTransactionStateError,
    InvalidWagerTransactionError,
    MessageIdConflictError,
    StaleWalletError,
    UnbalancedLedgerEntryError,
    WagerTransactionNotFoundError,
    WalletAlreadyExistsError,
    WalletNotFoundError,
} from '@domain/errors'

interface DomainErrorCase {
    description: string
    build: () => Error & { code?: FailureCode }
    expectedName: string
    expectedCode: FailureCode
    expectedMessage: string
}

interface ProgrammingErrorCase {
    description: string
    build: () => Error
    errorClass: new (message: string) => Error
}

export const domainErrors: DomainErrorCase[] = [
    {
        description: 'currency mismatch',
        build: () => new CurrencyMismatchError('BRL vs USD'),
        expectedName: 'CurrencyMismatchError',
        expectedCode: FailureCode.CurrencyMismatch,
        expectedMessage: 'BRL vs USD',
    },
    {
        description: 'insufficient funds',
        build: () => new InsufficientFundsError('no funds'),
        expectedName: 'InsufficientFundsError',
        expectedCode: FailureCode.InsufficientFunds,
        expectedMessage: 'no funds',
    },
    {
        description: 'invalid money without message uses the code',
        build: () => new InvalidMoneyError(FailureCode.InvalidAmount),
        expectedName: 'InvalidMoneyError',
        expectedCode: FailureCode.InvalidAmount,
        expectedMessage: FailureCode.InvalidAmount,
    },
    {
        description: 'invalid wager transaction',
        build: () => new InvalidWagerTransactionError(FailureCode.AlreadyReversed),
        expectedName: 'InvalidWagerTransactionError',
        expectedCode: FailureCode.AlreadyReversed,
        expectedMessage: FailureCode.AlreadyReversed,
    },
    {
        description: 'idempotency conflict',
        build: () => new IdempotencyConflictError('key-1'),
        expectedName: 'IdempotencyConflictError',
        expectedCode: FailureCode.IdempotencyConflict,
        expectedMessage: 'Idempotency-Key key-1 was already used with a different payload',
    },
    {
        description: 'external transaction id conflict',
        build: () => new ExternalTransactionIdConflictError('provider-a', 'tx-1'),
        expectedName: 'ExternalTransactionIdConflictError',
        expectedCode: FailureCode.ExternalTransactionIdConflict,
        expectedMessage: 'Transaction provider-a:tx-1 already exists with a different Idempotency-Key',
    },
    {
        description: 'message id conflict',
        build: () => new MessageIdConflictError('consumer-a', 'msg-1'),
        expectedName: 'MessageIdConflictError',
        expectedCode: FailureCode.MessageIdConflict,
        expectedMessage: 'Message msg-1 was already consumed by consumer-a with a different payload',
    },
    {
        description: 'wallet already exists',
        build: () => new WalletAlreadyExistsError('duplicated'),
        expectedName: 'WalletAlreadyExistsError',
        expectedCode: FailureCode.WalletAlreadyExists,
        expectedMessage: 'duplicated',
    },
    {
        description: 'wallet not found',
        build: () => new WalletNotFoundError('wallet-1'),
        expectedName: 'WalletNotFoundError',
        expectedCode: FailureCode.WalletNotFound,
        expectedMessage: 'Wallet wallet-1 not found',
    },
    {
        description: 'wager transaction not found',
        build: () => new WagerTransactionNotFoundError('tx-1'),
        expectedName: 'WagerTransactionNotFoundError',
        expectedCode: FailureCode.WagerTransactionNotFound,
        expectedMessage: 'Wager transaction tx-1 not found',
    },
]

export const programmingErrors: ProgrammingErrorCase[] = [
    {
        description: 'duplicate wager transaction',
        build: () => new DuplicateWagerTransactionError('unique violated'),
        errorClass: DuplicateWagerTransactionError,
    },
    {
        description: 'invalid transaction state',
        build: () => new InvalidTransactionStateError('already terminal'),
        errorClass: InvalidTransactionStateError,
    },
    {
        description: 'stale wallet',
        build: () => new StaleWalletError('version changed'),
        errorClass: StaleWalletError,
    },
    {
        description: 'unbalanced ledger entry',
        build: () => new UnbalancedLedgerEntryError('does not add up'),
        errorClass: UnbalancedLedgerEntryError,
    },
]
