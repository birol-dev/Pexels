import React, { useEffect, useState } from 'react'
import { ArrowsClockwiseIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { useAppStore } from '@renderer/lib/store'
import { useThemeClass } from '@renderer/hooks/use-theme-class'
import ScriptInputView from '@renderer/routes/script-input'
import AgentRunView from '@renderer/routes/agent-run'
import DownloadedStuffView from '@renderer/routes/downloaded-stuff'
import SettingsView from '@renderer/routes/settings'
import OnboardingView from '@renderer/routes/onboarding'
import { AppProviders } from '@renderer/components/common/AppProviders'
import { AppShell } from '@renderer/components/layout/AppShell'
import { ScreenMessage } from '@renderer/components/common/ScreenMessage'
import { Button } from '@renderer/components/ui/button'

const VIEWS = {
  input: ScriptInputView,
  run: AgentRunView,
  stuff: DownloadedStuffView,
  settings: SettingsView
} as const

const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err))

function AppContent(): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const currentRoute = useAppStore((s) => s.currentRoute)
  const loadSettings = useAppStore((s) => s.loadSettings)
  const loadJobs = useAppStore((s) => s.loadJobs)
  const [settingsError, setSettingsError] = useState<string | null>(null)

  useThemeClass(settings?.theme)

  const retryLoadSettings = (): void => {
    setSettingsError(null)
    loadSettings().catch((err) => setSettingsError(errorMessage(err)))
  }

  useEffect(() => {
    loadSettings().catch((err) => {
      console.error('Failed to load settings:', err)
      setSettingsError(errorMessage(err))
    })
    loadJobs().catch((err) => console.error('Failed to load jobs:', err))
  }, [loadSettings, loadJobs])

  if (settingsError && !settings) {
    return (
      <ScreenMessage
        icon={WarningCircleIcon}
        tone="error"
        title="Failed to load settings"
        description={settingsError}
      >
        <Button variant="violet" size="sm" onClick={retryLoadSettings}>
          Retry
        </Button>
      </ScreenMessage>
    )
  }

  if (!settings) {
    return <ScreenMessage icon={ArrowsClockwiseIcon} spin title="Loading settings..." />
  }

  if (!settings.isOnboarded) {
    return <OnboardingView />
  }

  const View = VIEWS[currentRoute] ?? ScriptInputView
  return (
    <AppShell>
      <View />
    </AppShell>
  )
}

export default function App(): React.JSX.Element {
  return (
    <AppProviders>
      <AppContent />
    </AppProviders>
  )
}
