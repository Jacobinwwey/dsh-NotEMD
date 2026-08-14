export type LlmErrorCode =
  | 'LLM_CANCELLED'
  | 'LLM_HTTP'
  | 'LLM_STREAM_MALFORMED'
  | 'LLM_TIMEOUT'
  | 'LLM_TRANSPORT'

export class LlmError extends Error {
  constructor(
    readonly code: LlmErrorCode,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message)
    this.name = 'LlmError'
  }
}
