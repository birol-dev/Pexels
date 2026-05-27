# Agent Loop, Prompt, And Tool Plan

Research date: 2026-05-27

## Agent Design

The app needs a deterministic looping agent, not a loose chatbot.

The main loop:

1. Build initial agent state from script and user settings.
2. Ask LLM to analyze script into visual beats.
3. Ask LLM to create search queries for the next unresolved beat.
4. Allow LLM to call Pexels search tools.
5. App executes tool calls in main process.
6. Feed tool results back to the LLM.
7. Ask LLM to select/reject assets.
8. Download selected assets.
9. Repeat until all beats are resolved or max iterations is reached.
10. Write final manifest and summary.

The loop must be implemented in code. The model is allowed to choose tools, but code decides when the run is finished, when limits are reached, and whether arguments are valid.

## Agent State

```ts
type AgentState = {
  jobId: string;
  projectId: string;
  script: string;
  settings: JobSettings;
  beats: VisualBeat[];
  selectedAssets: AssetCandidate[];
  downloadedAssets: AssetRecord[];
  rejectedAssets: RejectedAsset[];
  iteration: number;
  status: "planning" | "searching" | "downloading" | "finalizing" | "done" | "failed" | "cancelled";
};
```

```ts
type VisualBeat = {
  id: string;
  order: number;
  scriptExcerpt: string;
  visualIntent: string;
  mood: string;
  subjects: string[];
  searchQueries: string[];
  desiredAssetTypes: ("photo" | "video")[];
  minNeeded: number;
  status: "pending" | "searched" | "selected" | "downloaded" | "skipped";
};
```

## Termination Conditions

Stop the loop when any condition is true:

- all beats are `downloaded` or `skipped`
- total downloaded assets >= user max total downloads
- iteration >= max agent iterations
- user cancels
- provider returns repeated invalid tool calls 3 times
- no useful Pexels results after all generated queries

Default `maxAgentIterations`: `20`.

## System Prompt

Use this prompt as the first implementation draft. Keep it in `src/main/services/agent/prompts.ts`.

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
- Max assets per beat: {{maxAssetsPerBeat}}
- Max total downloads: {{maxTotalDownloads}}
- Require approval before downloads: {{requireApprovalBeforeDownloads}}

Use only the available tools. If you need stock media, call a Pexels search tool. If you have enough selected assets, produce a final summary.
```

## Tool Definitions

The internal tool schema must be provider-neutral. Convert these definitions into OpenAI/OpenRouter/Gemini provider shapes in adapter code.

### `analyze_script_beats`

This can be implemented as a tool or as a structured non-tool LLM step. Prefer structured output without external side effects.

```ts
const AnalyzeScriptBeatsSchema = z.object({
  beats: z.array(z.object({
    scriptExcerpt: z.string().min(1),
    visualIntent: z.string().min(1),
    mood: z.string().min(1),
    subjects: z.array(z.string()).min(1),
    desiredAssetTypes: z.array(z.enum(["photo", "video"])).min(1),
    minNeeded: z.number().int().min(0).max(5),
  })).min(1).max(80),
});
```

### `search_pexels_photos`

Purpose: search Pexels photos for one visual beat.

```ts
const SearchPexelsPhotosArgsSchema = z.object({
  beatId: z.string().min(1),
  query: z.string().min(2).max(100),
  orientation: z.enum(["landscape", "portrait", "square"]).optional(),
  size: z.enum(["large", "medium", "small"]).optional(),
  color: z.string().optional(),
  page: z.number().int().min(1).max(10).default(1),
  perPage: z.number().int().min(1).max(80).default(15),
});
```

Tool result:

```ts
type SearchPexelsPhotosResult = {
  results: Array<{
    pexelsId: number;
    url: string;
    photographer: string;
    photographerUrl?: string;
    width: number;
    height: number;
    avgColor?: string;
    alt?: string;
    previewUrl: string;
    downloadableVariants: Array<{
      label: string;
      url: string;
      width?: number;
      height?: number;
    }>;
  }>;
};
```

### `search_pexels_videos`

Purpose: search Pexels videos for one visual beat.

```ts
const SearchPexelsVideosArgsSchema = z.object({
  beatId: z.string().min(1),
  query: z.string().min(2).max(100),
  orientation: z.enum(["landscape", "portrait", "square"]).optional(),
  size: z.enum(["large", "medium", "small"]).optional(),
  page: z.number().int().min(1).max(10).default(1),
  perPage: z.number().int().min(1).max(80).default(10),
});
```

Tool result:

```ts
type SearchPexelsVideosResult = {
  results: Array<{
    pexelsId: number;
    url: string;
    userName?: string;
    userUrl?: string;
    width: number;
    height: number;
    durationSeconds: number;
    previewImageUrl: string;
    downloadableVariants: Array<{
      quality?: string;
      fileType?: string;
      width?: number;
      height?: number;
      fps?: number;
      url: string;
    }>;
  }>;
};
```

### `select_assets_for_download`

Purpose: let the LLM select candidates after search results are visible.

This is a local decision tool. It should not download files by itself.

```ts
const SelectAssetsForDownloadArgsSchema = z.object({
  selections: z.array(z.object({
    beatId: z.string().min(1),
    assetType: z.enum(["photo", "video"]),
    pexelsId: z.number().int().positive(),
    variantUrl: z.string().url(),
    reason: z.string().min(1).max(500),
  })).min(1).max(50),
  rejections: z.array(z.object({
    beatId: z.string().min(1),
    assetType: z.enum(["photo", "video"]),
    pexelsId: z.number().int().positive(),
    reason: z.string().min(1).max(200),
  })).default([]),
});
```

### `download_selected_assets`

Purpose: download previously selected Pexels assets.

Important: The model must not provide arbitrary download URLs here. The app should map selected `pexelsId + variantUrl` from prior search results and verify the URL was actually returned by Pexels.

```ts
const DownloadSelectedAssetsArgsSchema = z.object({
  assetIds: z.array(z.object({
    assetType: z.enum(["photo", "video"]),
    pexelsId: z.number().int().positive(),
  })).min(1).max(50),
});
```

Tool result:

```ts
type DownloadSelectedAssetsResult = {
  downloaded: AssetRecord[];
  failed: Array<{
    assetType: "photo" | "video";
    pexelsId: number;
    reason: string;
    retryable: boolean;
  }>;
};
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

1. Agent may search and select.
2. App stops before `download_selected_assets`.
3. UI shows proposed assets.
4. User approves/rejects.
5. App downloads approved assets.

Do not ask the LLM to request approval in natural language. Approval is a UI state.
