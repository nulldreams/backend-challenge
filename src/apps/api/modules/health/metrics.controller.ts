import { metricsRegistry } from '@infra/metrics'
import { Controller, Get, Header } from '@nestjs/common'

@Controller('metrics')
export class MetricsController {
    @Get()
    @Header('Content-Type', metricsRegistry.contentType)
    metrics(): Promise<string> {
        return metricsRegistry.metrics()
    }
}
