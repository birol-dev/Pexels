import { create } from 'zustand'
import { api } from './api-client'

export interface VisualBeat {
  id: string
  text: string
  visualPrompt: string
  searchQueries: string[]
  assets: any[]
  rejectedAssets?: Array<{ type: 'photo' | 'video'; pexelsId: number; reason: string }>
  status: 'pending' | 'searching' | 'selecting' | 'downloading' | 'completed' | 'failed'
}

export interface JobSnapshot {
  jobId: string
  title: string
  script: string
  status: 'running' | 'paused' | 'completed' | 'cancelled' | 'failed'
  progress: number
  currentStep: string
  beats: VisualBeat[]
  logs: any[]
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

interface AppStore {
  currentRoute: 'input' | 'run' | 'stuff' | 'settings'
  activeJobId: string | null
  activeJob: JobSnapshot | null
  jobs: JobSummary[]
  settings: any | null
  loading: boolean
  pendingEvents: any[]

  navigate: (route: 'input' | 'run' | 'stuff' | 'settings') => void
  setActiveJobId: (id: string | null) => void
  loadSettings: () => Promise<void>
  updateSettings: (updates: any) => Promise<void>
  loadJobs: () => Promise<void>
  loadActiveJob: (id: string) => Promise<void>

  startJob: (input: any) => Promise<string>
  pauseJob: (id: string) => Promise<void>
  resumeJob: (id: string) => Promise<void>
  approveAndResumeJob: (id: string) => Promise<void>
  cancelJob: (id: string) => Promise<void>
  rerunJob: (id: string) => Promise<void>
}

// Store unsubscribe reference for live updates
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

      // Unsubscribe existing IPC listeners
      if (eventUnsubscribe) {
        eventUnsubscribe()
        eventUnsubscribe = null
      }

      // Subscribe to real-time events for this job
      eventUnsubscribe = api.jobs.onEvent((event: any) => {
        if (event.jobId === id) {
          const currentActive = get().activeJob

          if (event.type === 'snapshot') {
            set({ activeJob: event.data })
            // Update corresponding job summary in the jobs list
            const currentJobs = get().jobs
            const updatedJobs = currentJobs.map((j) => {
              if (j.jobId === event.jobId) {
                return {
                  ...j,
                  status: event.data.status,
                  assetCount: event.data.downloadedCount,
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
                logs: [...currentActive.logs, event.data]
              }
            })
          } else if (event.type === 'progress') {
            set({
              activeJob: {
                ...currentActive,
                currentStep: event.data.step,
                progress: event.data.progress
              }
            })
          } else if (event.type === 'beats') {
            set({
              activeJob: {
                ...currentActive,
                beats: event.data
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
    set({ settings })
  },

  updateSettings: async (updates) => {
    const settings = await api.settings.updateSettings(updates)
    set({ settings })
  },

  loadJobs: async () => {
    const jobs = await api.jobs.list()
    // Sort jobs newest first
    const sorted = jobs.sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt))
    set({ jobs: sorted })
  },

  loadActiveJob: async (id) => {
    set({ loading: true })
    try {
      const activeJob = await api.jobs.get(id)
      if (activeJob) {
        // Apply any buffered events
        const state = get()
        for (const event of state.pendingEvents) {
          if (event.jobId === id) {
            if (event.type === 'log') {
              activeJob.logs = [...activeJob.logs, event.data]
            } else if (event.type === 'progress') {
              activeJob.currentStep = event.data.step
              activeJob.progress = event.data.progress
            } else if (event.type === 'beats') {
              activeJob.beats = event.data
            }
          }
        }
      }
      set({ activeJob, pendingEvents: [] })
    } catch (err) {
      console.error('Failed to load active job:', err)
    } finally {
      set({ loading: false })
    }
  },

  startJob: async (input) => {
    set({ loading: true })
    try {
      const jobId = await api.jobs.start(input)
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
