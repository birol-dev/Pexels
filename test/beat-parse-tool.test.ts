import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  parseBeatsFromToolCall,
  SUBMIT_SCRIPT_BEATS_TOOL
} from '../src/main/services/llm/beat-parse-tool.ts'

describe('SUBMIT_SCRIPT_BEATS_TOOL', () => {
  it('defines valid JSON schema with beats array', () => {
    assert.equal(SUBMIT_SCRIPT_BEATS_TOOL.name, 'submit_script_beats')
    assert.equal(SUBMIT_SCRIPT_BEATS_TOOL.parameters.type, 'object')
    assert.ok(SUBMIT_SCRIPT_BEATS_TOOL.parameters.required?.includes('beats'))
  })
})

describe('parseBeatsFromToolCall', () => {
  it('parses structured beats correctly from JSON arguments', () => {
    const json = JSON.stringify({
      beats: [
        {
          text: 'In the deep space, galaxies swirl.',
          visualPrompt: 'swirling spiral galaxy in deep space cinematic'
        },
        {
          text: 'Astronauts gaze upon the horizon.',
          visualPrompt: 'astronaut helmet reflection stars earth view'
        }
      ]
    })

    const beats = parseBeatsFromToolCall(json)
    assert.equal(beats.length, 2)
    assert.equal(beats[0].text, 'In the deep space, galaxies swirl.')
    assert.equal(beats[0].visualPrompt, 'swirling spiral galaxy in deep space cinematic')
    assert.equal(beats[1].text, 'Astronauts gaze upon the horizon.')
  })

  it('rejects invalid JSON', () => {
    assert.throws(() => parseBeatsFromToolCall('not json'), /not valid JSON/)
  })

  it('rejects missing beats array or empty beats array', () => {
    assert.throws(() => parseBeatsFromToolCall('{}'), /missing "beats" array/)
    assert.throws(() => parseBeatsFromToolCall('{"beats":[]}'), /empty beats array/)
  })

  it('rejects beats with missing text or visualPrompt', () => {
    assert.throws(
      () => parseBeatsFromToolCall('{"beats":[{"text":"hello","visualPrompt":""}]}'),
      /missing text or visualPrompt/
    )
  })
})
