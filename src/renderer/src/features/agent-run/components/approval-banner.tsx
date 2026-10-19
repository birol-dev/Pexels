import React from 'react'
import { EyeIcon } from '@phosphor-icons/react'
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
    <div className="flex flex-col gap-4 rounded-3xl bg-surface-container-low px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-background text-on-surface">
          <EyeIcon size={20} />
        </span>
        <div>
          <p className="text-[15px] font-semibold text-on-surface">
            Review the picks before they download
          </p>
          <p className="mt-0.5 text-[13px] text-outline tabular-nums">
            {approvedCount} approved, {rejectedCount} rejected. Approve selected to go on.
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="bg-background hover:bg-background/70"
          onClick={onApproveAll}
        >
          Approve all
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="bg-background hover:bg-background/70"
          onClick={onRejectAll}
        >
          Reject all
        </Button>
      </div>
    </div>
  )
}
