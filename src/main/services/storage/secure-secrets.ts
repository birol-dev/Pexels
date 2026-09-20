import { app, safeStorage } from 'electron'
import { join } from 'path'
import { loadRecoverableJson, writeJsonAtomic } from './state-file-recovery.ts'

const ENCRYPTED_PREFIX = 'encrypted:'

let secretsFile: string | null = null
function getSecretsFile(): string {
  if (!secretsFile) {
    secretsFile = join(app.getPath('userData'), 'secrets.json')
  }
  return secretsFile
}

export class SecureSecrets {
  private static writeQueue: Promise<void> = Promise.resolve()

  private static isSecretMap(value: unknown): value is Record<string, string> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  }

  private static async readSecretsFile(): Promise<Record<string, string>> {
    const filePath = getSecretsFile()
    const result = await loadRecoverableJson(filePath, this.isSecretMap)
    if (result.status === 'unavailable') {
      throw result.error
    }
    return result.status === 'ok' ? result.value : {}
  }

  private static async writeSecretsFile(secrets: Record<string, string>): Promise<void> {
    await writeJsonAtomic(getSecretsFile(), secrets)
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
      console.warn(`Refusing plaintext secret for key ${key} as plaintext fallback is disabled.`)
      return ''
    }

    // safeStorage is available, so the secret MUST be encrypted
    if (!encryptedHex.startsWith(ENCRYPTED_PREFIX)) {
      console.warn(`Refusing unencrypted secret for key ${key} since secure storage is active.`)
      return ''
    }

    try {
      const hex = encryptedHex.slice(ENCRYPTED_PREFIX.length)
      const encryptedBuffer = Buffer.from(hex, 'hex')
      return safeStorage.decryptString(encryptedBuffer)
    } catch (error) {
      console.error(
        `Failed to decrypt secret for key ${key}:`,
        error instanceof Error ? error.message : error
      )
      return ''
    }
  }

  public static async setSecret(key: string, value: string): Promise<void> {
    this.writeQueue = this.writeQueue
      .catch(() => {
        // Keep the queue alive after a prior failure.
      })
      .then(async () => {
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
      })
    await this.writeQueue
  }
}
