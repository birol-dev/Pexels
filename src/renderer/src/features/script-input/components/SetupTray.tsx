import React, { useEffect, useState } from 'react'
import { CheckCircleIcon, CircleIcon } from '@phosphor-icons/react'
import { Button } from '@renderer/components/ui/button'
import { Progress } from '@renderer/components/ui/progress'
import { useAppStore, type PublicSettings } from '@renderer/lib/store'
import { api } from '@renderer/lib/api-client'
import { cn } from '@renderer/lib/utils'
import { getActiveProvider, getActiveProviderKey } from '../utils'

const PROVIDER_NAMES: Record<string, string> = {
  openai: 'OpenAI',
  gemini: 'Gemini',
  openrouter: 'OpenRouter'
}

interface SetupStep {
  id: string
  title: string
  detail: string
  done: boolean
  action?: { label: string; onClick: () => void }
}

/** "Finish your setup n/4": what still stands between this user and a finished pack. */
export function SetupTray(): React.JSX.Element | null {
  const settings = useAppStore((s) => s.settings)
  const jobs = useAppStore((s) => s.jobs)
  const navigate = useAppStore((s) => s.navigate)
  const [mcpCheck, setMcpCheck] = useState<{ settings: PublicSettings; verified: boolean } | null>(
    null
  )
  const needsMcp = settings?.agentEngine === 'mcp' && settings.mcpEnabled === true
  const mcpVerified = mcpCheck?.settings === settings && mcpCheck?.verified === true

  useEffect(() => {
    if (!needsMcp || !settings) return
    let active = true
    let checking = false
    const check = async (): Promise<void> => {
      if (checking) return
      checking = true
      try {
        const info = await api.mcp.getConnectionInfo()
        if (active)
          setMcpCheck({ settings, verified: Boolean(info.running && info.lastClientSeenAt) })
      } catch {
        if (active) setMcpCheck({ settings, verified: false })
      } finally {
        checking = false
      }
    }
    void check()
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') void check()
    }, 5000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [needsMcp, settings])

  if (!settings) return null

  const provider = PROVIDER_NAMES[getActiveProvider(settings)] ?? 'AI'
  const isMcp = settings.agentEngine === 'mcp'
  const toSettings = { label: 'Open Settings', onClick: () => navigate('settings') }
  const steps: SetupStep[] = [
    {
      id: 'llm',
      title: isMcp ? 'MCP connection' : `${provider} key`,
      detail: isMcp
        ? mcpVerified && needsMcp
          ? 'Your AI app has reached StockFinder. Keep both apps open.'
          : 'Choose your AI app and paste a connection test from Settings.'
        : 'Reads your script and picks the shots.',
      done: isMcp ? Boolean(needsMcp && mcpVerified) : !!getActiveProviderKey(settings),
      action: toSettings
    },
    {
      id: 'pexels',
      title: 'Pexels key',
      detail: 'Free, and it is where the footage comes from.',
      done: !!settings.pexelsKey,
      action: toSettings
    },
    {
      id: 'folder',
      title: 'Download folder',
      detail: 'Where each pack is saved.',
      done: !!settings.downloadFolder,
      action: toSettings
    },
    {
      id: 'first-pack',
      title: 'First pack',
      detail: isMcp
        ? 'Create a pack below, then ask your AI app to fill it.'
        : 'Paste a script below and press Find footage.',
      done: jobs.length > 0,
      action: {
        label: 'Go to the script',
        onClick: () => document.getElementById('video-script')?.focus()
      }
    }
  ]

  const done = steps.filter((step) => step.done).length
  if (done === steps.length) return null

  return (
    <section
      aria-labelledby="setup-tray-title"
      className="rounded-3xl bg-surface-container-low p-6 sm:p-7"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <h2 id="setup-tray-title" className="text-title-md font-title-md text-on-surface">
          Finish your setup{' '}
          <span className="ml-1 font-normal text-outline tabular-nums">
            {done}/{steps.length}
          </span>
        </h2>
        <Progress
          value={(done / steps.length) * 100}
          className="h-1.5 w-40"
          aria-label={`${done} of ${steps.length} setup steps done`}
        />
      </div>
      <ol className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map((step) => (
          <li
            key={step.id}
            className={cn(
              'flex flex-col rounded-2xl p-4',
              step.done ? 'bg-transparent' : 'bg-background'
            )}
          >
            <div className="flex items-center gap-2">
              {step.done ? (
                <CheckCircleIcon size={20} weight="fill" className="shrink-0 text-on-surface" />
              ) : (
                <CircleIcon size={20} className="shrink-0 text-control" />
              )}
              <span
                className={cn(
                  'text-sm font-semibold',
                  step.done ? 'text-outline' : 'text-on-surface'
                )}
              >
                {step.title}
              </span>
              {step.done && <span className="sr-only">(done)</span>}
            </div>
            <p className="mt-1.5 pl-7 text-[13px] text-outline">{step.detail}</p>
            {!step.done && step.action && (
              <Button
                variant="link"
                size="xs"
                className="mt-2 ml-7 h-auto self-start px-0 text-[13px]"
                onClick={step.action.onClick}
              >
                {step.action.label}
              </Button>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
