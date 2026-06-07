export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  name?: string
  tool_call_id?: string
  tool_calls?: NormalizedToolCall[]
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

export interface LlmToolTurnInput {
  model: string
  systemPrompt: string
  messages: AgentMessage[]
  tools: NormalizedToolDefinition[]
  toolChoice: 'auto' | 'none' | { name: string }
  temperature: number
  maxOutputTokens: number
  abortSignal?: AbortSignal
}

export interface LlmToolTurnResult {
  assistantMessage: AgentMessage
  toolCalls: NormalizedToolCall[]
  stopReason: 'tool_calls' | 'final' | 'length' | 'error'
  usage?: {
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
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
  content: string
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
      const openAiMsg: OpenAiMessage = { role: 'assistant', content: msg.content || '' }
      if (msg.tool_calls && msg.tool_calls.length > 0) {
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

// 1. OpenAI Implementation
class OpenAiProvider implements LlmProvider {
  public id = 'openai' as const

  public async createToolTurn(
    input: LlmToolTurnInput,
    credentials: ProviderCredentials
  ): Promise<LlmToolTurnResult> {
    const url = 'https://api.openai.com/v1/chat/completions'
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${credentials.apiKey}`
    }

    const payload: Record<string, unknown> = {
      model: input.model,
      messages: toOpenAiMessages(input.messages, input.systemPrompt),
      temperature: input.temperature,
      max_tokens: input.maxOutputTokens
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

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: input.abortSignal
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`OpenAI HTTP Error ${response.status}: ${errText}`)
    }

    const data = (await response.json()) as {
      choices: Array<{
        message: {
          content: string | null
          tool_calls?: Array<{
            id: string
            type: string
            function: {
              name: string
              arguments: string
            }
          }>
        }
        finish_reason: string
      }>
      usage?: {
        prompt_tokens?: number
        completion_tokens?: number
        total_tokens?: number
      }
    }
    const choice = data.choices?.[0]
    if (!choice) {
      throw new Error('OpenAI API returned an empty choices array.')
    }
    const choiceMsg = choice.message

    const toolCalls: NormalizedToolCall[] = []
    if (choiceMsg.tool_calls) {
      for (const tc of choiceMsg.tool_calls) {
        if (tc.type === 'function') {
          toolCalls.push({
            id: tc.id,
            name: tc.function.name,
            arguments: tc.function.arguments
          })
        }
      }
    }

    const assistantMessage: AgentMessage = {
      role: 'assistant',
      content: choiceMsg.content,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined
    }

    let stopReason: LlmToolTurnResult['stopReason'] = 'final'
    if (choice.finish_reason === 'tool_calls') stopReason = 'tool_calls'
    else if (choice.finish_reason === 'length') stopReason = 'length'

    return {
      assistantMessage,
      toolCalls,
      stopReason,
      usage: data.usage
        ? {
            inputTokens: data.usage.prompt_tokens,
            outputTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens
          }
        : undefined,
      raw: data
    }
  }

  public async testConnection(
    credentials: ProviderCredentials,
    modelId: string
  ): Promise<ProviderTestResult> {
    try {
      await this.createToolTurn(
        {
          model: modelId || 'gpt-4o-mini',
          systemPrompt: 'Respond only with pong',
          messages: [{ role: 'user', content: 'ping' }],
          tools: [],
          toolChoice: 'none',
          temperature: 0.1,
          maxOutputTokens: 10
        },
        credentials
      )
      return { success: true, message: 'Connection successful!' }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error)
      }
    }
  }
}

// 2. OpenRouter Implementation
class OpenRouterProvider implements LlmProvider {
  public id = 'openrouter' as const

  public async createToolTurn(
    input: LlmToolTurnInput,
    credentials: ProviderCredentials
  ): Promise<LlmToolTurnResult> {
    const url = 'https://openrouter.ai/api/v1/chat/completions'
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${credentials.apiKey}`,
      'HTTP-Referer': 'https://github.com/eact6/Pexels',
      'X-Title': 'AI Stock Asset Finder'
    }

    const payload: Record<string, unknown> = {
      model: input.model,
      messages: toOpenAiMessages(input.messages, input.systemPrompt),
      temperature: input.temperature,
      max_tokens: input.maxOutputTokens
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

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: input.abortSignal
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`OpenRouter HTTP Error ${response.status}: ${errText}`)
    }

    const data = (await response.json()) as {
      error?: {
        message?: string
      }
      choices: Array<{
        message: {
          content: string | null
          tool_calls?: Array<{
            id: string
            type: string
            function: {
              name: string
              arguments: string
            }
          }>
        }
        finish_reason: string
      }>
      usage?: {
        prompt_tokens?: number
        completion_tokens?: number
        total_tokens?: number
      }
    }

    if (data.error) {
      throw new Error(`OpenRouter API Error: ${data.error.message || JSON.stringify(data.error)}`)
    }

    const choice = data.choices?.[0]
    if (!choice) {
      throw new Error('OpenRouter API returned an empty choices array.')
    }
    const choiceMsg = choice.message

    const toolCalls: NormalizedToolCall[] = []
    if (choiceMsg.tool_calls) {
      for (const tc of choiceMsg.tool_calls) {
        if (tc.type === 'function') {
          toolCalls.push({
            id: tc.id,
            name: tc.function.name,
            arguments: tc.function.arguments
          })
        }
      }
    }

    const assistantMessage: AgentMessage = {
      role: 'assistant',
      content: choiceMsg.content,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined
    }

    let stopReason: LlmToolTurnResult['stopReason'] = 'final'
    if (choice.finish_reason === 'tool_calls') stopReason = 'tool_calls'
    else if (choice.finish_reason === 'length') stopReason = 'length'

    return {
      assistantMessage,
      toolCalls,
      stopReason,
      usage: data.usage
        ? {
            inputTokens: data.usage.prompt_tokens,
            outputTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens
          }
        : undefined,
      raw: data
    }
  }

  public async testConnection(
    credentials: ProviderCredentials,
    modelId: string
  ): Promise<ProviderTestResult> {
    try {
      await this.createToolTurn(
        {
          model: modelId || 'google/gemini-2.5-flash',
          systemPrompt: 'Respond only with pong',
          messages: [{ role: 'user', content: 'ping' }],
          tools: [],
          toolChoice: 'none',
          temperature: 0.1,
          maxOutputTokens: 10
        },
        credentials
      )
      return { success: true, message: 'Connection successful!' }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error)
      }
    }
  }
}

