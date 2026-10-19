import React from 'react'
import type { AgentLogEvent } from '@renderer/lib/store'
import { cn } from '@renderer/lib/utils'
import { LogEntry } from './log-entry'

/** The agent's log as a tinted side panel; a pulsing dot while the run is live. */
export function AgentConsole({
  logs,
  live
}: {
  logs: AgentLogEvent[]
  live: boolean
}): React.JSX.Element {
  return (
    <aside
      aria-label="Agent log"
      className="col-span-12 flex max-h-[760px] flex-col overflow-hidden rounded-3xl bg-surface-container-low xl:sticky xl:top-0 xl:col-span-4"
    >
      <div className="flex items-center justify-between px-6 pt-5 pb-4">
        <h2 className="text-[15px] font-semibold text-on-surface">Agent log</h2>
        <span className="flex items-center gap-2 text-[12px] text-outline">
          <span className="relative flex size-2">
            {live && (
              <span className="absolute inline-flex size-full rounded-full bg-on-surface opacity-60 motion-safe:animate-ping" />
            )}
            <span
              className={cn(
                'relative inline-flex size-2 rounded-full',
                live ? 'bg-on-surface' : 'bg-outline/50'
              )}
            />
          </span>
          {live ? 'Live' : `${logs.length} entries`}
        </span>
      </div>

      <div className="log-scroll flex grow flex-col gap-5 overflow-y-auto px-6 pb-6">
        {logs.length === 0 ? (
          <p className="text-[13px] text-outline">The agent’s steps show up here as it works.</p>
        ) : (
          logs.map((log, index) => <LogEntry key={index} log={log} />)
        )}
      </div>

      <p className="border-t border-border px-6 py-3.5 text-[12px] leading-snug text-outline">
        Full search results are saved in agent-state.json in the project folder.
      </p>
    </aside>
  )
}
