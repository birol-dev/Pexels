import React, { useEffect, useState } from 'react'
import { useAppStore } from './lib/store'
import ScriptInputView from '@renderer/routes/script-input'
import AgentRunView from '@renderer/routes/agent-run'
import DownloadedStuffView from '@renderer/routes/downloaded-stuff'
import SettingsView from '@renderer/routes/settings'
import OnboardingView from '@renderer/routes/onboarding'

export default function App(): React.JSX.Element {
  const {
    currentRoute,
    navigate,
    activeJobId,
    settings,
    loadSettings,
    modal,
    closeModal,
    tabs,
    activeTabId,
    selectTab,
    closeTab
  } = useAppStore()

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  if (!settings) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
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
    <div
      className={`min-h-screen ${
        settings.theme === 'flat-white'
          ? 'theme-flat-white bg-white text-[#09090b]'
          : 'theme-flat-black bg-black text-white'
      } flex font-sans antialiased overflow-x-hidden relative`}
    >
      {/* Sidebar Navigation */}
      <aside
        className={`${sidebarCollapsed ? 'w-20' : 'w-64'} border-r ${
          settings.theme === 'flat-white'
            ? 'border-black/5 bg-[#fafafa]'
            : 'border-white/10 bg-[#080808]'
        } flex flex-col justify-between shrink-0 select-none z-10 relative transition-all duration-300`}
      >
        <div className={sidebarCollapsed ? 'p-4 flex flex-col items-center' : 'p-6'}>
          {/* Logo Brand / Collapse Toggle Row */}
          <div
            className={`flex items-center ${
              sidebarCollapsed ? 'flex-col gap-4 mb-8' : 'justify-between mb-10'
            }`}
          >
            {!sidebarCollapsed ? (
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-lg bg-primary shadow-inner flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-white text-[24px]">eco</span>
                </div>
                <div>
                  <span className="font-bold text-sm tracking-tight text-on-surface block">
                    StockFinder AI
                  </span>
                  <span className="text-[10px] text-outline block font-mono">Flat Engine</span>
                </div>
              </div>
            ) : (
              <div className="w-10 h-10 rounded-lg bg-primary shadow-inner flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-white text-[24px]">eco</span>
              </div>
            )}

            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className={`w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 text-outline hover:text-on-surface transition-colors cursor-pointer ${
                sidebarCollapsed ? 'mt-1' : ''
              }`}
              title={sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            >
              <span className="material-symbols-outlined text-[20px]">
                {sidebarCollapsed ? 'chevron_right' : 'chevron_left'}
              </span>
            </button>
          </div>

          {/* Nav List */}
          <nav
            className={`space-y-1.5 ${sidebarCollapsed ? 'w-full flex flex-col items-center' : ''}`}
          >
            <button
              onClick={() => navigate('input')}
              className={`flex items-center transition-all ${
                sidebarCollapsed
                  ? 'p-3 justify-center rounded-xl'
                  : 'w-full space-x-3 px-4 py-3 rounded-lg text-sm font-medium'
              } ${
                currentRoute === 'input'
                  ? 'bg-white/10 text-on-surface font-semibold'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-white/5'
              }`}
              title={sidebarCollapsed ? 'Create Pack' : undefined}
            >
              <span
                className={`material-symbols-outlined text-[20px] ${currentRoute === 'input' ? 'text-primary' : ''}`}
                style={{
                  fontVariationSettings: currentRoute === 'input' ? "'FILL' 1" : "'FILL' 0"
                }}
              >
                add_box
              </span>
              {!sidebarCollapsed && <span>Create Pack</span>}
            </button>

            <button
              onClick={() => navigate('run')}
              disabled={!activeJobId}
              className={`flex items-center transition-all ${
                sidebarCollapsed
                  ? 'p-3 justify-center rounded-xl'
                  : 'w-full space-x-3 px-4 py-3 rounded-lg text-sm font-medium'
              } ${
                !activeJobId
                  ? 'opacity-40 cursor-not-allowed'
                  : currentRoute === 'run'
                    ? 'bg-white/10 text-on-surface font-semibold'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-white/5'
              }`}
              title={sidebarCollapsed ? 'Run Progress' : undefined}
            >
              <span
                className={`material-symbols-outlined text-[20px] ${currentRoute === 'run' ? 'text-primary' : ''}`}
                style={{ fontVariationSettings: currentRoute === 'run' ? "'FILL' 1" : "'FILL' 0" }}
              >
                analytics
              </span>
              {!sidebarCollapsed && <span>Run Progress</span>}
            </button>

            <button
              onClick={() => navigate('stuff')}
              disabled={!activeJobId}
              className={`flex items-center transition-all ${
                sidebarCollapsed
                  ? 'p-3 justify-center rounded-xl'
                  : 'w-full space-x-3 px-4 py-3 rounded-lg text-sm font-medium'
              } ${
                !activeJobId
                  ? 'opacity-40 cursor-not-allowed'
                  : currentRoute === 'stuff'
                    ? 'bg-white/10 text-on-surface font-semibold'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-white/5'
              }`}
              title={sidebarCollapsed ? 'Media Library' : undefined}
            >
              <span
                className={`material-symbols-outlined text-[20px] ${currentRoute === 'stuff' ? 'text-primary' : ''}`}
                style={{
                  fontVariationSettings: currentRoute === 'stuff' ? "'FILL' 1" : "'FILL' 0"
                }}
              >
                perm_media
              </span>
              {!sidebarCollapsed && <span>Media Library</span>}
            </button>

            <button
              onClick={() => navigate('settings')}
              className={`flex items-center transition-all ${
                sidebarCollapsed
                  ? 'p-3 justify-center rounded-xl'
                  : 'w-full space-x-3 px-4 py-3 rounded-lg text-sm font-medium'
              } ${
                currentRoute === 'settings'
                  ? 'bg-white/10 text-on-surface font-semibold'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-white/5'
              }`}
              title={sidebarCollapsed ? 'Settings' : undefined}
            >
              <span
                className={`material-symbols-outlined text-[20px] ${currentRoute === 'settings' ? 'text-primary' : ''}`}
                style={{
                  fontVariationSettings: currentRoute === 'settings' ? "'FILL' 1" : "'FILL' 0"
                }}
              >
                settings
              </span>
              {!sidebarCollapsed && <span>Settings</span>}
            </button>
          </nav>
        </div>

        {/* Diagnostic Footer */}
        {!sidebarCollapsed ? (
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
              v1.2.2 • Flat Engine Powered
            </div>
          </div>
        ) : (
          <div className="py-6 border-t border-black/5 flex flex-col items-center gap-4 text-outline select-none">
            <span
              className="material-symbols-outlined text-[18px] cursor-help"
              title={`Flat Engine Running\nNode: ${window.process?.versions?.node || '22.12.0'}\nChrome: ${window.process?.versions?.chrome || '130.0'}`}
            >
              terminal
            </span>
            <span className="text-[8px] font-mono opacity-60">v1.2.2</span>
          </div>
        )}
      </aside>

      {/* Main Workspace Content Area */}
      <main className="flex-1 min-w-0 flex flex-col z-10 relative">
        {/* Closable Project Tabs Bar */}
        {tabs.length > 0 && (
          <div
            className={`flex items-center border-b ${
              settings.theme === 'flat-white'
                ? 'border-black/5 bg-[#fafafa]'
                : 'border-white/10 bg-[#080808]'
            } px-6 py-2.5 overflow-x-auto gap-2 select-none scrollbar-none`}
          >
            {tabs.map((tab) => {
              const isActive = tab.id === activeTabId
              return (
                <div
                  key={tab.id}
                  onClick={() => selectTab(tab.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all border ${
                    isActive
                      ? settings.theme === 'flat-white'
                        ? 'bg-black/5 border-black/10 text-[#09090b]'
                        : 'bg-white/10 border-white/10 text-white shadow-sm'
                      : 'border-transparent text-on-surface-variant hover:text-on-surface hover:bg-white/5'
                  }`}
                >
                  <span
                    className={`material-symbols-outlined text-[16px] ${isActive ? 'text-primary' : ''}`}
                    style={{
                      fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0"
                    }}
                  >
                    {tab.type === 'input'
                      ? 'add_box'
                      : tab.type === 'settings'
                        ? 'settings'
                        : tab.type === 'run'
                          ? 'analytics'
                          : 'perm_media'}
                  </span>

                  <span className="truncate max-w-[120px]">{tab.title}</span>

                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      closeTab(tab.id)
                    }}
                    className="w-4.5 h-4.5 rounded-full flex items-center justify-center hover:bg-white/20 hover:text-error transition-colors text-outline cursor-pointer"
                    title="Close Tab"
                  >
                    <span className="material-symbols-outlined text-[12px] font-bold">close</span>
                  </button>
                </div>
              )
            })}
          </div>
        )}

        <div className="grow overflow-y-auto p-8 lg:p-10">{renderActiveView()}</div>
      </main>

      {/* Custom Glassmorphic Alert/Confirm Dialog */}
      {modal.isOpen && (
        <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
          <div
            className={`border shadow-[0px_20px_40px_rgba(0,0,0,0.4)] rounded-2xl max-w-md w-full p-6 flex flex-col gap-4 animate-scale-up ${
              settings.theme === 'flat-white'
                ? 'bg-white border-black/10'
                : 'bg-black border-white/10'
            }`}
          >
            {/* Title */}
            <div className="flex items-center gap-3">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center ${modal.isConfirm ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-tertiary/10 text-tertiary border border-tertiary/20'}`}
              >
                <span className="material-symbols-outlined text-[20px]">
                  {modal.isConfirm ? 'help_outline' : 'info'}
                </span>
              </div>
              <h3 className="font-bold text-base text-on-surface tracking-tight">{modal.title}</h3>
            </div>

            {/* Message */}
            <p className="text-xs font-semibold text-on-surface-variant leading-relaxed">
              {modal.message}
            </p>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 mt-2 border-t border-white/5 pt-4">
              {modal.isConfirm && (
                <button
                  onClick={() => closeModal(false)}
                  className="px-4 py-2 bg-white/5 border border-white/15 hover:bg-white/10 text-on-surface rounded-lg font-semibold text-xs transition-colors cursor-pointer"
                >
                  {modal.cancelText}
                </button>
              )}
              <button
                onClick={() => closeModal(true)}
                className="px-5 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg font-semibold text-xs transition-colors cursor-pointer shadow-md shadow-primary/20"
              >
                {modal.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
