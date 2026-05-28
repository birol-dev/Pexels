import React from 'react'
import { useAppStore } from './lib/store'
import ScriptInputView from './routes/script-input'
import AgentRunView from './routes/agent-run'
import DownloadedStuffView from './routes/downloaded-stuff'
import SettingsView from './routes/settings'
import { Sparkles, Terminal, Film, Settings, Cpu, HardDrive } from 'lucide-react'

export default function App(): React.JSX.Element {
  const { currentRoute, navigate, activeJobId } = useAppStore()

  const renderActiveView = () => {
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
    <div className="min-h-screen bg-[#09090b] text-neutral-100 flex font-sans antialiased overflow-x-hidden">
      {/* Sidebar Navigation */}
      <aside className="w-64 border-r border-white/5 bg-[#0c0c0e]/85 backdrop-blur-md flex flex-col justify-between shrink-0 select-none">
        <div className="p-6">
          {/* Logo Brand */}
          <div className="flex items-center space-x-2.5 mb-8">
            <div className="p-2 bg-gradient-to-tr from-violet-600 to-indigo-600 rounded-lg shadow-md shadow-violet-500/20">
              <Film className="h-5 w-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-sm tracking-tight bg-gradient-to-r from-white to-neutral-400 bg-clip-text text-transparent">
                StockFinder AI
              </span>
              <span className="text-[10px] text-muted-foreground block font-mono">v1.1.3</span>
            </div>
          </div>

          {/* Nav List */}
          <nav className="space-y-1.5">
            <button
              onClick={() => navigate('input')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${currentRoute === 'input' ? 'bg-white/5 text-white border-l-2 border-primary' : 'text-neutral-400 hover:text-white hover:bg-white/5'}`}
            >
              <Sparkles className="h-4.5 w-4.5" />
              <span>Create Pack</span>
            </button>

            <button
              onClick={() => navigate('run')}
              disabled={!activeJobId}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-medium transition-all ${!activeJobId ? 'opacity-40 cursor-not-allowed' : ''} ${currentRoute === 'run' ? 'bg-white/5 text-white border-l-2 border-primary' : 'text-neutral-400 hover:text-white hover:bg-white/5'}`}
            >
              <div className="flex items-center space-x-3">
                <Terminal className="h-4.5 w-4.5" />
                <span>Run Progress</span>
              </div>
            </button>

            <button
              onClick={() => navigate('stuff')}
              disabled={!activeJobId}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-medium transition-all ${!activeJobId ? 'opacity-40 cursor-not-allowed' : ''} ${currentRoute === 'stuff' ? 'bg-white/5 text-white border-l-2 border-primary' : 'text-neutral-400 hover:text-white hover:bg-white/5'}`}
            >
              <div className="flex items-center space-x-3">
                <Film className="h-4.5 w-4.5" />
                <span>Media Library</span>
              </div>
            </button>

            <button
              onClick={() => navigate('settings')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${currentRoute === 'settings' ? 'bg-white/5 text-white border-l-2 border-primary' : 'text-neutral-400 hover:text-white hover:bg-white/5'}`}
            >
              <Settings className="h-4.5 w-4.5" />
              <span>Settings</span>
            </button>
          </nav>
        </div>

        {/* Diagnostic Footer */}
        <div className="p-6 border-t border-white/5 space-y-3 font-mono text-[10px] text-muted-foreground select-text">
          <div className="flex items-center space-x-2">
            <Cpu className="h-3.5 w-3.5" />
            <span>Node: {window.process?.versions?.node || '22.12.0'}</span>
          </div>
          <div className="flex items-center space-x-2">
            <HardDrive className="h-3.5 w-3.5" />
            <span>Chrome: {window.process?.versions?.chrome || '130.0'}</span>
          </div>
          <div className="text-[9px] opacity-60 text-center border-t border-white/5 pt-3">
            Electron Engine Powered
          </div>
        </div>
      </aside>

      {/* Main Workspace Content Area */}
      <main className="flex-1 min-w-0 flex flex-col bg-[#09090b]">
        {/* Decorative Top Glow */}
        <div className="absolute top-0 right-0 left-64 h-[1px] bg-gradient-to-r from-transparent via-violet-500/20 to-transparent pointer-events-none" />

        <div className="flex-1 overflow-y-auto p-8 lg:p-10">{renderActiveView()}</div>
      </main>
    </div>
  )
}
