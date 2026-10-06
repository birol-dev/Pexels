import React from 'react'
import { Button } from '@renderer/components/ui/button'

interface ApprovalBannerProps {
  approvedCount: number
  rejectedCount: number
  onApproveAll: () => void
  onRejectAll: () => void
}

export function ApprovalBanner({
  approvedCount,
  rejectedCount,
  onApproveAll,
  onRejectAll
}: ApprovalBannerProps): React.JSX.Element {
  return (
    <div className="mx-grid-margin p-4 border-2 border-ink-black rounded-xl bg-tertiary-container text-on-tertiary-container shadow-[4px_4px_0px_var(--color-ink-black)]">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="font-bold text-ink-black">Review selected assets before download</div>
          <div className="mt-0.5 text-xs font-semibold opacity-90">
            {approvedCount} approved, {rejectedCount} rejected.
          </div>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onApproveAll}>
            Approve All
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={onRejectAll}>
            Reject All
          </Button>
        </div>
      </div>
    </div>
  )
}
