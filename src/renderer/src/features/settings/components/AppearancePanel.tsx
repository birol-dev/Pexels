import { PaletteIcon } from '@phosphor-icons/react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import type { PublicSettings } from '@renderer/lib/store'
import type { SettingsForm } from '../hooks/useSettingsForm'
import { THEME_OPTIONS } from '../utils'
import { SettingsSection } from './SettingsSection'

interface AppearancePanelProps {
  settings: PublicSettings
  form: SettingsForm
}

export function AppearancePanel({ settings, form }: AppearancePanelProps): React.JSX.Element {
  return (
    <SettingsSection title="Appearance" icon={PaletteIcon} compact>
      <Select
        value={settings.theme || 'flat-black'}
        onValueChange={(theme) => form.updateNow({ theme: theme as PublicSettings['theme'] })}
      >
        <SelectTrigger aria-label="Theme" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {THEME_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingsSection>
  )
}
