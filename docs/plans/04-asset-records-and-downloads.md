# Plan 04: Asset Records and Downloads

Status: proposed · Size: M · Depends on: plan 03 (regression tests), plan 01 phase 2 (download safety is already ported there)

## Why

Four bugs in how the runner records and downloads assets. One fails whole jobs, one mislabels every downloaded video, and two make finishing a job depend on the model remembering to do something the code could do itself. docs/02 line 22 sets the rule these fixes follow: "The model is allowed to choose tools, but code decides when the run is finished, when limits are reached, and whether arguments are valid."

## Current state (audited)

References are to `src/main/services/agent/agent-runner.ts` unless noted.

### 1. The same clip in two beats fails the job, and resume repeats the failure

Confirmed with a throwaway harness during the review.

- An asset record's id is `${type}_${pexelsId}` (line 1484). The duplicate check only looks inside the current beat: `beat.assets.find((a) => a.id === recordId)` (line 1485). Selecting video 101 for `beat_1` and then for `beat_2` creates two records with the same id.
- `assetLookup` maps one id to one record. Each new record overwrites the entry (line 1519), so the map points at the `beat_2` copy.
- `download_selected_assets` finds the first beat holding a matching record (lines 1606 to 1615), marks the `beat_1` copy `downloading`, and enqueues one download.
- Download progress is routed through `assetLookup` (`handleDownloadProgress`, lines 1823 to 1836), so the `beat_2` copy becomes `completed` and the `beat_1` copy stays `downloading` forever.
- `decideRunFinalizeFromBeats` (`tool-schemas.ts` lines 389 to 400) sees an unfinished record and marks the job `failed` with the reason `unfinished_downloads`.
- On resume, `loadStateFromManifest` turns `downloading` back into `pending` (lines 478 to 481), and `rebuildAssetLookup` (line 256) rebuilds the same one-to-one map. The same thing happens again.

Picking the same clip for two beats is also bad output. docs/02's selection rules say "avoid duplicate shots". The prompt asks for "variety across beats" (`search-mode.ts` line 105), but nothing in the code enforces it.

### 2. Records and file names carry the source resolution, not the file's

Confirmed with the harness: a 720p file was recorded and named as 3840×2160.

- A new record copies `width: candidate.width, height: candidate.height` (lines 1510 and 1511). Those are the dimensions of the original upload.
- The downloader names the file `${type}_${assetId}_${width}x${height}_${slug}${ext}` from those values, and the Library shows them.
- For videos, the candidate already has each file's real size (`variants[].width` and `height`, lines 1374 to 1380). For photos, Pexels encodes the size in the URL query (`w`, `h`, `dpr`, `fit`).

### 3. Downloads wait for the model, and resume fails when the turn budget is spent

- Selecting an asset creates a `pending` record. Nothing downloads until the model makes a second call, `download_selected_assets`. That costs a turn per batch and is why the loop has a "pending download" nudge (lines 1083 to 1100).
- `iterationsUsed` is persisted (`loadAgentState`, line 550), and the loop runs only while `this.iterationsUsed < this.maxIterations` (line 999). A job paused or quit right after its last turn, with selections not yet queued, resumes into a skipped loop. Pending records are never queued, and finalization marks the job `failed` with `unfinished_downloads`.
- Approval mode is read live from settings in three places (lines 661, 1551, and 1590). Toggling it in Settings mid-job changes how the running job behaves.

### 4. An approval pause skips the rest of the model's turn

- With approval on, the first `select_assets_for_download` call that accepts anything sets `this.status = 'paused'` and aborts (lines 1558 to 1572).
- The loop then records every remaining tool call in that turn as "skipped because agent execution was paused" (lines 1149 to 1160).
- The prompt asks the model to select for all beats in one call, but models often send one select call per beat. After approval, the model has to redo the skipped selections.

## Goals

- A clip can be used by only one beat, and old manifests with duplicates recover on resume.
- Records and file names show the resolution of the downloaded file.
- With approval off, selecting an asset starts its download. Resume never needs the model to queue downloads.
- An approval pause happens after the whole turn has been processed.
- Approval mode is fixed for the duration of a run.

## Non-goals

- Automatic replacement of failed downloads with the next candidate. Plan 08 does this.
- Persisting job settings across resumes. Plan 06 phase 5 extends this plan's per-run snapshot.

## Key decisions

