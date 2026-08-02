import { ApiCircuitBreaker, ApiError, fetchWithRetry } from '../http/api-errors'

const llmCircuits = new Map<string, ApiCircuitBreaker>()

function getCircuit(label: string): ApiCircuitBreaker {
  // One breaker per provider/host label so a bad OpenAI key cannot trip Gemini.
  const key = label.split(':')[0] || label
  let circuit = llmCircuits.get(key)
  if (!circuit) {
    circuit = new ApiCircuitBreaker(5, 60_000)
    llmCircuits.set(key, circuit)
  }
  return circuit
}

export interface LlmFetchOptions {
  url: string
  init: RequestInit
  label: string
  maxRetries?: number
}

export async function llmFetch(options: LlmFetchOptions): Promise<Response> {
  const circuit = getCircuit(options.label)
  circuit.ensureClosed(options.label)

  try {
    const response = await fetchWithRetry(options.url, {
      label: options.label,
      maxRetries: options.maxRetries ?? 3,
      init: options.init,
      isAborted: () => Boolean(options.init.signal?.aborted)
    })

    circuit.recordSuccess()
    return response
  } catch (error) {
    // Permanent failures (auth, bad request) should not open the breaker.
    const isTransient = !(error instanceof ApiError) || error.kind === 'transient'
    if (isTransient) {
      circuit.recordFailure()
    }
    throw error
  }
}
