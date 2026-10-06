export interface FlatAsset {
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
  beatId: string
  beatText: string
  jobId?: string
}

export interface GroupedProject {
  jobId: string
  title: string
  assets: FlatAsset[]
}

export type TypeFilter = 'all' | 'video' | 'photo'
export type StatusFilter = 'all' | 'completed' | 'failed'
