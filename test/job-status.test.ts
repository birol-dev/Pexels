import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import {
  canTransition,
  savedStatusReason,
  type JobStatus
} from '../src/main/services/agent/job-status.ts'

const STATUSES: JobStatus[] = ['running', 'paused', 'completed', 'cancelled', 'failed']
const FINAL: JobStatus[] = ['completed', 'cancelled', 'failed']

describe('canTransition', () => {
  it('allows exactly the changes a job can make', () => {
    const allowed = STATUSES.flatMap((from) =>
      STATUSES.filter((to) => from !== to && canTransition(from, to)).map((to) => `${from}>${to}`)
    )
    assert.deepEqual(allowed.sort(), [
      'paused>cancelled',
      'paused>running',
      'running>cancelled',
      'running>completed',
      'running>failed',
      'running>paused'
    ])
  })

  it('never leaves a final state', () => {
    for (const from of FINAL) {
      for (const to of STATUSES) {
        assert.equal(canTransition(from, to), from === to, `${from} -> ${to}`)
      }
    }
  })

  it('does not finish a paused job: it has to run first', () => {
    assert.equal(canTransition('paused', 'completed'), false)
    assert.equal(canTransition('paused', 'failed'), false)
  })

  it('treats staying in the same status as allowed', () => {
    for (const status of STATUSES) assert.equal(canTransition(status, status), true)
  })
})

describe('savedStatusReason', () => {
  it('keeps a pause reason that was saved with a paused job', () => {
    for (const reason of ['user_paused', 'awaiting_approval', 'pexels_quota', 'app_quit']) {
      assert.equal(savedStatusReason('paused', reason), reason)
    }
  })

  it('reads a paused job as restored when it was not saved paused', () => {
    // The app stopped while the job ran, so the last reason saved is why it started.
    assert.equal(savedStatusReason('paused', 'resumed'), 'restored')
    assert.equal(savedStatusReason('paused', 'started'), 'restored')
    assert.equal(savedStatusReason('paused', undefined), 'restored')
    assert.equal(savedStatusReason('paused', 42), 'restored')
    assert.equal(savedStatusReason('paused', 'made_up'), 'restored')
  })

  it('has nothing to say about a job that is not paused', () => {
    for (const status of STATUSES.filter((s) => s !== 'paused')) {
      assert.equal(savedStatusReason(status, 'user_paused'), undefined)
    }
  })
})

describe('the runner', () => {
  it('assigns its status in setStatus and when restoring a saved job, nowhere else', () => {
    const source = readFileSync(join('src', 'main', 'services', 'agent', 'agent-runner.ts'), 'utf8')
    const assignments = source
      .split('\n')
      .filter((line) => /this\.status\s*=[^=]/.test(line))
      .map((line) => line.trim())
    assert.deepEqual(assignments, ["this.status = 'paused'", 'this.status = to'])
  })
})
