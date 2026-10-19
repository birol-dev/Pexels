import { Label } from '@renderer/components/ui/label'
import { Slider } from '@renderer/components/ui/slider'

interface SliderFieldProps {
  id: string
  label: string
  hint?: string
  value: number
  displayValue?: string
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
}

export function SliderField({
  id,
  label,
  hint,
  value,
  displayValue,
  min,
  max,
  step = 1,
  onChange
}: SliderFieldProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-6">
        <div>
          <Label htmlFor={id} className="text-sm font-semibold text-on-surface">
            {label}
          </Label>
          {hint && (
            <p className="mt-1 max-w-prose text-[13px] leading-snug text-outline select-none">
              {hint}
            </p>
          )}
        </div>
        <span className="shrink-0 text-sm font-semibold text-on-surface tabular-nums">
          {displayValue ?? value}
        </span>
      </div>
      <Slider
        id={id}
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([next]) => onChange(next)}
      />
    </div>
  )
}
