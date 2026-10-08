import React from 'react'
import { Button } from '@renderer/components/ui/button'
import { Slider } from '@renderer/components/ui/slider'
import {
  MAX_TOTAL_DOWNLOADS,
  capForShots,
  recommendedShotCount
} from '../../../../../shared/shot-count'
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
  children?: React.ReactNode
}

function LimitSlider({
  id,
  label,
  hint,
  min,
  max,
  value,
  onChange,
  children
}: LimitSliderProps): React.JSX.Element {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <FieldLabel id={`${id}-label`} className="mb-0">
          {label}
        </FieldLabel>
        <span className="font-mono text-sm font-bold text-primary">{value}</span>
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
      {children}
    </div>
  )
}

/** How many shots the script needs, and a way to raise the download cap to match. */
function ShotCountNote({ form, update }: FormSectionProps): React.JSX.Element | null {
  if (!form.script.trim()) return null

  const shots = recommendedShotCount(form.script)
  const cap = form.maxTotalDownloads
  const suggestedCap = capForShots(shots)

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
      <p className="text-xs text-on-surface-variant">
        About {shots} shots for this script.
        {cap < shots && ` Your cap of ${cap} leaves some sentences without footage.`}
      </p>
      {cap < suggestedCap && (
        <Button
          type="button"
          variant="secondary"
          size="xs"
          onClick={() => update({ maxTotalDownloads: suggestedCap })}
        >
          Set cap to {suggestedCap}
        </Button>
      )}
    </div>
  )
}

export function LimitsFields({ form, update }: FormSectionProps): React.JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-gutter border-t-2 border-dashed border-border pt-8 md:grid-cols-2">
      <LimitSlider
        id="max-assets"
        label="Options per Beat"
        hint="Alternatives downloaded for each script segment. The total cap can lower this."
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
        max={MAX_TOTAL_DOWNLOADS}
        value={form.maxTotalDownloads}
        onChange={(maxTotalDownloads) => update({ maxTotalDownloads })}
      >
        <ShotCountNote form={form} update={update} />
      </LimitSlider>
    </div>
  )
}
