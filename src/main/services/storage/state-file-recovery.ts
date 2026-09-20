import { dirname } from 'path'
import { promises as fs } from 'fs'

export type RecoverableJsonResult<T> =
  | { status: 'ok'; value: T }
  | { status: 'empty' }
  | { status: 'unavailable'; error: unknown }

export function isMissingFileError(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT'
}

/**
 * Renames a corrupt or unparseable state file aside so the app can continue
 * from a clean default instead of failing every subsequent read. The original
 * bytes are preserved on disk for manual recovery.
 *
 * Call this only for JSON syntax or shape errors. Transient I/O (EPERM, EBUSY,
 * EISDIR, locked files) must not quarantine a file that may still be valid.
 */
export async function quarantineCorruptFile(
  filePath: string,
  error: unknown
): Promise<string | null> {
  const backupPath = `${filePath}.corrupt-${Date.now()}`
  console.error(
    `State file is unreadable and will be reset (original preserved): ${filePath}`,
    error
  )
  try {
    await fs.rename(filePath, backupPath)
    return backupPath
  } catch (renameError) {
    console.error(`Failed to preserve corrupt state file ${filePath}:`, renameError)
    return null
  }
}

export async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(dirname(filePath), { recursive: true })
  const tempPath = `${filePath}.tmp`
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8')
  await fs.rename(tempPath, filePath)
}

/**
 * Reads JSON and quarantines only unparseable or invalid-shaped files.
 * Missing files are a normal first-run state. Any other I/O error is returned
 * as `unavailable` so callers can fail the operation without wiping live data.
 */
export async function loadRecoverableJson<T>(
  filePath: string,
  isValid: (value: unknown) => value is T
): Promise<RecoverableJsonResult<T>> {
  let raw: string
  try {
    raw = await fs.readFile(filePath, 'utf-8')
  } catch (error) {
    if (isMissingFileError(error)) {
      return { status: 'empty' }
    }
    return { status: 'unavailable', error }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    await quarantineCorruptFile(filePath, error)
    return { status: 'empty' }
  }

  if (!isValid(parsed)) {
    await quarantineCorruptFile(filePath, new Error(`Invalid JSON shape in ${filePath}`))
    return { status: 'empty' }
  }

  return { status: 'ok', value: parsed }
}
