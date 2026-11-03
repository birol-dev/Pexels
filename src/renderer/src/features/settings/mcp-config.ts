import type { McpConnectionInfo } from '../../../../shared/mcp'

export type McpClientConfigFormat = 'json' | 'codex' | 'claude-code'

/** Local HTTP clients need both the address and the private connection token. */
export function mcpClientConfig(
  info: McpConnectionInfo,
  format: McpClientConfigFormat = 'json'
): string | null {
  if (!info.running || !info.url || !info.token) return null
  if (format === 'codex') {
    return `[mcp_servers.stockfinder]\nurl = ${JSON.stringify(info.url)}\nhttp_headers = { Authorization = ${JSON.stringify(`Bearer ${info.token}`)} }`
  }
  if (format === 'claude-code') {
    return `claude mcp add --transport http stockfinder ${info.url} --header "Authorization: Bearer ${info.token}"`
  }
  return JSON.stringify(
    {
      mcpServers: {
        stockfinder: {
          type: 'http',
          url: info.url,
          headers: { Authorization: `Bearer ${info.token}` }
        }
      }
    },
    null,
    2
  )
}
