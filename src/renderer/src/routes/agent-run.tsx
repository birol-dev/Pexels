import React, { useEffect, useRef } from 'react'
import { useAppStore } from '../lib/store'
import { Button } from '../components/ui/button'
import { Progress } from '../components/ui/progress'
import { Badge } from '../components/ui/badge'
import { ScrollArea } from '../components/ui/scroll-area'
import {
  Play,
  Pause,
  XCircle,
  RefreshCw,
  Terminal,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ArrowLeft,
  Eye
} from 'lucide-react'

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

  const formatCost = (input: number, output: number) => {
    const cost = (input * 0.0025 + output * 0.01) / 1000
    return cost.toFixed(4)
  }

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [activeJob?.logs])

  if (!activeJobId) {
    return (
      <div className="flex flex-col items-center justify-center h-[400px] text-center space-y-4">
        <AlertTriangle className="h-12 w-12 text-amber-500" />
        <div>
          <h2 className="text-xl font-bold">No Active Job</h2>
          <p className="text-sm text-muted-foreground">
            Select a run from history or create a new script project to get started.
          </p>
        </div>
        <Button onClick={() => navigate('input')}>Back to Dashboard</Button>
      </div>
    )
  }

  if (!activeJob) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const getBeatStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
      case 'searching':
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin shrink-0" />
      case 'selecting':
      case 'downloading':
        return <Loader2 className="h-5 w-5 text-indigo-500 animate-spin shrink-0" />
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500 shrink-0" />
      default:
        return <div className="h-5 w-5 border border-white/20 rounded-full shrink-0" />
    }
  }

  const getBeatBorderColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'border-l-emerald-500'
      case 'searching':
      case 'selecting':
      case 'downloading':
        return 'border-l-primary'
      case 'failed':
        return 'border-l-red-500'
      default:
        return 'border-l-white/10'
    }
  }

  const getLogColor = (type: string) => {
    switch (type) {
      case 'thought':
        return 'text-amber-300'
      case 'tool_call':
        return 'text-blue-400 font-semibold'
      case 'tool_result':
        return 'text-emerald-400'
      case 'error':
        return 'text-red-400 font-bold'
      default:
        return 'text-neutral-300'
    }
  }

  const handleInspectAssets = () => {
    navigate('stuff')
  }

  return (
    <div className="w-full space-y-6 pb-12">
      {/* Top Banner and Controls */}
      <div className="glass-panel rounded-xl p-6 space-y-4 relative overflow-hidden">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1">
            <button
              onClick={() => navigate('input')}
              className="flex items-center text-xs text-muted-foreground hover:text-white transition-colors mb-1"
            >
              <ArrowLeft className="h-3.5 w-3.5 mr-1" />
              Back to project setup
            </button>
            <h1 className="text-2xl font-bold tracking-tight">{activeJob.title}</h1>
            <p className="text-sm text-muted-foreground font-mono">{activeJob.currentStep}</p>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {activeJob.status === 'running' && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => pauseJob(activeJob.jobId)}
                className="bg-white/10 hover:bg-white/20 border border-white/5"
              >
                <Pause className="h-4 w-4 mr-1.5" />
                Pause Run
              </Button>
            )}
            {activeJob.status === 'paused' && (
              <Button
                size="sm"
                onClick={() => {
                  const hasPendingAssets = activeJob.beats.some((b) =>
                    b.assets.some((a) => a.status === 'pending')
                  )
                  if (hasPendingAssets) {
                    approveAndResumeJob(activeJob.jobId)
                  } else {
                    resumeJob(activeJob.jobId)
                  }
                }}
                className={
                  activeJob.beats.some((b) => b.assets.some((a) => a.status === 'pending'))
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-none animate-pulse'
                    : 'bg-primary hover:bg-primary/95 text-white'
                }
              >
                {activeJob.beats.some((b) => b.assets.some((a) => a.status === 'pending')) ? (
                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                ) : (
                  <Play className="h-4 w-4 mr-1.5 fill-current" />
                )}
                {activeJob.beats.some((b) => b.assets.some((a) => a.status === 'pending'))
                  ? 'Approve & Download'
                  : 'Resume Run'}
              </Button>
            )}
            {(activeJob.status === 'running' || activeJob.status === 'paused') && (
              <Button size="sm" variant="destructive" onClick={() => cancelJob(activeJob.jobId)}>
                <XCircle className="h-4 w-4 mr-1.5" />
                Cancel Run
              </Button>
            )}
            {(activeJob.status === 'completed' ||
              activeJob.status === 'failed' ||
              activeJob.status === 'cancelled') && (
              <Button
                size="sm"
                onClick={() => rerunJob(activeJob.jobId)}
                className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white"
              >
                <RefreshCw className="h-4 w-4 mr-1.5" />
                Rerun Agent
              </Button>
            )}

            {activeJob.status === 'completed' && (
              <Button
                size="sm"
                variant="secondary"
                onClick={handleInspectAssets}
                className="bg-emerald-600 hover:bg-emerald-500 text-white border-none"
              >
                <Eye className="h-4 w-4 mr-1.5" />
                Inspect Assets
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-xs font-mono text-muted-foreground">
            <span>Progress</span>
            <span>{activeJob.progress}%</span>
          </div>
          <Progress value={activeJob.progress} className="h-2 bg-neutral-900/60" />
        </div>

        {/* Stats strip */}
        <div className="flex flex-wrap gap-6 text-xs text-muted-foreground font-mono pt-2 border-t border-white/5">
          <div>
            Status: <span className="capitalize text-white font-medium">{activeJob.status}</span>
          </div>
          <div>
            Beats: <span className="text-white font-medium">{activeJob.beats.length}</span>
          </div>
          <div>
            Downloads:{' '}
            <span className="text-emerald-400 font-semibold">
              {activeJob.downloadedCount} complete
            </span>
          </div>
          {activeJob.failedCount > 0 && (
            <div>
              Failed:{' '}
              <span className="text-red-400 font-semibold">{activeJob.failedCount} failed</span>
            </div>
          )}
          {activeJob.usage && activeJob.usage.totalTokens > 0 && (
            <div>
              Tokens:{' '}
              <span className="text-white font-medium">
                {activeJob.usage.inputTokens} in / {activeJob.usage.outputTokens} out
              </span>
              <span className="text-muted-foreground ml-1.5">
                (${formatCost(activeJob.usage.inputTokens, activeJob.usage.outputTokens)} est.)
              </span>
            </div>
          )}
        </div>
      </div>

      {activeJob.status === 'failed' && (
        <div className="p-4 rounded-xl flex items-center justify-between bg-destructive/10 border border-destructive/20 text-destructive-foreground text-sm">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
            <div>
              <span className="font-semibold block text-white">Agent execution failed</span>
              <span className="text-xs text-muted-foreground mt-0.5 block leading-normal">
                {activeJob.logs.find((l) => l.type === 'error')?.message ||
                  'The agent execution failed due to an error. Check the logs console for technical details.'}
              </span>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => rerunJob(activeJob.jobId)}
            className="bg-red-600 hover:bg-red-500 text-white font-medium border-none shrink-0 ml-4"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Retry Runner
          </Button>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Visual Beats Panel */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center space-x-2 pb-2">
            <h2 className="text-xl font-bold tracking-tight">Script Beats</h2>
            <Badge
              variant="secondary"
              className="bg-white/5 border border-white/5 text-muted-foreground"
            >
              {activeJob.beats.length} scenes
            </Badge>
          </div>

          <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1">
            {activeJob.beats.length === 0 ? (
              <div className="glass-panel rounded-xl p-12 text-center text-muted-foreground text-sm">
                Parsing the script and generating visual beats. Please wait...
              </div>
            ) : (
              activeJob.beats.map((beat) => (
                <div
                  key={beat.id}
                  className={`glass-panel border-l-4 ${getBeatBorderColor(beat.status)} rounded-xl p-5 space-y-4 transition-all`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-center space-x-3">
                      {getBeatStatusIcon(beat.status)}
                      <h3 className="font-semibold text-sm capitalize">
                        {beat.id.replace('_', ' ')}
                      </h3>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm font-medium leading-relaxed select-all">
                      "{beat.text}"
                    </div>
                    <div className="text-xs text-muted-foreground bg-black/10 border border-white/5 rounded p-2.5 font-sans leading-relaxed select-all">
                      <span className="font-mono text-[10px] text-primary uppercase block mb-1">
                        Visual Direction:
                      </span>
                      {beat.visualPrompt}
                    </div>
                  </div>

                  {beat.searchQueries.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 items-center">
                      <span className="text-[10px] font-mono text-muted-foreground uppercase mr-1">
                        Searches:
                      </span>
                      {beat.searchQueries.map((query) => (
                        <Badge
                          key={query}
                          variant="outline"
                          className="bg-black/30 text-white border-white/10 text-[10px]"
                        >
                          {query}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {/* Asset Downloads inside Beat */}
                  {beat.assets && beat.assets.length > 0 && (
                    <div className="border-t border-white/5 pt-3 mt-3">
                      <div className="text-[10px] font-mono text-muted-foreground uppercase mb-2">
                        Beat Stock Assets:
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {beat.assets.map((asset) => (
                          <div
                            key={asset.id}
                            className="relative aspect-video rounded-lg overflow-hidden border border-white/5 bg-neutral-900 group"
                          >
                            {asset.type === 'video' ? (
                              <img
                                src={asset.imageUrl}
                                className="w-full h-full object-cover"
                                alt="Video Thumbnail"
                              />
                            ) : (
                              <img
                                src={asset.imageUrl}
                                className="w-full h-full object-cover"
                                alt="Stock Photo"
                              />
                            )}
                            <div className="absolute inset-0 bg-black/40 flex flex-col justify-end p-2 opacity-100 transition-opacity">
                              <span className="text-[9px] font-semibold text-white block capitalize">
                                {asset.type}
                              </span>
                              <div className="flex items-center justify-between mt-1 text-[8px] font-mono">
                                <span className="text-neutral-300 truncate max-w-[80px]">
                                  {asset.photographer}
                                </span>
                                {asset.status === 'completed' && (
                                  <span className="text-emerald-400">Complete</span>
                                )}
                                {asset.status === 'downloading' && (
                                  <span className="text-blue-400">
                                    Downloading ({asset.progress || 0}%)
                                  </span>
                                )}
                                {asset.status === 'failed' && (
                                  <span className="text-red-400">Failed</span>
                                )}
                                {asset.status === 'pending' && (
                                  <span className="text-neutral-400">Queued</span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Rejected Assets inside Beat */}
                  {beat.rejectedAssets && beat.rejectedAssets.length > 0 && (
                    <div className="border-t border-white/5 pt-3 mt-3">
                      <div className="text-[10px] font-mono text-muted-foreground uppercase mb-2">
                        Skipped / Rejected Assets:
                      </div>
                      <div className="space-y-1.5">
                        {beat.rejectedAssets.map((rej, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between text-xs bg-red-950/15 border border-red-500/10 rounded p-2 text-red-300"
                          >
                            <span className="font-mono text-[10px]">
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
        </div>

        {/* Live Logs Console */}
        <div className="space-y-4 flex flex-col h-[650px]">
          <div className="flex items-center space-x-2 pb-2 shrink-0">
            <Terminal className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-xl font-bold tracking-tight">Agent Console</h2>
          </div>

          <div className="glass-panel flex-1 rounded-xl p-4 overflow-hidden bg-black/40 flex flex-col font-mono text-xs">
            <ScrollArea className="flex-1 pr-2">
              <div className="space-y-4">
                {activeJob.logs.map((log, index) => (
                  <div key={index} className="space-y-1">
                    <div className="flex items-center space-x-2 text-[10px] text-muted-foreground border-b border-white/5 pb-1">
                      <span>[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                      <span className="uppercase text-primary font-bold">
                        {log.type.replace('_', ' ')}
                      </span>
                    </div>
                    <div className={`leading-relaxed whitespace-pre-wrap ${getLogColor(log.type)}`}>
                      {log.message}
                    </div>

                    {log.data && log.type === 'tool_call' && (
                      <div className="bg-black/35 rounded p-2 text-[10px] text-neutral-400 leading-normal overflow-x-auto">
                        Arguments: {log.data}
                      </div>
                    )}

                    {log.data && log.type === 'tool_result' && (
                      <div className="bg-black/35 rounded p-2 text-[10px] text-neutral-400 leading-normal max-h-48 overflow-y-auto">
                        Output: {JSON.stringify(log.data)}
                      </div>
                    )}
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>
    </div>
  )
}
