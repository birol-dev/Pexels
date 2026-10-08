import { visualStyleLine } from './style-guidance.ts'
import type { BeatAssetStatus } from './tool-schemas.ts'

export type SearchMode = 'focused' | 'broad'

export const DEFAULT_SEARCH_MODE: SearchMode = 'focused'

/** Extra system-prompt block injected only for Broad search mode. */
export const BROAD_SEARCH_GUIDANCE = `Broad search mode guidance:
- Prefer common stock-footage vocabulary over niche, branded, or overly specific phrases. Broad queries like "Nature", "Tigers", or "People" often work better on Pexels than long adjective-heavy strings.
- Try several angles per beat (subject, location, mood/action, related object) before giving up on that beat.
- If the first page of results is weak or empty, immediately broaden: drop adjectives, swap synonyms, and go more generic instead of digging deeper into a bad query.
- Follow the safety settings below.`

export type SystemPromptBeat = {
  id: string
  visualPrompt: string
  status: string
  assets: Array<{ id: string; type: string; status: string }>
}

/** Extra system-prompt block injected only for Focused search mode (the default). */
export const FOCUSED_SEARCH_GUIDANCE = `Focused search mode guidance:
- Match each beat's visualPrompt closely: lead with its main subject and keep its key action or setting.
- One well-built query per beat is usually enough. If the results are weak, change one element (swap a synonym or drop one modifier) and search again.
- If two refined queries still give nothing good, take the closest acceptable result instead of leaving the beat empty.`

/** Pexels-specific query advice shared by both search modes. */
export const PEXELS_QUERY_GUIDANCE = `Writing Pexels queries:
- Write queries in English, translating the beat if the script is in another language.
- Pexels has no search operators: no quotes, no AND/OR, and no negation, so "office without people" will return people.
- Use 1-4 words: a subject plus an action or setting, such as "barista pouring latte" or "city skyline night".
- Turn narration into something filmable. "The market crashed overnight and fortunes vanished" becomes "stock market screen red". An abstract idea like "growth" becomes "seedling in sunlight".
- To keep people out of frame, search for objects, places, or nature ("empty office desk"), not for the absence of people.`

export type BuildStockScoutSystemPromptInput = {
  searchMode: SearchMode
  platform: string
  style: string
  /** The one-paragraph visual direction the idea step wrote, when there is one. */
  visualConcept?: string
  mix: string
  maxAssetsPerBeat: number
  maxTotalDownloads: number
  skipExplicit: boolean
  avoidPeople: boolean
  /** Number of beats in the job; lets the prompt call out a cap lower than the beat count. */
  beatCount?: number
  /** Job-wide model-turn budget; lets the prompt tell the model to batch its calls. */
  maxIterations?: number
}

export type BeatCatalogItem = {
  id: string
  text?: string
  visualPrompt: string
}

