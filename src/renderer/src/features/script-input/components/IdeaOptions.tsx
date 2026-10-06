import React from 'react'
import { Button } from '@renderer/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { cn } from '@renderer/lib/utils'
import { DURATION_OPTIONS, TONE_OPTIONS } from '../constants'
import type { FormSectionProps } from '../types'
import { FieldHint, FieldLabel } from './FieldLabel'

/** Target duration and narrative tone controls for the AI scriptwriter. */
export function IdeaOptions({ form, update }: FormSectionProps): React.JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-gutter rounded-xl border-2 border-edge bg-surface-container-low p-5 shadow-hard-sm md:grid-cols-2 dark:bg-surface-container-lowest">
      <div>
        <FieldLabel id="target-duration-label">Target Video Duration</FieldLabel>
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
                className={cn('h-auto flex-col gap-0.5 p-2.5 text-center', selected && 'font-bold')}
              >
                <opt.icon size={18} />
                <span className="text-xs font-bold leading-tight">{opt.label}</span>
                <span className="font-mono text-[11px] ">{opt.words}</span>
              </Button>
            )
          })}
        </div>
      </div>

      <div>
        <FieldLabel htmlFor="narrative-tone">Narrative Tone & Hook Style</FieldLabel>
        <Select value={form.tone} onValueChange={(tone) => update({ tone })}>
          <SelectTrigger id="narrative-tone" className="h-12 w-full px-4">
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
        <FieldHint>Defines pacing, vocabulary, and visual storytelling hooks.</FieldHint>
      </div>
    </div>
  )
}
