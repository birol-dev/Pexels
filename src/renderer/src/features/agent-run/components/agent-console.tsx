import React from 'react'
import { TerminalWindowIcon } from '@phosphor-icons/react'
import { Card } from '@renderer/components/ui/card'
import type { AgentLogEvent } from '@renderer/lib/store'
import { LogEntry } from './log-entry'

export function AgentConsole({ logs }: { logs: AgentLogEvent[] }): React.JSX.Element {
  return (
    <div className="col-span-12 xl:col-span-4 flex flex-col">
      <Card variant="raised" className="max-h-[750px] gap-0 overflow-hidden py-0">
        <div className="px-5 py-4 border-b-2 border-edge bg-surface-container-lowest flex justify-between items-center">
          <h3 className="font-title-md text-title-md text-on-surface flex items-center gap-2">
            <TerminalWindowIcon size={20} className="text-primary" />
            Agent Console
          </h3>
          <span className="font-mono text-[11px] text-outline flex items-center gap-1.5 font-bold">
            <span className="relative flex h-2 w-2">
              <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-cyber-lime opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyber-lime"></span>
            </span>
            Live Feed
          </span>
        </div>

        <div className="grow p-5 overflow-y-auto log-scroll bg-surface-container-low dark:bg-surface-container-lowest font-mono text-xs flex flex-col gap-4">
          {logs.map((log, index) => (
            <LogEntry key={index} log={log} />
          ))}
        </div>

        <p className="px-5 py-3 border-t-2 border-edge bg-surface-container-lowest font-body-md text-xs text-outline">
          Full search results are saved in agent-state.json in the project folder.
        </p>
      </Card>
    </div>
  )
}
