import { Label } from '@renderer/components/ui/label'
import { Switch } from '@renderer/components/ui/switch'

interface ToggleRowProps {
  id: string
  label: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

export function ToggleRow({
  id,
  label,
  description,
  checked,
  onCheckedChange
}: ToggleRowProps): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-6">
      <Label htmlFor={id} className="flex cursor-pointer flex-col items-start gap-1">
        <span className="text-sm leading-snug font-semibold text-on-surface">{label}</span>
        <span className="text-[13px] leading-snug font-normal text-outline">{description}</span>
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
    </div>
  )
}
