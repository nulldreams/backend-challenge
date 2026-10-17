#!/usr/bin/env bash
source "$(dirname "$0")/lib.sh"

title '14 - Queries (§9): transaction lookups and ledger keyset pagination'
create_wallet 100.00
for bet in 1 2 3 4; do submit BET 1.00 "bet-$bet" > /dev/null; done
submit BET 1.00 bet-5
transaction_id=$(json_field "$RESPONSE_BODY" transactionId)

step 'Lookup by internal id and by provider id'
request GET "/wagering/transactions/$transaction_id"
expect_status 200
expect_field externalTransactionId bet-5
request GET "/providers/$PROVIDER_ID/wagering/transactions/bet-5"
expect_field transactionId "$transaction_id"
request GET "/providers/$PROVIDER_ID/wagering/transactions/missing"
expect_status 404

step 'Ledger pages of 2 until nextCursor is null'
cursor=''
versions=''
pages=0
while :; do
    request GET "/wallets/$WALLET_ID/ledger?limit=2${cursor:+&cursor=$cursor}" > /dev/null
    versions+="$(echo "$RESPONSE_BODY" | grep -o '"walletVersion":[0-9]*' | cut -d: -f2 | tr '\n' ' ')"
    cursor=$(json_field "$RESPONSE_BODY" nextCursor)
    pages=$((pages + 1))

    if [[ -z $cursor ]]; then break; fi
done
expect_equal 'versions seen in order' "$versions" '1 2 3 4 5 6 '
expect_equal 'pages' "$pages" 3

step 'Opaque cursor validation'
request GET "/wallets/$WALLET_ID/ledger?cursor=!!!"
expect_status 400

summary
