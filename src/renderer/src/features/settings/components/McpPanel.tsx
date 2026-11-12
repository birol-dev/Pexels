import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowSquareOutIcon,
  ArrowsClockwiseIcon,
  CheckCircleIcon,
  ArrowRightIcon,
  MagnifyingGlassIcon,
  CopyIcon,
  PlugsConnectedIcon,
  ShieldCheckIcon
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@renderer/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { api } from '@renderer/lib/api-client'
import { preferredMcpClient, saveMcpClient } from '@renderer/lib/mcp-client-preference'
import { ipcErrorMessage, useAppStore, type PublicSettings } from '@renderer/lib/store'
import {
  MCP_CLIENTS,
  MCP_CONNECTION_TEST_PROMPT,
  MCP_STARTER_PROMPT,
  mcpClientConfig,
  mcpSetupPrompt,
  type McpClientId
} from '../../../../../shared/mcp-clients'
import type { McpConnectionInfo, McpDiagnostics } from '../../../../../shared/mcp'
import type { SettingsForm } from '../hooks/useSettingsForm'
import { SettingsField } from './SettingsField'
import { Input } from '@renderer/components/ui/input'
import { cn } from '@renderer/lib/utils'
import { ToggleRow } from './ToggleRow'

interface McpPanelProps {
  settings: PublicSettings
  form: SettingsForm
}

