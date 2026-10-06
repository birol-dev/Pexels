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
    <div className="flex items-center justify-between gap-4">
      <Label htmlFor={id} className="flex cursor-pointer flex-col items-start gap-1">
        <span className="font-body-md text-body-md font-bold leading-tight text-foreground">
          {label}
        </span>
        <span className="text-xs font-normal text-muted-foreground">{description}</span>
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
    </div>
  )
}
