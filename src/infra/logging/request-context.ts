import { AsyncLocalStorage } from 'node:async_hooks'

export interface RequestContext {
    correlationId: string
    messageId?: string
}

const storage = new AsyncLocalStorage<RequestContext>()

export const runWithContext = <T>(context: RequestContext, work: () => T): T => storage.run(context, work)

export const currentContext = (): RequestContext | undefined => storage.getStore()
