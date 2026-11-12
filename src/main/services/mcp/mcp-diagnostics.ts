import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { MCP_DIAGNOSTIC_CLIENT, type McpDiagnostics } from '../../../shared/mcp.ts'
import { getMcpConnectionInfo } from './mcp-server.ts'

/** Exercise the same authenticated HTTP transport an external app uses, without changing packs. */
export async function testMcpConnection(): Promise<McpDiagnostics> {
  const info = getMcpConnectionInfo()
  if (!info.running || !info.url || !info.token) throw new Error('Start the MCP server first.')
  const started = Date.now()
  const client = new Client({ name: MCP_DIAGNOSTIC_CLIENT, version: '1.0.0' })
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(info.url), {
        requestInit: {
          headers: { Authorization: `Bearer ${info.token}` },
          signal: AbortSignal.timeout(10000)
        }
      })
    )
    const { tools } = await client.listTools()
    const status = (await client.callTool({
      name: 'stockfinder_status',
      arguments: {}
    })) as CallToolResult
    if (status.isError || typeof status.structuredContent?.hasPexelsKey !== 'boolean') {
      throw new Error('Invalid status response.')
    }
    return {
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      hasPexelsKey: status.structuredContent.hasPexelsKey,
      tools: tools.map((tool) => ({
        name: tool.name,
        description: tool.description ?? '',
        readOnly: tool.annotations?.readOnlyHint === true
      }))
    }
  } catch {
    throw new Error('The local MCP test failed. Refresh the server status and retry.')
  } finally {
    await client.close().catch(() => undefined)
  }
}
