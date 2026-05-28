import React, { useEffect, useState } from 'react'
import { useAppStore, PublicSettings } from '../lib/store'
import { api } from '../lib/api-client'

// SVGs for the Providers
const OpenAIIcon = (): React.JSX.Element => (
  <svg
    viewBox="-0.17090198558635983 0.482230148717937 41.14235318283891 40.0339509076386"
    className="h-5 w-5 text-primary"
  >
    <title>OpenAI</title>
    <path
      d="M37.532 16.87a9.963 9.963 0 0 0-.856-8.184 10.078 10.078 0 0 0-10.855-4.835A9.964 9.964 0 0 0 18.306.5a10.079 10.079 0 0 0-9.614 6.977 9.967 9.967 0 0 0-6.664 4.834 10.08 10.08 0 0 0 1.24 11.817 9.965 9.965 0 0 0 .856 8.185 10.079 10.079 0 0 0 10.855 4.835 9.965 9.965 0 0 0 7.516 3.35 10.078 10.078 0 0 0 9.617-6.981 9.967 9.967 0 0 0 6.663-4.834 10.079 10.079 0 0 0-1.243-11.813zM22.498 37.886a7.474 7.474 0 0 1-4.799-1.735c.061-.033.168-.091.237-.134l7.964-4.6a1.294 1.294 0 0 0 .655-1.134V19.054l3.366 1.944a.12.12 0 0 1 .066.092v9.299a7.505 7.505 0 0 1-7.49 7.496zM6.392 31.006a7.471 7.471 0 0 1-.894-5.023c.06.036.162.099.237.141l7.964 4.6a1.297 1.297 0 0 0 1.308 0l9.724-5.614v3.888a.12.12 0 0 1-.048.103l-8.051 4.649a7.504 7.504 0 0 1-10.24-2.744zM4.297 13.62a7.469 7.469 0 0 1 3.903-3.287c0 .068-.004.19-.004.274v9.201a1.294 1.294 0 0 0 .654 1.132l9.723 5.614-3.366 1.944a.12.12 0 0 1-.114.01L7.04 23.856a7.504 7.504 0 0 1-2.743-10.237zm27.658 6.437l-9.724-5.615 3.367-1.943a.121.121 0 0 1 .113-.01l8.052 4.648a7.498 7.498 0 0 1-1.158 13.528v-9.476a1.293 1.293 0 0 0-.65-1.132zm3.35-5.043c-.059-.037-.162-.099-.236-.141l-7.965-4.6a1.298 1.298 0 0 0-1.308 0l-9.723 5.614v-3.888a.12.12 0 0 1 .048-.103l8.05-4.645a7.497 7.497 0 0 1 11.135 7.763zm-21.063 6.929l-3.367-1.944a.12.12 0 0 1-.065-.092v-9.299a7.497 7.497 0 0 1 12.293-5.756 6.94 6.94 0 0 0-.236.134l-7.965 4.6a1.294 1.294 0 0 0-.654 1.132l-.006 11.225zm1.829-3.943l4.33-2.501 4.332 2.5v5l-4.331 2.5-4.331-2.5V18z"
      fill="currentColor"
    ></path>
  </svg>
)

const GeminiIcon = (): React.JSX.Element => (
  <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#3186FF] flex-shrink-0">
    <title>Gemini</title>
    <path
      d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z"
      fill="#3186FF"
    ></path>
    <path
      d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z"
      fill="url(#lobe-icons-gemini-0-_R_0_)"
    ></path>
    <path
      d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z"
      fill="url(#lobe-icons-gemini-1-_R_0_)"
    ></path>
    <path
      d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z"
      fill="url(#lobe-icons-gemini-2-_R_0_)"
    ></path>
  </svg>
)

const OpenRouterIcon = (): React.JSX.Element => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    fillRule="evenodd"
    className="h-5 w-5 text-on-surface-variant flex-shrink-0"
  >
    <title>OpenRouter</title>
    <path d="M16.804 1.957l7.22 4.105v.087L16.73 10.21l.017-2.117-.821-.03c-1.059-.028-1.611.002-2.268.11-1.064.175-2.038.577-3.147 1.352L8.345 11.03c-.284.195-.495.336-.68.455l-.515.322-.397.234.385.23.53.338c.476.314 1.17.796 2.701 1.866 1.11.775 2.083 1.177 3.147 1.352l.3.045c.694.091 1.375.094 2.825.033l.022-2.159 7.22 4.105v.087L16.589 22l.014-1.862-.635.022c-1.386.042-2.137.002-3.138-.162-1.694-.28-3.26-.926-4.881-2.059l-2.158-1.5a21.997 21.997 0 00-.755-.498l-.467-.28a55.927 55.927 0 00-.76-.43C2.908 14.73.563 14.116 0 14.116V9.888l.14.004c.564-.007 2.91-.622 3.809-1.124l1.016-.58.438-.274c.428-.28 1.072-.726 2.686-1.853 1.621-1.133 3.186-1.78 4.881-2.059 1.152-.19 1.974-.213 3.814-.138l.02-1.907z"></path>
  </svg>
)

