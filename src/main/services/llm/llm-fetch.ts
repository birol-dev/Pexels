import { ApiCircuitBreaker, fetchWithRetry } from '../http/api-errors'

const llmCircuit = new ApiCircuitBreaker(5, 60_000)

export interface LlmFetchOptions {
  url: string
  init: RequestInit
  label: string
  maxRetries?: number
}

export async function llmFetch(options: LlmFetchOptions): Promise<Response> {
  llmCircuit.ensureClosed(options.label)

  try {
    const response = await fetchWithRetry(options.url, {
      label: options.label,
      maxRetries: options.maxRetries ?? 3,
      init: options.init,
      isAborted: () => Boolean(options.init.signal?.aborted)
    })

    llmCircuit.recordSuccess()
    return response
  } catch (error) {
    llmCircuit.recordFailure()
    throw error
  }
}
