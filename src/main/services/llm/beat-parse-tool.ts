import { visualStyleLine } from '../agent/style-guidance.ts'
import type { NormalizedToolDefinition } from './llm-provider.ts'

export interface ParsedScriptBeat {
  text: string
  visualPrompt: string
}

export const SUBMIT_SCRIPT_BEATS_TOOL: NormalizedToolDefinition = {
  name: 'submit_script_beats',
  description:
    'Submit the script broken into visual beats. Each beat must preserve the exact script wording and include a concrete stock-media search prompt.',
  parameters: {
    type: 'object',
    properties: {
      beats: {
        type: 'array',
        description: 'Ordered list of visual beats covering the full script.',
        items: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'Exact script text for this beat. Do not paraphrase or omit words.'
            },
            visualPrompt: {
              type: 'string',
              description:
                'Concrete Pexels-friendly visual description for stock photo/video search.'
            }
          },
          required: ['text', 'visualPrompt']
        }
      }
    },
    required: ['beats']
  }
}

export function parseBeatsFromToolCall(argumentsJson: string): ParsedScriptBeat[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(argumentsJson)
  } catch (err) {
    throw new Error(
      `Beat tool arguments were not valid JSON: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  if (!parsed || typeof parsed !== 'object' || !('beats' in parsed)) {
    throw new Error('Beat tool response missing "beats" array.')
  }

  const beats = (parsed as { beats: unknown }).beats
  if (!Array.isArray(beats) || beats.length === 0) {
    throw new Error('Beat tool returned an empty beats array.')
  }

  return beats.map((beat, index) => {
    if (!beat || typeof beat !== 'object') {
      throw new Error(`Beat at index ${index} is not an object.`)
    }

    const record = beat as { text?: unknown; visualPrompt?: unknown }
    const text = typeof record.text === 'string' ? record.text.trim() : ''
    const visualPrompt = typeof record.visualPrompt === 'string' ? record.visualPrompt.trim() : ''

    if (!text || !visualPrompt) {
      throw new Error(`Beat at index ${index} is missing text or visualPrompt.`)
    }

    return { text, visualPrompt }
  })
}

export type BeatSplitPromptInput = {
  /** Total download cap for the job; every beat needs at least one asset. */
  maxTotalDownloads: number
  avoidPeople: boolean
  style: string
  /** The one-paragraph visual direction the idea step wrote, when there is one. */
  visualConcept?: string
}

export function buildBeatSplitSystemPrompt(input: BeatSplitPromptInput): string {
  const peopleRule = input.avoidPeople
    ? '\n6. The user wants no people in the footage: describe objects, places, nature, hands, or silhouettes instead of faces, crowds, or close-ups of individuals.'
    : ''

  const visualConcept = input.visualConcept?.trim()
  const conceptLine = visualConcept ? `\nVisual direction for this video: ${visualConcept}` : ''

  return `You are a professional video editor and script analyzer.
Break the provided script into visual beats (scenes or moments of visual focus).

Rules:
1. Cover the whole script, in order. Copy each beat's text exactly from the script: do not omit, reorder, summarize, or reword anything. Joined together, the beats' text must reproduce the full script.
2. Size beats by visual change: roughly one beat per sentence, or per 3-6 seconds of narration (about 8-15 spoken words). Merge short sentences that share one image.
3. Use at most ${input.maxTotalDownloads} beats. The job can download only ${input.maxTotalDownloads} assets in total and every beat needs at least one, so for a long script make beats longer instead of adding more.
4. Write each visualPrompt as a concrete, filmable stock-search description in English: a visible subject plus an action or setting, 3-8 words (for example "empty trading floor at dusk"). For abstract narration such as "freedom" or "growth", pick a literal image a stock library would have, such as an open road or a seedling in sunlight.
5. Never put brand names, logos, or named people in a visualPrompt.${peopleRule}

Visual style: ${visualStyleLine(input.style)}${conceptLine}
Write visual prompts that fit this look.

Call the submit_script_beats tool once with the complete ordered beats array.`
}

function scriptWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
}

/**
 * Check that the beats, joined in order, reproduce the script (ignoring case, punctuation and
 * whitespace). Returns null when they do, or a description of the first difference that is
 * written to be fed back to the model.
 */
export function findScriptMismatch(script: string, beats: ParsedScriptBeat[]): string | null {
  const expected = scriptWords(script)
  const actual = scriptWords(beats.map((beat) => beat.text).join(' '))

  const limit = Math.min(expected.length, actual.length)
  let index = 0
  while (index < limit && expected[index] === actual[index]) index++

  if (index === expected.length && index === actual.length) return null

  const around = (words: string[]): string =>
    words.slice(Math.max(0, index - 3), index + 4).join(' ')
  return `The beats do not reproduce the script. The script has ${expected.length} words and the beats have ${actual.length}. They first differ at word ${index + 1}: the script reads "${around(expected)}" but the beats read "${around(actual)}".`
}

export function buildBeatCorrectionMessage(mismatch: string): string {
  return `${mismatch} Call submit_script_beats again. Copy the script verbatim into the beats' text fields, in order, without dropping or rewording anything.`
}

export function missingBeatToolCallError(input: {
  stopReason: 'tool_calls' | 'final' | 'length' | 'error'
  usage?: { outputTokens?: number; reasoningTokens?: number }
}): Error {
  if (input.stopReason === 'length') {
    const reasoning = input.usage?.reasoningTokens
    const output = input.usage?.outputTokens
    if (
      typeof reasoning === 'number' &&
      typeof output === 'number' &&
      output > 0 &&
      reasoning >= output - 8
    ) {
      return new Error(
        'Script parsing failed: the model used its entire output token budget on reasoning and never returned beats.'
      )
    }
    return new Error(
      'Script parsing failed: the model hit the output token limit before returning beats.'
    )
  }

  return new Error('Script parsing failed: model did not return structured beats.')
}
