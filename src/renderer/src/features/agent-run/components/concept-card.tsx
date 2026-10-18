import React from 'react'
import { LightbulbIcon } from '@phosphor-icons/react'
import type { JobSnapshot } from '@renderer/lib/store'

/** The idea the script came from and the visual strategy, in one tinted panel. */
export function ConceptCard({ job }: { job: JobSnapshot }): React.JSX.Element {
  return (
    <section className="animate-fade-in-up rounded-3xl bg-surface-container-low p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-3 text-[15px] font-semibold text-on-surface">
          <span className="flex size-8 items-center justify-center rounded-full bg-background">
            <LightbulbIcon size={16} />
          </span>
          Concept and visual strategy
        </h2>
        {job.inputMode === 'idea' && (
          <span className="flex h-7 items-center rounded-full bg-background px-3 text-[12px] text-on-surface-variant">
            Written from your idea
          </span>
        )}
      </div>
      {job.idea && (
        <div className="mt-5">
          <span className="text-[12px] text-outline">The idea</span>
          <p className="mt-1 font-headline-lg text-[22px] leading-snug font-light text-on-surface">
            &ldquo;{job.idea}&rdquo;
          </p>
        </div>
      )}
      {job.visualConcept && (
        <div className="mt-5">
          <span className="text-[12px] text-outline">Visual strategy</span>
          <p className="mt-1 text-[14px] leading-relaxed text-on-surface-variant">
            {job.visualConcept}
          </p>
        </div>
      )}
    </section>
  )
}
