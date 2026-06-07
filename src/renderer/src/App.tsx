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
    closeTab,
    openTab,
    jobs,
    loadJobs,
    setActiveJobId,
    updateInputTabState
  } = useAppStore()

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [editingTabId, setEditingTabId] = useState<string | null>(null)
  const [editingTitleValue, setEditingTitleValue] = useState('')

  const handleSaveTitle = (tabId: string, newTitle: string): void => {
    const trimmed = newTitle.trim()
    if (trimmed) {
      updateInputTabState(tabId, { title: trimmed })
    }
    setEditingTabId(null)
  }

  useEffect(() => {
    loadSettings()
    loadJobs()
  }, [loadSettings, loadJobs])

  useEffect(() => {
    if (settings?.theme === 'flat-black') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [settings?.theme])

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
          ? 'theme-flat-white bg-background text-on-background'
          : 'theme-flat-black bg-background text-on-background'
      } flex font-body-md h-screen overflow-hidden selection:bg-primary-container selection:text-on-primary-container relative`}
    >
      <div className="riso-grain"></div>

      {/* Sidebar Navigation */}
      <aside
        className={`${sidebarCollapsed ? 'w-20' : 'w-[280px]'} border-r-2 border-border bg-surface-container-low flex flex-col justify-between shrink-0 select-none z-20 relative transition-all duration-300 shadow-[inset_6px_6px_12px_rgba(0,0,0,0.1)] dark:shadow-[inset_6px_6px_12px_rgba(0,0,0,0.5)]`}
      >
        <div
          className={sidebarCollapsed ? 'p-4 flex flex-col items-center' : 'p-component-padding'}
        >
          {/* Logo Brand / Collapse Toggle Row */}
          <div
            className={`flex items-center ${
              sidebarCollapsed ? 'flex-col gap-4 mb-8' : 'justify-between mb-10'
            } border-b-2 border-border pb-6`}
          >
            {!sidebarCollapsed ? (
              <div className="flex flex-col">
                <h1 className="font-headline-lg-mobile text-headline-lg-mobile font-black text-ink-black tracking-tighter">
                  StockFinder AI
                </h1>
                <p className="font-label-sm text-label-sm text-outline dark:text-steel-secondary mt-2">
                  AI Video Asset Engine
                </p>
              </div>
            ) : (
              <div className="w-10 h-10 rounded-lg bg-primary shadow-inner flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-white text-[24px]">eco</span>
              </div>
            )}

            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className={`w-8 h-8 rounded-lg flex items-center justify-center hover:bg-surface-variant text-outline hover:text-on-surface transition-colors cursor-pointer ${
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
            className={`space-y-2.5 ${sidebarCollapsed ? 'w-full flex flex-col items-center' : ''}`}
          >
            <button
              onClick={() => navigate('input')}
              className={`flex items-center transition-all ${
                sidebarCollapsed
                  ? 'p-3 justify-center rounded-xl'
                  : 'w-full gap-4 px-component-padding py-3 font-label-sm text-label-sm rounded'
              } ${
                currentRoute === 'input'
                  ? 'bg-primary-container text-on-primary-container border-2 border-ink-black shadow-[4px_4px_0px_var(--color-ink-black)] dark:shadow-[4px_4px_0px_var(--color-cyber-lime)] translate-x-[-2px] translate-y-[-2px]'
                  : 'text-outline dark:text-steel-secondary hover:bg-surface-variant hover:text-on-surface'
              }`}
              title={sidebarCollapsed ? 'Create Pack' : undefined}
            >
              <span
                className="material-symbols-outlined"
                style={{
                  fontVariationSettings: currentRoute === 'input' ? "'FILL' 1" : "'FILL' 0"
                }}
              >
                add_box
              </span>
              {!sidebarCollapsed && <span>Create Pack</span>}
            </button>

            <button
              onClick={() => {
                if (!activeJobId && jobs.length > 0) {
                  setActiveJobId(jobs[0].jobId)
                }
                navigate('run')
              }}
              className={`flex items-center transition-all ${
                sidebarCollapsed
                  ? 'p-3 justify-center rounded-xl'
                  : 'w-full gap-4 px-component-padding py-3 font-label-sm text-label-sm rounded'
              } ${
                currentRoute === 'run'
                  ? 'bg-primary-container text-on-primary-container border-2 border-ink-black shadow-[4px_4px_0px_var(--color-ink-black)] dark:shadow-[4px_4px_0px_var(--color-cyber-lime)] translate-x-[-2px] translate-y-[-2px]'
                  : 'text-outline dark:text-steel-secondary hover:bg-surface-variant hover:text-on-surface'
              }`}
              title={sidebarCollapsed ? 'Run Progress' : undefined}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontVariationSettings: currentRoute === 'run' ? "'FILL' 1" : "'FILL' 0" }}
              >
                analytics
              </span>
              {!sidebarCollapsed && <span>Run Progress</span>}
            </button>

            <button
              onClick={() => navigate('stuff')}
              className={`flex items-center transition-all ${
                sidebarCollapsed
                  ? 'p-3 justify-center rounded-xl'
                  : 'w-full gap-4 px-component-padding py-3 font-label-sm text-label-sm rounded'
              } ${
                currentRoute === 'stuff'
                  ? 'bg-primary-container text-on-primary-container border-2 border-ink-black shadow-[4px_4px_0px_var(--color-ink-black)] dark:shadow-[4px_4px_0px_var(--color-cyber-lime)] translate-x-[-2px] translate-y-[-2px]'
                  : 'text-outline dark:text-steel-secondary hover:bg-surface-variant hover:text-on-surface'
              }`}
              title={sidebarCollapsed ? 'Media Library' : undefined}
            >
              <span
                className="material-symbols-outlined"
                style={{
                  fontVariationSettings: currentRoute === 'stuff' ? "'FILL' 1" : "'FILL' 0"
                }}
              >
                folder_special
              </span>
              {!sidebarCollapsed && <span>Media Library</span>}
            </button>

            <button
              onClick={() => navigate('settings')}
              className={`flex items-center transition-all ${
                sidebarCollapsed
                  ? 'p-3 justify-center rounded-xl'
                  : 'w-full gap-4 px-component-padding py-3 font-label-sm text-label-sm rounded'
              } ${
                currentRoute === 'settings'
                  ? 'bg-primary-container text-on-primary-container border-2 border-ink-black shadow-[4px_4px_0px_var(--color-ink-black)] dark:shadow-[4px_4px_0px_var(--color-cyber-lime)] translate-x-[-2px] translate-y-[-2px]'
                  : 'text-outline dark:text-steel-secondary hover:bg-surface-variant hover:text-on-surface'
              }`}
              title={sidebarCollapsed ? 'Settings' : undefined}
            >
              <span
                className="material-symbols-outlined"
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

        {/* Action Button and Version footer */}
        <div className="p-4 border-t-2 border-border bg-surface-container flex flex-col gap-3">
          <button
            onClick={() => openTab('input', undefined, true)}
            className={`w-full bg-paper-white dark:bg-surface-container-lowest border-2 border-ink-black text-ink-black dark:text-paper-white py-3 px-4 font-label-sm text-label-sm flex justify-center items-center gap-2 rounded hover:bg-surface-variant transition-all duration-200 shadow-[2px_2px_0px_var(--color-ink-black)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] ${
              sidebarCollapsed ? 'p-2' : ''
            }`}
          >
            <span className="material-symbols-outlined">add</span>
            {!sidebarCollapsed && <span>New Project</span>}
          </button>
          {!sidebarCollapsed ? (
            <div className="font-mono text-[10px] text-outline dark:text-steel-secondary text-center pt-2 opacity-60">
              v1.0 Industrial
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1 text-outline dark:text-steel-secondary select-none opacity-60">
              <span className="material-symbols-outlined text-[18px]">terminal</span>
              <span className="text-[8px] font-mono">v1.0</span>
            </div>
          )}
        </div>
      </aside>

      {/* Main Workspace Content Area */}
      <main className="flex-1 min-w-0 flex flex-col z-10 relative bg-background">
        {/* Closable Project Tabs Bar */}
        {tabs.length > 0 && (
          <div className="flex items-center border-b-2 border-border bg-surface-container px-6 py-2.5 overflow-x-auto gap-3 select-none scrollbar-none">
            {tabs.map((tab) => {
              const isActive = tab.id === activeTabId
              return (
                <div
                  key={tab.id}
                  onClick={() => selectTab(tab.id)}
                  onDoubleClick={(e) => {
                    if (tab.type === 'input') {
                      e.stopPropagation()
                      setEditingTabId(tab.id)
                      setEditingTitleValue(tab.title)
                    }
                  }}
                  className={`flex items-center gap-2 px-3 py-1.5 border-2 rounded font-label-sm text-xs transition-all cursor-pointer ${
                    isActive
                      ? 'bg-primary-container text-on-primary-container border-ink-black shadow-[2px_2px_0px_var(--color-ink-black)] dark:shadow-[2px_2px_0px_var(--color-cyber-lime)] -translate-x-px -translate-y-px'
                      : 'bg-paper-white dark:bg-surface-container-lowest border-border text-outline dark:text-steel-secondary hover:bg-surface-variant hover:text-on-surface'
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

                  {editingTabId === tab.id ? (
                    <input
                      type="text"
                      value={editingTitleValue}
                      onChange={(e) => setEditingTitleValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleSaveTitle(tab.id, editingTitleValue)
                        } else if (e.key === 'Escape') {
                          setEditingTabId(null)
                        }
                      }}
                      onBlur={() => {
                        handleSaveTitle(tab.id, editingTitleValue)
                      }}
                      className="bg-transparent border-b border-primary text-xs focus:outline-none w-24 py-0 pl-1"
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="truncate max-w-[120px]">{tab.title}</span>
                  )}

                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      closeTab(tab.id)
                    }}
                    className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-white/20 hover:text-error transition-colors text-outline cursor-pointer"
                    title="Close Tab"
                  >
                    <span className="material-symbols-outlined text-[12px] font-bold">close</span>
                  </button>
                </div>
              )
            })}

            {/* Plus Button to spawn new Create Pack tab */}
            <button
              onClick={() => openTab('input', undefined, true)}
              className="w-7 h-7 rounded border-2 border-border bg-paper-white dark:bg-surface-container-lowest text-outline hover:text-on-surface flex items-center justify-center transition-all shrink-0 cursor-pointer shadow-[1px_1px_0px_var(--color-ink-black)]"
              title="New Create Pack Tab"
            >
              <span className="material-symbols-outlined text-[16px] font-bold">add</span>
            </button>
          </div>
        )}

        <div className="grow overflow-y-auto">{renderActiveView()}</div>
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
