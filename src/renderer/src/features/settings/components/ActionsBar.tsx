import { ArrowCounterClockwiseIcon, FolderOpenIcon } from '@phosphor-icons/react'
import { Button } from '@renderer/components/ui/button'
import { api } from '@renderer/lib/api-client'
import { useAppStore } from '@renderer/lib/store'
import { SettingsSection } from './SettingsSection'

export function ActionsBar(): React.JSX.Element {
  const confirm = useAppStore((s) => s.confirm)
  const updateSettings = useAppStore((s) => s.updateSettings)

  const handleResetOnboarding = async (): Promise<void> => {
    const isConfirmed = await confirm(
      'Reset Onboarding',
      'Are you sure you want to reset onboarding? This will route you back to the initial setup wizard.'
    )
    if (isConfirmed) {
      await updateSettings({ isOnboarded: false })
      window.location.reload()
    }
  }

  return (
    <SettingsSection
      id="settings-advanced"
      title="Advanced"
      description="Start the setup again, or look at the files the app keeps."
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={handleResetOnboarding}>
          <ArrowCounterClockwiseIcon size={18} aria-hidden />
          Reset onboarding
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            await api.settings.openAppDataFolder()
          }}
        >
          <FolderOpenIcon size={18} aria-hidden />
          Show app data folder
        </Button>
      </div>
    </SettingsSection>
  )
}
