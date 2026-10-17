export interface WaitOptions {
    timeoutMs?: number
    intervalMs?: number
    description?: string
}

export async function waitFor<T>(
    check: () => Promise<T | undefined | false>,
    { timeoutMs = 15_000, intervalMs = 100, description = 'condition' }: WaitOptions = {},
): Promise<T> {
    const deadline = Date.now() + timeoutMs

    while (Date.now() < deadline) {
        const result = await check()

        if (result) return result

        await Bun.sleep(intervalMs)
    }

    throw new Error(`Timed out after ${timeoutMs}ms waiting for ${description}`)
}