| Decision                                      | Choice                                                                                                    | Why                                                                                                                                                                                                  |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Duplicates across beats                       | Reject the second selection with a reason naming the first beat                                           | It enforces docs/02's "avoid duplicate shots" and keeps one record per id, so the lookup map stays correct. Sharing one file between two records would need a one-to-many lookup for little benefit. |
| Old manifests that already contain duplicates | Keep the copy that has a file and mark the others `failed` with a clear error                             | Resume then finds new footage for those beats instead of failing again.                                                                                                                              |
| Photo sizes                                   | Compute them from the URL query; verify once against real downloads                                       | Deterministic, testable, and needs no image decoding.                                                                                                                                                |
| The download tool                             | Keep it, as a harmless status call                                                                        | Old conversations contain calls to it, and removing it would leave those dangling. Plan 08 removes it with the loop.                                                                                 |
| Turn budget on resume                         | When the user resumes a job whose budget is spent, start a fresh budget. Approval resumes don't reset it. | The budget was made job-wide (`514fa4e`) so approval rounds couldn't each get 30 turns. A click on Resume is an explicit request for more work.                                                      |

## Phases

### Phase 1: One beat per asset (S)

1. Add a pure helper to `tool-schemas.ts`, next to `isAssetRejectedByUser`:

   ```ts
   /** The beat, other than `beatId`, that already holds a usable copy of this asset. */
   export function beatUsingAsset<
     T extends { id: string; assets?: Array<{ id: string; status: string }> }
   >(beats: T[], beatId: string, recordId: string): T | undefined {
     return beats.find(
       (b) =>
         b.id !== beatId && (b.assets || []).some((a) => a.id === recordId && a.status !== 'failed')
     )
   }
   ```

