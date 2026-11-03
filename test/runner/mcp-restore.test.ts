import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setImmediate } from 'node:timers/promises'
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test'
import { getJobRunner, getJobSnapshot, registerJobsHandlers } from '../../src/main/ipc/jobs.ipc.ts'
import { AgentRunner } from '../../src/main/services/agent/agent-runner.ts'
import { pinRuntimeSettings } from '../../src/main/services/agent/job-settings.ts'
import { ManifestWriter } from '../../src/main/services/files/manifest-writer.ts'
import { ProjectStore } from '../../src/main/services/storage/project-store.ts'
import { SettingsStore } from '../../src/main/services/storage/settings-store.ts'
import { invokeIpc } from '../support/electron-stub.mjs'
import { installFakeNetwork, type FakeNetwork } from '../support/fake-network.ts'
import { applyTestSettings, resetNetworkState } from '../support/run-job.ts'
import { emptyBeat, writeSavedJob } from '../support/saved-job.ts'

describe('MCP: reconnecting desktop lifecycle actions', { timeout: 10000 }, () => {
  let network: FakeNetwork
  const ids: string[] = []

  before(() => registerJobsHandlers())
  beforeEach(async () => {
    resetNetworkState()
    network = installFakeNetwork()
    await applyTestSettings({ agentEngine: 'mcp' })
  })
  afterEach(async () => {
    mock.restoreAll()
    for (const id of ids.splice(0)) {
      const runner = AgentRunner.getActive(id)
      await runner?.cancel()
      await runner?.waitForShutdown()
    }
    assert.deepEqual(network.llmRequests(), [])
    network.restore()
  })

  async function savedJob(): Promise<{ jobId: string; projectDir: string }> {
    const settings = pinRuntimeSettings(await SettingsStore.getSettings())
    const saved = await writeSavedJob({
      beats: [emptyBeat('beat_1')],
      snapshot: { engine: 'mcp', runtimeSettings: settings },
      agentState: { runtimeSettings: settings }
    })
    ids.push(saved.jobId)
    return saved
  }

  function holdRestore(): { entered: Promise<void>; release: () => void } {
    let enter = (): void => {}
    let release = (): void => {}
    const entered = new Promise<void>((resolve) => {
      enter = resolve
    })
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const initialize = AgentRunner.prototype.initializeAndLoadState
    mock.method(
      AgentRunner.prototype,
      'initializeAndLoadState',
      async function (this: AgentRunner) {
        enter()
        await gate
        await initialize.call(this)
      }
    )
    return { entered, release }
  }

  it('reads a fully restored MCP snapshot instead of a half-initialized runner', async () => {
    const { jobId } = await savedJob()
    const hold = holdRestore()
    const restoring = getJobRunner(jobId)
    await hold.entered
    let read = false
    const snapshot = getJobSnapshot(jobId).then((value) => {
      read = true
      return value
    })
    await setImmediate()
    assert.equal(read, false)
    hold.release()
    await restoring
    assert.equal((await snapshot).runtimeSettings?.engine, 'mcp')
  })

  it('does not revive a pack cancelled while reconnecting', async () => {
    const { jobId } = await savedJob()
    const hold = holdRestore()
    const resuming = invokeIpc('jobs:resume', jobId)
    await hold.entered
    const cancelling = invokeIpc('jobs:cancel', jobId)
    hold.release()
    await Promise.all([resuming, cancelling])
    assert.equal((await ProjectStore.get(jobId))?.status, 'cancelled')
    assert.equal(AgentRunner.getActive(jobId), undefined)
  })

  it('does not recreate a pack deleted while reconnecting', async () => {
    const { jobId, projectDir } = await savedJob()
    const hold = holdRestore()
    const resuming = invokeIpc('jobs:resume', jobId)
    await hold.entered
    const deleting = invokeIpc('jobs:delete', jobId)
    hold.release()
    await Promise.all([resuming, deleting])
    await setImmediate()
    assert.equal(await ProjectStore.get(jobId), undefined)
    assert.equal(AgentRunner.getActive(jobId), undefined)
    assert.equal(existsSync(projectDir), false)
  })

  for (const manifest of ['missing', 'corrupt'] as const) {
    it(`preserves MCP identity with a ${manifest} manifest and reruns without paid AI`, async () => {
      mock.method(console, 'warn', () => {})
      await SettingsStore.updateSettings({ agentEngine: 'loop' })
      const settings = {
        ...pinRuntimeSettings(await SettingsStore.getSettings()),
        engine: 'mcp' as const
      }
      const saved = await writeSavedJob({ manifest, agentState: { runtimeSettings: settings } })
      ids.push(saved.jobId)
      const statePath = join(saved.projectDir, 'agent-state.json')
      const stateBefore = await readFile(statePath, 'utf8')
      assert.equal((await getJobSnapshot(saved.jobId)).runtimeSettings?.engine, 'mcp')
      await assert.rejects(invokeIpc('jobs:resume', saved.jobId), /saved MCP pack data/)
      assert.equal(
        AgentRunner.getActive(saved.jobId),
        undefined,
        'failed restore publishes no runner'
      )
      assert.equal((await ProjectStore.get(saved.jobId))?.status, 'paused')
      assert.equal(await readFile(statePath, 'utf8'), stateBefore)
      if (manifest === 'corrupt') {
        assert.equal(await readFile(join(saved.projectDir, 'manifest.json'), 'utf8'), '{ not json')
      }
      const rerunId = (await invokeIpc('jobs:rerun', saved.jobId)) as string
      ids.push(rerunId)
      const rerun = await getJobSnapshot(rerunId)
      assert.equal(rerun.runtimeSettings?.engine, 'mcp')
      assert.equal(rerun.status, 'running')
      assert.equal(rerun.beats.length, 0)
    })
  }

  it('refuses to replace an unreadable asset ledger with an empty pack', async () => {
    const { jobId, projectDir } = await savedJob()
    const manifestPath = join(projectDir, 'manifest.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    manifest.beats[0].assets = null
    const damaged = JSON.stringify(manifest)
    await writeFile(manifestPath, damaged)
    await assert.rejects(getJobRunner(jobId), /download limits cannot be restored safely/)
    assert.equal(AgentRunner.getActive(jobId), undefined)
    assert.equal(await readFile(manifestPath, 'utf8'), damaged)
    assert.equal((await ProjectStore.get(jobId))?.status, 'paused')
  })

  it('refuses damaged safety pins instead of applying weaker current settings', async () => {
    const settings = pinRuntimeSettings(await SettingsStore.getSettings())
    const saved = await writeSavedJob({
      beats: [emptyBeat('beat_1')],
      snapshot: { engine: 'mcp', runtimeSettings: { ...settings, requireApproval: 'broken' } },
      agentState: { runtimeSettings: { ...settings, skipExplicit: 'broken' } }
    })
    ids.push(saved.jobId)
    await SettingsStore.updateSettings({
      agentEngine: 'loop',
      requireApprovalBeforeDownload: false,
      skipExplicitQueries: false,
      avoidPeopleAndFaces: false
    })
    const stateBefore = await readFile(join(saved.projectDir, 'agent-state.json'), 'utf8')
    const manifestBefore = await readFile(join(saved.projectDir, 'manifest.json'), 'utf8')
    const snapshot = await getJobSnapshot(saved.jobId)
    assert.equal(snapshot.runtimeSettings?.engine, 'mcp')
    assert.equal(snapshot.runtimeSettings?.requireApproval, true)
    await assert.rejects(invokeIpc('jobs:resume', saved.jobId), /saved MCP safety settings/)
    assert.equal(AgentRunner.getActive(saved.jobId), undefined)
    assert.equal(await readFile(join(saved.projectDir, 'agent-state.json'), 'utf8'), stateBefore)
    assert.equal(await readFile(join(saved.projectDir, 'manifest.json'), 'utf8'), manifestBefore)
    const rerunId = (await invokeIpc('jobs:rerun', saved.jobId)) as string
    ids.push(rerunId)
    assert.equal((await getJobSnapshot(rerunId)).runtimeSettings?.engine, 'mcp')
  })

  it('refuses damaged input metadata instead of replacing saved limits with defaults', async () => {
    mock.method(console, 'warn', () => {})
    const { jobId, projectDir } = await savedJob()
    const path = join(projectDir, 'manifest.json')
    const manifest = JSON.parse(await readFile(path, 'utf8'))
    manifest.title = 42
    manifest.settingsSnapshot.maxTotalDownloads = 1
    const damaged = JSON.stringify(manifest)
    await writeFile(path, damaged)
    await assert.rejects(getJobRunner(jobId), /download limits cannot be restored safely/)
    assert.equal(AgentRunner.getActive(jobId), undefined)
    assert.equal(await readFile(path, 'utf8'), damaged)
  })

  it('waits for final resume writes before deleting a pack', async () => {
    const { jobId, projectDir } = await savedJob()
    const runner = await getJobRunner(jobId)
    assert.ok(runner)
    let enter = (): void => {}
    let release = (): void => {}
    const entered = new Promise<void>((resolve) => (enter = resolve))
    const gate = new Promise<void>((resolve) => (release = resolve))
    const flush = ManifestWriter.flushPendingWrites.bind(ManifestWriter)
    let held = false
    mock.method(ManifestWriter, 'flushPendingWrites', async (path: string): Promise<void> => {
      if (!held) {
        held = true
        enter()
        await gate
      }
      await flush(path)
    })
    const resuming = runner.resume()
    await entered
    let deleted = false
    const deleting = invokeIpc('jobs:delete', jobId).then(() => {
      deleted = true
    })
    try {
      await setImmediate()
      assert.equal(deleted, false, 'delete must wait for all final persistence')
    } finally {
      release()
    }
    await Promise.all([resuming, deleting])
    assert.equal(await ProjectStore.get(jobId), undefined)
    assert.equal(existsSync(projectDir), false)
    assert.equal(AgentRunner.getActive(jobId), undefined)
  })

  it('keeps an idle cancelled runner available until its final persistence finishes', async () => {
    const { jobId, projectDir } = await savedJob()
    const runner = await getJobRunner(jobId)
    assert.ok(runner)
    let enter = (): void => {}
    let release = (): void => {}
    const entered = new Promise<void>((resolve) => (enter = resolve))
    const gate = new Promise<void>((resolve) => (release = resolve))
    const save = ProjectStore.save.bind(ProjectStore)
    mock.method(
      ProjectStore,
      'save',
      async (project: Parameters<typeof ProjectStore.save>[0]): Promise<void> => {
        if (project.jobId === jobId && project.status === 'cancelled') {
          enter()
          await gate
        }
        await save(project)
      }
    )
    const cancelling = runner.cancel()
    await entered
    assert.equal(AgentRunner.getActive(jobId), runner)
    assert.equal((await getJobSnapshot(jobId)).status, 'cancelled')
    let deleted = false
    const deleting = invokeIpc('jobs:delete', jobId).then(() => {
      deleted = true
    })
    try {
      await setImmediate()
      assert.equal(deleted, false)
    } finally {
      release()
    }
    await Promise.all([cancelling, deleting])
    assert.equal(await ProjectStore.get(jobId), undefined)
    assert.equal(existsSync(projectDir), false)
    assert.equal(AgentRunner.getActive(jobId), undefined)
  })

  it('reports cancellation write failures and allows a durable retry', async () => {
    mock.method(console, 'error', () => {})
    const { jobId } = await savedJob()
    const runner = await getJobRunner(jobId)
    assert.ok(runner)
    const save = ProjectStore.save.bind(ProjectStore)
    let failed = false
    mock.method(
      ProjectStore,
      'save',
      async (project: Parameters<typeof ProjectStore.save>[0]): Promise<void> => {
        if (!failed && project.jobId === jobId && project.status === 'cancelled') {
          failed = true
          throw new Error('Disk is unavailable')
        }
        await save(project)
      }
    )
    await assert.rejects(runner.cancel(), /Disk is unavailable/)
    await assert.rejects(runner.waitForShutdown(), /Disk is unavailable/)
    assert.equal(
      AgentRunner.getActive(jobId),
      runner,
      'failed writes keep the live cancelled state'
    )
    await runner.cancel()
    await runner.waitForShutdown()
    assert.equal((await ProjectStore.get(jobId))?.status, 'cancelled')
    assert.equal(AgentRunner.getActive(jobId), undefined)
  })
})
