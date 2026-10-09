import assert from 'node:assert/strict'
import { afterEach, before, beforeEach, describe, it } from 'node:test'
import { registerJobsHandlers } from '../../src/main/ipc/jobs.ipc.ts'
import { AgentRunner } from '../../src/main/services/agent/agent-runner.ts'
import { SettingsStore } from '../../src/main/services/storage/settings-store.ts'
import {
  installFakeNetwork,
  type FakeNetwork,
  type LlmReply,
  type LlmRequestBody
} from '../support/fake-network.ts'
import { holdLlmRequest, until } from '../support/gates.ts'
import { offeredKeys } from '../support/pipeline-context.ts'
import {
  PIPELINE,
  beatsRanked,
  carriesImages,
  clipsOfBeat,
  footageForBeats,
  imagesOf,
  queryOfBeat,
  rankLastFirst,
  sentences,
  toolOffered,
  userContentOf
} from '../support/pipeline-job.ts'
import {
  applyTestSettings,
  nextJobId,
  resetNetworkState,
  runJob,
  submitBeats,
  withDeadline
} from '../support/run-job.ts'

const THUMBNAILS = { ...PIPELINE, rankWithThumbnails: true } as const

const scriptOf = (count: number): string => sentences(count).join(' ')

/** The preview image of a test clip, sized as the ranking attaches it. */
const previewOf = (id: number): string =>
  `https://images.pexels.com/videos/${id}/pictures/preview-0.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=280`

/** The candidate keys a ranking request states its thumbnails for, in the order stated. */
const thumbnailKeys = (request: LlmRequestBody): string[] =>
  [...userContentOf(request).matchAll(/^Thumbnail \d+ = (\S+)$/gm)].map((match) => match[1])

