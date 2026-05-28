import React, { useEffect, useRef } from 'react'
import { useAppStore, AgentLogEvent, AssetRecord } from '../lib/store'

export default function AgentRunView(): React.JSX.Element {
  const {
    activeJob,
    activeJobId,
    pauseJob,
    resumeJob,
    approveAndResumeJob,
    cancelJob,
    rerunJob,
    navigate
  } = useAppStore()
  const logEndRef = useRef<HTMLDivElement>(null)

  const formatCost = (input: number, output: number): string => {
    const cost = (input * 0.0025 + output * 0.01) / 1000
    return cost.toFixed(4)
  }

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
      <pre className="bg-[#ecedf9]/60 border border-white/50 rounded p-2.5 text-[10px] text-on-surface-variant leading-normal overflow-x-auto whitespace-pre font-mono mt-1.5 max-h-60">
        {displayStr}
      </pre>
    )
  }

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [activeJob?.logs])

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

  const getBeatStatusIcon = (status: string): React.JSX.Element => {
    switch (status) {
      case 'completed':
        return (
          <span
            className="material-symbols-outlined text-secondary text-[20px]"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            check_circle
          </span>
        )
      case 'searching':
        return (
          <span className="material-symbols-outlined text-primary text-[20px] animate-spin">
            sync
          </span>
        )
      case 'selecting':
      case 'downloading':
        return (
          <span className="material-symbols-outlined text-primary text-[20px] animate-spin">
            hourglass_empty
          </span>
        )
      case 'failed':
        return (
          <span
            className="material-symbols-outlined text-error text-[20px]"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            cancel
          </span>
        )
      default:
        return <span className="material-symbols-outlined text-outline text-[20px]">schedule</span>
    }
  }

  const getBeatBorderColor = (status: string): string => {
    switch (status) {
      case 'completed':
        return 'border-l-secondary'
      case 'searching':
      case 'selecting':
      case 'downloading':
        return 'border-l-primary'
      case 'failed':
        return 'border-l-error'
      default:
        return 'border-l-outline-variant/60'
    }
  }

  const getBeatTextColor = (status: string): string => {
    switch (status) {
      case 'completed':
        return 'text-secondary font-bold'
      case 'searching':
      case 'selecting':
      case 'downloading':
        return 'text-primary font-bold animate-pulse'
      case 'failed':
        return 'text-error font-bold'
      default:
        return 'text-outline font-semibold'
    }
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

  const hasPendingAssets = activeJob.beats.some((b) =>
    b.assets.some((a: AssetRecord) => a.status === 'pending')
  )

  return (
    <div className="w-full space-y-6 pb-12 animate-fade-in-up">
      {/* Top Banner Control Panel */}
      <header className="glass-panel-elevated rounded-2xl p-6 flex flex-col gap-5 transition-all duration-300 hover:shadow-lg">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1">
            <button
              onClick={() => navigate('input')}
              className="flex items-center text-xs font-semibold text-on-surface-variant hover:text-primary transition-colors mb-1.5"
            >
              <span className="material-symbols-outlined text-[16px] mr-1">arrow_back</span>
              Back to project setup
            </button>
            <div className="flex items-center space-x-3">
              <h1 className="text-2xl font-bold tracking-tight text-on-surface">
                {activeJob.title}
              </h1>
              <span className="px-2.5 py-1 bg-surface-container-low border border-primary/20 text-primary rounded-full text-[10px] uppercase font-bold tracking-wider flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span
                    className={`motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75 ${activeJob.status === 'running' ? '' : 'hidden'}`}
                  ></span>
                  <span
                    className={`relative inline-flex rounded-full h-2 w-2 bg-primary ${activeJob.status === 'running' ? '' : 'opacity-60'}`}
                  ></span>
                </span>
                {activeJob.status}
              </span>
            </div>
            <div className="flex items-center space-x-1.5 text-xs text-outline font-semibold font-mono mt-0.5">
              <span>Status: {activeJob.currentStep}</span>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {activeJob.status === 'running' && (
              <button
                onClick={() => pauseJob(activeJob.jobId)}
                className="btn-interactive px-4 py-2.5 bg-white/60 border border-white/80 text-on-surface rounded-lg font-semibold text-xs flex items-center gap-1.5 shadow-sm"
              >
                <span className="material-symbols-outlined text-[18px]">pause</span> Pause Run
              </button>
            )}
            {activeJob.status === 'paused' && (
              <button
                onClick={() => {
                  if (hasPendingAssets) {
                    approveAndResumeJob(activeJob.jobId)
                  } else {
                    resumeJob(activeJob.jobId)
                  }
                }}
                className={`btn-interactive px-5 py-2.5 text-white rounded-lg font-semibold text-xs flex items-center gap-1.5 shadow-md cursor-pointer ${
                  hasPendingAssets
                    ? 'bg-secondary hover:bg-secondary/95 animate-pulse'
                    : 'bg-primary hover:bg-primary/95'
                }`}
              >
                {hasPendingAssets ? (
                  <>
                    <span className="material-symbols-outlined text-[18px]">verified</span>
                    Approve &amp; Download
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">play_arrow</span>
                    Resume Run
                  </>
                )}
              </button>
            )}
            {(activeJob.status === 'running' || activeJob.status === 'paused') && (
              <button
                onClick={() => cancelJob(activeJob.jobId)}
                className="btn-interactive px-4 py-2.5 bg-error-container border border-error/20 text-[#93000a] rounded-lg font-semibold text-xs flex items-center gap-1.5 shadow-sm"
              >
                <span className="material-symbols-outlined text-[18px]">close</span> Cancel Run
              </button>
            )}
            {(activeJob.status === 'completed' ||
              activeJob.status === 'failed' ||
              activeJob.status === 'cancelled') && (
              <button
                onClick={() => rerunJob(activeJob.jobId)}
                className="tactile-button px-5 py-2.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-md"
              >
                <span className="material-symbols-outlined text-[18px]">replay</span>
                Rerun Agent
              </button>
            )}

            {activeJob.status === 'completed' && (
              <button
                onClick={handleInspectAssets}
                className="btn-interactive px-5 py-2.5 bg-secondary-container text-on-secondary-container hover:bg-secondary/20 rounded-lg font-semibold text-xs flex items-center gap-1.5 shadow-sm"
              >
                <span className="material-symbols-outlined text-[18px]">perm_media</span>
                Inspect Assets
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-6 pt-2 border-t border-black/[0.04]">
          {/* Progress Bar */}
          <div className="flex-grow">
            <div className="flex justify-between items-end mb-2">
              <span className="font-mono text-[10px] text-outline uppercase tracking-wider pl-0.5">
                Overall Progress
              </span>
              <span className="font-mono text-xs text-primary font-extrabold">
                {activeJob.progress}%
              </span>
            </div>
            <div className="h-3 w-full bg-surface-container-high rounded-full overflow-hidden border border-white/50 shadow-inner">
              <div
                className="h-full bg-primary relative rounded-full transition-all duration-500 ease-out"
                style={{ width: `${activeJob.progress}%` }}
              >
                <div className="absolute inset-0 animate-shimmer"></div>
              </div>
            </div>
          </div>

          {/* Metrics */}
          <div className="flex gap-6 pl-0 sm:pl-6 border-l border-transparent sm:border-black/[0.06] shrink-0 font-mono text-xs">
            <div className="flex flex-col">
              <span className="text-[10px] text-outline uppercase tracking-wider">Beats</span>
              <span className="font-bold text-on-surface mt-0.5">
                {activeJob.beats.length} scenes
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-outline uppercase tracking-wider">Downloads</span>
              <span className="font-bold text-secondary mt-0.5">
                {activeJob.downloadedCount} active
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-outline uppercase tracking-wider">
                Estimated Cost
              </span>
              <span className="font-bold text-on-surface mt-0.5">
                {activeJob.usage && activeJob.usage.totalTokens > 0
                  ? `$${formatCost(activeJob.usage.inputTokens, activeJob.usage.outputTokens)}`
                  : '$0.00'}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Split Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* Left Column: Script Beats */}
        <div className="flex flex-col gap-4 overflow-y-auto max-h-[650px] pr-2 pb-6 scrollbar">
          <div className="flex items-center space-x-2 shrink-0">
            <h2 className="text-xl font-bold tracking-tight text-on-surface">Script Beats</h2>
          </div>

          {activeJob.beats.length === 0 ? (
            <div className="glass-panel rounded-2xl p-12 text-center text-xs text-on-surface-variant font-medium">
              Parsing the script and generating visual scenes. Please wait...
            </div>
          ) : (
            activeJob.beats.map((beat) => (
              <div
                key={beat.id}
                className={`glass-panel border-l-4 ${getBeatBorderColor(beat.status)} rounded-xl p-5 space-y-4 hover:shadow-md transition-all duration-200`}
              >
                <div className="flex justify-between items-center">
                  <span
                    className={`font-mono text-[10px] uppercase flex items-center gap-1.5 ${getBeatTextColor(beat.status)}`}
                  >
                    {getBeatStatusIcon(beat.status)}
                    {beat.id.replace('_', ' ')}
                  </span>
                  <span className="font-mono text-[10px] text-outline uppercase">
                    {beat.status}
                  </span>
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-semibold leading-relaxed text-on-surface">
                    &ldquo;{beat.text}&rdquo;
                  </p>
                  <div className="p-3 bg-surface-container-low rounded-lg border border-white/50 shadow-inner">
                    <span className="font-mono text-[9px] text-primary uppercase font-bold block mb-1.5">
                      Visual Direction:
                    </span>
                    <p className="text-[11px] text-on-surface-variant leading-relaxed select-all">
                      &ldquo;{beat.visualPrompt}&rdquo;
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {beat.searchQueries.map((query) => (
                        <span
                          key={query}
                          className="px-2 py-0.5 bg-white rounded-md border border-white/60 font-mono text-[10px] text-on-surface-variant"
                        >
                          {query}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Asset Grid Inside Card */}
                {beat.assets && beat.assets.length > 0 && (
                  <div className="border-t border-black/[0.04] pt-3.5 mt-3">
                    <div className="text-[10px] font-mono text-outline uppercase tracking-wider mb-2 font-semibold">
                      Beat Stock Assets:
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {beat.assets.map((asset) => (
                        <div
                          key={asset.id}
                          className="relative aspect-video rounded-lg overflow-hidden border border-white/60 bg-surface-container shadow-inner group"
                        >
                          <img
                            src={asset.imageUrl}
                            className="w-full h-full object-cover"
                            alt="Stock Thumbnail"
                          />

                          {/* Queued State overlay */}
                          {asset.status === 'pending' && (
                            <div className="absolute inset-0 bg-white/70 backdrop-blur-[1px] flex flex-col items-center justify-center p-2">
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
                            <div className="absolute inset-0 bg-white/85 flex flex-col items-center justify-center p-2">
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

                          {/* Overlay on hover or always for labels */}
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-1.5 flex flex-col justify-end text-[9px]">
                            <span className="text-white font-bold capitalize leading-none mb-0.5">
                              {asset.type}
                            </span>
                            <div className="flex justify-between items-center text-neutral-300 font-mono text-[8px] leading-none mt-0.5">
                              <span className="truncate max-w-[60px]">By {asset.photographer}</span>
                              {asset.status === 'completed' && (
                                <span className="text-secondary font-bold">Ready</span>
                              )}
                              {asset.status === 'failed' && (
                                <span className="text-error font-bold">Failed</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Rejected Assets Info */}
                {beat.rejectedAssets && beat.rejectedAssets.length > 0 && (
                  <div className="border-t border-black/[0.04] pt-3 mt-3">
                    <div className="text-[10px] font-mono text-outline uppercase tracking-wider mb-2 font-semibold">
                      Skipped / Filtered Out:
                    </div>
                    <div className="space-y-1">
                      {beat.rejectedAssets.map((rej, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between text-[11px] bg-error-container/20 border border-error/15 rounded p-2 text-[#93000a] font-medium"
                        >
                          <span className="font-mono text-[9px]">
                            {rej.type.toUpperCase()} #{rej.pexelsId}
                          </span>
                          <span className="opacity-90 italic">Reason: {rej.reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Right Column: Agent Console */}
        <div className="glass-panel rounded-2xl flex flex-col overflow-hidden max-h-[694px] hover:shadow-lg transition-all duration-300">
          <div className="px-5 py-3.5 border-b border-black/[0.05] bg-white/20 backdrop-blur-sm flex justify-between items-center">
            <h3 className="font-semibold text-sm text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-primary">terminal</span>
              Agent Console
            </h3>
            <span className="font-mono text-[10px] text-outline flex items-center gap-1.5 font-semibold">
              <span className="relative flex h-2 w-2">
                <span
                  className={`motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75 ${activeJob.status === 'running' ? '' : 'hidden'}`}
                ></span>
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 bg-secondary ${activeJob.status === 'running' ? '' : 'opacity-60'}`}
                ></span>
              </span>
              Live Feed
            </span>
          </div>

          <div className="flex-grow p-5 overflow-y-auto log-scroll bg-white/35 font-mono text-xs flex flex-col gap-4">
            {activeJob.logs.map((log, index) => (
              <div key={index} className="space-y-1">
                <div className="flex items-center space-x-2 text-[10px] text-outline border-b border-black/[0.03] pb-1 font-semibold">
                  <span>[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                  <span className="uppercase text-primary font-bold">
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
  )
}
