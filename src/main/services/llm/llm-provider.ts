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
    properties: Record<string, any>
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

// Helper to convert standard tools to OpenAI tool objects
function toOpenAiTools(tools: NormalizedToolDefinition[]) {
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }
  }))
}

// Helper to convert AgentMessage array to OpenAI format
function toOpenAiMessages(messages: AgentMessage[], systemPrompt?: string) {
  const result: any[] = []
  if (systemPrompt) {
    result.push({ role: 'system', content: systemPrompt })
  }
  for (const msg of messages) {
    if (msg.role === 'system') {
      result.push({ role: 'system', content: msg.content })
    } else if (msg.role === 'user') {
      result.push({ role: 'user', content: msg.content })
    } else if (msg.role === 'assistant') {
      const openAiMsg: any = { role: 'assistant', content: msg.content }
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

    const payload: any = {
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

    const data = await response.json()
    const choice = data.choices[0]
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
      'HTTP-Referer': 'https://github.com/google-demind/antigravity',
      'X-Title': 'AI Stock Asset Finder'
    }

    const payload: any = {
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

    const data = await response.json()
    if (data.error) {
      throw new Error(`OpenRouter API Error: ${data.error.message || JSON.stringify(data.error)}`)
    }

    const choice = data.choices[0]
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

// 3. Gemini Implementation
class GeminiProvider implements LlmProvider {
  public id = 'gemini' as const

  private toGeminiContents(messages: AgentMessage[]) {
    const contents: any[] = []

    for (const msg of messages) {
      if (msg.role === 'system') {
        continue // handled separately in systemInstruction
      }

      if (msg.role === 'user') {
        contents.push({
          role: 'user',
          parts: [{ text: msg.content || '' }]
        })
      } else if (msg.role === 'assistant') {
        const parts: any[] = []
        if (msg.content) {
          parts.push({ text: msg.content })
        }
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          for (const tc of msg.tool_calls) {
            parts.push({
              functionCall: {
                name: tc.name,
                args: JSON.parse(tc.arguments)
              }
            })
          }
        }
        contents.push({
          role: 'model',
          parts
        })
      } else if (msg.role === 'tool') {
        let parsedResponse = {}
        try {
          parsedResponse = msg.content ? JSON.parse(msg.content) : {}
        } catch {
          parsedResponse = { response: msg.content }
        }

        contents.push({
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: msg.name || 'unknown_tool',
                response: parsedResponse
              }
            }
          ]
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

    const payload: any = {
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
        parameters: {
          type: 'OBJECT',
          properties: Object.entries(t.parameters.properties).reduce(
            (acc, [k, v]) => {
              // Gemini schema parameters properties require CAPITAL uppercase type names (e.g. 'STRING', 'NUMBER', 'OBJECT')
              const geminiProperty = { ...v }
              if (geminiProperty.type) {
                geminiProperty.type = geminiProperty.type.toUpperCase()
              }
              acc[k] = geminiProperty
              return acc
            },
            {} as Record<string, any>
          ),
          required: t.parameters.required
        }
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

    const data = await response.json()
    const candidate = data.candidates?.[0]
    if (!candidate) {
      throw new Error('Gemini API returned no candidates. Safety block or error.')
    }

    const contentParts = candidate.content?.parts || []

    // Find text content
    const textPart = contentParts.find((p: any) => p.text)
    const contentText = textPart ? textPart.text : null

    // Find function calls
    const functionCalls = contentParts.filter((p: any) => p.functionCall)
    const toolCalls: NormalizedToolCall[] = functionCalls.map((fc: any, index: number) => ({
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
