import React from 'react'
import { ArrowsClockwiseIcon } from '@phosphor-icons/react'

export function JobLoading(): React.JSX.Element {
  return (
    <div role="status" className="flex h-[400px] items-center justify-center">
      <ArrowsClockwiseIcon size={28} className="text-outline motion-safe:animate-spin" />
      <span className="sr-only">Loading the run</span>
    </div>
  )
}
