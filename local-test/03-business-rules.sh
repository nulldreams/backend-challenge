#!/usr/bin/env bash
source "$(dirname "$0")/lib.sh"

title '03 - Business rules (§7): BET, WIN, LOSS, REFUND, ROLLBACK'
create_wallet 100.00

step 'BET debits'
submit BET 25.00 bet-1
expect_field status PROCESSED
expect_field balance.amount 75.00

step 'WIN credits'
submit WIN 10.00 win-1 bet-1
expect_field balance.amount 85.00

step 'LOSS records the result without moving the balance (and without a ledger entry)'
submit LOSS 0.00 loss-1
expect_field status PROCESSED
expect_field balance.amount 85.00

step 'BET without funds is REJECTED, persisted and auditable'
submit BET 500.00 bet-2
expect_status 422
expect_field status REJECTED
expect_field failureCode INSUFFICIENT_FUNDS
expect_equal 'rejected transaction persisted' "$(transaction_status bet-2)" REJECTED

step 'REFUND reverts a BET exactly once'
submit REFUND 25.00 refund-1 bet-1
expect_field status PROCESSED
expect_field balance.amount 110.00
submit REFUND 25.00 refund-2 bet-1
expect_status 422
expect_field failureCode ALREADY_REVERSED

step 'REFUND only references a BET'
submit REFUND 10.00 refund-3 win-1
expect_field failureCode INVALID_REFERENCE_KIND

step 'Partial reversal is out of scope'
submit BET 20.00 bet-3
submit REFUND 5.00 refund-4 bet-3
expect_field failureCode REFERENCE_AMOUNT_MISMATCH

step 'ROLLBACK inverts its reference: rolling back a WIN debits'
submit ROLLBACK 10.00 rollback-1 win-1
expect_field status PROCESSED
expect_field balance.amount 80.00

step 'A reversal that would leave a negative balance has its own failure code'
create_wallet 50.00
submit WIN 40.00 win-2
submit BET 90.00 bet-4
submit ROLLBACK 40.00 rollback-2 win-2
expect_status 422
expect_field failureCode REVERSAL_INSUFFICIENT_FUNDS

step 'Wrong currency and wrong player are business rejections'
request POST /wagering/transactions "$(wager_body BET 1.00 bet-usd '' "$WALLET_ID" USD)" "$PROVIDER_ID:bet-usd"
expect_field failureCode CURRENCY_MISMATCH
real_player=$PLAYER_ID
PLAYER_ID=$(uuid)
submit BET 1.00 bet-player
expect_field failureCode WALLET_PLAYER_MISMATCH
PLAYER_ID=$real_player

step 'Payload rules: OPENING is internal, reversals need a reference, BET takes none'
submit OPENING 10.00 opening-1
expect_status 400
expect_field code KIND_NOT_ALLOWED
submit REFUND 10.00 refund-5
expect_field code REFERENCE_REQUIRED
submit BET 10.00 bet-5 bet-1
expect_field code REFERENCE_NOT_ALLOWED

expect_ledger_consistent
summary