export function McpPanel({ settings, form }: McpPanelProps): React.JSX.Element {
  const navigate = useAppStore((s) => s.navigate)
  const [section, setSection] = useState<'tools' | 'controls'>('tools')
  const [diagnostics, setDiagnostics] = useState<McpDiagnostics | null>(null)
  const [testing, setTesting] = useState(false)
  const [testError, setTestError] = useState<string | null>(null)
  const [toolQuery, setToolQuery] = useState('')
  const [readOnlyTools, setReadOnlyTools] = useState(false)
  const persistedEnabled = useAppStore((s) => s.settings?.mcpEnabled)
  const hasPexelsKey = useAppStore((s) => Boolean(s.settings?.pexelsKey))
  const confirm = useAppStore((s) => s.confirm)
  const [info, setInfo] = useState<McpConnectionInfo | null>(null)
  const [refreshing, setRefreshing] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [clientId, setClientId] = useState<McpClientId>(preferredMcpClient)
  const [openingClient, setOpeningClient] = useState(false)
  const connectionRequest = useRef(0)
  const pendingReads = useRef(0)
  const client = MCP_CLIENTS.find((entry) => entry.id === clientId)!
  const isMcp = settings.agentEngine === 'mcp'
  const activeConnection = persistedEnabled && info?.running ? info : null
  const config = activeConnection ? mcpClientConfig(activeConnection, clientId) : null
  const manual = clientId === 'other'
  const setupPrompt =
    activeConnection && !manual ? mcpSetupPrompt(activeConnection, clientId) : null
  const busy = refreshing || form.saving || openingClient || testing
  const canSetUp = Boolean(config) && !busy
  const lastConnectedAt = activeConnection?.lastClientSeenAt

  const readConnection = useCallback(
    async (
      action: 'read' | 'retry' | 'rotate' = 'read',
      background = false
    ): Promise<McpConnectionInfo | null> => {
      // A status poll must not supersede a token replacement or a manual retry.
      if (background && pendingReads.current > 0) return null
      pendingReads.current++
      const request = ++connectionRequest.current
      try {
        const connection = await (action === 'rotate'
          ? api.mcp.rotateToken()
          : action === 'retry'
            ? api.mcp.retryConnection()
            : api.mcp.getConnectionInfo())
        if (request !== connectionRequest.current) return null
        setInfo(connection)
        setError(null)
        return connection
      } catch (err) {
        if (request !== connectionRequest.current) return null
        setInfo(null)
        setError(ipcErrorMessage(err))
        return null
      } finally {
        pendingReads.current--
        if (request === connectionRequest.current) setRefreshing(false)
      }
    },
    []
  )

  useEffect(() => {
    const requests = connectionRequest
    let active = true
    void Promise.resolve().then(() => {
      if (active) void readConnection()
    })
    const timer = persistedEnabled
      ? window.setInterval(() => {
          if (document.visibilityState !== 'hidden') void readConnection('read', true)
        }, 5000)
      : undefined
    return () => {
      active = false
      window.clearInterval(timer)
      requests.current++
    }
  }, [persistedEnabled, readConnection])

  const refreshConnection = (): void => {
    setRefreshing(true)
    void readConnection(persistedEnabled ? 'retry' : 'read')
  }

  const copy = async (content: string | null, label: string): Promise<void> => {
    if (!content) return
    try {
      await navigator.clipboard.writeText(content)
      toast.success(`${label} copied.`)
    } catch {
      toast.error('Could not copy. Try again, or use the manual setup steps.')
    }
  }

  const selectClient = (value: string): void => {
    if (!MCP_CLIENTS.some((entry) => entry.id === value)) return
    setClientId(value as McpClientId)
    saveMcpClient(value as McpClientId)
  }

  const openClient = async (): Promise<void> => {
    if (!client.installTarget) return
    setOpeningClient(true)
    try {
      await api.mcp.openClient(client.installTarget)
      toast.success(
        `Finish adding StockFinder in ${client.name}, then send the connection check in Step 3.`
      )
    } catch {
      toast.error(`Could not open ${client.name}. Copy the setup instructions below instead.`)
    } finally {
      setOpeningClient(false)
    }
  }

  const openDocs = async (): Promise<void> => {
    try {
      await api.mcp.openSetupDocs(clientId)
    } catch {
      toast.error('Could not open the guide. You can use the setup steps below.')
    }
  }

  const replaceToken = async (): Promise<void> => {
    const accepted = await confirm(
      'Replace the private access key?',
      'Each connected app will need the new key to use StockFinder again.',
      { confirmText: 'Replace key', cancelText: 'Keep current key' }
    )
    if (!accepted) return
    setDiagnostics(null)
    setTestError(null)
    setRefreshing(true)
    const result = await readConnection('rotate')
    if (result?.running && result.token)
      toast.success('Access key replaced. Set up each AI app again to reconnect.')
  }

  const testConnection = async (): Promise<void> => {
    setTesting(true)
    setSection('tools')
    setTestError(null)
    setDiagnostics(null)
    try {
      setDiagnostics(await api.mcp.testConnection())
    } catch (err) {
      setTestError(ipcErrorMessage(err))
    } finally {
      setTesting(false)
    }
  }

  const card = 'rounded-3xl border border-border bg-surface-container-low p-6'
  const tools =
    diagnostics?.tools.filter(
      (tool) =>
        (!readOnlyTools || tool.readOnly) &&
        `${tool.name} ${tool.description}`.toLowerCase().includes(toolQuery.toLowerCase())
    ) ?? []
  const statusLabel = form.saving
    ? 'Saving…'
    : refreshing
      ? 'Checking…'
      : error
        ? 'Could not check the connection'
        : info?.running
          ? lastConnectedAt
            ? 'An AI app has connected'
            : 'Waiting for an AI app'
          : info?.enabled
            ? 'Connection needs attention'
            : 'AI connection is off'

  return (
    <div className="flex flex-col gap-7">
      <header>
        <h1 className="font-headline-lg text-headline-lg text-on-surface">Connect your AI</h1>
      </header>

      {form.saveError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-error/40 p-4 text-sm text-error"
        >
          <p>Your changes were not saved. {ipcErrorMessage(form.saveError)}</p>
          <Button variant="outline" disabled={form.saving} onClick={form.retrySave}>
            Try saving again
          </Button>
        </div>
      )}

      <section
        aria-label="AI connection status"
        className="flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-surface-container p-6"
      >
        <div className="flex items-center gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-background">
            {lastConnectedAt ? (
              <CheckCircleIcon size={24} aria-hidden />
            ) : (
              <PlugsConnectedIcon size={24} aria-hidden />
            )}
          </span>
          <div>
            <p role="status" className="text-base font-semibold">
              {statusLabel}
            </p>
            {!error && !info?.error && !form.saving && !refreshing && (
              <p className="mt-1 text-sm text-outline">
                {lastConnectedAt
                  ? 'Keep StockFinder open while your AI app makes packs.'
                  : info?.running
                    ? 'Choose your app below to get started.'
                    : 'Turn it on to let your AI app use StockFinder.'}
              </p>
            )}
          </div>
        </div>
        {!settings.mcpEnabled ? (
          <Button disabled={busy} onClick={() => form.updateNow({ mcpEnabled: true })}>
            Turn on connection
          </Button>
        ) : (
          !info?.running && (
            <Button variant="outline" disabled={busy} onClick={refreshConnection}>
              Try again
            </Button>
          )
        )}
        {(error || info?.error) && (
          <p role="alert" className="w-full text-sm text-error">
            {error || info?.error}
          </p>
        )}
      </section>

      <ol
        aria-label="Connect your AI in three steps"
        className="divide-y divide-border rounded-3xl border border-border bg-surface-container-low px-6 sm:px-8"
      >
        <li className="flex gap-4 py-7 sm:gap-6">
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-container text-sm text-outline"
          >
            1
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="mb-4 text-lg font-semibold">Choose your AI app</h2>
            <Select value={clientId} onValueChange={selectClient}>
              <SelectTrigger aria-label="AI app" className="w-full sm:max-w-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MCP_CLIENTS.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {entry.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-3 text-sm text-outline">Use an app installed on this computer.</p>
            {client.limitation && (
              <div className="mt-4 rounded-xl bg-surface-container p-4 text-sm">
                <p>{client.limitation}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => selectClient('claude-code')}>
                    Choose Claude Code
                  </Button>
                  <Button size="sm" variant="link" onClick={openDocs}>
                    Claude Desktop guide <ArrowSquareOutIcon aria-hidden />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </li>
        {client.supported !== false && (
          <>
            <li className="flex gap-4 py-7 sm:gap-6">
              <span
                aria-hidden
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-container text-sm text-outline"
              >
                2
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold">
                  {manual ? 'Add StockFinder in your app' : `Add StockFinder to ${client.name}`}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-outline">
                  {manual
                    ? 'In your app’s MCP settings, add a server called StockFinder. Choose Streamable HTTP and use the address and authorization below.'
                    : client.installTarget
                      ? `Open ${client.name} with the button below and confirm you want to add StockFinder.`
                      : `Copy the instructions and paste them into a new chat in ${client.name}. Ask it to connect StockFinder, then follow its instructions.`}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {manual && (
                    <>
                      <Button
                        variant="outline"
                        disabled={!canSetUp}
                        onClick={() => copy(activeConnection?.url ?? null, 'Connection address')}
                      >
                        <CopyIcon aria-hidden />
                        Copy server address
                      </Button>
                      <Button
                        variant="outline"
                        disabled={!canSetUp}
                        onClick={() =>
                          copy(
                            activeConnection?.token ? `Bearer ${activeConnection.token}` : null,
                            'Authorization value'
                          )
                        }
                      >
                        <CopyIcon aria-hidden />
                        Copy Authorization value
                      </Button>
                    </>
                  )}
                  {client.installTarget && (
                    <Button onClick={openClient} disabled={!canSetUp}>
                      <ArrowSquareOutIcon aria-hidden />
                      {openingClient
                        ? 'Opening…'
                        : `Open ${client.installTarget === 'vscode' ? 'VS Code' : 'Cursor'} to connect`}
                    </Button>
                  )}
                  {!manual && (
                    <Button
                      variant={client.installTarget ? 'outline' : 'default'}
                      onClick={() => copy(setupPrompt, 'Setup instructions')}
                      disabled={!canSetUp || !setupPrompt}
                    >
                      <CopyIcon aria-hidden />
                      Copy setup instructions
                    </Button>
                  )}
                </div>
                <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-outline">
                  <ShieldCheckIcon size={15} className="shrink-0" aria-hidden />
                  {manual
                    ? 'Name the header Authorization. Its value includes your private access key.'
                    : 'Includes a private access key. Share only with the AI app you trust.'}
                </p>
                <details key={clientId} className="mt-5 text-sm">
                  <summary className="cursor-pointer text-outline">
                    Need help? Set up manually
                  </summary>
                  <ol className="mt-4 list-decimal space-y-3 pl-5 text-outline">
                    {client.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                  {client.configPath && (
                    <p className="mt-4 break-all font-mono text-xs text-outline">
                      {client.configPath}
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!canSetUp}
                      onClick={() => copy(config, 'Configuration')}
                    >
                      <CopyIcon aria-hidden />
                      Copy configuration
                    </Button>
                    <Button variant="link" size="sm" onClick={openDocs}>
                      Open {client.name} guide <ArrowSquareOutIcon aria-hidden />
                    </Button>
                  </div>
                  {config && (
                    <details className="mt-4">
                      <summary className="cursor-pointer text-outline">
                        Show configuration and private key
                      </summary>
                      <pre
                        tabIndex={0}
                        aria-label={client.configLabel}
                        className="mt-3 max-h-72 overflow-auto rounded-xl bg-background p-4 text-xs whitespace-pre-wrap [overflow-wrap:anywhere]"
                      >
                        {config}
                      </pre>
                    </details>
                  )}
                </details>
              </div>
            </li>
            <li className="flex gap-4 py-7 sm:gap-6">
              <span
                aria-hidden
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-container text-sm text-outline"
              >
                3
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold">Check the connection</h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-outline">
                  Send this message in {manual ? 'your AI app' : client.name}. It asks your AI to
                  check that it can use StockFinder.
                </p>
                <Button
                  className="mt-4"
                  variant="outline"
                  onClick={() => copy(MCP_CONNECTION_TEST_PROMPT, 'Connection check')}
                  disabled={!activeConnection || busy}
                >
                  <CopyIcon aria-hidden />
                  Copy connection check
                </Button>
              </div>
            </li>
          </>
        )}
      </ol>

      {lastConnectedAt && (
        <section className={card} aria-labelledby="mcp-start-title">
          <h2 id="mcp-start-title" className="text-lg font-semibold">
            Make a pack with your AI
          </h2>
          <p className="mt-2 text-sm text-outline">
            Paste the starter message into your connected app, add your script or idea, and send it.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => copy(MCP_STARTER_PROMPT, 'Starter message')}>
              <CopyIcon aria-hidden />
              Copy starter message
            </Button>
            <Button variant="ghost" onClick={() => navigate('run')}>
              View pack progress <ArrowRightIcon aria-hidden />
            </Button>
          </div>
        </section>
      )}
      {!hasPexelsKey && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-container p-5">
          <p className="text-sm">Before finding footage, add your free Pexels key.</p>
          <Button size="sm" variant="outline" onClick={() => navigate('settings')}>
            Add Pexels key
          </Button>
        </div>
      )}

      <details className="rounded-3xl border border-border p-6">
        <summary className="cursor-pointer text-sm font-medium">
          Connection details & settings
        </summary>
        <div className="mt-6 flex flex-col gap-6">
          <div className="grid gap-5 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs text-outline">Connection address</p>
              <p className="mt-2 break-all font-mono text-xs">{info?.url ?? 'Connection is off'}</p>
            </div>
            <div>
              <p className="text-xs text-outline">Last connection</p>
              <p className="mt-2">
                {lastConnectedAt
                  ? activeConnection?.clientName || 'AI app'
                  : 'No app connected yet'}
              </p>
              {lastConnectedAt && (
                <p className="mt-1 text-xs text-outline">
                  {new Date(lastConnectedAt).toLocaleString()}
                </p>
              )}
            </div>
            <div>
              <p className="text-xs text-outline">Pexels access</p>
              <button
                type="button"
                onClick={() => navigate('settings')}
                className="mt-2 cursor-pointer underline underline-offset-4"
              >
                {hasPexelsKey ? 'Key saved · manage' : 'Add key'}
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy || !activeConnection} onClick={testConnection}>
              <CheckCircleIcon className={testing ? 'animate-pulse' : ''} aria-hidden />
              {testing ? 'Checking…' : 'Check StockFinder'}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={refreshConnection}>
              <ArrowsClockwiseIcon className={refreshing ? 'animate-spin' : ''} aria-hidden />
              Refresh status
            </Button>
          </div>
          <p className="text-xs text-outline">
            This checks StockFinder itself. To check your AI app, send the message in Step 3.
          </p>
          {testError && (
            <p role="alert" className="text-sm text-error">
              {testError}
            </p>
          )}
          {diagnostics && activeConnection && (
            <div role="status">
              <p className="text-sm">StockFinder check passed.</p>
              <p className="mt-1 text-xs text-outline">
                {diagnostics.tools.length} tools available · {diagnostics.durationMs} ms · Checked{' '}
                {new Date(diagnostics.checkedAt).toLocaleTimeString()}
                {!diagnostics.hasPexelsKey && ' · Pexels key missing'}
              </p>
            </div>
          )}
          <nav
            aria-label="Advanced connection settings"
            className="flex gap-1 border-b border-border"
          >
            {(['tools', 'controls'] as const).map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={section === id}
                onClick={() => setSection(id)}
                className={cn(
                  'cursor-pointer border-b-2 px-5 py-3 text-sm font-medium',
                  section === id ? 'border-on-surface' : 'border-transparent text-outline'
                )}
              >
                {id === 'tools' ? 'Available tools' : 'Settings'}
              </button>
            ))}
          </nav>
          {section === 'tools' && (
            <section className={card} aria-labelledby="mcp-tools-title">
              <h2 id="mcp-tools-title" className="sr-only">
                Available tools
              </h2>
              {diagnostics && activeConnection ? (
                <>
                  <div className="mt-6 flex flex-wrap items-center gap-3">
                    <div className="relative min-w-48 flex-1">
                      <MagnifyingGlassIcon
                        className="absolute top-3 left-3 text-outline"
                        size={16}
                        aria-hidden
                      />
                      <Input
                        aria-label="Search MCP tools"
                        placeholder="Search tools"
                        value={toolQuery}
                        onChange={(event) => setToolQuery(event.target.value)}
                        className="pl-9"
                      />
                    </div>
                    <Button
                      variant={readOnlyTools ? 'default' : 'outline'}
                      aria-pressed={readOnlyTools}
                      onClick={() => setReadOnlyTools((value) => !value)}
                    >
                      Read only
                    </Button>
                  </div>
                  <ul className="mt-4 divide-y divide-border">
                    {tools.map((tool) => (
                      <li key={tool.name} className="py-5">
                        <div className="flex flex-wrap items-center gap-3">
                          <code className="break-all text-sm font-medium">{tool.name}</code>
                          <span className="rounded-full bg-surface-container px-2.5 py-1 text-xs text-outline">
                            {tool.readOnly ? 'Read only' : 'Workflow action'}
                          </span>
                        </div>
                        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-outline">
                          {tool.description}
                        </p>
                      </li>
                    ))}
                  </ul>
                  {!tools.length && (
                    <p className="py-10 text-center text-sm text-outline">
                      No tools match your search.
                    </p>
                  )}
                </>
              ) : (
                <div className="py-14 text-center">
                  <PlugsConnectedIcon size={32} className="mx-auto mb-4 text-outline" aria-hidden />
                  <p className="text-sm text-outline">
                    {activeConnection
                      ? 'Use Check StockFinder to load the tools.'
                      : 'Turn on the AI connection to see the available tools.'}
                  </p>
                </div>
              )}
            </section>
          )}

          {section === 'controls' && (
            <div className="grid items-start gap-5 xl:grid-cols-2">
              <section className={card} aria-labelledby="mcp-controls-title">
                <h2 id="mcp-controls-title" className="mb-6 text-lg font-semibold">
                  Connection settings
                </h2>
                <ToggleRow
                  id="mcp-enabled"
                  label="Allow AI apps to use StockFinder"
                  description="Starts with StockFinder. You can still make packs using an AI API key."
                  checked={settings.mcpEnabled === true}
                  disabled={busy}
                  onCheckedChange={(mcpEnabled) => {
                    setDiagnostics(null)
                    setTestError(null)
                    form.updateNow({ mcpEnabled })
                  }}
                />
                <div className="mt-6 border-t border-border pt-6">
                  <SettingsField
                    label="Run new packs with"
                    htmlFor="execution-mode"
                    hint="Existing packs keep their original mode."
                  >
                    <Select
                      value={isMcp ? 'mcp' : 'api'}
                      disabled={busy}
                      onValueChange={(mode) =>
                        form.updateNow(
                          mode === 'mcp'
                            ? { agentEngine: 'mcp', mcpEnabled: true }
                            : { agentEngine: 'loop' }
                        )
                      }
                    >
                      <SelectTrigger id="execution-mode" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="api">AI API key</SelectItem>
                        <SelectItem value="mcp">Connected AI app (MCP)</SelectItem>
                      </SelectContent>
                    </Select>
                  </SettingsField>
                </div>
                <div className="mt-6 border-t border-border pt-6">
                  <p className="text-sm font-medium">Private access key</p>
                  <p className="mt-2 text-sm leading-relaxed text-outline">
                    Replace this key to disconnect apps that already have access. You will need to
                    set them up again.
                  </p>
                  <Button
                    className="mt-4"
                    variant="outline"
                    disabled={busy || !info?.running}
                    onClick={replaceToken}
                  >
                    Replace access key
                  </Button>
                </div>
              </section>
              <section className={card} aria-labelledby="mcp-safety-title">
                <h2 id="mcp-safety-title" className="mb-6 text-lg font-semibold">
                  Download controls
                </h2>
                <div className="space-y-6">
                  <ToggleRow
                    id="mcp-approval"
                    label="Review before downloading"
                    description="Approve selections in StockFinder. AI apps cannot bypass this."
                    checked={settings.requireApprovalBeforeDownload}
                    onCheckedChange={(requireApprovalBeforeDownload) =>
                      form.updateNow({ requireApprovalBeforeDownload })
                    }
                  />
                  <ToggleRow
                    id="mcp-explicit"
                    label="Skip explicit searches"
                    description="Block explicit search queries."
                    checked={settings.skipExplicitQueries}
                    onCheckedChange={(skipExplicitQueries) =>
                      form.updateNow({ skipExplicitQueries })
                    }
                  />
                  <ToggleRow
                    id="mcp-people"
                    label="Avoid people & faces"
                    description="Filter out footage described as showing people or faces."
                    checked={settings.avoidPeopleAndFaces}
                    onCheckedChange={(avoidPeopleAndFaces) =>
                      form.updateNow({ avoidPeopleAndFaces })
                    }
                  />
                </div>
                <p className="mt-6 border-t border-border pt-5 text-xs leading-relaxed text-outline">
                  Applies to new packs in both MCP and AI API mode. Existing packs retain their
                  saved controls.
                </p>
                <Button variant="link" className="mt-3 px-0" onClick={() => navigate('settings')}>
                  All app settings <ArrowRightIcon aria-hidden />
                </Button>
              </section>
            </div>
          )}
        </div>
      </details>
    </div>
  )
}
