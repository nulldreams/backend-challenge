export enum FailureCode {
    CurrencyMismatch = 'CURRENCY_MISMATCH',
    InvalidAmount = 'INVALID_AMOUNT',
    InvalidCurrency = 'INVALID_CURRENCY',
    InsufficientFunds = 'INSUFFICIENT_FUNDS',
    WalletAlreadyExists = 'WALLET_ALREADY_EXISTS',
    WalletNotFound = 'WALLET_NOT_FOUND',
    WagerTransactionNotFound = 'WAGER_TRANSACTION_NOT_FOUND',

    KindNotAllowed = 'KIND_NOT_ALLOWED',
    ReferenceRequired = 'REFERENCE_REQUIRED',
    ReferenceNotAllowed = 'REFERENCE_NOT_ALLOWED',

    IdempotencyConflict = 'IDEMPOTENCY_CONFLICT',
    ExternalTransactionIdConflict = 'EXTERNAL_TRANSACTION_ID_CONFLICT',

    WalletPlayerMismatch = 'WALLET_PLAYER_MISMATCH',
    InvalidReferenceKind = 'INVALID_REFERENCE_KIND',
    ReferenceMismatch = 'REFERENCE_MISMATCH',
    ReferenceAmountMismatch = 'REFERENCE_AMOUNT_MISMATCH',
    ReferenceNotProcessed = 'REFERENCE_NOT_PROCESSED',
    AlreadyReversed = 'ALREADY_REVERSED',
    ReversalInsufficientFunds = 'REVERSAL_INSUFFICIENT_FUNDS',
    ReferenceNotFound = 'REFERENCE_NOT_FOUND',

    MessageIdConflict = 'MESSAGE_ID_CONFLICT',
}
