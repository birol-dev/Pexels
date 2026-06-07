import { NormalizedToolDefinition } from './llm-provider'

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
