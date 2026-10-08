# Plan 05: Context and Tool Results

Status: proposed · Size: M · Depends on: plan 03 (tests); plan 02 phase 2 to measure the cache gain

## Why

Every agent turn resends the whole conversation, and search results dominate it. A photo search returns about 1,400 characters per photo, mostly eight download URLs the model can't use. Compaction then hides results by count, not by age. Since PR #4 told the model to search every beat at once, the newest results are the ones being hidden. And because compaction rewrites older messages a little more each turn, the provider's prompt cache misses from that point on.

## Current state (audited)

### Results are big, and most of the size is URLs

`agent-runner.ts` lines 1310 to 1329 (photos) and 1384 to 1403 (videos) build the tool result the model sees:

- **Photo:** `pexelsId`, `url`, `photographer`, `photographerUrl`, `width`, `height`, `avgColor`, `alt`, `previewUrl`, and `downloadableVariants`, which holds all eight `src` sizes as `{ label, url }`. That's about 1,400 characters per photo, or around 21,000 characters for the default 15 results.
- **Video:** `pexelsId`, `url`, `userName`, `userUrl`, `width`, `height`, `durationSeconds`, `previewImageUrl`, and `downloadableVariants`, which lists every file (often 5 to 12) with quality, type, URL, and size.
- Results are serialized compactly with `JSON.stringify(result)` (line 1715).
- `perPage` allows up to 80 (`tool-schemas.ts` lines 12 and 21).

The model needs none of the URLs to judge relevance. It sees text only, as the prompt admits (`search-mode.ts` line 98). It copies one URL into `variantUrl` (`tool-schemas.ts` line 31, required at line 138), and the prompt spends a paragraph on which one to pick (`search-mode.ts` line 107). That choice is mechanical and belongs in code.

The full candidate, including every variant, is already cached in `pexelsCandidates` (lines 1290 to 1307 and 1362 to 1381). Selection validates against that cache (lines 1442 to 1461), so trimming what the model sees loses nothing.

### Compaction hides the newest results

`message-compaction.ts`:

```ts
export const KEEP_FULL_TOOL_RESULTS = 8
export const TOOL_RESULT_COMPACT_THRESHOLD = 4000
```

Tool messages beyond the newest 8 whose content exceeds 4,000 characters become `{"omitted":true,"note":"Earlier tool result trimmed to control context size. Re-run the search if needed."}`.

The prompt tells the model: "Search every waiting beat at once with one call per beat" (`search-mode.ts` line 128). With 12 beats, one turn produces 12 search results. In the next request, the results for beats 1 to 4 are already replaced by the stub, before the model has read them. The review reproduced this with a harness. The 8 results kept in full cost about 42,000 tokens on every turn. The model then either re-searches those beats or picks without information.

### Compaction breaks the prompt cache

`messagesWithCacheStablePrefix` (agent-runner line 1026) puts the beat catalog first so the prefix stays stable. But `compactToolResultsForProvider` runs first, and its cutoff moves with every new tool result. Each turn, a result that was sent in full last time is sent as a stub, which changes the prefix at that message. Everything after it misses the cache. Plan 02 phase 2 adds `cachedInputTokens`, so this can be measured.

### Orientation is left to the model

Both search tools accept `orientation` (`tool-schemas.ts` lines 8 and 18), and the runner passes it through (lines 1280 and 1353). Nothing defaults it from the platform. The prompt asks the model to compare width and height instead (`search-mode.ts` line 102), so many of the results it pays for come in the wrong shape.

## Goals

- Search results the model sees are at least 80% smaller.
- A result is never hidden in the turn after it arrives.
- Requests share a stable prefix between compaction steps, so the cache hits.
- Code picks the download variant. The model picks the asset.
- Searches default to the platform's orientation.

## Non-goals

- Showing images to the model. Plan 08 phase 5 covers thumbnails.
- Changing the ReAct loop itself. Plan 08 replaces it, and this plan makes the current loop cheaper and correct in the meantime.

## Key decisions

