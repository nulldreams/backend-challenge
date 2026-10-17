import { Module } from '@nestjs/common'
import { HealthModule, WageringModule, WalletsModule } from './modules'

@Module({
    imports: [HealthModule, WalletsModule, WageringModule],
})
export class ApiModule {}
