import { visualStyleLine } from '../agent/style-guidance.ts'
import type { NormalizedToolDefinition } from './llm-provider.ts'

export type BeatAssetType = 'video' | 'photo' | 'either'

export interface PlannedBeat {
  text: string
  visualPrompt: string
  queries: string[]
  assetType: BeatAssetType
}

/** One beat as the model plans it: where it ends, and what footage it needs. */
export type BeatPlanItem = Omit<PlannedBeat, 'text'> & { lastSentence: number }

export const SUBMIT_BEAT_PLAN_TOOL: NormalizedToolDefinition = {
  name: 'submit_beat_plan',
  description:
    'Group the numbered script sentences into visual beats and plan footage for each beat.',
  parameters: {
    type: 'object',
    properties: {
      beats: {
        type: 'array',
        description: 'Beats in script order. Each beat starts right after the previous one ends.',
        items: {
          type: 'object',
          properties: {
            lastSentence: {
              type: 'integer',
              description: 'Number of the last sentence in this beat.'
            },
            visualPrompt: {
              type: 'string',
              description: 'What the footage shows, 3 to 8 words.'
            },
            queries: {
              type: 'array',
              items: { type: 'string' },
              description: '2 or 3 Pexels queries of 1 to 4 words, most specific first.'
            },
            assetType: {
              type: 'string',
              enum: ['video', 'photo', 'either'],
              description: 'video for motion, photo for objects, textures, or establishing shots.'
            }
          },
          required: ['lastSentence', 'visualPrompt', 'queries', 'assetType']
        }
      }
    },
    required: ['beats']
  }
}

/** Sentences of the script, in order. Very long sentences are cut into chunks so a beat stays short. */
export function splitScriptSentences(script: string, maxWords = 40, chunkWords = 15): string[] {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'sentence' })
  const sentences = [...segmenter.segment(script)]
    .map((s) => s.segment.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  return sentences.flatMap((sentence) => {
    const words = sentence.split(' ')
    if (words.length <= maxWords) return [sentence]
    const chunks: string[] = []
    for (let i = 0; i < words.length; i += chunkWords)
      chunks.push(words.slice(i, i + chunkWords).join(' '))
    return chunks
  })
}

/** The user message of the beat split: one numbered sentence per line. */
export function buildBeatSplitUserMessage(sentences: string[]): string {
  return sentences.map((sentence, index) => `[${index + 1}] ${sentence}`).join('\n')
}

/**
 * Reads the plan the model submitted. Only a missing or empty list is an error: anything wrong
 * inside an item (a bad number, a missing query list, an unknown asset type) is repaired by
 * `beatsFromPlan` or given a default here, because the script text no longer depends on it.
 */
export function parseBeatPlanFromToolCall(argumentsJson: string): BeatPlanItem[] {
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

    const record = beat as {
      lastSentence?: unknown
      visualPrompt?: unknown
      queries?: unknown
      assetType?: unknown
    }
    return {
      lastSentence: Number(record.lastSentence),
      visualPrompt: typeof record.visualPrompt === 'string' ? record.visualPrompt : '',
      queries: Array.isArray(record.queries)
        ? record.queries.filter((query): query is string => typeof query === 'string')
        : [],
      assetType:
        record.assetType === 'video' || record.assetType === 'photo' ? record.assetType : 'either'
    }
  })
}

/**
 * Turns the model's beat ends into beats that cover every sentence once, in order.
 * Out-of-range or non-increasing ends are clamped. Sentences after the last beat join it.
 */
export function beatsFromPlan(
  sentences: string[],
  plan: BeatPlanItem[]
): { beats: PlannedBeat[]; repaired: boolean } {
  const beats: PlannedBeat[] = []
  let start = 0
  let repaired = false
  for (const item of plan) {
    if (start >= sentences.length) {
      repaired = true
      break
    }
    const requested = Number.isFinite(item.lastSentence) ? Math.trunc(item.lastSentence) : 0
    const end = Math.min(Math.max(requested, start + 1), sentences.length)
    if (end !== item.lastSentence) repaired = true
    const text = sentences.slice(start, end).join(' ')
    const queries = item.queries
      .map((q) => q.trim())
      .filter(Boolean)
      .slice(0, 3)
    beats.push({
      text,
      // A beat the model gave no picture for is searched by its first query, or by its own words.
      visualPrompt: item.visualPrompt.trim() || queries[0] || text,
      queries,
      assetType: item.assetType
    })
    start = end
  }
  if (start < sentences.length && beats.length > 0) {
    beats[beats.length - 1].text += ' ' + sentences.slice(start).join(' ')
    repaired = true
  }
  return { beats, repaired }
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
  const peopleLine = input.avoidPeople
    ? '\nThe user wants no people in the footage: describe objects, places, nature, hands, or silhouettes instead of faces, crowds, or close-ups of individuals.'
    : ''
  const visualConcept = input.visualConcept?.trim()
  const conceptLine = visualConcept ? `\nVisual direction for this video: ${visualConcept}` : ''

  return `Plan the stock footage for a narrated video. The user message lists the script's sentences, one per line, each with its number.

Rules:
1. Group consecutive sentences into beats. A beat changes when the picture should change: about 8 to 15 spoken words, or 3 to 6 seconds. The last beat ends at the last sentence.
2. Use at most ${input.maxTotalDownloads} beats.
3. For each beat, write a visual prompt, 2 or 3 Pexels queries (1 to 4 words, English, filmable, no brands or named people), and whether it needs video, a photo, or either. For abstract narration such as "freedom" or "growth", pick a literal image a stock library would have, such as an open road or a seedling in sunlight.

Visual style: ${visualStyleLine(input.style)}${conceptLine}
Write visual prompts and queries that fit this look.${peopleLine}

Call submit_beat_plan once.`
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
