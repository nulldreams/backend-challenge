#!/usr/bin/env bash
source "$(dirname "$0")/lib.sh"

MESSAGES=${MESSAGES:-200}
WALLETS=${WALLETS:-10}

title "12 - Multiple instances and crash recovery (§13): $MESSAGES messages, consumers killed mid-load"
wallets=()
players=()

for _ in $(seq 1 "$WALLETS"); do
    create_wallet 100.00 > /dev/null
    wallets+=("$WALLET_ID")
    players+=("$PLAYER_ID")
done

processed_count() {
    sql "SELECT count(*) FROM wager_transactions WHERE provider_id = '$PROVIDER_ID'"
}

step "Send $MESSAGES bets of 1.00, each one twice (redelivery), killing two consumers with SIGKILL halfway through"
for index in $(seq 1 "$MESSAGES"); do
    slot=$((index % WALLETS))
    WALLET_ID=${wallets[$slot]}
    PLAYER_ID=${players[$slot]}
    data="{\"providerId\":\"$PROVIDER_ID\",\"externalTransactionId\":\"bet-$index\",\"idempotencyKey\":\"$PROVIDER_ID:bet-$index\",\"playerId\":\"$PLAYER_ID\",\"walletId\":\"$WALLET_ID\",\"roundId\":\"r\",\"gameId\":\"g\",\"kind\":\"BET\",\"money\":{\"amount\":\"1.00\",\"currency\":\"BRL\"}}"
    send_wager_message "msg-$RUN_ID-$index" "$data" &
    send_wager_message "msg-$RUN_ID-$index" "$data" &

    if ((index % 20 == 0)); then wait; fi

    if ((index == MESSAGES / 2)); then
        docker kill --signal KILL wagering-rebuild-consumer-1 wagering-rebuild-consumer-2 > /dev/null
        echo "   killed consumer-1 and consumer-2 with $(processed_count)/$MESSAGES processed"
    fi
done
wait

step 'Only consumer-3 is alive while the second half arrives; bring the killed ones back'
echo "   processed before restart: $(processed_count)/$MESSAGES"
sleep 3
docker start wagering-rebuild-consumer-1 wagering-rebuild-consumer-2 > /dev/null

wait_until 'every message processed' '[[ $(processed_count) == '"$MESSAGES"' && $(queue_size "$TRANSACTIONS_QUEUE") == 0 ]]' 120 \
    && pass "all $MESSAGES processed and acknowledged"

expect_equal 'one transaction per key' "$(sql "SELECT count(DISTINCT idempotency_key) FROM wager_transactions WHERE provider_id = '$PROVIDER_ID'")" "$MESSAGES"
expect_equal 'one inbox row per message' "$(sql "SELECT count(*) FROM inbox_messages WHERE message_id LIKE 'msg-$RUN_ID-%'")" "$MESSAGES"

expected_balance=$(printf '%.2f' "$((100 - MESSAGES / WALLETS))")
for wallet_id in "${wallets[@]}"; do
    expect_equal "balance of $wallet_id" "$(wallet_balance "$wallet_id")" "$expected_balance"
    expect_ledger_consistent "$wallet_id"
done

step 'Work split across the three consumers'
for consumer in 1 2 3; do
    echo "   consumer-$consumer: $(docker logs "wagering-rebuild-consumer-$consumer" 2>&1 | grep -c "$PROVIDER_ID") messages logged"
done

summary
