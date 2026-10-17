import { DomainError } from '@domain/errors'
import { describe, expect, test } from 'bun:test'
import { domainErrors, programmingErrors } from './domain-errors.data-provider'

describe('domain errors', () => {
    test.each(domainErrors)('$description carries a stable failure code', (errorCase) => {
        const error = errorCase.build()

        expect(error).toBeInstanceOf(DomainError)
        expect(error.name).toBe(errorCase.expectedName)
        expect(error.code).toBe(errorCase.expectedCode)
        expect(error.message).toBe(errorCase.expectedMessage)
    })

    test.each(programmingErrors)('$description is a programming error, not a domain error', (errorCase) => {
        const error = errorCase.build()

        expect(error).toBeInstanceOf(errorCase.errorClass)
        expect(error).not.toBeInstanceOf(DomainError)
    })
})
