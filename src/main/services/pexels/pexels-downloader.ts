import * as fs from 'fs'
import { promises as fsPromises } from 'fs'
import { join } from 'path'

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
}

export class PexelsDownloader {
  private queue: DownloadTask[] = []
  private activeCount = 0
  private maxConcurrency = 3
  private onTaskUpdate?: (task: DownloadTask) => void
  private requestTimeoutSeconds = 60

  constructor(maxConcurrency = 3, onTaskUpdate?: (task: DownloadTask) => void, requestTimeoutSeconds = 60) {
    this.maxConcurrency = maxConcurrency
    this.onTaskUpdate = onTaskUpdate
    this.requestTimeoutSeconds = requestTimeoutSeconds
  }

  public setConcurrency(limit: number): void {
    this.maxConcurrency = limit
    this.processNext()
  }

  public setOnTaskUpdate(callback: (task: DownloadTask) => void): void {
    this.onTaskUpdate = callback
  }

  public getTasks(): DownloadTask[] {
    return this.queue
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

    const nextTask = this.queue.find((t) => t.status === 'pending')
    if (!nextTask) return

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
        if (nextTask.retries < 2) {
          nextTask.retries++
          nextTask.status = 'pending'
          this.activeCount--
          // Exponential backoff
          const delay = Math.pow(2, nextTask.retries) * 1000
          if (this.onTaskUpdate) this.onTaskUpdate(nextTask)
          setTimeout(() => this.processNext(), delay)
        } else {
          nextTask.status = 'failed'
          nextTask.error = err instanceof Error ? err.message : String(err)
          this.activeCount--
          if (this.onTaskUpdate) this.onTaskUpdate(nextTask)
          this.processNext()
        }
      })
  }

  private async runDownload(task: DownloadTask): Promise<string> {
    const slugifiedQuery = task.query
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'asset'

    // Determine temporary extension, download and check content-type
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeoutSeconds * 1000)

    let response: Response
    try {
      response = await fetch(task.url, { signal: controller.signal })
    } finally {
      clearTimeout(timeoutId)
    }

    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status} ${response.statusText}`)
    }
    if (!response.body) {
      throw new Error('Response body is empty')
    }

    const contentType = response.headers.get('content-type') || ''
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
    const fileStream = fs.createWriteStream(tempPath)
    
    const reader = response.body.getReader()
    const contentLength = Number(response.headers.get('content-length') || 0)
    let downloadedBytes = 0

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        
        fileStream.write(Buffer.from(value))
        downloadedBytes += value.length
        
        if (contentLength > 0) {
          const newProgress = Math.round((downloadedBytes / contentLength) * 100)
          if (newProgress !== task.progress) {
            task.progress = newProgress
            if (this.onTaskUpdate) this.onTaskUpdate(task)
          }
        }
      }
    } finally {
      fileStream.end()
    }

    // Wait for stream to finish writing fully
    await new Promise<void>((resolve, reject) => {
      fileStream.on('finish', () => resolve())
      fileStream.on('error', (err) => reject(err))
    })

    // Rename temp file to final destination path
    await fsPromises.rename(tempPath, finalPath)
    return finalPath
  }
}
