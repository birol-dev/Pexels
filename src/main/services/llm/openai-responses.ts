import type {
  AgentMessage,
  LlmToolTurnInput,
  LlmToolTurnResult,
  NormalizedToolCall
} from './llm-provider.ts'

/**
 * OpenAI Responses API wire format (POST /v1/responses). Some reasoning models only
 * accept function tools here, not on Chat Completions, so the OpenAI adapter switches
 * to it when Chat Completions says so. Requests are stateless (`store: false`): the
 * whole conversation is resent each turn, as with Chat Completions.
 */

/** Structured calls and tool picks need little reasoning; every reasoning model accepts "low". */
const RESPONSES_REASONING_EFFORT = 'low'

interface ResponsesOutputItem {
  type?: string
  id?: string
  call_id?: string
  name?: string
  arguments?: unknown
  content?: Array<{ type?: string; text?: string }>
}

export interface ResponsesApiBody {
  error?: { message?: string } | null
  status?: string
  incomplete_details?: { reason?: string } | null
  output?: ResponsesOutputItem[]
  usage?: {
    input_tokens?: number
    output_tokens?: number
    total_tokens?: number
    output_tokens_details?: { reasoning_tokens?: number }
    input_tokens_details?: { cached_tokens?: number }
  }
}

function toResponsesInput(messages: AgentMessage[], omitImages: boolean): unknown[] {
  const input: unknown[] = []
  for (const msg of messages) {
    if (msg.role === 'user' && msg.images?.length && !omitImages) {
      input.push({
        role: 'user',
        content: [
          { type: 'input_text', text: msg.content || '' },
          ...msg.images.map((image) => ({
            type: 'input_image',
            image_url: image.url,
            detail: 'low'
          }))
        ]
      })
    } else if (msg.role === 'system' || msg.role === 'user') {
      input.push({ role: msg.role, content: msg.content || '' })
    } else if (msg.role === 'tool') {
      input.push({
        type: 'function_call_output',
        call_id: msg.tool_call_id,
        output: msg.content || ''
      })
    } else if (msg.responseItems && msg.responseItems.length > 0) {
      // Reasoning items must go back with the function calls they produced.
      input.push(...msg.responseItems)
    } else {
      // A turn written by another endpoint: rebuild it without reasoning items.
      if (msg.content) input.push({ role: 'assistant', content: msg.content })
      for (const tc of msg.tool_calls || []) {
        input.push({
          type: 'function_call',
          call_id: tc.id,
          name: tc.name,
          arguments: tc.arguments
        })
      }
    }
  }
  return input
}

export function buildResponsesPayload(
  input: LlmToolTurnInput,
  model: string,
  maxOutputTokens: number,
  omitImages = false
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    model,
    input: toResponsesInput(input.messages, omitImages),
    max_output_tokens: maxOutputTokens,
    reasoning: { effort: RESPONSES_REASONING_EFFORT },
    store: false
  }
  if (input.systemPrompt) payload.instructions = input.systemPrompt

  if (input.tools.length > 0) {
    payload.tools = input.tools.map((t) => ({
      type: 'function',
      name: t.name,
      description: t.description,
      parameters: t.parameters,
      // The tool schemas have optional fields, which strict mode does not allow.
      strict: false
    }))
    payload.tool_choice =
      typeof input.toolChoice === 'string'
        ? input.toolChoice
        : { type: 'function', name: input.toolChoice.name }
  }
  // No temperature: reasoning models reject it on this endpoint.
  return payload
}

export function parseResponsesResult(
  data: ResponsesApiBody,
  providerName: string
): LlmToolTurnResult {
  if (data.error) {
    throw new Error(
      `${providerName} API Error: ${data.error.message || JSON.stringify(data.error)}`
    )
  }
  const output = data.output || []
  if (output.length === 0 && data.status !== 'incomplete') {
    throw new Error(`${providerName} API returned an empty output array.`)
  }

  const text = output
    .filter((item) => item.type === 'message')
    .flatMap((item) => item.content || [])
    .filter((part) => part.type === 'output_text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n')

  const toolCalls: NormalizedToolCall[] = output
    .filter((item) => item.type === 'function_call' && item.name)
    .map((item, index) => ({
      id: item.call_id || item.id || `call_${index + 1}`,
      name: item.name as string,
      arguments:
        typeof item.arguments === 'string' ? item.arguments : JSON.stringify(item.arguments ?? {})
    }))

  let stopReason: LlmToolTurnResult['stopReason'] = 'final'
  if (toolCalls.length > 0) stopReason = 'tool_calls'
  else if (data.status === 'incomplete') stopReason = 'length'

  return {
    assistantMessage: {
      role: 'assistant',
      content: text || null,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      responseItems: output.length > 0 ? output : undefined
    },
    toolCalls,
    stopReason,
    usage: data.usage
      ? {
          inputTokens: data.usage.input_tokens,
          outputTokens: data.usage.output_tokens,
          totalTokens: data.usage.total_tokens,
          reasoningTokens: data.usage.output_tokens_details?.reasoning_tokens,
          cachedInputTokens: data.usage.input_tokens_details?.cached_tokens
        }
      : undefined,
    raw: data
  }
}
