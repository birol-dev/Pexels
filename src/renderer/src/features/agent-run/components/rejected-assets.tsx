import React from 'react'
import { Card } from '@renderer/components/ui/card'
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
          <Card
            key={idx}
            variant="danger"
            className="flex-row items-center justify-between gap-0 rounded-md p-2 text-xs font-semibold"
          >
            <span className="font-mono text-[11px]">
              {rej.type.toUpperCase()} #{rej.pexelsId}
            </span>
            <span className="opacity-95 italic">Reason: {rej.reason}</span>
          </Card>
        ))}
      </div>
    </div>
  )
}
