import { metricsRegistry } from './metrics'

export function serveMetrics(port: number): void {
    Bun.serve({
        port,
        async fetch(request) {
            if (new URL(request.url).pathname !== '/metrics') return new Response('Not found', { status: 404 })

            return new Response(await metricsRegistry.metrics(), {
                headers: { 'content-type': metricsRegistry.contentType },
            })
        },
    })
}
