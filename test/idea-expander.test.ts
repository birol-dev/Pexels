import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  SUBMIT_EXPANDED_SCRIPT_TOOL,
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
        'Moody, dark underwater cinematography featuring glowing bioluminescent deep-sea organisms and submarine explorations.',
      keyThemes: ['deep ocean', 'bioluminescence', 'underwater exploration']
    })

    const result = parseExpandedScriptFromToolCall(json)
    assert.equal(result.title, '5 Secrets to Deep Ocean Exploration')
    assert.ok(result.script.includes('Beneath the dark waves'))
    assert.ok(result.visualConcept.includes('Moody, dark underwater'))
    assert.equal(result.keyThemes?.length, 3)
  })

  it('rejects invalid JSON arguments', () => {
    assert.throws(() => parseExpandedScriptFromToolCall('{bad json'), /not valid JSON/)
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
