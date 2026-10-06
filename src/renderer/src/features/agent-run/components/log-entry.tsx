import React from 'react'
import { cn } from '@renderer/lib/utils'
import type { AgentLogEvent } from '@renderer/lib/store'
import { formatLogData, getLogColor } from '../utils'

export function LogEntry({ log }: { log: AgentLogEvent }): React.JSX.Element {
  return (
    <div className="space-y-1">
      <div className="flex items-center space-x-2 text-xs text-outline border-b border-border pb-1 font-semibold">
        <span>[{new Date(log.timestamp).toLocaleTimeString()}]</span>
        <span className="uppercase text-primary font-bold">{log.type.replace('_', ' ')}</span>
      </div>
      <div className={cn('leading-relaxed whitespace-pre-wrap text-xs', getLogColor(log.type))}>
        {log.message}
      </div>
      {log.data ? (
        <pre className="bg-surface-container/60 border border-border rounded p-2.5 text-xs text-on-surface-variant leading-normal overflow-x-auto whitespace-pre font-mono mt-1.5 max-h-60">
          {formatLogData(log.data)}
        </pre>
      ) : null}
    </div>
  )
}
