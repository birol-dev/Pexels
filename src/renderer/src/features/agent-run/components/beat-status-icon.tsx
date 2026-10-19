import React from 'react'
import {
  ArrowsClockwiseIcon,
  CheckIcon,
  ClockIcon,
  DownloadSimpleIcon,
  HourglassIcon,
  XIcon
} from '@phosphor-icons/react'
import { cn } from '@renderer/lib/utils'
import type { VisualBeat } from '@renderer/lib/store'
import { getBeatIconBg } from '../utils'

function StatusGlyph({ status }: { status: VisualBeat['status'] }): React.JSX.Element {
  switch (status) {
    case 'completed':
      return <CheckIcon size={16} weight="bold" />
    case 'searching':
      return <ArrowsClockwiseIcon size={16} className="motion-safe:animate-spin" />
    case 'selecting':
      return <HourglassIcon size={16} />
    case 'downloading':
      return <DownloadSimpleIcon size={16} />
    case 'failed':
      return <XIcon size={16} weight="bold" />
    default:
      return <ClockIcon size={16} />
  }
}

export function BeatStatusIcon({ status }: { status: VisualBeat['status'] }): React.JSX.Element {
  return (
    <div
      aria-hidden
      className={cn(
        'flex size-9 items-center justify-center rounded-full transition-colors',
        getBeatIconBg(status)
      )}
    >
      <StatusGlyph status={status} />
    </div>
  )
}
