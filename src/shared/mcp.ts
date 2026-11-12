/** Local connection details. The token is only exposed to the app's private settings UI. */
export interface McpConnectionInfo {
  enabled: boolean
  running: boolean
  url: string | null
  token: string | null
  /** Last successful initialization, not a claim that a stateless client is still connected. */
  lastClientSeenAt?: string
  clientName?: string
  error?: string
}

export const MCP_PORT = 38477
export const MCP_DIAGNOSTIC_CLIENT = 'stockfinder-connection-check'

export interface McpDiagnostics {
  checkedAt: string
  durationMs: number
  hasPexelsKey: boolean
  tools: Array<{ name: string; description: string; readOnly: boolean }>
}
