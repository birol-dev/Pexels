import { GaugeIcon } from '@phosphor-icons/react'
import type { PublicSettings } from '@renderer/lib/store'
import type { SettingsForm } from '../hooks/useSettingsForm'
import { SettingsSection } from './SettingsSection'
import { SliderField } from './SliderField'

interface PerformancePanelProps {
  settings: PublicSettings
  form: SettingsForm
  className?: string
}

export function PerformancePanel({
  settings,
  form,
  className
}: PerformancePanelProps): React.JSX.Element {
  const { update } = form
  const rpm = settings.requestsPerMinute ?? 0

  return (
    <SettingsSection title="Performance Tuning" icon={GaugeIcon} className={className}>
      <div className="flex flex-col gap-8">
        <SliderField
          id="max-concurrent-downloads"
          label="Max Concurrent Downloads"
          value={settings.maxConcurrentDownloads}
          min={1}
          max={10}
          onChange={(maxConcurrentDownloads) => update({ maxConcurrentDownloads })}
        />
        <SliderField
          id="max-agent-iterations"
          label="Max Agent Loop Turns"
          value={settings.maxAgentIterations}
          min={5}
          max={50}
          step={5}
          onChange={(maxAgentIterations) => update({ maxAgentIterations })}
        />
        <SliderField
          id="request-timeout"
          label="Request Timeout (Secs)"
          hint="Pexels searches use this value. LLM replies wait at least 10 minutes because slower OpenRouter models can keep generating after 60s."
          value={settings.requestTimeoutSeconds}
          min={10}
          max={600}
          step={5}
          onChange={(requestTimeoutSeconds) => update({ requestTimeoutSeconds })}
        />
        <SliderField
          id="requests-per-minute"
          label="Rate Limit (Requests / Min)"
          hint="Throttle LLM calls to prevent 429 errors (0 = Unlimited)"
          value={rpm}
          displayValue={rpm > 0 ? `${rpm} RPM` : 'Unlimited (0)'}
          min={0}
          max={120}
          step={5}
          onChange={(requestsPerMinute) => update({ requestsPerMinute })}
        />
      </div>
    </SettingsSection>
  )
}
