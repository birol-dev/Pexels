import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createConnection } from 'node:net'
import { join } from 'node:path'
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test'
import { registerMcpHandlers } from '../src/main/ipc/mcp.ipc.ts'
import { registerSettingsHandlers } from '../src/main/ipc/settings.ipc.ts'
import {
  getMcpConnectionInfo,
  shutdownMcpServer,
  stopMcpServer,
  syncMcpServer
} from '../src/main/services/mcp/mcp-server.ts'
import { getDefaultSettings, SettingsStore } from '../src/main/services/storage/settings-store.ts'
import { SecureSecrets } from '../src/main/services/storage/secure-secrets.ts'
import { MCP_PORT, type McpConnectionInfo } from '../src/shared/mcp.ts'
import { app, invokeIpc, safeStorage } from './support/electron-stub.mjs'

const originalEncryptionAvailable = safeStorage.isEncryptionAvailable

/** A new socket detects a leaked listener without depending on a cached HTTP connection. */
function connectToMcpPort(): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port: MCP_PORT })
    socket.once('connect', () => {
      socket.destroy()
      resolve()
    })
    socket.once('error', reject)
  })
}

async function assertListening(info: McpConnectionInfo): Promise<void> {
  assert.equal(info.running, true, info.error)
  assert.ok(info.url && info.token)
  const response = await fetch(info.url, { headers: { Authorization: `Bearer ${info.token}` } })
  assert.equal(response.status, 405, 'the authenticated local endpoint is actually listening')
  await response.text()
}

