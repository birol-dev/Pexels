import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  SUBMIT_EXPANDED_SCRIPT_TOOL,
  buildIdeaExpanderSystemPrompt,
  parseExpandedScriptFromToolCall,
  parseFallbackExpandedScript
} from '../src/main/services/llm/idea-expander.ts'

describe('SUBMIT_EXPANDED_SCRIPT_TOOL', () => {
  it('defines valid tool schema with script and visualConcept required', () => {
    assert.equal(SUBMIT_EXPANDED_SCRIPT_TOOL.name, 'submit_expanded_script')
    assert.equal(SUBMIT_EXPANDED_SCRIPT_TOOL.parameters.type, 'object')
    assert.ok(SUBMIT_EXPANDED_SCRIPT_TOOL.parameters.required?.includes('script'))
    assert.ok(SUBMIT_EXPANDED_SCRIPT_TOOL.parameters.required?.includes('visualConcept'))
  })
})

describe('parseExpandedScriptFromToolCall', () => {
  it('parses valid expanded script payload with title, script, and visual concept', () => {
    const json = JSON.stringify({
      title: '5 Secrets to Deep Ocean Exploration',
      script:
        'Beneath the dark waves lies a world rarely seen by human eyes. Mysterious creatures illuminate the abyss with bioluminescent glow. Scientists continue to uncover new species every single year.',
      visualConcept:
        'Moody, dark underwater cinematography featuring glowing bioluminescent deep-sea organisms and submarine explorations.'
    })

    const result = parseExpandedScriptFromToolCall(json)
    assert.equal(result.title, '5 Secrets to Deep Ocean Exploration')
    assert.ok(result.script.includes('Beneath the dark waves'))
    assert.ok(result.visualConcept.includes('Moody, dark underwater'))
  })

  it('rejects invalid JSON arguments', () => {
    assert.throws(() => parseExpandedScriptFromToolCall('{bad json'), /not valid JSON/)
  })

  it('rejects non-object root arguments', () => {
    assert.throws(() => parseExpandedScriptFromToolCall('null'), /not an object/)
    assert.throws(() => parseExpandedScriptFromToolCall('"hello"'), /not an object/)
  })

  it('rejects payload with missing or empty script', () => {
    assert.throws(
      () =>
        parseExpandedScriptFromToolCall(
          JSON.stringify({ script: '   ', visualConcept: 'Cinematic visuals' })
        ),
      /missing valid "script" text/
    )
  })

  it('provides default visual concept if visualConcept is omitted in payload', () => {
    const json = JSON.stringify({
      script: 'This is an awesome script.'
    })
    const result = parseExpandedScriptFromToolCall(json)
    assert.equal(result.script, 'This is an awesome script.')
    assert.ok(result.visualConcept.length > 0)
    assert.equal(result.title, undefined)
  })

  it('ignores keyThemes when an older model answer or saved reply still has them', () => {
    const json = JSON.stringify({
      script: 'Narration text goes here.',
      visualConcept: 'Visual direction',
      keyThemes: ['nature', '', '   ', 123, null]
    })
    const result = parseExpandedScriptFromToolCall(json)
    assert.deepEqual(Object.keys(result).sort(), ['script', 'title', 'visualConcept'])
    assert.equal(result.visualConcept, 'Visual direction')
  })
})

describe('keyThemes', () => {
  it('is no longer asked for', () => {
    const properties = Object.keys(SUBMIT_EXPANDED_SCRIPT_TOOL.parameters.properties ?? {})
    assert.deepEqual(properties, ['title', 'script', 'visualConcept'])
  })
})

describe('buildIdeaExpanderSystemPrompt', () => {
  it('says what to write in plain words, with no persona', () => {
    const prompt = buildIdeaExpanderSystemPrompt()
    assert.match(prompt, /^Write a voiceover script for a short video from the creator's idea/)
    assert.match(prompt, /one-paragraph visual direction for finding stock footage, and a title\./)
    assert.doesNotMatch(prompt, /world-class|viral|creative director|Your mission/)
    assert.doesNotMatch(prompt, /\bNOT\b/)
    assert.match(prompt, /Call the submit_expanded_script tool once/)
  })

  it('adds the no-people line only when the creator turned that setting on', () => {
    const off = buildIdeaExpanderSystemPrompt({ avoidPeople: false })
    assert.equal(off, buildIdeaExpanderSystemPrompt())
    assert.doesNotMatch(off, /no people on screen/)
    assert.match(off, /\(places, people, objects, actions, textures, emotions\)/)

    const on = buildIdeaExpanderSystemPrompt({ avoidPeople: true })
    assert.match(
      on,
      /- The creator wants no people on screen\. Write sentences whose images can be places, objects, nature, or hands\./
    )
    assert.doesNotMatch(on, /places, people, objects/)
  })
})

describe('parseFallbackExpandedScript', () => {
  it('extracts JSON markdown code blocks from model response', () => {
    const rawContent = `Here is your expanded script:
\`\`\`json
{
  "title": "Quantum Computing 101",
  "script": "Imagine a computer that can solve centuries-old equations in mere seconds.",
  "visualConcept": "Futuristic clean tech aesthetics with glowing quantum processors and laser optics."
}
\`\`\`
Hope this helps!`

    const result = parseFallbackExpandedScript(rawContent)
    assert.equal(result.title, 'Quantum Computing 101')
    assert.ok(result.script.includes('Imagine a computer'))
    assert.ok(result.visualConcept.includes('Futuristic clean tech'))
  })

  it('handles plain text responses as script content with default visual strategy', () => {
    const plainText =
      'Every year millions of people set new year resolutions, but 80% give up by February. Here is why.'
    const result = parseFallbackExpandedScript(plainText)
    assert.equal(result.script, plainText)
    assert.ok(result.visualConcept.length > 0)
  })

  it('throws for empty raw text', () => {
    assert.throws(() => parseFallbackExpandedScript('   '), /empty response/)
  })
})
