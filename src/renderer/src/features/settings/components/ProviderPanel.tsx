import { ArrowsLeftRightIcon, CircleNotchIcon, TrashIcon } from '@phosphor-icons/react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { api } from '@renderer/lib/api-client'
import type { PublicSettings } from '@renderer/lib/store'
import { useConnectionTest } from '../hooks/useConnectionTest'
import type { SettingsForm } from '../hooks/useSettingsForm'
import { switchProviderModel } from '../model-memory'
import {
  DEFAULT_MODEL_BY_PROVIDER,
  PROVIDER_OPTIONS,
  secretFieldForProvider,
  type LlmProvider,
  type TestResultState
} from '../utils'
import { SettingsField } from './SettingsField'
import { SettingsSection } from './SettingsSection'
import { TestResult } from './TestResult'

interface ProviderPanelProps {
  settings: PublicSettings
  form: SettingsForm
  className?: string
}

export function ProviderPanel({
  settings,
  form,
  className
}: ProviderPanelProps): React.JSX.Element {
  const { keys, setKey, commitKey, removeKey, update, updateNow } = form
  const keyField = secretFieldForProvider(settings.llmProvider)
  const providerLabel =
    PROVIDER_OPTIONS.find((option) => option.value === settings.llmProvider)?.label ??
    settings.llmProvider
  const hasStoredKey = Boolean(settings[keyField])

  const { testing, result, run, reset } = useConnectionTest(async () => {
    const response = await api.settings.testProvider({
      provider: settings.llmProvider,
      apiKey: keys[keyField] || 'CURRENT_KEY_ON_DISK',
      modelId: settings.modelId
    })
    return response as unknown as TestResultState
  }, 'Connection test failed.')

  const handleProviderChange = (provider: LlmProvider): void => {
    // Switching back restores the model last used with that provider, not its default.
    updateNow({
      llmProvider: provider,
      ...switchProviderModel(settings, provider, DEFAULT_MODEL_BY_PROVIDER)
    })
    reset()
  }

  return (
    <SettingsSection
      id="settings-ai"
      title="AI provider"
      description="Reads your script, plans the beats and picks the shots."
      className={className}
    >
      <div className="grid grid-cols-1 gap-x-5 gap-y-6 md:grid-cols-2">
        <SettingsField label="Provider" htmlFor="llm-provider">
          <Select value={settings.llmProvider} onValueChange={handleProviderChange}>
            <SelectTrigger id="llm-provider" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROVIDER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsField>

        <SettingsField label="Model" htmlFor="llm-model-id">
          <Input
            id="llm-model-id"
            type="text"
            placeholder="Enter model ID"
            value={settings.modelId}
            onChange={(e) => update({ modelId: e.target.value })}
            className="font-mono text-[13px]"
          />
        </SettingsField>
      </div>

      <SettingsField
        label={`${providerLabel} API key`}
        htmlFor="llm-api-key"
        hint="Saved when you press Enter or leave the field."
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="llm-api-key"
            type="password"
            placeholder={hasStoredKey ? '••••••••••••••••' : 'Paste your key'}
            value={keys[keyField]}
            onChange={(e) => setKey(keyField, e.target.value)}
            onBlur={(e) => commitKey(keyField, e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitKey(keyField, e.currentTarget.value)
            }}
            className="flex-1 font-mono tracking-widest placeholder:font-sans placeholder:tracking-normal"
          />
          <Button type="button" variant="outline" disabled={testing} onClick={run}>
            {testing ? (
              <CircleNotchIcon size={18} className="animate-spin" aria-hidden />
            ) : (
              <ArrowsLeftRightIcon size={18} aria-hidden />
            )}
            Test key
          </Button>
          {hasStoredKey && !keys[keyField] && (
            <Button
              type="button"
              variant="ghost"
              className="text-outline hover:bg-error-container hover:text-on-error-container"
              onClick={() => removeKey(keyField, providerLabel)}
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
