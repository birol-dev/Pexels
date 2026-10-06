import React from 'react'
import { Card } from '@renderer/components/ui/card'
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

      <h3 className="font-title-md text-title-md text-on-surface border-b-2 border-edge pb-2 inline-block self-start">
        Script Beats
      </h3>

      {job.beats.length === 0 ? (
        <Card variant="raised" className="gap-0 p-12 text-center text-xs font-medium text-on-surface-variant">
          Parsing the script and generating visual scenes. Please wait...
        </Card>
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
