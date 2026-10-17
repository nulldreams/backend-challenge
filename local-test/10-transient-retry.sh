#!/usr/bin/env bash
source "$(dirname "$0")/lib.sh"

title '10 - Transient failure (§9 and §10): wallet lock held longer than lock_timeout'
create_wallet 100.00

hold_lock() {
    docker exec "$POSTGRES_CONTAINER" psql -q -U wagering -d wagering \
        -c "BEGIN; SELECT 1 FROM wallets WHERE id = '$WALLET_ID' FOR UPDATE; SELECT pg_sleep($1); COMMIT;" > /dev/null
}

step 'HTTP: someone holds the wallet lock for 4s; the API gives up after 2s with 503 + Retry-After'
hold_lock 4 &
sleep 0.5
submit BET 10.00 bet-1
expect_status 503
expect_field code SERVICE_UNAVAILABLE
expect_equal 'Retry-After header' "$(echo "$RESPONSE_HEADERS" | grep -i '^retry-after' | tr -d '\r' | cut -d' ' -f2)" 1
wait

step 'Retrying with the same key after the lock is released works'
submit BET 10.00 bet-1
expect_status 200
expect_field balance.amount 90.00

step 'SQS: the same situation goes back to the queue with backoff and is processed when it clears'
hold_lock 8 &
sleep 0.5
send_wager_message "msg-$RUN_ID" "{\"providerId\":\"$PROVIDER_ID\",\"externalTransactionId\":\"sqs-bet\",\"idempotencyKey\":\"$PROVIDER_ID:sqs-bet\",\"playerId\":\"$PLAYER_ID\",\"walletId\":\"$WALLET_ID\",\"roundId\":\"r\",\"gameId\":\"g\",\"kind\":\"BET\",\"money\":{\"amount\":\"10.00\",\"currency\":\"BRL\"}}"
sleep 4
expect_equal 'not processed while locked' "$(transaction_status sqs-bet)" ''
wait
wait_until 'processed after backoff' '[[ $(transaction_status sqs-bet) == PROCESSED ]]' 60 && pass 'processed on retry'

expect_equal 'balance' "$(wallet_balance)" 80.00
expect_ledger_consistent
summary
