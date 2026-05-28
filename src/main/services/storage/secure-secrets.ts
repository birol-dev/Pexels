import { app, safeStorage } from 'electron'
import { join } from 'path'
import { promises as fs } from 'fs'

const ENCRYPTED_PREFIX = 'encrypted:'
const PLAIN_PREFIX = 'plain:'

let secretsFile: string | null = null
function getSecretsFile(): string {
  if (!secretsFile) {
    secretsFile = join(app.getPath('userData'), 'secrets.json')
  }
  return secretsFile
}

export class SecureSecrets {
  private static async readSecretsFile(): Promise<Record<string, string>> {
    const filePath = getSecretsFile()
    try {
      const data = await fs.readFile(filePath, 'utf-8')
      return JSON.parse(data)
    } catch {
      return {}
    }
  }

  private static async writeSecretsFile(secrets: Record<string, string>): Promise<void> {
    const filePath = getSecretsFile()
    await fs.writeFile(filePath, JSON.stringify(secrets, null, 2), 'utf-8')
  }

  public static async getSecret(key: string): Promise<string> {
    const secrets = await this.readSecretsFile()
    const encryptedHex = secrets[key]
    if (!encryptedHex) return ''

    if (!safeStorage.isEncryptionAvailable()) {
      console.warn('safeStorage is not available. Returning raw value.')
      if (encryptedHex.startsWith(ENCRYPTED_PREFIX)) return ''
      return encryptedHex.startsWith(PLAIN_PREFIX)
        ? encryptedHex.slice(PLAIN_PREFIX.length)
        : encryptedHex
    }

    try {
      if (encryptedHex.startsWith(PLAIN_PREFIX)) {
        return encryptedHex.slice(PLAIN_PREFIX.length)
      }

      const hex = encryptedHex.startsWith(ENCRYPTED_PREFIX)
        ? encryptedHex.slice(ENCRYPTED_PREFIX.length)
        : encryptedHex
      const encryptedBuffer = Buffer.from(hex, 'hex')
      return safeStorage.decryptString(encryptedBuffer)
    } catch (error) {
      console.error(`Failed to decrypt secret for key ${key}:`, error)
      return ''
    }
  }

  public static async setSecret(key: string, value: string): Promise<void> {
    const secrets = await this.readSecretsFile()
    if (!value) {
      delete secrets[key]
      await this.writeSecretsFile(secrets)
      return
    }

    if (!safeStorage.isEncryptionAvailable()) {
      console.warn('safeStorage is not available. Saving in plaintext.')
      secrets[key] = `${PLAIN_PREFIX}${value}`
    } else {
      try {
        const encryptedBuffer = safeStorage.encryptString(value)
        secrets[key] = `${ENCRYPTED_PREFIX}${encryptedBuffer.toString('hex')}`
      } catch (error) {
        console.error(
          `Failed to encrypt secret for key ${key} using safeStorage. Falling back to plain:`,
          error
        )
        secrets[key] = `${PLAIN_PREFIX}${value}`
      }
    }

    await this.writeSecretsFile(secrets)
  }
}