describe('runner: ranking with thumbnails', () => {
  let network: FakeNetwork

  before(() => {
    registerJobsHandlers()
  })

  beforeEach(() => {
    resetNetworkState()
    network = installFakeNetwork()
  })

  afterEach(async () => {
    network.restore()
    await SettingsStore.updateSettings({ agentEngine: 'loop', rankWithThumbnails: false })
  })

  const rankingRequests = (): LlmRequestBody[] =>
    network.llmRequests().filter((request) => toolOffered(request) === 'submit_rankings')

  describe('with the setting off, which is the default', () => {
    it('sends every request as plain text, and no image anywhere', async () => {
      footageForBeats(network, 2)
      network.llm.tools([submitBeats(sentences(2))]).dynamic(rankLastFirst())

      const run = await runJob({ script: scriptOf(2) }, PIPELINE)

      assert.deepEqual(network.problems, [])
      assert.equal(run.snapshot.status, 'completed')
      assert.equal(network.llmRequests().length, 2)
      for (const request of network.llmRequests()) {
        assert.ok(
          request.messages.every((message) => !Array.isArray(message.content)),
          'every message is a string'
        )
        assert.ok(!JSON.stringify(request).includes('image_url'))
      }
      assert.ok(!/thumbnail/i.test(userContentOf(rankingRequests()[0])))
      assert.ok(!run.snapshot.logs.some((entry) => /images/i.test(entry.message)))
    })
  })

  describe('with the setting on', () => {
    it('sends the ranking its thumbnails as low-detail images after the text, in the stated order', async () => {
      footageForBeats(network, 2)
      network.llm.tools([submitBeats(sentences(2))]).dynamic(rankLastFirst())

      const run = await runJob({ script: scriptOf(2) }, THUMBNAILS)

      assert.deepEqual(network.problems, [])
      assert.equal(run.snapshot.status, 'completed')
      assert.equal(run.snapshot.runtimeSettings?.rankWithThumbnails, true)

      const [planning] = network.llmRequests()
      assert.ok(planning.messages.every((message) => !Array.isArray(message.content)))

      const [ranking] = rankingRequests()
      const message = ranking.messages.findLast((m) => m.role === 'user')
      assert.ok(Array.isArray(message?.content))
      assert.equal(message.content[0].type, 'text', 'the text comes first')
      assert.ok(message.content.slice(1).every((part) => part.type === 'image_url'))

      const keys = thumbnailKeys(ranking)
      assert.deepEqual(keys, [
        ...[101, 102, 103, 104, 105, 106].map((id) => `video_${id}`),
        ...[201, 202, 203, 204, 205, 206].map((id) => `video_${id}`)
      ])
      assert.deepEqual(imagesOf(ranking), [
        ...[101, 102, 103, 104, 105, 106].map((id) => ({ url: previewOf(id), detail: 'low' })),
        ...[201, 202, 203, 204, 205, 206].map((id) => ({ url: previewOf(id), detail: 'low' }))
      ])
      // The model's choice is still the picks: the last clip of each beat.
      assert.deepEqual(
        run.manifest.beats.map((beat) => beat.assets.map((asset) => asset.id)),
        [['video_106'], ['video_206']]
      )
    })

    it('sends no more than the cap for a beat', async () => {
      network.pexels.videos(queryOfBeat(1), clipsOfBeat(1, 12))
      network.llm.tools([submitBeats(sentences(1))]).dynamic(rankLastFirst())

      const run = await runJob({ script: scriptOf(1) }, THUMBNAILS)

      assert.deepEqual(network.problems, [])
      assert.equal(run.snapshot.status, 'completed')
      const [ranking] = rankingRequests()
      const offered = [...offeredKeys(userContentOf(ranking)).get('beat_1')!]
      assert.equal(offered.length, 12, 'every candidate is listed')
      assert.deepEqual(
        thumbnailKeys(ranking),
        offered.slice(0, 8),
        'the first eight have a thumbnail'
      )
      assert.deepEqual(
        imagesOf(ranking).map((image) => image.url),
        [101, 102, 103, 104, 105, 106, 107, 108].map(previewOf)
      )
    })
  })

  describe('pinned to the job', () => {
    /** An eight-beat job that stops while the model ranks its first batch. */
    async function pausedWhileRanking(
      settings: Parameters<typeof runJob>[1]
    ): Promise<AgentRunner> {
      const texts = sentences(8)
      footageForBeats(network, 8)
      network.llm
        .tools([submitBeats(texts)])
        .dynamic(rankLastFirst())
        .dynamic(rankLastFirst())

      await applyTestSettings(settings)
      const runner = new AgentRunner(nextJobId(), {
        title: 'Test job',
        script: texts.join(' '),
        platform: 'YouTube',
        style: 'cinematic',
        mix: 'videos + photos',
        maxAssetsPerBeat: 1,
        maxTotalDownloads: 10
      })
      const hold = holdLlmRequest(2)
      await runner.ensureRegistered()
      const run = runner.start()
      await hold.reached
      await until(() => runner.getSnapshot().currentStep === 'Ranking footage (batch 1 of 2)')
      await runner.pause()
      hold.release()
      await withDeadline(runner, run)
      assert.equal(runner.getSnapshot().status, 'paused')
      return runner
    }

    it('keeps the thumbnails on when Settings turn them off before the job is resumed', async () => {
      const runner = await pausedWhileRanking(THUMBNAILS)
      const before = rankingRequests().length

      await SettingsStore.updateSettings({ rankWithThumbnails: false })
      await withDeadline(runner, runner.resume())

      assert.equal(runner.getSnapshot().status, 'completed')
      assert.equal(runner.getSnapshot().runtimeSettings?.rankWithThumbnails, true)
      const resumed = rankingRequests().slice(before)
      assert.ok(resumed.length >= 1)
      assert.ok(resumed.every((request) => imagesOf(request).length > 0))
    })

    it('keeps the thumbnails off when Settings turn them on before the job is resumed', async () => {
      const runner = await pausedWhileRanking(PIPELINE)
      const before = rankingRequests().length

      await SettingsStore.updateSettings({ rankWithThumbnails: true })
      await withDeadline(runner, runner.resume())

      assert.equal(runner.getSnapshot().status, 'completed')
      assert.equal(runner.getSnapshot().runtimeSettings?.rankWithThumbnails, false)
      assert.ok(
        rankingRequests()
          .slice(before)
          .every((request) => !carriesImages(request))
      )
      assert.ok(network.llmRequests().every((request) => !carriesImages(request)))
    })
  })

  describe('when the model does not take images', () => {
    const REJECTION = 'Invalid content type. image_url is only supported by certain models.'

    /** Refuses a ranking request that carries images, as a model without vision does. */
    const refusingImages = (request: LlmRequestBody): LlmReply =>
      carriesImages(request)
        ? ({ kind: 'error', status: 400, message: REJECTION } as const)
        : rankLastFirst()(request)

    const imageNotes = (logs: Array<{ message: string }>): string[] =>
      logs.map((entry) => entry.message).filter((message) => /does not accept images/.test(message))

    it('resends the ranking without the images, says so once, and picks as it would have', async () => {
      footageForBeats(network, 2)
      network.llm
        .tools([submitBeats(sentences(2))])
        .dynamic(refusingImages)
        .dynamic(refusingImages)

      const run = await runJob({ script: scriptOf(2) }, THUMBNAILS)

      assert.deepEqual(network.problems, [])
      assert.equal(run.snapshot.status, 'completed')
      assert.equal(network.llm.remaining(), 0)
      const [first, second] = rankingRequests()
      assert.equal(rankingRequests().length, 2, 'refused once, then sent again')
      assert.ok(carriesImages(first))
      assert.ok(!carriesImages(second))
      assert.deepEqual(beatsRanked(second), beatsRanked(first))
      assert.deepEqual(
        run.manifest.beats.map((beat) => beat.assets.map((asset) => asset.id)),
        [['video_106'], ['video_206']]
      )
      assert.deepEqual(imageNotes(run.snapshot.logs), [
        'gpt-4o does not accept images, so the ranking goes on without thumbnails.'
      ])
    })

    it('sends the next job on that model without images from the start', async () => {
      footageForBeats(network, 2)
      network.llm
        .tools([submitBeats(sentences(2))])
        .dynamic(refusingImages)
        .dynamic(refusingImages)
      await runJob({ script: scriptOf(2) }, THUMBNAILS)

      network.llm.tools([submitBeats(sentences(2))]).dynamic(refusingImages)
      const before = rankingRequests().length
      const second = await runJob({ script: scriptOf(2) }, THUMBNAILS)

      assert.deepEqual(network.problems, [])
      assert.equal(second.snapshot.status, 'completed')
      const sent = rankingRequests().slice(before)
      assert.equal(sent.length, 1, 'no request was refused this time')
      assert.ok(!carriesImages(sent[0]))
      assert.equal(imageNotes(second.snapshot.logs).length, 1)
    })
  })
})
