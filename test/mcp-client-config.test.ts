import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { McpConnectionInfo } from '../src/shared/mcp.ts'
import {
  MCP_CLIENTS,
  MCP_CONNECTION_TEST_PROMPT,
  MCP_STARTER_PROMPT,
  mcpClientConfig,
  mcpSetupPrompt,
  type McpClientId
} from '../src/shared/mcp-clients.ts'

const info: McpConnectionInfo = {
  enabled: true,
  running: true,
  url: 'http://127.0.0.1:38477/mcp',
  token: 'test-private-token'
}
const headers = { Authorization: 'Bearer test-private-token' }

describe('MCP client setup', () => {
  it('uses each client’s own HTTP wrapper, URL field, and transport instead of guessing one schema', () => {
    const expected = {
      cursor: { mcpServers: { stockfinder: { url: info.url, headers } } },
      vscode: { servers: { stockfinder: { type: 'http', url: info.url, headers } } },
      'gemini-cli': { mcpServers: { stockfinder: { httpUrl: info.url, headers } } },
      windsurf: { mcpServers: { stockfinder: { serverUrl: info.url, headers } } },
      devin: { mcpServers: { stockfinder: { url: info.url, headers, transport: 'http' } } },
      cline: {
        mcpServers: {
          stockfinder: {
            type: 'streamableHttp',
            url: info.url,
            headers,
            disabled: false,
            autoApprove: []
          }
        }
      },
      opencode: {
        mcp: {
          stockfinder: { type: 'remote', url: info.url, headers, oauth: false, enabled: true }
        }
      },
      'opencode-v2': {
        mcp: { servers: { stockfinder: { type: 'remote', url: info.url, headers, oauth: false } } }
      },
      other: { mcpServers: { stockfinder: { type: 'http', url: info.url, headers } } }
    }
    for (const [id, config] of Object.entries(expected)) {
      assert.deepEqual(JSON.parse(mcpClientConfig(info, id as McpClientId)!), config, id)
    }
  })

  it('produces real TOML lines and a personal-scope Claude command', () => {
    const toml = mcpClientConfig(info, 'codex')!
    const lines = toml.split('\n')
    assert.equal(lines.length, 3)
    assert.equal(lines[0], '[mcp_servers.stockfinder]')
    assert.equal(JSON.parse(lines[1].slice('url = '.length)), info.url)
    assert.equal(lines[2], 'http_headers = { Authorization = "Bearer test-private-token" }')
    assert.equal(toml.includes('\\n'), false, 'must paste as TOML, not literal backslash-n text')
    assert.equal(
      mcpClientConfig(info, 'claude-code'),
      'claude mcp add --transport http --scope user stockfinder http://127.0.0.1:38477/mcp --header "Authorization: Bearer test-private-token"'
    )
  })

  it('does not export stale credentials or pretend Claude Desktop supports native local HTTP', () => {
    for (const client of MCP_CLIENTS) {
      for (const changes of [
        { enabled: false },
        { running: false },
        { url: null },
        { token: null }
      ]) {
        const offline = { ...info, ...changes }
        assert.equal(mcpClientConfig(offline, client.id), null, client.id)
        assert.equal(mcpSetupPrompt(offline, client.id), null, client.id)
      }
    }
    const desktop = MCP_CLIENTS.find((client) => client.id === 'claude-desktop')!
    assert.equal(desktop.supported, false)
    assert.match(desktop.limitation!, /extension/i)
    assert.equal(mcpClientConfig(info, 'claude-desktop'), null)
    assert.equal(mcpSetupPrompt(info, 'claude-desktop'), null)
  })

  it('gives a local agent complete setup instructions that preserve existing configuration', () => {
    for (const client of MCP_CLIENTS.filter((client) => client.supported !== false)) {
      const prompt = mcpSetupPrompt(info, client.id)!
      assert.ok(prompt.includes(mcpClientConfig(info, client.id)!), client.id)
      assert.ok(prompt.includes(client.docsUrl), client.id)
      assert.match(prompt, /Preserve all other settings, comments, and MCP servers/)
      assert.match(prompt, /personal configuration/)
      assert.match(prompt, /stockfinder_status/)
      assert.match(prompt, /stockfinder_list_jobs/)
      assert.match(prompt, /Never claim success until an actual StockFinder tool call works/)
      assert.match(prompt, /not a cloud runner/)
    }
  })

  it('keeps connection testing separate from a working-pack prompt and excludes credentials from both', () => {
    for (const prompt of [MCP_CONNECTION_TEST_PROMPT, MCP_STARTER_PROMPT]) {
      assert.equal(prompt.includes(info.token!), false)
      assert.equal(prompt.includes(info.url!), false)
      assert.equal(prompt.includes('Authorization:'), false)
    }
    assert.match(MCP_CONNECTION_TEST_PROMPT, /Do not create packs/)
    assert.match(MCP_CONNECTION_TEST_PROMPT, /stockfinder_status/)
    assert.match(MCP_CONNECTION_TEST_PROMPT, /stockfinder_list_jobs/)
    assert.match(MCP_STARTER_PROMPT, /stockfinder_get_job/)
    assert.match(MCP_STARTER_PROMPT, /stockfinder_submit_script/)
    assert.match(MCP_STARTER_PROMPT, /approval/i)
    assert.match(MCP_STARTER_PROMPT, /stockfinder_finish_job/)
  })
})
