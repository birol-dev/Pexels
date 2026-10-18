import React from 'react'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { DURATION_OPTIONS, TONE_OPTIONS } from '../constants'
import type { FormSectionProps } from '../types'
import { FieldHint, FieldLabel } from './FieldLabel'

/** Target duration and narrative tone controls for the AI scriptwriter. */
export function IdeaOptions({ form, update }: FormSectionProps): React.JSX.Element {
  return (
    <Card variant="sunken" className="grid grid-cols-1 gap-x-8 gap-y-6 p-6 md:grid-cols-2">
      <div>
        <FieldLabel id="target-duration-label">Length</FieldLabel>
        <div
          role="radiogroup"
          aria-labelledby="target-duration-label"
          className="grid grid-cols-3 gap-2"
        >
          {DURATION_OPTIONS.map((opt) => {
            const selected = form.targetDuration === opt.value
            return (
              <Button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={selected}
                variant={selected ? 'default' : 'secondary'}
                onClick={() => update({ targetDuration: opt.value })}
                className="h-auto flex-col gap-0.5 rounded-2xl p-3 text-center"
              >
                <opt.icon size={18} />
                <span className="text-[13px] leading-tight font-semibold">{opt.label}</span>
                <span className="text-[11px] opacity-75">{opt.words}</span>
              </Button>
            )
          })}
        </div>
      </div>

      <div>
        <FieldLabel htmlFor="narrative-tone">Tone and hook</FieldLabel>
        <Select value={form.tone} onValueChange={(tone) => update({ tone })}>
          <SelectTrigger id="narrative-tone" className="w-full data-[size=default]:h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TONE_OPTIONS.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldHint>Sets the pacing, the vocabulary and how each beat opens.</FieldHint>
      </div>
    </Card>
  )
}
