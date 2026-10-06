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
      <div className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor={id} className="font-label-sm text-label-sm uppercase text-foreground">
            {label}
          </Label>
          {hint && <p className="select-none text-[10px] text-muted-foreground">{hint}</p>}
        </div>
        <span className="shrink-0 font-mono font-bold text-electric-purple">
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
