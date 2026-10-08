import {
  LlmProviderFactory,
  LLM_STRUCTURED_MAX_OUTPUT_TOKENS,
  LLM_STRUCTURED_REASONING,
  type LlmToolTurnResult,
  type NormalizedToolDefinition
} from './llm-provider.ts'
import { createTimeoutLinkedSignal } from '../http/abort-signal.ts'
import { resolveLlmRequestTimeoutSeconds } from './llm-timeout.ts'
import { wordGuidanceForDuration } from './duration-guidance.ts'
import { DEFAULT_LLM_PROVIDER, DEFAULT_MODEL_IDS } from '../../../shared/llm-defaults.ts'

export interface ExpandedScriptResult {
  title?: string
  script: string
  visualConcept: string
}

export interface ExpandIdeaParams {
  idea: string
  platform?: 'YouTube' | 'Shorts' | 'TikTok' | 'Instagram Reels'
  style?: string
  targetDuration?: string
  tone?: string
  title?: string
  /** The creator wants no people on screen, so the script should not need any. */
  avoidPeople?: boolean
  timeoutSeconds?: number
  providerId: 'openai' | 'gemini' | 'openrouter'
  modelId: string
  apiKey: string
  abortSignal?: AbortSignal
  sessionId?: string
  /** Gets the tokens the request spent, also when the answer turns out to be unusable. */
  onUsage?: (usage: NonNullable<LlmToolTurnResult['usage']>) => void
}

export const SUBMIT_EXPANDED_SCRIPT_TOOL: NormalizedToolDefinition = {
  name: 'submit_expanded_script',
  description:
    'Submit the expanded narration script, visual strategy, and suggested title created from a short video idea.',
  parameters: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'A catchy, clickable, platform-optimized video title.'
      },
      script: {
        type: 'string',
        description:
          'The complete, full narration script text (voiceover narrative). Write natural spoken sentences ready for scene beat segmentation. Do not include camera directions or timestamps in the spoken text.'
      },
      visualConcept: {
        type: 'string',
        description:
          'A summary of the visual direction, stock b-roll mood, cinematography style, and pacing for this video.'
      }
    },
    required: ['script', 'visualConcept']
  }
}

export function parseExpandedScriptFromToolCall(argumentsJson: string): ExpandedScriptResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(argumentsJson)
  } catch (err) {
    throw new Error(
      `Expanded script tool arguments were not valid JSON: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Expanded script tool response is not an object.')
  }

  const record = parsed as {
    title?: unknown
    script?: unknown
    visualConcept?: unknown
  }

  const script = typeof record.script === 'string' ? record.script.trim() : ''
  const visualConcept = typeof record.visualConcept === 'string' ? record.visualConcept.trim() : ''
  const title = typeof record.title === 'string' ? record.title.trim() : undefined

  if (!script) {
    throw new Error('Expanded script tool response is missing valid "script" text.')
  }

  return {
    title,
    script,
    visualConcept: visualConcept || 'Dynamic stock footage reflecting the narrative pacing.'
  }
}

export function parseFallbackExpandedScript(rawText: string): ExpandedScriptResult {
  const trimmed = rawText.trim()
  if (!trimmed) {
    throw new Error('LLM returned an empty response for idea expansion.')
  }

  // Try to parse raw JSON markdown code blocks if the model responded with JSON text
  const jsonMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (jsonMatch && jsonMatch[1]) {
    try {
      return parseExpandedScriptFromToolCall(jsonMatch[1])
    } catch {
      // Ignore and proceed to text heuristic
    }
  }

  // If text only, use clean script text and default visual concept
  return {
    script: trimmed,
    visualConcept: 'Visually engaging stock b-roll matching the narration points.'
  }
}

export function buildIdeaExpanderSystemPrompt(input: { avoidPeople?: boolean } = {}): string {
  const peopleRule = input.avoidPeople
    ? '\n- The creator wants no people on screen. Write sentences whose images can be places, objects, nature, or hands.'
    : ''
  const scenes = input.avoidPeople
    ? 'places, objects, actions, textures, emotions'
    : 'places, people, objects, actions, textures, emotions'

  return `Write a voiceover script for a short video from the creator's idea, a one-paragraph visual direction for finding stock footage, and a title.

Scriptwriting rules:
- Write natural spoken English meant to be read as a voiceover narration.
- Do not include bracketed video directions or timestamps inside the "script" field (for example, do not write "[Cut to drone shot]" or "0:05"). Put purely the spoken voiceover text in "script" so it can be cleanly broken into visual beats.
- Ensure every sentence naturally evokes concrete visual scenes (${scenes}).${peopleRule}
- End with a satisfying closing thought or clear call-to-action.

Call the submit_expanded_script tool once with the complete output.`
}

export async function expandIdeaToScript(params: ExpandIdeaParams): Promise<ExpandedScriptResult> {
  const providerId = params.providerId || DEFAULT_LLM_PROVIDER
  const modelId = params.modelId || DEFAULT_MODEL_IDS[providerId]
  const timeoutSeconds = resolveLlmRequestTimeoutSeconds(params.timeoutSeconds)
  const apiKey = params.apiKey

  if (!apiKey) {
    throw new Error(
      `Missing API Key for active LLM provider (${providerId.toUpperCase()}). Please configure it in Settings.`
    )
  }

  const provider = LlmProviderFactory.getProvider(providerId)

  const platform = params.platform || 'YouTube'
  const style = params.style || 'cinematic'
  const targetDuration = params.targetDuration || '60s'
  const tone = params.tone || 'engaging & hook-first'

  const wordGuidance = wordGuidanceForDuration(targetDuration)

  const isVertical =
    platform === 'Shorts' || platform === 'TikTok' || platform === 'Instagram Reels'

  const systemPrompt = buildIdeaExpanderSystemPrompt({ avoidPeople: params.avoidPeople })

  const userPrompt = `Format and Pacing Guidelines:
- Platform: ${platform} (${isVertical ? 'Vertical 9:16 format — fast hook in first 3 seconds, high retention flow, vivid visual cues' : 'Horizontal 16:9 format — clear narrative progression, immersive pacing'})
- Visual Mood/Style: ${style}
- Target Duration: ${targetDuration} (${wordGuidance})
- Narrative Tone: ${tone}

Video Idea / Topic:
"${params.idea}"
${params.title ? `Working Title: "${params.title}"` : ''}

Please expand this idea into a full narration script and visual strategy.`

  const { signal, cleanup } = createTimeoutLinkedSignal(timeoutSeconds * 1000, params.abortSignal)

  try {
    const response = await provider.createToolTurn(
      {
        model: modelId,
        systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        tools: [SUBMIT_EXPANDED_SCRIPT_TOOL],
        toolChoice: { name: 'submit_expanded_script' },
        temperature: 0.7,
        maxOutputTokens: LLM_STRUCTURED_MAX_OUTPUT_TOKENS,
        abortSignal: signal,
        sessionId: params.sessionId,
        reasoning: LLM_STRUCTURED_REASONING
      },
      { apiKey }
    )

    if (response.usage) params.onUsage?.(response.usage)

    const toolCall = response.toolCalls.find((tc) => tc.name === 'submit_expanded_script')
    if (toolCall) {
      return parseExpandedScriptFromToolCall(toolCall.arguments)
    }

    if (response.assistantMessage.content) {
      return parseFallbackExpandedScript(response.assistantMessage.content)
    }

    throw new Error('LLM did not return an expanded script.')
  } finally {
    cleanup()
  }
}
