#!/usr/bin/env bash
source "$(dirname "$0")/lib.sh"

PARALLEL=${PARALLEL:-50}

title "05 - The same bet sent $PARALLEL times in parallel (§13): a single debit"
create_wallet 100.00
results=$(mktemp -d)

step "Fire $PARALLEL identical requests"
for index in $(seq 1 "$PARALLEL"); do
    curl -s -X POST "$API_URL/wagering/transactions" -H 'content-type: application/json' \
        -H "Idempotency-Key: $PROVIDER_ID:bet-1" -d "$(wager_body BET 10.00 bet-1)" > "$results/$index" &
done
wait

ids=$(cat "$results"/* | grep -o '"transactionId":"[^"]*"' | sort -u | wc -l)
replays=$(cat "$results"/* | grep -o '"idempotentReplay":true' | wc -l)
expect_equal 'distinct transaction ids' "$ids" 1
expect_equal 'replays' "$replays" $((PARALLEL - 1))
expect_equal 'debits' "$(count_debits)" 1
expect_equal 'balance' "$(wallet_balance)" 90.00

rm -rf "$results"
expect_ledger_consistent
summary
