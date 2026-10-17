import { EventContext } from '@domain/events'
import { MoneyProps } from '@domain/money'

export interface OpenWalletInput {
    playerId: string
    initialBalance: MoneyProps
    context: EventContext
}
