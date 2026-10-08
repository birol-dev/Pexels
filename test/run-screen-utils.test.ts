import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  getPauseReasonText,
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
  requireApproval: false
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
      { requireApprovalBeforeDownload: true }
    ]
    for (const change of changes) {
      assert.equal(pinnedSettingsDiffer(job(), settings(change)), true, JSON.stringify(change))
    }
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
