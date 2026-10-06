import React from 'react'
import type { VisualBeat } from '@renderer/lib/store'

type Rejected = NonNullable<VisualBeat['rejectedAssets']>

export function RejectedAssets({ items }: { items: Rejected }): React.JSX.Element {
  return (
    <div className="border-t-2 border-edge border-dashed pt-3.5 mt-3">
      <div className="text-[11px] font-title-md text-outline uppercase tracking-wider mb-2 font-bold">
        Skipped / Filtered Out:
      </div>
      <div className="space-y-1.5">
        {items.map((rej, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between text-xs bg-error-container border-2 border-ink-black text-on-error-container font-semibold rounded p-2 shadow-hard-sm"
          >
            <span className="font-mono text-[11px]">
              {rej.type.toUpperCase()} #{rej.pexelsId}
            </span>
            <span className="opacity-95 italic">Reason: {rej.reason}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
