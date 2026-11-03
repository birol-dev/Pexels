import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { request } from 'node:http'
import { afterEach, before, beforeEach, describe, it } from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { registerJobsHandlers } from '../src/main/ipc/jobs.ipc.ts'
import { AgentRunner, type JobSnapshot } from '../src/main/services/agent/agent-runner.ts'
import { McpHttpServer } from '../src/main/services/mcp/mcp-server.ts'
import { SecureSecrets } from '../src/main/services/storage/secure-secrets.ts'
import { BrowserWindow, invokeIpc } from './support/electron-stub.mjs'
import { installFakeNetwork, type FakeNetwork } from './support/fake-network.ts'
import { photo, video } from './support/pexels-fixtures.ts'
import { applyTestSettings, nextJobId, readJob, resetNetworkState } from './support/run-job.ts'

const realFetch = globalThis.fetch
const TOKEN = 'stockfinder-local-test-token'
const AUTH = { Authorization: `Bearer ${TOKEN}` }

interface JobEnvelope {
  job: JobSnapshot
  sentences: Array<{ number: number; text: string }>
}

/** Raw HTTP lets the tests send an untrusted Host header without a browser rewriting it. */
function httpRequest(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {}
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: options.method ?? 'POST',
        headers: {
          Accept: 'application/json, text/event-stream',
          ...options.headers,
          'Content-Type': 'application/json'
        }
      },
      (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => (body += chunk))
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
        res.on('error', reject)
      }
    )
    req.on('error', reject)
    req.end(options.body ?? '{}')
  })
}

