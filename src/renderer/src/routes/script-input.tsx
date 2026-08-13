import React, { useEffect, useState, useRef } from 'react'
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
    confirm,
    activeTabId,
    inputTabStates,
    updateInputTabState,
    loading
  } = useAppStore()

  // Form State retrieved from Zustand store for the active tab
  const tabState = inputTabStates[activeTabId] || {
    title: '',
    script: '',
    platform: 'YouTube' as const,
    style: 'cinematic',
    customStyleText: '',
    mix: 'videos + photos' as const,
    maxAssetsPerBeat: 3,
    maxTotalDownloads: 15
  }

  const {
    title,
    script,
    platform,
    style,
    customStyleText,
    mix,
    maxAssetsPerBeat,
    maxTotalDownloads
  } = tabState

  // Setter redirects to store actions
  const setTitle = (val: string): void => updateInputTabState(activeTabId, { title: val })
  const setScript = (val: string): void => updateInputTabState(activeTabId, { script: val })
  const setPlatform = (val: typeof platform): void =>
    updateInputTabState(activeTabId, { platform: val })
  const setStyle = (val: string): void => updateInputTabState(activeTabId, { style: val })
  const setCustomStyleText = (val: string): void =>
    updateInputTabState(activeTabId, { customStyleText: val })
  const setMix = (val: typeof mix): void => updateInputTabState(activeTabId, { mix: val })
  const setMaxAssetsPerBeat = (val: number): void =>
    updateInputTabState(activeTabId, { maxAssetsPerBeat: val })
  const setMaxTotalDownloads = (val: number): void =>
    updateInputTabState(activeTabId, { maxTotalDownloads: val })

  // Custom Dropdown State & Ref
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent): void {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const currentOption =
    PLATFORM_OPTIONS.find((opt) => opt.value === platform) || PLATFORM_OPTIONS[0]

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

    try {
      await startJob({
        title: title.trim(),
        script: script.trim(),
        platform,
        style,
        mix,
        maxAssetsPerBeat,
        maxTotalDownloads
      })
    } catch (err) {
      await alert(
        'Failed to Start Project',
        err instanceof Error ? err.message : 'Could not create the project workspace.'
      )
    }
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
          <span className="font-label-sm text-[11px] px-2.5 py-1 bg-primary-container border-2 border-ink-black text-on-primary-container rounded shadow-[2px_2px_0px_var(--color-ink-black)] inline-flex items-center gap-1.5 animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-on-primary-container animate-ping"></span>
            Running
          </span>
        )
      case 'paused':
        return (
          <span className="font-label-sm text-[11px] px-2.5 py-1 bg-tertiary-container border-2 border-ink-black text-on-tertiary-container rounded shadow-[2px_2px_0px_var(--color-ink-black)] inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-on-tertiary-container"></span>
            Paused
          </span>
        )
      case 'completed':
        return (
          <span className="font-label-sm text-[11px] px-2.5 py-1 bg-cyber-lime border-2 border-ink-black text-ink-black rounded shadow-[2px_2px_0px_var(--color-ink-black)] inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-ink-black"></span>
            Completed
          </span>
        )
      case 'failed':
        return (
          <span className="font-label-sm text-[11px] px-2.5 py-1 bg-error-container border-2 border-ink-black text-on-error-container rounded shadow-[2px_2px_0px_var(--color-ink-black)] inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-error"></span>
            Failed
          </span>
        )
      default:
        return (
          <span className="font-label-sm text-[11px] px-2.5 py-1 bg-surface-container-high border-2 border-ink-black text-outline rounded shadow-[2px_2px_0px_var(--color-ink-black)] inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-outline"></span>
            Cancelled
          </span>
        )
    }
  }

  return (
    <div className="w-full space-y-8 p-8 lg:p-10 pb-12 animate-fade-in-up relative risograph-overlay">
      {/* Header Area */}
      <header className="mb-section-gap flex justify-between items-end">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-ink-black dark:text-paper-white">
            Create New Pack
          </h2>
          <p className="font-body-lg text-body-lg text-outline dark:text-steel-secondary mt-2">
            Analyze your script to fetch cohesive visual assets automatically.
          </p>
        </div>
        <button
          onClick={() => navigate('settings')}
          className="w-12 h-12 rounded-full border-2 border-ink-black dark:border-surface-variant flex items-center justify-center bg-paper-white dark:bg-surface-container-lowest text-ink-black dark:text-paper-white shadow-[2px_2px_0px_rgba(0,0,0,0.5)] hover:shadow-[4px_4px_0px_#CCFF00] hover:-translate-y-1 hover:-translate-x-1 transition-all active:shadow-none active:translate-x-0 active:translate-y-0 cursor-pointer"
          title="Help & Settings"
        >
          <span className="material-symbols-outlined">help</span>
        </button>
      </header>

      {/* Warning Panel */}
      {(!settings?.pexelsKey || !settings?.[`${settings?.llmProvider || 'openai'}Key`]) && (
        <div className="p-4 border-2 border-ink-black rounded-xl flex items-center justify-between bg-tertiary-container text-on-tertiary-container font-label-sm text-xs shadow-[4px_4px_0px_var(--color-ink-black)] animate-pulse">
          <div className="flex items-center gap-3">
            <span
              className="material-symbols-outlined text-[22px] shrink-0"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
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
            className="bg-ink-black text-cyber-lime border-2 border-ink-black hover:bg-surface-variant shrink-0 font-bold px-3 py-1.5 rounded transition-all cursor-pointer shadow-[2px_2px_0px_var(--color-cyber-lime)] active:shadow-none active:translate-x-0.5 active:translate-y-0.5"
          >
            Configure
          </button>
        </div>
      )}

      {/* Main Form Panel */}
      <section className="max-w-5xl bg-surface border-2 border-ink-black dark:border-surface-variant rounded-xl p-component-padding shadow-[inset_6px_6px_12px_rgba(0,0,0,0.05)] dark:shadow-[inset_6px_6px_12px_rgba(0,0,0,0.3)] relative">
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Project Title */}
          <div>
            <label
              className="block font-title-md text-title-md text-ink-black dark:text-paper-white mb-2 uppercase tracking-wide text-xs"
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
              className="w-full bg-paper-white dark:bg-surface-container-lowest border-2 border-ink-black dark:border-surface-variant rounded-lg px-4 py-3 font-body-md text-body-md text-ink-black dark:text-paper-white placeholder:text-risograph-gray dark:placeholder:text-steel-secondary focus:outline-none focus:ring-0 neo-brutalist-input transition-all duration-200"
              required
            />
          </div>

          {/* Video Script */}
          <div>
            <div className="flex justify-between items-baseline mb-2">
              <label
                className="block font-title-md text-title-md text-ink-black dark:text-paper-white uppercase tracking-wide text-xs"
                htmlFor="video-script"
              >
                Video Script
              </label>
              <span className="font-label-sm text-xs text-outline dark:text-steel-secondary">
                Markdown Supported
              </span>
            </div>
            <textarea
              id="video-script"
              rows={6}
              placeholder="Paste your video script narrative here. The AI will segment this script into beats and search matching assets..."
              value={script}
              onChange={(e) => setScript(e.target.value)}
              className="w-full bg-paper-white dark:bg-surface-container-lowest border-2 border-ink-black dark:border-surface-variant rounded-lg px-4 py-3 font-body-md text-body-md text-ink-black dark:text-paper-white placeholder:text-risograph-gray dark:placeholder:text-steel-secondary focus:outline-none focus:ring-0 neo-brutalist-input transition-all duration-200 resize-y"
              required
            />
          </div>

          {/* Grid Configurations */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
            {/* Platform Layout */}
            <div>
              <label
                className="block font-title-md text-title-md text-ink-black dark:text-paper-white mb-2 uppercase tracking-wide text-xs"
                htmlFor="platform-layout"
              >
                Platform Layout
              </label>
              <div className="relative" ref={dropdownRef}>
                <button
                  id="platform-layout"
                  type="button"
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="w-full bg-paper-white dark:bg-surface-container-lowest border-2 border-ink-black dark:border-surface-variant rounded-lg px-4 py-3 font-body-md text-body-md text-ink-black dark:text-paper-white flex items-center justify-between cursor-pointer focus:outline-none focus:ring-0 neo-brutalist-input transition-all duration-200"
                >
                  <span className="flex items-center gap-2.5">
                    {currentOption.icon}
                    <span>{currentOption.label}</span>
                  </span>
                  <span
                    className={`material-symbols-outlined text-outline dark:text-steel-secondary transition-transform duration-200 pointer-events-none ${dropdownOpen ? 'rotate-180' : ''}`}
                  >
                    expand_more
                  </span>
                </button>

                {dropdownOpen && (
                  <div className="absolute left-0 right-0 mt-2 z-50 rounded-xl overflow-hidden bg-surface border-2 border-ink-black dark:border-surface-variant py-1.5 shadow-2xl animate-scale-up">
                    {PLATFORM_OPTIONS.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => {
                          setPlatform(item.value)
                          setDropdownOpen(false)
                        }}
                        className={`w-full text-left px-4 py-3 text-sm font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                          platform === item.value
                            ? 'bg-primary-container text-on-primary-container border-2 border-ink-black'
                            : 'text-on-surface hover:bg-surface-variant'
                        }`}
                      >
                        <span className="flex items-center gap-2.5">
                          {item.icon}
                          <span>{item.label}</span>
                        </span>
                        {platform === item.value && (
                          <span className="material-symbols-outlined text-[18px] text-primary">
                            check
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Visual Mood */}
            <div>
              <label
                className="block font-title-md text-title-md text-ink-black dark:text-paper-white mb-2 uppercase tracking-wide text-xs"
                htmlFor="visual-mood"
              >
                Visual Mood
              </label>
              <div className="relative mb-2">
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
                  className="w-full bg-paper-white dark:bg-surface-container-lowest border-2 border-ink-black dark:border-surface-variant rounded-lg px-4 py-3 font-body-md text-body-md text-ink-black dark:text-paper-white appearance-none focus:outline-none focus:ring-0 neo-brutalist-input transition-all duration-200 cursor-pointer"
                >
                  <option value="cinematic">Cinematic</option>
                  <option value="documentary">Documentary</option>
                  <option value="business">Business / Corporate</option>
                  <option value="tech">Tech</option>
                  <option value="custom">Custom Style...</option>
                </select>
                <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-outline dark:text-steel-secondary pointer-events-none">
                  expand_more
                </span>
              </div>
              {!(
                style === 'cinematic' ||
                style === 'documentary' ||
                style === 'business' ||
                style === 'tech'
              ) && (
                <input
                  type="text"
                  placeholder="e.g. vintage 8mm film, cyberpunk neon, sketch illustration"
                  value={customStyleText}
                  onChange={(e) => {
                    setCustomStyleText(e.target.value)
                    setStyle(e.target.value || 'custom style')
                  }}
                  className="w-full bg-paper-white dark:bg-surface-container-lowest border-2 border-ink-black dark:border-surface-variant rounded-lg px-4 py-2.5 text-xs text-ink-black dark:text-paper-white focus:outline-none focus:ring-0 neo-brutalist-input transition-all duration-200 font-semibold animate-fade-in-up"
                  required
                />
              )}
            </div>

            {/* Asset Mix Segmented Control */}
            <div>
              <label className="block font-title-md text-title-md text-ink-black dark:text-paper-white mb-2 uppercase tracking-wide text-xs">
                Asset Mix
              </label>
              <div className="flex border-2 border-ink-black dark:border-surface-variant rounded-lg overflow-hidden bg-paper-white dark:bg-surface-container-lowest neo-brutalist-input">
                <button
                  type="button"
                  onClick={() => setMix('videos only')}
                  className={`flex-1 py-3 text-center border-r-2 border-ink-black dark:border-surface-variant font-label-sm text-label-sm transition-colors ${
                    mix === 'videos only'
                      ? 'bg-ink-black dark:bg-surface-variant text-cyber-lime border-l-2 border-primary font-bold'
                      : 'text-outline dark:text-steel-secondary hover:bg-surface-variant dark:hover:text-paper-white'
                  }`}
                >
                  Videos
                </button>
                <button
                  type="button"
                  onClick={() => setMix('photos only')}
                  className={`flex-1 py-3 text-center border-r-2 border-ink-black dark:border-surface-variant font-label-sm text-label-sm transition-colors ${
                    mix === 'photos only'
                      ? 'bg-ink-black dark:bg-surface-variant text-cyber-lime border-l-2 border-primary font-bold'
                      : 'text-outline dark:text-steel-secondary hover:bg-surface-variant dark:hover:text-paper-white'
                  }`}
                >
                  Photos
                </button>
                <button
                  type="button"
                  onClick={() => setMix('videos + photos')}
                  className={`flex-1 py-3 text-center font-label-sm text-label-sm transition-colors ${
                    mix === 'videos + photos'
                      ? 'bg-ink-black dark:bg-surface-variant text-cyber-lime border-l-2 border-primary font-bold'
                      : 'text-outline dark:text-steel-secondary hover:bg-surface-variant dark:hover:text-paper-white'
                  }`}
                >
                  Both
                </button>
              </div>
            </div>
          </div>

          {/* Limits Config Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter pt-8 border-t-2 border-border border-dashed">
            <div>
              <label
                className="block font-title-md text-title-md text-ink-black dark:text-paper-white mb-2 uppercase tracking-wide text-xs"
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
                className="w-full bg-paper-white dark:bg-surface-container-lowest border-2 border-ink-black dark:border-surface-variant rounded-lg px-4 py-3 font-body-md text-body-md text-ink-black dark:text-paper-white focus:outline-none focus:ring-0 neo-brutalist-input transition-all duration-200"
              />
              <p className="font-label-sm text-xs text-outline dark:text-steel-secondary mt-1">
                Assets downloaded for each script segment.
              </p>
            </div>
            <div>
              <label
                className="block font-title-md text-title-md text-ink-black dark:text-paper-white mb-2 uppercase tracking-wide text-xs"
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
                className="w-full bg-paper-white dark:bg-surface-container-lowest border-2 border-ink-black dark:border-surface-variant rounded-lg px-4 py-3 font-body-md text-body-md text-ink-black dark:text-paper-white focus:outline-none focus:ring-0 neo-brutalist-input transition-all duration-200"
              />
              <p className="font-label-sm text-xs text-outline dark:text-steel-secondary mt-1">
                Safety threshold to conserve API request limits.
              </p>
            </div>
          </div>

          {/* CTA Action Area */}
          <div className="mt-section-gap flex justify-end pt-8 border-t-2 border-ink-black border-dashed">
            <button
              type="submit"
              disabled={loading}
              className="bg-cyber-lime text-surface-container-lowest border-2 border-primary-container px-8 py-4 rounded-lg font-label-sm text-label-sm tracking-wider uppercase flex items-center gap-3 shadow-[4px_4px_0px_#CCFF00] hover:bg-primary-fixed-dim transition-all duration-200 active:shadow-none active:translate-x-[4px] active:translate-y-[4px] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed disabled:active:shadow-[4px_4px_0px_#CCFF00] disabled:active:translate-x-0 disabled:active:translate-y-0"
            >
              <span className="material-symbols-outlined">auto_awesome</span>
              {loading ? 'Starting…' : 'Analyze & Fetch Visual Assets'}
            </button>
          </div>
        </form>
      </section>

      {/* Run History Section */}
      <section className="bg-surface border-2 border-ink-black dark:border-surface-variant rounded-xl overflow-hidden flex flex-col shadow-[inset_6px_6px_12px_rgba(0,0,0,0.05)] dark:shadow-[inset_6px_6px_12px_rgba(0,0,0,0.3)]">
        <div className="p-5 border-b-2 border-ink-black dark:border-surface-variant flex justify-between items-center bg-paper-white dark:bg-surface-container-lowest">
          <h3 className="font-title-md text-title-md text-ink-black dark:text-paper-white flex items-center gap-2">
            <span
              className="material-symbols-outlined text-cyber-lime bg-ink-black p-1.5 rounded brutal-border"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              history
            </span>
            Recent Pack Generations
          </h3>
          <span className="font-label-sm text-label-sm text-outline dark:text-steel-secondary">
            Sorted by Newest
          </span>
        </div>

        <div className="overflow-x-auto">
          {jobs.length === 0 ? (
            <div className="p-8 text-center text-xs text-on-surface-variant font-medium">
              No historical runs found. Create a project above to kick off.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low border-b-2 border-ink-black dark:border-surface-variant">
                  <th className="py-3.5 px-6 font-title-md text-xs text-ink-black dark:text-paper-white uppercase tracking-wider font-bold">
                    Project Title
                  </th>
                  <th className="py-3.5 px-6 font-title-md text-xs text-ink-black dark:text-paper-white uppercase tracking-wider font-bold">
                    Status
                  </th>
                  <th className="py-3.5 px-6 font-title-md text-xs text-ink-black dark:text-paper-white uppercase tracking-wider font-bold">
                    Assets
                  </th>
                  <th className="py-3.5 px-6 font-title-md text-xs text-ink-black dark:text-paper-white uppercase tracking-wider font-bold">
                    Date
                  </th>
                  <th className="py-3.5 px-6 font-title-md text-xs text-ink-black dark:text-paper-white uppercase tracking-wider font-bold text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="text-xs text-on-surface font-medium">
                {jobs.map((job) => (
                  <tr
                    key={job.jobId}
                    onClick={() => handleSelectJob(job.jobId)}
                    className="border-b border-outline-variant/30 hover:bg-surface-variant cursor-pointer transition-colors duration-150"
                  >
                    <td className="py-4 px-6 font-bold text-sm text-ink-black dark:text-paper-white">
                      {job.title}
                    </td>
                    <td className="py-4 px-6">{getStatusBadge(job.status)}</td>
                    <td className="py-4 px-6 font-mono text-outline dark:text-steel-secondary">
                      {job.status === 'running' ? '--' : `${job.assetCount} assets`}
                    </td>
                    <td className="py-4 px-6 font-mono text-outline dark:text-steel-secondary">
                      {new Date(job.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-4 px-6 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleSelectJob(job.jobId)}
                          className="bg-paper-white dark:bg-surface-container-lowest border-2 border-ink-black text-ink-black dark:text-paper-white p-2 rounded hover:bg-surface-variant shadow-[1px_1px_0px_rgba(0,0,0,0.5)] active:translate-y-0.5 active:translate-x-0.5"
                          title="Open View"
                        >
                          <span className="material-symbols-outlined text-[18px]">visibility</span>
                        </button>
                        <button
                          onClick={() => rerunJob(job.jobId)}
                          disabled={loading}
                          className="bg-paper-white dark:bg-surface-container-lowest border-2 border-ink-black text-ink-black dark:text-paper-white p-2 rounded hover:bg-surface-variant shadow-[1px_1px_0px_rgba(0,0,0,0.5)] active:translate-y-0.5 active:translate-x-0.5 disabled:opacity-60 disabled:cursor-not-allowed"
                          title="Rerun Project"
                        >
                          <span className="material-symbols-outlined text-[18px]">replay</span>
                        </button>
                        <button
                          onClick={() => handleDeleteJob(job.jobId, job.title)}
                          className="bg-paper-white dark:bg-surface-container-lowest border-2 border-ink-black text-ink-black dark:text-paper-white p-2 hover:text-error hover:bg-surface-variant shadow-[1px_1px_0px_rgba(0,0,0,0.5)] active:translate-y-0.5 active:translate-x-0.5"
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

// --- Platform Icons and Selection Options ---

const YouTubeIcon = (): React.JSX.Element => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="none">
    <rect x="2" y="4" width="20" height="16" rx="5" fill="#FF0000" />
    <polygon points="10,8 16,12 10,16" fill="#FFFFFF" />
  </svg>
)

const ShortsIcon = (): React.JSX.Element => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0">
    <path
      d="m18.931 9.99-1.441-.601 1.717-.913a4.48 4.48 0 0 0 1.874-6.078 4.506 4.506 0 0 0-6.09-1.874L4.792 5.929a4.504 4.504 0 0 0-2.402 4.193 4.521 4.521 0 0 0 2.666 3.904c.036.012 1.442.6 1.442.6l-1.706.901a4.51 4.51 0 0 0-2.369 3.967A4.528 4.528 0 0 0 6.93 24c.725 0 1.437-.174 2.08-.508l10.21-5.406a4.494 4.494 0 0 0 2.39-4.192 4.525 4.525 0 0 0-2.678-3.904Z"
      fill="#FF0000"
    />
    <polygon points="9.6,8.8 9.6,15.2 15.6,12" fill="#FFFFFF" />
  </svg>
)

const TikTokIcon = (): React.JSX.Element => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 text-on-surface fill-current shrink-0">
    <path d="M12.525.02c1.31.03 2.612.35 3.82.956V4.96c-1.362-.43-2.8-.45-4.17-.06V11.23c-.023 2.37-1.728 4.417-4.088 4.79-2.58.41-5.01-1.323-5.45-3.89-.44-2.568 1.27-5.013 3.847-5.462.628-.11 1.272-.092 1.892.052v4.06c-.34-.14-.7-.215-1.07-.22-1.29-.02-2.36 1.012-2.38 2.302-.02 1.29 1.012 2.36 2.302 2.38 1.25.02 2.29-.95 2.35-2.2v-13.43c2.4-.047 4.7.773 6.55 2.3v-4.06c-1.35-.85-2.9-1.31-4.48-1.32V.02Z" />
  </svg>
)

const ReelsIcon = (): React.JSX.Element => (
  <svg viewBox="0 0 122.14 122.88" className="w-5 h-5 text-on-surface fill-current shrink-0">
    <path d="M35.14,0H87c9.65,0,18.43,3.96,24.8,10.32c6.38,6.37,10.34,15.16,10.34,24.82v52.61c0,9.64-3.96,18.42-10.32,24.79 l-0.02,0.02c-6.38,6.37-15.16,10.32-24.79,10.32H35.14c-9.66,0-18.45-3.96-24.82-10.32l-0.24-0.27C3.86,105.95,0,97.27,0,87.74 V35.14c0-9.67,3.95-18.45,10.32-24.82S25.47,0,35.14,0L35.14,0z M91.51,31.02l0.07,0.11h21.6c-0.87-5.68-3.58-10.78-7.48-14.69 C100.9,11.64,94.28,8.66,87,8.66h-8.87L91.51,31.02L91.51,31.02z M81.52,31.13L68.07,8.66H38.57l13.61,22.47H81.52L81.52,31.13z M42.11,31.13L28.95,9.39c-4.81,1.16-9.12,3.65-12.51,7.05c-3.9,3.9-6.6,9.01-7.48,14.69H42.11L42.11,31.13z M113.48,39.79H8.66 v47.96c0,7.17,2.89,13.7,7.56,18.48l0.22,0.21c4.8,4.8,11.43,7.79,18.7,7.79H87c7.28,0,13.9-2.98,18.69-7.77l0.02-0.02 c4.79-4.79,7.77-11.41,7.77-18.69V39.79L113.48,39.79z M50.95,54.95l26.83,17.45c0.43,0.28,0.82,0.64,1.13,1.08 c1.22,1.77,0.77,4.2-1,5.42L51.19,94.67c-0.67,0.55-1.53,0.88-2.48,0.88c-2.16,0-3.91-1.75-3.91-3.91V58.15h0.02 c0-0.77,0.23-1.55,0.7-2.23C46.76,54.15,49.19,53.72,50.95,54.95L50.95,54.95L50.95,54.95z" />
  </svg>
)

type PlatformType = 'YouTube' | 'Shorts' | 'TikTok' | 'Instagram Reels'

interface PlatformOption {
  value: PlatformType
  label: string
  icon: React.JSX.Element
}

const PLATFORM_OPTIONS: PlatformOption[] = [
  {
    value: 'YouTube',
    label: 'YouTube (16:9)',
    icon: <YouTubeIcon />
  },
  {
    value: 'Shorts',
    label: 'YouTube Shorts (9:16)',
    icon: <ShortsIcon />
  },
  {
    value: 'TikTok',
    label: 'TikTok (9:16)',
    icon: <TikTokIcon />
  },
  {
    value: 'Instagram Reels',
    label: 'Instagram Reels (9:16)',
    icon: <ReelsIcon />
  }
]
