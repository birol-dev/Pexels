# Agent Loop, Prompt, And Tool Plan

Research date: 2026-05-27

## Agent Design

The app needs a deterministic looping agent, not a loose chatbot.

The main loop:

1. Build initial agent state from script and user settings.
2. Split the script into numbered sentences in code, then ask the LLM once, with the `submit_beat_plan` tool, where each visual beat ends. There is no retry: code repairs bad beat ends.
3. Ask LLM to create search queries for the next unresolved beat. The beat plan already suggests 2 or 3 queries per beat.
4. Allow LLM to call Pexels search tools.
5. App executes tool calls in main process.
6. Feed tool results back to the LLM.
7. Ask LLM to select/reject assets.
8. Selecting an asset starts its download in code (after the user approves it, when approval is required). The model does not call a download tool.
9. Repeat until all beats are resolved or max iterations is reached.
10. Write final manifest and summary.

The loop must be implemented in code. The model is allowed to choose tools, but code decides when the run is finished, when limits are reached, and whether arguments are valid.

## Agent State

```ts
type AgentState = {
  jobId: string
  projectId: string
  script: string
  settings: JobSettings
  beats: VisualBeat[]
  selectedAssets: AssetCandidate[]
  downloadedAssets: AssetRecord[]
  rejectedAssets: RejectedAsset[]
  iteration: number
  status: 'planning' | 'searching' | 'downloading' | 'finalizing' | 'done' | 'failed' | 'cancelled'
}
```

```ts
type VisualBeat = {
  id: string
  order: number
  scriptExcerpt: string
  visualIntent: string
  mood: string
  subjects: string[]
  searchQueries: string[]
  desiredAssetTypes: ('photo' | 'video')[]
  minNeeded: number
  status: 'pending' | 'searched' | 'selected' | 'downloaded' | 'skipped'
}
```

## Termination Conditions

Stop the loop when any condition is true:

- all beats are `downloaded` or `skipped`
- total downloaded assets >= user max total downloads
- iteration >= max agent iterations
- user cancels
- provider returns repeated invalid tool calls 3 times
- no useful Pexels results after all generated queries

Default `maxAgentIterations`: `30`.

## System Prompt

This is the first implementation draft. The prompt the app sends is built by `buildStockScoutSystemPrompt` in `src/main/services/agent/search-mode.ts`, and `test/prompt-quality.test.ts` pins what it says. It is shorter than this draft, and it tells the model that selecting starts the download.

```text
You are StockScout, a careful stock-media research agent for YouTube creators.

Your job is to transform a user's video script into practical Pexels stock photo and stock video searches, then select useful assets for each visual beat.

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

When selecting assets, prioritize:

- relevance to the script beat
- clear subject visibility
- high resolution
- landscape orientation for YouTube unless the target platform is vertical
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
```

## Developer Prompt

Add a short developer prompt per run:

```text
Current job settings:
- Target platform: {{targetPlatform}}
- Visual style: {{visualStyle}}
- Asset mix: {{assetMix}}
- Options per beat: {{maxAssetsPerBeat}} (a target, not only an upper bound)
- Max total downloads: {{maxTotalDownloads}}
- Require approval before downloads: {{requireApprovalBeforeDownloads}}

Use only the available tools. If you need stock media, call a Pexels search tool. If you have enough selected assets, produce a final summary.
```

## Tool Definitions

The internal tool schema must be provider-neutral. Convert these definitions into OpenAI/OpenRouter/Gemini provider shapes in adapter code.

### `submit_beat_plan`

The beat split is one forced tool call with no external side effects (`src/main/services/llm/beat-parse-tool.ts`). Code splits the script into sentences (sentences over 40 words are cut into chunks of 15) and sends them numbered, one per line. The model never copies script text. It returns where each beat ends and what footage the beat needs. Code builds each beat's text from the sentences, so the beats always add up to the script.

```ts
type SubmitBeatPlanArgs = {
  beats: Array<{
    lastSentence: number // number of the last sentence in the beat
    visualPrompt: string // 3 to 8 words
    queries: string[] // 2 or 3 Pexels queries, most specific first
    assetType: 'video' | 'photo' | 'either'
  }>
}
```

A beat end that is out of range or does not increase is clamped, and sentences left over after the last beat join it, with a log line. A missing or empty `beats` list fails the job. The request is not repeated.

### `search_pexels_photos`

Purpose: search Pexels photos for one visual beat.

```ts
const SearchPexelsPhotosArgsSchema = z.object({
  beatId: z.string().min(1),
  query: z.string().min(2).max(100),
  orientation: z.enum(['landscape', 'portrait', 'square']).optional(),
  size: z.enum(['large', 'medium', 'small']).optional(),
  color: z.string().optional(),
  page: z.number().int().min(1).max(10).default(1),
  perPage: z.number().int().min(1).max(30).default(15)
})
```

`orientation` defaults to the platform's shape (landscape for YouTube, portrait otherwise) when the model leaves it out.

Tool result. The model judges relevance from text only, so it gets no URLs, photographer names or preview links. The app keeps the full candidate (variants, photographer, preview) for the selection and the manifest.

