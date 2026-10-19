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
    <div className={cn('flex flex-col gap-2.5', className)}>
      <Label htmlFor={htmlFor} className="text-[13px] font-medium text-on-surface">
        {label}
      </Label>
      {children}
      {hint && <p className="text-[13px] leading-snug text-outline select-none">{hint}</p>}
    </div>
  )
}
