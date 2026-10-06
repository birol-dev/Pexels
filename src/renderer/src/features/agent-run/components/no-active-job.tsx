import React from 'react'
import { WarningIcon } from '@phosphor-icons/react'
import { Button } from '@renderer/components/ui/button'

export function NoActiveJob({ onBack }: { onBack: () => void }): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center h-[400px] text-center space-y-4 animate-fade-in-up">
      <WarningIcon size={48} weight="fill" className="text-tertiary" />
      <div>
        <h2 className="text-xl font-bold">No Active Job</h2>
        <p className="text-sm text-on-surface-variant mt-1">
          Select a run from history or create a new script project to get started.
        </p>
      </div>
      <Button variant="violet" onClick={onBack}>
        Back to Dashboard
      </Button>
    </div>
  )
}
