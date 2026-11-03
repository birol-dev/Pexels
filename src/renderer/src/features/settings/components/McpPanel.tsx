import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowSquareOutIcon,
  ArrowsClockwiseIcon,
  CheckCircleIcon,
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
import { useAppStore, type PublicSettings } from '@renderer/lib/store'
import {
  MCP_CLIENTS,
  MCP_CONNECTION_TEST_PROMPT,
  MCP_STARTER_PROMPT,
  mcpClientConfig,
  mcpSetupPrompt,
  type McpClientId
} from '../../../../../shared/mcp-clients'
import type { McpConnectionInfo } from '../../../../../shared/mcp'
import type { SettingsForm } from '../hooks/useSettingsForm'
import { SettingsField } from './SettingsField'
import { SettingsSection } from './SettingsSection'
import { ToggleRow } from './ToggleRow'

interface McpPanelProps {
  settings: PublicSettings
  form: SettingsForm
}

const CLIENT_PREFERENCE = 'stockfinder.mcp-client'

function preferredClient(): McpClientId {
  try {
    const saved = localStorage.getItem(CLIENT_PREFERENCE)
    return MCP_CLIENTS.find((client) => client.id === saved)?.id ?? 'codex'
  } catch {
    return 'codex'
  }
}

function StepHeading({
  number,
  children
}: {
  number: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <h3 className="flex items-center gap-3 text-sm font-semibold text-on-surface">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-container text-xs font-medium text-outline">
        {number}
      </span>
      {children}
    </h3>
  )
}

