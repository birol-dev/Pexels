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
    <SettingsSection title="Updates" icon={ArrowsClockwiseIcon} compact className={className}>
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between md:gap-10">
        <div className="md:max-w-lg md:flex-1">
          <ToggleRow
            id="auto-update"
            label="Check for updates automatically"
            description="Asks GitHub Releases for a newer version every six hours."
            checked={settings.autoCheckForUpdates !== false}
            onCheckedChange={(autoCheckForUpdates) => form.updateNow({ autoCheckForUpdates })}
          />
        </div>

        <div className="flex flex-col gap-2 md:items-end">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-on-surface-variant">
              Version {__APP_VERSION__}
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
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
              className={
                failed
                  ? 'max-w-sm text-xs font-semibold text-error md:text-right'
                  : 'max-w-sm text-xs text-on-surface-variant md:text-right'
              }
            >
              {message}
            </p>
          )}
        </div>
      </div>
    </SettingsSection>
  )
}
