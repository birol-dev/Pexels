import {
  candidateKey,
  photoCandidate,
  videoCandidate,
  type PexelsCandidate
} from '../../src/main/services/pexels/candidates.ts'
import type { PexelsPhoto, PexelsVideo } from '../../src/main/services/pexels/pexels-types.ts'
import type { StructuredRequest } from '../../src/main/services/llm/structured-request.ts'
import {
  initialPipelineState,
  type PipelineBeat,
  type PipelineContext,
  type PipelineSettings,
  type PipelineState
} from '../../src/main/services/pipeline/context.ts'
import { photo, video, type VideoFileSpec } from './pexels-fixtures.ts'

/** A photo candidate as the search step builds it: the fixture result plus what it says it shows. */
export function photoCand(id: number, alt: string, width = 6000, height = 4000): PexelsCandidate {
  return { ...photoCandidate(photo(id, alt, width, height), 'test'), about: alt }
}

/** A video candidate as the search step builds it. The slug is the description. */
export function videoCand(
  id: number,
  slug: string,
  files?: VideoFileSpec[],
  duration?: number
): PexelsCandidate {
  return {
    ...videoCandidate(video(id, slug, files, duration), 'test'),
    about: slug.replace(/-/g, ' ')
  }
}

export const DEFAULT_SETTINGS: PipelineSettings = {
  platform: 'YouTube',
  mix: 'videos + photos',
  searchMode: 'focused',
  style: 'Cinematic',
  optionsPerBeat: 1,
  maxTotalDownloads: 20,
  skipExplicit: true,
  avoidPeople: false,
  requireApproval: false
}

export function pipelineBeat(id: string, over: Partial<PipelineBeat> = {}): PipelineBeat {
  return {
    id,
    text: `Narration of ${id}.`,
    visualPrompt: `Footage for ${id}`,
    queries: [`query ${id}`],
    assetType: 'either',
    held: [],
    excluded: [],
    tried: [],
    ...over
  }
}

/** The ids of the beats in a request's user message: `beat_3: "text"` starts each one. */
export function beatIdsIn(userContent: string): string[] {
  return [...userContent.matchAll(/^(beat_\d+): /gm)].map((match) => match[1])
}

/** The candidate keys listed under each beat of a ranking request, in the order listed. */
export function offeredKeys(userContent: string): Map<string, string[]> {
  const offered = new Map<string, string[]>()
  let current: string[] = []
  for (const line of userContent.split('\n')) {
    const beat = /^(beat_\d+): /.exec(line)
    if (beat) {
      current = []
      offered.set(beat[1], current)
      continue
    }
    const key = /^- ((?:photo|video)_\d+): /.exec(line)
    if (key) current.push(key[1])
  }
  return offered
}

export type StructuredAnswer = (request: StructuredRequest<unknown>, call: number) => unknown

/** Answers every ranking request with all the keys it offered, and every broader request with one query per beat. */
export const defaultAnswer: StructuredAnswer = (request) => {
  if (request.tool.name === 'submit_rankings') {
    return {
      beats: [...offeredKeys(request.userContent)].map(([beatId, ranked]) => ({ beatId, ranked }))
    }
  }
  if (request.tool.name === 'submit_broader_queries') {
    return {
      beats: beatIdsIn(request.userContent).map((beatId) => ({
        beatId,
        queries: [`broader ${beatId}`]
      }))
    }
  }
  throw new Error(`No answer for ${request.tool.name}`)
}

export interface FakeContextOptions {
  beats: PipelineBeat[]
  settings?: Partial<PipelineSettings>
  /** Video results by exact query. Other queries find nothing. */
  videos?: Record<string, PexelsVideo[]>
  /** Photo results by exact query. Other queries find nothing. */
  photos?: Record<string, PexelsPhoto[]>
  answer?: StructuredAnswer
  /** Keys a beat refuses when asked to select them, as if the user had rejected them. */
  refuses?: Record<string, string[]>
  /** Called before each search is answered. Throwing fails that search. */
  onSearch?: (type: 'video' | 'photo', query: string) => void | Promise<void>
}

