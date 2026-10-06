import React from 'react'
import { Progress } from '@renderer/components/ui/progress'

export function PipelineProgress({ progress }: { progress: number }): React.JSX.Element {
  return (
    <section className="mb-gutter mt-8">
      <div className="flex justify-between items-baseline mb-2">
        <h3 className="font-title-md text-title-md text-on-surface">Pipeline Status</h3>
        <span className="font-label-sm text-label-sm text-on-surface font-bold">{progress}%</span>
      </div>
      <Progress
        value={progress}
        aria-label="Pipeline progress"
        className="h-8 border-2 border-ink-black bg-surface-variant dark:bg-surface-container-lowest [&>div]:bg-cyber-lime [&>div]:border-r-2 [&>div]:border-ink-black [&>div]:duration-500"
      />
    </section>
  )
}
