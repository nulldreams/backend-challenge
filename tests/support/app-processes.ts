import type { Subprocess } from 'bun'

export type WorkerApp = 'consumer' | 'outbox-publisher' | 'reference-worker'

export interface AppProcess {
    app: WorkerApp
    process: Subprocess
    output: () => string
}

export function spawnApp(app: WorkerApp): AppProcess {
    const child = Bun.spawn([process.execPath, `src/apps/${app}/main.ts`], {
        cwd: `${import.meta.dir}/../..`,
        env: { ...Bun.env, METRICS_PORT: '0' },
        stdout: 'pipe',
        stderr: 'pipe',
    })
    let output = ''
    const collect = async (stream: ReadableStream<Uint8Array>) => {
        for await (const chunk of stream) output += Buffer.from(chunk).toString()
    }
    void collect(child.stdout as ReadableStream<Uint8Array>)
    void collect(child.stderr as ReadableStream<Uint8Array>)

    return { app, process: child, output: () => output }
}

export async function killHard(app: AppProcess): Promise<void> {
    app.process.kill('SIGKILL')
    await app.process.exited

    if (isAlive(app.process.pid)) throw new Error(`${app.app} (pid ${app.process.pid}) survived the kill`)
}

function isAlive(pid: number): boolean {
    try {
        process.kill(pid, 0)
        return true
    } catch {
        return false
    }
}

export const countLogLines = (app: AppProcess, fragment: string): number =>
    app
        .output()
        .split('\n')
        .filter((line) => line.includes(fragment)).length
