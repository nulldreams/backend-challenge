#!/usr/bin/env bash
source "$(dirname "$0")/lib.sh"

title '13 - Reconciliation (§9): stored balance vs ledger, divergence flagged and never fixed silently'
create_wallet 100.00
submit BET 30.00 bet-1
submit WIN 10.00 win-1 bet-1

step 'Consistent wallet'
request POST "/wallets/$WALLET_ID/reconciliation"
expect_status 200
expect_field consistent true
expect_field checkedEntries 3
expect_field difference.amount 0.00

step 'Tamper with the stored balance directly in the database (outside the application)'
sql "UPDATE wallets SET balance = 95.00 WHERE id = '$WALLET_ID'" > /dev/null
request POST "/wallets/$WALLET_ID/reconciliation"
expect_field consistent false
expect_field storedBalance.amount 95.00
expect_field calculatedBalance.amount 80.00
expect_field difference.amount 15.00
expect_equal 'balance was not corrected' "$(wallet_balance)" 95.00

step 'Divergence counted in the metrics and logged'
curl -s "$API_URL/metrics" | grep '^wallet_reconciliations_total' | sed 's/^/   /'
docker compose -f "$COMPOSE_FILE" logs api 2>/dev/null | grep 'diverges' | grep "$WALLET_ID" | tail -1 | cut -c1-220

step 'Ledger is append-only: even the database refuses to rewrite it'
error=$(sql "UPDATE wallet_ledger_entries SET amount = 1 WHERE wallet_id = '$WALLET_ID'" 2>&1)
expect_equal 'UPDATE on the ledger blocked' "$(echo "$error" | grep -c 'append-only')" 1

step 'Restore the stored balance'
sql "UPDATE wallets SET balance = 80.00 WHERE id = '$WALLET_ID'" > /dev/null
request POST "/wallets/$WALLET_ID/reconciliation"
expect_field consistent true

summary
