import React, { useEffect, useRef, useState } from 'react'
import { useAppStore, AgentLogEvent, AssetRecord } from '../lib/store'

export default function AgentRunView(): React.JSX.Element {
  const {
    activeJob,
    activeJobId,
    setActiveJobId,
    loadJobs,
    pauseJob,
    resumeJob,
    approveAndResumeJob,
    cancelJob,
    rerunJob,
    navigate,
    loadSettings,
    loading
  } = useAppStore()
  const logEndRef = useRef<HTMLDivElement>(null)
  const [approvalSelection, setApprovalSelection] = useState<Record<string, boolean>>({})

  useEffect(() => {
    Promise.resolve().then(() => {
      setApprovalSelection({})
    })
  }, [activeJobId])

  useEffect(() => {
    loadSettings()
    if (!activeJobId) {
      loadJobs().then(() => {
        const currentJobs = useAppStore.getState().jobs
        if (currentJobs.length > 0) {
          setActiveJobId(currentJobs[0].jobId)
        }
      })
    }
  }, [activeJobId, loadJobs, setActiveJobId, loadSettings])

  const renderLogData = (log: AgentLogEvent): React.JSX.Element | null => {
    if (!log.data) return null
    let displayStr = ''
    try {
      if (typeof log.data === 'string') {
        const parsed = JSON.parse(log.data)
        displayStr = JSON.stringify(parsed, null, 2)
      } else {
        displayStr = JSON.stringify(log.data, null, 2)
      }
    } catch {
      displayStr = String(log.data)
    }

    return (
      <pre className="bg-surface-container/60 border border-white/50 rounded p-2.5 text-[10px] text-on-surface-variant leading-normal overflow-x-auto whitespace-pre font-mono mt-1.5 max-h-60">
        {displayStr}
      </pre>
    )
  }

  // Scroll anchor kept for potential manual use, but auto-scroll removed
  // so the view doesn't jump every time a log entry arrives.

  if (!activeJobId) {
    return (
      <div className="flex flex-col items-center justify-center h-[400px] text-center space-y-4 animate-fade-in-up">
        <span className="material-symbols-outlined text-[48px] text-tertiary">warning</span>
        <div>
          <h2 className="text-xl font-bold">No Active Job</h2>
          <p className="text-sm text-on-surface-variant mt-1">
            Select a run from history or create a new script project to get started.
          </p>
        </div>
        <button
          onClick={() => navigate('input')}
          className="tactile-button px-6 py-2.5 rounded-lg text-xs font-semibold shadow-md cursor-pointer"
        >
          Back to Dashboard
        </button>
      </div>
    )
  }

  if (!activeJob) {
    return (
      <div className="flex h-[400px] items-center justify-center bg-transparent">
        <span className="material-symbols-outlined text-[48px] text-primary animate-spin">
          sync
        </span>
      </div>
    )
  }

  const getLogColor = (type: string): string => {
    switch (type) {
      case 'thought':
        return 'text-on-surface-variant italic'
      case 'tool_call':
        return 'text-primary font-bold'
      case 'tool_result':
        return 'text-secondary font-semibold'
      case 'error':
        return 'text-error font-bold'
      default:
        return 'text-on-surface'
    }
  }

  const handleInspectAssets = (): void => {
    navigate('stuff')
  }

  const pendingAssets = activeJob.beats.flatMap((b) =>
    (b.assets || []).filter((a: AssetRecord) => a.status === 'pending')
  )
  const hasPendingAssets = pendingAssets.length > 0
  const selectedApprovalIds = pendingAssets
    .filter((asset) => approvalSelection[asset.id] !== false)
    .map((asset) => asset.id)
  const rejectedApprovalIds = pendingAssets
    .filter((asset) => approvalSelection[asset.id] === false)
    .map((asset) => asset.id)

  const getBeatIconName = (status: string): string => {
    switch (status) {
      case 'completed':
        return 'check'
      case 'searching':
        return 'sync'
      case 'selecting':
      case 'downloading':
        return 'hourglass_empty'
      case 'failed':
        return 'close'
      default:
        return 'schedule'
    }
  }

  const getBeatIconBg = (status: string): string => {
    switch (status) {
      case 'completed':
        return 'bg-cyber-lime text-ink-black'
      case 'searching':
      case 'selecting':
      case 'downloading':
        return 'bg-primary-container text-on-primary-container'
      case 'failed':
        return 'bg-error text-white'
      default:
        return 'bg-surface-container-high text-outline'
    }
  }

  return (
    <div className="w-full space-y-6 pb-12 animate-fade-in-up relative risograph-overlay">
      {/* Top Section */}
      <header className="px-grid-margin py-8 flex items-end justify-between border-b-2 border-ink-black dark:border-surface-variant bg-surface dark:bg-surface-container-low neumorphic-outset relative z-10">
        <div className="flex flex-col gap-2">
          <button
            onClick={() => navigate('input')}
            className="flex items-center text-xs font-semibold text-outline dark:text-steel-secondary hover:text-primary transition-colors mb-1.5"
          >
            <span className="material-symbols-outlined text-[16px] mr-1">arrow_back</span>
            Back to project setup
          </button>
          <div className="flex items-center gap-4">
            <h2 className="font-display-xl text-display-xl text-ink-black dark:text-paper-white">
              {activeJob.title}
            </h2>
            <span className="px-3 py-1 bg-cyber-lime border-2 border-ink-black dark:border-primary-container font-label-sm text-label-sm text-on-lime tracking-widest uppercase inline-block brutal-shadow translate-y-[-2px]">
              {activeJob.status}
            </span>
          </div>
          <p className="font-body-md text-body-md text-outline dark:text-steel-secondary flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">schedule</span>
            Status: {activeJob.currentStep}
          </p>
        </div>

        <div className="flex gap-4 shrink-0">
          {activeJob.status === 'running' && (
            <button
              onClick={() => pauseJob(activeJob.jobId)}
              className="bg-paper-white dark:bg-surface-container-lowest text-ink-black dark:text-paper-white font-label-sm text-label-sm py-3 px-6 brutal-border hover:bg-surface-variant transition-colors flex items-center gap-2 neumorphic-inset active:scale-95 cursor-pointer"
            >
              <span className="material-symbols-outlined">pause</span> Pause Run
            </button>
          )}
          {activeJob.status === 'paused' && (
            <button
              onClick={() => {
                if (hasPendingAssets) {
                  approveAndResumeJob(activeJob.jobId, {
                    approvedAssetIds: selectedApprovalIds,
                    rejectedAssetIds: rejectedApprovalIds
                  })
                } else {
                  resumeJob(activeJob.jobId)
                }
              }}
              className="bg-cyber-lime text-on-lime font-label-sm text-label-sm py-3 px-6 brutal-border brutal-shadow brutal-shadow-hover transition-all flex items-center gap-2 cursor-pointer"
            >
              <span className="material-symbols-outlined">
                {hasPendingAssets ? 'verified' : 'play_arrow'}
              </span>
              {hasPendingAssets ? 'Approve Selected' : 'Resume Run'}
            </button>
          )}
          {(activeJob.status === 'running' || activeJob.status === 'paused') && (
            <button
              onClick={() => cancelJob(activeJob.jobId)}
              className="bg-error-container text-on-error-container font-label-sm text-label-sm py-3 px-6 brutal-border hover:bg-surface-variant transition-colors flex items-center gap-2 neumorphic-inset active:scale-95 cursor-pointer"
            >
              <span className="material-symbols-outlined">close</span> Cancel Run
            </button>
          )}
          {(activeJob.status === 'completed' ||
            activeJob.status === 'failed' ||
            activeJob.status === 'cancelled') && (
            <button
              onClick={() => rerunJob(activeJob.jobId)}
              disabled={loading}
              className="bg-cyber-lime text-on-lime font-label-sm text-label-sm py-3 px-6 brutal-border brutal-shadow brutal-shadow-hover transition-all flex items-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <span
                className="material-symbols-outlined"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                replay
              </span>
              Rerun Agent
            </button>
          )}
          {activeJob.status === 'completed' && (
            <button
              onClick={handleInspectAssets}
              className="bg-paper-white dark:bg-surface-container-lowest text-ink-black dark:text-paper-white btn-dark-surface-label font-label-sm text-label-sm py-3 px-6 brutal-border hover:bg-surface-variant transition-colors flex items-center gap-2 neumorphic-inset active:scale-95 cursor-pointer"
            >
              <span className="material-symbols-outlined">visibility</span>
              Inspect Assets
            </button>
          )}
        </div>
      </header>

      {/* Progress Section */}
      <section className="mb-gutter px-grid-margin mt-8">
        <div className="flex justify-between items-baseline mb-2">
          <h3 className="font-title-md text-title-md text-ink-black dark:text-paper-white">
            Pipeline Status
          </h3>
          <span className="font-label-sm text-label-sm text-ink-black dark:text-paper-white font-bold">
            {activeJob.progress}%
          </span>
        </div>
        {/* Neumorphic Track */}
        <div className="h-8 bg-surface-variant dark:bg-surface-container-lowest rounded-full brutal-border neumorphic-inset overflow-hidden relative">
          {/* Bold Fill */}
          <div
            className="h-full bg-cyber-lime border-r-2 border-ink-black relative overflow-hidden transition-all duration-500 ease-out"
            style={{ width: `${activeJob.progress}%` }}
          >
            {/* Stripes overlay for industrial feel */}
            <div
              className="absolute inset-0 opacity-20"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(45deg, transparent, transparent 10px, #18181B 10px, #18181B 20px)'
              }}
            ></div>
          </div>
        </div>
      </section>

      {activeJob.status === 'paused' && hasPendingAssets && (
        <div className="mx-grid-margin p-4 border-2 border-ink-black rounded-xl bg-tertiary-container text-on-tertiary-container shadow-[4px_4px_0px_var(--color-ink-black)]">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="font-bold text-ink-black">Review selected assets before download</div>
              <div className="mt-0.5 text-xs font-semibold opacity-90">
                {selectedApprovalIds.length} approved, {rejectedApprovalIds.length} rejected.
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setApprovalSelection({})}
                className="bg-paper-white border-2 border-ink-black text-ink-black py-2 px-4 font-label-sm text-xs rounded hover:bg-surface-variant transition-all duration-200 shadow-[2px_2px_0px_var(--color-ink-black)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]"
              >
                Approve All
              </button>
              <button
                type="button"
                onClick={() =>
                  setApprovalSelection(
                    Object.fromEntries(pendingAssets.map((asset) => [asset.id, false]))
                  )
                }
                className="bg-paper-white border-2 border-ink-black text-ink-black py-2 px-4 font-label-sm text-xs rounded hover:bg-surface-variant transition-all duration-200 shadow-[2px_2px_0px_var(--color-ink-black)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]"
              >
                Reject All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Split Area (Bento Grid Logic) */}
      <div className="grid grid-cols-12 gap-gutter px-grid-margin mt-8 items-start">
        {/* Left: Script Beats (2/3) */}
        <div className="col-span-12 xl:col-span-8 flex flex-col gap-6">
          {/* Idea & Visual Concept Card (if generated from Idea Mode) */}
          {(activeJob.idea || activeJob.visualConcept) && (
            <div className="p-4 bg-surface border-2 border-ink-black dark:border-surface-variant rounded-xl shadow-[3px_3px_0px_var(--color-ink-black)] flex flex-col gap-2.5 animate-fade-in-up">
              <div className="flex items-center justify-between">
                <span className="font-title-md text-xs uppercase tracking-wider text-ink-black dark:text-paper-white font-bold flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-cyber-lime bg-ink-black p-0.5 rounded text-[16px]">
                    lightbulb
                  </span>
                  Concept & Visual Strategy
                </span>
                {activeJob.inputMode === 'idea' && (
                  <span className="font-mono text-[10px] bg-cyber-lime text-ink-black font-bold px-2 py-0.5 rounded border border-ink-black">
                    AI EXPANDED
                  </span>
                )}
              </div>
              {activeJob.idea && (
                <div className="text-xs text-outline dark:text-steel-secondary">
                  <strong className="text-ink-black dark:text-paper-white">Origin Idea:</strong> &ldquo;{activeJob.idea}&rdquo;
                </div>
              )}
              {activeJob.visualConcept && (
                <div className="text-xs text-ink-black dark:text-paper-white bg-surface-container-low dark:bg-surface-container-lowest p-2.5 rounded border border-ink-black/20 dark:border-white/10 font-medium">
                  <span className="font-mono text-[10px] text-primary dark:text-cyber-lime font-bold block mb-0.5">
                    Visual Strategy:
                  </span>
                  {activeJob.visualConcept}
                </div>
              )}
            </div>
          )}

          <h3 className="font-title-md text-title-md text-ink-black dark:text-paper-white border-b-2 border-ink-black dark:border-surface-variant pb-2 inline-block self-start">
            Script Beats
          </h3>

          {activeJob.beats.length === 0 ? (
            <div className="bg-surface border-2 border-ink-black rounded-xl p-12 text-center text-xs text-on-surface-variant font-medium shadow-[4px_4px_0px_var(--color-ink-black)]">
              Parsing the script and generating visual scenes. Please wait...
            </div>
          ) : (
            activeJob.beats.map((beat) => (
              <div
                key={beat.id}
                className="bg-surface border-2 border-ink-black dark:border-surface-variant rounded-xl p-6 relative shadow-[4px_4px_0px_var(--color-ink-black)] dark:shadow-[4px_4px_0px_var(--color-cyber-lime)] neumorphic-outset"
              >
                {/* Status Indicator Badge */}
                <div
                  className={`absolute -left-4 -top-4 w-10 h-10 rounded-full brutal-border flex items-center justify-center z-10 shadow-md ${getBeatIconBg(beat.status)}`}
                >
                  <span className="material-symbols-outlined font-bold text-[20px]">
                    {getBeatIconName(beat.status)}
                  </span>
                </div>

                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <span className="font-label-sm text-label-sm text-outline dark:text-steel-secondary tracking-widest uppercase">
                      {beat.id.replace('_', ' ')}
                    </span>
                    <span className="font-label-sm text-xs px-2.5 py-1 bg-surface-variant dark:bg-surface-container-lowest border-2 border-ink-black dark:border-surface-variant text-ink-black dark:text-paper-white uppercase tracking-wider font-bold rounded">
                      {beat.status}
                    </span>
                  </div>

                  <p className="font-body-lg text-body-lg text-ink-black dark:text-paper-white leading-relaxed pl-4 border-l-4 border-ink-black dark:border-primary-container">
                    &ldquo;{beat.text}&rdquo;
                  </p>

                  {/* Directions & Tags */}
                  <div className="p-4 bg-surface-container-low dark:bg-surface-container-lowest rounded border-2 border-ink-black dark:border-surface-variant shadow-inner">
                    <span className="font-mono text-[9px] text-primary dark:text-cyber-lime uppercase font-bold block mb-1.5">
                      Visual Direction:
                    </span>
                    <p className="text-[11px] text-outline dark:text-steel-secondary leading-relaxed select-all">
                      &ldquo;{beat.visualPrompt}&rdquo;
                    </p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {beat.searchQueries.map((query) => (
                        <span
                          key={query}
                          className="font-label-sm text-[12px] px-3 py-1 bg-paper-white dark:bg-surface-container-lowest border-2 border-ink-black dark:border-surface-variant text-ink-black dark:text-paper-white uppercase tracking-wider rounded"
                        >
                          {query}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Generated Assets Row */}
                  {beat.assets && beat.assets.length > 0 && (
                    <div className="mt-4 pt-4 border-t-2 border-ink-black dark:border-surface-variant border-dashed flex gap-4 overflow-x-auto pb-2 scrollbar">
                      {beat.assets.map((asset) => (
                        <div
                          key={asset.id}
                          className="relative w-48 aspect-video shrink-0 bg-ink-black brutal-border overflow-hidden group cursor-pointer"
                        >
                          <img
                            src={asset.imageUrl}
                            className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                            alt="Stock Thumbnail"
                          />

                          {/* Queued State overlay */}
                          {asset.status === 'pending' && (
                            <div className="absolute inset-0 bg-paper-white/80 dark:bg-surface-container-lowest/80 backdrop-blur-[1px] flex flex-col items-center justify-center p-2">
                              <span className="material-symbols-outlined text-primary text-[18px] animate-spin mb-1">
                                sync
                              </span>
                              <span className="text-[9px] text-primary font-mono font-bold">
                                Queued
                              </span>
                            </div>
                          )}

                          {/* Downloading State overlay */}
                          {asset.status === 'downloading' && (
                            <div className="absolute inset-0 bg-paper-white/90 dark:bg-surface-container-lowest/90 flex flex-col items-center justify-center p-2">
                              <span className="text-[9px] text-primary font-extrabold font-mono mb-1">
                                {asset.progress || 0}%
                              </span>
                              <div className="w-full bg-surface-container-high rounded-full h-1 overflow-hidden max-w-[50px]">
                                <div
                                  className="bg-primary h-full transition-all duration-300"
                                  style={{ width: `${asset.progress || 0}%` }}
                                />
                              </div>
                            </div>
                          )}

                          {/* Labels overlay */}
                          <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/80 via-black/40 to-transparent p-1.5 flex flex-col justify-end text-[9px]">
                            <span className="text-white font-bold capitalize leading-none mb-0.5">
                              {asset.type}
                            </span>
                            <div className="flex justify-between items-center text-neutral-300 font-mono text-[8px] leading-none mt-0.5">
                              <span className="truncate max-w-[60px]">By {asset.photographer}</span>
                              {asset.status === 'completed' && (
                                <span className="text-cyber-lime font-bold">Ready</span>
                              )}
                              {asset.status === 'failed' && (
                                <span className="text-error font-bold">Failed</span>
                              )}
                            </div>
                          </div>

                          {activeJob.status === 'paused' && asset.status === 'pending' && (
                            <div className="absolute inset-x-1 top-1.5 flex gap-1.5 z-20">
                              <button
                                type="button"
                                onClick={() =>
                                  setApprovalSelection((current) => ({
                                    ...current,
                                    [asset.id]: true
                                  }))
                                }
                                className={`flex-1 rounded border-2 border-ink-black py-1 font-label-sm text-[8px] font-bold shadow-[1px_1px_0px_var(--color-ink-black)] cursor-pointer ${
                                  approvalSelection[asset.id] === false
                                    ? 'bg-paper-white text-outline'
                                    : 'bg-cyber-lime text-ink-black'
                                }`}
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setApprovalSelection((current) => ({
                                    ...current,
                                    [asset.id]: false
                                  }))
                                }
                                className={`flex-1 rounded border-2 border-ink-black py-1 font-label-sm text-[8px] font-bold shadow-[1px_1px_0px_var(--color-ink-black)] cursor-pointer ${
                                  approvalSelection[asset.id] === false
                                    ? 'bg-error text-white'
                                    : 'bg-paper-white text-outline'
                                }`}
                              >
                                Reject
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Rejected Assets Info */}
                  {beat.rejectedAssets && beat.rejectedAssets.length > 0 && (
                    <div className="border-t-2 border-ink-black dark:border-surface-variant border-dashed pt-3.5 mt-3">
                      <div className="text-[10px] font-title-md text-outline dark:text-steel-secondary uppercase tracking-wider mb-2 font-bold">
                        Skipped / Filtered Out:
                      </div>
                      <div className="space-y-1.5">
                        {beat.rejectedAssets.map((rej, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between text-xs bg-error-container border-2 border-ink-black text-on-error-container font-semibold rounded p-2 shadow-[2px_2px_0px_var(--color-ink-black)]"
                          >
                            <span className="font-mono text-[10px]">
                              {rej.type.toUpperCase()} #{rej.pexelsId}
                            </span>
                            <span className="opacity-95 italic">Reason: {rej.reason}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Right Column: Agent Console */}
        <div className="col-span-12 xl:col-span-4 flex flex-col">
          <div className="bg-surface border-2 border-ink-black dark:border-surface-variant rounded flex flex-col overflow-hidden max-h-[750px] shadow-[4px_4px_0px_#18181B] dark:shadow-[4px_4px_0px_var(--color-cyber-lime)] neumorphic-outset">
            <div className="px-5 py-4 border-b-2 border-ink-black dark:border-surface-variant bg-paper-white dark:bg-surface-container-lowest flex justify-between items-center">
              <h3 className="font-title-md text-title-md text-ink-black dark:text-paper-white flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px] text-primary">terminal</span>
                Agent Console
              </h3>
              <span className="font-mono text-[10px] text-outline dark:text-steel-secondary flex items-center gap-1.5 font-bold">
                <span className="relative flex h-2 w-2">
                  <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-cyber-lime opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-cyber-lime"></span>
                </span>
                Live Feed
              </span>
            </div>

            <div className="grow p-5 overflow-y-auto log-scroll bg-surface-container-low dark:bg-surface-container-lowest font-mono text-xs flex flex-col gap-4">
              {activeJob.logs.map((log, index) => (
                <div key={index} className="space-y-1">
                  <div className="flex items-center space-x-2 text-[10px] text-outline border-b border-black/5 dark:border-white/5 pb-1 font-semibold">
                    <span>[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                    <span className="uppercase text-primary dark:text-cyber-lime font-bold">
                      {log.type.replace('_', ' ')}
                    </span>
                  </div>
                  <div
                    className={`leading-relaxed whitespace-pre-wrap text-[11px] ${getLogColor(log.type)}`}
                  >
                    {log.message}
                  </div>

                  {renderLogData(log)}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
