export class StaleWalletError extends Error {
    constructor(message: string) {
        super(message)
    }
}
