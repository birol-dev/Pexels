import { FlaskIcon } from '@phosphor-icons/react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import type { PublicSettings } from '@renderer/lib/store'
import type { SettingsForm } from '../hooks/useSettingsForm'
import { ENGINE_OPTIONS } from '../utils'
import { SettingsField } from './SettingsField'
import { SettingsSection } from './SettingsSection'

interface ExperimentalPanelProps {
  settings: PublicSettings
  form: SettingsForm
  className?: string
}

export function ExperimentalPanel({
  settings,
  form,
  className
}: ExperimentalPanelProps): React.JSX.Element {
  return (
    <SettingsSection title="Experimental" icon={FlaskIcon} compact className={className}>
      <SettingsField
        label="Search engine"
        htmlFor="agent-engine"
        hint="Applies to new jobs. A job keeps the engine it started with, even when it is resumed. The pipeline runs fixed steps: plan the beats, search Pexels, rank what it found, download."
      >
        <Select
          value={settings.agentEngine === 'pipeline' ? 'pipeline' : 'loop'}
          onValueChange={(agentEngine) =>
            form.updateNow({
              agentEngine: agentEngine as NonNullable<PublicSettings['agentEngine']>
            })
          }
        >
          <SelectTrigger id="agent-engine" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ENGINE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingsField>
    </SettingsSection>
  )
}
