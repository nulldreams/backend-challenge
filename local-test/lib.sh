#!/usr/bin/env bash
set -uo pipefail

API_URL=${API_URL:-http://127.0.0.1:3000}
POSTGRES_CONTAINER=${POSTGRES_CONTAINER:-wagering-rebuild-postgres-1}
LOCALSTACK_CONTAINER=${LOCALSTACK_CONTAINER:-wagering-rebuild-localstack-1}
COMPOSE_FILE=${COMPOSE_FILE:-"$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/docker/docker-compose.yml"}
QUEUE_BASE_URL=http://localhost:4566/000000000000
TRANSACTIONS_QUEUE=$QUEUE_BASE_URL/wager-transactions.fifo
DLQ=$QUEUE_BASE_URL/wager-transactions-dlq.fifo
EVENTS_QUEUE=$QUEUE_BASE_URL/wager-events.fifo
RUN_ID=$(date +%s)$RANDOM
PROVIDER_ID=provider-local-$RUN_ID

PASSED=0
FAILED=0
GREEN=$'\e[32m'
RED=$'\e[31m'
CYAN=$'\e[36m'
BOLD=$'\e[1m'
RESET=$'\e[0m'

RESPONSE_STATUS=''
RESPONSE_BODY=''
RESPONSE_HEADERS=''
WALLET_ID=''
PLAYER_ID=''

title() {
    echo
    echo "${BOLD}${CYAN}== $* ==${RESET}"
}

step() {
    echo "${BOLD}-> $*${RESET}"
}

uuid() {
    bun -e 'console.log(Bun.randomUUIDv7())'
}

json_field() {
    bun -e '
        const [, json, path] = process.argv
        const value = path.split(".").reduce((node, key) => node?.[key], JSON.parse(json || "{}"))
        console.log(value === undefined || value === null ? "" : typeof value === "object" ? JSON.stringify(value) : value)
    ' "$1" "$2"
}

request() {
    local method=$1 path=$2 body=${3:-} idempotency_key=${4:-}
    local headers_file
    headers_file=$(mktemp)
    local arguments=(-s -o - -D "$headers_file" -w '\n%{http_code}' -X "$method" "$API_URL$path")

    if [[ -n $body ]]; then arguments+=(-H 'content-type: application/json' -d "$body"); fi

    if [[ -n $idempotency_key ]]; then arguments+=(-H "Idempotency-Key: $idempotency_key"); fi

    local output
    output=$(curl "${arguments[@]}")
    RESPONSE_STATUS=${output##*$'\n'}
    RESPONSE_BODY=${output%$'\n'*}
    RESPONSE_HEADERS=$(cat "$headers_file")
    rm -f "$headers_file"
    echo "   $method $path -> $RESPONSE_STATUS $RESPONSE_BODY" | cut -c1-220
}

create_wallet() {
    local amount=${1:-100.00} currency=${2:-BRL}
    PLAYER_ID=$(uuid)
    request POST /wallets "{\"playerId\":\"$PLAYER_ID\",\"initialBalance\":{\"amount\":\"$amount\",\"currency\":\"$currency\"}}"
    WALLET_ID=$(json_field "$RESPONSE_BODY" id)
}

wager_body() {
    local kind=$1 amount=$2 external_id=$3 reference=${4:-} wallet_id=${5:-$WALLET_ID} currency=${6:-BRL}
    local reference_field=''

    if [[ -n $reference ]]; then reference_field=",\"referenceExternalTransactionId\":\"$reference\""; fi

    echo "{\"providerId\":\"$PROVIDER_ID\",\"externalTransactionId\":\"$external_id\",\"playerId\":\"$PLAYER_ID\",\"walletId\":\"$wallet_id\",\"roundId\":\"round-1\",\"gameId\":\"fortune-chimp\",\"kind\":\"$kind\",\"money\":{\"amount\":\"$amount\",\"currency\":\"$currency\"}$reference_field}"
}

submit() {
    local kind=$1 amount=$2 external_id=$3 reference=${4:-}
    request POST /wagering/transactions "$(wager_body "$kind" "$amount" "$external_id" "$reference")" "$PROVIDER_ID:$external_id"
}

sql() {
    docker exec "$POSTGRES_CONTAINER" psql -tA -U wagering -d wagering -c "$1"
}

sqs() {
    docker exec "$LOCALSTACK_CONTAINER" awslocal sqs "$@"
}

send_wager_message() {
    local message_id=$1 data=$2 group_id=${3:-$WALLET_ID}
    local body="{\"messageId\":\"$message_id\",\"type\":\"WagerTransactionRequested\",\"occurredAt\":\"2026-01-01T00:00:00.000Z\",\"data\":$data}"
    sqs send-message --queue-url "$TRANSACTIONS_QUEUE" --message-group-id "$group_id" \
        --message-deduplication-id "$(uuid)" --message-body "$body" --query MessageId --output text > /dev/null
}

queue_size() {
    sqs get-queue-attributes --queue-url "$1" \
        --attribute-names ApproximateNumberOfMessages ApproximateNumberOfMessagesNotVisible \
        --query 'sum([to_number(Attributes.ApproximateNumberOfMessages), to_number(Attributes.ApproximateNumberOfMessagesNotVisible)])' \
        --output text
}

wait_until() {
    local description=$1 condition=$2 timeout_seconds=${3:-30}
    local deadline=$((SECONDS + timeout_seconds))

    while ((SECONDS < deadline)); do
        if eval "$condition" > /dev/null 2>&1; then return 0; fi

        sleep 1
    done

    fail "timed out waiting for: $description"
    return 1
}

pass() {
    PASSED=$((PASSED + 1))
    echo "   ${GREEN}ok${RESET} $*"
}

fail() {
    FAILED=$((FAILED + 1))
    echo "   ${RED}FAIL${RESET} $*"
}

expect_equal() {
    local description=$1 actual=$2 expected=$3

    if [[ $actual == "$expected" ]]; then pass "$description = $expected"; else fail "$description: expected '$expected', got '$actual'"; fi
}

expect_status() {
    expect_equal 'HTTP status' "$RESPONSE_STATUS" "$1"
}

expect_field() {
    expect_equal "$1" "$(json_field "$RESPONSE_BODY" "$1")" "$2"
}

expect_ledger_consistent() {
    local wallet_id=${1:-$WALLET_ID}
    local row
    row=$(sql "SELECT w.balance, coalesce(sum(CASE e.direction WHEN 'CREDIT' THEN e.amount ELSE -e.amount END), 0)::numeric(18,2)
                 FROM wallets w LEFT JOIN wallet_ledger_entries e ON e.wallet_id = w.id
                WHERE w.id = '$wallet_id' GROUP BY w.balance")
    local stored=${row%%|*} calculated=${row##*|}
    expect_equal "wallet.balance == ledger ($wallet_id)" "$stored" "$calculated"
}

count_debits() {
    sql "SELECT count(*) FROM wallet_ledger_entries WHERE wallet_id = '${1:-$WALLET_ID}' AND direction = 'DEBIT'"
}

wallet_balance() {
    sql "SELECT balance FROM wallets WHERE id = '${1:-$WALLET_ID}'"
}

transaction_status() {
    sql "SELECT status FROM wager_transactions WHERE provider_id = '$PROVIDER_ID' AND external_transaction_id = '$1'"
}

require_stack() {
    if ! curl -s -o /dev/null -m 3 "$API_URL/health/ready"; then
        echo "${RED}API not reachable at $API_URL. Run: bun run docker:up${RESET}"
        exit 1
    fi
}

summary() {
    echo
    if ((FAILED == 0)); then
        echo "${GREEN}${BOLD}$PASSED checks passed${RESET}"
    else
        echo "${RED}${BOLD}$FAILED of $((PASSED + FAILED)) checks failed${RESET}"
    fi
    ((FAILED == 0))
}

require_stack
