import { CheckCircleIcon, CircleNotchIcon, TrashIcon } from '@phosphor-icons/react'
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
  const { keys, setKey, commitKey, removeKey } = form
  const hasStoredKey = Boolean(settings.pexelsKey)

  const { testing, result, run } = useConnectionTest(async () => {
    const response = await api.settings.testPexelsKey(keys.pexelsKey || 'CURRENT_KEY_ON_DISK')
    return response as unknown as TestResultState
  }, 'Pexels verification failed.')

  return (
    <SettingsSection
      id="settings-pexels"
      title="Pexels"
      description="Where the footage comes from. The key is free at pexels.com/api."
      className={className}
    >
      <SettingsField
        label="Pexels API key"
        htmlFor="pexels-key"
        hint="Saved when you press Enter or leave the field."
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="pexels-key"
            type="password"
            placeholder={hasStoredKey ? '••••••••••••••••' : 'Paste your key'}
            value={keys.pexelsKey}
            onChange={(e) => setKey('pexelsKey', e.target.value)}
            onBlur={(e) => commitKey('pexelsKey', e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitKey('pexelsKey', e.currentTarget.value)
            }}
            className="flex-1 font-mono tracking-widest placeholder:font-sans placeholder:tracking-normal"
          />
          <Button type="button" variant="outline" disabled={testing} onClick={run}>
            {testing ? (
              <CircleNotchIcon size={18} className="animate-spin" aria-hidden />
            ) : (
              <CheckCircleIcon size={18} aria-hidden />
            )}
            Test key
          </Button>
          {hasStoredKey && !keys.pexelsKey && (
            <Button
              type="button"
              variant="ghost"
              className="text-outline hover:bg-error-container hover:text-on-error-container"
              onClick={() => removeKey('pexelsKey', 'Pexels')}
            >
              <TrashIcon size={18} aria-hidden />
              Remove key
            </Button>
          )}
        </div>
      </SettingsField>
      <TestResult title="Connection test" result={result} />
    </SettingsSection>
  )
}
