import { app, safeStorage } from 'electron'
import { dirname, join } from 'path'
import { promises as fs } from 'fs'

const ENCRYPTED_PREFIX = 'encrypted:'

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
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        return {}
      }
      throw error
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
      if (encryptedHex.startsWith(ENCRYPTED_PREFIX)) {
        throw new Error(
          'Secure credential storage is unavailable on this system. Cannot decrypt encrypted keys.'
        )
      }
      // If safeStorage is unavailable, refuse legacy or plain secrets to prevent plaintext usage
      if (!app.isPackaged)
        console.warn(`Refusing plaintext secret for key ${key} as plaintext fallback is disabled.`)
      return ''
    }

    // safeStorage is available, so the secret MUST be encrypted
    if (!encryptedHex.startsWith(ENCRYPTED_PREFIX)) {
      if (!app.isPackaged)
        console.warn(`Refusing unencrypted secret for key ${key} since secure storage is active.`)
      return ''
    }

    try {
      const hex = encryptedHex.slice(ENCRYPTED_PREFIX.length)
      const encryptedBuffer = Buffer.from(hex, 'hex')
      return safeStorage.decryptString(encryptedBuffer)
    } catch (error) {
      if (!app.isPackaged) console.error(`Failed to decrypt secret for key ${key}:`, error)
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
        'Secure storage is unavailable on this system. Storing keys in plaintext is disabled for security.'
      )
    }

    try {
      const encryptedBuffer = safeStorage.encryptString(value)
      secrets[key] = `${ENCRYPTED_PREFIX}${encryptedBuffer.toString('hex')}`
    } catch (error) {
      throw new Error(
        `Failed to encrypt key securely using safeStorage: ${error instanceof Error ? error.message : String(error)}`
      )
    }

    await this.writeSecretsFile(secrets)
  }
}
