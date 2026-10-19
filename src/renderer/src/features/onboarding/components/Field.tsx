import { Label } from '@renderer/components/ui/label'

interface FieldProps {
  label: string
  htmlFor: string
  action?: React.ReactNode
  children: React.ReactNode
}

export function Field({ label, htmlFor, action, children }: FieldProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={htmlFor} className="text-[13px] font-medium text-on-surface">
          {label}
        </Label>
        {action}
      </div>
      {children}
    </div>
  )
}
