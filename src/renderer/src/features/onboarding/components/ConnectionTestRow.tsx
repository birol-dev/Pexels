import type { Icon } from '@phosphor-icons/react'
import { CheckCircleIcon, CircleNotchIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import type { TestResult } from '../types'

interface ConnectionTestRowProps {
  idleLabel: string
  idleIcon: Icon
  successText: string
  failureText: string
  testing: boolean
  result: TestResult | null
  onTest: () => void
  shakeOnFailure?: boolean
}

export function ConnectionTestRow({
  idleLabel,
  idleIcon: IdleIcon,
  successText,
  failureText,
  testing,
  result,
  onTest,
  shakeOnFailure
}: ConnectionTestRowProps): React.JSX.Element {
  return (
    <div className="flex items-center justify-between pt-2">
      <Button type="button" variant="secondary" size="sm" onClick={onTest} disabled={testing}>
        {testing ? <CircleNotchIcon className="animate-spin" /> : <IdleIcon />}
        {testing ? 'Testing...' : idleLabel}
      </Button>

      {result && (
        <span
          role="status"
          className={cn(
            'flex items-center gap-1.5 text-xs font-semibold',
            result.success ? 'text-secondary' : cn('text-error', shakeOnFailure && 'animate-shake')
          )}
        >
          {result.success ? <CheckCircleIcon size={16} /> : <WarningCircleIcon size={16} />}
          {result.success ? successText : failureText}
        </span>
      )}
    </div>
  )
}
