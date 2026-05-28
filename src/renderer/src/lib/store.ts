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
  openaiKey?: string
  geminiKey?: string
  openrouterKey?: string
  pexelsKey?: string
}

interface AppStore {
  currentRoute: 'input' | 'run' | 'stuff' | 'settings'
  activeJobId: string | null
  activeJob: JobSnapshot | null
  jobs: JobSummary[]
  settings: PublicSettings | null
  loading: boolean
  pendingEvents: Record<string, unknown>[]

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
    style: 'cinematic' | 'documentary' | 'business' | 'tech' | 'nature' | 'lifestyle' | 'abstract'
    mix: 'videos only' | 'photos only' | 'videos + photos'
    maxAssetsPerBeat: number
    maxTotalDownloads: number
  }) => Promise<string>
  pauseJob: (id: string) => Promise<void>
  resumeJob: (id: string) => Promise<void>
  approveAndResumeJob: (id: string) => Promise<void>
  cancelJob: (id: string) => Promise<void>
  rerunJob: (id: string) => Promise<void>
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

  navigate: (route) => set({ currentRoute: route }),

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
        set({ activeJob: snapshot, pendingEvents: [] })
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

  approveAndResumeJob: async (id) => {
    await api.jobs.approveAndResume(id)
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
  }
}))
