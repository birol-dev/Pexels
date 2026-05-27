import React, { useEffect, useState } from 'react'
import { useAppStore } from '../lib/store'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../components/ui/select'
import { Card } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import {
  Film,
  Image as ImageIcon,
  Video,
  Sparkles,
  History,
  Play,
  RotateCcw,
  AlertTriangle
} from 'lucide-react'

export default function ScriptInputView(): React.JSX.Element {
  const { startJob, jobs, loadJobs, setActiveJobId, navigate, rerunJob, settings, loadSettings } =
    useAppStore()

  // Form State
  const [title, setTitle] = useState('')
  const [script, setScript] = useState('')
  const [platform, setPlatform] = useState<'YouTube' | 'Shorts' | 'TikTok' | 'Instagram Reels'>(
    'YouTube'
  )
  const [style, setStyle] = useState<
    'cinematic' | 'documentary' | 'business' | 'tech' | 'nature' | 'lifestyle' | 'abstract'
  >('cinematic')
  const [mix, setMix] = useState<'videos only' | 'photos only' | 'videos + photos'>(
    'videos + photos'
  )
  const [maxAssetsPerBeat, setMaxAssetsPerBeat] = useState(3)
  const [maxTotalDownloads, setMaxTotalDownloads] = useState(15)

  useEffect(() => {
    loadJobs()
    loadSettings()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !script.trim()) {
      alert('Please fill out both the title and the script.')
      return
    }

    if (!settings?.pexelsKey) {
      alert('Warning: Pexels API Key is missing. Please set it in Settings first.')
      navigate('settings')
      return
    }

    await startJob({
      title: title.trim(),
      script: script.trim(),
      platform,
      style,
      mix,
      maxAssetsPerBeat,
      maxTotalDownloads
    })
  }

  const handleSelectJob = (jobId: string) => {
    setActiveJobId(jobId)
    navigate('run')
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return (
          <Badge className="bg-blue-600/20 text-blue-400 border border-blue-500/20 animate-pulse">
            Running
          </Badge>
        )
      case 'paused':
        return (
          <Badge className="bg-yellow-600/20 text-yellow-400 border border-yellow-500/20">
            Paused
          </Badge>
        )
      case 'completed':
        return (
          <Badge className="bg-emerald-600/20 text-emerald-400 border border-emerald-500/20">
            Completed
          </Badge>
        )
      case 'failed':
        return <Badge className="bg-red-600/20 text-red-400 border border-red-500/20">Failed</Badge>
      default:
        return (
          <Badge className="bg-neutral-600/20 text-neutral-400 border border-neutral-500/20">
            Cancelled
          </Badge>
        )
    }
  }

  return (
    <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-3 gap-6 pb-12">
      {/* Left Column: Script Setup Form */}
      <div className="lg:col-span-2 space-y-6">
        <div className="flex items-center space-x-3 border-b border-white/5 pb-4">
          <Sparkles className="h-8 w-8 text-primary animate-pulse" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Create Asset Pack</h1>
            <p className="text-sm text-muted-foreground">
              Paste your script, customize matching criteria, and let the AI find visual stock
              b-roll.
            </p>
          </div>
        </div>

        {!settings?.pexelsKey && (
          <div className="p-4 rounded-xl flex items-center space-x-3 bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
            <div className="flex-1">
              You need to configure your <strong>Pexels API Key</strong> in the Settings panel
              before generating b-roll asset packages.
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => navigate('settings')}
              className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-none shrink-0"
            >
              Configure Now
            </Button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="glass-panel rounded-xl p-6 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="project-title">Project Title</Label>
            <Input
              id="project-title"
              placeholder="e.g. History of Space Travel, AI Office Hacks"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-black/20 border-white/10"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="video-script">Video Script</Label>
            <Textarea
              id="video-script"
              placeholder="Paste your video narrative script here..."
              rows={12}
              value={script}
              onChange={(e) => setScript(e.target.value)}
              className="bg-black/20 border-white/10 leading-relaxed font-sans"
              required
            />
          </div>

          {/* Quick Config Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="platform">Platform Layout</Label>
              <Select value={platform} onValueChange={(val: any) => setPlatform(val)}>
                <SelectTrigger className="bg-black/20 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-neutral-900 border-white/10 text-white">
                  <SelectItem value="YouTube">YouTube (16:9)</SelectItem>
                  <SelectItem value="Shorts">YouTube Shorts (9:16)</SelectItem>
                  <SelectItem value="TikTok">TikTok (9:16)</SelectItem>
                  <SelectItem value="Instagram Reels">Instagram Reels (9:16)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="style">Visual Mood / Style</Label>
              <Select value={style} onValueChange={(val: any) => setStyle(val)}>
                <SelectTrigger className="bg-black/20 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-neutral-900 border-white/10 text-white">
                  <SelectItem value="cinematic">Cinematic</SelectItem>
                  <SelectItem value="documentary">Documentary</SelectItem>
                  <SelectItem value="business">Business / Office</SelectItem>
                  <SelectItem value="tech">Technology / Futuristic</SelectItem>
                  <SelectItem value="nature">Nature / Slow-mo</SelectItem>
                  <SelectItem value="lifestyle">Lifestyle / Real life</SelectItem>
                  <SelectItem value="abstract">Abstract / Artistic</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Asset Mix Controls */}
          <div className="space-y-2">
            <Label>Asset Mix Type</Label>
            <div className="grid grid-cols-3 gap-2">
              {(['videos only', 'photos only', 'videos + photos'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setMix(option)}
                  className={`flex flex-col items-center justify-center p-3 rounded-lg border text-sm font-medium transition-all ${mix === option ? 'bg-primary/20 border-primary text-white shadow-lg shadow-primary/10' : 'bg-black/20 border-white/5 text-muted-foreground hover:bg-white/5 hover:text-white'}`}
                >
                  {option === 'videos only' && <Video className="h-5 w-5 mb-1.5" />}
                  {option === 'photos only' && <ImageIcon className="h-5 w-5 mb-1.5" />}
                  {option === 'videos + photos' && <Film className="h-5 w-5 mb-1.5" />}
                  <span className="capitalize">{option}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Concurrency and limits config */}
          <div className="grid grid-cols-2 gap-4 border-t border-white/5 pt-4">
            <div className="space-y-2">
              <Label htmlFor="max-per-beat">Max Assets Per Beat</Label>
              <Input
                id="max-per-beat"
                type="number"
                min={1}
                max={5}
                value={maxAssetsPerBeat}
                onChange={(e) => setMaxAssetsPerBeat(Number(e.target.value))}
                className="bg-black/20 border-white/10 text-center font-semibold"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="max-total">Max Total Downloads</Label>
              <Input
                id="max-total"
                type="number"
                min={1}
                max={50}
                value={maxTotalDownloads}
                onChange={(e) => setMaxTotalDownloads(Number(e.target.value))}
                className="bg-black/20 border-white/10 text-center font-semibold"
              />
            </div>
          </div>

          <Button
            type="submit"
            className="w-full py-6 mt-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-base font-semibold shadow-lg shadow-violet-500/25"
          >
            <Play className="mr-2 h-5 w-5 fill-current" />
            Analyze & Fetch Visual Assets
          </Button>
        </form>
      </div>

      {/* Right Column: Historical runs */}
      <div className="space-y-6">
        <div className="flex items-center space-x-2.5 border-b border-white/5 pb-4">
          <History className="h-6 w-6 text-muted-foreground" />
          <h2 className="text-xl font-bold tracking-tight">Run History</h2>
        </div>

        <div className="space-y-3 max-h-[700px] overflow-y-auto pr-1">
          {jobs.length === 0 ? (
            <div className="glass-panel rounded-xl p-8 text-center text-muted-foreground text-sm">
              No historical runs found. Create your first project to start.
            </div>
          ) : (
            jobs.map((job) => (
              <Card
                key={job.jobId}
                className="glass-card hover:bg-neutral-900/40 p-4 border border-white/5 transition-all cursor-pointer relative group"
                onClick={() => handleSelectJob(job.jobId)}
              >
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-semibold text-sm group-hover:text-primary transition-colors pr-2 line-clamp-1">
                    {job.title}
                  </h3>
                  {getStatusBadge(job.status)}
                </div>

                <div className="text-xs text-muted-foreground font-sans line-clamp-2 mb-3 pr-4 leading-relaxed">
                  {job.script}
                </div>

                <div className="flex items-center justify-between text-[10px] text-muted-foreground border-t border-white/5 pt-2">
                  <span>{new Date(job.createdAt).toLocaleDateString()}</span>
                  <div className="flex items-center space-x-3">
                    <span className="font-medium text-white">{job.assetCount} assets</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        rerunJob(job.jobId)
                      }}
                      className="p-1 hover:bg-white/10 hover:text-white rounded transition-colors"
                      title="Rerun Project"
                    >
                      <RotateCcw className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
