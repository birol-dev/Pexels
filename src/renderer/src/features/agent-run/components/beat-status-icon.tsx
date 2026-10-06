import React from 'react'
import {
  ArrowsClockwiseIcon,
  CheckIcon,
  ClockIcon,
  HourglassIcon,
  XIcon
} from '@phosphor-icons/react'
import { cn } from '@renderer/lib/utils'
import type { VisualBeat } from '@renderer/lib/store'
import { getBeatIconBg } from '../utils'

function StatusGlyph({ status }: { status: VisualBeat['status'] }): React.JSX.Element {
  switch (status) {
    case 'completed':
      return <CheckIcon size={20} weight="bold" />
    case 'searching':
      return <ArrowsClockwiseIcon size={20} weight="bold" />
    case 'selecting':
    case 'downloading':
      return <HourglassIcon size={20} weight="bold" />
    case 'failed':
      return <XIcon size={20} weight="bold" />
    default:
      return <ClockIcon size={20} weight="bold" />
  }
}

export function BeatStatusIcon({ status }: { status: VisualBeat['status'] }): React.JSX.Element {
  return (
    <div
      className={cn(
        'absolute -left-4 -top-4 w-10 h-10 rounded-sm brutal-border flex items-center justify-center z-10 shadow-sm',
        getBeatIconBg(status)
      )}
    >
      <StatusGlyph status={status} />
    </div>
  )
}
