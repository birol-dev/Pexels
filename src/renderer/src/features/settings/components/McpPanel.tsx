import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowsClockwiseIcon, CopyIcon } from '@phosphor-icons/react'
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
import type { McpConnectionInfo } from '../../../../../shared/mcp'
import type { SettingsForm } from '../hooks/useSettingsForm'
import { mcpClientConfig, type McpClientConfigFormat } from '../mcp-config'
import { SettingsField } from './SettingsField'
import { SettingsSection } from './SettingsSection'
import { ToggleRow } from './ToggleRow'

interface McpPanelProps {
  settings: PublicSettings
  form: SettingsForm
}

export function McpPanel({ settings, form }: McpPanelProps): React.JSX.Element {
  const persistedEnabled = useAppStore((s) => s.settings?.mcpEnabled)
  const persistedEngine = useAppStore((s) => s.settings?.agentEngine)
  const confirm = useAppStore((s) => s.confirm)
  const [info, setInfo] = useState<McpConnectionInfo | null>(null)
  const [refreshing, setRefreshing] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [configFormat, setConfigFormat] = useState<McpClientConfigFormat>('json')
  const connectionRequest = useRef(0)
  const isMcp = settings.agentEngine === 'mcp'
  const config = info?.enabled ? mcpClientConfig(info, configFormat) : null
  const unsavedConnection =
    form.saveError &&
    ((settings.agentEngine ?? 'loop') !== (persistedEngine ?? 'loop') ||
      Boolean(settings.mcpEnabled) !== Boolean(persistedEnabled))

  const readConnection = useCallback(
    async (action: 'read' | 'retry' | 'rotate' = 'read'): Promise<McpConnectionInfo | null> => {
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
        if (request === connectionRequest.current) setRefreshing(false)
      }
    },
    []
  )

  // The store changes after the settings write and server reconciliation complete.
  useEffect(() => {
    const requests = connectionRequest
    let active = true
    void Promise.resolve().then(() => {
      if (active) void readConnection()
    })
    return () => {
      active = false
      requests.current++
    }
  }, [persistedEnabled, readConnection])

  const copyConfig = async (): Promise<void> => {
    if (!config) return
    try {
      await navigator.clipboard.writeText(config)
      toast.success('MCP configuration copied. It includes your private connection token.')
    } catch {
      toast.error('Could not copy. Open the connection configuration and copy it manually.')
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
      toast.success('Connection token replaced. Update the configuration in every MCP client.')
  }

  return (
    <SettingsSection
      id="settings-mcp"
      title="MCP connection"
      description="Let your AI app plan searches and pick footage in StockFinder. MCP runs need your Pexels key, with no AI API key in StockFinder."
    >
      {unsavedConnection && (
        <p role="alert" className="text-sm text-error">
          These connection choices have not been saved. New packs still use{' '}
          {persistedEngine === 'mcp' ? 'your connected MCP app' : 'an AI API key'}. The live
          connection status below reflects your saved settings. Use Retry saving above.
        </p>
      )}
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
        description="Allows an AI client on this computer to search Pexels and manage MCP packs using the private token below. Keep StockFinder open while connected."
        checked={settings.mcpEnabled === true}
        onCheckedChange={(mcpEnabled) => form.updateNow({ mcpEnabled })}
      />

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-container py-2 pr-2 pl-4">
          <p role="status" className="text-sm text-on-surface">
            {form.saving
              ? 'Updating connection…'
              : refreshing
                ? 'Checking connection…'
                : error
                  ? 'MCP status is unavailable'
                  : info?.running
                    ? 'MCP is listening on this computer'
                    : info?.enabled
                      ? 'MCP could not start'
                      : 'MCP connection is off'}
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setRefreshing(true)
              void readConnection(persistedEnabled ? 'retry' : 'read')
            }}
            disabled={refreshing || form.saving}
          >
            <ArrowsClockwiseIcon className={refreshing ? 'animate-spin' : ''} aria-hidden />
            {info?.enabled && !info.running ? 'Retry connection' : 'Refresh'}
          </Button>
        </div>
        {(error || info?.error) && (
          <p role="alert" className="text-[13px] font-medium text-error">
            {error || info?.error}
          </p>
        )}
        {info?.running && info.url && (
          <p className="break-all font-mono text-[13px] text-outline">{info.url}</p>
        )}
        {config && (
          <>
            <SettingsField label="Configuration format" htmlFor="mcp-config-format">
              <Select
                value={configFormat}
                onValueChange={(value) => setConfigFormat(value as McpClientConfigFormat)}
              >
                <SelectTrigger id="mcp-config-format" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="json">JSON configuration</SelectItem>
                  <SelectItem value="codex">Codex configuration (TOML)</SelectItem>
                  <SelectItem value="claude-code">Claude Code command</SelectItem>
                </SelectContent>
              </Select>
            </SettingsField>
            <p className="text-[13px] text-outline">
              {configFormat === 'codex'
                ? 'Add this block to ~/.codex/config.toml, then reconnect Codex. Keep this file private.'
                : configFormat === 'claude-code'
                  ? 'Run the copied command in your terminal, then open /mcp in Claude Code to check the connection.'
                  : 'Add this configuration to a client that supports local Streamable HTTP MCP servers with authorization headers.'}{' '}
              Then ask your AI app to list your StockFinder packs, or create and fill a pack from a
              script or idea.
            </p>
            <Button
              type="button"
              variant="outline"
              className="self-start"
              onClick={copyConfig}
              disabled={refreshing || form.saving}
            >
              <CopyIcon aria-hidden />
              Copy client configuration
            </Button>
            <details className="text-[13px] text-outline">
              <summary className="cursor-pointer">Show configuration and private token</summary>
              <p className="mt-3">This token grants access to your MCP packs. Keep it private.</p>
              <pre className="mt-3 overflow-x-auto rounded-xl bg-surface-container p-4 text-on-surface">
                {config}
              </pre>
            </details>
          </>
        )}
        {info?.enabled && (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={refreshing || form.saving}
              onClick={replaceToken}
            >
              Replace connection token
            </Button>
            <span className="text-[13px] text-outline">
              Connected clients will need the new configuration.
            </span>
          </div>
        )}
        {isMcp && (
          <p className="text-[13px] text-outline">
            Creating a pack in StockFinder leaves it waiting for your connected AI app. Your AI app
            plans the beats and chooses assets; downloads and progress stay in StockFinder.
          </p>
        )}
      </div>
    </SettingsSection>
  )
}
