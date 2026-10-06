import { CheckCircleIcon, CircleNotchIcon, ImagesIcon } from '@phosphor-icons/react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api-client'
import type { PublicSettings } from '@renderer/lib/store'
import { useConnectionTest } from '../hooks/useConnectionTest'
import type { SettingsForm } from '../hooks/useSettingsForm'
import type { TestResultState } from '../utils'
import { SettingsField } from './SettingsField'
import { SettingsSection } from './SettingsSection'
import { TestResult } from './TestResult'

interface PexelsPanelProps {
  settings: PublicSettings
  form: SettingsForm
  className?: string
}

export function PexelsPanel({ settings, form, className }: PexelsPanelProps): React.JSX.Element {
  const { keys, setKey } = form

  const { testing, result, run } = useConnectionTest(async () => {
    const response = await api.settings.testPexelsKey(keys.pexelsKey || 'CURRENT_KEY_ON_DISK')
    return response as unknown as TestResultState
  }, 'Pexels verification failed.')

  return (
    <SettingsSection
      title="Pexels API"
      icon={ImagesIcon}
      iconClassName="text-cyber-lime"
      className={className}
    >
      <p className="font-body-md text-sm text-muted-foreground">
        Required for pulling high-res stock footage.
      </p>
      <SettingsField label="Access Token" htmlFor="pexels-key" className="mt-auto">
        <Input
          id="pexels-key"
          type="password"
          placeholder={settings.pexelsKey ? '••••••••••••••••' : 'Enter Pexels key...'}
          value={keys.pexelsKey}
          onChange={(e) => setKey('pexelsKey', e.target.value)}
          className="font-mono"
        />
        <Button
          type="button"
          variant="secondary"
          disabled={testing}
          onClick={run}
          className="mt-2 w-full"
        >
          {testing ? (
            <CircleNotchIcon size={18} className="animate-spin" aria-hidden />
          ) : (
            <CheckCircleIcon size={18} aria-hidden />
          )}
          <span className="font-label-sm text-label-sm uppercase">Verify Connection</span>
        </Button>
      </SettingsField>
      <TestResult title="Pexels Connection Test" result={result} />
    </SettingsSection>
  )
}
