import React from 'react'
import { Input } from '@renderer/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { CUSTOM_STYLE_VALUE, PRESET_STYLES } from '../constants'
import type { FormSectionProps } from '../types'
import { isPresetStyle } from '../utils'
import { FieldLabel } from './FieldLabel'

export function StylePicker({ form, update }: FormSectionProps): React.JSX.Element {
  const isPreset = isPresetStyle(form.style)

  return (
    <div>
      <FieldLabel htmlFor="visual-mood">Visual Mood</FieldLabel>
      <Select
        value={isPreset ? form.style : CUSTOM_STYLE_VALUE}
        onValueChange={(val) =>
          update({
            style: val === CUSTOM_STYLE_VALUE ? form.customStyleText || 'custom style' : val
          })
        }
      >
        <SelectTrigger id="visual-mood" className="mb-2 h-12 w-full px-4">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRESET_STYLES.map((preset) => (
            <SelectItem key={preset.value} value={preset.value}>
              {preset.label}
            </SelectItem>
          ))}
          <SelectItem value={CUSTOM_STYLE_VALUE}>Custom Style...</SelectItem>
        </SelectContent>
      </Select>
      {!isPreset && (
        <Input
          type="text"
          aria-label="Custom visual style"
          placeholder="e.g. vintage 8mm film, cyberpunk neon, sketch illustration"
          value={form.customStyleText}
          onChange={(e) =>
            update({
              customStyleText: e.target.value,
              style: e.target.value || 'custom style'
            })
          }
          className="animate-fade-in-up text-xs font-semibold"
          required
        />
      )}
    </div>
  )
}
