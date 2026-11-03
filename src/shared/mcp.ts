/** Local connection details. The token is only exposed to the app's private settings UI. */
export interface McpConnectionInfo {
  enabled: boolean
  running: boolean
  url: string | null
  token: string | null
  error?: string
}

export const MCP_PORT = 38477
