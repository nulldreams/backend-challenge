import {
    GetWalletLedgerUseCase,
    GetWalletUseCase,
    OpenWalletUseCase,
    ReconcileWalletUseCase,
} from '@application/use-cases'
import { DatabaseModule } from '@infra/database'
import { Module } from '@nestjs/common'
import { WalletsController } from './wallets.controller'

@Module({
    imports: [DatabaseModule],
    controllers: [WalletsController],
    providers: [OpenWalletUseCase, GetWalletUseCase, GetWalletLedgerUseCase, ReconcileWalletUseCase],
})
export class WalletsModule {}
