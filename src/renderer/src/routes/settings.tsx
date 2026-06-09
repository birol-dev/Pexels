import React, { useEffect, useState } from 'react'
import { useAppStore, PublicSettings } from '../lib/store'
import { api } from '../lib/api-client'

const GITHUB_REPO_URL = 'https://github.com/birol-dev/Pexels'

export default function SettingsView(): React.JSX.Element {
  const { settings, loadSettings, updateSettings, confirm } = useAppStore()

  // Buffers settings in local state
  const [localSettings, setLocalSettings] = useState<PublicSettings | null>(null)

  // API keys state
  const [openaiKey, setOpenaiKey] = useState('')
  const [geminiKey, setGeminiKey] = useState('')
  const [openrouterKey, setOpenrouterKey] = useState('')
  const [pexelsKey, setPexelsKey] = useState('')

  // Testing states
  const [testingLlm, setTestingLlm] = useState(false)
  const [llmTestResult, setLlmTestResult] = useState<{ success: boolean; message: string } | null>(
    null
  )

  const [testingPexels, setTestingPexels] = useState(false)
  const [pexelsTestResult, setPexelsTestResult] = useState<{
    success: boolean
    message: string
  } | null>(null)

  const [savingSettings, setSavingSettings] = useState(false)
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null)

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  useEffect(() => {
    if (settings) {
      Promise.resolve().then(() => {
        setLocalSettings({ ...settings })
      })
    }
  }, [settings])

  if (!localSettings) {
    return (
      <div className="flex h-[400px] items-center justify-center bg-transparent">
        <span className="material-symbols-outlined text-[48px] text-cyber-lime animate-spin">
          sync
        </span>
      </div>
    )
  }

  const handleSave = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setSavingSettings(true)
    setSaveResult(null)
    const updates: Partial<PublicSettings> = { ...localSettings }

    // Clear out masked values
    updates.openaiKey = undefined
    updates.geminiKey = undefined
    updates.openrouterKey = undefined
    updates.pexelsKey = undefined

    if (openaiKey) updates.openaiKey = openaiKey
    if (geminiKey) updates.geminiKey = geminiKey
    if (openrouterKey) updates.openrouterKey = openrouterKey
    if (pexelsKey) updates.pexelsKey = pexelsKey

    try {
      await updateSettings(updates)
      setSaveResult({ success: true, message: 'Settings saved successfully.' })
      setOpenaiKey('')
      setGeminiKey('')
      setOpenrouterKey('')
      setPexelsKey('')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setSaveResult({
        success: false,
        message: msg || 'Failed to save settings.'
      })
    } finally {
      setSavingSettings(false)
    }
  }

  const handleChooseFolder = async (): Promise<void> => {
    const folder = await api.settings.chooseDownloadFolder()
    if (folder) {
      setLocalSettings((prev) => {
        if (!prev) return null
        return { ...prev, downloadFolder: folder }
      })
    }
  }

  const testLlmConnection = async (): Promise<void> => {
    setTestingLlm(true)
    setLlmTestResult(null)
    try {
      const activeKey =
        localSettings.llmProvider === 'openai'
          ? openaiKey
          : localSettings.llmProvider === 'gemini'
            ? geminiKey
            : openrouterKey

      const result = await api.settings.testProvider({
        provider: localSettings.llmProvider,
        apiKey: activeKey || 'CURRENT_KEY_ON_DISK',
        modelId: localSettings.modelId
      })
      setLlmTestResult(result as unknown as { success: boolean; message: string })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setLlmTestResult({ success: false, message: msg || 'Connection test failed.' })
    } finally {
      setTestingLlm(false)
    }
  }

  const testPexelsConnection = async (): Promise<void> => {
    setTestingPexels(true)
    setPexelsTestResult(null)
    try {
      const result = await api.settings.testPexelsKey(pexelsKey || 'CURRENT_KEY_ON_DISK')
      setPexelsTestResult(result as unknown as { success: boolean; message: string })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setPexelsTestResult({
        success: false,
        message: msg || 'Pexels verification failed.'
      })
    } finally {
      setTestingPexels(false)
    }
  }

  const handleResetOnboarding = async (): Promise<void> => {
    const isConfirmed = await confirm(
      'Reset Onboarding',
      'Are you sure you want to reset onboarding? This will route you back to the initial setup wizard.'
    )
    if (isConfirmed) {
      await updateSettings({ isOnboarded: false })
      window.location.reload()
    }
  }

  const handleProviderChange = (prov: 'openai' | 'gemini' | 'openrouter'): void => {
    const defaults = {
      openai: 'gpt-4o',
      gemini: 'gemini-1.5-pro-latest',
      openrouter: 'anthropic/claude-3-opus'
    }
    setLocalSettings((prev) => {
      if (!prev) return null
      return {
        ...prev,
        llmProvider: prov,
        modelId: defaults[prov]
      }
    })
    setLlmTestResult(null)
  }

  return (
    <div className="w-full max-w-[1160px] mx-auto px-grid-margin py-8 flex flex-col gap-8 relative z-10 animate-fade-in-up">
      {/* Header */}
      <header className="col-span-12 mb-4">
        <h2 className="font-headline-lg text-headline-lg text-ink-black uppercase leading-none">
          Settings
        </h2>
        <p className="font-body-lg text-body-lg text-risograph-gray mt-3 max-w-2xl">
          Configure generation parameters, API keys, and safety controls for the core engine.
        </p>
      </header>

      {/* Diagnostics / Connection Alert Cards */}
      {(saveResult || llmTestResult || pexelsTestResult) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {saveResult && (
            <div
              className={`p-4 border-2 border-ink-black rounded-DEFAULT shadow-[4px_4px_0px_var(--color-ink-black)] flex items-start gap-3 ${
                saveResult.success
                  ? 'bg-cyber-lime/10 text-ink-black'
                  : 'bg-error-container text-on-error-container'
              }`}
            >
              <span className="material-symbols-outlined text-[20px] mt-0.5 shrink-0">
                {saveResult.success ? 'check_circle' : 'error'}
              </span>
              <div>
                <div className="font-title-md text-[14px] uppercase">Settings Status</div>
                <div className="font-body-md text-[12px] mt-0.5 leading-normal opacity-90">
                  {saveResult.message}
                </div>
              </div>
            </div>
          )}

          {llmTestResult && (
            <div
              className={`p-4 border-2 border-ink-black rounded-DEFAULT shadow-[4px_4px_0px_var(--color-ink-black)] flex items-start gap-3 ${
                llmTestResult.success
                  ? 'bg-cyber-lime/10 text-ink-black'
                  : 'bg-error-container text-on-error-container'
              }`}
            >
              <span className="material-symbols-outlined text-[20px] mt-0.5 shrink-0">
                {llmTestResult.success ? 'check_circle' : 'error'}
              </span>
              <div>
                <div className="font-title-md text-[14px] uppercase">LLM Connection Test</div>
                <div className="font-body-md text-[12px] mt-0.5 leading-normal opacity-90">
                  {llmTestResult.message}
                </div>
              </div>
            </div>
          )}

          {pexelsTestResult && (
            <div
              className={`p-4 border-2 border-ink-black rounded-DEFAULT shadow-[4px_4px_0px_var(--color-ink-black)] flex items-start gap-3 ${
                pexelsTestResult.success
                  ? 'bg-cyber-lime/10 text-ink-black'
                  : 'bg-error-container text-on-error-container'
              }`}
            >
              <span className="material-symbols-outlined text-[20px] mt-0.5 shrink-0">
                {pexelsTestResult.success ? 'check_circle' : 'error'}
              </span>
              <div>
                <div className="font-title-md text-[14px] uppercase">Pexels Connection Test</div>
                <div className="font-body-md text-[12px] mt-0.5 leading-normal opacity-90">
                  {pexelsTestResult.message}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-12 gap-gutter">
        {/* Tile 1: AI Provider Config (Span 8) */}
        <div className="bento-card col-span-1 md:col-span-8 p-6 flex flex-col gap-6">
          <div className="flex items-center justify-between border-b-2 border-ink-black pb-4">
            <h3 className="font-title-md text-title-md uppercase flex items-center gap-2 text-ink-black">
              <span className="material-symbols-outlined text-electric-purple">memory</span>
              AI Provider Configuration
            </h3>
            <span className="bg-electric-purple text-paper-white px-2 py-1 font-label-sm text-label-sm uppercase rounded-DEFAULT border-2 border-ink-black">
              Active
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <label className="font-label-sm text-label-sm text-ink-black uppercase">
                Provider
              </label>
              <div className="relative">
                <select
                  value={localSettings.llmProvider}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    handleProviderChange(e.target.value as 'openai' | 'gemini' | 'openrouter')
                  }
                  className="neo-input rounded-DEFAULT w-full px-4 py-3 font-body-md text-body-md outline-none focus:border-electric-purple transition-colors cursor-pointer bg-surface text-ink-black"
                >
                  <option value="openrouter">OpenRouter</option>
                  <option value="openai">OpenAI</option>
                  <option value="gemini">Google Gemini</option>
                </select>
                <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-ink-black">
                  expand_more
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="font-label-sm text-label-sm text-ink-black uppercase">
                Model ID
              </label>
              <input
                type="text"
                placeholder="Enter model ID"
                value={localSettings.modelId}
                onChange={(e) =>
                  setLocalSettings((prev) => {
                    if (!prev) return null
                    return { ...prev, modelId: e.target.value }
                  })
                }
                className="neo-input rounded-DEFAULT w-full px-4 py-3 font-body-md text-body-md outline-none focus:border-electric-purple transition-colors font-mono text-ink-black bg-surface"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 mt-2">
            <label className="font-label-sm text-label-sm text-ink-black uppercase">API Key</label>
            <div className="flex gap-4">
              <input
                type="password"
                placeholder={
                  localSettings[`${localSettings.llmProvider}Key`]
                    ? '••••••••••••••••'
                    : 'Enter provider key...'
                }
                value={
                  localSettings.llmProvider === 'openai'
                    ? openaiKey
                    : localSettings.llmProvider === 'gemini'
                      ? geminiKey
                      : openrouterKey
                }
                onChange={(e) => {
                  if (localSettings.llmProvider === 'openai') setOpenaiKey(e.target.value)
                  else if (localSettings.llmProvider === 'gemini') setGeminiKey(e.target.value)
                  else setOpenrouterKey(e.target.value)
                }}
                className="neo-input rounded-DEFAULT flex-1 px-4 py-3 font-body-md text-body-md outline-none focus:border-electric-purple transition-colors font-mono tracking-widest text-ink-black bg-surface"
              />
              <button
                type="button"
                disabled={testingLlm}
                onClick={testLlmConnection}
                className="btn-secondary rounded-DEFAULT px-6 flex items-center gap-2 whitespace-nowrap"
              >
                <span className={`material-symbols-outlined ${testingLlm ? 'animate-spin' : ''}`}>
                  {testingLlm ? 'sync' : 'sync_alt'}
                </span>
                <span className="font-label-sm text-label-sm uppercase">Test Key</span>
              </button>
            </div>
          </div>
        </div>

        {/* Tile 2: Pexels Integration (Span 4) */}
        <div className="bento-card col-span-1 md:col-span-4 p-6 flex flex-col gap-6 bg-surface-container-high">
          <div className="flex items-center gap-2 border-b-2 border-ink-black pb-4">
            <span className="material-symbols-outlined text-cyber-lime">photo_library</span>
            <h3 className="font-title-md text-title-md uppercase text-ink-black">Pexels API</h3>
          </div>
          <p className="font-body-md text-body-md text-risograph-gray text-sm">
            Required for pulling high-res stock footage.
          </p>
          <div className="flex flex-col gap-2 mt-auto">
            <label className="font-label-sm text-label-sm text-ink-black uppercase">
              Access Token
            </label>
            <input
              type="password"
              placeholder={localSettings.pexelsKey ? '••••••••••••••••' : 'Enter Pexels key...'}
              value={pexelsKey}
              onChange={(e) => setPexelsKey(e.target.value)}
              className="neo-input rounded-DEFAULT w-full px-4 py-3 font-body-md text-body-md outline-none focus:border-cyber-lime transition-colors font-mono text-ink-black bg-surface"
            />
            <button
              type="button"
              disabled={testingPexels}
              onClick={testPexelsConnection}
              className="btn-secondary rounded-DEFAULT w-full py-3 mt-4 flex justify-center items-center gap-2"
            >
              <span
                className={`material-symbols-outlined text-[18px] ${testingPexels ? 'animate-spin' : ''}`}
              >
                {testingPexels ? 'sync' : 'check_circle'}
              </span>
              <span className="font-label-sm text-label-sm uppercase">Verify Connection</span>
            </button>
          </div>
        </div>

        {/* Tile 3: Performance Tuning (Span 7) */}
        <div className="bento-card col-span-1 md:col-span-7 p-6 flex flex-col gap-8">
          <h3 className="font-title-md text-title-md uppercase flex items-center gap-2 text-ink-black">
            <span className="material-symbols-outlined text-ink-black">speed</span>
            Performance Tuning
          </h3>

          {/* Slider 1: Max Concurrent Downloads */}
          <div className="flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <label className="font-label-sm text-label-sm text-ink-black uppercase">
                Max Concurrent Downloads
              </label>
              <span className="font-mono text-electric-purple font-bold">
                {localSettings.maxConcurrentDownloads}
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              value={localSettings.maxConcurrentDownloads}
              onChange={(e) =>
                setLocalSettings((prev) => {
                  if (!prev) return null
                  return {
                    ...prev,
                    maxConcurrentDownloads: Number(e.target.value)
                  }
                })
              }
              className="w-full h-2 bg-surface-container-high rounded-full appearance-none cursor-pointer accent-electric-purple brutal-border"
            />
          </div>

          {/* Slider 2: Max Agent Loop Turns */}
          <div className="flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <label className="font-label-sm text-label-sm text-ink-black uppercase">
                Max Agent Loop Turns
              </label>
              <span className="font-mono text-electric-purple font-bold">
                {localSettings.maxAgentIterations}
              </span>
            </div>
            <input
              type="range"
              min="5"
              max="50"
              step="5"
              value={localSettings.maxAgentIterations}
              onChange={(e) =>
                setLocalSettings((prev) => {
                  if (!prev) return null
                  return {
                    ...prev,
                    maxAgentIterations: Number(e.target.value)
                  }
                })
              }
              className="w-full h-2 bg-surface-container-high rounded-full appearance-none cursor-pointer accent-electric-purple brutal-border"
            />
          </div>

          {/* Slider 3: Request Timeout (Secs) */}
          <div className="flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <label className="font-label-sm text-label-sm text-ink-black uppercase">
                Request Timeout (Secs)
              </label>
              <span className="font-mono text-electric-purple font-bold">
                {localSettings.requestTimeoutSeconds}
              </span>
            </div>
            <input
              type="range"
              min="10"
              max="180"
              step="5"
              value={localSettings.requestTimeoutSeconds}
              onChange={(e) =>
                setLocalSettings((prev) => {
                  if (!prev) return null
                  return {
                    ...prev,
                    requestTimeoutSeconds: Number(e.target.value)
                  }
                })
              }
              className="w-full h-2 bg-surface-container-high rounded-full appearance-none cursor-pointer accent-electric-purple brutal-border"
            />
          </div>
        </div>

        {/* Right Column Stack (Span 5) */}
        <div className="col-span-1 md:col-span-5 flex flex-col gap-gutter">
          {/* Tile 4: Storage */}
          <div className="bento-card p-5 flex flex-col gap-4">
            <h3 className="font-label-sm text-label-sm uppercase flex items-center gap-2 text-risograph-gray">
              <span className="material-symbols-outlined text-[18px]">folder</span>
              Storage Path
            </h3>
            <div className="flex items-center gap-3 neo-input p-2 rounded-DEFAULT bg-surface-container-low">
              <div className="flex-1 overflow-hidden">
                <p className="font-mono text-sm truncate px-2 text-ink-black">
                  {localSettings.downloadFolder}
                </p>
              </div>
              <button
                type="button"
                onClick={handleChooseFolder}
                className="bg-ink-black text-paper-white p-2 rounded-sm hover:bg-electric-purple transition-colors flex items-center justify-center cursor-pointer"
                aria-label="Choose Folder"
              >
                <span className="material-symbols-outlined text-[18px]">edit</span>
              </button>
            </div>
          </div>

          {/* Tile 5: Appearance */}
          <div className="bento-card p-5 flex flex-col gap-4">
            <h3 className="font-label-sm text-label-sm uppercase flex items-center gap-2 text-risograph-gray">
              <span className="material-symbols-outlined text-[18px]">palette</span>
              Appearance
            </h3>
            <div className="relative">
              <select
                value={localSettings.theme || 'flat-black'}
                onChange={async (e) => {
                  const newTheme = e.target.value as 'flat-black' | 'flat-white'
                  setLocalSettings((prev) => {
                    if (!prev) return null
                    return { ...prev, theme: newTheme }
                  })
                  try {
                    await updateSettings({ theme: newTheme })
                  } catch (err) {
                    console.error('Failed to update theme', err)
                  }
                }}
                className="neo-input appearance-none rounded-DEFAULT w-full px-4 py-2 font-body-md text-body-md outline-none focus:border-electric-purple transition-colors cursor-pointer bg-surface text-ink-black"
              >
                <option value="flat-white">Light Mode (Industrial)</option>
                <option value="flat-black">Dark Mode (Cyber)</option>
              </select>
              <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-ink-black">
                expand_more
              </span>
            </div>
          </div>

          {/* Tile 6: Safety Switches */}
          <div className="bento-card p-5 flex flex-col gap-4 flex-1">
            <h3 className="font-label-sm text-label-sm uppercase flex items-center gap-2 text-risograph-gray">
              <span className="material-symbols-outlined text-[18px]">security</span>
              Safety Controls
            </h3>
            <div className="flex flex-col gap-4 mt-2">
              {/* Checkbox 1: skipExplicitQueries */}
              <label className="flex items-center gap-4 cursor-pointer group">
                <div className="relative w-6 h-6 border-2 border-ink-black flex items-center justify-center transition-colors bg-surface text-ink-black group-hover:border-electric-purple shrink-0">
                  <input
                    type="checkbox"
                    checked={localSettings.skipExplicitQueries}
                    onChange={(e) =>
                      setLocalSettings((prev) => {
                        if (!prev) return null
                        return {
                          ...prev,
                          skipExplicitQueries: e.target.checked
                        }
                      })
                    }
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                  />
                  {localSettings.skipExplicitQueries ? (
                    <div className="absolute inset-0 bg-cyber-lime flex items-center justify-center">
                      <span className="material-symbols-outlined text-[20px] text-ink-black font-bold">
                        close
                      </span>
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-col">
                  <span className="font-body-md text-body-md select-none text-ink-black font-bold leading-tight">
                    Skip explicit content
                  </span>
                  <span className="text-[10px] text-risograph-gray select-none">
                    Filter sensitive results
                  </span>
                </div>
              </label>

              {/* Checkbox 2: avoidPeopleAndFaces */}
              <label className="flex items-center gap-4 cursor-pointer group">
                <div className="relative w-6 h-6 border-2 border-ink-black flex items-center justify-center transition-colors bg-surface text-ink-black group-hover:border-electric-purple shrink-0">
                  <input
                    type="checkbox"
                    checked={localSettings.avoidPeopleAndFaces}
                    onChange={(e) =>
                      setLocalSettings((prev) => {
                        if (!prev) return null
                        return {
                          ...prev,
                          avoidPeopleAndFaces: e.target.checked
                        }
                      })
                    }
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                  />
                  {localSettings.avoidPeopleAndFaces ? (
                    <div className="absolute inset-0 bg-cyber-lime flex items-center justify-center">
                      <span className="material-symbols-outlined text-[20px] text-ink-black font-bold">
                        close
                      </span>
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-col">
                  <span className="font-body-md text-body-md select-none text-ink-black font-bold leading-tight">
                    Avoid people &amp; faces
                  </span>
                  <span className="text-[10px] text-risograph-gray select-none">
                    For abstract stock requests
                  </span>
                </div>
              </label>

              {/* Checkbox 3: requireApprovalBeforeDownload */}
              <label className="flex items-center gap-4 cursor-pointer group">
                <div className="relative w-6 h-6 border-2 border-ink-black flex items-center justify-center transition-colors bg-surface text-ink-black group-hover:border-electric-purple shrink-0">
                  <input
                    type="checkbox"
                    checked={localSettings.requireApprovalBeforeDownload}
                    onChange={(e) =>
                      setLocalSettings((prev) => {
                        if (!prev) return null
                        return {
                          ...prev,
                          requireApprovalBeforeDownload: e.target.checked
                        }
                      })
                    }
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                  />
                  {localSettings.requireApprovalBeforeDownload ? (
                    <div className="absolute inset-0 bg-cyber-lime flex items-center justify-center">
                      <span className="material-symbols-outlined text-[20px] text-ink-black font-bold">
                        close
                      </span>
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-col">
                  <span className="font-body-md text-body-md select-none text-ink-black font-bold leading-tight">
                    Require approval before download
                  </span>
                  <span className="text-[10px] text-risograph-gray select-none">
                    Pause before downloads
                  </span>
                </div>
              </label>

              {/* Checkbox 4: hideEstimatedCost */}
              <label className="flex items-center gap-4 cursor-pointer group">
                <div className="relative w-6 h-6 border-2 border-ink-black flex items-center justify-center transition-colors bg-surface text-ink-black group-hover:border-electric-purple shrink-0">
                  <input
                    type="checkbox"
                    checked={localSettings.hideEstimatedCost || false}
                    onChange={(e) =>
                      setLocalSettings((prev) => {
                        if (!prev) return null
                        return {
                          ...prev,
                          hideEstimatedCost: e.target.checked
                        }
                      })
                    }
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                  />
                  {localSettings.hideEstimatedCost ? (
                    <div className="absolute inset-0 bg-cyber-lime flex items-center justify-center">
                      <span className="material-symbols-outlined text-[20px] text-ink-black font-bold">
                        close
                      </span>
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-col">
                  <span className="font-body-md text-body-md select-none text-ink-black font-bold leading-tight">
                    Hide estimated cost
                  </span>
                  <span className="text-[10px] text-risograph-gray select-none">
                    Do not show run costs in UI
                  </span>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Save Action */}
        <div className="col-span-12 flex flex-wrap items-center justify-between gap-4 mt-4 pt-8 border-t-2 border-ink-black border-dashed">
          <button
            type="button"
            onClick={handleResetOnboarding}
            className="btn-secondary rounded-DEFAULT px-6 py-3 flex items-center gap-2"
          >
            <span className="material-symbols-outlined">rotate_left</span>
            <span className="font-label-sm text-label-sm uppercase">Reset Onboarding</span>
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={async () => {
                await api.settings.openAppDataFolder()
              }}
              className="btn-secondary rounded-DEFAULT px-6 py-3 flex items-center gap-2"
            >
              <span className="material-symbols-outlined">folder_open</span>
              <span className="font-label-sm text-label-sm uppercase">Show Sandbox Files</span>
            </button>

            <button
              type="submit"
              disabled={savingSettings}
              className="btn-secondary rounded-DEFAULT px-8 py-3.5 flex items-center gap-2"
            >
              <span className="material-symbols-outlined">save</span>
              <span className="font-title-md text-[18px] uppercase tracking-wider">
                {savingSettings ? 'Saving...' : 'Save Configuration'}
              </span>
            </button>
          </div>
        </div>
      </form>

      <section className="bento-card p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
        <div className="flex gap-4">
          <div className="w-11 h-11 rounded-DEFAULT border-2 border-ink-black bg-surface-container-high flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[22px] text-ink-black">code</span>
          </div>
          <div>
            <h3 className="font-title-md text-[16px] uppercase text-ink-black font-bold tracking-wide">
              Open source on GitHub
            </h3>
            <p className="font-body-md text-sm text-risograph-gray mt-1.5 max-w-xl leading-relaxed">
              StockFinder AI is built in public. Star the repo if it saves you a run, report a bug,
              or suggest a feature — your feedback shapes what ships next.
            </p>
          </div>
        </div>
        <a
          href={GITHUB_REPO_URL}
          target="_blank"
          rel="noreferrer"
          className="btn-secondary rounded-DEFAULT px-6 py-3 flex items-center gap-2 shrink-0 self-start sm:self-center"
        >
          <span className="material-symbols-outlined text-[18px]">open_in_new</span>
          <span className="font-label-sm text-label-sm uppercase">View on GitHub</span>
        </a>
      </section>
    </div>
  )
}
