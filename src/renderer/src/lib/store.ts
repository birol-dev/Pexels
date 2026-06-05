import { create } from 'zustand'
import { api } from './api-client'

export interface AssetRecord {
  id: string
  pexelsId: number
  type: 'photo' | 'video'
  url: string
  imageUrl: string
  downloadUrl: string
  width: number
  height: number
  duration?: number
  photographer: string
  photographerUrl?: string
  query: string
  filePath?: string
  status: 'pending' | 'downloading' | 'completed' | 'failed'
  error?: string
  progress?: number
  beatId?: string
  beatText?: string
}

export interface VisualBeat {
  id: string
  text: string
  visualPrompt: string
  searchQueries: string[]
  assets: AssetRecord[]
  rejectedAssets?: Array<{ type: 'photo' | 'video'; pexelsId: number; reason: string }>
  status: 'pending' | 'searching' | 'selecting' | 'downloading' | 'completed' | 'failed'
}

export interface AgentLogEvent {
  timestamp: string
  type: 'thought' | 'tool_call' | 'tool_result' | 'progress' | 'error' | 'info'
  message: string
  data?: unknown
}

export interface JobSnapshot {
  jobId: string
  title: string
  script: string
  status: 'running' | 'paused' | 'completed' | 'cancelled' | 'failed'
  progress: number
  currentStep: string
  beats: VisualBeat[]
  logs: AgentLogEvent[]
  downloadedCount: number
  failedCount: number
  usage?: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
}

export interface JobSummary {
  jobId: string
  projectName: string
  title: string
  script: string
  status: 'running' | 'paused' | 'completed' | 'cancelled' | 'failed'
  createdAt: string
  updatedAt: string
  downloadPath: string
  assetCount: number
}

export interface PublicSettings {
  llmProvider: 'openai' | 'openrouter' | 'gemini'
  modelId: string
  downloadFolder: string
  maxConcurrentDownloads: number
  maxAgentIterations: number
  requestTimeoutSeconds: number
  skipExplicitQueries: boolean
  requireApprovalBeforeDownload: boolean
  avoidPeopleAndFaces: boolean
  isOnboarded: boolean
  theme: 'flat-black' | 'flat-white'
  openaiKey?: string
  geminiKey?: string
  openrouterKey?: string
  pexelsKey?: string
}

export interface ModalState {
  isOpen: boolean
  title: string
  message: string
  isConfirm: boolean
  confirmText: string
  cancelText: string
  resolve: ((value: boolean) => void) | null
}

export interface TabItem {
  id: string
  type: 'input' | 'run' | 'stuff' | 'settings'
  title: string
  jobId?: string
}

interface AppStore {
  currentRoute: 'input' | 'run' | 'stuff' | 'settings'
  activeJobId: string | null
  activeJob: JobSnapshot | null
  jobs: JobSummary[]
  settings: PublicSettings | null
  loading: boolean
  pendingEvents: Record<string, unknown>[]
  modal: ModalState

  // Tab State
  tabs: TabItem[]
  activeTabId: string

  // Tab Actions
  openTab: (type: 'input' | 'run' | 'stuff' | 'settings', jobId?: string) => void
  closeTab: (tabId: string) => void
  selectTab: (tabId: string) => void

  navigate: (route: 'input' | 'run' | 'stuff' | 'settings') => void
  setActiveJobId: (id: string | null) => void
  loadSettings: () => Promise<void>
  updateSettings: (updates: Partial<PublicSettings>) => Promise<void>
  loadJobs: () => Promise<void>
  loadActiveJob: (id: string) => Promise<void>

  startJob: (input: {
    title: string
    script: string
    platform: 'YouTube' | 'Shorts' | 'TikTok' | 'Instagram Reels'
    style: string
    mix: 'videos only' | 'photos only' | 'videos + photos'
    maxAssetsPerBeat: number
    maxTotalDownloads: number
  }) => Promise<string>
  pauseJob: (id: string) => Promise<void>
  resumeJob: (id: string) => Promise<void>
  approveAndResumeJob: (
    id: string,
    decision?: { approvedAssetIds?: string[]; rejectedAssetIds?: string[] }
  ) => Promise<void>
  cancelJob: (id: string) => Promise<void>
  rerunJob: (id: string) => Promise<void>
  deleteJob: (id: string) => Promise<void>

  alert: (title: string, message: string, options?: { confirmText?: string }) => Promise<void>
  confirm: (
    title: string,
    message: string,
    options?: { confirmText?: string; cancelText?: string }
  ) => Promise<boolean>
  closeModal: (result: boolean) => void
}

let eventUnsubscribe: (() => void) | null = null

