#!/bin/bash
set -euo pipefail

QUEUE=wager-transactions.fifo
DLQ=wager-transactions-dlq.fifo
EVENTS_QUEUE=wager-events.fifo
MAX_RECEIVE_COUNT=5
VISIBILITY_TIMEOUT=30

awslocal sqs create-queue --queue-name "$EVENTS_QUEUE" --attributes FifoQueue=true,ContentBasedDeduplication=false > /dev/null

DLQ_URL=$(awslocal sqs create-queue --queue-name "$DLQ" --attributes FifoQueue=true --query QueueUrl --output text)
DLQ_ARN=$(awslocal sqs get-queue-attributes --queue-url "$DLQ_URL" --attribute-names QueueArn --query Attributes.QueueArn --output text)

awslocal sqs create-queue --queue-name "$QUEUE" --attributes "{
  \"FifoQueue\": \"true\",
  \"ContentBasedDeduplication\": \"false\",
  \"VisibilityTimeout\": \"$VISIBILITY_TIMEOUT\",
  \"RedrivePolicy\": \"{\\\"deadLetterTargetArn\\\":\\\"$DLQ_ARN\\\",\\\"maxReceiveCount\\\":\\\"$MAX_RECEIVE_COUNT\\\"}\"
}" > /dev/null

echo "SQS queues ready: $QUEUE -> $DLQ (maxReceiveCount=$MAX_RECEIVE_COUNT), $EVENTS_QUEUE"
