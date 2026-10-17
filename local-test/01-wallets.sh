#!/usr/bin/env bash
source "$(dirname "$0")/lib.sh"

title '01 - Wallets (§9): opening, duplicate and validation'

step 'Open a wallet with 100.00 BRL: wallet + OPENING + CREDIT in one SQL transaction'
create_wallet 100.00
expect_status 201
expect_field balance.amount 100.00
expect_field version 1
expect_equal 'OPENING transactions' "$(sql "SELECT count(*) FROM wager_transactions WHERE wallet_id = '$WALLET_ID' AND kind = 'OPENING'")" 1
expect_equal 'ledger entries' "$(sql "SELECT count(*) FROM wallet_ledger_entries WHERE wallet_id = '$WALLET_ID'")" 1

step 'Same player and currency again: conflict'
request POST /wallets "{\"playerId\":\"$PLAYER_ID\",\"initialBalance\":{\"amount\":\"5.00\",\"currency\":\"BRL\"}}"
expect_status 409
expect_field code WALLET_ALREADY_EXISTS

step 'Same player in another currency is a different wallet'
request POST /wallets "{\"playerId\":\"$PLAYER_ID\",\"initialBalance\":{\"amount\":\"0.00\",\"currency\":\"USD\"}}"
expect_status 201
expect_equal 'ledger entries for a zero opening' "$(sql "SELECT count(*) FROM wallet_ledger_entries WHERE wallet_id = '$(json_field "$RESPONSE_BODY" id)'")" 0

step 'Invalid money is rejected by the domain'
request POST /wallets "{\"playerId\":\"$(uuid)\",\"initialBalance\":{\"amount\":\"10.001\",\"currency\":\"BRL\"}}"
expect_status 400
expect_field code INVALID_AMOUNT
request POST /wallets "{\"playerId\":\"$(uuid)\",\"initialBalance\":{\"amount\":\"10.00\",\"currency\":\"brl\"}}"
expect_status 400
expect_field code INVALID_CURRENCY

step 'Read the wallet back'
request GET "/wallets/$WALLET_ID"
expect_status 200
expect_field balance.amount 100.00
request GET /wallets/0192f291-27dd-7d3f-8071-5f8685deef37
expect_status 404

expect_ledger_consistent
summary
