function readRequiredEnv(name: string): string {
    const value = process.env[name]

    if (!value) throw new Error(`Missing required environment variable: ${name}`)

    return value
}

export const env = {
    port: Number(process.env.PORT ?? 3000),
    metricsPort: Number(process.env.METRICS_PORT ?? 9464),
    consumer: {
        retryDelaysSeconds: (process.env.CONSUMER_RETRY_DELAYS_SECONDS ?? '5,10,20,40').split(',').map(Number),
    },
    postgres: {
        host: readRequiredEnv('POSTGRES_HOST'),
        port: Number(process.env.POSTGRES_PORT ?? 5432),
        user: readRequiredEnv('POSTGRES_USER'),
        password: readRequiredEnv('POSTGRES_PASSWORD'),
        database: readRequiredEnv('POSTGRES_DB'),
    },
    aws: {
        region: readRequiredEnv('AWS_REGION'),
        endpoint: process.env.AWS_ENDPOINT_URL,
        queues: {
            wagerTransactions: readRequiredEnv('WAGER_TRANSACTIONS_QUEUE'),
            wagerTransactionsDlq: readRequiredEnv('WAGER_TRANSACTIONS_DLQ'),
            wagerEvents: readRequiredEnv('WAGER_EVENTS_QUEUE'),
        },
    },
} as const
