import React, { useEffect, useState } from 'react'
import { useAppStore } from '../lib/store'

export default function ScriptInputView(): React.JSX.Element {
  const {
    startJob,
    jobs,
    loadJobs,
    setActiveJobId,
    navigate,
    rerunJob,
    settings,
    loadSettings,
    deleteJob,
    alert,
    confirm
  } = useAppStore()

  // Form State
  const [title, setTitle] = useState('')
  const [script, setScript] = useState('')
  const [platform, setPlatform] = useState<'YouTube' | 'Shorts' | 'TikTok' | 'Instagram Reels'>(
    'YouTube'
  )
  const [style, setStyle] = useState<string>('cinematic')
  const [customStyleText, setCustomStyleText] = useState('')
  const [mix, setMix] = useState<'videos only' | 'photos only' | 'videos + photos'>(
    'videos + photos'
  )
  const [maxAssetsPerBeat, setMaxAssetsPerBeat] = useState(3)
  const [maxTotalDownloads, setMaxTotalDownloads] = useState(15)

  useEffect(() => {
    loadJobs()
    loadSettings()
  }, [loadJobs, loadSettings])

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!title.trim() || !script.trim()) {
      await alert('Validation Error', 'Please fill out both the title and the script.')
      return
    }

    const activeProvider = settings?.llmProvider || 'openai'
    const activeProviderKey = settings ? settings[`${activeProvider}Key`] : ''
    const hasPexelsKey = !!settings?.pexelsKey
    const hasLlmKey = !!activeProviderKey

    if (!hasPexelsKey || !hasLlmKey) {
      let missingMsg = ''
      if (!hasPexelsKey && !hasLlmKey) {
        missingMsg = 'Both Pexels API Key and active LLM Provider API Key are missing.'
      } else if (!hasPexelsKey) {
        missingMsg = 'Pexels API Key is missing.'
      } else {
        missingMsg = `Active LLM Provider (${activeProvider.toUpperCase()}) API Key is missing.`
      }
      await alert('Credentials Required', `${missingMsg} Please set it in Settings first.`)
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

  const handleSelectJob = (jobId: string): void => {
    setActiveJobId(jobId)
    navigate('run')
  }

  const handleDeleteJob = async (jobId: string, jobTitle: string): Promise<void> => {
    const isConfirmed = await confirm(
      'Delete Project',
      `Are you sure you want to delete the project "${jobTitle}"?\n\nThis will permanently delete all downloaded photos, videos, and settings logs associated with this project from your hard drive.`
    )
    if (isConfirmed) {
      try {
        await deleteJob(jobId)
      } catch (err) {
        await alert('Error Deleting Project', 'Failed to delete project: ' + err)
      }
    }
  }

  const getStatusBadge = (status: string): React.JSX.Element => {
    switch (status) {
      case 'running':
        return (
          <span className="font-mono text-[10px] font-semibold tracking-wider uppercase bg-primary-fixed border border-[#adc6ff] text-on-primary-fixed-variant px-2.5 py-1 rounded-full inline-flex items-center gap-1.5 animate-pulse-glow">
            <span className="w-1.5 h-1.5 rounded-full bg-on-primary-fixed-variant"></span>
            Running
          </span>
        )
      case 'paused':
        return (
          <span className="font-mono text-[10px] font-semibold tracking-wider uppercase bg-tertiary-fixed border border-tertiary-fixed-dim text-on-tertiary-fixed-variant px-2.5 py-1 rounded-full inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-on-tertiary-fixed-variant"></span>
            Paused
          </span>
        )
      case 'completed':
        return (
          <span className="font-mono text-[10px] font-semibold tracking-wider uppercase bg-secondary-fixed border border-secondary-fixed-dim text-on-secondary-fixed-variant px-2.5 py-1 rounded-full inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
            Completed
          </span>
        )
      case 'failed':
        return (
          <span className="font-mono text-[10px] font-semibold tracking-wider uppercase bg-error-container border border-[#ffb4ab] text-on-error-container px-2.5 py-1 rounded-full inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-error"></span>
            Failed
          </span>
        )
      default:
        return (
          <span className="font-mono text-[10px] font-semibold tracking-wider uppercase bg-surface-container-high border border-outline-variant/30 text-outline px-2.5 py-1 rounded-full inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-outline"></span>
            Cancelled
          </span>
        )
    }
  }

  return (
    <div className="w-full space-y-8 pb-12 animate-fade-in-up">
      {/* Header Area */}
      <header className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-extrabold text-on-surface mb-2">Create New Pack</h2>
          <p className="text-sm font-medium text-on-surface-variant">
            Analyze your script to fetch cohesive visual assets automatically.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('settings')}
            className="w-10 h-10 rounded-full glass-panel flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors shadow-sm"
            title="Help & Settings"
          >
            <span className="material-symbols-outlined text-[20px]">help_outline</span>
          </button>
        </div>
      </header>

      {/* Warning Panel */}
      {(!settings?.pexelsKey || !settings?.[`${settings?.llmProvider || 'openai'}Key`]) && (
        <div className="p-4 rounded-xl flex items-center justify-between bg-tertiary/10 border border-tertiary/20 text-tertiary text-xs font-semibold shadow-sm animate-pulse-glow">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-tertiary text-[22px] shrink-0">
              warning
            </span>
            <div>
              {!settings?.pexelsKey && !settings?.[`${settings?.llmProvider || 'openai'}Key`] ? (
                <span>
                  Credentials required: Configure both your <strong>Pexels API Key</strong> and
                  active{' '}
                  <strong>{(settings?.llmProvider || 'openai').toUpperCase()} API Key</strong>{' '}
                  before generating packs.
                </span>
              ) : !settings?.pexelsKey ? (
                <span>
                  Credentials required: Configure your <strong>Pexels API Key</strong> before
                  generating packs.
                </span>
              ) : (
                <span>
                  Credentials required: Configure your active{' '}
                  <strong>{(settings?.llmProvider || 'openai').toUpperCase()} API Key</strong>{' '}
                  before generating packs.
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => navigate('settings')}
            className="bg-tertiary/20 hover:bg-tertiary/30 text-tertiary border-none shrink-0 font-bold px-3 py-1.5 rounded-lg transition-colors"
          >
            Configure
          </button>
        </div>
      )}

      {/* Main Form Panel */}
      <section className="glass-panel p-6 lg:p-8 rounded-2xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Project Title */}
          <div>
            <label
              className="block font-semibold text-sm text-on-surface mb-2.5"
              htmlFor="project-title"
            >
              Project Title
            </label>
            <input
              id="project-title"
              type="text"
              placeholder="e.g. Q3 Marketing Explainer, AI Office Hacks"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full glass-input rounded-lg px-4 py-3 text-sm text-on-surface placeholder:text-outline/70 font-medium"
              required
            />
          </div>

          {/* Video Script */}
          <div>
            <div className="flex justify-between items-baseline mb-2.5">
              <label className="block font-semibold text-sm text-on-surface" htmlFor="video-script">
                Video Script
              </label>
              <span className="font-mono text-[10px] text-outline">Markdown Supported</span>
            </div>
            <textarea
              id="video-script"
              rows={8}
              placeholder="Paste your video script narrative here. The AI will segment this script into beats and search matching assets..."
              value={script}
              onChange={(e) => setScript(e.target.value)}
              className="w-full glass-input rounded-lg px-4 py-3 text-sm text-on-surface placeholder:text-outline/70 font-medium leading-relaxed resize-y"
              required
            />
          </div>

          {/* Grid Configurations */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Platform Layout */}
            <div>
              <label
                className="block font-semibold text-sm text-on-surface mb-2.5"
                htmlFor="platform-layout"
              >
                Platform Layout
              </label>
              <div className="relative">
                <select
                  id="platform-layout"
                  value={platform}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    setPlatform(
                      e.target.value as 'YouTube' | 'Shorts' | 'TikTok' | 'Instagram Reels'
                    )
                  }
                  className="w-full glass-input rounded-lg px-4 py-3 text-sm text-on-surface appearance-none pr-10 font-semibold cursor-pointer"
                >
                  <option value="YouTube">YouTube (16:9)</option>
                  <option value="Shorts">YouTube Shorts (9:16)</option>
                  <option value="TikTok">TikTok (9:16)</option>
                  <option value="Instagram Reels">Instagram Reels (9:16)</option>
                </select>
                <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-outline pointer-events-none">
                  expand_more
                </span>
              </div>
            </div>

            {/* Visual Mood */}
            <div>
              <label
                className="block font-semibold text-sm text-on-surface mb-2.5"
                htmlFor="visual-mood"
              >
                Visual Mood
              </label>
              <div className="relative mb-2.5">
                <select
                  id="visual-mood"
                  value={
                    style === 'cinematic' ||
                    style === 'documentary' ||
                    style === 'business' ||
                    style === 'tech' ||
                    style === 'nature' ||
                    style === 'lifestyle' ||
                    style === 'abstract'
                      ? style
                      : 'custom'
                  }
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                    const val = e.target.value
                    setStyle(val === 'custom' ? customStyleText || 'custom style' : val)
                  }}
                  className="w-full glass-input rounded-lg px-4 py-3 text-sm text-on-surface appearance-none pr-10 font-semibold cursor-pointer"
                >
                  <option value="cinematic">Cinematic</option>
                  <option value="documentary">Documentary</option>
                  <option value="business">Business / Office</option>
                  <option value="tech">Technology / Futuristic</option>
                  <option value="nature">Nature / Slow-mo</option>
                  <option value="lifestyle">Lifestyle / Real-life</option>
                  <option value="abstract">Abstract / Artistic</option>
                  <option value="custom">Custom Style...</option>
                </select>
                <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-outline pointer-events-none">
                  expand_more
                </span>
              </div>
              {!(
                style === 'cinematic' ||
                style === 'documentary' ||
                style === 'business' ||
                style === 'tech' ||
                style === 'nature' ||
                style === 'lifestyle' ||
                style === 'abstract'
              ) && (
                <input
                  type="text"
                  placeholder="e.g. vintage 8mm film, cyberpunk neon, sketch illustration"
                  value={customStyleText}
                  onChange={(e) => {
                    setCustomStyleText(e.target.value)
                    setStyle(e.target.value || 'custom style')
                  }}
                  className="w-full glass-input rounded-lg px-4 py-2.5 text-xs text-on-surface font-semibold animate-fade-in-up"
                  required
                />
              )}
            </div>

            {/* Asset Mix Toggle */}
            <div>
              <label className="block font-semibold text-sm text-on-surface mb-2.5">
                Asset Mix
              </label>
              <div className="flex bg-white/5 rounded-lg p-1 border border-white/10 h-[46px]">
                <button
                  type="button"
                  onClick={() => setMix('videos only')}
                  className={`flex-1 text-center font-bold text-xs rounded-md transition-all shadow-sm border ${
                    mix === 'videos only'
                      ? 'bg-primary/20 border-primary/30 text-primary shadow-[0_2px_8px_rgba(139,92,246,0.15)]'
                      : 'text-on-surface-variant hover:text-on-surface border-transparent'
                  }`}
                >
                  Videos
                </button>
                <button
                  type="button"
                  onClick={() => setMix('photos only')}
                  className={`flex-1 text-center font-bold text-xs rounded-md transition-all shadow-sm border ${
                    mix === 'photos only'
                      ? 'bg-primary/20 border-primary/30 text-primary shadow-[0_2px_8px_rgba(139,92,246,0.15)]'
                      : 'text-on-surface-variant hover:text-on-surface border-transparent'
                  }`}
                >
                  Photos
                </button>
                <button
                  type="button"
                  onClick={() => setMix('videos + photos')}
                  className={`flex-1 text-center font-bold text-xs rounded-md transition-all shadow-sm border ${
                    mix === 'videos + photos'
                      ? 'bg-primary/20 border-primary/30 text-primary shadow-[0_2px_8px_rgba(139,92,246,0.15)]'
                      : 'text-on-surface-variant hover:text-on-surface border-transparent'
                  }`}
                >
                  Both
                </button>
              </div>
            </div>
          </div>

          {/* Limits Config Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-white/5">
            <div>
              <label
                className="block font-semibold text-sm text-on-surface mb-2.5"
                htmlFor="max-assets"
              >
                Max Assets per Beat
              </label>
              <input
                id="max-assets"
                type="number"
                min="1"
                max="5"
                value={maxAssetsPerBeat}
                onChange={(e) => setMaxAssetsPerBeat(Number(e.target.value))}
                className="w-full glass-input rounded-lg px-4 py-3 font-mono text-sm text-on-surface"
              />
              <p className="mt-1.5 text-xs text-outline font-medium">
                Assets downloaded for each script segment.
              </p>
            </div>
            <div>
              <label
                className="block font-semibold text-sm text-on-surface mb-2.5"
                htmlFor="max-total"
              >
                Max Total Downloads
              </label>
              <input
                id="max-total"
                type="number"
                min="1"
                max="100"
                value={maxTotalDownloads}
                onChange={(e) => setMaxTotalDownloads(Number(e.target.value))}
                className="w-full glass-input rounded-lg px-4 py-3 font-mono text-sm text-on-surface"
              />
              <p className="mt-1.5 text-xs text-outline font-medium">
                Safety threshold to conserve API request limits.
              </p>
            </div>
          </div>

          {/* CTA Action Area */}
          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              className="tactile-button text-white font-semibold text-xs px-8 py-4 rounded-lg flex items-center gap-2 group tracking-wider uppercase cursor-pointer shadow-md"
            >
              <span className="material-symbols-outlined text-[18px] group-hover:rotate-12 transition-transform">
                model_training
              </span>
              Analyze & Fetch Visual Assets
            </button>
          </div>
        </form>
      </section>

      {/* Run History Section */}
      <section className="glass-panel overflow-hidden flex flex-col rounded-2xl">
        <div className="p-5 border-b border-white/5 flex justify-between items-center bg-white/5">
          <h3 className="font-semibold text-sm text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">history</span>
            Recent Pack Generations
          </h3>
          <span className="font-mono text-[10px] text-outline">Sorted by Newest</span>
        </div>

        <div className="overflow-x-auto">
          {jobs.length === 0 ? (
            <div className="p-8 text-center text-xs text-on-surface-variant font-medium">
              No historical runs found. Create a project above to kick off.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white/5 border-b border-white/5">
                  <th className="py-3.5 px-6 font-mono text-[10px] text-outline uppercase tracking-wider font-semibold">
                    Project Title
                  </th>
                  <th className="py-3.5 px-6 font-mono text-[10px] text-outline uppercase tracking-wider font-semibold">
                    Status
                  </th>
                  <th className="py-3.5 px-6 font-mono text-[10px] text-outline uppercase tracking-wider font-semibold">
                    Assets
                  </th>
                  <th className="py-3.5 px-6 font-mono text-[10px] text-outline uppercase tracking-wider font-semibold">
                    Date
                  </th>
                  <th className="py-3.5 px-6 font-mono text-[10px] text-outline uppercase tracking-wider font-semibold text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="text-xs text-on-surface font-medium">
                {jobs.map((job) => (
                  <tr
                    key={job.jobId}
                    onClick={() => handleSelectJob(job.jobId)}
                    className="list-row border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors duration-150"
                  >
                    <td className="py-4 px-6 font-semibold">{job.title}</td>
                    <td className="py-4 px-6">{getStatusBadge(job.status)}</td>
                    <td className="py-4 px-6 font-mono text-on-surface-variant">
                      {job.status === 'running' ? '--' : job.assetCount} assets
                    </td>
                    <td className="py-4 px-6 font-mono text-on-surface-variant">
                      {new Date(job.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-4 px-6 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleSelectJob(job.jobId)}
                          className="text-on-surface-variant hover:text-primary transition-colors p-1.5 rounded hover:bg-white/10"
                          title="Open View"
                        >
                          <span className="material-symbols-outlined text-[18px]">visibility</span>
                        </button>
                        <button
                          onClick={() => rerunJob(job.jobId)}
                          className="text-on-surface-variant hover:text-primary transition-colors p-1.5 rounded hover:bg-white/10"
                          title="Rerun Project"
                        >
                          <span className="material-symbols-outlined text-[18px]">replay</span>
                        </button>
                        <button
                          onClick={() => handleDeleteJob(job.jobId, job.title)}
                          className="text-on-surface-variant hover:text-error transition-colors p-1.5 rounded hover:bg-white/10"
                          title="Delete Project & Files"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  )
}
