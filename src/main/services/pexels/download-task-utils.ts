export interface InFlightDownloadTask {
  assetId: number
  type: string
  status: string
}

/** CDN 401/403 usually means an expired signed URL — retry so refreshUrl can run. */
export function isRetryableDownloadStatus(status: number): boolean {
  return status === 401 || status === 403 || status === 408 || status === 429 || status >= 500
}

export function findInFlightDownload<T extends InFlightDownloadTask>(
  queue: T[],
  assetId: number,
  type: string
): T | undefined {
  return queue.find(
    (task) =>
      task.assetId === assetId &&
      task.type === type &&
      (task.status === 'pending' || task.status === 'downloading')
  )
}
