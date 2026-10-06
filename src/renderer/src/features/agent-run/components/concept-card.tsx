import React from 'react'
import { LightbulbIcon } from '@phosphor-icons/react'
import { Badge } from '@renderer/components/ui/badge'
import type { JobSnapshot } from '@renderer/lib/store'

export function ConceptCard({ job }: { job: JobSnapshot }): React.JSX.Element {
  return (
    <div className="p-4 bg-surface border-2 border-ink-black dark:border-surface-variant rounded-xl shadow-[3px_3px_0px_var(--color-ink-black)] flex flex-col gap-2.5 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <span className="font-title-md text-xs uppercase tracking-wider text-ink-black dark:text-paper-white font-bold flex items-center gap-1.5">
          <LightbulbIcon
            size={16}
            weight="fill"
            className="text-cyber-lime bg-ink-black p-0.5 rounded"
          />
          Concept & Visual Strategy
        </span>
        {job.inputMode === 'idea' && (
          <Badge className="rounded border-ink-black bg-cyber-lime font-mono text-[10px] font-bold text-ink-black">
            AI EXPANDED
          </Badge>
        )}
      </div>
      {job.idea && (
        <div className="text-xs text-outline dark:text-steel-secondary">
          <strong className="text-ink-black dark:text-paper-white">Origin Idea:</strong> &ldquo;
          {job.idea}&rdquo;
        </div>
      )}
      {job.visualConcept && (
        <div className="text-xs text-ink-black dark:text-paper-white bg-surface-container-low dark:bg-surface-container-lowest p-2.5 rounded border border-ink-black/20 dark:border-white/10 font-medium">
          <span className="font-mono text-[10px] text-primary dark:text-cyber-lime font-bold block mb-0.5">
            Visual Strategy:
          </span>
          {job.visualConcept}
        </div>
      )}
    </div>
  )
}
