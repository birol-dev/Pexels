import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import type { JobSnapshot, JobSummary } from '../src/renderer/src/lib/store.ts'

let readJob: () => Promise<JobSnapshot> = async () => snapshot('job_1')
let listJobs: () => Promise<JobSummary[]> = async () => []
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: { api: { jobs: { get: () => readJob(), list: () => listJobs() } } }
})
const { useAppStore } = await import('../src/renderer/src/lib/store.ts')

function summary(jobId: string, createdAt = '2026-11-03T10:00:00Z'): JobSummary {
  return {
    jobId,
    projectName: jobId,
    title: jobId,
    script: 'A quiet city street.',
    status: 'running',
    createdAt,
    updatedAt: createdAt,
    downloadPath: 'packs',
    assetCount: 0
  }
}

function snapshot(jobId: string, overrides: Partial<JobSnapshot> = {}): JobSnapshot {
  return {
    jobId,
    title: jobId,
    script: 'A quiet city street.',
    status: 'running',
    progress: 0,
    currentStep: 'Waiting for MCP',
    beats: [],
    logs: [],
    downloadedCount: 0,
    failedCount: 0,
    ...overrides
  }
}

describe('MCP jobs appear and progress across the app', () => {
  beforeEach(() => {
    useAppStore.setState({
      jobs: [],
      activeJobId: null,
      activeJob: null,
      activeJobError: null,
      pendingEvents: [],
      loading: false
    })
    listJobs = async () => []
    readJob = async () => snapshot('job_1')
  })

  it('shows externally created packs without selecting them and deduplicates repeated events', () => {
    const existing = summary('job_1')
    const external = summary('job_2', '2026-11-03T11:00:00Z')
    useAppStore.setState({ jobs: [existing] })
    useAppStore.getState().handleJobEvent({ type: 'created', data: external })
    useAppStore.getState().handleJobEvent({ type: 'created', data: external })
    assert.deepEqual(useAppStore.getState().jobs, [external, existing])
    assert.equal(useAppStore.getState().activeJobId, null)
    assert.equal(useAppStore.getState().activeJob, null)
  })

  it('updates another pack in history without mixing its snapshot or logs into the selected pack', () => {
    const selected = snapshot('job_1')
    useAppStore.setState({
      jobs: [summary('job_1'), summary('job_2')],
      activeJobId: 'job_1',
      activeJob: selected
    })
    useAppStore.getState().handleJobEvent({
      type: 'snapshot',
      jobId: 'job_2',
      data: snapshot('job_2', { status: 'completed', downloadedCount: 3 })
    })
    useAppStore.getState().handleJobEvent({
      type: 'log',
      jobId: 'job_2',
      data: { type: 'info', message: 'Other pack', timestamp: '' }
    })
    const state = useAppStore.getState()
    assert.equal(state.jobs[1].status, 'completed')
    assert.equal(state.jobs[1].assetCount, 3)
    assert.equal(state.activeJob, selected)
    assert.deepEqual(state.pendingEvents, [])
  })

  it('keeps log and snapshot events received while the selected job is loading', async () => {
    let finishRead!: (value: JobSnapshot) => void
    readJob = () =>
      new Promise((resolve) => {
        finishRead = resolve
      })
    useAppStore.getState().setActiveJobId('job_1')
    const log = { type: 'info' as const, message: 'MCP is working', timestamp: '' }
    useAppStore.getState().handleJobEvent({ type: 'log', jobId: 'job_1', data: log })
    const updated = snapshot('job_1', { progress: 40, downloadedCount: 1 })
    useAppStore.getState().handleJobEvent({
      type: 'snapshot',
      jobId: 'job_1',
      data: updated
    })
    finishRead(snapshot('job_1'))
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(useAppStore.getState().activeJob?.progress, 40)
    assert.equal(useAppStore.getState().activeJob?.downloadedCount, 1)
    assert.deepEqual(useAppStore.getState().activeJob?.logs, [log])
    assert.deepEqual(useAppStore.getState().pendingEvents, [])
  })

  it('does not lose a creation or progress to an older job-list response', async () => {
    let finishList!: (value: JobSummary[]) => void
    listJobs = () =>
      new Promise((resolve) => {
        finishList = resolve
      })
    useAppStore.setState({ jobs: [summary('job_1')] })
    const loading = useAppStore.getState().loadJobs()
    const external = summary('job_2')
    useAppStore.getState().handleJobEvent({ type: 'created', data: external })
    useAppStore.getState().handleJobEvent({
      type: 'snapshot',
      jobId: 'job_1',
      data: snapshot('job_1', { downloadedCount: 2 })
    })
    finishList([summary('job_1')])
    await loading
    assert.equal(useAppStore.getState().jobs.find((job) => job.jobId === 'job_1')?.assetCount, 2)
    assert.ok(useAppStore.getState().jobs.some((job) => job.jobId === 'job_2'))
  })

  it('keeps live progress and logs when an older selected-job read completes', async () => {
    let finishRead!: (value: JobSnapshot) => void
    readJob = () =>
      new Promise((resolve) => {
        finishRead = resolve
      })
    useAppStore.setState({ activeJobId: 'job_1', activeJob: snapshot('job_1', { progress: 10 }) })
    const loading = useAppStore.getState().loadActiveJob('job_1')
    const log = { type: 'info' as const, message: 'Script submitted', timestamp: '' }
    useAppStore.getState().handleJobEvent({ type: 'log', jobId: 'job_1', data: log })
    useAppStore.getState().handleJobEvent({
      type: 'snapshot',
      jobId: 'job_1',
      data: snapshot('job_1', { progress: 80, script: 'New draft.' })
    })
    finishRead(snapshot('job_1', { progress: 10, logs: [log] }))
    await loading
    assert.equal(useAppStore.getState().activeJob?.progress, 80)
    assert.equal(useAppStore.getState().activeJob?.script, 'New draft.')
    assert.deepEqual(
      useAppStore.getState().activeJob?.logs,
      [log],
      'does not duplicate fetched logs'
    )
  })

  it('ignores the older of two overlapping reads of the same selected pack', async () => {
    const reads: Array<(value: JobSnapshot) => void> = []
    readJob = () =>
      new Promise((resolve) => {
        reads.push(resolve)
      })
    useAppStore.setState({ activeJobId: 'job_1', activeJob: snapshot('job_1') })
    const older = useAppStore.getState().loadActiveJob('job_1')
    const newer = useAppStore.getState().loadActiveJob('job_1')
    reads[1](snapshot('job_1', { progress: 90 }))
    await newer
    reads[0](snapshot('job_1', { progress: 20 }))
    await older
    assert.equal(useAppStore.getState().activeJob?.progress, 90)
  })

  it('exposes a failed pack load for retry instead of leaving a permanent spinner', async () => {
    readJob = async () => {
      throw new Error('Project file is unavailable')
    }
    useAppStore.setState({ activeJobId: 'job_1' })
    await useAppStore.getState().loadActiveJob('job_1')
    assert.equal(useAppStore.getState().activeJobError, 'Project file is unavailable')
    assert.equal(useAppStore.getState().loading, false)
    readJob = async () => snapshot('job_1')
    await useAppStore.getState().loadActiveJob('job_1')
    assert.equal(useAppStore.getState().activeJobError, null)
    assert.equal(useAppStore.getState().activeJob?.jobId, 'job_1')
  })

  it('clears loading when the user leaves a pack whose read is still pending', async () => {
    let finishRead!: (value: JobSnapshot) => void
    readJob = () =>
      new Promise((resolve) => {
        finishRead = resolve
      })
    useAppStore.getState().setActiveJobId('job_1')
    useAppStore.getState().setActiveJobId(null)
    finishRead(snapshot('job_1'))
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(useAppStore.getState().loading, false)
    assert.equal(useAppStore.getState().activeJob, null)
  })
})
