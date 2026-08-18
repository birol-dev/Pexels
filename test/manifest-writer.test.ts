import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'
import { promises as fs } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { ManifestWriter, type ManifestData } from '../src/main/services/files/manifest-writer.ts'

describe('ManifestWriter', () => {
  let testRoot: string

  before(async () => {
    testRoot = join(tmpdir(), `stockfinder-manifest-test-${Date.now()}`)
    await fs.mkdir(testRoot, { recursive: true })
  })

  after(async () => {
    try {
      await fs.rm(testRoot, { recursive: true, force: true })
    } catch {
      // Ignore cleanup error
    }
  })

  describe('cleanFolderName', () => {
    it('lowercases and replaces special characters with dashes', () => {
      const input = 'My Amazing Video: AI & Robotics (2026)!'
      const cleaned = ManifestWriter.cleanFolderName(input)
      assert.equal(cleaned, 'my-amazing-video-ai-robotics-2026')
    })

    it('falls back to "untitled-project" when title is empty or only special chars', () => {
      assert.equal(ManifestWriter.cleanFolderName(''), 'untitled-project')
      assert.equal(ManifestWriter.cleanFolderName('   !!! @@@ ###   '), 'untitled-project')
    })

    it('truncates excessively long titles to 80 chars without trailing dashes', () => {
      const longTitle = 'a'.repeat(120)
      const cleaned = ManifestWriter.cleanFolderName(longTitle)
      assert.equal(cleaned.length, 80)
      assert.equal(cleaned, 'a'.repeat(80))
      assert.ok(!cleaned.endsWith('-'))
    })
  })

  describe('initializeProjectFolder and ensureProjectStructure', () => {
    it('creates project root and expected subdirectories', async () => {
      const projectDir = await ManifestWriter.initializeProjectFolder(
        testRoot,
        'Test Video Project',
        'job-123'
      )

      assert.ok(projectDir.includes('test-video-project-job-123'))
      const stats = await fs.stat(projectDir)
      assert.ok(stats.isDirectory())

      const photosDir = await fs.stat(join(projectDir, 'photos'))
      const videosDir = await fs.stat(join(projectDir, 'videos'))
      const thumbsDir = await fs.stat(join(projectDir, 'thumbnails'))

      assert.ok(photosDir.isDirectory())
      assert.ok(videosDir.isDirectory())
      assert.ok(thumbsDir.isDirectory())
    })
  })

  describe('writeManifest and atomic file writing', () => {
    it('writes valid JSON manifest atomically to project folder', async () => {
      const projectDir = join(testRoot, 'manifest-write-test')
      await ManifestWriter.ensureProjectStructure(projectDir)

      const manifestData: ManifestData = {
        schemaVersion: 1,
        projectId: 'test-proj-1',
        title: 'Manifest Test Project',
        createdAt: new Date().toISOString(),
        script: 'This is a test script for testing manifest output.',
        settingsSnapshot: {
          provider: 'gemini',
          modelId: 'gemini-2.5-flash-lite',
          targetPlatform: 'youtube_landscape',
          visualStyle: 'cinematic',
          assetMix: 'videos_and_photos',
          maxAssetsPerBeat: 2,
          maxTotalDownloads: 5
        },
        beats: [
          {
            id: 'beat_1',
            order: 1,
            scriptExcerpt: 'This is a test script',
            visualIntent: 'introductory computer graphic',
            mood: 'energetic'
          }
        ],
        assets: [],
        failures: []
      }

      await ManifestWriter.writeManifest(projectDir, manifestData)

      const filePath = join(projectDir, 'manifest.json')
      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(content)

      assert.equal(parsed.schemaVersion, 1)
      assert.equal(parsed.projectId, 'test-proj-1')
      assert.equal(parsed.title, 'Manifest Test Project')
      assert.equal(parsed.beats.length, 1)
    })

    it('queues sequential writes correctly without corruption', async () => {
      const projectDir = join(testRoot, 'queue-write-test')
      await ManifestWriter.ensureProjectStructure(projectDir)

      const writes = Array.from({ length: 10 }, (_, i) =>
        ManifestWriter.writeJsonFile(projectDir, 'data.json', { counter: i })
      )

      await Promise.all(writes)

      const content = await fs.readFile(join(projectDir, 'data.json'), 'utf-8')
      const parsed = JSON.parse(content)
      assert.equal(parsed.counter, 9)
    })
  })

  describe('appendLog', () => {
    it('appends JSONL lines with timestamps', async () => {
      const projectDir = join(testRoot, 'log-test')
      await ManifestWriter.ensureProjectStructure(projectDir)

      await ManifestWriter.appendLog(projectDir, { level: 'info', message: 'First log line' })
      await ManifestWriter.appendLog(projectDir, {
        level: 'debug',
        step: 2,
        note: 'Second log line'
      })

      const logPath = join(projectDir, 'agent-log.jsonl')
      const raw = await fs.readFile(logPath, 'utf-8')
      const lines = raw
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l))

      assert.equal(lines.length, 2)
      assert.equal(lines[0].level, 'info')
      assert.equal(lines[0].message, 'First log line')
      assert.ok(typeof lines[0].timestamp === 'string')
      assert.equal(lines[1].level, 'debug')
      assert.equal(lines[1].step, 2)
    })
  })
})