export interface FakeContext {
  ctx: PipelineContext
  controller: AbortController
  /** A fresh signal, as when a paused job is resumed. Beats, candidates and the logs carry over. */
  restart(): void
  /** The beats as the context shows them now. */
  beats: PipelineBeat[]
  searches: Array<{ type: 'video' | 'photo'; query: string }>
  requests: Array<{ tool: string; systemPrompt: string; userContent: string }>
  selections: Array<{ beatId: string; key: string }>
  holds: number
  /** A copy of the state at each save. */
  saves: PipelineState[]
  logs: Array<{ type: 'info' | 'error'; message: string }>
  progress: Array<{ step: string; percent: number }>
}

/**
 * A PipelineContext over in-memory fakes. It keeps no files and makes no request. A pick is
 * recorded on its beat as the runner does; it is refused when the beat refuses it or another beat
 * holds it.
 */
export function fakeContext(options: FakeContextOptions): FakeContext {
  const cache = new Map<string, PexelsCandidate>()
  const answer = options.answer ?? defaultAnswer
  const beats = options.beats.map((beat) => ({ ...beat }))
  const fake: FakeContext = {
    ctx: undefined as unknown as PipelineContext,
    controller: new AbortController(),
    restart() {
      fake.controller = new AbortController()
      fake.ctx.signal = fake.controller.signal
    },
    beats,
    searches: [],
    requests: [],
    selections: [],
    holds: 0,
    saves: [],
    logs: [],
    progress: []
  }

  fake.ctx = {
    settings: { ...DEFAULT_SETTINGS, ...options.settings },
    signal: fake.controller.signal,
    beats: () =>
      beats.map((beat) => ({
        ...beat,
        held: [...beat.held],
        excluded: [...beat.excluded],
        tried: [...beat.tried]
      })),
    async searchVideos(params) {
      fake.searches.push({ type: 'video', query: params.query })
      await options.onSearch?.('video', params.query)
      const videos = options.videos?.[params.query] ?? []
      return { total_results: videos.length, videos }
    },
    async searchPhotos(params) {
      fake.searches.push({ type: 'photo', query: params.query })
      await options.onSearch?.('photo', params.query)
      const photos = options.photos?.[params.query] ?? []
      return { total_results: photos.length, photos }
    },
    cacheCandidates(candidates) {
      for (const candidate of candidates) {
        cache.set(candidateKey(candidate.type, candidate.pexelsId), candidate)
      }
    },
    candidate: (key) => cache.get(key),
    noteQuery(beatId, query) {
      const beat = beats.find((b) => b.id === beatId)
      if (beat && !beat.tried.includes(query)) beat.tried.push(query)
    },
    async callStructured<T>(request: StructuredRequest<T>): Promise<T> {
      fake.requests.push({
        tool: request.tool.name,
        systemPrompt: request.systemPrompt,
        userContent: request.userContent
      })
      fake.controller.signal.throwIfAborted()
      const reply = answer(request as StructuredRequest<unknown>, fake.requests.length)
      return request.parse(JSON.stringify(reply))
    },
    select(beatId, key) {
      const beat = beats.find((b) => b.id === beatId)
      if (!beat || !cache.has(key)) return 'refused'
      if (options.refuses?.[beatId]?.includes(key)) return 'refused'
      if (beats.some((b) => b.held.includes(key))) return 'refused'
      beat.held.push(key)
      fake.selections.push({ beatId, key })
      return 'selected'
    },
    async holdForApproval() {
      fake.holds++
    },
    log: (type, message) => {
      fake.logs.push({ type, message })
    },
    progress: (step, percent) => {
      fake.progress.push({ step, percent })
    },
    async saveState(state) {
      fake.saves.push(structuredClone(state))
    }
  }
  return fake
}

/** A state a run could have been left in. */
export function stateAt(over: Partial<PipelineState>): PipelineState {
  return { ...initialPipelineState(), ...over }
}
