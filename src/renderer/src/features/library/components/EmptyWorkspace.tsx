import React from 'react'
import { ImagesIcon } from '@phosphor-icons/react'
import { LiquidMetalButton } from '@renderer/components/ui/liquid-metal-button'

export function EmptyWorkspace({ onBack }: { onBack: () => void }): React.JSX.Element {
  return (
    <div className="flex h-[400px] animate-fade-in-up flex-col items-center justify-center space-y-4 text-center">
      <ImagesIcon size={48} className="text-outline" />
      <div>
        <h2 className="text-xl font-bold text-on-surface uppercase">No Workspace Active</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Select a running or completed project from history to inspect downloaded files.
        </p>
      </div>
      <LiquidMetalButton label="Back to Dashboard" width={190} onClick={onBack} />
    </div>
  )
}
