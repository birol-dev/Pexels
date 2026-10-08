/**
 * Counts what a job costs at the LLM provider by watching the requests themselves.
 * The runner's own usage total leaves out the idea expansion and cannot count calls,
 * and a rejected or retried request is still a call the provider received.
 */

export interface WireUsage {
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
}

export interface LlmTotals extends WireUsage {
  /** HTTP requests sent to the provider. */
  calls: number
  /** The calls among them that ended in an HTTP error or never got an answer. */
  failedCalls: number
}

export interface LlmMeter {
  totals: LlmTotals
  /** Counts one LLM request. `forward` performs it. */
  fetch(forward: () => Promise<Response>): Promise<Response>
}

const LLM_HOSTS = new Set(['api.openai.com', 'openrouter.ai', 'generativelanguage.googleapis.com'])

export function isLlmRequest(url: URL, method: string): boolean {
  return method === 'POST' && LLM_HOSTS.has(url.hostname)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/**
 * Token counts from a provider's answer, in whichever wire format it has: chat
 * completions (OpenAI, OpenRouter), the OpenAI Responses API, or Gemini. The mapping
 * follows the provider adapters in llm-provider.ts and openai-responses.ts. Returns
 * null when the body reports no usage.
 */
export function readWireUsage(body: unknown): WireUsage | null {
  const root = asRecord(body)
  if (!root) return null

  const gemini = asRecord(root.usageMetadata)
  if (gemini) {
    return {
      inputTokens: count(gemini.promptTokenCount),
      cachedInputTokens: count(gemini.cachedContentTokenCount),
      // Thinking is billed as output, but candidatesTokenCount leaves it out.
      outputTokens: count(gemini.candidatesTokenCount) + count(gemini.thoughtsTokenCount)
    }
  }

  const usage = asRecord(root.usage)
  if (!usage) return null
  if ('prompt_tokens' in usage || 'completion_tokens' in usage) {
    return {
      inputTokens: count(usage.prompt_tokens),
      cachedInputTokens: count(asRecord(usage.prompt_tokens_details)?.cached_tokens),
      outputTokens: count(usage.completion_tokens)
    }
  }
  return {
    inputTokens: count(usage.input_tokens),
    cachedInputTokens: count(asRecord(usage.input_tokens_details)?.cached_tokens),
    outputTokens: count(usage.output_tokens)
  }
}

export function createLlmMeter(): LlmMeter {
  const totals: LlmTotals = {
    calls: 0,
    failedCalls: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0
  }

  return {
    totals,
    async fetch(forward) {
      totals.calls++
      let response: Response
      try {
        response = await forward()
      } catch (error) {
        totals.failedCalls++
        throw error
      }
      if (!response.ok) {
        totals.failedCalls++
        return response
      }
      try {
        // The copy is read here; the caller gets the untouched original.
        const usage = readWireUsage(await response.clone().json())
        if (usage) {
          totals.inputTokens += usage.inputTokens
          totals.cachedInputTokens += usage.cachedInputTokens
          totals.outputTokens += usage.outputTokens
        }
      } catch {
        // A body that is not JSON, or a request aborted mid-answer, reports no usage.
      }
      return response
    }
  }
}
