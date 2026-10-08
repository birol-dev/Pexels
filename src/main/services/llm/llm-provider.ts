export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  name?: string
  tool_call_id?: string
  tool_calls?: NormalizedToolCall[]
  rawParts?: unknown[]
  /** OpenAI Responses API output items for this turn, replayed as-is (they carry reasoning). */
  responseItems?: unknown[]
}

export interface NormalizedToolDefinition {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

export interface NormalizedToolCall {
  id: string
  name: string
  arguments: string // JSON string
}

/**
 * OpenRouter unified reasoning. The Gemini provider reads only `effort` (as a
 * thinking level); the OpenAI provider ignores it.
 */
export interface LlmReasoningConfig {
  effort?: 'low' | 'high' | 'max'
  enabled?: boolean
  exclude?: boolean
  maxTokens?: number
}

/** Structured extract turns (beats / idea expand) need room for the tool JSON. */
export const LLM_STRUCTURED_MAX_OUTPUT_TOKENS = 32768
/**
 * Agent search turns share the 32,768 completion budget OpenRouter documents for
 * reasoning models (`max_tokens` covers thinking + visible tokens). Tool calls stop early.
 */
export const LLM_AGENT_TURN_MAX_OUTPUT_TOKENS = 32768
/**
 * DeepSeek V4.1 Flash defaults to reasoning.effort=high, which spends the whole
 * max_tokens budget thinking (finish_reason=length, empty content, no tool call).
 * Structured one-shot extracts do not need chain-of-thought.
 */
export const LLM_STRUCTURED_REASONING: LlmReasoningConfig = { enabled: false, effort: 'low' }
export const LLM_AGENT_REASONING: LlmReasoningConfig = { effort: 'low' }

export interface LlmToolTurnInput {
  model: string
  systemPrompt: string
  messages: AgentMessage[]
  tools: NormalizedToolDefinition[]
  toolChoice: 'auto' | 'none' | { name: string }
  temperature: number
  maxOutputTokens: number
  abortSignal?: AbortSignal
  /** OpenRouter sticky-routing / prompt-cache key. Ignored by other providers. */
  sessionId?: string
  /** Reasoning control: full on OpenRouter, thinking level on Gemini, ignored by OpenAI. */
  reasoning?: LlmReasoningConfig
}

export interface LlmToolTurnResult {
  assistantMessage: AgentMessage
  toolCalls: NormalizedToolCall[]
  stopReason: 'tool_calls' | 'final' | 'length' | 'error'
  usage?: {
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
    reasoningTokens?: number
    /** The part of inputTokens the provider read from its prompt cache. */
    cachedInputTokens?: number
  }
  raw: unknown
}

export interface ProviderCredentials {
  apiKey: string
}

export interface ProviderTestResult {
  success: boolean
  message: string
}

import { llmFetch } from './llm-fetch.ts'
import { applyOpenRouterPromptCache } from './openrouter-cache.ts'
import {
  buildResponsesPayload,
  parseResponsesResult,
  type ResponsesApiBody
} from './openai-responses.ts'
import { ApiError } from '../http/api-errors.ts'
import { DEFAULT_MODEL_IDS } from '../../../shared/llm-defaults.ts'

/**
 * Request limits learned from a provider's own 400 responses, per endpoint + model.
 * Model ids are free text, so there is no table to look these up in: gpt-4o caps
 * completions at 16,384 while our budget is 32,768, OpenAI reasoning models reject
 * any non-default temperature, and the GPT-6 family sends tool calling to the
 * Responses API. The first rejected turn teaches the limit; later turns start from it.
 */
interface ModelRequestQuirks {
  maxOutputTokens?: number
  omitTemperature?: boolean
  /** Chat Completions refuses function tools for this model; use the Responses API. */
  useResponsesApi?: boolean
  /** Gemini rejected our thinkingConfig for this model; send none. */
  omitThinkingConfig?: boolean
}

/** One correction per kind of quirk a single turn can run into. */
const MAX_QUIRK_CORRECTIONS = 3

/**
 * "Function tools with reasoning_effort are not supported for gpt-6-luna in
 * /v1/chat/completions. To use function tools, use /v1/responses or set
 * reasoning_effort to 'none'."
 */
const TOOLS_NEED_RESPONSES_API = /function tools[\s\S]*\/v1\/responses/i

const modelRequestQuirks = new Map<string, ModelRequestQuirks>()

export function resetModelRequestQuirks(): void {
  modelRequestQuirks.clear()
}

export function learnedQuirksFor(quirkKey: string): Readonly<ModelRequestQuirks> | undefined {
  return modelRequestQuirks.get(quirkKey)
}

/**
 * The output-token cap a provider's error message states, or null when the message
 * only says the value is too large (the caller then halves what it sent).
 */
export function statedTokenCap(message: string): number | null {
  const stated = message.match(/(?:at most|maximum of|up to)\s+(\d[\d,]*)/i)
  if (stated) return Number(stated[1].replace(/,/g, ''))
  // Gemini: "...the supported range is from 1 (inclusive) to 8193 (exclusive)".
  const range = message.match(
    /range is from\s+\d[\d,]*.*?\bto\s+(\d[\d,]*)\s*\((inclusive|exclusive)\)/i
  )
  if (!range) return null
  const bound = Number(range[1].replace(/,/g, ''))
  return range[2].toLowerCase() === 'exclusive' ? bound - 1 : bound
}

/** Returns the adjustment a 400 message asks for, or null when it is unrelated. */
export function learnModelRequestQuirk(
  message: string,
  sentMaxTokens: number,
  known: ModelRequestQuirks = {}
): ModelRequestQuirks | null {
  if (!known.useResponsesApi && TOOLS_NEED_RESPONSES_API.test(message)) {
    return { useResponsesApi: true }
  }

  if (
    !known.omitTemperature &&
    /temperature/i.test(message) &&
    /unsupported|not support|only the default/i.test(message)
  ) {
    return { omitTemperature: true }
  }

  // Covers max_tokens, max_completion_tokens, max_output_tokens and Gemini's maxOutputTokens.
  if (/max_?(?:completion_?|output_?)?tokens|completion tokens|output tokens/i.test(message)) {
    const cap = statedTokenCap(message) ?? Math.floor(sentMaxTokens / 2)
    if (Number.isFinite(cap) && cap >= 1 && cap < sentMaxTokens) {
      return { maxOutputTokens: cap }
    }
  }

  // Gemini: "Thinking level is not supported for this model.", "The thinking budget 1 is invalid...".
  if (!known.omitThinkingConfig && /thinking/i.test(message)) {
    return { omitThinkingConfig: true }
  }

  return null
}

/**
 * Sends a turn with the limits already learned for this endpoint + model. When the
 * provider answers 400 with a limit we can read, the limit is remembered and the
 * turn is resent. At most MAX_QUIRK_CORRECTIONS corrections per turn.
 */
async function sendWithLearnedQuirks(
  quirkKey: string,
  requestedMaxTokens: number,
  send: (limits: {
    maxOutputTokens: number
    omitTemperature: boolean
    useResponsesApi: boolean
    omitThinkingConfig: boolean
  }) => Promise<Response>
): Promise<Response> {
  for (let correction = 0; ; correction++) {
    const quirks = modelRequestQuirks.get(quirkKey)
    const maxOutputTokens = Math.min(requestedMaxTokens, quirks?.maxOutputTokens ?? Infinity)
    try {
      return await send({
        maxOutputTokens,
        omitTemperature: Boolean(quirks?.omitTemperature),
        useResponsesApi: Boolean(quirks?.useResponsesApi),
        omitThinkingConfig: Boolean(quirks?.omitThinkingConfig)
      })
    } catch (error) {
      const learned =
        correction < MAX_QUIRK_CORRECTIONS && error instanceof ApiError && error.statusCode === 400
          ? learnModelRequestQuirk(error.message, maxOutputTokens, quirks)
          : null
      if (!learned) throw error
      modelRequestQuirks.set(quirkKey, { ...quirks, ...learned })
    }
  }
}

export interface LlmProvider {
  id: 'openai' | 'openrouter' | 'gemini'
  createToolTurn(
    input: LlmToolTurnInput,
    credentials: ProviderCredentials
  ): Promise<LlmToolTurnResult>
  testConnection(credentials: ProviderCredentials, modelId: string): Promise<ProviderTestResult>
}

interface OpenAiToolFunction {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, unknown>
      required?: string[]
    }
  }
}

