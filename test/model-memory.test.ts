import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  rememberModel,
  switchProviderModel
} from '../src/renderer/src/features/settings/model-memory.ts'

const DEFAULTS = {
  openai: 'default-openai',
  openrouter: 'default-openrouter',
  gemini: 'default-gemini'
} as const

describe('Model memory per provider', () => {
  it('records the model used with a provider without touching the others', () => {
    const memory = { openai: 'gpt-a' }
    const next = rememberModel(memory, 'gemini', 'gem-b')

    assert.deepEqual(next, { openai: 'gpt-a', gemini: 'gem-b' })
    assert.deepEqual(memory, { openai: 'gpt-a' }, 'the input is not mutated')
  })

  it('never lets a blank model id erase a remembered one', () => {
    assert.deepEqual(rememberModel({ openai: 'gpt-a' }, 'openai', '   '), { openai: 'gpt-a' })
    assert.deepEqual(rememberModel(undefined, 'openai', ''), {})
  })

  it('uses the provider default the first time a provider is chosen', () => {
    const choice = switchProviderModel(
      { llmProvider: 'openai', modelId: 'gpt-a' },
      'gemini',
      DEFAULTS
    )

    assert.equal(choice.modelId, 'default-gemini')
    assert.deepEqual(choice.modelIdByProvider, { openai: 'gpt-a' })
  })

  it('brings back the last model used when switching to a provider and back', () => {
    const there = switchProviderModel(
      { llmProvider: 'openai', modelId: 'gpt-custom' },
      'gemini',
      DEFAULTS
    )
    const back = switchProviderModel(
      {
        llmProvider: 'gemini',
        modelId: there.modelId,
        modelIdByProvider: there.modelIdByProvider
      },
      'openai',
      DEFAULTS
    )

    assert.equal(back.modelId, 'gpt-custom')
    assert.deepEqual(back.modelIdByProvider, { openai: 'gpt-custom', gemini: 'default-gemini' })
  })

  it('falls back to the default when the remembered id is blank', () => {
    const choice = switchProviderModel(
      { llmProvider: 'openai', modelId: 'gpt-a', modelIdByProvider: { gemini: '  ' } },
      'gemini',
      DEFAULTS
    )

    assert.equal(choice.modelId, 'default-gemini')
  })
})