2. In the select branch, between the user-rejection check (line 1475) and `const existingRecord` (line 1485):

   ```ts
   const usedBy = beatUsingAsset(this.beats, beat.id, recordId)
   if (usedBy) {
     selectionResults.push({
       pexelsId: sel.pexelsId,
       status: 'rejected',
       reason: `Asset ${sel.pexelsId} is already used for ${usedBy.id}. Pick a different asset so beats don't repeat footage.`
     })
     continue
   }
   ```

3. Repair old manifests. Add a second pure helper:

   ```ts
   /**
    * Older runs could give one asset record id to several beats, which left a copy stuck
    * in "downloading". Keeps the copy that has a file (else the first) and fails the rest.
    */
   export function releaseDuplicateAssetRecords(
     beats: Array<{
       id: string
       assets: Array<{ id: string; status: string; filePath?: string; error?: string }>
     }>
   ): Array<{ recordId: string; keptIn: string; releasedFrom: string }> {
     const released: Array<{ recordId: string; keptIn: string; releasedFrom: string }> = []
     const holders = new Map<
       string,
       Array<{ beatId: string; asset: (typeof beats)[number]['assets'][number] }>
     >()
     for (const beat of beats) {
       for (const asset of beat.assets) {
         if (asset.status === 'failed') continue
         holders.set(asset.id, [...(holders.get(asset.id) || []), { beatId: beat.id, asset }])
       }
     }
     for (const [recordId, copies] of holders) {
       if (copies.length < 2) continue
       const kept =
         copies.find((c) => c.asset.status === 'completed' && c.asset.filePath) || copies[0]
       for (const copy of copies) {
         if (copy === kept) continue
         copy.asset.status = 'failed'
         copy.asset.error = `Duplicate of the asset used for ${kept.beatId}`
         released.push({ recordId, keptIn: kept.beatId, releasedFrom: copy.beatId })
       }
     }
     return released
   }
   ```

   Call it in `loadStateFromManifest` after the beats are mapped (line 485) and before `rebuildAssetLookup()`, logging one line per released copy. A beat whose only asset was released now has no usable asset, so the loop searches for it again.

4. Make `rebuildAssetLookup` (line 256) prefer usable records, so a failed copy can never shadow the live one:

   ```ts
   for (const a of b.assets) {
     const existing = this.assetLookup.get(a.id)
     if (existing && existing.asset.status !== 'failed' && a.status === 'failed') continue
     this.assetLookup.set(a.id, { asset: a, beat: b })
   }
   ```

5. Add one prompt rule in `buildStockScoutSystemPrompt`: "Never select the same asset for two beats." Plan 07 rewrites the rule list, so keep this edit small. Update `test/prompt-quality.test.ts`.

**Tests:**

- Unit: `beatUsingAsset` (same beat, other beat, failed copy ignored).
- Unit: `releaseDuplicateAssetRecords` (keeps the completed copy, keeps the first when none is complete, leaves single records alone).
- Runner: flip `test/runner/duplicate-clip.test.ts` from `todo`.
- Runner: a resume test that loads a manifest written with the old bug and finishes the job.

**Manual check:** a script with two sentences about the same subject ("Waves crash on the shore. The waves keep coming."). Each beat gets a different clip. Check `agent-log.jsonl` for any rejection that names the other beat.

### Phase 2: Record the downloaded file's dimensions (S)

1. Add `src/main/services/pexels/variant-dimensions.ts`:

   ```ts
   export interface Dimensions {
     width: number
     height: number
   }

   /** The size of the file a variant URL returns. */
   export function variantDimensions(
     candidate: {
       type: 'photo' | 'video'
       width: number
       height: number
       variants: Array<{ url: string; width?: number; height?: number }>
     },
     variantUrl: string
   ): Dimensions {
     if (candidate.type === 'video') {
       const file = candidate.variants.find((v) => v.url === variantUrl)
       return file?.width && file?.height
         ? { width: file.width, height: file.height }
         : { width: candidate.width, height: candidate.height }
     }
     return photoVariantDimensions(candidate.width, candidate.height, variantUrl)
   }

   /**
    * Pexels photo variants encode their size in the query: `w`, `h`, `dpr`, and `fit=crop`.
    * `original` has no size parameters. Resizes keep the aspect ratio and don't upscale.
    */
   export function photoVariantDimensions(
     sourceWidth: number,
     sourceHeight: number,
     url: string
   ): Dimensions {
     const query = new URL(url).searchParams
     const dpr = Number(query.get('dpr')) || 1
     const boxWidth = Number(query.get('w')) * dpr || undefined
     const boxHeight = Number(query.get('h')) * dpr || undefined
     if (!boxWidth && !boxHeight) return { width: sourceWidth, height: sourceHeight }
     if (query.get('fit') === 'crop' && boxWidth && boxHeight)
       return { width: boxWidth, height: boxHeight }
     const scale = Math.min(
       boxWidth ? boxWidth / sourceWidth : Infinity,
       boxHeight ? boxHeight / sourceHeight : Infinity,
       1
     )
     return { width: Math.round(sourceWidth * scale), height: Math.round(sourceHeight * scale) }
   }
   ```

2. In the select branch (lines 1510 and 1511), use `...variantDimensions(candidate, sel.variantUrl)` instead of `width: candidate.width, height: candidate.height`. The downloader and the Library then receive the right values without further changes.
3. Verify the "no upscaling, aspect kept" assumption once against the real CDN. Download the `large2x`, `large`, and `landscape` variants of one landscape photo and one portrait photo, and compare the files' real sizes with the helper's output. If the CDN behaves differently, change the helper and its tests to match.
4. Existing manifests keep their old values. The variant size could be recovered from the stored candidates, but the old file names can't change without renaming files the user may already use. Leave them.

**Tests:**

- Unit (`test/variant-dimensions.test.ts`), using the URL shapes from plan 03's fixtures and a 6000×4000 source: `original` gives 6000×4000; `large2x` gives 1880×1253; `large` gives 940×627; `medium` gives 525×350; `landscape` gives 1200×627; `tiny` gives 280×200. For a 4000×6000 portrait source, `large2x` gives 867×1300. Videos use the file's own size.
- Runner: flip `test/runner/variant-dimensions.test.ts`.

### Phase 3: Queue downloads in code (M)

1. **Fix approval mode for the run.** In `applyRuntimeSettings()` (line 273), set `this.requireApproval = settings.requireApprovalBeforeDownload`. Replace the three live reads at lines 661, 1551, and 1590 with `this.requireApproval`. Plan 06 phase 5 persists this per job.

2. **Extract `queueDownload`** from the download branch (lines 1647 to 1680), so selection, approval, and resume share one path:

   ```ts
   private queueDownload(record: AssetRecord, beat: VisualBeat): 'queued' | 'already_active' | 'cap_reached' {
     if (record.status === 'completed' || record.status === 'downloading') return 'already_active'
     if (countQueuedOrCompleted(this.beats) >= this.input.maxTotalDownloads) return 'cap_reached'
     record.status = 'downloading'
     beat.status = 'downloading'
     this.downloader.enqueue(
       record.pexelsId, record.type, record.downloadUrl,
       record.width, record.height, record.query, this.projectDir
     )
     return 'queued'
   }
   ```

   Put `countQueuedOrCompleted` in `tool-schemas.ts` next to `countCompletedAssets`, replacing the inline filter at lines 1656 to 1658.

3. **Queue on selection.** In the select branch, right after the new record is pushed (line 1519):

   ```ts
   const queued = this.requireApproval ? null : this.queueDownload(newAsset, beat)
   selectionResults.push({
     pexelsId: sel.pexelsId,
     status: queued === 'queued' ? 'queued' : 'selected'
   })
   ```

   Move the existing `selectionResults.push({ pexelsId: sel.pexelsId, status: 'selected' })` (line 1523) into an `else`, so already-held assets still report `selected`.

4. **Keep the download tool, but make it a no-op in normal use.** Change its description in `AGENT_TOOLS` to: "Optional. Selecting an asset already starts its download. Use this only to check download status." Its handler keeps working through `queueDownload`, so old conversations that call it still get sensible answers.

5. **Remove what existed only to make the model download.**
   - The pending-download nudge (lines 1083 to 1100). With approval off there are no unqueued records left after a selection.
   - Workflow step 3 in `buildStockScoutSystemPrompt` (`search-mode.ts` line 133, "Call 'download_selected_assets' to queue downloads…"). Step 4's "nothing you selected is still waiting to be queued" becomes "every beat has an asset".
   - Update `test/prompt-quality.test.ts` ("defines when the job is done").

6. **Re-queue on resume.** Add a method and call it in `start()`'s task after `loadStateFromManifest()` (line 611), whether or not state came from disk:

   ```ts
   /** Downloads selected in an earlier run that never started. Only when approval is off. */
   private requeuePendingDownloads(): void {
     if (this.requireApproval) return
     let queued = 0
     for (const beat of this.beats) {
       for (const record of beat.assets) {
         if (record.status !== 'pending' || isAssetRejectedByUser(beat, record.type, record.pexelsId)) continue
         if (this.queueDownload(record, beat) === 'queued') queued++
       }
     }
     if (queued > 0) this.log('info', `Re-queued ${queued} download(s) from the previous run.`)
   }
   ```

   The loop already exits before calling the model when every beat has a queued or completed asset (lines 1000 to 1009). A resumed job with all beats selected therefore finishes with no LLM call at all.

7. **A fresh turn budget on an explicit resume.** In `resume()` (line 655), after the approval branch:

   ```ts
   if (remainingIterations(this.maxIterations, this.iterationsUsed) === 0) {
     this.iterationsUsed = 0
     this.log('info', `Resumed with a fresh budget of ${this.maxIterations} turns.`)
   }
   ```

   `approveAndResume` doesn't do this, so approval rounds still share one budget.

**Tests:**

- Runner: flip `test/runner/resume-requeue.test.ts`.
- Runner: `happy-path.test.ts` no longer scripts a download call, and passes.
- Runner: with approval on, selection does not queue anything.
- Runner: toggling `requireApprovalBeforeDownload` in settings mid-run doesn't change the run.

**Manual check:** a three-beat job finishes in one fewer turn per batch (compare the "Agent turn N/30" log lines before and after). Pause a job mid-download, quit, reopen, and resume: downloads continue without an "Agent turn" line.

### Phase 4: Pause for approval after the whole turn (S)

1. In the select branch, replace the immediate pause (lines 1558 to 1572) with a flag:

   ```ts
   if (this.requireApproval && acceptedSelectionCount > 0) {
     this.approvalRequested = true
     result = {
       status: 'awaiting_user_approval',
       message: 'Selections recorded. The user will review them after this turn.',
       selections: selectionResults,
       rejections: rejectionResults
     }
   }
   ```

2. In `runAgentLoop`, after the `for (const tc of effectiveToolCalls)` loop (line 1162):

   ```ts
   if (this.approvalRequested) {
     this.approvalRequested = false
     this.status = 'paused'
     this.log(
       'info',
       `Awaiting user approval for ${countPendingAssets(this.beats)} selected assets.`
     )
     await this.writeAgentState()
     break
   }
   ```

   There's no in-flight request at that point, so nothing needs aborting. Plan 06 phase 2 routes this through the status transition function, with the reason `awaiting_approval`.

3. Check how the renderer shows approval. The approval banner reads pending assets from the beats, so a pause after the turn shows every pending asset at once. That's better than today's partial set.

**Tests:** flip `test/runner/approval-mode.test.ts`. Three select calls in one turn are all processed, then the job pauses once.

## Risks and mitigations

| Risk                                                                      | Mitigation                                                                                                                                               |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A rejected duplicate wastes a turn while the model picks again            | The rejection reason tells it exactly what to do. The new prompt rule makes the duplicate rare in the first place.                                       |
| Photo size assumptions are wrong for some variants                        | Phase 2 step 3 verifies against the real CDN. Only names and labels are affected, never the file contents.                                               |
| Queuing on selection downloads assets the model would later have rejected | The model can't reject after selecting today either, since rejections happen in the same call. Approval mode remains for users who want to review first. |
| A fresh budget on resume lets one job cost more                           | Only on an explicit user resume after the budget is spent, and it's logged. The per-turn cap is unchanged.                                               |

## Open questions

- Should a beat be allowed to reuse an asset when it has no other candidates? Some editors like a recurring shot. If so, add an "allow repeats" job option rather than weakening the default.