export function buildStockScoutSystemPrompt(input: BuildStockScoutSystemPromptInput): string {
  const searchModeLabel = input.searchMode === 'broad' ? 'Broad' : 'Focused'
  const modeBlock = input.searchMode === 'broad' ? BROAD_SEARCH_GUIDANCE : FOCUSED_SEARCH_GUIDANCE

  const capNote =
    input.beatCount !== undefined && input.beatCount > input.maxTotalDownloads
      ? `\n- The script has ${input.beatCount} beats but the total cap is ${input.maxTotalDownloads}, so not every beat can get an asset. Cover the beats in order and stop at the cap.`
      : ''
  const budgetNote =
    input.maxIterations !== undefined
      ? `\n- The whole job has at most ${input.maxIterations} turns and each reply you send is one turn. The live status snapshot shows how many are left.`
      : ''

  const safety = [
    input.skipExplicit ? 'Do not search for explicit or adult content.' : '',
    input.avoidPeople
      ? 'Keep people out of frame: search for objects, places, nature, or hands.'
      : ''
  ].filter(Boolean)
  const safetyLine = safety.length > 0 ? `\n- Safety: ${safety.join(' ')}` : ''

  const visualConcept = input.visualConcept?.trim()
  const conceptLine = visualConcept ? `\n- Visual direction for this video: ${visualConcept}` : ''

  // The tool list already limits the model to the types the mix allows.
  const mixesTypes = input.mix !== 'videos only' && input.mix !== 'photos only'
  const rules = [
    'Search for things a camera can film: subjects, actions, places, objects, light, and weather.',
    'No copyrighted characters, logos, brand names, or named people. Use a generic equivalent, such as "smartphone" for a phone brand.',
    "If results are weak, reword or broaden the query as the search mode guidance describes. Don't give up on a beat after one attempt.",
    'Never select the same asset for two beats.',
    ...(mixesTypes
      ? [
          'Prefer videos for beats with motion and photos for objects, textures, or establishing shots.'
        ]
      : [])
  ]
    .map((rule, index) => `${index + 1}. ${rule}`)
    .join('\n')

  return `You are StockScout. You find Pexels stock footage for a narrated video, one visual beat at a time.

Rules:
${rules}

${modeBlock}

${PEXELS_QUERY_GUIDANCE}

What you can see: search results are text only. Each result has pexelsId, about, shape (landscape, portrait, or square), and size. A video result also has seconds and fullHd, which is true when a full-HD file exists. For a photo, about is its alt text, or the slug of its Pexels page when it has none. For a video, about is the slug of its Pexels page, for example "waves crashing on rocks" from ".../video/waves-crashing-on-rocks-1234/", and it is the only description a video has. You cannot view the images, so judge relevance from about and do not claim to have judged composition or visual quality. Pexels lists the most relevant results first, so when several look equally good, prefer the earlier ones. Older search results may be shortened to a list of ids and descriptions marked compacted. You can still select from them.

When selecting assets, prioritize:
- relevance to the script beat, judged from about
- shape that matches the platform: searches already return the platform's shape, so prefer results whose shape matches. Set orientation on a search only to look for a different shape.
- full-HD or better resolution (a video should have fullHd true)
- for videos, clips of about 5-20 seconds, which are easiest to edit
- variety across beats: avoid picking near-identical clips for different beats

You may add a 2 to 4 word reason to a rejection, such as off topic or wrong shape. Reject only results you considered and ruled out.

Script configuration:
- Search mode: ${searchModeLabel}${
    input.searchMode === 'broad'
      ? ' (prefer common stock vocabulary, multiple angles, and immediate broadening on weak results)'
      : ' (tighter match to each beat)'
  }
- Platform: ${input.platform}
- Visual style: ${visualStyleLine(input.style)}${conceptLine}
- Asset mix: ${input.mix}
- Max assets per beat: ${input.maxAssetsPerBeat}
- Max total downloads allowed: ${input.maxTotalDownloads}${safetyLine}

The visual beat catalog is provided in the first user message and does not change during the job.
A later user message may include a live beat status snapshot; treat that snapshot as the current truth for asset progress.

How to work efficiently:
- Make several tool calls in one turn. Do not spend a whole turn on one beat while others are waiting.${budgetNote}${capNote}

Your workflow:
1. Search for every beat that has no asset yet, one search call per beat, all in one reply.
2. Select the best result for each beat in one select_assets_for_download call. Selecting starts the download.
3. Repeat for beats whose results were weak. When every beat has an asset, stop calling tools. Nothing else is needed.

If a tool result says a call was interrupted, repeat it if it is still needed. If a selection is refused, the result says why: adjust the choice and do not retry the same asset.
`
}

export type BroadNudgeBeat = BeatAssetStatus & {
  id: string
  visualPrompt: string
  searchQueries?: string[]
}

/**
 * Beats that still lack usable assets and have only tried 0–1 unique search queries.
 * Broad mode should nudge the model to issue a different, broader query for these.
 */