| Decision                       | Choice                                                                                   | Why                                                                                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| What the model sees per result | id, a short description (alt text or the URL slug), shape, size, and duration for videos | Those are the fields the prompt tells it to judge by (`search-mode.ts` lines 98 to 104).                                            |
| Who picks the variant          | Code, by default. `variantUrl` stays as an optional override.                            | The rule is mechanical (lines 107 and 108). Keeping the field optional means old conversations and explicit choices still validate. |
| Compaction unit                | Tool turns, not tool messages                                                            | One batched turn can produce a dozen results that belong together.                                                                  |
| Compacted form                 | A digest of ids and descriptions instead of an empty stub                                | The model can still select a result it saw earlier, since selection validates against `pexelsCandidates`, which keeps everything.   |
| When to compact                | Only when an estimated size budget is crossed, then in one step                          | Between steps the prefix stays identical, so the cache keeps hitting.                                                               |

## Phases

### Phase 1: Never hide the newest turns (S)

This is the bug fix. Ship it first, on its own.

1. Rewrite `compactToolResultsForProvider` to count assistant turns that made tool calls:

   ```ts
   /** Results from the newest turns are never compacted, however large. */
   export const KEEP_FULL_TOOL_TURNS = 3
   export const TOOL_RESULT_COMPACT_THRESHOLD = 4000

   export function compactToolResultsForProvider(messages: AgentMessage[]): AgentMessage[] {
     const turnStarts: number[] = []
     messages.forEach((m, i) => {
       if (m.role === 'assistant' && m.tool_calls?.length) turnStarts.push(i)
     })
     if (turnStarts.length <= KEEP_FULL_TOOL_TURNS) return messages
     const keepFrom = turnStarts[turnStarts.length - KEEP_FULL_TOOL_TURNS]

     let changed = false
     const out = messages.map((m, i) => {
       if (
         i >= keepFrom ||
         m.role !== 'tool' ||
         (m.content || '').length <= TOOL_RESULT_COMPACT_THRESHOLD
       )
         return m
       changed = true
       return { ...m, content: digestToolResult(m.content || '') }
     })
     return changed ? out : messages
   }
   ```

   Calls that `extractToolCallsFromText` recovered from plain text are written back to `assistantMsg.tool_calls` (line 1066), so they count as turns too.

2. Add `digestToolResult` in the same file:

   ```ts
   /** Keeps what the model needs to select an earlier result: ids and descriptions. */
   export function digestToolResult(content: string): string {
     try {
       const parsed = JSON.parse(content) as { results?: Array<Record<string, unknown>> }
       if (Array.isArray(parsed.results)) {
         return JSON.stringify({
           compacted: true,
           results: parsed.results.map((r) => [r.pexelsId, describe(r)])
         })
       }
     } catch {
       // Not JSON; fall through to the generic stub.
     }
     return JSON.stringify({ compacted: true, note: 'Earlier tool result trimmed to save space.' })
   }

   /** Handles both result shapes: `about` (after phase 2) and `alt`/`url` (saved conversations from before). */
   function describe(result: Record<string, unknown>): string {
     const text =
       (typeof result.about === 'string' && result.about) ||
       (typeof result.alt === 'string' && result.alt) ||
       slugFromPexelsUrl(String(result.url || ''))
     return text.slice(0, 60)
   }
   ```

   `slugFromPexelsUrl` is defined in phase 2. Until phase 2 lands, put a minimal version here and move it later.

3. Update `test/message-compaction.test.ts`. Its fixtures are bare tool messages with no assistant turns, and turn-based counting would compact nothing. Build fixtures as assistant-plus-results turns instead.

4. Add one sentence to the "What you can see" paragraph of `buildStockScoutSystemPrompt` (`search-mode.ts` line 98): "Older search results may be shortened to a list of ids and descriptions marked compacted. You can still select from them."

**Tests:**

- 12 results in one turn: none are compacted.
- 4 turns: only the oldest turn is compacted, and its digest contains every id.
- Non-JSON content gets the generic stub.
- Short results are never touched.
- Runner: flip `test/runner/compaction-visibility.test.ts`.

### Phase 2: Slim results, and pick variants in code (M)

1. **Shape helpers**, in a new `src/main/services/agent/tool-results.ts`:

   ```ts
   export type Shape = 'landscape' | 'portrait' | 'square'

   export function shapeOf(width: number, height: number): Shape {
     const ratio = width / height
     return ratio > 1.1 ? 'landscape' : ratio < 0.9 ? 'portrait' : 'square'
   }

   export function shapeForPlatform(platform: string): Shape {
     return platform === 'YouTube' ? 'landscape' : 'portrait'
   }

   /** "https://www.pexels.com/video/waves-crashing-on-rocks-1234/" gives "waves crashing on rocks". */
   export function slugFromPexelsUrl(url: string): string {
     const last = url.split('/').filter(Boolean).pop() || ''
     return last
       .replace(/-?\d+$/, '')
       .replace(/-/g, ' ')
       .trim()
   }
   ```

