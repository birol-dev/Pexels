import React, { useState } from 'react'
import { useAppStore, PublicSettings } from '../lib/store'
import { api } from '../lib/api-client'

// SVGs for the Providers
const OpenAIIcon = (): React.JSX.Element => (
  <svg
    viewBox="-0.17090198558635983 0.482230148717937 41.14235318283891 40.0339509076386"
    className="h-9 w-9 text-primary"
  >
    <title>OpenAI</title>
    <path
      d="M37.532 16.87a9.963 9.963 0 0 0-.856-8.184 10.078 10.078 0 0 0-10.855-4.835A9.964 9.964 0 0 0 18.306.5a10.079 10.079 0 0 0-9.614 6.977 9.967 9.967 0 0 0-6.664 4.834 10.08 10.08 0 0 0 1.24 11.817 9.965 9.965 0 0 0 .856 8.185 10.079 10.079 0 0 0 10.855 4.835 9.965 9.965 0 0 0 7.516 3.35 10.078 10.078 0 0 0 9.617-6.981 9.967 9.967 0 0 0 6.663-4.834 10.079 10.079 0 0 0-1.243-11.813zM22.498 37.886a7.474 7.474 0 0 1-4.799-1.735c.061-.033.168-.091.237-.134l7.964-4.6a1.294 1.294 0 0 0 .655-1.134V19.054l3.366 1.944a.12.12 0 0 1 .066.092v9.299a7.505 7.505 0 0 1-7.49 7.496zM6.392 31.006a7.471 7.471 0 0 1-.894-5.023c.06.036.162.099.237.141l7.964 4.6a1.297 1.297 0 0 0 1.308 0l9.724-5.614v3.888a.12.12 0 0 1-.048.103l-8.051 4.649a7.504 7.504 0 0 1-10.24-2.744zM4.297 13.62a7.469 7.469 0 0 1 3.903-3.287c0 .068-.004.19-.004.274v9.201a1.294 1.294 0 0 0 .654 1.132l9.723 5.614-3.366 1.944a.12.12 0 0 1-.114.01L7.04 23.856a7.504 7.504 0 0 1-2.743-10.237zm27.658 6.437l-9.724-5.615 3.367-1.943a.121.121 0 0 1 .113-.01l8.052 4.648a7.498 7.498 0 0 1-1.158 13.528v-9.476a1.293 1.293 0 0 0-.65-1.132zm3.35-5.043c-.059-.037-.162-.099-.236-.141l-7.965-4.6a1.298 1.298 0 0 0-1.308 0l-9.723 5.614v-3.888a.12.12 0 0 1 .048-.103l8.05-4.645a7.497 7.497 0 0 1 11.135 7.763zm-21.063 6.929l-3.367-1.944a.12.12 0 0 1-.065-.092v-9.299a7.497 7.497 0 0 1 12.293-5.756 6.94 6.94 0 0 0-.236.134l-7.965 4.6a1.294 1.294 0 0 0-.654 1.132l-.006 11.225zm1.829-3.943l4.33-2.501 4.332 2.5v5l-4.331 2.5-4.331-2.5V18z"
      fill="currentColor"
    ></path>
  </svg>
)

const GeminiIcon = (): React.JSX.Element => (
  <svg viewBox="0 0 24 24" className="h-9 w-9 text-[#3186FF] shrink-0">
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
    <defs>
      <linearGradient
        id="lobe-icons-gemini-0-_R_0_"
        x1="7"
        y1="15.5"
        x2="11"
        y2="12"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#08B962"></stop>
        <stop offset="1" stopColor="#08B962" stopOpacity="0"></stop>
      </linearGradient>
      <linearGradient
        id="lobe-icons-gemini-1-_R_0_"
        x1="8"
        y1="5.5"
        x2="11.5"
        y2="11"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#F94543"></stop>
        <stop offset="1" stopColor="#F94543" stopOpacity="0"></stop>
      </linearGradient>
      <linearGradient
        id="lobe-icons-gemini-2-_R_0_"
        x1="3.5"
        y1="13.5"
        x2="17.5"
        y2="12"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#FABC12"></stop>
        <stop offset=".46" stopColor="#FABC12" stopOpacity="0"></stop>
      </linearGradient>
    </defs>
  </svg>
)

