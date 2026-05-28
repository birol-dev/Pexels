import React, { useEffect } from 'react'
import { useAppStore } from './lib/store'
import ScriptInputView from './routes/script-input'
import AgentRunView from './routes/agent-run'
import DownloadedStuffView from './routes/downloaded-stuff'
import SettingsView from './routes/settings'
import OnboardingView from './routes/onboarding' // Onboarding Wizard

export default function App(): React.JSX.Element {
  const { currentRoute, navigate, activeJobId, settings, loadSettings } = useAppStore()

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  if (!settings) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f0f2f9]">
        <div className="flex flex-col items-center gap-3">
          <span className="material-symbols-outlined text-[48px] text-primary animate-spin">
            sync
          </span>
          <span className="text-sm font-medium text-outline">Loading settings...</span>
        </div>
      </div>
    )
  }

  // Redirect to Onboarding if not completed
  if (!settings.isOnboarded) {
    return <OnboardingView />
  }

  const renderActiveView = (): React.JSX.Element => {
    switch (currentRoute) {
      case 'input':
        return <ScriptInputView />
      case 'run':
        return <AgentRunView />
      case 'stuff':
        return <DownloadedStuffView />
      case 'settings':
        return <SettingsView />
      default:
        return <ScriptInputView />
    }
  }

  return (
    <div className="min-h-screen bg-[#f0f2f9] text-on-surface flex font-sans antialiased overflow-x-hidden relative">
      {/* Luminous Natural Aero backgrounds */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-primary-fixed-dim/20 blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] rounded-full bg-secondary-container/30 blur-[120px]" />
      </div>

      {/* Sidebar Navigation */}
      <aside className="w-64 border-r border-white/40 bg-white/55 backdrop-blur-md flex flex-col justify-between shrink-0 select-none z-10 relative">
        <div className="p-6">
          {/* Logo Brand */}
          <div className="flex items-center space-x-3 mb-10">
            <div className="w-10 h-10 rounded-lg bg-linear-to-br from-primary to-primary-container shadow-inner flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-white text-[24px]">eco</span>
            </div>
            <div>
              <span className="font-bold text-sm tracking-tight text-on-surface block">
                StockFinder AI
              </span>
              <span className="text-[10px] text-outline block font-mono">Natural Aero Engine</span>
            </div>
          </div>

          {/* Nav List */}
          <nav className="space-y-1.5">
            <button
              onClick={() => navigate('input')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                currentRoute === 'input'
                  ? 'bg-white/45 text-primary shadow-sm border-l-2 border-primary font-bold scale-[0.98]'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-white/30'
              }`}
            >
              <span
                className="material-symbols-outlined text-[20px]"
                style={{
                  fontVariationSettings: currentRoute === 'input' ? "'FILL' 1" : "'FILL' 0"
                }}
              >
                add_box
              </span>
              <span>Create Pack</span>
            </button>

            <button
              onClick={() => navigate('run')}
              disabled={!activeJobId}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                !activeJobId
                  ? 'opacity-40 cursor-not-allowed'
                  : currentRoute === 'run'
                    ? 'bg-white/45 text-primary shadow-sm border-l-2 border-primary font-bold scale-[0.98]'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-white/30'
              }`}
            >
              <span
                className="material-symbols-outlined text-[20px]"
                style={{ fontVariationSettings: currentRoute === 'run' ? "'FILL' 1" : "'FILL' 0" }}
              >
                analytics
              </span>
              <span>Run Progress</span>
            </button>

            <button
              onClick={() => navigate('stuff')}
              disabled={!activeJobId}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                !activeJobId
                  ? 'opacity-40 cursor-not-allowed'
                  : currentRoute === 'stuff'
                    ? 'bg-white/45 text-primary shadow-sm border-l-2 border-primary font-bold scale-[0.98]'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-white/30'
              }`}
            >
              <span
                className="material-symbols-outlined text-[20px]"
                style={{
                  fontVariationSettings: currentRoute === 'stuff' ? "'FILL' 1" : "'FILL' 0"
                }}
              >
                perm_media
              </span>
              <span>Media Library</span>
            </button>

            <button
              onClick={() => navigate('settings')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                currentRoute === 'settings'
                  ? 'bg-white/45 text-primary shadow-sm border-l-2 border-primary font-bold scale-[0.98]'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-white/30'
              }`}
            >
              <span
                className="material-symbols-outlined text-[20px]"
                style={{
                  fontVariationSettings: currentRoute === 'settings' ? "'FILL' 1" : "'FILL' 0"
                }}
              >
                settings
              </span>
              <span>Settings</span>
            </button>
          </nav>
        </div>

        {/* Diagnostic Footer */}
        <div className="p-6 border-t border-black/5 space-y-3 font-mono text-[10px] text-outline select-text">
          <div className="flex items-center space-x-2">
            <span className="material-symbols-outlined text-[14px]">terminal</span>
            <span>Node: {window.process?.versions?.node || '22.12.0'}</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="material-symbols-outlined text-[14px]">desktop_windows</span>
            <span>Chrome: {window.process?.versions?.chrome || '130.0'}</span>
          </div>
          <div className="text-[9px] opacity-60 text-center border-t border-black/5 pt-3">
            v1.2.1 • Natural Aero Powered
          </div>
        </div>
      </aside>

      {/* Main Workspace Content Area */}
      <main className="flex-1 min-w-0 flex flex-col z-10 relative">
        <div className="grow overflow-y-auto p-8 lg:p-10">{renderActiveView()}</div>
      </main>
    </div>
  )
}
