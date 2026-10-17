#!/usr/bin/env bash
source "$(dirname "$0")/lib.sh"

title '02 - Idempotency (§9): replay, payload conflict and required key'
create_wallet 100.00

step 'BET 25.00'
submit BET 25.00 bet-1
expect_status 200
expect_field status PROCESSED
expect_field balance.amount 75.00
expect_field idempotentReplay false
original_id=$(json_field "$RESPONSE_BODY" transactionId)

step 'WIN 10.00 moves the balance to 85.00'
submit WIN 10.00 win-1 bet-1
expect_field balance.amount 85.00

step 'Replay of the BET returns the original result, with the balance observed back then'
submit BET 25.00 bet-1
expect_status 200
expect_field transactionId "$original_id"
expect_field idempotentReplay true
expect_field balance.amount 75.00

step 'Same key with a different amount is a conflict, never a replay'
request POST /wagering/transactions "$(wager_body BET 30.00 bet-1)" "$PROVIDER_ID:bet-1"
expect_status 409
expect_field code IDEMPOTENCY_CONFLICT

step 'Same external id with another key: the provider reused an id'
request POST /wagering/transactions "$(wager_body BET 25.00 bet-1)" "another-key-$RUN_ID"
expect_status 409
expect_field code EXTERNAL_TRANSACTION_ID_CONFLICT

step 'The Idempotency-Key header is mandatory'
request POST /wagering/transactions "$(wager_body BET 1.00 bet-2)"
expect_status 400
expect_field code INVALID_PAYLOAD

expect_equal 'debits' "$(count_debits)" 1
expect_ledger_consistent
summary
