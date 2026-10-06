import React from 'react'
import {
  ArrowCounterClockwiseIcon,
  ClockCounterClockwiseIcon,
  EyeIcon,
  TrashIcon
} from '@phosphor-icons/react'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@renderer/components/ui/table'
import { useJobHistory } from '../hooks/useJobHistory'
import { JobStatusBadge } from './JobStatusBadge'

const HEAD_CLASS =
  'px-6 py-3.5 font-title-md text-xs font-bold uppercase tracking-wider text-on-surface'

export function RunHistory(): React.JSX.Element {
  const { jobs, loading, openJob, rerunJob, deleteJob } = useJobHistory()

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="flex items-center justify-between border-b-2 border-edge bg-paper-white p-5 dark:bg-surface-container-lowest">
        <h3 className="flex items-center gap-2 font-title-md text-title-md text-on-surface">
          <ClockCounterClockwiseIcon
            size={28}
            weight="fill"
            className="rounded-sm bg-black p-1.5 text-cyber-lime"
          />
          Recent Pack Generations
        </h3>
        <span className="font-label-sm text-label-sm text-outline">Sorted by Newest</span>
      </div>

      {jobs.length === 0 ? (
        <div className="p-8 text-center text-xs font-medium text-on-surface-variant">
          No historical runs found. Create a project above to kick off.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="border-b-2 border-edge bg-surface-container-low">
              <TableHead className={HEAD_CLASS}>Project Title</TableHead>
              <TableHead className={HEAD_CLASS}>Status</TableHead>
              <TableHead className={HEAD_CLASS}>Assets</TableHead>
              <TableHead className={HEAD_CLASS}>Date</TableHead>
              <TableHead className={`${HEAD_CLASS} text-right`}>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="text-xs font-medium text-on-surface">
            {jobs.map((job) => (
              <TableRow
                key={job.jobId}
                onClick={() => openJob(job.jobId)}
                className="cursor-pointer border-b border-outline-variant/30"
              >
                <TableCell className="px-6 py-4 text-sm font-bold text-on-surface">
                  {job.title}
                </TableCell>
                <TableCell className="px-6 py-4">
                  <JobStatusBadge status={job.status} />
                </TableCell>
                <TableCell className="px-6 py-4 font-mono text-outline">
                  {job.status === 'running' ? '--' : `${job.assetCount} assets`}
                </TableCell>
                <TableCell className="px-6 py-4 font-mono text-outline">
                  {new Date(job.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="secondary"
                      size="icon-sm"
                      onClick={() => openJob(job.jobId)}
                      aria-label="Open View"
                      title="Open View"
                    >
                      <EyeIcon size={18} />
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon-sm"
                      onClick={() => rerunJob(job.jobId)}
                      disabled={loading}
                      aria-label="Rerun Project"
                      title="Rerun Project"
                    >
                      <ArrowCounterClockwiseIcon size={18} />
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon-sm"
                      className="hover:text-error"
                      onClick={() => deleteJob(job.jobId, job.title)}
                      aria-label="Delete Project & Files"
                      title="Delete Project & Files"
                    >
                      <TrashIcon size={18} />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  )
}
