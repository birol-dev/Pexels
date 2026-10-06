import React from 'react'
import { Slider } from '@renderer/components/ui/slider'
import type { FormSectionProps } from '../types'
import { FieldHint, FieldLabel } from './FieldLabel'

interface LimitSliderProps {
  id: string
  label: string
  hint: string
  min: number
  max: number
  value: number
  onChange: (value: number) => void
}

function LimitSlider({
  id,
  label,
  hint,
  min,
  max,
  value,
  onChange
}: LimitSliderProps): React.JSX.Element {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <FieldLabel id={`${id}-label`} className="mb-0">
          {label}
        </FieldLabel>
        <span className="font-mono text-sm font-bold text-primary dark:text-cyber-lime">
          {value}
        </span>
      </div>
      <Slider
        id={id}
        aria-labelledby={`${id}-label`}
        min={min}
        max={max}
        step={1}
        value={[value]}
        onValueChange={([next]) => onChange(next)}
        className="py-3"
      />
      <FieldHint>{hint}</FieldHint>
    </div>
  )
}

export function LimitsFields({ form, update }: FormSectionProps): React.JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-gutter border-t-2 border-dashed border-border pt-8 md:grid-cols-2">
      <LimitSlider
        id="max-assets"
        label="Max Assets per Beat"
        hint="Assets downloaded for each script segment."
        min={1}
        max={5}
        value={form.maxAssetsPerBeat}
        onChange={(maxAssetsPerBeat) => update({ maxAssetsPerBeat })}
      />
      <LimitSlider
        id="max-total"
        label="Max Total Downloads"
        hint="Safety threshold to conserve API request limits."
        min={1}
        max={100}
        value={form.maxTotalDownloads}
        onChange={(maxTotalDownloads) => update({ maxTotalDownloads })}
      />
    </div>
  )
}
