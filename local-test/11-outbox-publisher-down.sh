#!/usr/bin/env bash
source "$(dirname "$0")/lib.sh"

title '11 - Transactional outbox (§11): publishers down, events kept, published when they come back'

pending_for_wallet() {
    sql "SELECT count(*) FROM outbox_messages WHERE published_at IS NULL
          AND (aggregate_id = '$WALLET_ID' OR payload->'data'->>'walletId' = '$WALLET_ID')"
}

step 'Stop every outbox-publisher'
docker compose -f "$COMPOSE_FILE" stop outbox-publisher > /dev/null 2>&1
create_wallet 100.00
submit BET 10.00 bet-1
submit BET 10.00 bet-2

step 'Bets keep working; their events wait in the outbox, committed with the bets'
expect_equal 'balance' "$(wallet_balance)" 80.00
expect_equal 'pending events (2 opening + 2 per bet)' "$(pending_for_wallet)" 6
curl -s "$API_URL/metrics" | grep '^wagering_outbox' | sed 's/^/   /'

step 'Start the publishers again'
docker compose -f "$COMPOSE_FILE" start outbox-publisher > /dev/null 2>&1
wait_until 'outbox drained' '[[ $(pending_for_wallet) == 0 ]]' 60 && pass 'every event published'
expect_equal 'published events' "$(sql "SELECT count(*) FROM outbox_messages WHERE published_at IS NOT NULL AND (aggregate_id = '$WALLET_ID' OR payload->'data'->>'walletId' = '$WALLET_ID')")" 6

step 'Event types written for this wallet'
sql "SELECT event_type, count(*) FROM outbox_messages WHERE aggregate_id = '$WALLET_ID' OR payload->'data'->>'walletId' = '$WALLET_ID' GROUP BY 1 ORDER BY 1" | sed 's/^/   /'

expect_ledger_consistent
summary
