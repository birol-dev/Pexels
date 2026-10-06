import { ArrowsLeftRightIcon, CircleNotchIcon, CpuIcon } from '@phosphor-icons/react'
import { Badge } from '@renderer/components/ui/badge'
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
  const { keys, setKey, update, updateNow } = form
  const keyField = secretFieldForProvider(settings.llmProvider)

  const { testing, result, run, reset } = useConnectionTest(async () => {
    const response = await api.settings.testProvider({
      provider: settings.llmProvider,
      apiKey: keys[keyField] || 'CURRENT_KEY_ON_DISK',
      modelId: settings.modelId
    })
    return response as unknown as TestResultState
  }, 'Connection test failed.')

  const handleProviderChange = (provider: LlmProvider): void => {
    updateNow({ llmProvider: provider, modelId: DEFAULT_MODEL_BY_PROVIDER[provider] })
    reset()
  }

  return (
    <SettingsSection
      title="AI Provider Configuration"
      icon={CpuIcon}
      iconClassName="text-electric-purple"
      className={className}
      action={
        <Badge className="rounded-md border-2 border-ink-black bg-electric-purple font-label-sm text-label-sm uppercase text-paper-white">
          Active
        </Badge>
      }
    >
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
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

        <SettingsField label="Model ID" htmlFor="llm-model-id">
          <Input
            id="llm-model-id"
            type="text"
            placeholder="Enter model ID"
            value={settings.modelId}
            onChange={(e) => update({ modelId: e.target.value })}
            className="font-mono"
          />
        </SettingsField>
      </div>

      <SettingsField label="API Key" htmlFor="llm-api-key">
        <div className="flex gap-4">
          <Input
            id="llm-api-key"
            type="password"
            placeholder={settings[keyField] ? '••••••••••••••••' : 'Enter provider key...'}
            value={keys[keyField]}
            onChange={(e) => setKey(keyField, e.target.value)}
            className="flex-1 font-mono tracking-widest"
          />
          <Button type="button" variant="secondary" disabled={testing} onClick={run}>
            {testing ? (
              <CircleNotchIcon size={18} className="animate-spin" aria-hidden />
            ) : (
              <ArrowsLeftRightIcon size={18} aria-hidden />
            )}
            <span className="font-label-sm text-label-sm uppercase">Test Key</span>
          </Button>
        </div>
      </SettingsField>

      <TestResult title="LLM Connection Test" result={result} />
    </SettingsSection>
  )
}
