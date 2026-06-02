import { ipcMain, shell } from 'electron'
import { ProjectStore } from '../services/storage/project-store'
import { promises as fs } from 'fs'
import { isAbsolute, join, normalize, relative } from 'path'
import { VisualBeat } from '../services/agent/agent-runner'

function isInsideProject(projectDir: string, filePath: string): boolean {
  const normalizedProject = normalize(projectDir)
  const normalizedFile = normalize(filePath)
  const rel = relative(normalizedProject, normalizedFile)
  return isAbsolute(normalizedFile) && rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

export function registerAssetsHandlers(): void {
  ipcMain.handle('assets:list', async (_, jobId: string): Promise<unknown[]> => {
    const summary = await ProjectStore.get(jobId)
    if (!summary) return []

    try {
      const manifestPath = join(summary.downloadPath, 'manifest.json')
      const data = await fs.readFile(manifestPath, 'utf-8')
      const manifest = JSON.parse(data) as { beats?: VisualBeat[] }

      const assets: unknown[] = []
      if (manifest.beats) {
        for (const beat of manifest.beats) {
          if (beat.assets) {
            for (const asset of beat.assets) {
              assets.push({
                ...asset,
                beatId: beat.id,
                beatText: beat.text
              })
            }
          }
        }
      }
      return assets
    } catch {
      return []
    }
  })

  ipcMain.handle(
    'assets:openInFolder',
    async (_, jobId: string, assetId: string): Promise<void> => {
      const summary = await ProjectStore.get(jobId)
      if (!summary) return

      try {
        const manifestPath = join(summary.downloadPath, 'manifest.json')
        const data = await fs.readFile(manifestPath, 'utf-8')
        const manifest = JSON.parse(data) as { beats?: VisualBeat[] }

        if (manifest.beats) {
          for (const beat of manifest.beats) {
            const asset = beat.assets?.find((a) => a.id === assetId)
            if (asset && asset.filePath && isInsideProject(summary.downloadPath, asset.filePath)) {
              shell.showItemInFolder(asset.filePath)
              return
            }
          }
        }
      } catch (err) {
        console.error('Failed to open asset in folder:', err)
      }
    }
  )

  ipcMain.handle('assets:deleteLocal', async (_, jobId: string, assetId: string): Promise<void> => {
    const summary = await ProjectStore.get(jobId)
    if (!summary) return

    try {
      const manifestPath = join(summary.downloadPath, 'manifest.json')
      const data = await fs.readFile(manifestPath, 'utf-8')
      const manifest = JSON.parse(data) as { beats?: VisualBeat[] }

      let manifestModified = false
      if (manifest.beats) {
        for (const beat of manifest.beats) {
          const asset = beat.assets?.find((a) => a.id === assetId)
          if (asset) {
            if (asset.filePath && isInsideProject(summary.downloadPath, asset.filePath)) {
              try {
                await fs.unlink(asset.filePath)
              } catch (unlinkErr) {
                console.warn('File already deleted or unreachable:', unlinkErr)
              }
            }
            asset.status = 'failed'
            asset.error = 'Deleted by user'
            asset.filePath = undefined
            manifestModified = true
          }
        }
      }

      if (manifestModified) {
        // Save manifest changes
        await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')

        // Recalculate downloaded asset count in project registry
        const activeCount =
          manifest.beats?.flatMap((b) => b.assets || [])?.filter((a) => a.status === 'completed')
            ?.length || 0

        summary.assetCount = activeCount
        await ProjectStore.save(summary)
      }
    } catch (err) {
      console.error('Failed to delete asset locally:', err)
    }
  })

  ipcMain.handle('assets:exportManifest', async (_, jobId: string): Promise<string> => {
    const summary = await ProjectStore.get(jobId)
    if (!summary) throw new Error('Job not found')

    const manifestPath = join(summary.downloadPath, 'manifest.json')
    return await fs.readFile(manifestPath, 'utf-8')
  })

  ipcMain.handle('assets:openProjectFolder', async (_, jobId: string): Promise<void> => {
    const summary = await ProjectStore.get(jobId)
    if (!summary || !summary.downloadPath) return

    try {
      await shell.openPath(summary.downloadPath)
    } catch (err) {
      console.error('Failed to open project folder:', err)
    }
  })
}
