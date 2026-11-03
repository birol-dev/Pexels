import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getMissingCredentials } from '../src/renderer/src/features/script-input/utils.ts'
import { buildSettingsUpdates } from '../src/renderer/src/features/onboarding/utils.ts'
import { mcpClientConfig } from '../src/renderer/src/features/settings/mcp-config.ts'
import type { PublicSettings } from '../src/renderer/src/lib/store.ts'
import type { McpConnectionInfo } from '../src/shared/mcp.ts'

describe('MCP setup in the renderer', () => {
  it('requires only Pexels credentials for MCP and keeps API credential checks', () => {
    const settings = { llmProvider: 'openai', agentEngine: 'mcp' } as PublicSettings
    assert.equal(getMissingCredentials(settings), 'pexels')
    assert.equal(getMissingCredentials({ ...settings, pexelsKey: 'stored' }), null)
    assert.equal(getMissingCredentials({ ...settings, agentEngine: 'loop' }), 'both')
    assert.equal(
      getMissingCredentials({ ...settings, agentEngine: 'pipeline', pexelsKey: 'stored' }),
      'llm'
    )
    for (const llmProvider of ['openai', 'gemini', 'openrouter'] as const) {
      assert.equal(
        getMissingCredentials({
          ...settings,
          agentEngine: 'loop',
          llmProvider,
          pexelsKey: 'stored',
          [`${llmProvider}Key`]: 'stored'
        }),
        null
      )
    }
  })

  it('enables MCP on onboarding without saving empty AI keys', () => {
    const draft = {
      llmProvider: 'openai' as const,
      modelId: 'saved-model',
      downloadFolder: 'packs',
      keys: { openai: '', gemini: '', openrouter: '' },
      pexelsKey: 'pexels-key',
      useMcp: true
    }
    const settings = buildSettingsUpdates(draft)
    assert.equal(settings.agentEngine, 'mcp')
    assert.equal(settings.mcpEnabled, true)
    assert.equal(settings.isOnboarded, true)
    assert.equal(settings.pexelsKey, 'pexels-key')
    assert.equal('openaiKey' in settings, false)
    const apiSettings = buildSettingsUpdates({ ...draft, useMcp: false })
    assert.equal(apiSettings.agentEngine, 'loop')
    assert.equal('mcpEnabled' in apiSettings, false, 'does not disable an existing connection')
  })

  it('copies the live address and authentication token only for a running connection', () => {
    const info: McpConnectionInfo = {
      enabled: true,
      running: true,
      url: 'http://127.0.0.1:45678/mcp',
      token: 'private-token'
    }
    const config = JSON.parse(mcpClientConfig(info)!)
    assert.deepEqual(config.mcpServers.stockfinder, {
      type: 'http',
      url: info.url,
      headers: { Authorization: 'Bearer private-token' }
    })
    assert.equal(mcpClientConfig({ ...info, running: false }), null)
    assert.equal(mcpClientConfig({ ...info, url: null }), null)
    assert.equal(mcpClientConfig({ ...info, token: null }), null)
    assert.equal(
      mcpClientConfig(info, 'codex'),
      '[mcp_servers.stockfinder]\nurl = "http://127.0.0.1:45678/mcp"\nhttp_headers = { Authorization = "Bearer private-token" }'
    )
    assert.equal(
      mcpClientConfig(info, 'claude-code'),
      'claude mcp add --transport http stockfinder http://127.0.0.1:45678/mcp --header "Authorization: Bearer private-token"'
    )
  })
})
