import { useState } from 'react'
import { ArrowsClockwiseIcon, CircleNotchIcon } from '@phosphor-icons/react'
import { Button } from '@renderer/components/ui/button'
import { useUpdateState } from '@renderer/hooks/use-update-state'
import { api } from '@renderer/lib/api-client'
import type { PublicSettings } from '@renderer/lib/store'
import {
  describeUpdateUnavailable,
  summarizeUpdateError,
  type UpdateCheckResult
} from '../../../../../shared/update-policy'
import type { SettingsForm } from '../hooks/useSettingsForm'
import { SettingsSection } from './SettingsSection'
import { ToggleRow } from './ToggleRow'

interface UpdatesPanelProps {
  settings: PublicSettings
  form: SettingsForm
  className?: string
}

export function UpdatesPanel({ settings, form, className }: UpdatesPanelProps): React.JSX.Element {
  const update = useUpdateState()
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<UpdateCheckResult | null>(null)

  const unavailable = update?.unavailableReason
    ? describeUpdateUnavailable(update.unavailableReason)
    : null
  const message = unavailable ?? result?.message ?? null
  const failed = !unavailable && result?.status === 'error'

  const checkNow = async (): Promise<void> => {
    setChecking(true)
    setResult(null)
    try {
      setResult(await api.app.checkForUpdates())
    } catch (err) {
      setResult({
        status: 'error',
        message: `Could not check for updates: ${summarizeUpdateError(err)}`
      })
    } finally {
      setChecking(false)
    }
  }

  return (
    <SettingsSection id="settings-updates" title="Updates" className={className}>
      <ToggleRow
        id="auto-update"
        label="Check for updates automatically"
        description="Asks GitHub Releases for a newer version every six hours."
        checked={settings.autoCheckForUpdates !== false}
        onCheckedChange={(autoCheckForUpdates) => form.updateNow({ autoCheckForUpdates })}
      />
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-4 rounded-2xl bg-surface-container py-2 pr-2 pl-4">
          <span className="text-sm text-on-surface">
            You have version <span className="font-semibold tabular-nums">{__APP_VERSION__}</span>
          </span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="bg-background hover:bg-background/70"
            onClick={checkNow}
            disabled={checking || Boolean(unavailable)}
          >
            {checking ? <CircleNotchIcon className="animate-spin" /> : <ArrowsClockwiseIcon />}
            {checking ? 'Checking...' : 'Check now'}
          </Button>
        </div>
        {message && (
          <p
            role="status"
            className={failed ? 'text-[13px] font-medium text-error' : 'text-[13px] text-outline'}
          >
            {message}
          </p>
        )}
      </div>
    </SettingsSection>
  )
}
