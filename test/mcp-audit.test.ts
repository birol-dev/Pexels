import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { AgentRunner, type JobSnapshot } from '../src/main/services/agent/agent-runner.ts'
import { McpHttpServer } from '../src/main/services/mcp/mcp-server.ts'
import { createMcpProtocolServer } from '../src/main/services/mcp/mcp-tools.ts'
import { SecureSecrets } from '../src/main/services/storage/secure-secrets.ts'
import { ProjectStore } from '../src/main/services/storage/project-store.ts'
import { installFakeNetwork, type FakeNetwork } from './support/fake-network.ts'
import { holdMediaDownload, until } from './support/gates.ts'
import { photo } from './support/pexels-fixtures.ts'
import { applyTestSettings, resetNetworkState } from './support/run-job.ts'

const realFetch = globalThis.fetch
const TOKEN = 'mcp-audit-local-token'

describe('MCP audit regressions', { timeout: 30_000 }, () => {
  let network: FakeNetwork
  let protocol: McpServer
  let client: Client
  const jobIds: string[] = []

  async function result(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
    return (await client.callTool({ name, arguments: args })) as CallToolResult
  }

  function data<T>(answer: CallToolResult): T {
    const content = answer.content.find((item) => item.type === 'text')
    assert.ok(content?.type === 'text')
    return JSON.parse(content.text) as T
  }

  async function call<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const answer = await result(name, args)
    assert.ok(!answer.isError, JSON.stringify(answer.content))
    return data<T>(answer)
  }

  async function ready(): Promise<string> {
    const created = await call<{ job: JobSnapshot }>('stockfinder_create_job', {
      title: 'Audit pack',
      script: 'The forest is quiet.',
      mix: 'photos only',
      maxAssetsPerBeat: 2,
      maxTotalDownloads: 2
    })
    const jobId = created.job.jobId
    jobIds.push(jobId)
    await call('stockfinder_submit_beat_plan', {
      jobId,
      beats: [
        {
          lastSentence: 1,
          visualPrompt: 'Forest trees',
          queries: ['forest trees'],
          assetType: 'photo'
        }
      ]
    })
    network.pexels.photos('forest trees', [photo(201, 'Forest trees'), photo(202, 'Forest path')])
    await call('stockfinder_search_pexels_photos', {
      jobId,
      beatId: 'beat_1',
      query: 'forest trees'
    })
    return jobId
  }

  async function select(jobId: string, ...ids: number[]): Promise<CallToolResult> {
    return result('stockfinder_select_assets_for_download', {
      jobId,
      selections: ids.map((pexelsId) => ({ beatId: 'beat_1', assetType: 'photo', pexelsId }))
    })
  }

  beforeEach(async () => {
    resetNetworkState()
    await applyTestSettings({ agentEngine: 'loop', requireApprovalBeforeDownload: false })
    for (const key of ['openaiKey', 'openrouterKey', 'geminiKey']) {
      await SecureSecrets.setSecret(key, '')
    }
    network = installFakeNetwork()
    protocol = createMcpProtocolServer()
    client = new Client({ name: 'stockfinder-audit', version: '1.0.0' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await protocol.connect(serverTransport)
    await client.connect(clientTransport)
  })

  afterEach(async () => {
    try {
      await client.close()
      await protocol.close()
      for (const jobId of jobIds.splice(0)) {
        const runner = AgentRunner.getActive(jobId)
        if (runner) {
          await runner.cancel()
          await runner.waitForShutdown()
        }
      }
      assert.equal(network.llmRequests().length, 0)
      assert.deepEqual(network.problems, [])
    } finally {
      network.restore()
    }
  })

  it('flags failed selections while preserving accepted assets and intentional rejections', async () => {
    const jobId = await ready()
    const partial = await select(jobId, 201, 999)
    const payload = data<{ selections: Array<{ pexelsId: number; status: string }> }>(partial)
    assert.equal(payload.selections.find((item) => item.pexelsId === 999)?.status, 'rejected')
    assert.equal(partial.isError, true, 'the client must see that a requested selection failed')
    assert.equal(AgentRunner.getActive(jobId)?.getSnapshot().beats[0].assets.length, 1)

    const rejectedByChoice = await result('stockfinder_select_assets_for_download', {
      jobId,
      selections: [],
      rejections: [{ beatId: 'beat_1', assetType: 'photo', pexelsId: 202, reason: 'Off topic' }]
    })
    assert.ok(
      !rejectedByChoice.isError,
      'recording an intentional rejection is a successful action'
    )
  })

  it('flags an unselected asset download as a tool error', async () => {
    const jobId = await ready()
    const answer = await result('stockfinder_download_selected_assets', {
      jobId,
      assetIds: [{ assetType: 'photo', pexelsId: 999 }]
    })
    assert.equal(data<{ failed: unknown[] }>(answer).failed.length, 1)
    assert.equal(answer.isError, true)
    assert.equal(network.mediaRequests().length, 0)
  })

  it('returns the completed pack when finish is retried after its first response was lost', async () => {
    const jobId = await ready()
    await select(jobId, 201, 202)
    const concurrent = await Promise.all([
      result('stockfinder_finish_job', { jobId }),
      result('stockfinder_finish_job', { jobId })
    ])
    for (const answer of concurrent) {
      assert.ok(!answer.isError, 'simultaneous finish calls converge on the completed pack')
      assert.equal(data<JobSnapshot>(answer).status, 'completed')
    }
    const retry = await result('stockfinder_finish_job', { jobId })
    assert.ok(!retry.isError, 'a completed finish is safe to retry')
    assert.equal(data<JobSnapshot>(retry).status, 'completed')
    assert.equal(network.mediaRequests().length, 2, 'retrying finish never downloads files twice')
  })

  it('returns the cancelled pack when cancel is retried after a lost response', async () => {
    const jobId = await ready()
    const concurrent = await Promise.all([
      result('stockfinder_cancel_job', { jobId }),
      result('stockfinder_cancel_job', { jobId })
    ])
    for (const answer of concurrent) {
      assert.ok(!answer.isError, 'simultaneous cancel calls converge on the cancelled pack')
      assert.equal(data<JobSnapshot>(answer).status, 'cancelled')
    }
    const retry = await result('stockfinder_cancel_job', { jobId })
    assert.ok(!retry.isError, 'a completed cancel is safe to retry')
    assert.equal(data<JobSnapshot>(retry).status, 'cancelled')
    assert.equal(AgentRunner.getActive(jobId), undefined)
    assert.equal(network.mediaRequests().length, 0)
  })

  it('persists a completed pack before treating a failed finish response as a successful retry', async (t) => {
    const jobId = await ready()
    await select(jobId, 201, 202)
    await until(() => AgentRunner.getActive(jobId)?.getSnapshot().downloadedCount === 2)
    const save = ProjectStore.save.bind(ProjectStore)
    let failNextCompletionWrite = true
    t.mock.method(ProjectStore, 'save', async (summary) => {
      if (summary.jobId === jobId && summary.status === 'completed' && failNextCompletionWrite) {
        failNextCompletionWrite = false
        throw new Error('Temporary failure writing completed job')
      }
      return save(summary)
    })
    const first = await result('stockfinder_finish_job', { jobId })
    assert.equal(first.isError, true)
    assert.equal((await ProjectStore.get(jobId))?.status, 'running')
    const retry = await result('stockfinder_finish_job', { jobId })
    assert.ok(!retry.isError)
    assert.equal(data<JobSnapshot>(retry).status, 'completed')
    assert.equal(
      (await ProjectStore.get(jobId))?.status,
      'completed',
      'retry cannot report success while its durable registry still says running'
    )
  })

  it('persists a cancelled pack before treating a failed cancel response as a successful retry', async (t) => {
    const jobId = await ready()
    const save = ProjectStore.save.bind(ProjectStore)
    let failNextCancellationWrite = true
    t.mock.method(ProjectStore, 'save', async (summary) => {
      if (summary.jobId === jobId && summary.status === 'cancelled' && failNextCancellationWrite) {
        failNextCancellationWrite = false
        throw new Error('Temporary failure writing cancelled job')
      }
      return save(summary)
    })
    const first = await result('stockfinder_cancel_job', { jobId })
    assert.equal(first.isError, true)
    assert.equal((await ProjectStore.get(jobId))?.status, 'running')
    const retry = await result('stockfinder_cancel_job', { jobId })
    assert.ok(!retry.isError)
    assert.equal(data<JobSnapshot>(retry).status, 'cancelled')
    assert.equal(
      (await ProjectStore.get(jobId))?.status,
      'cancelled',
      'retry cannot report success while its durable registry still says running'
    )
  })

  it('waits for queued downloads before finishing', async (t) => {
    const jobId = await ready()
    const hold = holdMediaDownload()
    t.after(() => hold.release())
    await select(jobId, 201, 202)
    await hold.reached
    let settled = false
    const finish = result('stockfinder_finish_job', { jobId }).then((answer) => {
      settled = true
      return answer
    })
    await until(
      () => AgentRunner.getActive(jobId)?.getSnapshot().currentStep === 'Finishing downloads'
    )
    assert.equal(settled, false)
    hold.release()
    const answer = await finish
    assert.ok(!answer.isError)
    assert.equal(data<JobSnapshot>(answer).downloadedCount, 2)
    assert.equal(data<JobSnapshot>(answer).status, 'completed')
  })

  it('keeps a failed download repairable and finishes after an explicit retry', async () => {
    const jobId = await ready()
    network.pexels.failNextMedia(400)
    await select(jobId, 201, 202)
    const failedFinish = await result('stockfinder_finish_job', { jobId })
    assert.equal(failedFinish.isError, true)
    const before = AgentRunner.getActive(jobId)?.getSnapshot()
    assert.equal(before?.status, 'running')
    assert.equal(before.failedCount, 1)
    await call('stockfinder_download_selected_assets', {
      jobId,
      assetIds: [{ assetType: 'photo', pexelsId: 201 }]
    })
    const repaired = await call<JobSnapshot>('stockfinder_finish_job', { jobId })
    assert.equal(repaired.status, 'completed')
    assert.equal(repaired.downloadedCount, 2)
    assert.equal(repaired.failedCount, 0)
  })

  it('uses protocol errors for invalid headers and accepts case-insensitive bearer schemes', async (t) => {
    const http = new McpHttpServer(TOKEN, 0)
    const url = await http.start()
    t.after(() => http.stop())
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' })
    const headers = {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json'
    }
    for (const [patch, status] of [
      [{ Accept: 'application/json' }, 406],
      [{ 'Content-Type': 'text/plain' }, 415],
      [{ 'MCP-Protocol-Version': '1900-01-01' }, 400]
    ] as const) {
      const response = await realFetch(url, {
        method: 'POST',
        headers: { ...headers, ...patch },
        body
      })
      assert.equal(response.status, status)
      await response.text()
    }
    const lowercase = await realFetch(url, {
      method: 'POST',
      headers: { ...headers, Authorization: `bearer ${TOKEN}` },
      body
    })
    assert.equal(lowercase.status, 200, 'HTTP authentication schemes are case-insensitive')
    await lowercase.text()
  })
})