interface GeminiTextPart {
  text: string
}

interface GeminiFunctionCallPart {
  functionCall: {
    name: string
    args: Record<string, unknown>
  }
}

interface GeminiFunctionResponsePart {
  functionResponse: {
    name: string
    response: Record<string, unknown>
  }
}

type GeminiPart = GeminiTextPart | GeminiFunctionCallPart | GeminiFunctionResponsePart

interface GeminiContent {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

// Recursively format schema parameter type strings to uppercase for Gemini API
function normalizeGeminiSchema(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object') {
    return schema
  }
  const result = (Array.isArray(schema) ? [] : {}) as Record<string, unknown>
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'type' && typeof value === 'string') {
      result[key] = value.toUpperCase()
    } else if (typeof value === 'object' && value !== null) {
      result[key] = normalizeGeminiSchema(value)
    } else {
      result[key] = value
    }
  }
  return result
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

        parts.push({
          functionResponse: {
            name: msg.name || 'unknown_tool',
            response: parsedResponse
          }
        })
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

    return contents
  }

  public async createToolTurn(
    input: LlmToolTurnInput,
    credentials: ProviderCredentials
  ): Promise<LlmToolTurnResult> {
    const cleanModel = input.model.startsWith('models/') ? input.model : `models/${input.model}`
    const url = `https://generativelanguage.googleapis.com/v1beta/${cleanModel}:generateContent?key=${credentials.apiKey}`
    const headers = { 'Content-Type': 'application/json' }

    const contents = this.toGeminiContents(input.messages)

    const payload: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: input.temperature,
        maxOutputTokens: input.maxOutputTokens
      }
    }

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

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: input.abortSignal
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Gemini HTTP Error ${response.status}: ${errText}`)
    }

    interface GeminiResponseCandidate {
      content?: {
        parts?: Array<{
          text?: string
          functionCall?: {
            name: string
            args?: Record<string, unknown>
          }
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

    const contentParts = candidate.content?.parts || []

    // Find text content
    const textPart = contentParts.find((p) => 'text' in p && typeof p.text === 'string') as
      | GeminiTextPart
      | undefined
    const contentText = textPart ? textPart.text : null

    // Find function calls
    const functionCalls = contentParts.filter(
      (p) => 'functionCall' in p && p.functionCall
    ) as GeminiFunctionCallPart[]
    const toolCalls: NormalizedToolCall[] = functionCalls.map((fc, index: number) => ({
      id: `gemini_call_${Date.now()}_${index}`,
      name: fc.functionCall.name,
      arguments: JSON.stringify(fc.functionCall.args || {})
    }))

    const assistantMessage: AgentMessage = {
      role: 'assistant',
      content: contentText,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined
    }

    let stopReason: LlmToolTurnResult['stopReason'] = 'final'
    if (toolCalls.length > 0) {
      stopReason = 'tool_calls'
    } else if (candidate.finishReason === 'MAX_TOKENS') {
      stopReason = 'length'
    }

    return {
      assistantMessage,
      toolCalls,
      stopReason,
      usage: data.usageMetadata
        ? {
            inputTokens: data.usageMetadata.promptTokenCount,
            outputTokens: data.usageMetadata.candidatesTokenCount,
            totalTokens: data.usageMetadata.totalTokenCount
          }
        : undefined,
      raw: data
    }
  }

  public async testConnection(
    credentials: ProviderCredentials,
    modelId: string
  ): Promise<ProviderTestResult> {
    try {
      await this.createToolTurn(
        {
          model: modelId || 'gemini-2.5-flash',
          systemPrompt: 'Respond only with pong',
          messages: [{ role: 'user', content: 'ping' }],
          tools: [],
          toolChoice: 'none',
          temperature: 0.1,
          maxOutputTokens: 10
        },
        credentials
      )
      return { success: true, message: 'Connection successful!' }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error)
      }
    }
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
