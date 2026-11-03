import assert from 'node:assert/strict'
import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { AgentRunner, type StartJobInput } from '../../src/main/services/agent/agent-runner.ts'
import type { BeatPlanItem } from '../../src/main/services/llm/beat-parse-tool.ts'
import { SecureSecrets } from '../../src/main/services/storage/secure-secrets.ts'
import { ProjectStore } from '../../src/main/services/storage/project-store.ts'
import { SettingsStore } from '../../src/main/services/storage/settings-store.ts'
import { installFakeNetwork, type FakeNetwork } from '../support/fake-network.ts'
import { holdMediaDownload, holdVideoSearch } from '../support/gates.ts'
import { photo, video, videoFileUrl } from '../support/pexels-fixtures.ts'
import { applyTestSettings, nextJobId, readJob, resetNetworkState } from '../support/run-job.ts'

const INPUT: StartJobInput = {
  title: 'MCP project',
  script: 'A city wakes up. The forest is quiet.',
  platform: 'YouTube',
  style: 'cinematic',
  mix: 'videos + photos',
  maxAssetsPerBeat: 1,
  maxTotalDownloads: 2
}

const PLAN: BeatPlanItem[] = [
  {
    lastSentence: 1,
    visualPrompt: 'City at sunrise',
    queries: ['city sunrise'],
    assetType: 'video'
  },
  { lastSentence: 2, visualPrompt: 'Quiet forest', queries: ['forest trees'], assetType: 'photo' }
]

function selection(
  beatId: string,
  pexelsId: number,
  assetType: 'photo' | 'video' = 'video'
): { selections: Array<{ beatId: string; pexelsId: number; assetType: 'photo' | 'video' }> } {
  return { selections: [{ beatId, pexelsId, assetType }] }
}

