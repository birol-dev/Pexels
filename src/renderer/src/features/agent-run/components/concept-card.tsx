import React from 'react'
import { LightbulbIcon } from '@phosphor-icons/react'
import { Badge } from '@renderer/components/ui/badge'
import type { JobSnapshot } from '@renderer/lib/store'

export function ConceptCard({ job }: { job: JobSnapshot }): React.JSX.Element {
  return (
    <div className="p-4 bg-surface border-2 border-edge rounded-xl shadow-[3px_3px_0_var(--color-hard-shadow)] flex flex-col gap-2.5 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <span className="font-title-md text-xs uppercase tracking-wider text-on-surface font-bold flex items-center gap-1.5">
          <LightbulbIcon
            size={16}
            weight="fill"
            className="text-cyber-lime bg-black p-0.5 rounded"
          />
          Concept & Visual Strategy
        </span>
        {job.inputMode === 'idea' && (
          <Badge className="rounded border-ink-black bg-cyber-lime font-mono text-[11px] font-bold text-on-primary-container">
            AI EXPANDED
          </Badge>
        )}
      </div>
      {job.idea && (
        <div className="text-xs text-outline">
          <strong className="text-on-surface">Origin Idea:</strong> &ldquo;
          {job.idea}&rdquo;
        </div>
      )}
      {job.visualConcept && (
        <div className="text-xs text-on-surface bg-surface-container-low dark:bg-surface-container-lowest p-2.5 rounded border border-border font-medium">
          <span className="font-mono text-[11px] text-primary font-bold block mb-0.5">
            Visual Strategy:
          </span>
          {job.visualConcept}
        </div>
      )}
    </div>
  )
}
