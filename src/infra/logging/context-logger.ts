import { ConsoleLogger } from '@nestjs/common'
import { currentContext } from './request-context'

export class ContextLogger extends ConsoleLogger {
    constructor() {
        super({ json: true, flattenParams: true })
    }

    protected override getJsonLogObject(...args: Parameters<ConsoleLogger['getJsonLogObject']>) {
        return { ...currentContext(), ...super.getJsonLogObject(...args) }
    }
}