describe('runner: MCP client engine', () => {
  let network: FakeNetwork
  let runners: AgentRunner[]

  beforeEach(async () => {
    runners = []
    resetNetworkState()
    network = installFakeNetwork()
    await applyTestSettings({ agentEngine: 'loop', skipExplicitQueries: true })
    for (const key of ['openaiKey', 'openrouterKey', 'geminiKey']) {
      await SecureSecrets.setSecret(key, '')
    }
  })

  afterEach(async () => {
    for (const runner of runners) {
      if (AgentRunner.getActive(runner.getSnapshot().jobId) === runner) {
        await runner.cancel()
        await runner.waitForShutdown()
      }
    }
    assert.deepEqual(network.llmRequests(), [], 'MCP must never call an AI API')
    assert.deepEqual(network.problems, [])
    network.restore()
  })

  async function start(input: Partial<StartJobInput> = {}): Promise<AgentRunner> {
    const runner = new AgentRunner(nextJobId(), { ...INPUT, ...input }, 'mcp')
    runners.push(runner)
    await runner.ensureRegistered()
    await runner.start()
    return runner
  }

  async function ready(): Promise<AgentRunner> {
    const runner = await start()
    await runner.submitMcpBeatPlan(PLAN)
    return runner
  }

  it('plans, searches, selects and finishes photos and videos without an AI key', async () => {
    network.pexels.videos('city sunrise', [video(101, 'city')])
    network.pexels.photos('forest trees', [photo(201, 'forest')])
    const runner = await start()
    const jobId = runner.getSnapshot().jobId
    assert.equal(AgentRunner.getActive(jobId), runner, 'running MCP runner stays registered')
    assert.equal(runner.getSnapshot().beats.length, 0)
    await runner.submitMcpBeatPlan(PLAN)
    assert.deepEqual(
      runner.getSnapshot().beats.map((beat) => beat.text),
      ['A city wakes up.', 'The forest is quiet.']
    )
    const videos = (await runner.executeMcpTool('search_pexels_videos', {
      beatId: 'beat_1',
      query: 'city sunrise'
    })) as { results: Array<{ pexelsId: number }> }
    assert.equal(videos.results[0].pexelsId, 101, 'MCP gets full results, not log summaries')
    await runner.executeMcpTool('search_pexels_photos', {
      beatId: 'beat_2',
      query: 'forest trees'
    })
    await runner.executeMcpTool('select_assets_for_download', selection('beat_1', 101))
    await runner.executeMcpTool('select_assets_for_download', selection('beat_2', 201, 'photo'))
    const snapshot = await runner.finishMcpJob('Two matching stock assets downloaded.')
    assert.equal(snapshot.status, 'completed')
    assert.equal(snapshot.downloadedCount, 2)
    assert.equal(AgentRunner.getActive(jobId), undefined)
    const { manifest, summary } = await readJob(jobId)
    assert.equal(summary.status, 'completed')
    assert.equal((manifest.settingsSnapshot as { engine: string }).engine, 'mcp')
    assert.equal(manifest.summary, 'Two matching stock assets downloaded.')
    assert.ok(manifest.beats.every((beat) => beat.assets.every((asset) => asset.filePath)))
  })

  it('hands an idea to the MCP client, restores its script, and downloads without an AI API', async () => {
    const idea = 'Show how a city wakes up at sunrise.'
    network.pexels.videos('city sunrise', [video(101, 'city')])
    const first = await start({ inputMode: 'idea', idea, script: '', maxTotalDownloads: 1 })
    assert.equal(first.getSnapshot().currentStep, 'Waiting for MCP script')
    assert.equal(first.getSnapshot().idea, idea)
    await assert.rejects(first.submitMcpBeatPlan([PLAN[0]]), /Submit a finished script/)
    await assert.rejects(first.submitMcpScript('  '))
    await assert.rejects(first.submitMcpScript('x'.repeat(200001)))
    await first.submitMcpScript('  A city wakes up.  ')
    await first.pause()
    const restored = new AgentRunner(first.getSnapshot().jobId, {
      ...INPUT,
      inputMode: 'idea',
      idea,
      script: '',
      maxTotalDownloads: 1
    })
    runners.push(restored)
    await restored.initializeAndLoadState()
    await restored.resume()
    assert.equal(restored.getSnapshot().script, 'A city wakes up.')
    assert.equal(restored.getSnapshot().inputMode, 'idea')
    assert.equal(restored.getSnapshot().idea, idea)
    await restored.submitMcpBeatPlan([PLAN[0]])
    await assert.rejects(restored.submitMcpScript('Another script.'), /already has a beat plan/)
    await restored.executeMcpTool('search_pexels_videos', {
      beatId: 'beat_1',
      query: 'city sunrise'
    })
    await restored.executeMcpTool('select_assets_for_download', selection('beat_1', 101))
    assert.equal((await restored.finishMcpJob()).status, 'completed')
    assert.equal((await readJob(restored.getSnapshot().jobId)).manifest.originalIdea, idea)
  })

  it('keeps saved safety settings when MCP has no model ID', async () => {
    await SettingsStore.updateSettings({ modelId: '', requireApprovalBeforeDownload: true })
    const first = await ready()
    await first.pause()
    await SettingsStore.updateSettings({ requireApprovalBeforeDownload: false })
    const restored = new AgentRunner(first.getSnapshot().jobId, { ...INPUT })
    runners.push(restored)
    await restored.initializeAndLoadState()
    assert.equal(restored.getSnapshot().runtimeSettings?.engine, 'mcp')
    assert.equal(restored.getSnapshot().runtimeSettings?.modelId, '')
    assert.equal(restored.getSnapshot().runtimeSettings?.requireApproval, true)
  })

  it('rejects malformed plans, unknown tools and unknown beats before making requests', async () => {
    const runner = await start()
    await assert.rejects(runner.executeMcpTool('search_pexels_videos', {}), /beat plan/)
    await assert.rejects(runner.submitMcpBeatPlan([{ ...PLAN[0], lastSentence: 200 }]), /Beat ends/)
    assert.equal(runner.getSnapshot().beats.length, 0)
    await runner.submitMcpBeatPlan(PLAN)
    await assert.rejects(runner.submitMcpBeatPlan(PLAN), /already has a beat plan/)
    await assert.rejects(
      runner.executeMcpTool('search_pexels_videos', { beatId: 'beat_999', query: 'city sunrise' }),
      /Beat ID/
    )
    await assert.rejects(runner.executeMcpTool('delete_everything', {}), /Unknown MCP job tool/)
    assert.equal(network.requests.length, 0)
  })

  it('refuses to control an API job', async () => {
    const runner = new AgentRunner(nextJobId(), { ...INPUT })
    runners.push(runner)
    await runner.ensureRegistered()
    await assert.rejects(runner.submitMcpBeatPlan(PLAN), /not controlled by MCP/)
    await assert.rejects(runner.executeMcpTool('search_pexels_videos', {}), /not controlled by MCP/)
    assert.equal(network.requests.length, 0)
  })

  it('rejects assets and URLs that were not offered by a search', async () => {
    network.pexels.videos('city sunrise', [video(101, 'city')])
    const runner = await ready()
    await runner.executeMcpTool('search_pexels_videos', {
      beatId: 'beat_1',
      query: 'city sunrise'
    })
    const unknown = (await runner.executeMcpTool(
      'select_assets_for_download',
      selection('beat_1', 999)
    )) as { selections: Array<{ status: string; reason: string }> }
    assert.equal(unknown.selections[0].status, 'rejected')
    assert.match(unknown.selections[0].reason, /not found in Pexels search results/)
    const forged = (await runner.executeMcpTool('select_assets_for_download', {
      selections: [
        {
          beatId: 'beat_1',
          assetType: 'video',
          pexelsId: 101,
          variantUrl: 'https://videos.pexels.com/video-files/999/forged.mp4'
        }
      ]
    })) as { selections: Array<{ status: string; reason: string }> }
    assert.equal(forged.selections[0].status, 'rejected')
    assert.match(forged.selections[0].reason, /not a valid Pexels download variant/)
    assert.equal(network.mediaRequests().length, 0)
  })

  it('serializes concurrent selections and enforces per-beat caps and duplicate checks', async () => {
    const clips = [video(101, 'city'), video(102, 'street'), video(103, 'traffic')]
    network.pexels.videos('city sunrise', clips)
    const runner = await ready()
    await runner.executeMcpTool('search_pexels_videos', {
      beatId: 'beat_1',
      query: 'city sunrise'
    })
    const hold = holdMediaDownload()
    try {
      const results = (await Promise.all([
        runner.executeMcpTool('select_assets_for_download', selection('beat_1', 101)),
        runner.executeMcpTool('select_assets_for_download', selection('beat_1', 102)),
        runner.executeMcpTool('select_assets_for_download', selection('beat_2', 101)),
        runner.executeMcpTool('select_assets_for_download', selection('beat_2', 103))
      ])) as Array<{ selections: Array<{ status: string }> }>
      assert.deepEqual(
        results.map((result) => result.selections[0].status),
        ['queued', 'rejected', 'rejected', 'queued']
      )
      assert.deepEqual(
        runner.getSnapshot().beats.map((beat) => beat.assets.length),
        [1, 1]
      )
    } finally {
      hold.release()
    }
    assert.equal((await runner.finishMcpJob()).downloadedCount, 2)
    assert.equal(network.mediaRequests().length, 2)
  })

  it('holds downloads for desktop approval and refuses approval through resume', async () => {
    await SettingsStore.updateSettings({ requireApprovalBeforeDownload: true })
    network.pexels.videos('city sunrise', [video(101, 'city')])
    const runner = await start({ script: 'A city wakes up.', maxTotalDownloads: 1 })
    await runner.submitMcpBeatPlan([PLAN[0]])
    await runner.executeMcpTool('search_pexels_videos', { beatId: 'beat_1', query: 'city sunrise' })
    await runner.executeMcpTool('select_assets_for_download', selection('beat_1', 101))
    assert.equal(runner.getSnapshot().statusReason, 'awaiting_approval')
    assert.equal(network.mediaRequests().length, 0)
    await assert.rejects(runner.resume(), /Review pending assets/)
    await assert.rejects(runner.resume({ useCurrentSettings: true }), /saved settings/)
    await assert.rejects(runner.finishMcpJob(), /paused/)
    await runner.approveAndResume({ approvedAssetIds: ['video_101'] })
    assert.equal(runner.getSnapshot().status, 'running', 'approval returns control to MCP client')
    assert.equal((await runner.finishMcpJob()).status, 'completed')
    assert.equal(network.mediaRequests().length, 1)
  })

  it('aborts a paused search and rejects commands already queued behind it', async () => {
    network.pexels.videos('city sunrise', [video(101, 'city')])
    const runner = await ready()
    const hold = holdVideoSearch('city sunrise')
    const search = runner.executeMcpTool('search_pexels_videos', {
      beatId: 'beat_1',
      query: 'city sunrise'
    })
    await hold.reached
    const queued = runner
      .executeMcpTool('select_assets_for_download', selection('beat_1', 101))
      .then(
        () => null,
        (error: Error) => error
      )
    await runner.pause()
    hold.release()
    assert.equal(((await search) as { interrupted?: boolean }).interrupted, true)
    assert.match((await queued)?.message ?? '', /paused/)
    assert.equal(network.mediaRequests().length, 0)
    await runner.resume()
    const unknown = (await runner.executeMcpTool(
      'select_assets_for_download',
      selection('beat_1', 101)
    )) as { selections: Array<{ status: string }> }
    assert.equal(unknown.selections[0].status, 'rejected', 'aborted searches offer no candidates')
  })

  it('keeps desktop rejections when the MCP client requests a replacement', async () => {
    await SettingsStore.updateSettings({ requireApprovalBeforeDownload: true })
    network.pexels.videos('city sunrise', [video(101, 'city'), video(102, 'street')])
    const runner = await start({ script: 'A city wakes up.', maxTotalDownloads: 1 })
    await runner.submitMcpBeatPlan([PLAN[0]])
    await runner.executeMcpTool('search_pexels_videos', { beatId: 'beat_1', query: 'city sunrise' })
    await runner.executeMcpTool('select_assets_for_download', selection('beat_1', 101))
    await runner.approveAndResume({ approvedAssetIds: [], rejectedAssetIds: ['video_101'] })
    assert.equal(runner.getSnapshot().status, 'running')
    assert.equal(runner.getSnapshot().failedCount, 1)
    assert.equal(runner.getSnapshot().beats[0].status, 'failed')
    const rejected = (await runner.executeMcpTool(
      'select_assets_for_download',
      selection('beat_1', 101)
    )) as { selections: Array<{ status: string; reason: string }> }
    assert.equal(rejected.selections[0].status, 'rejected')
    assert.match(rejected.selections[0].reason, /user rejected/)
    assert.equal(network.mediaRequests().length, 0)
    await runner.executeMcpTool('select_assets_for_download', selection('beat_1', 102))
    assert.equal(runner.getSnapshot().statusReason, 'awaiting_approval')
    await runner.approveAndResume({ approvedAssetIds: ['video_102'] })
    assert.equal((await runner.finishMcpJob()).status, 'completed')
    assert.equal(network.mediaRequests().length, 1)
  })

  it('restores cached candidates after a restart and resumes without an AI key', async () => {
    const clip = video(101, 'city')
    network.pexels.videos('city sunrise', [clip])
    const first = await start({ script: 'A city wakes up.', maxTotalDownloads: 1 })
    await first.submitMcpBeatPlan([PLAN[0]])
    await first.executeMcpTool('search_pexels_videos', { beatId: 'beat_1', query: 'city sunrise' })
    await first.pause()
    const restored = new AgentRunner(first.getSnapshot().jobId, {
      ...INPUT,
      script: 'A city wakes up.',
      maxTotalDownloads: 1
    })
    runners.push(restored)
    await restored.initializeAndLoadState()
    assert.equal(restored.getSnapshot().runtimeSettings?.engine, 'mcp')
    await restored.resume()
    await restored.executeMcpTool('select_assets_for_download', {
      selections: [
        {
          beatId: 'beat_1',
          assetType: 'video',
          pexelsId: 101,
          variantUrl: videoFileUrl(clip, 'hd')
        }
      ]
    })
    assert.equal((await restored.finishMcpJob()).status, 'completed')
    assert.equal(network.pexelsRequests().length, 1, 'persisted candidates need no new search')
  })

  it('keeps MCP identity and approval settings when agent-state is missing', async () => {
    await SettingsStore.updateSettings({ requireApprovalBeforeDownload: true })
    const first = await ready()
    await first.pause()
    const { summary } = await readJob(first.getSnapshot().jobId)
    await rm(join(summary.downloadPath, 'agent-state.json'))
    await SettingsStore.updateSettings({
      agentEngine: 'pipeline',
      requireApprovalBeforeDownload: false
    })
    const restored = new AgentRunner(first.getSnapshot().jobId, { ...INPUT })
    runners.push(restored)
    await restored.initializeAndLoadState()
    assert.equal(restored.getSnapshot().runtimeSettings?.engine, 'mcp')
    assert.equal(restored.getSnapshot().runtimeSettings?.requireApproval, true)
    await restored.resume()
    const manifest = JSON.parse(await readFile(join(summary.downloadPath, 'manifest.json'), 'utf8'))
    assert.equal(manifest.settingsSnapshot.engine, 'mcp')
    assert.equal(network.requests.length, 0)
  })

  it('refuses to finish incomplete jobs and leaves them available for more searches', async () => {
    const runner = await start()
    await assert.rejects(runner.finishMcpJob(), /without a beat plan/)
    await runner.submitMcpBeatPlan(PLAN)
    await assert.rejects(runner.finishMcpJob(), /still need assets/)
    assert.equal(runner.getSnapshot().status, 'running')
    assert.equal(AgentRunner.getActive(runner.getSnapshot().jobId), runner)
  })

  it('retries a failed terminal save durably and coalesces concurrent flushes', async (t) => {
    network.pexels.videos('city sunrise', [video(101, 'city')])
    const runner = await start({ script: 'A city wakes up.', maxTotalDownloads: 1 })
    const jobId = runner.getSnapshot().jobId
    await assert.rejects(runner.retryMcpTerminalPersistence(), /Only a completed/)
    await runner.submitMcpBeatPlan([PLAN[0]])
    await runner.executeMcpTool('search_pexels_videos', { beatId: 'beat_1', query: 'city sunrise' })
    await runner.executeMcpTool('select_assets_for_download', selection('beat_1', 101))
    let release = (): void => {}
    let enter = (): void => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    const entered = new Promise<void>((resolve) => (enter = resolve))
    const save = ProjectStore.save.bind(ProjectStore)
    let terminalWrites = 0
    t.mock.method(
      ProjectStore,
      'save',
      async (project: Parameters<typeof ProjectStore.save>[0]): Promise<void> => {
        if (project.jobId === jobId && project.status === 'completed') {
          terminalWrites++
          if (terminalWrites <= 2) throw new Error('Terminal save is temporarily unavailable')
          enter()
          await gate
        }
        await save(project)
      }
    )
    await assert.rejects(runner.finishMcpJob(), /Terminal save is temporarily unavailable/)
    assert.equal(runner.getSnapshot().status, 'completed')
    assert.equal((await ProjectStore.get(jobId))?.status, 'running')
    assert.equal(AgentRunner.getActive(jobId), runner)
    await assert.rejects(
      runner.retryMcpTerminalPersistence(),
      /Terminal save is temporarily unavailable/
    )
    assert.equal(AgentRunner.getActive(jobId), runner, 'failed retries keep ownership')
    const first = runner.retryMcpTerminalPersistence()
    const second = runner.retryMcpTerminalPersistence()
    await entered
    let stopped = false
    const shutdown = runner.waitForShutdown().then(() => {
      stopped = true
    })
    try {
      await new Promise((resolve) => setImmediate(resolve))
      assert.equal(stopped, false, 'deleting or shutting down waits for the terminal flush')
      assert.equal(AgentRunner.getActive(jobId), runner)
      assert.equal(terminalWrites, 3, 'concurrent retries share one persistence operation')
    } finally {
      release()
    }
    assert.equal((await first).status, 'completed')
    assert.equal((await second).status, 'completed')
    await shutdown
    assert.equal((await ProjectStore.get(jobId))?.status, 'completed')
    assert.equal(AgentRunner.getActive(jobId), undefined)
  })

  it('requires only the Pexels key for searches and can retry after it is added', async () => {
    const runner = await ready()
    await SecureSecrets.setSecret('pexelsKey', '')
    await assert.rejects(
      runner.executeMcpTool('search_pexels_videos', { beatId: 'beat_1', query: 'city sunrise' }),
      /Pexels API key is missing/i
    )
    assert.equal(runner.getSnapshot().status, 'running')
    assert.equal(network.requests.length, 0)
    await SecureSecrets.setSecret('pexelsKey', 'pexels-test')
    await runner.executeMcpTool('search_pexels_videos', { beatId: 'beat_1', query: 'city sunrise' })
    assert.equal(network.pexelsRequests().length, 1)
  })

  it('persists cancellation during a search and cannot be revived by late commands', async () => {
    const runner = await ready()
    const hold = holdVideoSearch('city sunrise')
    const search = runner.executeMcpTool('search_pexels_videos', {
      beatId: 'beat_1',
      query: 'city sunrise'
    })
    await hold.reached
    await runner.cancel()
    hold.release()
    await search
    await runner.waitForShutdown()
    assert.equal((await readJob(runner.getSnapshot().jobId)).summary.status, 'cancelled')
    assert.equal(AgentRunner.getActive(runner.getSnapshot().jobId), undefined)
    await assert.rejects(runner.submitMcpBeatPlan(PLAN), /cancelled/)
    assert.equal(runner.getSnapshot().status, 'cancelled')
  })

  it('pauses on exhausted Pexels quota and resumes under MCP control', async () => {
    const runner = await ready()
    network.pexels.quota.remaining = 0
    network.pexels.failNextSearch(429)
    const result = (await runner.executeMcpTool('search_pexels_videos', {
      beatId: 'beat_1',
      query: 'city sunrise'
    })) as { error?: string }
    assert.match(result.error ?? '', /quota/i)
    assert.equal(runner.getSnapshot().statusReason, 'pexels_quota')
    resetNetworkState()
    network.pexels.quota.remaining = 100
    await runner.resume()
    assert.equal(runner.getSnapshot().runtimeSettings?.engine, 'mcp')
    await runner.executeMcpTool('search_pexels_videos', { beatId: 'beat_1', query: 'city sunrise' })
    assert.equal(network.pexelsRequests().length, 2)
  })
})