export default function SettingsView(): React.JSX.Element {
  const { settings, loadSettings, updateSettings } = useAppStore()

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
        <span className="material-symbols-outlined text-[48px] text-primary animate-spin">
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
    if (
      confirm(
        'Are you sure you want to reset onboarding? This will route you back to the initial setup wizard.'
      )
    ) {
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
    <div className="w-full space-y-6 pb-12 animate-fade-in-up">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-extrabold text-on-surface mb-1">Settings</h2>
          <p className="text-sm font-medium text-on-surface-variant">
            Configure generation parameters, API keys, and safety controls.
          </p>
        </div>
      </header>

      <form onSubmit={handleSave} className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left Side: Keys & Providers */}
        <section className="glass-panel p-6 xl:col-span-2 flex flex-col gap-6 rounded-2xl">
          <div className="border-b border-black/[0.05] pb-3">
            <h3 className="font-semibold text-sm text-on-surface flex items-center gap-2.5">
              <span className="material-symbols-outlined text-primary text-[20px]">neurology</span>
              AI Provider Configuration
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <label className="font-mono text-[10px] text-on-surface-variant uppercase tracking-wider pl-0.5">
                Provider
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center pointer-events-none">
                  {localSettings.llmProvider === 'openai' ? (
                    <OpenAIIcon />
                  ) : localSettings.llmProvider === 'gemini' ? (
                    <GeminiIcon />
                  ) : (
                    <OpenRouterIcon />
                  )}
                </span>
                <select
                  value={localSettings.llmProvider}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    handleProviderChange(e.target.value as 'openai' | 'gemini' | 'openrouter')
                  }
                  className="w-full glass-input rounded-lg pl-10 pr-10 py-2.5 text-sm font-semibold cursor-pointer appearance-none"
                >
                  <option value="openai">OpenAI</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="openrouter">OpenRouter</option>
                </select>
                <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-outline">
                  expand_more
                </span>
              </div>

              {/* Provider Quick Click Tabs */}
              <div className="flex gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => handleProviderChange('openai')}
                  className={`flex-grow py-2.5 rounded-lg border-2 flex items-center justify-center transition-all ${
                    localSettings.llmProvider === 'openai'
                      ? 'border-primary bg-white/70 shadow-sm'
                      : 'border-white/40 bg-white/30 hover:bg-white/50'
                  }`}
                >
                  <OpenAIIcon />
                </button>
                <button
                  type="button"
                  onClick={() => handleProviderChange('gemini')}
                  className={`flex-grow py-2.5 rounded-lg border-2 flex items-center justify-center transition-all ${
                    localSettings.llmProvider === 'gemini'
                      ? 'border-primary bg-white/70 shadow-sm'
                      : 'border-white/40 bg-white/30 hover:bg-white/50'
                  }`}
                >
                  <GeminiIcon />
                </button>
                <button
                  type="button"
                  onClick={() => handleProviderChange('openrouter')}
                  className={`flex-grow py-2.5 rounded-lg border-2 flex items-center justify-center transition-all ${
                    localSettings.llmProvider === 'openrouter'
                      ? 'border-primary bg-white/70 shadow-sm'
                      : 'border-white/40 bg-white/30 hover:bg-white/50'
                  }`}
                >
                  <OpenRouterIcon />
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="font-mono text-[10px] text-on-surface-variant uppercase tracking-wider pl-0.5">
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
                className="w-full glass-input rounded-lg px-4 py-2.5 font-mono text-xs text-on-surface font-semibold"
              />
            </div>

            <div className="flex flex-col gap-2 md:col-span-2">
              <label className="font-mono text-[10px] text-on-surface-variant uppercase tracking-wider pl-0.5">
                API Key for {localSettings.llmProvider.toUpperCase()}
              </label>
              <div className="flex gap-3">
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
                  className="w-full glass-input rounded-lg px-4 py-2.5 font-mono text-xs text-on-surface"
                />
                <button
                  type="button"
                  disabled={testingLlm}
                  onClick={testLlmConnection}
                  className="btn-interactive px-5 bg-white/80 border border-outline-variant hover:bg-white text-on-surface rounded-lg font-semibold text-xs flex items-center justify-center gap-1.5 shrink-0 shadow-sm"
                >
                  <span
                    className={`material-symbols-outlined text-[16px] ${
                      testingLlm ? 'animate-spin' : ''
                    }`}
                  >
                    {testingLlm ? 'sync' : 'network_check'}
                  </span>
                  Test Key
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Right Side: Pexels integration */}
        <section className="glass-panel p-6 xl:col-span-1 flex flex-col gap-6 rounded-2xl">
          <div className="border-b border-black/[0.05] pb-3">
            <h3 className="font-semibold text-sm text-on-surface flex items-center gap-2.5">
              <span className="material-symbols-outlined text-secondary text-[20px]">image</span>
              Pexels Integration
            </h3>
          </div>

          <div className="flex flex-col gap-2 flex-grow justify-center">
            <label className="font-mono text-[10px] text-on-surface-variant uppercase tracking-wider pl-0.5">
              Pexels API Key
            </label>
            <input
              type="password"
              placeholder={localSettings.pexelsKey ? '••••••••••••••••' : 'Enter Pexels key...'}
              value={pexelsKey}
              onChange={(e) => setPexelsKey(e.target.value)}
              className="w-full glass-input rounded-lg px-4 py-2.5 font-mono text-xs text-on-surface mb-2"
            />
            <button
              type="button"
              disabled={testingPexels}
              onClick={testPexelsConnection}
              className="btn-interactive w-full py-3 bg-white/80 border border-outline-variant hover:bg-white text-on-surface rounded-lg font-semibold text-xs flex items-center justify-center gap-1.5 shadow-sm"
            >
              <span
                className={`material-symbols-outlined text-[16px] ${
                  testingPexels ? 'animate-spin' : ''
                }`}
              >
                {testingPexels ? 'sync' : 'verified'}
              </span>
              Test Key
            </button>
          </div>
        </section>

        {/* Performance / Tuning Loop */}
        <section className="glass-panel p-6 xl:col-span-2 flex flex-col gap-6 rounded-2xl">
          <div className="border-b border-black/[0.05] pb-3">
            <h3 className="font-semibold text-sm text-on-surface flex items-center gap-2.5">
              <span className="material-symbols-outlined text-tertiary text-[20px]">speed</span>
              Performance Tuning
            </h3>
          </div>

          <div className="space-y-6">
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-end mb-1">
                <label className="font-mono text-[10px] text-on-surface-variant uppercase tracking-wider pl-0.5">
                  Max Concurrent Downloads
                </label>
                <span className="font-mono text-xs font-semibold text-primary bg-primary-container/10 px-2 py-0.5 rounded">
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
                className="w-full accent-primary h-1.5 bg-surface-container-highest rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-[10px] font-mono text-outline">
                <span>1</span>
                <span>10</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-end mb-1">
                <label className="font-mono text-[10px] text-on-surface-variant uppercase tracking-wider pl-0.5">
                  Max Agent Loop Turns
                </label>
                <span className="font-mono text-xs font-semibold text-primary bg-primary-container/10 px-2 py-0.5 rounded">
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
                className="w-full accent-primary h-1.5 bg-surface-container-highest rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-[10px] font-mono text-outline">
                <span>5</span>
                <span>50</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-end mb-1">
                <label className="font-mono text-[10px] text-on-surface-variant uppercase tracking-wider pl-0.5">
                  Request Timeout (seconds)
                </label>
                <span className="font-mono text-xs font-semibold text-primary bg-primary-container/10 px-2 py-0.5 rounded">
                  {localSettings.requestTimeoutSeconds}s
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
                className="w-full accent-primary h-1.5 bg-surface-container-highest rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-[10px] font-mono text-outline">
                <span>10s</span>
                <span>180s</span>
              </div>
            </div>
          </div>
        </section>

        {/* Side Panel Toggles */}
        <div className="flex flex-col gap-6 xl:col-span-1">
          {/* Storage config */}
          <section className="glass-panel p-6 flex flex-col gap-4 rounded-2xl">
            <div className="border-b border-black/[0.05] pb-3">
              <h3 className="font-semibold text-sm text-on-surface flex items-center gap-2.5">
                <span className="material-symbols-outlined text-primary text-[20px]">
                  folder_open
                </span>
                Storage
              </h3>
            </div>
            <div className="flex flex-col gap-2">
              <label className="font-mono text-[10px] text-on-surface-variant uppercase tracking-wider pl-0.5">
                Download Folder
              </label>
              <div className="bg-white/50 border border-outline-variant/40 rounded-lg p-3 flex items-center justify-between group hover:border-primary/50 transition-colors">
                <span className="font-mono text-xs text-on-surface truncate pr-4 max-w-[170px]">
                  {localSettings.downloadFolder}
                </span>
                <button
                  type="button"
                  onClick={handleChooseFolder}
                  className="text-primary hover:text-primary-container transition-colors shrink-0"
                  aria-label="Choose Folder"
                >
                  <span className="material-symbols-outlined text-[20px]">edit_square</span>
                </button>
              </div>
            </div>
          </section>

          {/* Safety Switches */}
          <section className="glass-panel p-6 flex flex-col gap-5 flex-1 rounded-2xl">
            <div className="border-b border-black/[0.05] pb-3">
              <h3 className="font-semibold text-sm text-on-surface flex items-center gap-2.5">
                <span className="material-symbols-outlined text-error text-[20px]">gpp_maybe</span>
                Safety Switches
              </h3>
            </div>

            <div className="flex flex-col gap-4">
              <label className="flex items-center justify-between cursor-pointer group">
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-on-surface group-hover:text-primary transition-colors">
                    Skip explicit content
                  </span>
                  <span className="text-[10px] text-outline font-medium">
                    Filter sensitive results
                  </span>
                </div>
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
                  className="rounded text-primary border-outline-variant/60 focus:ring-primary w-4.5 h-4.5 cursor-pointer bg-white"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer group">
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-on-surface group-hover:text-primary transition-colors">
                    Avoid people &amp; faces
                  </span>
                  <span className="text-[10px] text-outline font-medium">
                    For abstract stock requests
                  </span>
                </div>
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
                  className="rounded text-primary border-outline-variant/60 focus:ring-primary w-4.5 h-4.5 cursor-pointer bg-white"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer group">
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-on-surface group-hover:text-primary transition-colors">
                    Require approval
                  </span>
                  <span className="text-[10px] text-outline font-medium">
                    Pause before downloads
                  </span>
                </div>
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
                  className="rounded text-primary border-outline-variant/60 focus:ring-primary w-4.5 h-4.5 cursor-pointer bg-white"
                />
              </label>
            </div>
          </section>
        </div>
      </form>

      {/* Diagnostics / Connection Alert Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {saveResult && (
          <div
            className={`p-4 rounded-xl flex items-start gap-3 border ${
              saveResult.success
                ? 'bg-secondary-container/20 border-secondary/30 text-secondary'
                : 'bg-error-container/20 border-error/30 text-[#93000a]'
            }`}
          >
            <span className="material-symbols-outlined text-[20px] mt-0.5 shrink-0">
              {saveResult.success ? 'check_circle' : 'error'}
            </span>
            <div>
              <div className="font-semibold text-xs">Settings Status</div>
              <div className="text-[11px] mt-0.5 leading-normal opacity-90">
                {saveResult.message}
              </div>
            </div>
          </div>
        )}

        {llmTestResult && (
          <div
            className={`p-4 rounded-xl flex items-start gap-3 border ${
              llmTestResult.success
                ? 'bg-secondary-container/20 border-secondary/30 text-secondary'
                : 'bg-error-container/20 border-error/30 text-[#93000a]'
            }`}
          >
            <span className="material-symbols-outlined text-[20px] mt-0.5 shrink-0">
              {llmTestResult.success ? 'check_circle' : 'error'}
            </span>
            <div>
              <div className="font-semibold text-xs">LLM Connection Test</div>
              <div className="text-[11px] mt-0.5 leading-normal opacity-90">
                {llmTestResult.message}
              </div>
            </div>
          </div>
        )}

        {pexelsTestResult && (
          <div
            className={`p-4 rounded-xl flex items-start gap-3 border ${
              pexelsTestResult.success
                ? 'bg-secondary-container/20 border-secondary/30 text-secondary'
                : 'bg-error-container/20 border-error/30 text-[#93000a]'
            }`}
          >
            <span className="material-symbols-outlined text-[20px] mt-0.5 shrink-0">
              {pexelsTestResult.success ? 'check_circle' : 'error'}
            </span>
            <div>
              <div className="font-semibold text-xs">Pexels Connection Test</div>
              <div className="text-[11px] mt-0.5 leading-normal opacity-90">
                {pexelsTestResult.message}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Save Action Area */}
      <div className="flex items-center justify-between border-t border-black/[0.05] pt-5">
        <button
          type="button"
          onClick={handleResetOnboarding}
          className="btn-interactive px-5 py-3 rounded-lg border border-outline-variant bg-white/50 hover:bg-white text-on-surface font-semibold text-xs flex items-center justify-center gap-1.5 shadow-sm"
        >
          <span className="material-symbols-outlined text-[18px] text-outline">rotate_left</span>
          Reset Onboarding Wizard
        </button>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={async () => {
              await api.settings.openAppDataFolder()
            }}
            className="btn-interactive px-5 py-3 rounded-lg border border-outline-variant bg-white/50 hover:bg-white text-on-surface font-semibold text-xs flex items-center justify-center gap-1.5 shadow-sm"
          >
            Show Sandbox Files
          </button>
          <button
            type="button"
            disabled={savingSettings}
            onClick={handleSave}
            className="tactile-button px-7 py-3 rounded-lg text-xs font-semibold shadow-md"
          >
            {savingSettings ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  )
}
