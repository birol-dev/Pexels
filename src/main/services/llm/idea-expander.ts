import {
  LlmProviderFactory
} from './llm-provider.ts'
import type { NormalizedToolDefinition } from './llm-provider.ts'
import { createTimeoutLinkedSignal } from '../http/abort-signal.ts'

export interface ExpandedScriptResult {
  title?: string
  script: string
  visualConcept: string
  keyThemes?: string[]
}

export interface ExpandIdeaParams {
  idea: string
  platform?: 'YouTube' | 'Shorts' | 'TikTok' | 'Instagram Reels'
  style?: string
  targetDuration?: string
  tone?: string
  title?: string
  timeoutSeconds?: number
  providerId: 'openai' | 'gemini' | 'openrouter'
  modelId: string
  apiKey: string
  abortSignal?: AbortSignal
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
      },
      keyThemes: {
        type: 'array',
        items: { type: 'string' },
        description: '3-5 key visual themes or subjects for stock media search.'
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
    keyThemes?: unknown
  }

  const script = typeof record.script === 'string' ? record.script.trim() : ''
  const visualConcept =
    typeof record.visualConcept === 'string' ? record.visualConcept.trim() : ''
  const title = typeof record.title === 'string' ? record.title.trim() : undefined
  const keyThemes = Array.isArray(record.keyThemes)
    ? record.keyThemes.filter((t): t is string => typeof t === 'string' && !Number.isNaN(t) && !!t.trim())
    : undefined

  if (!script) {
    throw new Error('Expanded script tool response is missing valid "script" text.')
  }

  return {
    title,
    script,
    visualConcept: visualConcept || 'Dynamic stock footage reflecting the narrative pacing.',
    keyThemes
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

export async function expandIdeaToScript(params: ExpandIdeaParams): Promise<ExpandedScriptResult> {
  const providerId = params.providerId || 'openai'
  const modelId = params.modelId || 'gpt-4o'
  const timeoutSeconds = params.timeoutSeconds || 60
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

  // Provide duration word count guidelines
  let wordGuidance = 'approximately 120-160 words (around 60 seconds)'
  if (targetDuration.includes('30') || targetDuration.toLowerCase().includes('short')) {
    wordGuidance = 'approximately 60-85 words (fast-paced 30 seconds)'
  } else if (
    targetDuration.includes('2') ||
    targetDuration.includes('3') ||
    targetDuration.toLowerCase().includes('deep') ||
    targetDuration.toLowerCase().includes('long')
  ) {
    wordGuidance = 'approximately 300-450 words (2-3 minutes)'
  }

  const isVertical = platform === 'Shorts' || platform === 'TikTok' || platform === 'Instagram Reels'

  const systemPrompt = `You are a world-class video producer, viral content scriptwriter, and stock b-roll creative director.
Your mission is to take a creator's short idea, topic, or premise and expand it into:
1. A punchy, highly engaging, voiceover-ready narration script.
2. A clear visual concept strategy optimized for stock footage curation on Pexels.
3. A catchy, high-CTR video title.

Format and Pacing Guidelines:
- Platform: ${platform} (${isVertical ? 'Vertical 9:16 format — fast hook in first 3 seconds, high retention flow, vivid visual cues' : 'Horizontal 16:9 format — clear narrative progression, immersive pacing'})
- Visual Mood/Style: ${style}
- Target Duration: ${targetDuration} (${wordGuidance})
- Narrative Tone: ${tone}

Scriptwriting Rules:
- Write natural spoken English meant to be read as a voiceover narration.
- Do NOT include bracketed video directions or timestamps inside the "script" field (e.g. do NOT write "[Cut to drone shot]" or "0:05"). Put purely the spoken voiceover text in "script" so it can be cleanly broken into visual beats.
- Ensure every sentence naturally evokes concrete visual scenes (places, people, objects, actions, textures, emotions).
- End with a satisfying closing thought or clear call-to-action.

Call the submit_expanded_script tool once with the complete output.`

  const userPrompt = `Video Idea / Topic:
"${params.idea}"
${params.title ? `Working Title: "${params.title}"` : ''}

Please expand this idea into a full narration script and visual strategy.`

  const { signal, cleanup } = createTimeoutLinkedSignal(
    timeoutSeconds * 1000,
    params.abortSignal
  )

  try {
    const response = await provider.createToolTurn(
      {
        model: modelId,
        systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        tools: [SUBMIT_EXPANDED_SCRIPT_TOOL],
        toolChoice: { name: 'submit_expanded_script' },
        temperature: 0.7,
        maxOutputTokens: 3000,
        abortSignal: signal
      },
      { apiKey }
    )

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
