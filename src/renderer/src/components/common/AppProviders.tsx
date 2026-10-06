import React from 'react'
import { TooltipProvider } from '@renderer/components/ui/tooltip'
import { Toaster } from '@renderer/components/ui/sonner'
import { ConfirmModal } from '@renderer/components/common/ConfirmModal'

/** Global overlays/providers that must exist on every screen (including onboarding). */
export function AppProviders({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <TooltipProvider delayDuration={200}>
      {children}
      <ConfirmModal />
      <Toaster />
    </TooltipProvider>
  )
}
