import { ipcMain } from 'electron'
import { getMcpConnectionInfo, syncMcpServer } from '../services/mcp/mcp-server.ts'

export function registerMcpHandlers(): void {
  ipcMain.handle('mcp:getConnectionInfo', () => getMcpConnectionInfo())
  ipcMain.handle('mcp:retryConnection', async () => {
    await syncMcpServer()
    return getMcpConnectionInfo()
  })
  ipcMain.handle('mcp:rotateToken', async () => {
    await syncMcpServer({ rotateToken: true })
    return getMcpConnectionInfo()
  })
}
