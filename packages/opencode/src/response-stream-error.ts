import { APICallError } from 'ai'

export class ResponseStreamError extends APICallError {
  public override readonly name = 'ProviderResponseStreamError'

  /**
   * `retryable` defaults to true because most stream failures are transient.
   * Pass false for a failure the same request will hit again — resending then
   * only repeats the cost and the wait.
   */
  constructor(
    message: string,
    options?: ErrorOptions & { retryable?: boolean },
  ) {
    super({
      message,
      url: '',
      requestBodyValues: undefined,
      cause: options?.cause,
      isRetryable: options?.retryable ?? true,
    })
  }
}