export function getBeatsNeedingBroaderSearch(beats: BroadNudgeBeat[]): BroadNudgeBeat[] {
  return beats.filter((b) => {
    const hasUsableAsset =
      Array.isArray(b.assets) && b.assets.length > 0 && b.assets.some((a) => a.status !== 'failed')
    if (hasUsableAsset) return false
    const uniqueQueries = new Set((b.searchQueries || []).map((q) => q.trim().toLowerCase()))
    return uniqueQueries.size <= 1
  })
}

export function buildBeatCatalogUserContent(beats: BeatCatalogItem[]): string {
  const catalog = beats.map((beat) => ({
    id: beat.id,
    text: beat.text,
    visualPrompt: beat.visualPrompt
  }))
  return `Visual beat catalog (stable for this job):
${JSON.stringify(catalog, null, 2)}`
}

export type TurnBudget = { used: number; max: number }

/** One line telling the model where it is in the job-wide turn budget. */
export function describeTurnBudget(turns: TurnBudget): string {
  const left = Math.max(0, turns.max - turns.used)
  const warning = left <= 3 ? ' Finish the beats that are still empty now.' : ''
  return `Turn ${turns.used} of ${turns.max} (${left} left after this one).${warning}`
}

export function buildLiveBeatStatusUserContent(
  beats: SystemPromptBeat[],
  turns?: TurnBudget
): string {
  const snapshot = beats.map((beat) => ({
    id: beat.id,
    status: beat.status,
    assets: beat.assets.map((asset) => ({
      id: asset.id,
      type: asset.type,
      status: asset.status
    }))
  }))
  const turnLine = turns ? `\n${describeTurnBudget(turns)}` : ''
  return `Live beat status snapshot (variable; prefer this over earlier status):${turnLine}
${JSON.stringify(snapshot, null, 2)}`
}

export function messagesWithCacheStablePrefix<T extends { role: string; content: string | null }>(
  conversation: T[],
  beats: Array<BeatCatalogItem & SystemPromptBeat>,
  turns?: TurnBudget
): Array<T | { role: 'user'; content: string }> {
  return [
    { role: 'user', content: buildBeatCatalogUserContent(beats) },
    ...conversation,
    { role: 'user', content: buildLiveBeatStatusUserContent(beats, turns) }
  ]
}

export function buildBroadSearchNudgeMessage(beats: BroadNudgeBeat[]): string | null {
  const needy = getBeatsNeedingBroaderSearch(beats)
  if (needy.length === 0) return null

  const sample = needy
    .slice(0, 4)
    .map((b) => {
      const tried = (b.searchQueries || []).filter(Boolean)
      const triedNote = tried.length ? ` tried "${tried[0]}"` : ' not searched yet'
      return `${b.id} ("${b.visualPrompt.slice(0, 50)}")${triedNote}`
    })
    .join('; ')

  return `${needy.length} beats have no usable results yet (${sample}). Search again with a broader query: drop adjectives or try a synonym, place, or mood.`
}

/**
 * Resolve searchMode from a persisted settings snapshot (rerun / resume).
 * Missing or unknown values default to focused so old manifests stay valid.
 */
export function resolveSearchModeFromSnapshot(searchMode: string | undefined | null): SearchMode {
  return searchMode === 'broad' ? 'broad' : DEFAULT_SEARCH_MODE
}

/**
 * Whether to inject a Broad-mode nudge after a tool-using turn.
 * Never nudge after select/download, and never after a search turn — that would
 * push the model to search other beats instead of selecting from fresh results.
 * Empty-tool-turn nudges still cover stalls.
 */
export function shouldInjectPostToolBroadNudge(input: {
  turnHadSelectOrDownload: boolean
  searchedBeatCount: number
}): boolean {
  if (input.turnHadSelectOrDownload) return false
  if (input.searchedBeatCount > 0) return false
  return true
}