// Helper to convert standard tools to OpenAI tool objects
function toOpenAiTools(tools: NormalizedToolDefinition[]): OpenAiToolFunction[] {
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }
  }))
}

interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  name?: string
  tool_call_id?: string
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: {
      name: string
      arguments: string
    }
  }>
}

// Helper to convert AgentMessage array to OpenAI format
function toOpenAiMessages(messages: AgentMessage[], systemPrompt?: string): OpenAiMessage[] {
  const result: OpenAiMessage[] = []
  if (systemPrompt) {
    result.push({ role: 'system', content: systemPrompt })
  }
  for (const msg of messages) {
    if (msg.role === 'system') {
      result.push({ role: 'system', content: msg.content || '' })
    } else if (msg.role === 'user') {
      result.push({ role: 'user', content: msg.content || '' })
    } else if (msg.role === 'assistant') {
      const hasToolCalls = Boolean(msg.tool_calls && msg.tool_calls.length > 0)
      // OpenAI allows content: null when the assistant message has tool_calls
      const openAiMsg: OpenAiMessage = {
        role: 'assistant',
        content: hasToolCalls ? msg.content : msg.content || ''
      }
      if (hasToolCalls && msg.tool_calls) {
        openAiMsg.tool_calls = msg.tool_calls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.name,
            arguments: tc.arguments
          }
        }))
      }
      result.push(openAiMsg)
    } else if (msg.role === 'tool') {
      result.push({
        role: 'tool',
        tool_call_id: msg.tool_call_id,
        name: msg.name,
        content: msg.content || ''
      })
    }
  }
  return result
}

