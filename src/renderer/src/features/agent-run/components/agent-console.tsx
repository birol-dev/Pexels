import React from 'react'
import { TerminalWindowIcon } from '@phosphor-icons/react'
import type { AgentLogEvent } from '@renderer/lib/store'
import { LogEntry } from './log-entry'

export function AgentConsole({ logs }: { logs: AgentLogEvent[] }): React.JSX.Element {
  return (
    <div className="col-span-12 xl:col-span-4 flex flex-col">
      <div className="bg-surface border-2 border-ink-black dark:border-surface-variant rounded flex flex-col overflow-hidden max-h-[750px] shadow-[4px_4px_0px_#18181B] dark:shadow-[4px_4px_0px_var(--color-cyber-lime)]">
        <div className="px-5 py-4 border-b-2 border-ink-black dark:border-surface-variant bg-paper-white dark:bg-surface-container-lowest flex justify-between items-center">
          <h3 className="font-title-md text-title-md text-ink-black dark:text-paper-white flex items-center gap-2">
            <TerminalWindowIcon size={20} className="text-primary" />
            Agent Console
          </h3>
          <span className="font-mono text-[10px] text-outline dark:text-steel-secondary flex items-center gap-1.5 font-bold">
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
      </div>
    </div>
  )
}
