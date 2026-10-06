import React from 'react'
import { useAppStore } from '@renderer/lib/store'
import { AgentConsole } from '@renderer/features/agent-run/components/agent-console'
import { ApprovalBanner } from '@renderer/features/agent-run/components/approval-banner'
import { BeatsList } from '@renderer/features/agent-run/components/beats-list'
import { JobLoading } from '@renderer/features/agent-run/components/job-loading'
import { NoActiveJob } from '@renderer/features/agent-run/components/no-active-job'
import { PipelineProgress } from '@renderer/features/agent-run/components/pipeline-progress'
import { RunActions } from '@renderer/features/agent-run/components/run-actions'
import { RunHeader } from '@renderer/features/agent-run/components/run-header'
import { useAgentRunBootstrap } from '@renderer/features/agent-run/hooks/use-agent-run-bootstrap'
import { useAssetApproval } from '@renderer/features/agent-run/hooks/use-asset-approval'
import { getPendingAssets, splitApprovalIds } from '@renderer/features/agent-run/utils'

export default function AgentRunView(): React.JSX.Element {
  const {
    activeJob,
    activeJobId,
    pauseJob,
    resumeJob,
    approveAndResumeJob,
    cancelJob,
    rerunJob,
    navigate,
    loading
  } = useAppStore()
  const approval = useAssetApproval(activeJobId)
  useAgentRunBootstrap()

  if (!activeJobId) return <NoActiveJob onBack={() => navigate('input')} />
  if (!activeJob) return <JobLoading />

  const pendingAssets = getPendingAssets(activeJob)
  const hasPendingAssets = pendingAssets.length > 0
  const { approvedIds, rejectedIds } = splitApprovalIds(pendingAssets, approval.selection)

  const handleResumeOrApprove = (): void => {
    if (hasPendingAssets) {
      approveAndResumeJob(activeJob.jobId, {
        approvedAssetIds: approvedIds,
        rejectedAssetIds: rejectedIds
      })
    } else {
      resumeJob(activeJob.jobId)
    }
  }

  return (
    <div className="w-full space-y-6 pb-12 animate-fade-in-up relative risograph-overlay">
      <RunHeader
        job={activeJob}
        onBack={() => navigate('input')}
        actions={
          <RunActions
            job={activeJob}
            hasPendingAssets={hasPendingAssets}
            loading={loading}
            onPause={() => pauseJob(activeJob.jobId)}
            onResumeOrApprove={handleResumeOrApprove}
            onCancel={() => cancelJob(activeJob.jobId)}
            onRerun={() => rerunJob(activeJob.jobId)}
            onInspect={() => navigate('stuff')}
          />
        }
      />

      <PipelineProgress progress={activeJob.progress} />

      {activeJob.status === 'paused' && hasPendingAssets && (
        <ApprovalBanner
          approvedCount={approvedIds.length}
          rejectedCount={rejectedIds.length}
          onApproveAll={approval.approveAll}
          onRejectAll={() => approval.rejectAll(pendingAssets.map((a) => a.id))}
        />
      )}

      <div className="grid grid-cols-12 gap-gutter px-grid-margin mt-8 items-start">
        <BeatsList
          job={activeJob}
          selection={approval.selection}
          onApprove={approval.approve}
          onReject={approval.reject}
        />
        <AgentConsole logs={activeJob.logs} />
      </div>
    </div>
  )
}
