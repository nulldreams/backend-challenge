interface AmountCase {
    description: string
    input: string
    expected: string
}

interface InvalidCase {
    description: string
    input: string
}

interface OperationCase {
    description: string
    left: string
    right: string
    expected: string
}

export const scaleCases: AmountCase[] = [
    { description: 'already with 2 decimals', input: '25.00', expected: '25.00' },
    { description: 'integer', input: '25', expected: '25.00' },
    { description: 'one decimal', input: '25.1', expected: '25.10' },
]

export const invalidAmounts: InvalidCase[] = [
    { description: 'empty string', input: '' },
    { description: 'NaN', input: 'NaN' },
    { description: 'Infinity', input: 'Infinity' },
    { description: 'scientific notation', input: '1e3' },
    { description: 'more than 2 decimals (rejected, not rounded)', input: '25.001' },
    { description: 'negative', input: '-25.00' },
]

export const additions: OperationCase[] = [
    { description: '0.10 + 0.20 without float error', left: '0.10', right: '0.20', expected: '0.30' },
]

export const subtractions: OperationCase[] = [
    { description: '100.00 - 80.00', left: '100.00', right: '80.00', expected: '20.00' },
]
