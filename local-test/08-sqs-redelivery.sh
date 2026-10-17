#!/usr/bin/env bash
source "$(dirname "$0")/lib.sh"

title '08 - SQS inbox (§10): the same message delivered twice has a single effect'
create_wallet 100.00
message_id=msg-$RUN_ID
data="{\"providerId\":\"$PROVIDER_ID\",\"externalTransactionId\":\"sqs-bet-1\",\"idempotencyKey\":\"$PROVIDER_ID:sqs-bet-1\",\"playerId\":\"$PLAYER_ID\",\"walletId\":\"$WALLET_ID\",\"roundId\":\"round-1\",\"gameId\":\"fortune-chimp\",\"kind\":\"BET\",\"money\":{\"amount\":\"25.00\",\"currency\":\"BRL\"}}"

step 'Purge the DLQ to read only this run'
sqs purge-queue --queue-url "$DLQ" > /dev/null
sleep 2

step 'Send the same message twice (SQS dedup bypassed on purpose: the inbox is the guarantee)'
send_wager_message "$message_id" "$data"
send_wager_message "$message_id" "$data"

wait_until 'message processed' '[[ $(transaction_status sqs-bet-1) == PROCESSED ]]' 30 && pass 'consumer processed the BET'
wait_until 'queue drained' '[[ $(queue_size "$TRANSACTIONS_QUEUE") == 0 ]]' 30 && pass 'both copies acknowledged'

expect_equal 'transactions' "$(sql "SELECT count(*) FROM wager_transactions WHERE provider_id = '$PROVIDER_ID'")" 1
expect_equal 'inbox rows' "$(sql "SELECT count(*) FROM inbox_messages WHERE message_id = '$message_id'")" 1
expect_equal 'balance' "$(wallet_balance)" 75.00

step 'The same messageId with another payload is not a redelivery: DLQ'
send_wager_message "$message_id" "${data/25.00/30.00}"
wait_until 'conflict moved to the DLQ' '[[ $(queue_size "$DLQ") -ge 1 ]]' 30 && pass 'message in the DLQ'
expect_equal 'balance still' "$(wallet_balance)" 75.00

step 'Consumer logs carry correlationId and messageId'
docker compose -f "$COMPOSE_FILE" logs consumer 2>/dev/null | grep "$message_id" | grep -m1 'Message processed' | cut -c1-200

expect_ledger_consistent
summary