export const useAppStore = create<AppStore>((set, get) => ({
  currentRoute: 'input',
  activeJobId: null,
  activeJob: null,
  jobs: [],
  settings: null,
  loading: false,
  pendingEvents: [],
  modal: {
    isOpen: false,
    title: '',
    message: '',
    isConfirm: false,
    confirmText: 'OK',
    cancelText: 'Cancel',
    resolve: null
  },

  // Tab State Initializers
  tabs: [{ id: 'input', type: 'input', title: 'Create Pack' }],
  activeTabId: 'input',

  // Tab Action Implementations
  openTab: (type, jobId) => {
    const { tabs, jobs } = get()
    let tabId = type as string
    let title = ''

    if (type === 'input') {
      title = 'Create Pack'
    } else if (type === 'settings') {
      title = 'Settings'
    } else if (type === 'run' && jobId) {
      tabId = `run_${jobId}`
      const job = jobs.find((j) => j.jobId === jobId)
      title = `Run: ${job ? job.title : 'Project'}`
    } else if (type === 'stuff' && jobId) {
      tabId = `stuff_${jobId}`
      const job = jobs.find((j) => j.jobId === jobId)
      title = `Library: ${job ? job.title : 'Project'}`
    }

    const tabExists = tabs.some((t) => t.id === tabId)
    const newTabs = tabExists ? tabs : [...tabs, { id: tabId, type, title, jobId }]

    set({
      tabs: newTabs,
      activeTabId: tabId,
      currentRoute: type,
      activeJobId: jobId || null
    })

    if (jobId) {
      get().loadActiveJob(jobId)
    }
  },

  closeTab: (tabId) => {
    const { tabs, activeTabId } = get()
    const newTabs = tabs.filter((t) => t.id !== tabId)

    if (newTabs.length === 0) {
      const defaultTab: TabItem = { id: 'input', type: 'input', title: 'Create Pack' }
      set({
        tabs: [defaultTab],
        activeTabId: 'input',
        currentRoute: 'input',
        activeJobId: null
      })
      return
    }

    if (activeTabId === tabId) {
      const closedIndex = tabs.findIndex((t) => t.id === tabId)
      const nextActiveTab = newTabs[Math.max(0, closedIndex - 1)]

      set({
        tabs: newTabs,
        activeTabId: nextActiveTab.id,
        currentRoute: nextActiveTab.type,
        activeJobId: nextActiveTab.jobId || null
      })

      if (nextActiveTab.jobId) {
        get().loadActiveJob(nextActiveTab.jobId)
      }
    } else {
      set({ tabs: newTabs })
    }
  },

  selectTab: (tabId) => {
    const { tabs } = get()
    const targetTab = tabs.find((t) => t.id === tabId)
    if (!targetTab) return

    set({
      activeTabId: tabId,
      currentRoute: targetTab.type,
      activeJobId: targetTab.jobId || null
    })

    if (targetTab.jobId) {
      get().loadActiveJob(targetTab.jobId)
    }
  },

  navigate: (route) => {
    const activeJobId = get().activeJobId
    get().openTab(route, activeJobId || undefined)
  },

  setActiveJobId: (id) => {
    set({ activeJobId: id, pendingEvents: [] })
    if (id) {
      get().loadActiveJob(id)

      if (eventUnsubscribe) {
        eventUnsubscribe()
        eventUnsubscribe = null
      }

      eventUnsubscribe = api.jobs.onEvent((event: Record<string, unknown>) => {
        if (event.jobId === id) {
          const currentActive = get().activeJob

          if (event.type === 'snapshot') {
            set({ activeJob: event.data as JobSnapshot })
            const currentJobs = get().jobs
            const updatedJobs = currentJobs.map((j) => {
              if (j.jobId === event.jobId) {
                const snap = event.data as JobSnapshot
                return {
                  ...j,
                  status: snap.status,
                  assetCount: snap.downloadedCount,
                  updatedAt: new Date().toISOString()
                }
              }
              return j
            })
            set({ jobs: updatedJobs })
            return
          }

          if (!currentActive) {
            set((state) => ({ pendingEvents: [...state.pendingEvents, event] }))
            return
          }

          if (event.type === 'log') {
            set({
              activeJob: {
                ...currentActive,
                logs: [...currentActive.logs, event.data as AgentLogEvent]
              }
            })
          } else if (event.type === 'progress') {
            const data = event.data as { step: string; progress: number }
            set({
              activeJob: {
                ...currentActive,
                currentStep: data.step,
                progress: data.progress
              }
            })
          } else if (event.type === 'beats') {
            set({
              activeJob: {
                ...currentActive,
                beats: event.data as VisualBeat[]
              }
            })
          }
        }
      })
    } else {
      set({ activeJob: null })
      if (eventUnsubscribe) {
        eventUnsubscribe()
        eventUnsubscribe = null
      }
    }
  },

  loadSettings: async () => {
    const settings = await api.settings.getPublicSettings()
    set({ settings: settings as unknown as PublicSettings })
  },

  updateSettings: async (updates) => {
    const settings = await api.settings.updateSettings(updates as Record<string, unknown>)
    set({ settings: settings as unknown as PublicSettings })
  },

  loadJobs: async () => {
    const jobs = await api.jobs.list()
    const sorted = (jobs as unknown as JobSummary[]).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    )
    set({ jobs: sorted })
  },

  loadActiveJob: async (id) => {
    set({ loading: true })
    try {
      const activeJob = await api.jobs.get(id)
      const snapshot = activeJob as unknown as JobSnapshot | null
      if (snapshot) {
        const state = get()
        for (const event of state.pendingEvents) {
          if (event.jobId === id) {
            if (event.type === 'log') {
              snapshot.logs = [...snapshot.logs, event.data as AgentLogEvent]
            } else if (event.type === 'progress') {
              const data = event.data as { step: string; progress: number }
              snapshot.currentStep = data.step
              snapshot.progress = data.progress
            } else if (event.type === 'beats') {
              snapshot.beats = event.data as VisualBeat[]
            }
          }
        }
        const currentTabs = get().tabs
        const updatedTabs = currentTabs.map((t) => {
          if (t.jobId === id) {
            if (t.type === 'run') {
              return { ...t, title: `Run: ${snapshot.title}` }
            } else if (t.type === 'stuff') {
              return { ...t, title: `Library: ${snapshot.title}` }
            }
          }
          return t
        })
        set({ activeJob: snapshot, pendingEvents: [], tabs: updatedTabs })
      } else {
        set({ activeJob: null, pendingEvents: [] })
      }
    } catch (err) {
      console.error('Failed to load active job:', err)
    } finally {
      set({ loading: false })
    }
  },

  startJob: async (input) => {
    set({ loading: true })
    try {
      const jobId = await api.jobs.start(input as unknown as Record<string, unknown>)
      get().setActiveJobId(jobId)
      set({ currentRoute: 'run' })
      await get().loadJobs()
      return jobId
    } finally {
      set({ loading: false })
    }
  },

  pauseJob: async (id) => {
    await api.jobs.pause(id)
    if (get().activeJobId === id) {
      await get().loadActiveJob(id)
    }
    await get().loadJobs()
  },

  resumeJob: async (id) => {
    await api.jobs.resume(id)
    if (get().activeJobId === id) {
      await get().loadActiveJob(id)
    }
    await get().loadJobs()
  },

  approveAndResumeJob: async (id, decision) => {
    await api.jobs.approveAndResume(id, decision)
    if (get().activeJobId === id) {
      await get().loadActiveJob(id)
    }
    await get().loadJobs()
  },

  cancelJob: async (id) => {
    await api.jobs.cancel(id)
    if (get().activeJobId === id) {
      await get().loadActiveJob(id)
    }
    await get().loadJobs()
  },

  rerunJob: async (id) => {
    set({ loading: true })
    try {
      const newJobId = await api.jobs.rerun(id)
      get().setActiveJobId(newJobId)
      set({ currentRoute: 'run' })
      await get().loadJobs()
    } finally {
      set({ loading: false })
    }
  },

  deleteJob: async (id) => {
    set({ loading: true })
    try {
      await api.jobs.delete(id)

      const { tabs, activeTabId } = get()
      const remainingTabs = tabs.filter((t) => t.jobId !== id)
      const activeTabWasDeleted = tabs.some((t) => t.jobId === id && t.id === activeTabId)

      if (remainingTabs.length === 0) {
        const defaultTab: TabItem = { id: 'input', type: 'input', title: 'Create Pack' }
        set({
          tabs: [defaultTab],
          activeTabId: 'input',
          currentRoute: 'input',
          activeJobId: null
        })
      } else if (activeTabWasDeleted) {
        const defaultTab: TabItem = { id: 'input', type: 'input', title: 'Create Pack' }
        const nextActive = remainingTabs.length > 0 ? remainingTabs[0] : defaultTab
        set({
          tabs: remainingTabs,
          activeTabId: nextActive.id,
          currentRoute: nextActive.type,
          activeJobId: nextActive.jobId || null
        })
      } else {
        set({ tabs: remainingTabs })
      }

      await get().loadJobs()
    } finally {
      set({ loading: false })
    }
  },

  alert: (title, message, options) => {
    return new Promise<void>((resolve) => {
      set({
        modal: {
          isOpen: true,
          title,
          message,
          isConfirm: false,
          confirmText: options?.confirmText || 'OK',
          cancelText: '',
          resolve: () => resolve()
        }
      })
    })
  },

  confirm: (title, message, options) => {
    return new Promise<boolean>((resolve) => {
      set({
        modal: {
          isOpen: true,
          title,
          message,
          isConfirm: true,
          confirmText: options?.confirmText || 'Confirm',
          cancelText: options?.cancelText || 'Cancel',
          resolve
        }
      })
    })
  },

  closeModal: (result) => {
    const { resolve } = get().modal
    if (resolve) {
      resolve(result)
    }
    set((state) => ({
      modal: {
        ...state.modal,
        isOpen: false,
        resolve: null
      }
    }))
  }
}))
