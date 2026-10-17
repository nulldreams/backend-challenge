import { describeError } from '@application/messaging'
import { BeforeApplicationShutdown, Logger } from '@nestjs/common'

const IDLE_DELAY_MS = 1_000

export abstract class WorkerLoop implements BeforeApplicationShutdown {
    protected readonly logger = new Logger(this.constructor.name)

    private readonly shutdown = new AbortController()
    private running?: Promise<void>

    protected get shutdownSignal(): AbortSignal {
        return this.shutdown.signal
    }

    protected abstract tick(): Promise<boolean>

    runOnce(): Promise<boolean> {
        return this.tick()
    }

    start(): Promise<void> {
        this.logger.log('Worker started')
        this.running = this.loop()
        return this.running
    }

    async beforeApplicationShutdown(signal?: string): Promise<void> {
        this.logger.log('Shutdown requested, finishing current cycle', { signal })
        this.shutdown.abort()
        await this.running
        this.logger.log('Worker stopped')
    }

    private async loop(): Promise<void> {
        while (!this.shutdownSignal.aborted) {
            const hasMoreWork = await this.tickSafely()

            if (!hasMoreWork) await this.sleep(IDLE_DELAY_MS)
        }
    }

    private async tickSafely(): Promise<boolean> {
        try {
            return await this.tick()
        } catch (error) {
            this.logger.error('Worker cycle failed', { error: describeError(error) })
            return false
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => {
            if (this.shutdownSignal.aborted) return resolve()

            const timer = setTimeout(resolve, ms)
            this.shutdownSignal.addEventListener(
                'abort',
                () => {
                    clearTimeout(timer)
                    resolve()
                },
                { once: true },
            )
        })
    }
}
