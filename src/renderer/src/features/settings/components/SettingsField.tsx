import { Label } from '@renderer/components/ui/label'
import { cn } from '@renderer/lib/utils'

interface SettingsFieldProps {
  label: string
  htmlFor?: string
  hint?: string
  className?: string
  children: React.ReactNode
}

export function SettingsField({
  label,
  htmlFor,
  hint,
  className,
  children
}: SettingsFieldProps): React.JSX.Element {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Label htmlFor={htmlFor} className="font-label-sm text-label-sm uppercase text-foreground">
        {label}
      </Label>
      {children}
      {hint && <p className="select-none text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  )
}
