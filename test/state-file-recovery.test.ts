import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { promises as fs } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  loadRecoverableJson,
  quarantineCorruptFile,
  writeJsonAtomic
} from '../src/main/services/storage/state-file-recovery.ts'

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await fs.mkdtemp(join(tmpdir(), 'stockfinder-recovery-'))
  try {
    await fn(dir)
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

describe('quarantineCorruptFile', () => {
  it('renames a corrupt file aside so callers can fall back to defaults', async () => {
    await withTempDir(async (dir) => {
      const filePath = join(dir, 'settings.json')
      await fs.writeFile(filePath, '{ this is not valid json', 'utf-8')

      await quarantineCorruptFile(filePath, new Error('parse failure'))

      await assert.rejects(() => fs.access(filePath))
      const entries = await fs.readdir(dir)
      assert.equal(entries.length, 1)
      assert.match(entries[0], /^settings\.json\.corrupt-\d+$/)
    })
  })

  it('does not throw when the corrupt file is already gone', async () => {
    await withTempDir(async (dir) => {
      const filePath = join(dir, 'missing.json')
      await assert.doesNotReject(() => quarantineCorruptFile(filePath, new Error('boom')))
    })
  })
})

describe('loadRecoverableJson', () => {
  it('returns ok for valid JSON of the expected shape', async () => {
    await withTempDir(async (dir) => {
      const filePath = join(dir, 'projects.json')
      await writeJsonAtomic(filePath, [{ jobId: 'job-1' }])

      const result = await loadRecoverableJson(filePath, Array.isArray)
      assert.equal(result.status, 'ok')
      if (result.status === 'ok') {
        assert.equal(result.value[0].jobId, 'job-1')
      }
    })
  })

  it('returns empty for a missing file without creating anything', async () => {
    await withTempDir(async (dir) => {
      const filePath = join(dir, 'projects.json')
      const result = await loadRecoverableJson(filePath, Array.isArray)
      assert.equal(result.status, 'empty')
      const entries = await fs.readdir(dir)
      assert.deepEqual(entries, [])
    })
  })

  it('quarantines unparseable JSON and returns empty so the live path is gone', async () => {
    await withTempDir(async (dir) => {
      const filePath = join(dir, 'secrets.json')
      await fs.writeFile(filePath, '{ not json', 'utf-8')

      const result = await loadRecoverableJson(filePath, isObjectRecord)
      assert.equal(result.status, 'empty')
      await assert.rejects(() => fs.access(filePath))
      const entries = await fs.readdir(dir)
      assert.equal(entries.length, 1)
      assert.match(entries[0], /^secrets\.json\.corrupt-\d+$/)
    })
  })

  it('quarantines the wrong JSON shape instead of silently using an empty value', async () => {
    await withTempDir(async (dir) => {
      const filePath = join(dir, 'projects.json')
      await writeJsonAtomic(filePath, { projects: [{ jobId: 'hidden' }] })

      const result = await loadRecoverableJson(filePath, Array.isArray)
      assert.equal(result.status, 'empty')
      const entries = await fs.readdir(dir)
      assert.match(entries[0], /^projects\.json\.corrupt-\d+$/)
    })
  })

  it('does not quarantine a live file on I/O errors such as reading a directory', async () => {
    await withTempDir(async (dir) => {
      const filePath = join(dir, 'projects.json')
      await fs.mkdir(filePath)

      const result = await loadRecoverableJson(filePath, Array.isArray)
      assert.equal(result.status, 'unavailable')
      const stats = await fs.stat(filePath)
      assert.equal(stats.isDirectory(), true)
      const entries = await fs.readdir(dir)
      assert.deepEqual(entries, ['projects.json'])
    })
  })
})
