import React from 'react'
import { EmptyState } from '@renderer/components/common/EmptyState'
import { Button } from '@renderer/components/ui/button'

export function NoActiveJob({ onBack }: { onBack: () => void }): React.JSX.Element {
  return (
    <div className="animate-fade-in-up mx-auto max-w-2xl pt-10">
      <EmptyState
        title="No run open"
        description="Open a pack from Recent packs, or start a new one from a script."
        action={<Button onClick={onBack}>Start a pack</Button>}
      />
    </div>
  )
}
