import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  getPauseReasonText,
  getTokenUsageText,
  pinnedSettingsDiffer
} from '../src/renderer/src/features/agent-run/utils.ts'
import type { JobSnapshot, PublicSettings } from '../src/renderer/src/lib/store.ts'

const PINNED: NonNullable<JobSnapshot['runtimeSettings']> = {
  providerId: 'openai',
  modelId: 'gpt-4o',
  maxIterations: 30,
  requestTimeoutSeconds: 60,
  skipExplicit: true,
  avoidPeople: false,
  requireApproval: false,
  engine: 'loop'
}

// Only the fields these helpers read; the rest of a snapshot or of Settings is not their business.
function job(overrides: Partial<JobSnapshot> = {}): JobSnapshot {
  return { status: 'paused', runtimeSettings: PINNED, ...overrides } as JobSnapshot
}

function settings(overrides: Partial<PublicSettings> = {}): PublicSettings {
  return {
    llmProvider: 'openai',
    modelId: 'gpt-4o',
    maxAgentIterations: 30,
    requestTimeoutSeconds: 60,
    skipExplicitQueries: true,
    avoidPeopleAndFaces: false,
    requireApprovalBeforeDownload: false,
    ...overrides
  } as PublicSettings
}

describe('run screen: Resume with current settings', () => {
  it('is not offered while Settings say what the job already runs with', () => {
    assert.equal(pinnedSettingsDiffer(job(), settings()), false)
  })

  it('is offered when the provider, model or any limit differs', () => {
    const changes: Array<Partial<PublicSettings>> = [
      { llmProvider: 'openrouter' },
      { modelId: 'gpt-4o-mini' },
      { maxAgentIterations: 10 },
      { requestTimeoutSeconds: 120 },
      { skipExplicitQueries: false },
      { avoidPeopleAndFaces: true },
      { requireApprovalBeforeDownload: true },
      { agentEngine: 'pipeline' }
    ]
    for (const change of changes) {
      assert.equal(pinnedSettingsDiffer(job(), settings(change)), true, JSON.stringify(change))
    }
  })

  it('reads a missing engine, on the job or in Settings, as the loop', () => {
    const beforeEngines: Partial<typeof PINNED> = { ...PINNED }
    delete beforeEngines.engine
    const oldJob = job({ runtimeSettings: beforeEngines })
    assert.equal(pinnedSettingsDiffer(oldJob, settings()), false)
    assert.equal(pinnedSettingsDiffer(oldJob, settings({ agentEngine: 'loop' })), false)
    assert.equal(pinnedSettingsDiffer(oldJob, settings({ agentEngine: 'pipeline' })), true)
    const pipelineJob = job({ runtimeSettings: { ...PINNED, engine: 'pipeline' } })
    assert.equal(pinnedSettingsDiffer(pipelineJob, settings({ agentEngine: 'pipeline' })), false)
    assert.equal(pinnedSettingsDiffer(pipelineJob, settings()), true)
  })

  it('is offered when the pipeline ranks with thumbnails in Settings and not in the job, or the other way round', () => {
    const plain = job({ runtimeSettings: { ...PINNED, engine: 'pipeline' } })
    const withThumbnails = job({
      runtimeSettings: { ...PINNED, engine: 'pipeline', rankWithThumbnails: true }
    })
    const pipeline = { agentEngine: 'pipeline' } as const
    assert.equal(pinnedSettingsDiffer(plain, settings({ ...pipeline })), false)
    assert.equal(
      pinnedSettingsDiffer(plain, settings({ ...pipeline, rankWithThumbnails: false })),
      false
    )
    assert.equal(
      pinnedSettingsDiffer(plain, settings({ ...pipeline, rankWithThumbnails: true })),
      true
    )
    assert.equal(pinnedSettingsDiffer(withThumbnails, settings({ ...pipeline })), true)
    assert.equal(
      pinnedSettingsDiffer(withThumbnails, settings({ ...pipeline, rankWithThumbnails: true })),
      false
    )
  })

  it('does not count thumbnails when the job runs on the loop, which never sends them', () => {
    const loopJob = job()
    assert.equal(pinnedSettingsDiffer(loopJob, settings({ rankWithThumbnails: true })), false)
    const loopJobPinnedOn = job({ runtimeSettings: { ...PINNED, rankWithThumbnails: true } })
    assert.equal(pinnedSettingsDiffer(loopJobPinnedOn, settings()), false)
    assert.equal(
      pinnedSettingsDiffer(loopJobPinnedOn, settings({ rankWithThumbnails: false })),
      false
    )
  })

  it('reads a thumbnails setting a job or Settings lack as off', () => {
    const beforeThumbnails: Partial<typeof PINNED> = { ...PINNED, engine: 'pipeline' }
    delete beforeThumbnails.rankWithThumbnails
    const oldPipelineJob = job({ runtimeSettings: beforeThumbnails })
    assert.equal(pinnedSettingsDiffer(oldPipelineJob, settings({ agentEngine: 'pipeline' })), false)
    assert.equal(
      pinnedSettingsDiffer(
        oldPipelineJob,
        settings({ agentEngine: 'pipeline', rankWithThumbnails: true })
      ),
      true
    )
  })

  it('is not offered when either side is unknown', () => {
    assert.equal(pinnedSettingsDiffer(job({ runtimeSettings: undefined }), settings()), false)
    assert.equal(pinnedSettingsDiffer(job(), null), false)
  })
})

describe('run screen: why a job is paused', () => {
  it('says nothing for a job that is not paused', () => {
    assert.equal(getPauseReasonText(job({ status: 'running', statusReason: 'resumed' })), null)
  })

  it('explains the reasons the user can act on', () => {
    assert.match(getPauseReasonText(job({ statusReason: 'awaiting_approval' })) ?? '', /review/)
    assert.match(getPauseReasonText(job({ statusReason: 'pexels_quota' })) ?? '', /quota/)
    assert.match(getPauseReasonText(job({ statusReason: 'app_quit' })) ?? '', /app closed/)
  })
})

describe('run screen: token usage', () => {
  const usage = { inputTokens: 1200, outputTokens: 340, totalTokens: 1540 }

  // Numbers read in the viewer's locale, so the expected text is built the same way.
  const n = (value: number): string => value.toLocaleString()

  it('shows input and output tokens', () => {
    assert.equal(getTokenUsageText(job({ usage })), `${n(1200)} tokens in · ${n(340)} out`)
  })

  it('shows cached tokens only when there are some', () => {
    assert.equal(
      getTokenUsageText(job({ usage: { ...usage, cachedInputTokens: 900 } })),
      `${n(1200)} tokens in (${n(900)} cached) · ${n(340)} out`
    )
    assert.ok(
      !getTokenUsageText(job({ usage: { ...usage, cachedInputTokens: 0 } }))?.includes('cached')
    )
  })

  it('says nothing for a job that has not reported usage', () => {
    assert.equal(getTokenUsageText(job({ usage: undefined })), null)
  })
})