export function toOpenRouterReasoningPayload(
  reasoning: LlmReasoningConfig
): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (reasoning.effort !== undefined) body.effort = reasoning.effort
  if (reasoning.enabled !== undefined) body.enabled = reasoning.enabled
  if (reasoning.exclude !== undefined) body.exclude = reasoning.exclude
  if (reasoning.maxTokens !== undefined) body.max_tokens = reasoning.maxTokens
  return body
}

export function normalizeChatToolCalls(
  toolCalls:
    | Array<{
        id?: string
        type?: string
        function?: { name?: string; arguments?: unknown }
        name?: string
        arguments?: unknown
      }>
    | undefined
): NormalizedToolCall[] {
  if (!toolCalls || toolCalls.length === 0) return []

  const out: NormalizedToolCall[] = []
  for (const [index, tc] of toolCalls.entries()) {
    if (tc.type && tc.type !== 'function') continue
    const name = tc.function?.name || (typeof tc.name === 'string' ? tc.name : '')
    if (!name) continue
    const rawArgs = tc.function?.arguments ?? tc.arguments ?? {}
    out.push({
      id: tc.id || `call_${index + 1}`,
      name,
      arguments: typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs)
    })
  }
  return out
}

async function createOpenAiCompatibleToolTurn(
  input: LlmToolTurnInput,
  credentials: ProviderCredentials,
  options: {
    providerName: string
    url: string
    defaultModel: string
    label: string
    /** OpenAI prefers max_completion_tokens; OpenRouter keeps max_tokens for broader model compatibility. */
    maxTokensField: 'max_completion_tokens' | 'max_tokens'
    extraHeaders?: Record<string, string>
    rejectErrorField?: boolean
    promptCache?: boolean
    /** Responses API endpoint, for models that only do tool calling there. */
    responsesUrl?: string
  }
): Promise<LlmToolTurnResult> {
  const trimmedKey = credentials.apiKey?.trim() || ''
  if (!trimmedKey) {
    throw new Error(`${options.providerName} API key is missing.`)
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${trimmedKey}`,
    ...options.extraHeaders
  }

  const model = input.model?.trim() || options.defaultModel
  const payload: Record<string, unknown> = {
    model,
    messages: toOpenAiMessages(input.messages, input.systemPrompt)
  }

  if (input.tools.length > 0) {
    payload.tools = toOpenAiTools(input.tools)
    if (input.toolChoice === 'auto') {
      payload.tool_choice = 'auto'
    } else if (input.toolChoice === 'none') {
      payload.tool_choice = 'none'
    } else {
      payload.tool_choice = {
        type: 'function',
        function: { name: input.toolChoice.name }
      }
    }
  }

  if (options.promptCache) {
    applyOpenRouterPromptCache(payload, input.sessionId)
    if (input.reasoning) {
      payload.reasoning = toOpenRouterReasoningPayload(input.reasoning)
    }
  }

  let answeredByResponsesApi = false
  const response = await sendWithLearnedQuirks(
    `${options.url}::${model}`,
    input.maxOutputTokens,
    (limits) => {
      if (limits.useResponsesApi && options.responsesUrl) {
        answeredByResponsesApi = true
        return llmFetch({
          url: options.responsesUrl,
          label: options.label,
          init: {
            method: 'POST',
            headers,
            body: JSON.stringify(buildResponsesPayload(input, model, limits.maxOutputTokens)),
            signal: input.abortSignal
          }
        })
      }
      payload[options.maxTokensField] = limits.maxOutputTokens
      if (limits.omitTemperature) {
        delete payload.temperature
      } else {
        payload.temperature = input.temperature
      }
      return llmFetch({
        url: options.url,
        label: options.label,
        init: {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal: input.abortSignal
        }
      })
    }
  )

  if (answeredByResponsesApi) {
    return parseResponsesResult((await response.json()) as ResponsesApiBody, options.providerName)
  }

  const data = (await response.json()) as {
    error?: { message?: string }
    choices: Array<{
      message: {
        content: string | null
        reasoning?: string | null
        reasoning_content?: string | null
        tool_calls?: Array<{
          id?: string
          type?: string
          function?: { name?: string; arguments?: unknown }
          name?: string
          arguments?: unknown
        }>
      }
      finish_reason: string
    }>
    usage?: {
      prompt_tokens?: number
      completion_tokens?: number
      total_tokens?: number
      reasoning_tokens?: number
      completion_tokens_details?: { reasoning_tokens?: number }
      prompt_tokens_details?: { cached_tokens?: number }
    }
  }

  if (options.rejectErrorField && data.error) {
    throw new Error(
      `${options.providerName} API Error: ${data.error.message || JSON.stringify(data.error)}`
    )
  }

  const choice = data.choices?.[0]
  if (!choice) {
    throw new Error(`${options.providerName} API returned an empty choices array.`)
  }
  const choiceMsg = choice.message
  const toolCalls = normalizeChatToolCalls(choiceMsg.tool_calls)

  const assistantMessage: AgentMessage = {
    role: 'assistant',
    content: choiceMsg.content,
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined
  }

  let stopReason: LlmToolTurnResult['stopReason'] = 'final'
  if (toolCalls.length > 0 || choice.finish_reason === 'tool_calls') stopReason = 'tool_calls'
  else if (choice.finish_reason === 'length') stopReason = 'length'

  const reasoningTokens =
    data.usage?.completion_tokens_details?.reasoning_tokens ?? data.usage?.reasoning_tokens

  return {
    assistantMessage,
    toolCalls,
    stopReason,
    usage: data.usage
      ? {
          inputTokens: data.usage.prompt_tokens,
          outputTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
          reasoningTokens,
          cachedInputTokens: data.usage.prompt_tokens_details?.cached_tokens
        }
      : undefined,
    raw: data
  }
}

const CONNECTION_TEST_TOOL: NormalizedToolDefinition = {
  name: 'report_ready',
  description: 'Confirm that the connection works.',
  parameters: {
    type: 'object',
    properties: { ok: { type: 'boolean' } },
    required: ['ok']
  }
}

/** Says what the test learned about the model, so the user knows what jobs will send. */
function describeConnectionSuccess(quirks: Readonly<ModelRequestQuirks> | undefined): string {
  const notes: string[] = []
  if (quirks?.maxOutputTokens) {
    notes.push(
      `This model allows at most ${quirks.maxOutputTokens.toLocaleString('en-US')} output tokens, so StockFinder will use that.`
    )
  }
  if (quirks?.useResponsesApi) {
    notes.push(
      'This model calls tools through the OpenAI Responses API, so StockFinder will use it.'
    )
  }
  return ['Connection successful!', ...notes].join(' ')
}

/**
 * Sends one forced tool call with the same temperature, output cap and reasoning as a
 * beat split, so a model that cannot do what a job needs fails here, and any request
 * limit is learned before the first job.
 */
async function testConnectionWithPing(
  provider: LlmProvider,
  credentials: ProviderCredentials,
  modelId: string,
  options: {
    providerName: string
    defaultModel: string
    /** The key createToolTurn stores this model's learned quirks under. */
    quirkKey: (model: string) => string
  }
): Promise<ProviderTestResult> {
  const trimmedKey = credentials.apiKey?.trim() || ''
  if (!trimmedKey) {
    return {
      success: false,
      message: `${options.providerName} API key is missing. Please enter an API key.`
    }
  }
  const model = modelId?.trim() || options.defaultModel
  try {
    const turn = await provider.createToolTurn(
      {
        model,
        systemPrompt: 'Call report_ready with ok set to true.',
        messages: [{ role: 'user', content: 'Connection test.' }],
        tools: [CONNECTION_TEST_TOOL],
        toolChoice: { name: CONNECTION_TEST_TOOL.name },
        temperature: 0.2,
        maxOutputTokens: LLM_STRUCTURED_MAX_OUTPUT_TOKENS,
        reasoning: LLM_STRUCTURED_REASONING
      },
      { apiKey: trimmedKey }
    )
    if (!turn.toolCalls.some((call) => call.name === CONNECTION_TEST_TOOL.name)) {
      return {
        success: false,
        message: `${model} answered but did not call a tool. StockFinder needs a model with tool (function) calling.`
      }
    }
    return {
      success: true,
      message: describeConnectionSuccess(learnedQuirksFor(options.quirkKey(model)))
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error)
    }
  }
}

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions'
const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions'

class OpenAiProvider implements LlmProvider {
  public id = 'openai' as const

  public createToolTurn(
    input: LlmToolTurnInput,
    credentials: ProviderCredentials
  ): Promise<LlmToolTurnResult> {
    return createOpenAiCompatibleToolTurn(input, credentials, {
      providerName: 'OpenAI',
      url: OPENAI_CHAT_URL,
      defaultModel: DEFAULT_MODEL_IDS.openai,
      label: 'OpenAI chat completions',
      maxTokensField: 'max_completion_tokens',
      responsesUrl: 'https://api.openai.com/v1/responses'
    })
  }

  public testConnection(
    credentials: ProviderCredentials,
    modelId: string
  ): Promise<ProviderTestResult> {
    return testConnectionWithPing(this, credentials, modelId, {
      providerName: 'OpenAI',
      defaultModel: DEFAULT_MODEL_IDS.openai,
      quirkKey: (model) => `${OPENAI_CHAT_URL}::${model}`
    })
  }
}

class OpenRouterProvider implements LlmProvider {
  public id = 'openrouter' as const

  public createToolTurn(
    input: LlmToolTurnInput,
    credentials: ProviderCredentials
  ): Promise<LlmToolTurnResult> {
    return createOpenAiCompatibleToolTurn(input, credentials, {
      providerName: 'OpenRouter',
      url: OPENROUTER_CHAT_URL,
      defaultModel: DEFAULT_MODEL_IDS.openrouter,
      label: 'OpenRouter chat completions',
      maxTokensField: 'max_tokens',
      extraHeaders: {
        'HTTP-Referer': 'https://github.com/birol-dev/Pexels',
        'X-Title': 'AI Stock Asset Finder'
      },
      rejectErrorField: true,
      promptCache: true
    })
  }

  public testConnection(
    credentials: ProviderCredentials,
    modelId: string
  ): Promise<ProviderTestResult> {
    return testConnectionWithPing(this, credentials, modelId, {
      providerName: 'OpenRouter',
      defaultModel: DEFAULT_MODEL_IDS.openrouter,
      quirkKey: (model) => `${OPENROUTER_CHAT_URL}::${model}`
    })
  }
}

interface GeminiTextPart {
  text: string
}

interface GeminiFunctionCallPart {
  functionCall: {
    name: string
    args: Record<string, unknown>
    id?: string
  }
}

interface GeminiFunctionResponsePart {
  functionResponse: {
    name: string
    response: Record<string, unknown>
    id?: string
  }
}

type GeminiPart = GeminiTextPart | GeminiFunctionCallPart | GeminiFunctionResponsePart

interface GeminiContent {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

// Recursively format schema parameter type strings to uppercase for Gemini API
// and strip unsupported properties like additionalProperties.
function normalizeGeminiSchema(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object') {
    return schema
  }
  const result = (Array.isArray(schema) ? [] : {}) as Record<string, unknown>
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'additionalProperties' || key === '$schema') {
      continue // Unsupported by Gemini FunctionDeclaration schema
    } else if (key === 'type' && typeof value === 'string') {
      result[key] = value.toUpperCase()
    } else if (typeof value === 'object' && value !== null) {
      result[key] = normalizeGeminiSchema(value)
    } else {
      result[key] = value
    }
  }
  return result
}

function geminiGenerateContentUrl(model: string): string {
  const rawModel = (model || DEFAULT_MODEL_IDS.gemini).trim()
  const cleanModel = rawModel.startsWith('models/') ? rawModel : `models/${rawModel}`
  return `https://generativelanguage.googleapis.com/v1beta/${cleanModel}:generateContent`
}

// 3. Gemini Implementation
class GeminiProvider implements LlmProvider {
  public id = 'gemini' as const

  private toGeminiContents(messages: AgentMessage[]): GeminiContent[] {
    const contents: GeminiContent[] = []

    for (const msg of messages) {
      if (msg.role === 'system') {
        continue // handled separately in systemInstruction
      }

      const role = msg.role === 'assistant' ? 'model' : 'user'
      const parts: GeminiPart[] = []

      if (msg.role === 'user') {
        parts.push({ text: msg.content || '' })
      } else if (msg.role === 'assistant') {
        if (msg.rawParts && Array.isArray(msg.rawParts) && msg.rawParts.length > 0) {
          parts.push(...(msg.rawParts as GeminiPart[]))
        } else {
          if (msg.content) {
            parts.push({ text: msg.content })
          }
          if (msg.tool_calls && msg.tool_calls.length > 0) {
            for (const tc of msg.tool_calls) {
              let parsedArgs: Record<string, unknown> = {}
              try {
                parsedArgs = JSON.parse(tc.arguments) as Record<string, unknown>
              } catch {
                console.warn(`Failed to parse tool call arguments: ${tc.arguments}`)
              }
              parts.push({
                functionCall: {
                  name: tc.name,
                  args: parsedArgs
                }
              })
            }
          }
        }
      } else if (msg.role === 'tool') {
        let parsedResponse: Record<string, unknown> = {}
        try {
          const parsed = msg.content ? JSON.parse(msg.content) : {}
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            parsedResponse = parsed as Record<string, unknown>
          } else {
            parsedResponse = { result: parsed }
          }
        } catch {
          parsedResponse = { response: msg.content || '' }
        }

        const functionResponse: GeminiFunctionResponsePart['functionResponse'] = {
          name: msg.name || 'unknown_tool',
          response: parsedResponse
        }
        if (msg.tool_call_id) {
          functionResponse.id = msg.tool_call_id
        }
        parts.push({ functionResponse })
      }

      if (parts.length === 0) continue

      const lastContent = contents[contents.length - 1]
      if (lastContent && lastContent.role === role) {
        lastContent.parts.push(...parts)
      } else {
        contents.push({
          role,
          parts
        })
      }
    }

    if (contents.length === 0) {
      contents.push({ role: 'user', parts: [{ text: 'Hello' }] })
    }

    return contents
  }

  public async createToolTurn(
    input: LlmToolTurnInput,
    credentials: ProviderCredentials
  ): Promise<LlmToolTurnResult> {
    const trimmedKey = credentials.apiKey?.trim() || ''
    if (!trimmedKey) {
      throw new Error('Gemini API key is missing.')
    }
    const url = geminiGenerateContentUrl(input.model)
    const headers = {
      'Content-Type': 'application/json',
      'x-goog-api-key': trimmedKey
    }

    const contents = this.toGeminiContents(input.messages)

    // generationConfig is filled in per attempt by sendWithLearnedQuirks below.
    const payload: Record<string, unknown> = { contents }

    if (input.systemPrompt) {
      payload.systemInstruction = {
        parts: [{ text: input.systemPrompt }]
      }
    }

    if (input.tools.length > 0) {
      const functionDeclarations = input.tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: normalizeGeminiSchema(t.parameters)
      }))

      payload.tools = [{ functionDeclarations }]

      if (input.toolChoice !== 'auto' && input.toolChoice !== 'none') {
        payload.toolConfig = {
          functionCallingConfig: {
            mode: 'ANY',
            allowedFunctionNames: [input.toolChoice.name]
          }
        }
      } else if (input.toolChoice === 'none') {
        payload.toolConfig = {
          functionCallingConfig: {
            mode: 'NONE'
          }
        }
      }
    }

    const response = await sendWithLearnedQuirks(url, input.maxOutputTokens, (limits) => {
      // No temperature: Google recommends the default (1.0) for Gemini 3 models and
      // warns that lower values can cause looping.
      // Thinking counts toward maxOutputTokens, so a low-effort call asks for the
      // lowest level every current model accepts ("minimal" is rejected by some).
      payload.generationConfig = {
        maxOutputTokens: limits.maxOutputTokens,
        ...(input.reasoning?.effort === 'low' && !limits.omitThinkingConfig
          ? { thinkingConfig: { thinkingLevel: 'low' } }
          : {})
      }
      return llmFetch({
        url,
        label: 'Gemini generateContent',
        init: {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal: input.abortSignal
        }
      })
    })

    interface GeminiResponseCandidate {
      content?: {
        parts?: Array<{
          text?: string
          functionCall?: {
            name: string
            args?: Record<string, unknown>
            id?: string
          }
          thought?: boolean
        }>
      }
      finishReason?: string
    }
    const data = (await response.json()) as {
      error?: {
        message?: string
        status?: string
      }
      candidates?: GeminiResponseCandidate[]
      usageMetadata?: {
        promptTokenCount?: number
        candidatesTokenCount?: number
        totalTokenCount?: number
        thoughtsTokenCount?: number
        cachedContentTokenCount?: number
      }
    }
    if (data.error) {
      throw new Error(`Gemini API Error: ${data.error.message || JSON.stringify(data.error)}`)
    }
    const candidate = data.candidates?.[0]
    if (!candidate) {
      throw new Error(
        'Gemini API returned no candidates. Safety block or content validation failure.'
      )
    }

    if (candidate.finishReason === 'SAFETY') {
      throw new Error('Gemini API response blocked due to safety settings.')
    }

    const contentParts = candidate.content?.parts || []

    // Aggregate display text — skip thought summaries (thought: true)
    const textParts = contentParts.filter(
      (p): p is GeminiTextPart =>
        'text' in p &&
        typeof (p as { text?: unknown }).text === 'string' &&
        !(p as { thought?: boolean }).thought
    )
    const contentText = textParts.length > 0 ? textParts.map((p) => p.text).join('\n') : null

    // Find function calls — prefer API-provided functionCall.id when present
    const functionCalls = contentParts.filter(
      (p) => 'functionCall' in p && p.functionCall
    ) as Array<{
      functionCall: { name: string; args?: Record<string, unknown>; id?: string }
    }>
    const toolCalls: NormalizedToolCall[] = functionCalls.map((fc, index: number) => ({
      id: fc.functionCall.id || `gemini_call_${Date.now()}_${index}`,
      name: fc.functionCall.name,
      arguments: JSON.stringify(fc.functionCall.args || {})
    }))

    const assistantMessage: AgentMessage = {
      role: 'assistant',
      content: contentText,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      rawParts: contentParts.length > 0 ? contentParts : undefined
    }

    let stopReason: LlmToolTurnResult['stopReason'] = 'final'
    if (toolCalls.length > 0) {
      stopReason = 'tool_calls'
    } else if (candidate.finishReason === 'MAX_TOKENS') {
      stopReason = 'length'
    }

    const usage = data.usageMetadata
    return {
      assistantMessage,
      toolCalls,
      stopReason,
      usage: usage
        ? {
            inputTokens: usage.promptTokenCount,
            // Thinking is billed as output, but candidatesTokenCount leaves it out.
            outputTokens:
              usage.candidatesTokenCount === undefined && usage.thoughtsTokenCount === undefined
                ? undefined
                : (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
            totalTokens: usage.totalTokenCount,
            reasoningTokens: usage.thoughtsTokenCount,
            cachedInputTokens: usage.cachedContentTokenCount
          }
        : undefined,
      raw: data
    }
  }

  public testConnection(
    credentials: ProviderCredentials,
    modelId: string
  ): Promise<ProviderTestResult> {
    return testConnectionWithPing(this, credentials, modelId, {
      providerName: 'Gemini',
      defaultModel: DEFAULT_MODEL_IDS.gemini,
      quirkKey: geminiGenerateContentUrl
    })
  }
}

// 4. Adapter registry factory
const providers: Record<string, LlmProvider> = {
  openai: new OpenAiProvider(),
  openrouter: new OpenRouterProvider(),
  gemini: new GeminiProvider()
}

export class LlmProviderFactory {
  public static getProvider(id: 'openai' | 'openrouter' | 'gemini'): LlmProvider {
    const provider = providers[id]
    if (!provider) {
      throw new Error(`Unknown LLM provider ID: ${id}`)
    }
    return provider
  }
}
