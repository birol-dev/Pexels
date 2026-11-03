import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { MCP_PORT, type McpConnectionInfo } from '../../../shared/mcp.ts'
import { SettingsStore } from '../storage/settings-store.ts'
import { SecureSecrets } from '../storage/secure-secrets.ts'
import { createMcpProtocolServer } from './mcp-tools.ts'

/** HTTP is stateless; the existing job registry owns all work across requests and reconnects. */
export class McpHttpServer {
  public url: string | null = null
  public clientActivity: Pick<McpConnectionInfo, 'lastClientSeenAt' | 'clientName'> | null = null
  private httpServer: Server | null = null
  private protocols = new Set<McpServer>()
  private token: string
  private port: number

  constructor(token: string, port = MCP_PORT) {
    if (!token.trim()) throw new Error('An MCP access token is required.')
    this.token = token
    this.port = port
  }

  public async start(): Promise<string> {
    if (this.url) return this.url
    const http = createServer((request, response) => {
      this.handleRequest(request, response).catch(() => {
        if (!response.headersSent) response.writeHead(500).end('MCP request failed.')
        else response.end()
      })
    })
    http.headersTimeout = 15000
    http.requestTimeout = 120000
    this.httpServer = http
    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error): void => reject(error)
        http.once('error', onError)
        http.listen(this.port, '127.0.0.1', () => {
          http.removeListener('error', onError)
          resolve()
        })
      })
    } catch (error) {
      this.httpServer = null
      http.close()
      throw error
    }
    const address = http.address()
    if (!address || typeof address === 'string') throw new Error('Unable to bind the MCP server.')
    this.url = `http://127.0.0.1:${address.port}/mcp`
    return this.url
  }

  public async stop(): Promise<void> {
    const http = this.httpServer
    this.httpServer = null
    this.url = null
    this.clientActivity = null
    if (!http) return
    const closed = new Promise<void>((resolve) => http.close(() => resolve()))
    http.closeAllConnections()
    await Promise.all([...this.protocols].map((server) => server.close().catch(() => undefined)))
    this.protocols.clear()
    await closed
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.url !== '/mcp') {
      response.writeHead(404).end('Not found.')
      return
    }
    const authority = this.url ? new URL(this.url).host : ''
    const allowedHosts = [authority, authority.replace('127.0.0.1', 'localhost')]
    // Browser pages have no access, even if they discover the private local address.
    if (
      request.headers.origin !== undefined ||
      !allowedHosts.includes(request.headers.host ?? '')
    ) {
      response.writeHead(403).end('Only local MCP clients may connect.')
      return
    }
    const expected = Buffer.from(this.token)
    const bearer = /^Bearer[\t ]+(\S+)$/i.exec(request.headers.authorization ?? '')
    const actual = Buffer.from(bearer?.[1] ?? '')
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      response
        .writeHead(401, { 'WWW-Authenticate': 'Bearer realm="StockFinder"' })
        .end('Access token required.')
      return
    }
    if (request.method !== 'POST') {
      response.writeHead(405, { Allow: 'POST' }).end('Use MCP Streamable HTTP POST requests.')
      return
    }

    const server = createMcpProtocolServer()
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      maxRequestBodySize: 1024 * 1024,
      enableDnsRebindingProtection: true,
      allowedHosts,
      allowedOrigins: []
    })
    this.protocols.add(server)
    const servingHttp = this.httpServer
    response.once('close', () => {
      this.protocols.delete(server)
      server.close().catch(() => undefined)
    })
    try {
      await server.connect(transport)
      await transport.handleRequest(request, response)
      const client = server.server.getClientVersion()
      // Each HTTP request has its own SDK server. Only a validated initialize sets clientInfo.
      if (client && response.statusCode === 200 && this.httpServer === servingHttp && this.url) {
        this.clientActivity = {
          lastClientSeenAt: new Date().toISOString(),
          clientName: client.name.replace(/\p{Cc}|\p{Cf}/gu, '').slice(0, 80)
        }
      }
    } catch (error) {
      this.protocols.delete(server)
      await server.close().catch(() => undefined)
      throw error
    }
  }
}

let localServer: McpHttpServer | null = null
let connection: McpConnectionInfo = { enabled: false, running: false, url: null, token: null }
let syncQueue: Promise<void> = Promise.resolve()
let shuttingDown = false

/** Serialize settings changes so rapid enable/disable clicks cannot leave a hidden listener. */
export async function syncMcpServer(options: { rotateToken?: boolean } = {}): Promise<void> {
  syncQueue = syncQueue
    .catch(() => undefined)
    .then(async () => {
      if (shuttingDown) return
      const settings = await SettingsStore.getSettings()
      if (!settings.mcpEnabled) {
        await stopMcpServer()
        connection = { enabled: false, running: false, url: null, token: null }
        if (options.rotateToken)
          throw new Error('Enable the MCP connection before replacing its token.')
        return
      }
      if (localServer?.url && !options.rotateToken) return
      try {
        let token: string
        if (options.rotateToken) {
          token = randomBytes(32).toString('hex')
          // Persist the replacement first. A storage failure leaves the current connection usable.
          await SecureSecrets.setSecret('mcpToken', token)
          await stopMcpServer()
        } else {
          token = await SecureSecrets.getSecret('mcpToken')
        }
        if (!token) {
          token = randomBytes(32).toString('hex')
          await SecureSecrets.setSecret('mcpToken', token)
        }
        const server = new McpHttpServer(token)
        const url = await server.start()
        if (shuttingDown) {
          await server.stop()
          return
        }
        localServer = server
        connection = { enabled: true, running: true, url, token }
      } catch (error) {
        if (localServer?.url) throw error
        connection = {
          enabled: true,
          running: false,
          url: null,
          token: null,
          error:
            (error as NodeJS.ErrnoException).code === 'EADDRINUSE'
              ? `Port ${MCP_PORT} is already in use. Close the other StockFinder instance or the app using that port, then enable MCP again.`
              : error instanceof Error
                ? error.message
                : 'Unable to start MCP.'
        }
      }
    })
  await syncQueue
}

export function getMcpConnectionInfo(): McpConnectionInfo {
  return { ...connection, ...localServer?.clientActivity }
}

export async function stopMcpServer(): Promise<void> {
  const server = localServer
  localServer = null
  connection = { ...connection, running: false, url: null, token: null }
  await server?.stop()
}

/** Prevent an in-flight settings write from opening a new listener after quit begins. */
export async function shutdownMcpServer(): Promise<void> {
  shuttingDown = true
  const stopping = stopMcpServer()
  await syncQueue.catch(() => undefined)
  await stopping
}
