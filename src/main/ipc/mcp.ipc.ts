import { ipcMain, shell } from 'electron'
import { testMcpConnection } from '../services/mcp/mcp-diagnostics.ts'
import { mcpClientDocsUrl, mcpClientInstallUrl } from '../services/mcp/mcp-client-actions.ts'
import { getMcpConnectionInfo, syncMcpServer } from '../services/mcp/mcp-server.ts'

export function registerMcpHandlers(): void {
  ipcMain.handle('mcp:testConnection', () => testMcpConnection())
  ipcMain.handle('mcp:getConnectionInfo', () => getMcpConnectionInfo())
  ipcMain.handle('mcp:retryConnection', async () => {
    await syncMcpServer()
    return getMcpConnectionInfo()
  })
  ipcMain.handle('mcp:rotateToken', async () => {
    await syncMcpServer({ rotateToken: true })
    return getMcpConnectionInfo()
  })
  ipcMain.handle('mcp:openClient', async (_, client: unknown) => {
    const url = mcpClientInstallUrl(getMcpConnectionInfo(), client)
    try {
      await shell.openExternal(url)
    } catch {
      // OS errors may include the complete install URI and its private token.
      throw new Error(
        'Could not open the AI app. Install it first, or use the copied setup instructions.'
      )
    }
  })
  ipcMain.handle('mcp:openSetupDocs', async (_, client: unknown) => {
    const url = mcpClientDocsUrl(client)
    try {
      await shell.openExternal(url)
    } catch {
      throw new Error('Could not open the setup guide in your browser.')
    }
  })
}