export function McpPanel({ settings, form }: McpPanelProps): React.JSX.Element {
  const persistedEnabled = useAppStore((s) => s.settings?.mcpEnabled)
  const persistedEngine = useAppStore((s) => s.settings?.agentEngine)
  const hasPexelsKey = useAppStore((s) => Boolean(s.settings?.pexelsKey))
  const confirm = useAppStore((s) => s.confirm)
  const [info, setInfo] = useState<McpConnectionInfo | null>(null)
  const [refreshing, setRefreshing] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [clientId, setClientId] = useState<McpClientId>(preferredClient)
  const [openingClient, setOpeningClient] = useState(false)
  const connectionRequest = useRef(0)
  const pendingReads = useRef(0)
  const client = MCP_CLIENTS.find((entry) => entry.id === clientId)!
  const isMcp = settings.agentEngine === 'mcp'
  const config = persistedEnabled && info?.enabled ? mcpClientConfig(info, clientId) : null
  const setupPrompt = persistedEnabled && info?.enabled ? mcpSetupPrompt(info, clientId) : null
  const busy = refreshing || form.saving || openingClient
  const canSetUp = Boolean(config) && !busy
  const verified = Boolean(persistedEnabled && info?.running && info.lastClientSeenAt)
  const unsavedConnection =
    form.saveError &&
    ((settings.agentEngine ?? 'loop') !== (persistedEngine ?? 'loop') ||
      Boolean(settings.mcpEnabled) !== Boolean(persistedEnabled))

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
        setError(err instanceof Error ? err.message : 'Could not read the MCP connection.')
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

  const copy = async (content: string | null, label: string): Promise<void> => {
    if (!content) return
    try {
      await navigator.clipboard.writeText(content)
      toast.success(`${label} copied.`)
    } catch {
      toast.error('Could not copy. Expand the text below and select it to copy manually.')
    }
  }

  const selectClient = (value: string): void => {
    if (!MCP_CLIENTS.some((entry) => entry.id === value)) return
    setClientId(value as McpClientId)
    try {
      localStorage.setItem(CLIENT_PREFERENCE, value)
    } catch {
      /* The selection still works without saved preferences. */
    }
  }

  const openClient = async (): Promise<void> => {
    if (!client.installTarget) return
    setOpeningClient(true)
    try {
      await api.mcp.openClient(client.installTarget)
      toast.success(
        `Finish adding StockFinder in ${client.name}, then try the connection test below.`
      )
    } catch {
      toast.error(
        `Could not open ${client.name}. Use the setup prompt or manual configuration below.`
      )
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
      'Replace the MCP connection token?',
      'Every connected AI app will need the new configuration to reconnect. Replace the private token now?',
      { confirmText: 'Replace token', cancelText: 'Keep current token' }
    )
    if (!accepted) return
    setRefreshing(true)
    const result = await readConnection('rotate')
    if (result?.running && result.token)
      toast.success('Connection token replaced. Add StockFinder again in each AI app.')
  }

  return (
    <SettingsSection
      id="settings-mcp"
      title="Connect your AI app"
      description="Use the AI app you already have to plan shots and find footage. StockFinder only needs your free Pexels key."
    >
      {unsavedConnection && (
        <p role="alert" className="text-sm text-error">
          These connection choices have not been saved. New packs still use{' '}
          {persistedEngine === 'mcp' ? 'your connected MCP app' : 'an AI API key'}. The live
          connection status below reflects your saved settings. Use Retry saving above.
        </p>
      )}
      <div className="grid items-center gap-6 lg:grid-cols-2">
        <SettingsField
          label="Run new packs with"
          htmlFor="execution-mode"
          hint="Existing packs keep the mode they started with."
        >
          <Select
            value={isMcp ? 'mcp' : 'api'}
            onValueChange={(mode) =>
              form.updateNow(
                mode === 'mcp' ? { agentEngine: 'mcp', mcpEnabled: true } : { agentEngine: 'loop' }
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
        <ToggleRow
          id="mcp-enabled"
          label="Enable local MCP connection"
          description="Keep StockFinder open while your AI app works on this computer."
          checked={settings.mcpEnabled === true}
          onCheckedChange={(mcpEnabled) => form.updateNow({ mcpEnabled })}
        />
      </div>
      <div className="rounded-2xl border border-border bg-surface-container-low p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-background text-on-surface">
              {verified ? (
                <CheckCircleIcon size={22} aria-hidden />
              ) : (
                <PlugsConnectedIcon size={22} aria-hidden />
              )}
            </span>
            <div className="min-w-0">
              <p role="status" className="text-sm font-medium text-on-surface">
                {form.saving
                  ? 'Updating connection…'
                  : refreshing
                    ? 'Checking connection…'
                    : error
                      ? 'Connection status unavailable'
                      : verified
                        ? 'Your AI app reached StockFinder'
                        : info?.running
                          ? 'Ready to connect'
                          : info?.enabled
                            ? 'MCP could not start'
                            : 'MCP connection is off'}
              </p>
              <p className="mt-0.5 text-xs text-outline">
                {verified
                  ? `Last checked${info?.clientName ? ` by ${info.clientName}` : ''} at ${new Date(info!.lastClientSeenAt!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`
                  : info?.running
                    ? 'Choose your AI app below to finish connecting.'
                    : info?.enabled
                      ? 'Resolve the error, then retry the connection.'
                      : 'Turn on the local connection to begin setup.'}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setRefreshing(true)
              void readConnection(persistedEnabled ? 'retry' : 'read')
            }}
            disabled={busy}
          >
            <ArrowsClockwiseIcon className={refreshing ? 'animate-spin' : ''} aria-hidden />
            {info?.enabled && !info.running ? 'Retry connection' : 'Refresh'}
          </Button>
        </div>
        {(error || info?.error) && (
          <p role="alert" className="mt-3 text-[13px] font-medium text-error">
            {error || info?.error}
          </p>
        )}
      </div>
      <div className="divide-y divide-border rounded-3xl border border-border">
        <div className="flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <StepHeading number="1">Your AI app</StepHeading>
            <Button type="button" variant="link" size="xs" onClick={openDocs}>
              Official guide <ArrowSquareOutIcon aria-hidden />
            </Button>
          </div>
          <SettingsField label="Choose an app" htmlFor="mcp-client">
            <Select value={clientId} onValueChange={selectClient}>
              <SelectTrigger id="mcp-client" className="w-full">
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
          </SettingsField>
          <p className="text-[13px] leading-relaxed text-outline">{client.description}</p>
          {client.limitation && (
            <p className="rounded-xl bg-surface-container p-3 text-[13px] leading-relaxed text-on-surface">
              {client.limitation}
            </p>
          )}
          <p className="text-xs leading-relaxed text-outline">
            Use an app running on this computer. A web or cloud connector cannot reach this local
            connection. Your AI app handles its own account and any model charges.
          </p>
        </div>
        {client.supported !== false && (
          <>
            <div className="flex flex-col gap-4 p-5 sm:p-6">
              <StepHeading number="2">Add StockFinder</StepHeading>
              <p className="text-[13px] leading-relaxed text-outline">
                {client.installTarget
                  ? `Open ${client.name} to review and add the connection, or let your AI app help with setup.`
                  : 'Copy the setup prompt into a local AI assistant that can edit its settings. It includes the correct connection details and steps for this app.'}
              </p>
              <div className="flex flex-wrap gap-2">
                {client.installTarget && (
                  <Button type="button" onClick={openClient} disabled={!canSetUp}>
                    <ArrowSquareOutIcon aria-hidden />
                    {openingClient
                      ? 'Opening…'
                      : `Add to ${client.installTarget === 'vscode' ? 'VS Code' : 'Cursor'}`}
                  </Button>
                )}
                <Button
                  type="button"
                  variant={client.installTarget ? 'outline' : 'default'}
                  onClick={() => copy(setupPrompt, 'Setup prompt')}
                  disabled={!canSetUp || !setupPrompt}
                >
                  <CopyIcon aria-hidden />
                  Copy setup prompt
                </Button>
              </div>
              <p className="flex items-start gap-2 text-xs leading-relaxed text-outline">
                <ShieldCheckIcon size={15} className="mt-0.5 shrink-0" aria-hidden />
                {config
                  ? 'The setup prompt and configuration include your private connection token. Share them only with the AI app you want to connect.'
                  : 'Start the local connection above to get your setup prompt and configuration.'}
              </p>
              <details key={clientId} className="text-[13px] text-outline">
                <summary className="cursor-pointer font-medium text-on-surface">
                  Set up manually or view the configuration
                </summary>
                <div className="mt-4 flex flex-col gap-4">
                  <ol className="list-decimal space-y-2 pl-5 leading-relaxed">
                    {client.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                  {client.configPath && (
                    <p className="break-all text-xs">
                      Configuration file:{' '}
                      <code className="text-on-surface">{client.configPath}</code>
                    </p>
                  )}
                  {config && (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="self-start"
                        onClick={() => copy(config, 'Configuration')}
                        disabled={busy}
                      >
                        <CopyIcon aria-hidden />
                        Copy configuration
                      </Button>
                      <details>
                        <summary className="cursor-pointer">
                          Show configuration and private token
                        </summary>
                        <pre
                          tabIndex={0}
                          aria-label={client.configLabel}
                          className="mt-3 max-h-64 overflow-auto rounded-xl bg-surface-container p-4 text-xs whitespace-pre-wrap text-on-surface [overflow-wrap:anywhere]"
                        >
                          {config}
                        </pre>
                      </details>
                      {setupPrompt && (
                        <details>
                          <summary className="cursor-pointer">
                            Show setup prompt and private token
                          </summary>
                          <pre
                            tabIndex={0}
                            aria-label="Setup prompt"
                            className="mt-3 max-h-64 overflow-auto rounded-xl bg-surface-container p-4 text-xs whitespace-pre-wrap text-on-surface [overflow-wrap:anywhere]"
                          >
                            {setupPrompt}
                          </pre>
                        </details>
                      )}
                    </>
                  )}
                </div>
              </details>
            </div>
            <div className="flex flex-col gap-4 p-5 sm:p-6">
              <StepHeading number="3">Try it in chat</StepHeading>
              <p className="text-[13px] leading-relaxed text-outline">
                Start a new chat or reconnect the server in {client.name}, then paste the connection
                test. It checks access and lists packs without creating or downloading anything.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => copy(MCP_CONNECTION_TEST_PROMPT, 'Connection test')}
                  disabled={!info?.running || busy}
                >
                  <CopyIcon aria-hidden />
                  Copy connection test
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => copy(MCP_STARTER_PROMPT, 'Starter prompt')}
                >
                  <CopyIcon aria-hidden />
                  Copy starter prompt
                </Button>
              </div>
              {!hasPexelsKey && (
                <p className="text-[13px] text-outline">
                  You can test the connection now. Before finding footage,{' '}
                  <button
                    type="button"
                    className="cursor-pointer text-on-surface underline underline-offset-4"
                    onClick={() => {
                      document
                        .getElementById('settings-pexels')
                        ?.scrollIntoView({ behavior: 'smooth' })
                      document.getElementById('pexels-key')?.focus({ preventScroll: true })
                    }}
                  >
                    add your free Pexels key
                  </button>
                  .
                </p>
              )}
              <details className="text-[13px] text-outline">
                <summary className="cursor-pointer">View the prompts</summary>
                <p className="mt-3 font-medium text-on-surface">Connection test</p>
                <pre
                  tabIndex={0}
                  className="mt-2 overflow-auto rounded-xl bg-surface-container p-4 text-xs whitespace-pre-wrap text-on-surface"
                >
                  {MCP_CONNECTION_TEST_PROMPT}
                </pre>
                <p className="mt-4 font-medium text-on-surface">
                  Starter prompt — add your script or idea
                </p>
                <pre
                  tabIndex={0}
                  className="mt-2 overflow-auto rounded-xl bg-surface-container p-4 text-xs whitespace-pre-wrap text-on-surface"
                >
                  {MCP_STARTER_PROMPT}
                </pre>
              </details>
            </div>
          </>
        )}
      </div>
      {info?.enabled && (
        <details className="text-[13px] text-outline">
          <summary className="cursor-pointer font-medium text-on-surface">
            Connection details and troubleshooting
          </summary>
          <div className="mt-4 flex flex-col items-start gap-4">
            {info.url && <code className="break-all text-on-surface">{info.url}</code>}
            <p>
              Keep StockFinder open. If your AI app cannot find the tools, enable the StockFinder
              server in its MCP settings and start a new chat.
            </p>
            <p>
              If authorization fails, copy the current setup again. Replacing the token disconnects
              every previously configured AI app.
            </p>
            <Button type="button" variant="outline" disabled={busy} onClick={replaceToken}>
              Replace connection token
            </Button>
          </div>
        </details>
      )}
      {isMcp && (
        <p className="text-[13px] leading-relaxed text-outline">
          Create a pack here or ask your AI app to create one. Your AI plans the shots; progress,
          files, and download approval stay in StockFinder.
        </p>
      )}
    </SettingsSection>
  )
}
