import {
    GetWalletLedgerUseCase,
    GetWalletUseCase,
    OpenWalletUseCase,
    ReconcileWalletUseCase,
} from '@application/use-cases'
import { CorrelationId, ProviderAuthGuard, ZodValidationPipe } from '@infra/http'
import { metrics } from '@infra/metrics'
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common'
import { type OpenWalletRequest, openWalletRequestSchema } from './open-wallet.request'
import { walletIdSchema } from './wallet-id.param'
import { type WalletLedgerQuery, walletLedgerQuerySchema } from './wallet-ledger.query'
import { toWalletLedgerResponse, type WalletLedgerResponse } from './wallet-ledger.response'
import { toWalletReconciliationResponse, type WalletReconciliationResponse } from './wallet-reconciliation.response'
import { toWalletResponse, type WalletResponse } from './wallet.response'

@Controller('wallets')
@UseGuards(ProviderAuthGuard)
export class WalletsController {
    constructor(
        private readonly openWalletUseCase: OpenWalletUseCase,
        private readonly getWalletUseCase: GetWalletUseCase,
        private readonly getWalletLedgerUseCase: GetWalletLedgerUseCase,
        private readonly reconcileWalletUseCase: ReconcileWalletUseCase,
    ) {}

    @Post()
    async open(
        @Body(new ZodValidationPipe(openWalletRequestSchema)) request: OpenWalletRequest,
        @CorrelationId() correlationId: string,
    ): Promise<WalletResponse> {
        const wallet = await this.openWalletUseCase.execute({ ...request, context: { correlationId } })

        return toWalletResponse(wallet)
    }

    @Get(':walletId')
    async get(@Param('walletId', new ZodValidationPipe(walletIdSchema)) walletId: string): Promise<WalletResponse> {
        const wallet = await this.getWalletUseCase.execute(walletId)

        return toWalletResponse(wallet)
    }

    @Get(':walletId/ledger')
    async getLedger(
        @Param('walletId', new ZodValidationPipe(walletIdSchema)) walletId: string,
        @Query(new ZodValidationPipe(walletLedgerQuerySchema)) { cursor, limit }: WalletLedgerQuery,
    ): Promise<WalletLedgerResponse> {
        const page = await this.getWalletLedgerUseCase.execute({ walletId, afterVersion: cursor ?? 0, limit })

        return toWalletLedgerResponse(page)
    }

    @Post(':walletId/reconciliation')
    @HttpCode(HttpStatus.OK)
    async reconcile(
        @Param('walletId', new ZodValidationPipe(walletIdSchema)) walletId: string,
    ): Promise<WalletReconciliationResponse> {
        const reconciliation = await this.reconcileWalletUseCase.execute(walletId)

        metrics.reconciliations.inc({ result: reconciliation.consistent ? 'consistent' : 'inconsistent' })
        return toWalletReconciliationResponse(reconciliation)
    }
}
