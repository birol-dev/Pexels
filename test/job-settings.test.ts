import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  describeProviderAndModel,
  missingCurrentKeyMessage,
  missingPinnedKeyMessage,
  parseRuntimeSettings,
  pinRuntimeSettings,
  resolveRuntimeSettings,
  type JobRuntimeSettings
} from '../src/main/services/agent/job-settings.ts'
import { getDefaultSettings } from '../src/main/services/storage/settings-store.ts'

const SAVED: JobRuntimeSettings = {
  providerId: 'openrouter',
  modelId: 'deepseek/deepseek-v4.1-flash',
  maxIterations: 40,
  requestTimeoutSeconds: 90,
  skipExplicit: false,
  avoidPeople: true,
  requireApproval: true,
  engine: 'pipeline'
}

describe('job settings', () => {
  const current = {
    ...getDefaultSettings(),
    llmProvider: 'openai' as const,
    modelId: 'gpt-4o',
    maxAgentIterations: 20,
    requestTimeoutSeconds: 45,
    skipExplicitQueries: true,
    avoidPeopleAndFaces: false,
    requireApprovalBeforeDownload: false
  }

  it('pins the model and limits from Settings, and nothing about the machine', () => {
    assert.deepEqual(pinRuntimeSettings(current), {
      providerId: 'openai',
      modelId: 'gpt-4o',
      maxIterations: 20,
      requestTimeoutSeconds: 45,
      skipExplicit: true,
      avoidPeople: false,
      requireApproval: false,
      engine: 'loop'
    })
  })

  it('pins the engine Settings names, and the loop when it names none', () => {
    assert.equal(pinRuntimeSettings({ ...current, agentEngine: 'pipeline' }).engine, 'pipeline')
    assert.equal(pinRuntimeSettings({ ...current, agentEngine: 'loop' }).engine, 'loop')
    assert.equal(pinRuntimeSettings({ ...current, agentEngine: undefined }).engine, 'loop')
  })

  describe('parseRuntimeSettings', () => {
    it('reads a complete record back', () => {
      assert.deepEqual(parseRuntimeSettings(JSON.parse(JSON.stringify(SAVED))), SAVED)
    })

    it('drops fields it does not know', () => {
      assert.deepEqual(parseRuntimeSettings({ ...SAVED, apiKey: 'sk-secret' }), SAVED)
    })

    it('reads a record saved before engines existed as a loop job', () => {
      const beforeEngines: Partial<JobRuntimeSettings> = { ...SAVED }
      delete beforeEngines.engine
      assert.deepEqual(parseRuntimeSettings(beforeEngines), { ...SAVED, engine: 'loop' })
    })

    it('reads an engine it does not know as the loop, and keeps the rest of the record', () => {
      assert.deepEqual(parseRuntimeSettings({ ...SAVED, engine: 'agent-v2' }), {
        ...SAVED,
        engine: 'loop'
      })
      assert.deepEqual(parseRuntimeSettings({ ...SAVED, engine: 7 }), { ...SAVED, engine: 'loop' })
    })

    it('rejects a record that is missing something or has the wrong kind of value', () => {
      const broken: unknown[] = [
        undefined,
        null,
        'openai',
        [],
        {},
        { ...SAVED, providerId: 'anthropic' },
        { ...SAVED, providerId: undefined },
        { ...SAVED, modelId: '' },
        { ...SAVED, modelId: '   ' },
        { ...SAVED, modelId: 4 },
        { ...SAVED, maxIterations: 0 },
        { ...SAVED, maxIterations: '30' },
        { ...SAVED, requestTimeoutSeconds: Number.NaN },
        { ...SAVED, skipExplicit: 'yes' },
        { ...SAVED, avoidPeople: undefined },
        { ...SAVED, requireApproval: 1 }
      ]
      for (const value of broken)
        assert.equal(parseRuntimeSettings(value), undefined, String(value))
    })

    it('does not treat an inherited property as a provider', () => {
      assert.equal(parseRuntimeSettings({ ...SAVED, providerId: 'toString' }), undefined)
    })
  })

  describe('resolveRuntimeSettings', () => {
    it('uses the saved record as it is', () => {
      assert.deepEqual(
        resolveRuntimeSettings(SAVED, { provider: 'openai', modelId: 'gpt-4o' }, current),
        SAVED
      )
    })

    it('gives a job without a record its manifest provider and model, and today limits', () => {
      assert.deepEqual(
        resolveRuntimeSettings(
          undefined,
          { provider: 'gemini', modelId: 'gemini-2.5-flash' },
          current
        ),
        {
          providerId: 'gemini',
          modelId: 'gemini-2.5-flash',
          maxIterations: 20,
          requestTimeoutSeconds: 45,
          skipExplicit: true,
          avoidPeople: false,
          requireApproval: false,
          engine: 'loop'
        }
      )
    })

    it('keeps a job from before settings were pinned on the loop, whatever Settings say now', () => {
      const pipelineNow = { ...current, agentEngine: 'pipeline' as const }
      assert.equal(resolveRuntimeSettings(undefined, undefined, pipelineNow).engine, 'loop')
      assert.equal(
        resolveRuntimeSettings(undefined, { provider: 'gemini', modelId: 'g' }, pipelineNow).engine,
        'loop'
      )
    })

    it('takes provider and model together or not at all', () => {
      const today = pinRuntimeSettings(current)
      assert.deepEqual(resolveRuntimeSettings(undefined, undefined, current), today)
      assert.deepEqual(resolveRuntimeSettings(undefined, {}, current), today)
      assert.deepEqual(resolveRuntimeSettings(undefined, { provider: 'gemini' }, current), today)
      assert.deepEqual(
        resolveRuntimeSettings(undefined, { modelId: 'gemini-2.5-flash' }, current),
        today
      )
      assert.deepEqual(
        resolveRuntimeSettings(undefined, { provider: 'nobody', modelId: 'm' }, current),
        today
      )
      assert.deepEqual(
        resolveRuntimeSettings(undefined, { provider: 'gemini', modelId: ' ' }, current),
        today
      )
    })
  })

  describe('messages', () => {
    it('names the provider and model the job was started with, and both ways out', () => {
      assert.equal(
        missingPinnedKeyMessage({
          ...SAVED,
          providerId: 'openrouter',
          modelId: 'deepseek/deepseek-v4.1-flash'
        }),
        'This job was started with OpenRouter (deepseek/deepseek-v4.1-flash). Add an OpenRouter key in Settings, or choose Resume with current settings.'
      )
    })

    it('uses "a" or "an" as the provider name asks for', () => {
      assert.match(missingPinnedKeyMessage({ ...SAVED, providerId: 'openai' }), /Add an OpenAI key/)
      assert.match(
        missingPinnedKeyMessage({ ...SAVED, providerId: 'gemini' }),
        /Add a Google Gemini key/
      )
      assert.equal(
        missingCurrentKeyMessage({ ...SAVED, providerId: 'gemini' }),
        'Add a Google Gemini key in Settings before resuming with the current settings.'
      )
    })

    it('describes a provider and model for the user', () => {
      assert.equal(describeProviderAndModel(SAVED), 'OpenRouter (deepseek/deepseek-v4.1-flash)')
    })
  })
})
