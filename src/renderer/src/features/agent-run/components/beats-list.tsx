import React from 'react'
import { ArrowsClockwiseIcon } from '@phosphor-icons/react'
import type { JobSnapshot } from '@renderer/lib/store'
import type { ApprovalSelection } from '../utils'
import { BeatCard } from './beat-card'
import { ConceptCard } from './concept-card'

interface BeatsListProps {
  job: JobSnapshot
  selection: ApprovalSelection
  onApprove: (assetId: string) => void
  onReject: (assetId: string) => void
}

export function BeatsList({
  job,
  selection,
  onApprove,
  onReject
}: BeatsListProps): React.JSX.Element {
  const done = job.beats.filter((beat) => beat.status === 'completed').length
  return (
    <div className="col-span-12 flex flex-col gap-8 xl:col-span-8">
      {(job.idea || job.visualConcept) && <ConceptCard job={job} />}

      <section aria-labelledby="beats-title">
        <div className="flex items-baseline justify-between gap-4 border-b border-border pb-4">
          <h2 id="beats-title" className="text-title-md font-title-md text-on-surface">
            Beats
          </h2>
          {job.beats.length > 0 && (
            <span className="text-[13px] text-outline tabular-nums">
              {done} of {job.beats.length} done
            </span>
          )}
        </div>

        {job.beats.length === 0 ? (
          <div className="mt-6 flex flex-col items-center gap-3 rounded-3xl bg-surface-container-low px-6 py-14 text-center">
            <ArrowsClockwiseIcon size={22} className="text-outline motion-safe:animate-spin" />
            <p className="text-sm text-outline">
              Reading the script and writing a search for each beat…
            </p>
          </div>
        ) : (
          <ol className="divide-y divide-border">
            {job.beats.map((beat, index) => (
              <BeatCard
                key={beat.id}
                beat={beat}
                index={index}
                reviewing={job.status === 'paused'}
                selection={selection}
                onApprove={onApprove}
                onReject={onReject}
              />
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
