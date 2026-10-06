import React from 'react'
import { LightbulbIcon } from '@phosphor-icons/react'
import { Badge } from '@renderer/components/ui/badge'
import { Card } from '@renderer/components/ui/card'
import type { JobSnapshot } from '@renderer/lib/store'

export function ConceptCard({ job }: { job: JobSnapshot }): React.JSX.Element {
  return (
    <Card variant="raised" className="animate-fade-in-up gap-2.5 p-4">
      <div className="flex items-center justify-between">
        <span className="font-title-md text-xs uppercase tracking-wider text-on-surface font-bold flex items-center gap-1.5">
          <LightbulbIcon
            size={16}
            weight="fill"
            className="rounded-sm bg-black p-0.5 text-cyber-lime"
          />
          Concept & Visual Strategy
        </span>
        {job.inputMode === 'idea' && (
          <Badge className="border-edge bg-cyber-lime font-mono text-[11px] font-bold text-on-primary-container">
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
        <Card variant="sunken" className="gap-0 rounded-md p-2.5 text-xs font-medium">
          <span className="font-mono text-[11px] text-primary font-bold block mb-0.5">
            Visual Strategy:
          </span>
          {job.visualConcept}
        </Card>
      )}
    </Card>
  )
}
