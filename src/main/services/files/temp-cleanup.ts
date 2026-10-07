import { promises as fs } from 'fs'
import { join } from 'path'

const DOWNLOAD_SUBFOLDERS = ['photos', 'videos']

/**
 * Removes `.tmp` partials left in a project's download folders by downloads that
 * were interrupted by a quit or crash (the downloader only unlinks them on its
 * own error path). Only call this when no downloader is active for the project.
 * Returns how many files were removed.
 */
export async function removeStaleDownloadTemps(projectDir: string): Promise<number> {
  let removed = 0
  for (const subfolder of DOWNLOAD_SUBFOLDERS) {
    const folder = join(projectDir, subfolder)
    let entries: string[]
    try {
      entries = await fs.readdir(folder)
    } catch {
      continue // Folder does not exist yet.
    }
    for (const entry of entries) {
      if (!entry.endsWith('.tmp')) continue
      try {
        await fs.unlink(join(folder, entry))
        removed++
      } catch {
        // Best effort — a locked partial is retried on the next resume.
      }
    }
  }
  return removed
}