const OpenRouterIcon = (): React.JSX.Element => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    fillRule="evenodd"
    className="h-9 w-9 text-on-surface-variant shrink-0"
  >
    <title>OpenRouter</title>
    <path d="M16.804 1.957l7.22 4.105v.087L16.73 10.21l.017-2.117-.821-.03c-1.059-.028-1.611.002-2.268.11-1.064.175-2.038.577-3.147 1.352L8.345 11.03c-.284.195-.495.336-.68.455l-.515.322-.397.234.385.23.53.338c.476.314 1.17.796 2.701 1.866 1.11.775 2.083 1.177 3.147 1.352l.3.045c.694.091 1.375.094 2.825.033l.022-2.159 7.22 4.105v.087L16.589 22l.014-1.862-.635.022c-1.386.042-2.137.002-3.138-.162-1.694-.28-3.26-.926-4.881-2.059l-2.158-1.5a21.997 21.997 0 00-.755-.498l-.467-.28a55.927 55.927 0 00-.76-.43C2.908 14.73.563 14.116 0 14.116V9.888l.14.004c.564-.007 2.91-.622 3.809-1.124l1.016-.58.438-.274c.428-.28 1.072-.726 2.686-1.853 1.621-1.133 3.186-1.78 4.881-2.059 1.152-.19 1.974-.213 3.814-.138l.02-1.907z"></path>
  </svg>
)