describe('MCP: local HTTP client integration', { timeout: 30_000 }, () => {
  let network: FakeNetwork
  let server: McpHttpServer
  let client: Client
  let url: string
  const jobIds: string[] = []

  async function connect(): Promise<void> {
    client = new Client({ name: 'stockfinder-integration-test', version: '1.0.0' })
    await client.connect(
      new StreamableHTTPClientTransport(new URL(url), {
        fetch: realFetch,
        requestInit: { headers: AUTH }
      })
    )
  }

  async function result(name: string, args: Record<string, unknown> = {}): Promise<CallToolResult> {
    return (await client.callTool({ name, arguments: args })) as CallToolResult
  }

  async function call<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const answer = await result(name, args)
    assert.ok(!answer.isError, JSON.stringify(answer.content))
    const content = answer.content.find((item) => item.type === 'text')
    assert.ok(content?.type === 'text', `${name} has a readable result`)
    return JSON.parse(content.text) as T
  }

  async function create(input: Record<string, unknown> = {}): Promise<JobEnvelope> {
    const envelope = await call<JobEnvelope>('stockfinder_create_job', {
      title: 'MCP integration pack',
      script: 'A busy city street. A quiet desk.',
      ...input
    })
    jobIds.push(envelope.job.jobId)
    return envelope
  }

  before(() => registerJobsHandlers())

  beforeEach(async () => {
    resetNetworkState()
    await applyTestSettings({ agentEngine: 'loop', mcpEnabled: false })
    for (const key of ['openaiKey', 'openrouterKey', 'geminiKey']) {
      await SecureSecrets.setSecret(key, '')
    }
    network = installFakeNetwork()
    server = new McpHttpServer(TOKEN, 0)
    url = await server.start()
    await connect()
  })

  afterEach(async () => {
    try {
      await client?.close()
      for (const jobId of jobIds.splice(0)) {
        const runner = AgentRunner.getActive(jobId)
        if (runner) {
          await runner.cancel()
          await runner.waitForShutdown()
        }
      }
      await server?.stop()
      assert.equal(network.llmRequests().length, 0, 'MCP never calls an AI API')
      assert.deepEqual(network.problems, [])
    } finally {
      network.restore()
    }
  })

  it('initializes with the official client, lists tools and recovers after invalid calls', async () => {
    const { tools } = await client.listTools()
    const names = tools.map((tool) => tool.name)
    for (const name of [
      'stockfinder_status',
      'stockfinder_list_jobs',
      'stockfinder_get_job',
      'stockfinder_create_job',
      'stockfinder_submit_script',
      'stockfinder_submit_beat_plan',
      'stockfinder_search_pexels_photos',
      'stockfinder_search_pexels_videos',
      'stockfinder_select_assets_for_download',
      'stockfinder_download_selected_assets',
      'stockfinder_finish_job',
      'stockfinder_pause_job',
      'stockfinder_resume_job',
      'stockfinder_cancel_job'
    ]) {
      assert.ok(names.includes(name), `${name} is discoverable`)
    }
    assert.ok(
      names.every((name) => !name.includes('approve')),
      'approval stays in the desktop app'
    )

    const invalid = await result('stockfinder_get_job', { jobId: '../outside' })
    assert.equal(invalid.isError, true)
    const status = await call<Record<string, unknown>>('stockfinder_status')
    assert.equal(status.hasPexelsKey, true)
    const encoded = JSON.stringify(status)
    assert.ok(!encoded.includes(TOKEN), 'the server does not publish its bearer token')
    assert.ok(!encoded.includes('pexels-test'), 'the Pexels key never leaves the app')
  })

  it('rejects missing credentials, browser origins, rebound hosts and unsupported requests', async () => {
    for (const headers of [{}, { Authorization: 'Bearer incorrect' }]) {
      assert.equal((await httpRequest(url, { headers })).status, 401)
    }
    for (const headers of [
      { ...AUTH, Origin: 'https://attacker.example' },
      { ...AUTH, Origin: 'null' },
      { ...AUTH, Host: 'attacker.example' }
    ]) {
      assert.equal((await httpRequest(url, { headers })).status, 403)
    }
    for (const method of ['GET', 'DELETE', 'OPTIONS', 'PUT']) {
      assert.equal((await httpRequest(url, { method, headers: AUTH })).status, 405)
    }
    assert.equal((await httpRequest(`${url}/other`, { headers: AUTH })).status, 404)
    assert.equal((await httpRequest(url, { headers: AUTH, body: '{' })).status, 400)
    assert.equal(
      (
        await httpRequest(url, {
          headers: AUTH,
          body: JSON.stringify({ padding: 'x'.repeat(1024 * 1024) })
        })
      ).status,
      413,
      'oversized requests are refused before tools execute'
    )
    assert.equal((await call<Record<string, unknown>>('stockfinder_status')).hasPexelsKey, true)
  })

  it('creates a visible pack, plans, searches, downloads and persists without an AI key', async (t) => {
    const broadcasts: Array<{ channel: string; event: Record<string, unknown> }> = []
    const originalWindows = BrowserWindow.getAllWindows
    BrowserWindow.getAllWindows = () => [
      {
        webContents: {
          send: (channel: string, event: Record<string, unknown>): void => {
            broadcasts.push({ channel, event })
          }
        }
      }
    ]
    t.after(() => {
      BrowserWindow.getAllWindows = originalWindows
    })
    network.pexels.videos('city street', [video(101, 'city-street')])
    network.pexels.photos('quiet desk', [photo(201, 'A quiet desk')])

    const created = await create({ maxTotalDownloads: 2 })
    const jobId = created.job.jobId
    assert.equal(created.job.runtimeSettings?.engine, 'mcp', 'client creates MCP jobs in API mode')
    assert.deepEqual(created.sentences, [
      { number: 1, text: 'A busy city street.' },
      { number: 2, text: 'A quiet desk.' }
    ])
    assert.ok(
      broadcasts.some(({ channel, event }) => channel === 'jobs:event' && event.type === 'created'),
      'external jobs notify the desktop even when no pack is open'
    )

    await call('stockfinder_submit_beat_plan', {
      jobId,
      beats: [
        {
          lastSentence: 1,
          visualPrompt: 'Busy city street',
          queries: ['city street'],
          assetType: 'video'
        },
        { lastSentence: 2, visualPrompt: 'Quiet desk', queries: ['quiet desk'], assetType: 'photo' }
      ]
    })
    const clips = await call<{ results: Array<{ pexelsId: number }> }>(
      'stockfinder_search_pexels_videos',
      {
        jobId,
        beatId: 'beat_1',
        query: 'city street'
      }
    )
    const photos = await call<{ results: Array<{ pexelsId: number }> }>(
      'stockfinder_search_pexels_photos',
      {
        jobId,
        beatId: 'beat_2',
        query: 'quiet desk'
      }
    )
    assert.equal(clips.results[0].pexelsId, 101, 'full search results reach the MCP client')
    assert.equal(photos.results[0].pexelsId, 201)
    await call('stockfinder_select_assets_for_download', {
      jobId,
      selections: [
        { beatId: 'beat_1', assetType: 'video', pexelsId: 101 },
        { beatId: 'beat_2', assetType: 'photo', pexelsId: 201 }
      ]
    })
    await call('stockfinder_finish_job', { jobId, summary: 'Found city and desk footage.' })

    // Reconnecting must not lose a job: its lifetime belongs to StockFinder, not the HTTP client.
    await client.close()
    await connect()
    const loaded = await call<JobEnvelope>('stockfinder_get_job', { jobId })
    assert.equal(loaded.job.status, 'completed')
    assert.equal(loaded.job.downloadedCount, 2)
    const saved = await readJob(jobId)
    assert.equal(saved.summary.status, 'completed')
    assert.ok(saved.manifest.attribution)
    for (const asset of saved.manifest.beats.flatMap((beat) => beat.assets)) {
      assert.ok(asset.filePath && existsSync(asset.filePath), `${asset.id} exists on disk`)
    }
    assert.equal(network.mediaRequests().length, 2)
    const manifest = JSON.stringify(saved.manifest)
    assert.ok(!manifest.includes(TOKEN))
    assert.ok(!manifest.includes('pexels-test'))
  })

  it('hands an idea to the client, saves its script, and completes a keyless pack', async () => {
    network.pexels.videos('city street', [video(101, 'city-street')])
    const created = (await create({
      script: '',
      idea: 'A peaceful morning in the city',
      targetDuration: '30 seconds',
      tone: 'warm',
      maxTotalDownloads: 1
    })) as JobEnvelope & {
      waitingOn: string
      input: { idea: string; tone: string; targetDuration: string }
    }
    assert.equal(created.job.script, '')
    assert.equal(created.waitingOn, 'script')
    assert.deepEqual(created.sentences, [])
    assert.equal(created.input.tone, 'warm')
    assert.equal(created.input.targetDuration, '30 seconds')
    const jobId = created.job.jobId
    const script = 'The city wakes up. People open their shops.'
    const submitted = await call<JobEnvelope & { waitingOn: string }>('stockfinder_submit_script', {
      jobId,
      script
    })
    assert.equal(submitted.waitingOn, 'beat_plan')
    assert.equal(submitted.sentences.length, 2)
    await call('stockfinder_submit_beat_plan', {
      jobId,
      beats: [
        {
          lastSentence: 2,
          visualPrompt: 'Morning city street',
          queries: ['city street'],
          assetType: 'video'
        }
      ]
    })
    assert.equal(
      (await result('stockfinder_submit_script', { jobId, script: 'Overwrite the script.' }))
        .isError,
      true
    )
    await call('stockfinder_search_pexels_videos', {
      jobId,
      beatId: 'beat_1',
      query: 'city street'
    })
    await call('stockfinder_select_assets_for_download', {
      jobId,
      selections: [{ beatId: 'beat_1', assetType: 'video', pexelsId: 101 }]
    })
    await call('stockfinder_finish_job', { jobId })
    const saved = await readJob(jobId)
    assert.equal(saved.manifest.script, script)
    assert.equal(saved.manifest.originalIdea, created.input.idea)
    assert.equal(saved.summary.status, 'completed')
  })

  it('validates script and idea input before registering an empty pack', async () => {
    const before = await call<{ jobs: unknown[] }>('stockfinder_list_jobs')
    assert.equal(
      (await result('stockfinder_create_job', { title: 'Empty pack', script: '  ', idea: '' }))
        .isError,
      true
    )
    const after = await call<{ jobs: unknown[] }>('stockfinder_list_jobs')
    assert.equal(after.jobs.length, before.jobs.length)
    const { job } = await create({ script: '', idea: 'A forest journey' })
    assert.equal(
      (await result('stockfinder_submit_script', { jobId: job.jobId, script: '' })).isError,
      true
    )
    assert.equal(
      (await call<JobEnvelope>('stockfinder_get_job', { jobId: job.jobId })).job.script,
      ''
    )
  })

  it('requires desktop approval and cannot approve by resuming through MCP', async () => {
    await applyTestSettings({ agentEngine: 'loop', requireApprovalBeforeDownload: true })
    await SecureSecrets.setSecret('openaiKey', '')
    network.pexels.videos('city street', [video(101, 'city-street')])
    const { job } = await create({ script: 'A city street.' })
    await call('stockfinder_submit_beat_plan', {
      jobId: job.jobId,
      beats: [
        {
          lastSentence: 1,
          visualPrompt: 'City street',
          queries: ['city street'],
          assetType: 'video'
        }
      ]
    })
    await call('stockfinder_search_pexels_videos', {
      jobId: job.jobId,
      beatId: 'beat_1',
      query: 'city street'
    })
    await call('stockfinder_select_assets_for_download', {
      jobId: job.jobId,
      selections: [{ beatId: 'beat_1', assetType: 'video', pexelsId: 101 }]
    })
    assert.equal(network.mediaRequests().length, 0)
    const paused = await call<JobEnvelope>('stockfinder_get_job', { jobId: job.jobId })
    assert.equal(paused.job.status, 'paused')
    assert.equal(paused.job.statusReason, 'awaiting_approval')
    const bypass = await result('stockfinder_resume_job', { jobId: job.jobId })
    assert.equal(bypass.isError, true)
    assert.equal(network.mediaRequests().length, 0)

    await invokeIpc('jobs:approveAndResume', job.jobId, {})
    await call('stockfinder_finish_job', { jobId: job.jobId })
    assert.equal((await readJob(job.jobId)).summary.status, 'completed')
    assert.equal(network.mediaRequests().length, 1)
  })

  it('refuses to control API jobs and does not mutate them', async () => {
    const jobId = nextJobId()
    jobIds.push(jobId)
    const runner = new AgentRunner(jobId, {
      title: 'Existing API pack',
      script: 'A city street.',
      platform: 'YouTube',
      style: 'cinematic',
      mix: 'videos + photos',
      maxAssetsPerBeat: 1,
      maxTotalDownloads: 2
    })
    await runner.ensureRegistered()
    const before = runner.getSnapshot()
    for (const name of [
      'stockfinder_pause_job',
      'stockfinder_resume_job',
      'stockfinder_cancel_job'
    ]) {
      assert.equal((await result(name, { jobId })).isError, true, name)
      assert.equal(runner.getSnapshot().status, before.status)
      assert.equal(runner.getSnapshot().runtimeSettings?.engine, 'loop')
    }
    const invalid = await result('stockfinder_submit_beat_plan', {
      jobId,
      beats: [
        {
          lastSentence: 1,
          visualPrompt: 'City street',
          queries: ['city street'],
          assetType: 'video'
        }
      ]
    })
    assert.equal(invalid.isError, true)
    assert.deepEqual(runner.getSnapshot().beats, [])
    assert.equal(network.requests.length, 0)
  })
})
