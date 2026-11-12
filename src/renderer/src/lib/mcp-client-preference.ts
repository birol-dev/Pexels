import { MCP_CLIENTS, type McpClientId } from '../../../shared/mcp-clients'

const KEY = 'stockfinder.mcp-client'

export function preferredMcpClient(): McpClientId {
  try {
    const saved = localStorage.getItem(KEY)
    return MCP_CLIENTS.find((client) => client.id === saved)?.id ?? 'codex'
  } catch {
    return 'codex'
  }
}

export function saveMcpClient(clientId: McpClientId): void {
  try {
    localStorage.setItem(KEY, clientId)
  } catch {
    // The current selection still works when storage is unavailable.
  }
}
