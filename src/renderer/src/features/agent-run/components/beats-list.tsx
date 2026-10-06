import React from 'react'
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
  return (
    <div className="col-span-12 xl:col-span-8 flex flex-col gap-6">
      {(job.idea || job.visualConcept) && <ConceptCard job={job} />}

      <h3 className="font-title-md text-title-md text-ink-black dark:text-paper-white border-b-2 border-ink-black dark:border-surface-variant pb-2 inline-block self-start">
        Script Beats
      </h3>

      {job.beats.length === 0 ? (
        <div className="bg-surface border-2 border-ink-black rounded-xl p-12 text-center text-xs text-on-surface-variant font-medium shadow-[4px_4px_0px_var(--color-ink-black)]">
          Parsing the script and generating visual scenes. Please wait...
        </div>
      ) : (
        job.beats.map((beat) => (
          <BeatCard
            key={beat.id}
            beat={beat}
            reviewing={job.status === 'paused'}
            selection={selection}
            onApprove={onApprove}
            onReject={onReject}
          />
        ))
      )}
    </div>
  )
}
