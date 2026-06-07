import { ipcMain, shell } from 'electron'
import { ProjectStore } from '../services/storage/project-store'
import { promises as fs } from 'fs'
import { isAbsolute, join, normalize, relative } from 'path'
import { VisualBeat } from '../services/agent/agent-runner'

function isInsideProject(projectDir: string, filePath: string): boolean {
  let normalizedProject = normalize(projectDir)
  let normalizedFile = normalize(filePath)
  if (process.platform === 'win32') {
    normalizedProject = normalizedProject.toLowerCase()
    normalizedFile = normalizedFile.toLowerCase()
  }
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

      let manifestDirty = false
      const assets: unknown[] = []

      if (manifest.beats) {
        for (const beat of manifest.beats) {
          if (beat.assets) {
            for (const asset of beat.assets) {
              // If manifest says completed but file is gone from disk, correct it
              if (asset.status === 'completed' && asset.filePath) {
                let exists = false
                try {
                  await fs.access(asset.filePath)
                  exists = true
                } catch {
                  exists = false
                }
                if (!exists) {
                  asset.status = 'failed'
                  asset.error = 'File not found on disk'
                  asset.filePath = undefined
                  manifestDirty = true
                }
              }

              assets.push({
                ...asset,
                beatId: beat.id,
                beatText: beat.text
              })
            }
          }
        }
      }

      // Persist corrections so manifest stays in sync (fire-and-forget)
      if (manifestDirty) {
        fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8').catch((err) =>
          console.error('Failed to update manifest after file-existence check:', err)
        )
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
