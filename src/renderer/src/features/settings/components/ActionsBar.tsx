import { FolderOpenIcon } from '@phosphor-icons/react'
import { Button } from '@renderer/components/ui/button'
import { LiquidMetalButton } from '@renderer/components/ui/liquid-metal-button'
import { api } from '@renderer/lib/api-client'
import { useAppStore } from '@renderer/lib/store'

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
    <div className="flex flex-wrap items-center justify-between gap-4 border-t-2 border-dashed border-ink-black pt-8">
      <LiquidMetalButton label="Reset Onboarding" width={190} onClick={handleResetOnboarding} />
      <Button
        type="button"
        variant="secondary"
        size="lg"
        onClick={async () => {
          await api.settings.openAppDataFolder()
        }}
      >
        <FolderOpenIcon size={18} aria-hidden />
        <span className="font-label-sm text-label-sm uppercase">Show Sandbox Files</span>
      </Button>
    </div>
  )
}
