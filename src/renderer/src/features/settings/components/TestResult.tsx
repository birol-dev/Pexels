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
        'flex items-start gap-3 rounded-2xl px-4 py-3.5',
        result.success
          ? 'bg-surface-container text-on-surface'
          : 'bg-error-container text-on-error-container'
      )}
    >
      <StatusIcon size={20} weight="fill" className="mt-px shrink-0" aria-hidden />
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <div className="mt-0.5 text-[13px] leading-normal opacity-90">{result.message}</div>
      </div>
    </div>
  )
}
