import React from 'react'
import type { VisualBeat } from '@renderer/lib/store'

type Rejected = NonNullable<VisualBeat['rejectedAssets']>

export function RejectedAssets({ items }: { items: Rejected }): React.JSX.Element {
  return (
    <div className="mt-5">
      <p className="text-[12px] text-outline">
        Skipped {items.length} {items.length === 1 ? 'result' : 'results'}
      </p>
      <ul className="mt-2 divide-y divide-border rounded-2xl bg-surface-container-low px-4">
        {items.map((rej, idx) => (
          <li key={idx} className="flex items-baseline justify-between gap-4 py-2.5 text-[13px]">
            <span className="shrink-0 text-on-surface tabular-nums">
              <span className="capitalize">{rej.type}</span> #{rej.pexelsId}
            </span>
            <span className="min-w-0 text-right text-outline">{rej.reason}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