describe('MCP settings and production server lifecycle', { timeout: 30_000 }, () => {
  before(() => {
    registerSettingsHandlers()
    registerMcpHandlers()
  })

  beforeEach(async () => {
    safeStorage.isEncryptionAvailable = originalEncryptionAvailable
    await invokeIpc('settings:updateSettings', { mcpEnabled: false, agentEngine: 'loop' })
    await SecureSecrets.setSecret('mcpToken', '')
  })

  afterEach(async () => {
    mock.restoreAll()
    safeStorage.isEncryptionAvailable = originalEncryptionAvailable
    await invokeIpc('settings:updateSettings', { mcpEnabled: false })
    await stopMcpServer()
  })

  it('is opt-in and validates settings at the IPC boundary', async () => {
    assert.equal(getDefaultSettings().mcpEnabled, false)
    assert.equal(getDefaultSettings().agentEngine, 'loop')
    assert.equal(getMcpConnectionInfo().enabled, false)
    assert.equal(getMcpConnectionInfo().running, false)
    await assert.rejects(connectToMcpPort(), { code: 'ECONNREFUSED' })
    for (const invalid of [{ mcpEnabled: 'true' }, { agentEngine: 'external' }]) {
      await assert.rejects(invokeIpc('settings:updateSettings', invalid))
    }
    const settings = await invokeIpc('settings:updateSettings', {
      agentEngine: 'mcp',
      mcpToken: 'untrusted-token'
    })
    assert.equal(settings.agentEngine, 'mcp')
    assert.equal(settings.mcpEnabled, false)
    assert.equal(settings.mcpToken, undefined)
    assert.equal(await SecureSecrets.getSecret('mcpToken'), '')
    await assert.rejects(connectToMcpPort(), { code: 'ECONNREFUSED' })
  })

  it('keeps one encrypted token across restarts without exposing it in public settings', async () => {
    const publicSettings = await invokeIpc('settings:updateSettings', {
      agentEngine: 'mcp',
      mcpEnabled: true
    })
    const first = getMcpConnectionInfo()
    await assertListening(first)
    assert.match(first.token ?? '', /^[a-f0-9]{64}$/)
    assert.equal(publicSettings.mcpToken, undefined)
    assert.ok(!JSON.stringify(publicSettings).includes(first.token!))
    const settingsJson = await readFile(join(app.getPath('userData'), 'settings.json'), 'utf8')
    assert.ok(!settingsJson.includes(first.token!))
    assert.ok(!settingsJson.includes('mcpToken'))
    const secretsJson = await readFile(join(app.getPath('userData'), 'secrets.json'), 'utf8')
    const secrets = JSON.parse(secretsJson) as Record<string, string>
    assert.ok(secrets.mcpToken.startsWith('encrypted:'))
    assert.ok(!secretsJson.includes(first.token!))
    assert.equal(await SecureSecrets.getSecret('mcpToken'), first.token)

    await invokeIpc('settings:updateSettings', { mcpEnabled: true })
    assert.equal(getMcpConnectionInfo().token, first.token)
    await invokeIpc('settings:updateSettings', { mcpEnabled: false })
    assert.equal(getMcpConnectionInfo().token, null)
    await assert.rejects(connectToMcpPort(), { code: 'ECONNREFUSED' })
    await invokeIpc('settings:updateSettings', { mcpEnabled: true })
    const restarted = getMcpConnectionInfo()
    assert.equal(restarted.token, first.token)
    await assertListening(restarted)
    const projected = await invokeIpc('settings:getPublicSettings')
    assert.ok(!JSON.stringify(projected).includes(first.token!))
  })

  it('settles rapid queued settings writes without leaving a hidden listener', async () => {
    await Promise.all(
      [true, false, true, false, true, false].map((mcpEnabled) =>
        invokeIpc('settings:updateSettings', { mcpEnabled })
      )
    )
    assert.equal((await SettingsStore.getSettings()).mcpEnabled, false)
    assert.equal(getMcpConnectionInfo().enabled, false)
    assert.equal(getMcpConnectionInfo().running, false)
    await assert.rejects(connectToMcpPort(), { code: 'ECONNREFUSED' })

    await Promise.all(
      [false, true, false, true].map((mcpEnabled) =>
        invokeIpc('settings:updateSettings', { mcpEnabled })
      )
    )
    assert.equal((await SettingsStore.getSettings()).mcpEnabled, true)
    await assertListening(getMcpConnectionInfo())
    await invokeIpc('settings:updateSettings', { mcpEnabled: false })
    await assert.rejects(connectToMcpPort(), { code: 'ECONNREFUSED' })
  })

  it('reports unavailable secure storage without a listener and recovers when it returns', async () => {
    safeStorage.isEncryptionAvailable = () => false
    const settings = await invokeIpc('settings:updateSettings', { mcpEnabled: true })
    assert.equal(settings.mcpEnabled, true, 'the UI can still show the attempted setting')
    const failed = getMcpConnectionInfo()
    assert.equal(failed.enabled, true)
    assert.equal(failed.running, false)
    assert.equal(failed.token, null)
    assert.equal(failed.url, null)
    assert.match(failed.error ?? '', /secure storage|encrypt/i)
    await assert.rejects(connectToMcpPort(), { code: 'ECONNREFUSED' })

    safeStorage.isEncryptionAvailable = originalEncryptionAvailable
    assert.equal(await SecureSecrets.getSecret('mcpToken'), '', 'no plaintext fallback was stored')
    await invokeIpc('settings:updateSettings', { mcpEnabled: true })
    assert.equal(getMcpConnectionInfo().error, undefined)
    await assertListening(getMcpConnectionInfo())
  })

  it('retries a failed connection after a conflicting port is released', async () => {
    const occupying = createServer()
    await new Promise<void>((resolve, reject) => {
      occupying.once('error', reject)
      occupying.listen(MCP_PORT, '127.0.0.1', resolve)
    })
    try {
      await invokeIpc('settings:updateSettings', { mcpEnabled: true })
      assert.equal(getMcpConnectionInfo().running, false)
      assert.match(getMcpConnectionInfo().error ?? '', /already in use/)
    } finally {
      await new Promise<void>((resolve) => occupying.close(() => resolve()))
    }
    const retried = await invokeIpc('mcp:retryConnection')
    await assertListening(retried)
    assert.equal(retried.error, undefined)
  })

  it('replaces the private token and immediately rejects the previous credential', async () => {
    await invokeIpc('settings:updateSettings', { mcpEnabled: true })
    const before = getMcpConnectionInfo()
    const after = await invokeIpc('mcp:rotateToken')
    assert.notEqual(after.token, before.token)
    assert.equal(after.url, before.url)
    assert.equal(await SecureSecrets.getSecret('mcpToken'), after.token)
    const revoked = await fetch(after.url!, {
      headers: { Authorization: `Bearer ${before.token}` }
    })
    assert.equal(revoked.status, 401)
    await revoked.text()
    await assertListening(after)
    const projected = await invokeIpc('settings:getPublicSettings')
    assert.ok(!JSON.stringify(projected).includes(after.token!))
    await invokeIpc('settings:updateSettings', { mcpEnabled: false })
    await invokeIpc('settings:updateSettings', { mcpEnabled: true })
    assert.equal(getMcpConnectionInfo().token, after.token)
  })

  it('retains a usable existing connection when the replacement cannot be stored', async () => {
    await invokeIpc('settings:updateSettings', { mcpEnabled: true })
    const before = getMcpConnectionInfo()
    mock.method(SecureSecrets, 'setSecret', async () => {
      throw new Error('Credential storage failed')
    })
    await assert.rejects(invokeIpc('mcp:rotateToken'), /Credential storage failed/)
    assert.equal(getMcpConnectionInfo().token, before.token)
    await assertListening(getMcpConnectionInfo())
  })

  it('keeps retries and token changes from enabling a disabled connection', async () => {
    const info = await invokeIpc('mcp:retryConnection')
    assert.equal(info.enabled, false)
    assert.equal(info.running, false)
    await assert.rejects(invokeIpc('mcp:rotateToken'), /Enable the MCP connection/)
    await assert.rejects(connectToMcpPort(), { code: 'ECONNREFUSED' })
  })

  // Keep shutdown last: after quit starts, this process must never accept commands again.
  it('cannot start a listener when quit races a token read', async () => {
    let enter = (): void => {}
    let release = (): void => {}
    const entered = new Promise<void>((resolve) => {
      enter = resolve
    })
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const getSecret = SecureSecrets.getSecret.bind(SecureSecrets)
    mock.method(SecureSecrets, 'getSecret', async (key: string) => {
      if (key === 'mcpToken') {
        enter()
        await gate
      }
      return getSecret(key)
    })
    await SettingsStore.updateSettings({ mcpEnabled: true })
    const enabling = syncMcpServer()
    await entered
    const quitting = shutdownMcpServer()
    release()
    await Promise.all([enabling, quitting])
    assert.equal(getMcpConnectionInfo().running, false)
    await assert.rejects(connectToMcpPort(), { code: 'ECONNREFUSED' })
    await syncMcpServer()
    assert.equal(getMcpConnectionInfo().running, false)
  })
})
