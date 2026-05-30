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

    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error(
        'Secure credential storage is unavailable on this system. API keys cannot be read safely.'
      )
    }

    try {
      if (encryptedHex.startsWith(PLAIN_PREFIX)) {
        throw new Error(
          'A legacy plaintext API key was found. Re-enter the key so it can be encrypted before use.'
        )
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
      throw new Error(
        'Secure credential storage is unavailable on this system. API keys were not saved.'
      )
    } else {
      try {
        const encryptedBuffer = safeStorage.encryptString(value)
        secrets[key] = `${ENCRYPTED_PREFIX}${encryptedBuffer.toString('hex')}`
      } catch (error) {
        console.error(`Failed to encrypt secret for key ${key} using safeStorage:`, error)
        throw new Error('Failed to encrypt API key. The key was not saved.')
      }
    }

    await this.writeSecretsFile(secrets)
  }
}
