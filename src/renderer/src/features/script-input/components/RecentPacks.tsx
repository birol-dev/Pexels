import React from 'react'
import { ArrowCounterClockwiseIcon, ImagesIcon, TrashIcon } from '@phosphor-icons/react'
import { EmptyState } from '@renderer/components/common/EmptyState'
import { Button } from '@renderer/components/ui/button'
import type { JobSummary } from '@renderer/lib/store'
import { useAppStore } from '@renderer/lib/store'
import { cn } from '@renderer/lib/utils'
import { SAMPLE_SCRIPT } from '../constants'
import { useInputTabForm } from '../hooks/useInputTabForm'
import { useJobCovers } from '../hooks/useJobCovers'
import { useJobHistory } from '../hooks/useJobHistory'
import { formatRelativeTime } from '../utils'

const STATUS: Record<JobSummary['status'], { label: string; className: string }> = {
  running: { label: 'Running', className: 'text-on-surface' },
  paused: { label: 'Waiting for you', className: 'text-on-surface' },
  completed: { label: 'Done', className: 'text-outline' },
  failed: { label: 'Failed', className: 'text-error' },
  cancelled: { label: 'Cancelled', className: 'text-outline' }
}

/** Recent packs as photo cards, three to a row; a Day-1 empty state before the first one. */
export function RecentPacks(): React.JSX.Element {
  const { jobs, loading, openJob, rerunJob, deleteJob } = useJobHistory()
  const covers = useJobCovers(jobs)
  const navigate = useAppStore((s) => s.navigate)
  const { form, update } = useInputTabForm()

  const fillSample = (): void => {
    update({
      inputMode: 'script',
      title: form.title.trim() || SAMPLE_SCRIPT.title,
      script: SAMPLE_SCRIPT.script
    })
    requestAnimationFrame(() => document.getElementById('video-script')?.focus())
  }

  return (
    <section aria-labelledby="recent-packs-title">
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <h2 id="recent-packs-title" className="text-title-md font-title-md text-on-surface">
          Recent packs
        </h2>
        {jobs.length > 0 && (
          <span className="text-[13px] text-outline">
            {jobs.length} {jobs.length === 1 ? 'pack' : 'packs'}, newest first
          </span>
        )}
      </div>

      {jobs.length === 0 ? (
        <EmptyState
          title="No packs yet"
          description="Your first pack lands here, with a preview of the footage it found."
          action={<Button onClick={fillSample}>Try a sample script</Button>}
          secondary={
            <Button variant="link" className="px-0" onClick={() => navigate('settings')}>
              Check your keys
            </Button>
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 xl:grid-cols-3">
          {jobs.map((job) => {
            const status = STATUS[job.status] ?? STATUS.cancelled
            return (
              <li key={job.jobId} className="group/pack">
                <button
                  type="button"
                  onClick={() => openJob(job.jobId)}
                  className="block w-full cursor-pointer rounded-2xl text-left focus-visible:ring-[3px] focus-visible:ring-ring/25 focus-visible:outline-none"
                  aria-label={`Open ${job.title}`}
                >
                  <PackCover urls={covers[job.jobId] ?? []} />
                </button>
                <div className="mt-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-[15px] font-semibold text-on-surface">
                      {job.title}
                    </h3>
                    <p className="mt-0.5 truncate text-[13px] text-outline">
                      <span className={status.className}>{status.label}</span>
                      {job.status !== 'running' && ` · ${job.assetCount} assets`}
                      {' · '}
                      {formatRelativeTime(job.createdAt)}
                    </p>
                  </div>
                  <div className="-mt-1 -mr-1.5 flex shrink-0 opacity-0 transition-opacity group-hover/pack:opacity-100 focus-within:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-outline"
                      onClick={() => rerunJob(job.jobId)}
                      disabled={loading}
                      aria-label="Rerun Project"
                      title="Run again"
                    >
                      <ArrowCounterClockwiseIcon size={18} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-outline hover:text-error"
                      onClick={() => deleteJob(job.jobId, job.title)}
                      aria-label="Delete Project & Files"
                      title="Move to trash"
                    >
                      <TrashIcon size={18} />
                    </Button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/** One big preview and two small ones, or a quiet placeholder while there are none. */
function PackCover({ urls }: { urls: string[] }): React.JSX.Element {
  const frame = 'aspect-[16/10] overflow-hidden rounded-2xl bg-surface-container'
  const img =
    'size-full object-cover transition-transform duration-500 group-hover/pack:scale-[1.03]'

  if (urls.length === 0) {
    return (
      <div className={cn(frame, 'flex items-center justify-center text-fade')}>
        <ImagesIcon size={32} />
      </div>
    )
  }

  if (urls.length < 3) {
    return (
      <div className={frame}>
        <img src={urls[0]} alt="" loading="lazy" className={img} />
      </div>
    )
  }

  return (
    <div className={cn(frame, 'grid grid-cols-[2fr_1fr] grid-rows-2 gap-[3px] bg-background')}>
      <div className="row-span-2 overflow-hidden">
        <img src={urls[0]} alt="" loading="lazy" className={img} />
      </div>
      <div className="overflow-hidden">
        <img src={urls[1]} alt="" loading="lazy" className={img} />
      </div>
      <div className="overflow-hidden">
        <img src={urls[2]} alt="" loading="lazy" className={img} />
      </div>
    </div>
  )
}
