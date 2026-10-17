export function captureRejection(promise: Promise<unknown>): Promise<unknown> {
    return promise.then(
        () => undefined,
        (rejection: unknown) => rejection,
    )
}
