import type { NormalizedToolCall } from '../llm/llm-provider.ts'

/**
 * Extracts tool calls from model text outputs when a model does not emit
 * native tool_calls in OpenAI format, but outputs them in text/markdown/XML.
 */
export function extractToolCallsFromText(
  content: string,
  validToolNames: string[]
): NormalizedToolCall[] {
  const toolCalls: NormalizedToolCall[] = []
  if (!content || typeof content !== 'string') return toolCalls

  const validSet = new Set(validToolNames)

  const tryPush = (candidate: unknown): void => {
    if (!candidate || typeof candidate !== 'object') return
    const obj = candidate as Record<string, unknown>
    const name =
      obj.name ||
      obj.tool ||
      obj.tool_name ||
      obj.action ||
      (obj.function && typeof obj.function === 'object'
        ? (obj.function as Record<string, unknown>).name
        : undefined)

    if (typeof name === 'string' && validSet.has(name)) {
      const rawArgs =
        obj.arguments ??
        obj.parameters ??
        obj.args ??
        (obj.function && typeof obj.function === 'object'
          ? (obj.function as Record<string, unknown>).arguments
          : undefined) ??
        {}
      const argsStr = typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs)
      toolCalls.push({
        id: `call_${Date.now()}_${toolCalls.length + 1}`,
        name,
        arguments: argsStr
      })
    }
  }

  // 1. XML / tag-based tool calls: <tool_call>...</tool_call> or <invoke>...</invoke>
  const tagRegex = /<(?:tool_call|invoke)>([\s\S]*?)<\/(?:tool_call|invoke)>/gi
  let tagMatch: RegExpExecArray | null
  while ((tagMatch = tagRegex.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(tagMatch[1].trim())
      const items = Array.isArray(parsed) ? parsed : [parsed]
      for (const item of items) tryPush(item)
    } catch {
      // ignore
    }
  }
  if (toolCalls.length > 0) return toolCalls

  // 2. Markdown code blocks (```json ... ``` or ``` ... ```)
  const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/gi
  let codeMatch: RegExpExecArray | null
  while ((codeMatch = codeBlockRegex.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(codeMatch[1].trim())
      const items = Array.isArray(parsed) ? parsed : [parsed]
      for (const item of items) tryPush(item)
    } catch {
      // ignore
    }
  }
  if (toolCalls.length > 0) return toolCalls

  // 3. Standalone JSON array or object
  try {
    const trimmed = content.trim()
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const parsed = JSON.parse(trimmed)
      tryPush(parsed)
    } else if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        for (const item of parsed) tryPush(item)
      }
    }
  } catch {
    // ignore
  }

  return toolCalls
}
