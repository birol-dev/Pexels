import { app, safeStorage } from 'electron'
import { join } from 'path'
import { promises as fs } from 'fs'

const SECRETS_FILE = join(app.getPath('userData'), 'secrets.json')
const ENCRYPTED_PREFIX = 'encrypted:'
const PLAIN_PREFIX = 'plain:'

export class SecureSecrets {
  private static async readSecretsFile(): Promise<Record<string, string>> {
    try {
      const data = await fs.readFile(SECRETS_FILE, 'utf-8')
      return JSON.parse(data)
    } catch {
      return {}
    }
  }

  private static async writeSecretsFile(secrets: Record<string, string>): Promise<void> {
    await fs.writeFile(SECRETS_FILE, JSON.stringify(secrets, null, 2), 'utf-8')
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
      const encryptedBuffer = safeStorage.encryptString(value)
      secrets[key] = `${ENCRYPTED_PREFIX}${encryptedBuffer.toString('hex')}`
    }

    await this.writeSecretsFile(secrets)
  }
}