export default function OnboardingView(): React.JSX.Element {
  const { updateSettings, settings } = useAppStore()
  const [step, setStep] = useState(1)

  // Step 2 State (AI Configuration)
  const [llmProvider, setLlmProvider] = useState<'openai' | 'gemini' | 'openrouter'>('openai')
  const [openaiKey, setOpenaiKey] = useState('')
  const [geminiKey, setGeminiKey] = useState('')
  const [openrouterKey, setOpenrouterKey] = useState('')
  const [modelId, setModelId] = useState('gpt-4o')

  const [testingLlm, setTestingLlm] = useState(false)
  const [llmTestResult, setLlmTestResult] = useState<{ success: boolean; message: string } | null>(
    null
  )

  // Step 3 State (Pexels)
  const [pexelsKey, setPexelsKey] = useState('')
  const [testingPexels, setTestingPexels] = useState(false)
  const [pexelsTestResult, setPexelsTestResult] = useState<{
    success: boolean
    message: string
  } | null>(null)

  // Step 4 State (Storage folder)
  const [downloadFolder, setDownloadFolder] = useState(settings?.downloadFolder || '')

  const handleProviderSelect = (prov: 'openai' | 'gemini' | 'openrouter'): void => {
    setLlmProvider(prov)
    const defaults = {
      openai: 'gpt-4o',
      gemini: 'gemini-1.5-pro-latest',
      openrouter: 'anthropic/claude-3-opus'
    }
    setModelId(defaults[prov])
    setLlmTestResult(null)
  }

  const testLlmConnection = async (): Promise<void> => {
    setTestingLlm(true)
    setLlmTestResult(null)
    const activeKey =
      llmProvider === 'openai' ? openaiKey : llmProvider === 'gemini' ? geminiKey : openrouterKey
    try {
      const result = await api.settings.testProvider({
        provider: llmProvider,
        apiKey: activeKey || 'CURRENT_KEY_ON_DISK',
        modelId
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
      setPexelsTestResult({ success: false, message: msg || 'Pexels test failed.' })
    } finally {
      setTestingPexels(false)
    }
  }

  const handleChooseFolder = async (): Promise<void> => {
    const folder = await api.settings.chooseDownloadFolder()
    if (folder) {
      setDownloadFolder(folder)
    }
  }

  const handleFinish = async (): Promise<void> => {
    const updates: Partial<PublicSettings> = {
      llmProvider,
      modelId,
      downloadFolder,
      isOnboarded: true
    }
    if (openaiKey) updates.openaiKey = openaiKey
    if (geminiKey) updates.geminiKey = geminiKey
    if (openrouterKey) updates.openrouterKey = openrouterKey
    if (pexelsKey) updates.pexelsKey = pexelsKey

    await updateSettings(updates)
  }

  const getStepProgressWidth = (): string => {
    return `${(step / 5) * 100}%`
  }

  return (
    <div className="bg-background text-on-surface h-screen w-full overflow-hidden relative flex flex-col items-center justify-center selection:bg-primary-container selection:text-on-primary-container font-sans">
      {/* Atmospheric Background Image */}
      <div className="absolute inset-0 z-0">
        <img
          alt="Background Atmosphere"
          className="w-full h-full object-cover opacity-60 mix-blend-multiply"
          src="https://lh3.googleusercontent.com/aida-public/AB6AXuDnJCxbchQU3jNk52as3YYbJZb4q1YHHUjJWHOD0MTunEy7_cjPh8oqI_nyOIOW512WqYNYL5WQzsbngLwPDNnvMeTQSfRJeZQlLZlT-9WRaeAE4dOZKgjRo2ndIGWqHa9kfr6WdkpVdfK3eJSXT0_SGH361JaiQORn5RuYnxLf933Qq2j3xssc4ChVK0NFhqIzxWI8xtrFkV6uqU57-r_ElKskx50U95H3OAbZe7dXahsLnUtBBrUovJCcXy1DAKw2XMvmCWjGK4U"
        />
      </div>

      {/* Floating Decorative Glass Elements to enhance the "Aero" feel */}
      <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-primary-fixed-dim/30 rounded-full blur-[80px] z-0 pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-secondary-fixed-dim/20 rounded-full blur-[100px] z-0 pointer-events-none"></div>

      {/* Progress Bar (Visible after Step 1) */}
      {step > 1 && (
        <div className="w-full h-1 bg-surface-container-highest absolute top-0 left-0 z-50">
          <div
            className="h-full bg-primary transition-all duration-500 ease-out"
            style={{ width: getStepProgressWidth() }}
          />
        </div>
      )}

      {/* Main Wizard Card */}
      <main className="relative z-10 w-full max-w-2xl mx-6 flex flex-col animate-fade-in-up">
        {step === 1 && (
          <div className="bg-white/55 backdrop-blur-lg border border-white/40 shadow-[0px_20px_40px_rgba(0,0,0,0.05),0px_4px_8px_rgba(0,0,0,0.04)] rounded-2xl p-12 flex flex-col items-center text-center">
            {/* App Branding */}
            <div className="flex items-center gap-3 mb-12">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20 shadow-sm">
                <span className="material-symbols-outlined text-primary text-[24px]">
                  movie_filter
                </span>
              </div>
              <h1 className="font-bold text-lg text-on-surface tracking-tight">StockFinder AI</h1>
            </div>

            {/* Content */}
            <div className="max-w-md mx-auto flex flex-col items-center">
              <span className="font-mono text-[11px] text-primary tracking-widest uppercase mb-4 opacity-80">
                Step 1 of 5
              </span>
              <h2 className="text-3xl font-extrabold text-on-surface mb-6 leading-tight">
                Paste a script. Get stock footage.
              </h2>
              <p className="text-sm font-medium text-on-surface-variant mb-10 leading-relaxed">
                Our AI agent analyzes your script, finds matching media on Pexels, and downloads it
                into organized folders in minutes.
              </p>

              {/* Primary CTA */}
              <button
                onClick={() => setStep(2)}
                className="bg-primary btn-gradient text-white font-semibold text-xs px-8 py-4 rounded-lg shadow-[0_4px_12px_rgba(0,88,188,0.2)] hover:shadow-[0_8px_24px_rgba(0,88,188,0.3)] hover:-translate-y-px transition-all duration-200 flex items-center gap-2 group uppercase tracking-wider"
              >
                Get Started
                <span className="material-symbols-outlined text-[18px] group-hover:translate-x-1 transition-transform">
                  arrow_forward
                </span>
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="bg-white/55 backdrop-blur-lg border border-white/40 shadow-[0px_20px_40px_rgba(0,0,0,0.05),0px_4px_8px_rgba(0,0,0,0.04)] rounded-2xl p-10 flex flex-col gap-6">
            {/* Header */}
            <div className="flex flex-col gap-1 text-center items-center">
              <span className="font-mono text-[11px] text-primary tracking-widest uppercase">
                Step 2 of 5
              </span>
              <h2 className="text-2xl font-bold text-on-surface flex items-center gap-2 mt-1">
                <span className="material-symbols-outlined text-[28px] text-primary">
                  psychology
                </span>
                Connect your AI brain
              </h2>
              <p className="text-xs text-on-surface-variant max-w-lg mt-1">
                Select the Large Language Model provider that will power your script analysis and
                visual prompt generation.
              </p>
            </div>

            {/* Provider Cards Grid */}
            <div className="grid grid-cols-3 gap-4 mt-2">
              <button
                onClick={() => handleProviderSelect('openai')}
                className={`relative flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all hover:bg-white/60 ${
                  llmProvider === 'openai'
                    ? 'border-primary bg-white/90 shadow-[0px_4px_12px_rgba(0,88,188,0.08)]'
                    : 'border-white/40 bg-white/30'
                }`}
              >
                <div className="mb-2">
                  <OpenAIIcon />
                </div>
                <span className="font-semibold text-xs text-on-surface">OpenAI</span>
                {llmProvider === 'openai' && (
                  <div className="absolute top-2 right-2 text-primary">
                    <span className="material-symbols-outlined text-[16px] font-bold">
                      check_circle
                    </span>
                  </div>
                )}
              </button>

              <button
                onClick={() => handleProviderSelect('gemini')}
                className={`relative flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all hover:bg-white/60 ${
                  llmProvider === 'gemini'
                    ? 'border-primary bg-white/90 shadow-[0px_4px_12px_rgba(0,88,188,0.08)]'
                    : 'border-white/40 bg-white/30'
                }`}
              >
                <div className="mb-2">
                  <GeminiIcon />
                </div>
                <span className="font-semibold text-xs text-on-surface">Gemini</span>
                {llmProvider === 'gemini' && (
                  <div className="absolute top-2 right-2 text-primary">
                    <span className="material-symbols-outlined text-[16px] font-bold">
                      check_circle
                    </span>
                  </div>
                )}
              </button>

              <button
                onClick={() => handleProviderSelect('openrouter')}
                className={`relative flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all hover:bg-white/60 ${
                  llmProvider === 'openrouter'
                    ? 'border-primary bg-white/90 shadow-[0px_4px_12px_rgba(0,88,188,0.08)]'
                    : 'border-white/40 bg-white/30'
                }`}
              >
                <div className="mb-2">
                  <OpenRouterIcon />
                </div>
                <span className="font-semibold text-xs text-on-surface">OpenRouter</span>
                {llmProvider === 'openrouter' && (
                  <div className="absolute top-2 right-2 text-primary">
                    <span className="material-symbols-outlined text-[16px] font-bold">
                      check_circle
                    </span>
                  </div>
                )}
              </button>
            </div>

            {/* Provider Configuration */}
            <div className="flex flex-col gap-4 bg-white/30 p-5 rounded-xl border border-white/40 mt-1 shadow-inner">
              <div className="flex flex-col gap-1.5">
                <label className="font-mono text-[10px] text-on-surface-variant uppercase tracking-wider pl-0.5">
                  API Key for {llmProvider.toUpperCase()}
                </label>
                <input
                  type="password"
                  value={
                    llmProvider === 'openai'
                      ? openaiKey
                      : llmProvider === 'gemini'
                        ? geminiKey
                        : openrouterKey
                  }
                  onChange={(e) => {
                    if (llmProvider === 'openai') setOpenaiKey(e.target.value)
                    else if (llmProvider === 'gemini') setGeminiKey(e.target.value)
                    else setOpenrouterKey(e.target.value)
                  }}
                  className="glass-input w-full rounded-lg px-4 py-2.5 font-mono text-xs text-on-surface"
                  placeholder={`Enter your ${llmProvider} API key`}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-mono text-[10px] text-on-surface-variant uppercase tracking-wider pl-0.5">
                  Model ID
                </label>
                <input
                  type="text"
                  value={modelId}
                  onChange={(e) => setModelId(e.target.value)}
                  className="glass-input w-full rounded-lg px-4 py-2.5 font-mono text-xs text-on-surface"
                />
              </div>

              <div className="pt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={testLlmConnection}
                  disabled={testingLlm}
                  className="flex items-center gap-2 px-4 py-2 bg-surface-container-highest border border-outline-variant/30 rounded-lg text-xs font-semibold text-on-surface hover:bg-surface-dim hover:border-outline-variant/50 transition-all shadow-sm group"
                >
                  <span
                    className={`material-symbols-outlined text-[16px] text-outline group-hover:text-primary transition-colors ${
                      testingLlm ? 'animate-spin' : ''
                    }`}
                  >
                    {testingLlm ? 'sync' : 'network_check'}
                  </span>
                  {testingLlm ? 'Testing...' : 'Test Connection'}
                </button>

                {llmTestResult && (
                  <span
                    className={`text-xs font-semibold flex items-center gap-1.5 ${
                      llmTestResult.success ? 'text-secondary' : 'text-error animate-shake'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      {llmTestResult.success ? 'check_circle' : 'error'}
                    </span>
                    {llmTestResult.success ? 'Connected Successfully' : 'Connection Failed'}
                  </span>
                )}
              </div>
            </div>

            {/* Footer Navigation */}
            <div className="flex items-center justify-between mt-4 pt-6 border-t border-white/40">
              <button
                onClick={() => setStep(1)}
                className="btn-interactive font-semibold text-xs text-on-surface-variant hover:text-on-surface px-4 py-2 rounded-lg flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                Back
              </button>

              <div className="flex items-center gap-4">
                <button
                  onClick={() => setStep(3)}
                  className="text-xs text-outline hover:text-primary transition-colors hover:underline"
                >
                  Skip for now
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="tactile-button px-6 py-2.5 rounded-lg text-xs font-semibold flex items-center gap-1.5"
                >
                  Next Step
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="bg-white/55 backdrop-blur-lg border border-white/40 shadow-[0px_20px_40px_rgba(0,0,0,0.05),0px_4px_8px_rgba(0,0,0,0.04)] rounded-2xl p-10 flex flex-col gap-6">
            {/* Header */}
            <div className="flex flex-col gap-1 text-center items-center">
              <span className="font-mono text-[11px] text-primary tracking-widest uppercase">
                Step 3 of 5
              </span>
              <h2 className="text-2xl font-bold text-on-surface mt-1 flex items-center gap-2">
                <span className="material-symbols-outlined text-[28px] text-[#05a081]">
                  photo_library
                </span>
                Connect Pexels
              </h2>
              <p className="text-xs text-on-surface-variant max-w-lg mt-1">
                StockFinder AI uses the Pexels API to search and retrieve high-quality stock b-roll
                footage. Let&apos;s link your Pexels developer key.
              </p>
            </div>

            {/* Pexels Setup form */}
            <div className="flex flex-col gap-6 bg-white/30 rounded-xl p-6 border border-white/40 shadow-inner">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-mono text-[10px] text-on-surface-variant uppercase tracking-wider pl-0.5">
                    Pexels API Key
                  </label>
                  <a
                    href="https://www.pexels.com/api/"
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-[10px] text-primary hover:text-primary-container transition-colors inline-flex items-center gap-1 group"
                  >
                    Get Pexels API Key
                    <span className="material-symbols-outlined text-[12px] group-hover:translate-x-0.5 transition-transform">
                      open_in_new
                    </span>
                  </a>
                </div>
                <input
                  type="password"
                  value={pexelsKey}
                  onChange={(e) => setPexelsKey(e.target.value)}
                  className="glass-input w-full rounded-lg px-4 py-2.5 font-mono text-xs text-on-surface"
                  placeholder="Enter your key starting with '5634...'"
                />
              </div>

              <div className="pt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={testPexelsConnection}
                  disabled={testingPexels}
                  className="flex items-center gap-2 px-4 py-2 bg-surface-container-highest border border-outline-variant/30 rounded-lg text-xs font-semibold text-on-surface hover:bg-surface-dim hover:border-outline-variant/50 transition-all shadow-sm group"
                >
                  <span
                    className={`material-symbols-outlined text-[16px] text-outline group-hover:text-[#05a081] transition-colors ${
                      testingPexels ? 'animate-spin' : ''
                    }`}
                  >
                    {testingPexels ? 'sync' : 'verified'}
                  </span>
                  {testingPexels ? 'Testing...' : 'Test Key'}
                </button>

                {pexelsTestResult && (
                  <span
                    className={`text-xs font-semibold flex items-center gap-1.5 ${
                      pexelsTestResult.success ? 'text-secondary' : 'text-error'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      {pexelsTestResult.success ? 'check_circle' : 'error'}
                    </span>
                    {pexelsTestResult.success ? 'Key Verified' : 'Verification Failed'}
                  </span>
                )}
              </div>

              <div className="flex items-start gap-3 p-4 rounded-lg bg-surface-container-low/50 border border-outline-variant/20">
                <span className="material-symbols-outlined text-primary text-[20px] mt-0.5">
                  info
                </span>
                <p className="text-[11px] text-on-surface-variant leading-relaxed">
                  Your API key is stored locally in your system&apos;s secure keychain. It is
                  strictly used to fetch footage directly from Pexels and is never sent to external
                  servers.
                </p>
              </div>
            </div>

            {/* Footer Navigation */}
            <div className="flex items-center justify-between mt-4 pt-6 border-t border-white/40">
              <button
                onClick={() => setStep(2)}
                className="btn-interactive font-semibold text-xs text-on-surface-variant hover:text-on-surface px-4 py-2 rounded-lg flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                Back
              </button>

              <div className="flex items-center gap-4">
                <button
                  onClick={() => setStep(4)}
                  className="text-xs text-outline hover:text-primary transition-colors hover:underline"
                >
                  Skip for now
                </button>
                <button
                  onClick={() => setStep(4)}
                  className="tactile-button px-6 py-2.5 rounded-lg text-xs font-semibold flex items-center gap-1.5"
                >
                  Next Step
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="bg-white/55 backdrop-blur-lg border border-white/40 shadow-[0px_20px_40px_rgba(0,0,0,0.05),0px_4px_8px_rgba(0,0,0,0.04)] rounded-2xl p-10 flex flex-col gap-6">
            {/* Header */}
            <div className="flex flex-col gap-1 text-center items-center">
              <span className="font-mono text-[11px] text-primary tracking-widest uppercase">
                Step 4 of 5
              </span>
              <h2 className="text-2xl font-bold text-on-surface mt-1 flex items-center gap-2">
                <span className="material-symbols-outlined text-[28px] text-primary">
                  folder_open
                </span>
                Choose asset directory
              </h2>
              <p className="text-xs text-on-surface-variant max-w-lg mt-1">
                Configure the local storage folder where StockFinder AI will download photos,
                videos, and project manifests.
              </p>
            </div>

            {/* Folder Selection Form */}
            <div className="flex flex-col gap-6 bg-white/30 rounded-xl p-6 border border-white/40 shadow-inner">
              <div className="flex flex-col gap-3 text-left">
                <label className="font-mono text-[10px] text-on-surface-variant uppercase tracking-wider pl-0.5">
                  Default Storage Path
                </label>
                <div className="flex flex-col sm:flex-row gap-4 items-stretch w-full">
                  <div
                    onClick={handleChooseFolder}
                    className="grow glass-input rounded-lg flex items-center p-3 gap-3 group relative cursor-pointer hover:bg-white/90"
                  >
                    <span className="material-symbols-outlined text-outline group-hover:text-primary transition-colors">
                      folder
                    </span>
                    <span className="font-mono text-xs text-on-surface truncate pr-6">
                      {downloadFolder || 'Select a path...'}
                    </span>
                  </div>

                  <button
                    onClick={handleChooseFolder}
                    className="tactile-btn-secondary bg-white/60 border border-outline-variant text-primary shadow-[0px_1px_2px_rgba(0,0,0,0.05)] transition-transform duration-200 hover:-translate-y-px hover:bg-white hover:shadow-[0px_2px_4px_rgba(0,0,0,0.08)] rounded-lg text-xs font-semibold px-5 py-3 whitespace-nowrap flex items-center justify-center gap-1.5 shrink-0"
                  >
                    <span className="material-symbols-outlined text-[18px]">create_new_folder</span>
                    Choose Folder
                  </button>
                </div>

                <div className="flex items-center gap-2 text-outline pl-1 mt-1">
                  <span className="material-symbols-outlined text-[16px]">info</span>
                  <span className="text-[10px]">
                    Approximately 2.4GB of free space is recommended.
                  </span>
                </div>
              </div>
            </div>

            {/* Footer Navigation */}
            <div className="flex items-center justify-between mt-4 pt-6 border-t border-white/40">
              <button
                onClick={() => setStep(3)}
                className="btn-interactive font-semibold text-xs text-on-surface-variant hover:text-on-surface px-4 py-2 rounded-lg flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                Back
              </button>

              <div className="flex items-center gap-4">
                <button
                  onClick={() => setStep(5)}
                  className="text-xs text-outline hover:text-primary transition-colors hover:underline"
                >
                  Skip for now
                </button>
                <button
                  onClick={() => setStep(5)}
                  className="tactile-button px-6 py-2.5 rounded-lg text-xs font-semibold flex items-center gap-1.5"
                >
                  Next Step
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="bg-white/55 backdrop-blur-lg border border-white/40 shadow-[0px_20px_40px_rgba(0,0,0,0.05),0px_4px_8px_rgba(0,0,0,0.04)] rounded-2xl p-8 flex flex-col items-center text-center">
            {/* Hero Confetti Graphic */}
            <div className="relative w-28 h-28 mb-6 flex items-center justify-center">
              <div className="absolute inset-0 bg-primary-container opacity-10 rounded-full blur-xl animate-pulse"></div>
              <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-md border border-white/40 animate-float relative z-10">
                <span
                  className="material-symbols-outlined text-[42px] text-primary"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  check_circle
                </span>
              </div>
              <span className="material-symbols-outlined absolute top-2 right-4 text-secondary text-[20px] opacity-60">
                celebration
              </span>
              <span className="material-symbols-outlined absolute bottom-4 left-2 text-tertiary text-[22px] opacity-60">
                flare
              </span>
            </div>

            <h1 className="text-3xl font-extrabold mb-2 text-on-surface">You&apos;re All Set!</h1>
            <p className="text-xs text-on-surface-variant mb-8 max-w-sm">
              StockFinder AI is configured and ready. Here is a summary of your workspace
              parameters:
            </p>

            {/* Config Summary Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full mb-8 max-w-lg text-left">
              {/* AI Brain Card */}
              <div className="glass-card rounded-xl p-4 flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-secondary-fixed/30 shrink-0 flex items-center justify-center border border-secondary-fixed-dim text-secondary">
                  {llmProvider === 'openai' ? (
                    <OpenAIIcon />
                  ) : llmProvider === 'gemini' ? (
                    <GeminiIcon />
                  ) : (
                    <OpenRouterIcon />
                  )}
                </div>
                <div>
                  <h4 className="font-semibold text-xs text-on-surface mb-0.5">AI Provider</h4>
                  <p className="text-[10px] text-on-surface-variant truncate w-[160px]">
                    {llmProvider.toUpperCase()} ({modelId})
                  </p>
                  <span className="inline-flex items-center gap-1 font-mono text-[9px] uppercase text-secondary bg-secondary-container/30 px-1.5 py-0.5 rounded border border-secondary-container mt-1.5">
                    <span className="material-symbols-outlined text-[10px]">check</span> Configured
                  </span>
                </div>
              </div>

              {/* Media Card */}
              <div className="glass-card rounded-xl p-4 flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-secondary-fixed/30 shrink-0 flex items-center justify-center border border-secondary-fixed-dim text-secondary">
                  <span className="material-symbols-outlined text-[18px]">photo_library</span>
                </div>
                <div>
                  <h4 className="font-semibold text-xs text-on-surface mb-0.5">Media Source</h4>
                  <p className="text-[10px] text-on-surface-variant truncate w-[160px]">
                    Pexels API Link
                  </p>
                  <span className="inline-flex items-center gap-1 font-mono text-[9px] uppercase text-secondary bg-secondary-container/30 px-1.5 py-0.5 rounded border border-secondary-container mt-1.5">
                    <span className="material-symbols-outlined text-[10px]">check</span> Configured
                  </span>
                </div>
              </div>

              {/* Local Folder Card */}
              <div className="glass-card rounded-xl p-4 flex items-start gap-3 sm:col-span-2">
                <div className="w-9 h-9 rounded-full bg-secondary-fixed/30 shrink-0 flex items-center justify-center border border-secondary-fixed-dim text-secondary">
                  <span className="material-symbols-outlined text-[18px]">folder</span>
                </div>
                <div className="grow overflow-hidden">
                  <h4 className="font-semibold text-xs text-on-surface mb-0.5">
                    Local Export Directory
                  </h4>
                  <p className="text-[10px] text-on-surface-variant truncate font-mono">
                    {downloadFolder || 'System default directory'}
                  </p>
                  <span className="inline-flex items-center gap-1 font-mono text-[9px] uppercase text-secondary bg-secondary-container/30 px-1.5 py-0.5 rounded border border-secondary-container mt-1.5">
                    <span className="material-symbols-outlined text-[10px]">check</span> Ready
                  </span>
                </div>
              </div>
            </div>

            {/* Launch Dashboard Button */}
            <button
              onClick={handleFinish}
              className="btn-gradient tactile-button text-white font-semibold text-xs px-8 py-4 rounded-lg shadow-md hover:shadow-lg flex items-center gap-2 w-full sm:w-auto mt-2 group uppercase tracking-wider"
            >
              Start Using StockFinder
              <span className="material-symbols-outlined text-[18px] group-hover:translate-x-1 transition-transform">
                arrow_forward
              </span>
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
