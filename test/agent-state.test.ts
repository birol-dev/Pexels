import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { promises as fs } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  loadAgentConversationState,
  persistAgentConversationState,
  shouldEmbedConversationInManifest
} from '../src/main/services/agent/agent-state.ts'
import { ManifestWriter } from '../src/main/services/files/manifest-writer.ts'
import { initialPipelineState } from '../src/main/services/pipeline/context.ts'

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await fs.mkdtemp(join(tmpdir(), 'stockfinder-agent-state-'))
  try {
    await fn(dir)
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
}

const sampleMessages = [
  { role: 'user' as const, content: 'Find mountain photos' },
  { role: 'tool' as const, content: '{"results":[1,2,3]}', name: 'search_pexels_photos' }
]
const sampleCandidates: Array<[string, { pexelsId: number }]> = [['photo_1', { pexelsId: 1 }]]

describe('agent conversation persistence', () => {
  it('keeps conversation on the manifest until agent-state.json is trusted', () => {
    assert.equal(shouldEmbedConversationInManifest(false), true)
    assert.equal(shouldEmbedConversationInManifest(true), false)
  })

  it('falls back to a legacy manifest and can migrate to agent-state.json', async () => {
    await withTempDir(async (dir) => {
      await ManifestWriter.ensureProjectStructure(dir)
      const manifest = {
        messages: sampleMessages,
        pexelsCandidates: sampleCandidates
      }

      const loaded = await loadAgentConversationState(dir, manifest)
      assert.equal(loaded.source, 'manifest')
      assert.equal(loaded.persistToAgentStateFile, true)
      assert.deepEqual(loaded.messages, sampleMessages)

      await persistAgentConversationState(dir, sampleMessages, sampleCandidates)

      await ManifestWriter.writeJsonFile(dir, 'manifest.json', {
        schemaVersion: 1,
        title: 'migrated'
      })

      const resumed = await loadAgentConversationState(dir, {})
      assert.equal(resumed.source, 'agent-state')
      assert.deepEqual(resumed.messages, sampleMessages)
      assert.deepEqual(resumed.pexelsCandidates, sampleCandidates)
    })
  })

  it('does not drop conversation when a later manifest omits it after persist', async () => {
    await withTempDir(async (dir) => {
      await ManifestWriter.ensureProjectStructure(dir)
      await persistAgentConversationState(dir, sampleMessages, sampleCandidates)

      const resumed = await loadAgentConversationState(dir, {
        title: 'hot path manifest without messages'
      })
      assert.equal(resumed.source, 'agent-state')
      assert.equal((resumed.messages as typeof sampleMessages)[0].content, 'Find mountain photos')
    })
  })

  it('does not overwrite agent-state.json when the file cannot be read', async () => {
    await withTempDir(async (dir) => {
      await ManifestWriter.ensureProjectStructure(dir)
      const statePath = join(dir, 'agent-state.json')
      await fs.mkdir(statePath)

      const loaded = await loadAgentConversationState(dir, {
        messages: sampleMessages,
        pexelsCandidates: sampleCandidates
      })
      assert.equal(loaded.source, 'manifest')
      assert.equal(loaded.persistToAgentStateFile, false)
      assert.deepEqual(loaded.messages, sampleMessages)

      const stats = await fs.stat(statePath)
      assert.equal(stats.isDirectory(), true)
    })
  })

  it('keeps the compaction cutoff next to the turn count', async () => {
    await withTempDir(async (dir) => {
      await ManifestWriter.ensureProjectStructure(dir)
      await persistAgentConversationState(dir, sampleMessages, sampleCandidates, 7, 12)

      const loaded = await loadAgentConversationState(dir, {})

      assert.equal(loaded.source, 'agent-state')
      assert.equal(loaded.iterationsUsed, 7)
      assert.equal(loaded.compactedBefore, 12)
    })
  })

  it('loads a state file from before the cutoff existed with no compaction', async () => {
    await withTempDir(async (dir) => {
      await ManifestWriter.ensureProjectStructure(dir)
      await ManifestWriter.writeJsonFile(dir, 'agent-state.json', {
        schemaVersion: 1,
        messages: sampleMessages,
        pexelsCandidates: sampleCandidates,
        iterationsUsed: 5
      })

      const loaded = await loadAgentConversationState(dir, {})

      assert.equal(loaded.source, 'agent-state')
      assert.equal(loaded.iterationsUsed, 5)
      assert.equal(loaded.compactedBefore, 0)
    })
  })

  it('ignores a cutoff that is not a usable count', async () => {
    for (const bad of [-3, 'six', null, Number.NaN, {}]) {
      await withTempDir(async (dir) => {
        await ManifestWriter.ensureProjectStructure(dir)
        await ManifestWriter.writeJsonFile(dir, 'agent-state.json', {
          schemaVersion: 1,
          messages: sampleMessages,
          compactedBefore: bad
        })

        assert.equal((await loadAgentConversationState(dir, {})).compactedBefore, 0)
      })
    }
  })

  it('keeps where a pipeline job stopped, next to an empty conversation', async () => {
    await withTempDir(async (dir) => {
      await ManifestWriter.ensureProjectStructure(dir)
      const stopped = {
        ...initialPipelineState(),
        step: 'searched' as const,
        candidatesByBeat: { beat_1: ['video_1', 'photo_2'], beat_2: [] },
        rankingByBeat: { beat_1: ['photo_2'] },
        modelCalls: 2
      }
      await persistAgentConversationState(
        dir,
        [],
        sampleCandidates,
        0,
        0,
        undefined,
        undefined,
        stopped
      )

      const loaded = await loadAgentConversationState(dir, {})

      assert.equal(loaded.source, 'agent-state')
      assert.deepEqual(loaded.messages, [])
      assert.deepEqual(loaded.pipelineState, stopped)
    })
  })

  it('loads a loop job, or a pipeline state that is not one, with no pipeline state', async () => {
    await withTempDir(async (dir) => {
      await ManifestWriter.ensureProjectStructure(dir)
      await persistAgentConversationState(dir, sampleMessages, sampleCandidates)
      assert.equal((await loadAgentConversationState(dir, {})).pipelineState, undefined)

      for (const bad of ['searched', { step: 'unknown' }, { candidatesByBeat: {} }, null, 7]) {
        await ManifestWriter.writeJsonFile(dir, 'agent-state.json', {
          schemaVersion: 1,
          messages: [],
          pipelineState: bad
        })
        const loaded = await loadAgentConversationState(dir, {})
        assert.equal(loaded.source, 'agent-state')
        assert.equal(loaded.pipelineState, undefined, JSON.stringify(bad))
      }
    })
  })

  it('starts a legacy manifest conversation with no compaction', async () => {
    await withTempDir(async (dir) => {
      await ManifestWriter.ensureProjectStructure(dir)

      const loaded = await loadAgentConversationState(dir, { messages: sampleMessages })

      assert.equal(loaded.source, 'manifest')
      assert.equal(loaded.compactedBefore, 0)
    })
  })
})
