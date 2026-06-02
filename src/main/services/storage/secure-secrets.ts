import { app, safeStorage } from 'electron'
import { dirname, join } from 'path'
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
      const parsed = JSON.parse(data)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }

  private static async writeSecretsFile(secrets: Record<string, string>): Promise<void> {
    const filePath = getSecretsFile()
    await fs.mkdir(dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, JSON.stringify(secrets, null, 2), 'utf-8')
  }

  public static async hasSecret(key: string): Promise<boolean> {
    const secrets = await this.readSecretsFile()
    return Boolean(secrets[key])
  }

  public static async getSecret(key: string): Promise<string> {
    const secrets = await this.readSecretsFile()
    const encryptedHex = secrets[key]
    if (!encryptedHex) return ''

    if (encryptedHex.startsWith(PLAIN_PREFIX)) {
      return encryptedHex.slice(PLAIN_PREFIX.length)
    }

    if (!safeStorage.isEncryptionAvailable()) {
      if (encryptedHex.startsWith(ENCRYPTED_PREFIX)) {
        throw new Error(
          'Secure credential storage is unavailable on this system. Cannot decrypt encrypted keys.'
        )
      }
      return encryptedHex
    }

    try {
      const hex = encryptedHex.startsWith(ENCRYPTED_PREFIX)
        ? encryptedHex.slice(ENCRYPTED_PREFIX.length)
        : encryptedHex
      const encryptedBuffer = Buffer.from(hex, 'hex')
      return safeStorage.decryptString(encryptedBuffer)
    } catch (error) {
      if (!encryptedHex.startsWith(ENCRYPTED_PREFIX)) {
        return encryptedHex
      }
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
      secrets[key] = `${PLAIN_PREFIX}${value}`
    } else {
      try {
        const encryptedBuffer = safeStorage.encryptString(value)
        secrets[key] = `${ENCRYPTED_PREFIX}${encryptedBuffer.toString('hex')}`
      } catch (error) {
        console.error(
          `Failed to encrypt secret for key ${key} using safeStorage, falling back to plain:`,
          error
        )
        secrets[key] = `${PLAIN_PREFIX}${value}`
      }
    }

    await this.writeSecretsFile(secrets)
  }
}
