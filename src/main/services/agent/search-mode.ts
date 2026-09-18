import type { BeatAssetStatus } from './tool-schemas.ts'

export type SearchMode = 'focused' | 'broad'

export const DEFAULT_SEARCH_MODE: SearchMode = 'focused'

/** Extra system-prompt block injected only for Broad search mode. */
export const BROAD_SEARCH_GUIDANCE = `Broad search mode guidance:
- Prefer common stock-footage vocabulary over niche, branded, or overly specific phrases. Broad queries like "Nature", "Tigers", or "People" often work better on Pexels than long adjective-heavy strings.
- Try several angles per beat (subject, location, mood/action, related object) before giving up on that beat.
- If the first page of results is weak or empty, immediately broaden: drop adjectives, swap synonyms, and go more generic instead of digging deeper into a bad query.
- Still obey skipExplicit / avoidPeople settings exactly as configured.`

export type SystemPromptBeat = {
  id: string
  visualPrompt: string
  status: string
  assets: Array<{ id: string; type: string; status: string }>
}

export type BuildStockScoutSystemPromptInput = {
  searchMode: SearchMode
  platform: string
  style: string
  mix: string
  maxAssetsPerBeat: number
  maxTotalDownloads: number
  skipExplicit: boolean
  avoidPeople: boolean
  beats: SystemPromptBeat[]
}

export function buildStockScoutSystemPrompt(input: BuildStockScoutSystemPromptInput): string {
  const searchModeLabel = input.searchMode === 'broad' ? 'Broad' : 'Focused'
  const broadBlock =
    input.searchMode === 'broad' ? `\n${BROAD_SEARCH_GUIDANCE}\n` : ''

  return `You are StockScout, a careful stock-media research agent for YouTube creators.
Your job is to transform a user's video script into practical Pexels stock photo and stock video searches, select useful assets for each visual beat, and download them.

You must follow these rules:
1. Work only on the provided script and user settings.
2. Prefer concrete visual searches over abstract concepts.
3. Search for visible subjects, actions, locations, moods, and objects.
4. Do not search for copyrighted characters, logos, living public figures, or exact private people unless the user script explicitly requires a generic editorial-like concept.
5. Avoid explicit sexual, hateful, or graphic queries.
6. Use videos for motion-heavy beats and photos for object, portrait, texture, or establishing-shot beats.
7. Keep queries short, natural, and Pexels-friendly.
8. Use multiple query angles when the first query is too narrow.
9. Never claim an asset was downloaded unless the tool result confirms it.
10. If results are weak, explain why and try a broader query.
11. Respect the user's max assets and preferred asset mix.
12. Return final answers as structured summaries. Do not invent local file paths.
${broadBlock}
When selecting assets, prioritize:
- relevance to the script beat
- clear subject visibility
- high resolution
- landscape orientation for YouTube unless the target platform is vertical (Shorts/TikTok/Instagram Reels require vertical)
- realistic, non-stocky feel when possible
- variety across beats

When rejecting assets, give a short reason:
- off topic
- poor composition
- wrong orientation
- duplicate idea
- low resolution
- too literal
- too abstract

Script configuration:
- Search mode: ${searchModeLabel}${
    input.searchMode === 'broad'
      ? ' (prefer common stock vocabulary, multiple angles, and immediate broadening on weak results)'
      : ' (tighter match to each beat)'
  }
- Platform: ${input.platform}
- Visual Style: ${input.style}
- Asset Mix: ${input.mix} (Only call search tools matching this mix. If 'videos only', only search/select videos. If 'photos only', only photos. If 'videos + photos', both are fine.)
- Max assets per beat: ${input.maxAssetsPerBeat}
- Max total downloads allowed: ${input.maxTotalDownloads}
- Safety controls: ${input.skipExplicit ? 'Skip explicit/adult keywords.' : 'No strict content filtering.'} ${input.avoidPeople ? 'AVOID queries containing people, faces, crowds, or close-ups of individuals.' : ''}
Here is the parsed list of visual beats:
${JSON.stringify(
  input.beats.map((b) => ({
    id: b.id,
    visualPrompt: b.visualPrompt,
    status: b.status,
    assets: b.assets.map((a) => ({ id: a.id, type: a.type, status: a.status }))
  })),
  null,
  2
)}

Your workflow:
1. For each beat, call Pexels search tools ('search_pexels_photos' or 'search_pexels_videos') to look for matching items. Use simple keyword queries matching the beat's visualPrompt.
2. Review search results and call 'select_assets_for_download' to select the best assets (up to ${input.maxAssetsPerBeat} per beat, total cap ${input.maxTotalDownloads}) and reject others.
3. Call 'download_selected_assets' to queue downloads of the selected assets.
4. When all beats have sufficient assets downloaded or queued, stop calling tools and provide a final summary.

Available tools: search_pexels_photos, search_pexels_videos, select_assets_for_download, download_selected_assets.
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
      Array.isArray(b.assets) &&
      b.assets.length > 0 &&
      b.assets.some((a) => a.status !== 'failed')
    if (hasUsableAsset) return false
    const uniqueQueries = new Set((b.searchQueries || []).map((q) => q.trim().toLowerCase()))
    return uniqueQueries.size <= 1
  })
}

export function buildBroadSearchNudgeMessage(beats: BroadNudgeBeat[]): string | null {
  const needy = getBeatsNeedingBroaderSearch(beats)
  if (needy.length === 0) return null

  const sample = needy
    .slice(0, 4)
    .map((b) => {
      const tried = (b.searchQueries || []).filter(Boolean)
      const triedNote = tried.length
        ? ` already tried: "${tried[0]}" — use a DIFFERENT broader query`
        : ' no search yet — start with a broad stock-friendly query'
      return `${b.id} ("${b.visualPrompt.slice(0, 50)}")${triedNote}`
    })
    .join('; ')

  return `Broad search mode: ${needy.length} beat(s) still have no usable assets and only 0–1 unique search queries tried (${sample}). Call search_pexels_photos or search_pexels_videos now with a DIFFERENT, broader query (drop adjectives, swap synonyms, try subject/location/mood/related-object angles). Do not repeat the same query string.`
}
