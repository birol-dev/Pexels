import assert from 'node:assert/strict'
import { afterEach, before, describe, it, mock } from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { registerMcpHandlers } from '../src/main/ipc/mcp.ipc.ts'
import {
  mcpClientDocsUrl,
  mcpClientInstallUrl
} from '../src/main/services/mcp/mcp-client-actions.ts'
import {
  getMcpConnectionInfo,
  McpHttpServer,
  stopMcpServer,
  syncMcpServer
} from '../src/main/services/mcp/mcp-server.ts'
import { getDefaultSettings, SettingsStore } from '../src/main/services/storage/settings-store.ts'
import { SecureSecrets } from '../src/main/services/storage/secure-secrets.ts'
import { MCP_CLIENTS } from '../src/shared/mcp-clients.ts'
import type { McpConnectionInfo } from '../src/shared/mcp.ts'
import { calls, invokeIpc, shell } from './support/electron-stub.mjs'

const connection: McpConnectionInfo = {
  enabled: true,
  running: true,
  url: 'http://127.0.0.1:38477/mcp',
  token: 'test-private-token'
}

describe('MCP app installation actions', () => {
  before(() => registerMcpHandlers())
  afterEach(() => {
    calls.openedExternal.length = 0
  })

  it('uses the documented native protocols with the live address and credential', () => {
    const cursor = new URL(mcpClientInstallUrl(connection, 'cursor'))
    assert.equal(cursor.protocol, 'cursor:')
    assert.equal(cursor.hostname, 'anysphere.cursor-deeplink')
    assert.equal(cursor.pathname, '/mcp/install')
    assert.equal(cursor.searchParams.get('name'), 'stockfinder')
    assert.deepEqual(
      JSON.parse(Buffer.from(cursor.searchParams.get('config')!, 'base64').toString()),
      { url: connection.url, headers: { Authorization: `Bearer ${connection.token}` } }
    )
    const vscode = mcpClientInstallUrl(connection, 'vscode')
    assert.ok(vscode.startsWith('vscode:mcp/install?'))
    assert.deepEqual(JSON.parse(decodeURIComponent(vscode.split('?')[1])), {
      name: 'stockfinder',
      type: 'http',
      url: connection.url,
      headers: { Authorization: `Bearer ${connection.token}` }
    })
  })

  it('refuses unknown apps, arbitrary addresses and unavailable credentials', async () => {
    for (const client of ['https://attacker.test', 'file:///test', 'codex', {}, null]) {
      assert.throws(() => mcpClientInstallUrl(connection, client), /Choose Cursor or VS Code/)
      await assert.rejects(invokeIpc('mcp:openClient', client), /Choose Cursor or VS Code/)
    }
    for (const patch of [{ running: false }, { enabled: false }, { url: null }, { token: null }]) {
      assert.throws(() => mcpClientInstallUrl({ ...connection, ...patch }, 'cursor'), /Enable/)
    }
    for (const url of [
      'https://attacker.test/mcp',
      'http://127.0.0.1:38477/mcp?token=exposed',
      'http://127.0.0.1:38477/mcp#fragment',
      'http://username@127.0.0.1:38477/mcp'
    ]) {
      assert.throws(() => mcpClientInstallUrl({ ...connection, url }, 'vscode'), /this computer/)
    }
    await assert.rejects(invokeIpc('mcp:openClient', 'cursor'), /Enable/)
    assert.deepEqual(calls.openedExternal, [])
  })

  it('opens only known official setup guides, without a connection token', async () => {
    for (const client of MCP_CLIENTS) {
      assert.equal(new URL(mcpClientDocsUrl(client.id)).protocol, 'https:')
      await invokeIpc('mcp:openSetupDocs', client.id)
      assert.equal(calls.openedExternal.at(-1), client.docsUrl)
    }
    for (const client of ['https://attacker.test', 'file:///test', '__proto__', {}, null]) {
      assert.throws(() => mcpClientDocsUrl(client), /Choose an AI app/)
      await assert.rejects(invokeIpc('mcp:openSetupDocs', client), /Choose an AI app/)
    }
    assert.ok(calls.openedExternal.every((url) => !url.includes(connection.token!)))
  })
})

