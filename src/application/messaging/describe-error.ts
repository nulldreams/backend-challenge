export interface ErrorDescription {
    name?: string
    code?: unknown
    message: string
}

export const describeError = (error: unknown): ErrorDescription =>
    error instanceof Error
        ? { name: error.name, code: (error as { code?: unknown }).code, message: error.message }
        : { message: String(error) }