2. **What the model sees.** Pure mappers in the same file:

   ```ts
   export function photoResultForModel(p: PexelsPhoto) {
     return {
       pexelsId: p.id,
       about: p.alt || slugFromPexelsUrl(p.url),
       shape: shapeOf(p.width, p.height),
       size: `${p.width}x${p.height}`
     }
   }

   export function videoResultForModel(v: PexelsVideo) {
     return {
       pexelsId: v.id,
       about: slugFromPexelsUrl(v.url),
       shape: shapeOf(v.width, v.height),
       size: `${v.width}x${v.height}`,
       seconds: v.duration || 0,
       fullHd: v.video_files.some((f) => Math.max(f.width ?? 0, f.height ?? 0) >= 1920)
     }
   }
   ```

   Replace the mappings at lines 1312 to 1328 and 1386 to 1402. A result shrinks to about 100 characters, so 15 photos come to about 1,500 characters instead of 21,000. Keep `total_results`. `avgColor` is dropped: the prompt mentions it but no rule uses it, so take it out of line 98 too.

3. **Variant choice in code.** Add `src/main/services/pexels/choose-variant.ts`:

   ```ts
   /** Full HD is enough for a 1080p edit. Larger files cost disk and editing time. */
   const TARGET_LONG_EDGE = 1920

   type Variant = {
     label?: string
     quality?: string
     fileType?: string
     url: string
     width?: number
     height?: number
   }

   export function chooseVariant(candidate: {
     type: 'photo' | 'video'
     width: number
     height: number
     variants: Variant[]
   }): Variant | undefined {
     return candidate.type === 'video'
       ? chooseVideoFile(candidate.variants)
       : choosePhotoVariant(candidate)
   }

   /** The smallest MP4 that reaches full HD, or else the largest one there is. */
   export function chooseVideoFile(files: Variant[]): Variant | undefined {
     const mp4 = files.filter((f) => !f.fileType || f.fileType === 'video/mp4')
     const pool = (mp4.length > 0 ? mp4 : files).filter((f) => f.width && f.height)
     const longEdge = (f: Variant) => Math.max(f.width!, f.height!)
     const bigEnough = pool
       .filter((f) => longEdge(f) >= TARGET_LONG_EDGE)
       .sort((a, b) => longEdge(a) - longEdge(b))
     return bigEnough[0] ?? pool.sort((a, b) => longEdge(b) - longEdge(a))[0] ?? files[0]
   }

   /**
    * large2x is 1880 px wide for landscape sources, enough for a 1080p timeline, but only
    * 1300 px tall for portrait sources, so portrait photos use the original.
    */
   export function choosePhotoVariant(candidate: {
     width: number
     height: number
     variants: Variant[]
   }): Variant | undefined {
     const byLabel = (label: string) => candidate.variants.find((v) => v.label === label)
     const preferred = candidate.height > candidate.width ? byLabel('original') : byLabel('large2x')
     return preferred ?? byLabel('original') ?? candidate.variants[0]
   }
   ```

   Plan 04 phase 2's `variantDimensions` then records the chosen file's real size.

4. **Selection accepts no URL.** In `SelectAssetsForDownloadArgsSchema` (line 31), make `variantUrl` `.optional()`. Remove it from `required` (line 138) and describe it as "Optional. Leave it out and the app picks the best file." In the select branch (lines 1442 to 1461):

   ```ts
   const variant = sel.variantUrl
     ? candidate.variants.find((v) => v.url === sel.variantUrl)
     : chooseVariant(candidate)
   if (!variant) {
     selectionResults.push({
       pexelsId: sel.pexelsId,
       status: 'rejected',
       reason: `No downloadable file found for asset ${sel.pexelsId}.`
     })
     continue
   }
   ```

   Then use `variant.url` wherever `sel.variantUrl` was used: `validateDownloadUrl` at line 1453 and `downloadUrl` in the new record.

5. **Orientation defaults to the platform.** In both search branches (lines 1280 and 1353): `orientation: args.orientation ?? shapeForPlatform(this.input.platform)`. In the tool schemas, describe the parameter as "Defaults to the platform's shape. Set it only to search a different one."

6. **Cap `perPage` at 30** in both schemas. More results per search mostly add tokens. Paging (`page`) remains for when the first page is poor.

