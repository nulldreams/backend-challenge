export abstract class TransactionManager {
    abstract run<T>(work: () => Promise<T>): Promise<T>
    abstract runReadOnlySnapshot<T>(work: () => Promise<T>): Promise<T>
}