describe('MCP native actions failure and revocation boundaries', () => {
  afterEach(async () => {
    mock.restoreAll()
    await stopMcpServer()
    calls.openedExternal.length = 0
  })

  it('does not expose the private install URI when the OS cannot open the app', async () => {
    mock.method(SettingsStore, 'getSettings', async () => ({
      ...getDefaultSettings(),
      mcpEnabled: true
    }))
    mock.method(SecureSecrets, 'getSecret', async () => connection.token!)
    // The native-action handler needs live connection state, not an actual listener for this check.
    mock.method(McpHttpServer.prototype, 'start', async function (this: McpHttpServer) {
      this.url = 'http://127.0.0.1:45678/mcp'
      return this.url
    })
    await syncMcpServer()
    mock.method(shell, 'openExternal', async (url: string) => {
      throw new Error(`The OS could not launch ${url}`)
    })
    for (const client of ['cursor', 'vscode']) {
      await assert.rejects(invokeIpc('mcp:openClient', client), (error: Error) => {
        assert.match(error.message, /Could not open the AI app/)
        assert.ok(!error.message.includes(connection.token!))
        assert.ok(!error.message.includes('mcp/install'))
        assert.ok(!error.message.includes('Authorization'))
        return true
      })
    }
  })

  it('clears initialization evidence on token replacement and when disabled', async () => {
    let enabled = true
    let credential = connection.token!
    const created: McpHttpServer[] = []
    mock.method(SettingsStore, 'getSettings', async () => ({
      ...getDefaultSettings(),
      mcpEnabled: enabled
    }))
    mock.method(SecureSecrets, 'getSecret', async () => credential)
    mock.method(SecureSecrets, 'setSecret', async (_key: string, value: string) => {
      credential = value
    })
    mock.method(McpHttpServer.prototype, 'start', async function (this: McpHttpServer) {
      created.push(this)
      this.url = 'http://127.0.0.1:45678/mcp'
      return this.url
    })
    await syncMcpServer()
    created.at(-1)!.clientActivity = {
      clientName: 'Previously reached',
      lastClientSeenAt: new Date().toISOString()
    }
    assert.equal(getMcpConnectionInfo().clientName, 'Previously reached')
    const rotated = await invokeIpc('mcp:rotateToken')
    assert.notEqual(rotated.token, connection.token)
    assert.equal(rotated.clientName, undefined)
    assert.equal(rotated.lastClientSeenAt, undefined)
    await invokeIpc('mcp:openClient', 'vscode')
    const installed = JSON.parse(decodeURIComponent(calls.openedExternal.at(-1)!.split('?')[1]))
    assert.equal(installed.headers.Authorization, `Bearer ${rotated.token}`)
    created.at(-1)!.clientActivity = {
      clientName: 'Reached again',
      lastClientSeenAt: new Date().toISOString()
    }
    enabled = false
    await syncMcpServer()
    assert.equal(getMcpConnectionInfo().running, false)
    assert.equal(getMcpConnectionInfo().clientName, undefined)
    assert.equal(getMcpConnectionInfo().lastClientSeenAt, undefined)
    await assert.rejects(invokeIpc('mcp:openClient', 'cursor'), /Enable/)
  })
})

describe('MCP client reachability evidence', () => {
  it('records only a successful authenticated initialize and clears it on stop', async () => {
    const server = new McpHttpServer(connection.token!, 0)
    const url = await server.start()
    const client = new Client({ name: 'Local AI app', version: '1.0.0' })
    try {
      assert.equal(server.clientActivity, null)
      const invalid = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          Authorization: `Bearer ${connection.token}`
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
      })
      assert.ok((await invalid.json()).error)
      assert.equal(server.clientActivity, null)
      const unauthorized = await fetch(url, { method: 'POST' })
      await unauthorized.text()
      assert.equal(unauthorized.status, 401)
      assert.equal(server.clientActivity, null)
      await client.connect(
        new StreamableHTTPClientTransport(new URL(url), {
          requestInit: { headers: { Authorization: `Bearer ${connection.token}` } }
        })
      )
      assert.equal(server.clientActivity?.clientName, 'Local AI app')
      assert.ok(Number.isFinite(Date.parse(server.clientActivity!.lastClientSeenAt!)))
      await client.close()
      assert.equal(
        server.clientActivity?.clientName,
        'Local AI app',
        'last seen survives disconnect'
      )
      const longName = `\u0000\u202e${'x'.repeat(100)}`
      const sanitized = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          Authorization: `Bearer ${connection.token}`
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'initialize',
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: longName, version: '1.0.0' }
          }
        })
      })
      assert.ok((await sanitized.json()).result)
      assert.equal(server.clientActivity?.clientName, 'x'.repeat(80))
      await server.stop()
      assert.equal(server.clientActivity, null)
    } finally {
      await client.close()
      await server.stop()
    }
  })
})
