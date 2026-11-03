import { MCP_CLIENTS } from '../../../shared/mcp-clients.ts'
import type { McpConnectionInfo } from '../../../shared/mcp.ts'

/** Only native install handlers receive the private token; no website is involved. */
export function mcpClientInstallUrl(info: McpConnectionInfo, client: unknown): string {
  if (client !== 'cursor' && client !== 'vscode') {
    throw new Error('Choose Cursor or VS Code to install a connection directly.')
  }
  if (!info.enabled || !info.running || !info.url || !info.token) {
    throw new Error('Enable the StockFinder connection before adding it to your AI app.')
  }
  const address = new URL(info.url)
  if (
    address.protocol !== 'http:' ||
    address.hostname !== '127.0.0.1' ||
    address.pathname !== '/mcp' ||
    address.search ||
    address.hash ||
    address.username ||
    address.password
  ) {
    throw new Error('The StockFinder connection must run on this computer.')
  }
  const configuration = {
    url: info.url,
    headers: { Authorization: `Bearer ${info.token}` }
  }
  if (client === 'cursor') {
    const query = new URLSearchParams({
      name: 'stockfinder',
      config: Buffer.from(JSON.stringify(configuration)).toString('base64')
    })
    return `cursor://anysphere.cursor-deeplink/mcp/install?${query}`
  }
  return `vscode:mcp/install?${encodeURIComponent(
    JSON.stringify({ name: 'stockfinder', type: 'http', ...configuration })
  )}`
}

/** The renderer supplies a known client ID, never an address to open. */
export function mcpClientDocsUrl(client: unknown): string {
  const profile = MCP_CLIENTS.find((entry) => entry.id === client)
  if (!profile) throw new Error('Choose an AI app to open its setup guide.')
  return profile.docsUrl
}
