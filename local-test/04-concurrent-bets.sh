#!/usr/bin/env bash
source "$(dirname "$0")/lib.sh"

title '04 - Mandatory scenario (§8): balance 100.00, two bets of 80.00 at the same time'
create_wallet 100.00
results=$(mktemp -d)

step 'Fire both bets in parallel'
for bet in bet-a bet-b; do
    curl -s -X POST "$API_URL/wagering/transactions" -H 'content-type: application/json' \
        -H "Idempotency-Key: $PROVIDER_ID:$bet" -d "$(wager_body BET 80.00 "$bet")" > "$results/$bet" &
done
wait

statuses=$(for file in "$results"/*; do json_field "$(cat "$file")" status; done | sort | tr '\n' ' ')
expect_equal 'statuses' "$statuses" 'PROCESSED REJECTED '
expect_equal 'final balance' "$(wallet_balance)" 20.00
expect_equal 'debits in the ledger' "$(count_debits)" 1

step 'Retrying both bets does not debit again'
for bet in bet-a bet-b; do submit BET 80.00 "$bet" > /dev/null; done
expect_equal 'final balance after retries' "$(wallet_balance)" 20.00
expect_equal 'debits after retries' "$(count_debits)" 1

rm -rf "$results"
expect_ledger_consistent
summary
