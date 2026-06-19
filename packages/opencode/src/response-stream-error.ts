import { APICallError } from 'ai'

/**
 * Retryable stream-level provider failure.
 *
 * OpenCode's retry loop recognizes AI SDK APICallError instances and converts
 * retryable ones into SessionRetry attempts. A plain plugin-local Error with
 * the same name as OpenCode's internal ProviderResponseStreamError does not
 * pass that instanceof/marker check across package boundaries, so websocket
 * transport failures must surface as APICallError.
 */
export class ResponseStreamError extends APICallError {
  public override readonly name = 'ProviderResponseStreamError'

  constructor(message: string, options?: ErrorOptions) {
    super({
      message,
      url: '',
      requestBodyValues: undefined,
      cause: options?.cause,
      isRetryable: true,
    })
  }
}
