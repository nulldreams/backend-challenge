#!/usr/bin/env bash
source "$(dirname "$0")/lib.sh"

title '09 - SQS errors (§10): permanent errors go straight to the DLQ, business errors are acknowledged'
create_wallet 100.00

read_dead_letters() {
    sqs receive-message --queue-url "$DLQ" --max-number-of-messages 10 --wait-time-seconds 1 \
        --message-attribute-names All --query 'Messages[].MessageAttributes.failureCode.StringValue' --output text
}

step 'Purge the DLQ to read only this run'
sqs purge-queue --queue-url "$DLQ" > /dev/null
sleep 2

step 'Invalid JSON, unknown type and OPENING from outside'
sqs send-message --queue-url "$TRANSACTIONS_QUEUE" --message-group-id "$WALLET_ID" \
    --message-deduplication-id "$(uuid)" --message-body '{not json' > /dev/null
sqs send-message --queue-url "$TRANSACTIONS_QUEUE" --message-group-id "$WALLET_ID" \
    --message-deduplication-id "$(uuid)" --message-body '{"messageId":"m1","type":"SomethingElse","occurredAt":"2026-01-01T00:00:00.000Z","data":{}}' > /dev/null
send_wager_message "msg-opening-$RUN_ID" "{\"providerId\":\"$PROVIDER_ID\",\"externalTransactionId\":\"op-1\",\"idempotencyKey\":\"$PROVIDER_ID:op-1\",\"playerId\":\"$PLAYER_ID\",\"walletId\":\"$WALLET_ID\",\"roundId\":\"r\",\"gameId\":\"g\",\"kind\":\"OPENING\",\"money\":{\"amount\":\"1.00\",\"currency\":\"BRL\"}}"

wait_until 'three dead letters' '[[ $(queue_size "$DLQ") -ge 3 ]]' 30 && pass 'all three in the DLQ'
codes=$(read_dead_letters | tr '\t' '\n' | sort | tr '\n' ' ')
expect_equal 'failureCode attributes' "$codes" 'KIND_NOT_ALLOWED SyntaxError ZodError '

step 'A business rejection is acknowledged, not retried'
send_wager_message "msg-nofunds-$RUN_ID" "{\"providerId\":\"$PROVIDER_ID\",\"externalTransactionId\":\"big-bet\",\"idempotencyKey\":\"$PROVIDER_ID:big-bet\",\"playerId\":\"$PLAYER_ID\",\"walletId\":\"$WALLET_ID\",\"roundId\":\"r\",\"gameId\":\"g\",\"kind\":\"BET\",\"money\":{\"amount\":\"999.00\",\"currency\":\"BRL\"}}"
wait_until 'rejection recorded' '[[ $(transaction_status big-bet) == REJECTED ]]' 30 && pass 'REJECTED and acknowledged'
wait_until 'queue drained' '[[ $(queue_size "$TRANSACTIONS_QUEUE") == 0 ]]' 30 && pass 'nothing left to retry'

expect_equal 'no wager rows from the invalid messages' "$(sql "SELECT count(*) FROM wager_transactions WHERE provider_id = '$PROVIDER_ID' AND kind <> 'BET'")" 0
expect_ledger_consistent
summary
