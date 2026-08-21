import { createWriteStream, promises as fsPromises } from 'fs'

import { join } from 'path'
import { Readable, PassThrough } from 'stream'
import { pipeline } from 'stream/promises'
import { validateDownloadUrl } from './download-url-validation'
import { findInFlightDownload, isRetryableDownloadStatus } from './download-task-utils'
import { ApiError, classifyFetchError } from '../http/api-errors'

export interface DownloadTask {
  id: string // unique job/task ID
  assetId: number
  type: 'photo' | 'video'
  url: string
  width: number
  height: number
  query: string
  downloadDir: string
  status: 'pending' | 'downloading' | 'completed' | 'failed'
  progress: number
  error?: string
  filePath?: string
  retries: number
  cancelled?: boolean
  backingOff?: boolean
}

export class PexelsDownloader {
  private queue: DownloadTask[] = []
  private activeCount = 0
  private maxConcurrency = 3
  private onTaskUpdate?: (task: DownloadTask) => void
  private requestTimeoutSeconds = 60
  private idleResolvers: Array<() => void> = []
  private activeControllers = new Map<string, AbortController>()
  private refreshUrl?: (
    type: 'photo' | 'video',
    assetId: number,
    currentUrl: string
  ) => Promise<string>

  constructor(
    maxConcurrency = 3,
    onTaskUpdate?: (task: DownloadTask) => void,
    requestTimeoutSeconds = 60,
    refreshUrl?: (type: 'photo' | 'video', assetId: number, currentUrl: string) => Promise<string>
  ) {
    this.maxConcurrency = maxConcurrency
    this.onTaskUpdate = onTaskUpdate
    this.requestTimeoutSeconds = requestTimeoutSeconds
    this.refreshUrl = refreshUrl
  }

  public getTasks(): DownloadTask[] {
    return this.queue
  }

  public cancelAll(reason = 'Download cancelled'): void {
    for (const task of this.queue) {
      if (task.status !== 'pending' && task.status !== 'downloading') continue

      task.cancelled = true
      task.status = 'failed'
      task.error = reason
      this.activeControllers.get(task.id)?.abort()

      if (this.onTaskUpdate) this.onTaskUpdate(task)
    }

    this.resolveIdleIfNeeded()
  }

  public async waitForIdle(): Promise<void> {
    if (this.isIdle()) return

    await new Promise<void>((resolve) => {
      this.idleResolvers.push(resolve)
    })
  }

  public enqueue(
    assetId: number,
    type: 'photo' | 'video',
    url: string,
    width: number,
    height: number,
    query: string,
    downloadDir: string
  ): string {
    const existing = findInFlightDownload(this.queue, assetId, type)
    if (existing) {
      return existing.id
    }

    const id = `${type}_${assetId}_${Date.now()}`
    const task: DownloadTask = {
      id,
      assetId,
      type,
      url,
      width,
      height,
      query,
      downloadDir,
      status: 'pending',
      progress: 0,
      retries: 0
    }
    this.queue.push(task)
    this.processNext()
    return id
  }

  private processNext(): void {
    if (this.activeCount >= this.maxConcurrency) return

    const nextTask = this.queue.find((t) => t.status === 'pending' && !t.backingOff)
    if (!nextTask) {
      this.resolveIdleIfNeeded()
      return
    }

    nextTask.status = 'downloading'
    this.activeCount++
    if (this.onTaskUpdate) this.onTaskUpdate(nextTask)

    this.runDownload(nextTask)
      .then((filePath) => {
        nextTask.status = 'completed'
        nextTask.progress = 100
        nextTask.filePath = filePath
        this.activeCount--
        if (this.onTaskUpdate) this.onTaskUpdate(nextTask)
        this.processNext()
      })
      .catch(async (err) => {
        const apiError = classifyFetchError(err)
        const canRetry =
          !nextTask.cancelled &&
          nextTask.retries < 2 &&
          (apiError.isRetryable || !(err instanceof ApiError))

        if (canRetry) {
          nextTask.retries++

          if (this.refreshUrl) {
            try {
              const newUrl = await this.refreshUrl(nextTask.type, nextTask.assetId, nextTask.url)
              if (newUrl && newUrl !== nextTask.url) {
                nextTask.url = newUrl
              }
            } catch (refreshErr) {
              console.error(`Failed to refresh download URL for task ${nextTask.id}:`, refreshErr)
            }
          }

          nextTask.status = 'pending'
          nextTask.backingOff = true
          this.activeCount--
          // Exponential backoff
          const delay = Math.pow(2, nextTask.retries) * 1000
          if (this.onTaskUpdate) this.onTaskUpdate(nextTask)
          setTimeout(() => {
            if (nextTask.status !== 'pending') return
            nextTask.backingOff = false
            if (this.onTaskUpdate) this.onTaskUpdate(nextTask)
            this.processNext()
          }, delay)
          // Process other pending tasks immediately while this one backs off
          this.processNext()
        } else {
          nextTask.status = 'failed'
          nextTask.error = nextTask.cancelled
            ? nextTask.error || 'Download cancelled'
            : apiError.message
          this.activeCount--
          if (this.onTaskUpdate) this.onTaskUpdate(nextTask)
          this.resolveIdleIfNeeded()
          this.processNext()
        }
      })
  }