```ts
type SearchPexelsPhotosResult = {
  total_results: number
  results: Array<{
    pexelsId: number
    about: string // the alt text, or the slug of the Pexels page when there is none
    shape: 'landscape' | 'portrait' | 'square'
    size: string // "6000x4000"
  }>
  // Only when the safety settings hid results:
  filtered?: number
  note?: string // set when every result was hidden
}
```

### `search_pexels_videos`

Purpose: search Pexels videos for one visual beat.

```ts
const SearchPexelsVideosArgsSchema = z.object({
  beatId: z.string().min(1),
  query: z.string().min(2).max(100),
  orientation: z.enum(['landscape', 'portrait', 'square']).optional(),
  size: z.enum(['large', 'medium', 'small']).optional(),
  page: z.number().int().min(1).max(10).default(1),
  perPage: z.number().int().min(1).max(30).default(10)
})
```

Tool result. Like the photo result it has no URLs, so the app chooses the file to download.

```ts
type SearchPexelsVideosResult = {
  total_results: number
  results: Array<{
    pexelsId: number
    about: string // the slug of the Pexels page, the only description a video has
    shape: 'landscape' | 'portrait' | 'square'
    size: string // "3840x2160"
    seconds: number
    fullHd: boolean // a file of 1920 pixels or more exists
  }>
  filtered?: number
  note?: string
}
```

### `select_assets_for_download`

Purpose: let the LLM select candidates after search results are visible.

Selecting is what starts a download. The app checks the selection (the asset came from a search of this job, the mix allows its type, the per-beat and total caps hold, no other beat has it), picks the file, and queues the download itself. When approval is required, the selection stays `pending` and the loop pauses after the turn until the user approves.

```ts
const SelectAssetsForDownloadArgsSchema = z.object({
  selections: z
    .array(
      z.object({
        beatId: z.string().min(1),
        assetType: z.enum(['photo', 'video']),
        pexelsId: z.number().int().positive(),
        variantUrl: z.string().url().optional(), // without it the app picks the best file
        reason: z.string().max(500).optional()
      })
    )
    .default([]),
  rejections: z
    .array(
      z.object({
        beatId: z.string().min(1),
        assetType: z.enum(['photo', 'video']),
        pexelsId: z.number().int().positive(),
        reason: z.string().max(500).optional() // stored as "Not chosen" when empty
      })
    )
    .default([])
})
```

### `download_selected_assets`

Purpose: report the download status of assets that were already selected. It is optional and the prompt does not mention it, because selecting already queues the download.

Important: The model must not provide arbitrary download URLs here. It names `pexelsId` and `assetType` only; assets that were not selected first, assets the user rejected, and assets waiting for approval are refused.

```ts
const DownloadSelectedAssetsArgsSchema = z.object({
  assetIds: z
    .array(
      z.object({
        assetType: z.enum(['photo', 'video']),
        pexelsId: z.number().int().positive()
      })
    )
    .default([])
})
```

Tool result:

```ts
type DownloadSelectedAssetsResult = {
  downloaded: Array<{ assetType: 'photo' | 'video'; pexelsId: number; status: string }>
  failed: Array<{
    assetType: 'photo' | 'video'
    pexelsId: number
    reason: string
    retryable: boolean
  }>
}
```

## Tool Execution Safety

The app must validate every tool call before execution:

1. Parse arguments as JSON.
2. Validate with Zod.
3. Reject unknown fields if they matter for security.
4. Reject download URLs that were not returned by Pexels in this job.
5. Enforce user max downloads in code.
6. Enforce provider and Pexels rate limits in code.
7. Emit a structured error result back to the LLM for recoverable errors.
8. Enforce the safety settings in code, not only in the prompt (`src/main/services/agent/content-filters.ts`). With "Skip explicit content" on, a query with an explicit word is refused and results described as explicit are dropped. With "Avoid people & faces" on, results whose description mentions people are dropped. Dropped results are never cached, so they cannot be selected, and the search result reports how many were hidden in `filtered`. Both are best effort: they read a photo's alt text or a video's page slug, not the picture.

## Query Strategy

The agent should generate 2-5 queries per beat.

Example script line:

```text
Most founders think productivity means doing more, but real leverage comes from deleting low-value work.
```

Good queries:

- `startup founder office thinking`
- `busy entrepreneur laptop`
- `clean desk productivity`
- `team planning whiteboard`

Bad queries:

- `real leverage comes from deleting low-value work`
- `productivity philosophy`
- `founder becomes successful viral moment`

## Asset Selection Rules

Landscape YouTube:

- Prefer width >= height.
- Prefer 1920x1080 or larger video variants.
- Prefer photos wider than 1600 px.

Vertical Shorts/Reels/TikTok:

- Prefer height > width.
- If no vertical result exists, allow landscape only with `wrong_orientation` warning.

Generic quality rules:

- avoid duplicate shots
- avoid watermarked-looking previews
- avoid overly staged business imagery unless style is `business`
- prefer clips under 30 seconds unless the beat needs longer

## Human Approval Mode

If `requireApprovalBeforeDownloads` is true:

1. Agent may search and select. A selection is recorded as `pending` and nothing is queued.
2. App pauses the loop after the turn that selected.
3. UI shows proposed assets.
4. User approves/rejects.
5. App downloads approved assets.

Do not ask the LLM to request approval in natural language. Approval is a UI state.
