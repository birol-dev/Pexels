import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, before, beforeEach, describe, it } from 'node:test'
import { registerJobsHandlers } from '../../src/main/ipc/jobs.ipc.ts'
import { invokeIpc } from '../support/electron-stub.mjs'
import {
  installFakeNetwork,
  type FakeNetwork,
  type LlmRequestBody
} from '../support/fake-network.ts'
import { video, videoFileUrl } from '../support/pexels-fixtures.ts'
import {
  applyTestSettings,
  readJob,
  resetNetworkState,
  runJob,
  searchVideos,
  select
} from '../support/run-job.ts'
import { ONE_BEAT_SCRIPT, scriptOneBeatJob } from '../support/scenarios.ts'
import { emptyBeat, writeSavedJob } from '../support/saved-job.ts'

const systemPromptOf = (request: LlmRequestBody): string =>
  request.messages.find((message) => message.role === 'system')?.content || ''

describe('runner: what reaches the prompts', () => {
  let network: FakeNetwork

  before(() => {
    registerJobsHandlers()
  })

  beforeEach(() => {
    resetNetworkState()
    network = installFakeNetwork()
  })

  afterEach(() => {
    network.restore()
  })

  /** An idea job: the expansion, then the one-beat job. */
  function scriptIdeaJob(): void {
    network.llm.tools([
      {
        name: 'submit_expanded_script',
        args: { title: 'City day', script: ONE_BEAT_SCRIPT, visualConcept: 'Busy streets at dusk.' }
      }
    ])
    scriptOneBeatJob(network)
  }

  it('gives the visual style and the visual direction to the beat split and to StockScout', async () => {
    scriptIdeaJob()

    const run = await runJob({
      inputMode: 'idea',
      idea: 'A day in a busy city',
      script: '',
      style: 'documentary'
    })

    assert.deepEqual(network.problems, [])
    assert.equal(run.summary.status, 'completed')
    const [expansion, split, firstTurn] = network.llmRequests()
    assert.doesNotMatch(systemPromptOf(expansion), /Visual direction for this video/)
    for (const request of [split, firstTurn]) {
      const system = systemPromptOf(request)
      assert.match(system, /Visual style: documentary\. Favor real places and people at work/)
      assert.match(system, /Visual direction for this video: Busy streets at dusk\./)
    }
  })

  it('leaves the visual direction out when the job has none', async () => {
    scriptOneBeatJob(network)

    await runJob({ script: ONE_BEAT_SCRIPT, style: 'my own look' })

    const [split, firstTurn] = network.llmRequests()
    for (const request of [split, firstTurn]) {
      const system = systemPromptOf(request)
      assert.match(system, /Visual style: my own look\. The user describes the style as/)
      assert.doesNotMatch(system, /Visual direction for this video/)
    }
  })

  it('tells the idea step of a job that the people setting is on', async () => {
    scriptIdeaJob()

    await runJob(
      { inputMode: 'idea', idea: 'A day in a busy city', script: '' },
      { avoidPeopleAndFaces: true }
    )

    assert.deepEqual(network.problems, [])
    assert.match(systemPromptOf(network.llmRequests()[0]), /The creator wants no people on screen/)
  })

  it('does not tell it when the setting is off', async () => {
    scriptIdeaJob()

    await runJob(
      { inputMode: 'idea', idea: 'A day in a busy city', script: '' },
      { avoidPeopleAndFaces: false }
    )

    assert.deepEqual(network.problems, [])
    assert.doesNotMatch(systemPromptOf(network.llmRequests()[0]), /no people on screen/)
  })

  it('tells the idea step about the people setting when the form generates a script', async () => {
    await applyTestSettings({ avoidPeopleAndFaces: true })
    network.llm.tools([
      {
        name: 'submit_expanded_script',
        args: { script: ONE_BEAT_SCRIPT, visualConcept: 'Busy streets.', keyThemes: ['city'] }
      }
    ])

    const result = (await invokeIpc('jobs:expandIdea', { idea: 'A day in a busy city' })) as Record<
      string,
      unknown
    >

    assert.deepEqual(network.problems, [])
    assert.match(systemPromptOf(network.llmRequests()[0]), /The creator wants no people on screen/)
    assert.equal(result.visualConcept, 'Busy streets.')
    assert.equal('keyThemes' in result, false)
  })
})

describe('runner: saved jobs from before these fields changed', () => {
  let network: FakeNetwork

  before(() => {
    registerJobsHandlers()
  })

  beforeEach(() => {
    resetNetworkState()
    network = installFakeNetwork()
  })

  afterEach(() => {
    network.restore()
  })

  it('loads a manifest that still carries keyThemes, and keeps going', async () => {
    const clip = video(101, 'city-street')
    network.pexels.videos('city street', [clip])
    network.llm.tools([searchVideos('beat_1', 'city street')]).tools([
      select([
        {
          beatId: 'beat_1',
          assetType: 'video',
          pexelsId: 101,
          variantUrl: videoFileUrl(clip, 'hd')
        }
      ])
    ])
    await applyTestSettings()
    const saved = await writeSavedJob({ status: 'paused', beats: [emptyBeat('beat_1')] })
    const manifestPath = join(saved.projectDir, 'manifest.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    manifest.visualConcept = 'Busy streets at dusk.'
    manifest.keyThemes = ['city', 'traffic']
    await writeFile(manifestPath, JSON.stringify(manifest))

    await invokeIpc('jobs:resume', saved.jobId)

    assert.deepEqual(network.problems, [])
    const job = await readJob(saved.jobId)
    assert.equal(job.summary.status, 'completed')
    assert.equal(job.manifest.visualConcept, 'Busy streets at dusk.')
    const [firstTurn] = network.llmRequests()
    assert.match(
      systemPromptOf(firstTurn),
      /Visual direction for this video: Busy streets at dusk\./
    )
  })
})
