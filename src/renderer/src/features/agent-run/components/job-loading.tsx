import React from 'react'
import { ArrowsClockwiseIcon } from '@phosphor-icons/react'

export function JobLoading(): React.JSX.Element {
  return (
    <div className="flex h-[400px] items-center justify-center bg-transparent">
      <ArrowsClockwiseIcon size={48} className="text-primary animate-spin" />
    </div>
  )
}