7. **Prompt edits** (`search-mode.ts`):
   - Line 98: describe the new fields (`about`, `shape`, `size`, `seconds`).
   - Line 102: "Searches already return the platform's shape. Prefer results whose shape matches."
   - Line 107: delete the variant paragraph.
   - Update `test/prompt-quality.test.ts`: the "admits the model cannot see images" test stays; add "does not ask the model to pick a variant".

**Tests:**

- Unit: `shapeOf` boundaries, `slugFromPexelsUrl` (trailing slash, no id, photo URL).
- Unit: `chooseVideoFile` (prefers 1920 over 3840, falls back to the largest, skips non-MP4, handles missing sizes).
- Unit: `choosePhotoVariant` (landscape gives `large2x`, portrait gives `original`, missing labels fall back).
- Unit: the mappers produce no URLs (assert `JSON.stringify(result)` contains no `https://images.` or `https://videos.`).
- Unit: a 15-photo result is under 2,500 characters.
- Runner: a selection without `variantUrl` downloads `chooseVariant`'s file. A selection with an unknown `variantUrl` is still rejected.
- Runner: searches send `orientation=portrait` for TikTok when the model omits it (assert on the fake-fetch request log).

### Phase 3: Compact on a budget, with a stable cutoff (S)

1. Keep a cutoff in the runner: `private compactedBefore = 0`, the message index before which results are digested. Persist it in agent-state next to `iterationsUsed`. Old state files without it load as 0.
2. Before each request:

   ```ts
   const CONTEXT_BUDGET_CHARS = 160_000 // about 40,000 tokens at 4 characters per token

   let view = compactBefore(this.messages, this.compactedBefore)
   if (JSON.stringify(view).length > CONTEXT_BUDGET_CHARS) {
     this.compactedBefore = cutoffForHalfBudget(
       this.messages,
       CONTEXT_BUDGET_CHARS / 2,
       KEEP_FULL_TOOL_TURNS
     )
     view = compactBefore(this.messages, this.compactedBefore)
     this.log('info', 'Compacted older search results to keep requests small.')
   }
   ```

   `compactBefore(messages, index)` digests large tool results before `index`. `cutoffForHalfBudget` walks turn starts from the oldest and returns the first one that brings the estimate under the target, but never past the newest `KEEP_FULL_TOOL_TURNS` turns. Both are pure and live in `message-compaction.ts`.

3. Because the cutoff only moves when the budget is crossed, consecutive requests share their prefix and the cache keeps hitting. Phase 1's per-request rule becomes the floor: the newest turns are never compacted.
4. With phase 2's small results, a typical job may never reach the budget. That's the intended outcome. The budget exists for long scripts and many retries.

**Tests:**

- Unit: under budget, the cutoff never moves.
- Unit: over budget, it moves once, and the next call with one more turn returns the same prefix.
- Unit: the cutoff never passes the protected turns.
- Unit: old state without `compactedBefore` loads.

### Phase 4: Measure (S)

1. After plan 02 phase 2, log per turn: `Turn 4: 6,210 input tokens (5,800 cached), 410 output.` Write the same numbers to `agent-log.jsonl`, so the eval script can sum them.
2. Run plan 03's eval set before phase 1 and after phase 3. Record input tokens per job, cached share, turns per job, and the human relevance score in a table in this file.
3. Expected direction: input tokens down by more than half, with no drop in relevance. If relevance drops, the slim result is missing something the model used. Restore that one field.

## Risks and mitigations

| Risk                                                                 | Mitigation                                                                                                                              |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| The model relied on photographer names or preview URLs in some way   | The prompt never asks for them. The eval comparison in phase 4 catches a relevance drop.                                                |
| A code-picked variant is wrong for some use (say, 4K footage wanted) | `variantUrl` remains as an explicit override. A "prefer 4K" job option is easy to add later if users ask.                               |
| The orientation default hides a good square or opposite-shape result | The model can pass `orientation` explicitly. The prompt says so.                                                                        |
| Digests make the model believe it saw details it no longer has       | The digest is marked `compacted: true`, and the sentence added in phase 1 step 4 says compacted results only list ids and descriptions. |

## Open questions

- Portrait photos use `original`, which can be 20 MB or more. A resized original (`?auto=compress&h=1920`) would be better, if the CDN honors arbitrary sizes. Plan 04 phase 2's real-CDN check can test that at the same time.
