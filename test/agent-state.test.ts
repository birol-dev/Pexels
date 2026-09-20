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
})
