import { Label } from '@renderer/components/ui/label'

interface FieldProps {
  label: string
  htmlFor: string
  action?: React.ReactNode
  children: React.ReactNode
}

export function Field({ label, htmlFor, action, children }: FieldProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <Label
          htmlFor={htmlFor}
          className="pl-0.5 font-mono text-[10px] tracking-wider text-on-surface-variant uppercase"
        >
          {label}
        </Label>
        {action}
      </div>
      {children}
    </div>
  )
}