  private isIdle(): boolean {
    return (
      this.activeCount === 0 &&
      !this.queue.some((t) => t.status === 'pending' || t.status === 'downloading')
    )
  }

  private resolveIdleIfNeeded(): void {
    if (!this.isIdle()) return

    const resolvers = this.idleResolvers.splice(0)
    for (const resolve of resolvers) {
      resolve()
    }
  }

  private async runDownload(task: DownloadTask): Promise<string> {
    validateDownloadUrl(task.url)

    let slugifiedQuery =
      task.query
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'asset'
    if (slugifiedQuery.length > 50) {
      slugifiedQuery = slugifiedQuery.slice(0, 50).replace(/-$/, '')
    }

    const controller = new AbortController()
    this.activeControllers.set(task.id, controller)
    let timeoutId = setTimeout(() => controller.abort(), this.requestTimeoutSeconds * 1000)

    const cleanupController = (): void => {
      clearTimeout(timeoutId)
      this.activeControllers.delete(task.id)
    }

    const resetTimeout = (): void => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(() => controller.abort(), this.requestTimeoutSeconds * 1000)
    }

    let response: Response
    try {
      response = await fetch(task.url, { signal: controller.signal })

      if (response.url) {
        validateDownloadUrl(response.url)
      }

      if (!response.ok) {
        throw new ApiError(
          `HTTP Error: ${response.status} ${response.statusText}`,
          isRetryableDownloadStatus(response.status) ? 'transient' : 'permanent',
          response.status
        )
      }
      if (!response.body) {
        throw new Error('Response body is empty')
      }

      const contentType = (response.headers.get('content-type') || '').toLowerCase()
      let ext = task.type === 'photo' ? '.jpeg' : '.mp4'
      if (task.type === 'photo') {
        if (contentType.includes('png')) ext = '.png'
        else if (contentType.includes('webp')) ext = '.webp'
      } else {
        if (contentType.includes('quicktime')) ext = '.mov'
        else if (contentType.includes('webm')) ext = '.webm'
      }

      // Ensure target folder exists
      const subfolder = task.type === 'photo' ? 'photos' : 'videos'
      const targetFolder = join(task.downloadDir, subfolder)
      await fsPromises.mkdir(targetFolder, { recursive: true })

      const fileName = `${task.type}_${task.assetId}_${task.width}x${task.height}_${slugifiedQuery}${ext}`
      const finalPath = join(targetFolder, fileName)

      // Stream download
      const tempPath = finalPath + '.tmp'
      const fileStream = createWriteStream(tempPath)

      const contentLength = Number(response.headers.get('content-length') || 0)

      let downloadedBytes = 0

      // PassThrough stream taps into the data flow to update progress and reset the request timeout
      const progressStream = new PassThrough()
      progressStream.on('data', (chunk: Buffer) => {
        resetTimeout()
        downloadedBytes += chunk.length
        if (contentLength > 0) {
          const newProgress = Math.round((downloadedBytes / contentLength) * 100)
          if (newProgress !== task.progress) {
            task.progress = newProgress
            if (this.onTaskUpdate) this.onTaskUpdate(task)
          }
        }
      })

      try {
        const nodeReadable = Readable.fromWeb(
          response.body as unknown as Parameters<typeof Readable.fromWeb>[0]
        )
        await pipeline(nodeReadable, progressStream, fileStream, { signal: controller.signal })

        // Rename temp file to final destination path
        await fsPromises.rename(tempPath, finalPath)
        return finalPath
      } catch (error) {
        fileStream.destroy()
        progressStream.destroy()
        try {
          await fsPromises.unlink(tempPath)
        } catch {
          // Ignore unlink errors
        }
        throw error
      }
    } catch (err) {
      throw err instanceof ApiError ? err : classifyFetchError(err)
    } finally {
      cleanupController()
    }
  }
}
