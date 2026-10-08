import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { describeVisualStyle, visualStyleLine } from '../src/main/services/agent/style-guidance.ts'

// The values the style picker sends for its presets.
const PRESETS = ['cinematic', 'documentary', 'business', 'tech', 'nature', 'lifestyle', 'abstract']

describe('describeVisualStyle', () => {
  it('has a line for each preset the style picker offers', () => {
    for (const preset of PRESETS) {
      const line = describeVisualStyle(preset)
      assert.match(line, /^Favor /, preset)
      assert.doesNotMatch(line, /user describes/, preset)
    }
    assert.equal(new Set(PRESETS.map(describeVisualStyle)).size, PRESETS.length, 'all differ')
  })

  it('passes custom text through as the user wrote it', () => {
    assert.equal(
      describeVisualStyle('vintage 8mm film'),
      'The user describes the style as: "vintage 8mm film".'
    )
  })

  it('collapses whitespace and cuts a long custom style to 200 characters', () => {
    assert.equal(
      describeVisualStyle('  neon \n  noir  '),
      'The user describes the style as: "neon noir".'
    )
    const long = describeVisualStyle('x'.repeat(500))
    assert.equal(long, `The user describes the style as: "${'x'.repeat(200)}".`)
  })

  it('says nothing for the placeholder the picker sends when the custom box is empty', () => {
    assert.equal(describeVisualStyle('custom style'), '')
    assert.equal(describeVisualStyle(''), '')
    assert.equal(describeVisualStyle('   '), '')
  })

  it('does not mistake a custom style named like an object property for a preset', () => {
    for (const word of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      assert.equal(describeVisualStyle(word), `The user describes the style as: "${word}".`)
    }
  })
})

describe('visualStyleLine', () => {
  it('puts the style first and what it changes after it', () => {
    assert.match(visualStyleLine('nature'), /^nature\. Favor landscapes, wildlife/)
  })

  it('is just the style when there is nothing to add', () => {
    assert.equal(visualStyleLine('custom style'), 'custom style')
  })
})
