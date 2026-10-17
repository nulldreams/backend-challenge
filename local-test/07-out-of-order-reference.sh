#!/usr/bin/env bash
source "$(dirname "$0")/lib.sh"

title '07 - Reversals before their reference (§7.1): PENDING_REFERENCE resolved by the reference-worker'
create_wallet 100.00

step 'REFUND before its BET and ROLLBACK before its WIN are accepted as pending'
submit REFUND 10.00 refund-1 bet-1
expect_status 202
expect_field status PENDING_REFERENCE
submit ROLLBACK 5.00 rollback-1 win-1
expect_status 202
expect_equal 'balance untouched' "$(wallet_balance)" 100.00

step 'The references arrive'
submit BET 10.00 bet-1
submit WIN 5.00 win-1

step 'The reference-worker picks both up (they are woken up as soon as the reference is terminal)'
wait_until 'REFUND processed' '[[ $(transaction_status refund-1) == PROCESSED ]]' 30 && pass 'REFUND resolved'
wait_until 'ROLLBACK processed' '[[ $(transaction_status rollback-1) == PROCESSED ]]' 30 && pass 'ROLLBACK resolved'

expect_equal 'balance: 100 - 10 + 10 + 5 - 5' "$(wallet_balance)" 100.00
expect_equal 'REFUND points to its BET' \
    "$(sql "SELECT r.external_transaction_id FROM wager_transactions t JOIN wager_transactions r ON r.id = t.reference_transaction_id WHERE t.provider_id = '$PROVIDER_ID' AND t.external_transaction_id = 'refund-1'")" bet-1

step 'Replay of the REFUND now returns the final outcome'
submit REFUND 10.00 refund-1 bet-1
expect_field status PROCESSED
expect_field idempotentReplay true

expect_ledger_consistent
summary
