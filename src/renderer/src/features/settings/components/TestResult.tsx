import { CheckCircleIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { cn } from '@renderer/lib/utils'
import type { TestResultState } from '../utils'

interface TestResultProps {
  title: string
  result: TestResultState | null
}

export function TestResult({ title, result }: TestResultProps): React.JSX.Element | null {
  if (!result) return null
  const StatusIcon = result.success ? CheckCircleIcon : WarningCircleIcon
  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-3 rounded-md border-2 border-ink-black p-3',
        result.success
          ? 'bg-cyber-lime/10 text-foreground'
          : 'bg-error-container text-on-error-container'
      )}
    >
      <StatusIcon size={20} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
      <div>
        <div className="font-title-md text-[14px] uppercase">{title}</div>
        <div className="font-body-md mt-0.5 text-[12px] leading-normal opacity-90">
          {result.message}
        </div>
      </div>
    </div>
  )
}
