import React from 'react'
import { Progress } from '@renderer/components/ui/progress'

export function PipelineProgress({ progress }: { progress: number }): React.JSX.Element {
  return (
    <section>
      <div className="mb-2.5 flex items-baseline justify-between text-[13px]">
        <span className="text-outline">Progress</span>
        <span className="font-medium text-on-surface tabular-nums">{progress}%</span>
      </div>
      <Progress
        value={progress}
        aria-label="Pipeline progress"
        className="h-1.5 [&>div]:duration-500"
      />
    </section>
  )
}
