#!/usr/bin/env bash
source "$(dirname "$0")/lib.sh"

WALLETS=${WALLETS:-10}
BETS_PER_WALLET=${BETS_PER_WALLET:-20}

title "06 - Distinct wallets in parallel (§13): $WALLETS wallets x $BETS_PER_WALLET bets, all mixed"
wallets=()
players=()

for _ in $(seq 1 "$WALLETS"); do
    create_wallet 100.00 > /dev/null
    wallets+=("$WALLET_ID")
    players+=("$PLAYER_ID")
done

step "Fire $((WALLETS * BETS_PER_WALLET)) bets of 1.00 at once"
for bet in $(seq 1 "$BETS_PER_WALLET"); do
    for index in "${!wallets[@]}"; do
        WALLET_ID=${wallets[$index]}
        PLAYER_ID=${players[$index]}
        curl -s -o /dev/null -X POST "$API_URL/wagering/transactions" -H 'content-type: application/json' \
            -H "Idempotency-Key: $PROVIDER_ID:$WALLET_ID-$bet" -d "$(wager_body BET 1.00 "$WALLET_ID-$bet")" &
    done
done
wait

expected_balance=$(printf '%.2f' "$((100 - BETS_PER_WALLET))")
for wallet_id in "${wallets[@]}"; do
    expect_equal "balance of $wallet_id" "$(wallet_balance "$wallet_id")" "$expected_balance"
    expect_ledger_consistent "$wallet_id"
done

summary
