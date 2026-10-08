import { promises as fs } from 'fs'
import { shell } from 'electron'

/**
 * Moves a file to the OS trash. A file that is already gone counts as deleted. Any other
 * failure (permissions, locks, no trash) throws, so the caller keeps its record of the file.
 */
export async function moveFileToTrash(filePath: string): Promise<void> {
  const exists = await fs.access(filePath).then(
    () => true,
    () => false
  )
  if (exists) await shell.trashItem(filePath)
}
