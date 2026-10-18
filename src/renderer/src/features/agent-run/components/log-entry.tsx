import React from 'react'
import { cn } from '@renderer/lib/utils'
import type { AgentLogEvent } from '@renderer/lib/store'
import { formatLogData, getLogColor, getLogLabel } from '../utils'

export function LogEntry({ log }: { log: AgentLogEvent }): React.JSX.Element {
  return (
    <div>
      <div className="flex items-baseline gap-2 text-[12px]">
        <span className="font-medium text-on-surface">{getLogLabel(log.type)}</span>
        <span className="text-outline tabular-nums">
          {new Date(log.timestamp).toLocaleTimeString()}
        </span>
      </div>
      <div
        className={cn(
          'mt-1 text-[13px] leading-relaxed whitespace-pre-wrap',
          getLogColor(log.type)
        )}
      >
        {log.message}
      </div>
      {log.data ? (
        <pre className="mt-2 max-h-60 overflow-x-auto rounded-xl bg-background p-3 font-mono text-[11px] leading-normal whitespace-pre text-on-surface-variant">
          {formatLogData(log.data)}
        </pre>
      ) : null}
    </div>
  )
}
