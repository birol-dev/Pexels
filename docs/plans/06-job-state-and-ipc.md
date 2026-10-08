# Plan 06: Job State and IPC

Status: proposed · Size: M · Depends on: plan 01 phase 3 (lifecycle fixes and log-less snapshots), plan 03 (runner and IPC tests)

## Why

A job's status, its asset list, and its settings each have several writers that don't coordinate. The runner sets its status in twelve places. Two read handlers rewrite the registry. The Library rewrites `manifest.json` from a disk copy while a runner holds newer state in memory, and the runner then overwrites the Library's changes. Settings are re-read on every resume, so a job can change provider halfway through and replay its conversation in the wrong format. These bugs are timing-dependent, which makes them hard to reproduce and easy to reintroduce.

The target: one transition function for status, one writer per job, reads that never write, and job settings fixed when the job starts.

## Current state (audited)

### Status is set in twelve places in the runner, and three outside it

In `agent-runner.ts`:

| Line       | Where                        | Sets                                               |
| ---------- | ---------------------------- | -------------------------------------------------- |
| 318, 322   | `runBackground` catch        | `completed` if all beats downloaded, else `failed` |
| 444        | `initializeAndLoadState`     | `paused`, whatever the saved state was             |
| 588        | `finalizeSuccessfulRun`      | `decision.status`                                  |
| 613        | `start()` task               | `running`                                          |
| 642        | `pause()`                    | `paused`                                           |
| 674        | `resume()`                   | `running`                                          |
| 681        | `cancel()`                   | `cancelled`, from any state                        |
| 1559       | select branch, approval mode | `paused`, in the middle of a tool call             |
| 1774, 1813 | `approveAndResume` task      | `running`                                          |
| 1933       | `handleDownloadProgress`     | `completed`, from a download callback              |

Line 1933 is the worst. When the last download finishes while the model is mid-turn, the callback sets `completed`. The loop's `while (… this.status === 'running')` (line 999) stops. The remaining tool calls of that turn are skipped. `runLoopThenFinalize` (`run-tail.ts`) only settles downloads and finalizes when the status is `running`, so `finalizeSuccessfulRun` never runs and its log line and decision are lost.

Outside the runner:

- `jobs:cancel` for an inactive job writes `cancelled` to the registry (`jobs.ipc.ts` line 223).
- `jobs:get` for an inactive job rewrites the registry to `completed` when the manifest shows every beat downloaded (lines 330 to 340).
- `jobs:list` does the same for every job that isn't `completed` or `cancelled` (lines 373 to 405). That includes a job whose runner is active right now, and `failed` jobs.
- `ProjectStore.recoverInterruptedJobs()` turns `running` into `paused` at startup (`index.ts` line 172, `storage/job-recovery.ts`). This is the right place for that kind of correction, and the only one that runs before any runner exists.

### The Library writes manifest.json behind the runner's back

`assets.ipc.ts`:

- `assets:list` (lines 16 to 91) reads `manifest.json` from disk. It marks assets whose file is missing as `failed` and writes the manifest back (lines 80 to 85).
- `assets:deleteLocal` (lines 121 to 176) reads the manifest, deletes the file, marks the record `failed` with "Deleted by user", writes the manifest, and updates the registry's `assetCount`.

Both work for inactive jobs. When a runner is active for the job, including a paused one kept in `activeRunners`, the runner's in-memory beats still say `completed` with a file path. Its next `writeManifest` restores the deleted asset. In the other direction, the Library's write can replace a manifest that has newer download progress, because `ManifestWriter` serializes writes but doesn't merge them.

### Log entries carry full tool results

`this.log('tool_result', `Result for ${tc.name}`, result)` (line 1710) stores the whole tool result as the log entry's `data`. A photo search is about 21,000 characters (plan 05). Each entry is:

- kept in `this.logs` and sent in every snapshot (fixed by plan 01's `emitSnapshot`)
- sent as its own `log` event
- appended to `agent-log.jsonl`
- printed in full in the Run screen console (`log-entry.tsx` line 16, scrollable up to `max-h-60`)

`jobs:get` for an inactive job reads all of `agent-log.jsonl` and returns every entry (lines 302 to 319). Old runs can make that several megabytes.

### Settings change under a running job

`applyRuntimeSettings()` (line 273) runs on every `start()`, so on every resume. It reads `modelId`, `llmProvider`, `maxAgentIterations`, the timeout, and the safety toggles from the current settings. Approval mode is read live in three places (plan 04 phase 3 fixes that per run).

The manifest already records the provider and model a job used (`settingsSnapshot`, runner line 767). But `ManifestSettingsSnapshotSchema` in `jobs.ipc.ts` (lines 71 to 81) doesn't parse them, and nothing uses them on resume.

If the user switches provider between pause and resume, the runner sends the saved conversation to the new provider. Gemini assistant messages carry `rawParts` with thought signatures. An OpenAI transcript sent to Gemini has none, and Gemini's newer models reject function calls without them (verify the exact error before relying on it).

### Token usage is tracked but not shown

`JobSnapshot.usage` exists (runner line 400, `store.ts` line 56), and no component reads it. The Settings toggle "hide estimated cost" (`SafetyPanel.tsx` line 45) saves `hideEstimatedCost`, and nothing reads that either. The README still says the progress header shows "real-time usage statistics and estimated LLM fees" (lines 256 and 257).

## Goals

- Status changes go through one function that rejects illegal transitions and records a reason.
- Only finalization decides that a run is finished.
- Read handlers never write.
- While a runner exists for a job, all writes for that job go through it.
- Log entries are small, and loading an old job's log is bounded.
- A job keeps its provider, model, and limits for its whole life.
- The Run screen shows token usage, and the Settings toggle hides it.

## Non-goals

- Running several jobs at once with a shared Pexels budget. Possible later. Nothing here prevents it.
- A cost estimate. A price table conflicts with docs/04's no-model-table policy. Users can read their provider's dashboard.

## Key decisions

| Decision                               | Choice                                                                                                              | Why                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Terminal states                        | `completed`, `failed`, and `cancelled` are final. Running a job again means a rerun, which creates a new job.       | That is what `jobs:resume` already allows (paused only). It makes the transition table small.  |
| Who reconciles interrupted jobs        | Startup recovery only                                                                                               | It runs once, before any runner exists, so it can't race one.                                  |
| Library edits during a job             | Route through the runner when one exists                                                                            | The runner owns that job's state. Merging two writers' views is harder than having one writer. |
| Where full tool results live           | `agent-state.json`, in the conversation                                                                             | They're already there. The log keeps summaries.                                                |
| Settings changed since the job started | Resume with the job's settings by default. Offer "Resume with current settings", which starts a fresh conversation. | A transcript only makes sense to the provider that wrote it.                                   |

## Phases

### Phase 1: Reads never write (S)

1. **`jobs:get`** (lines 330 to 340): delete the block that sets `summary.status = 'completed'` and calls `ProjectStore.save`. Return `summary.status` as is. Keep computing `downloadedCount` and `failedCount` for display.
2. **`jobs:list`** (lines 373 to 405): delete the whole manifest scan. The handler becomes `return ProjectStore.list()`.
3. **Startup recovery** decides interrupted jobs. Extend the pure function in `storage/job-recovery.ts`:

   ```ts
   /**
    * Jobs still marked `running` at startup were cut off by a quit or crash. A job whose
    * downloads had all finished is completed; any other job becomes resumable.
    */
   export function recoverInterruptedJobs<
     T extends { jobId: string; status: string; updatedAt: string }
   >(jobs: T[], allBeatsDownloaded: (job: T) => boolean, now: Date = new Date()): T[] {
     return jobs
       .filter((job) => job.status === 'running')
       .map((job) => ({
         ...job,
         status: allBeatsDownloaded(job) ? 'completed' : 'paused',
         updatedAt: now.toISOString()
       }))
   }
   ```

   `ProjectStore.recoverInterruptedJobs()` reads each interrupted job's manifest first and passes the result of `areAllBeatsDownloaded`. A missing or unreadable manifest counts as not downloaded. This keeps the one useful thing the read handlers did, recognizing a job that finished downloading but was cut off before finalizing, and does it once.

4. Don't flip `failed` jobs to `completed` anywhere. A failure has a reason the user should see. Plan 04 phase 1 removes the main cause of "failed but everything downloaded" (the duplicate clip).

**Tests:**

- Unit: the recovery function covers downloaded, not downloaded, other statuses untouched, and a missing manifest.
- IPC (plan 03 harness): `invokeIpc('jobs:list')` and `invokeIpc('jobs:get', id)` leave `projects.json` byte-identical.

### Phase 2: One status transition function (M)

1. Add `src/main/services/agent/job-status.ts`:

   ```ts
   export type JobStatus = 'running' | 'paused' | 'completed' | 'cancelled' | 'failed'

   export type StatusReason =
     | 'started'
     | 'resumed'
     | 'approved'
     | 'user_paused'
     | 'awaiting_approval'
     | 'pexels_quota'
     | 'app_quit'
     | 'restored'
     | 'finished'
     | 'error'
     | 'user_cancelled'

   const NEXT: Record<JobStatus, readonly JobStatus[]> = {
     running: ['paused', 'completed', 'failed', 'cancelled'],
     paused: ['running', 'cancelled'],
     completed: [],
     failed: [],
     cancelled: []
   }

   export function canTransition(from: JobStatus, to: JobStatus): boolean {
     return from === to || NEXT[from].includes(to)
   }
   ```

2. In the runner, add one method and route every assignment in the table above through it:

   ```ts
   /** The only place `this.status` changes. Returns false when the change isn't allowed. */
   private setStatus(to: JobStatus, reason: StatusReason): boolean {
     if (!canTransition(this.status, to)) {
       console.warn(`[${this.jobId}] Ignored status change ${this.status} -> ${to} (${reason})`)
       return false
     }
     this.status = to
     this.statusReason = reason
     return true
   }
   ```

   Callers and reasons: `start()` gives `started`; `resume()` gives `resumed`; `approveAndResume` gives `approved`; `pause()` gives `user_paused`; plan 04 phase 4's end-of-turn pause gives `awaiting_approval`; plan 01's `pauseForPexelsQuota()` gives `pexels_quota`; `pauseAll` on quit gives `app_quit`; finalize gives `finished` or `error`; `cancel()` gives `user_cancelled`.

3. **Restoring is not a transition.** `initializeAndLoadState` (line 444) sets the status from disk with `this.status = 'paused'; this.statusReason = 'restored'`, which bypasses `setStatus` on purpose. Plan 01 phase 3 already ensures only paused jobs get a runner there.
4. **The download callback stops deciding.** Delete the completion block in `handleDownloadProgress` (lines 1921 to 1940). The loop's own check at the top of each turn (lines 1000 to 1009) sees that every beat is done and exits, then `runLoopAndFinalize` settles and finalizes. The status reads `running` for those few seconds, which is accurate.
5. **`cancel()`** uses `setStatus('cancelled', 'user_cancelled')`. If it returns false (the job already finished), return without cancelling downloads or writing state.
6. **`runBackground`'s catch** (lines 316 to 327) records the error and calls finalize's decision function instead of setting status itself:

   ```ts
   } catch (error) {
     if (this.status === 'running') {
       this.loopError = error instanceof Error ? error.message : String(error)
       this.finalizeSuccessfulRun()
     }
   }
   ```

   `decideRunFinalizeFromBeats` already takes `loopError` into account. Rename `finalizeSuccessfulRun` to `finalizeRun`, since it decides failure too.

7. **Show the reason.** Add `statusReason` to `JobSnapshot`, persist it in agent-state, and show it in `run-header.tsx` under the status badge for paused jobs:

   | Reason              | Text                                          |
   | ------------------- | --------------------------------------------- |
   | `awaiting_approval` | Waiting for you to review the selected assets |
   | `pexels_quota`      | Pexels quota used up. Resume after it resets. |
   | `app_quit`          | Paused when the app closed                    |
   | `restored`          | Paused. Resume to continue.                   |
   | `user_paused`       | Paused                                        |

8. **`jobs:cancel` for an inactive job** (line 223) stays as a registry write, since no runner exists. Guard it: only `paused` jobs can be cancelled that way.

**Tests:**

- Unit: the `canTransition` table, including every terminal state rejecting everything but itself.
- Runner: the last download finishing in the middle of a turn doesn't skip that turn's remaining tool calls, and finalize runs exactly once (assert the "Agent workflow complete" log line).
- Runner: `cancel()` after completion leaves the status `completed`.
- Runner: each pause path records its reason in the snapshot.

### Phase 3: One writer per job (S)

1. Add two runner methods that update memory first, then persist through the runner's usual path:

   ```ts
   /** Library correction: files that disappeared from disk. */
   public async markFilesMissing(assetIds: string[]): Promise<void> {
     for (const id of assetIds) {
       const record = this.assetLookup.get(id)?.asset
       if (record?.status === 'completed') {
         record.status = 'failed'
         record.error = 'File not found on disk'
         record.filePath = undefined
       }
     }
     await this.persistSnapshot()
     this.emit('event', { jobId: this.jobId, type: 'beats', data: this.beats })
   }

   /** Library delete. Refuses while the asset is still downloading. */
   public async deleteLocalAsset(assetId: string): Promise<void> {
     const record = this.assetLookup.get(assetId)?.asset
     if (!record) return
     if (record.status === 'downloading') throw new Error('Wait for this download to finish before deleting it.')
     if (record.filePath && isPathInside(this.projectDir, record.filePath)) {
       await removeFile(record.filePath) // plan 01 phase 3: shell.trashItem, ENOENT counts as done
     }
     record.status = 'failed'
     record.error = 'Deleted by user'
     record.filePath = undefined
     this.recountAssets()
     await this.persistSnapshot()
     this.emit('event', { jobId: this.jobId, type: 'beats', data: this.beats })
   }
   ```

   `recountAssets` replaces the inline count at lines 1907 to 1919, which the download callback uses too.

2. In `assets.ipc.ts`, check for a runner first:

   ```ts
   const runner = AgentRunner.getActive(jobId)
   if (runner) return runner.deleteLocalAsset(assetId)
   // existing manifest path for inactive jobs
   ```

   In `assets:list`, when a runner exists, build the list from `runner.getSnapshot().beats` instead of the disk copy, and pass missing files to `runner.markFilesMissing`.

3. Importing `AgentRunner` into `assets.ipc.ts` is fine. `jobs.ipc.ts` already does it, and plan 03 adds the `.ts` extensions.

**Tests:** IPC. With a paused runner active, `invokeIpc('assets:deleteLocal', id, assetId)`, then resume to completion. The manifest on disk still shows the asset as deleted, and its file is gone (or in the stub's trash record).

### Phase 4: Small log entries (S)

1. Add a pure summarizer in `tool-schemas.ts`:

   ```ts
   /** What the run log keeps of a tool result. The full result stays in the conversation (agent-state.json). */
   export function summarizeToolResultForLog(toolName: string, result: unknown): unknown {
     const r = result as { total_results?: number; results?: Array<{ pexelsId?: number }> }
     if (
       (toolName === 'search_pexels_photos' || toolName === 'search_pexels_videos') &&
       Array.isArray(r?.results)
     ) {
       return {
         total_results: r.total_results,
         returned: r.results.length,
         ids: r.results.map((x) => x.pexelsId)
       }
     }
     return result
   }
   ```

   Selection, download, and error results are already small, so they pass through. Use it at line 1710: `this.log('tool_result', `Result for ${tc.name}`, summarizeToolResultForLog(tc.name, result))`.

2. **Bound what `jobs:get` returns for inactive jobs.** Add a pure `tailLogEntries(lines: string[], max = 1000): AgentLogEvent[]` that parses only the newest `max` lines and replaces any `data` over 4,000 characters with `{ truncated: true, characters: n }`. Old runs that logged full results then load quickly. Use it at lines 302 to 319.
3. The Run screen console shows the summary. Say so in the console's empty state or tooltip: "Full search results are saved in agent-state.json in the project folder."

**Tests:**

- Unit: `summarizeToolResultForLog` (search shapes, pass-through).
- Unit: `tailLogEntries` (more than `max` lines, malformed lines skipped, large `data` truncated).

### Phase 5: Fix job settings for the job's life (M)

1. Define what a job pins:

   ```ts
   export interface JobRuntimeSettings {
     providerId: LlmProviderId
     modelId: string
     maxIterations: number
     requestTimeoutSeconds: number
     skipExplicit: boolean
     avoidPeople: boolean
     requireApproval: boolean
   }
   ```

   Download concurrency and API keys are not pinned. They're machine settings, and a changed key should apply immediately.

2. **Create it once.** In `ensureRegistered()` for a new job, build it from the current settings. Store it in agent-state.json (`persistAgentConversationState` gains a `runtimeSettings` field). Mirror provider and model into the manifest's `settingsSnapshot`, which it already does.
3. **Load it on resume.** `loadAgentState` reads `runtimeSettings`. `applyRuntimeSettings()` takes its values from the pinned record when one exists, and only reads `maxConcurrentDownloads` from global settings. Old jobs without the field fall back to today's behavior, but read provider and model from the manifest's `settingsSnapshot` when present: add `provider` and `modelId` to `ManifestSettingsSnapshotSchema`.
4. **Missing key for the pinned provider.** Fail the resume with a message that names both options: "This job was started with OpenRouter (deepseek/deepseek-v4.1-flash). Add an OpenRouter key in Settings, or choose Resume with current settings."
5. **"Resume with current settings."** A second action next to Resume on paused jobs, shown only when the current provider, model, or limits differ from the job's. It calls `jobs:resume(jobId, { useCurrentSettings: true })`:
   - Re-pin from the current settings.
   - Clear `this.messages`. The loop seeds a new opening message, and the status block appended to every request (`messagesWithCacheStablePrefix`) tells the model which beats already have assets.
   - Log "Resumed with openai / gpt-4o. Earlier conversation dropped because it was written for another provider."
6. **`jobs:expandIdea`** (lines 246 to 272) has no job yet and keeps using current settings. Its `settings.modelId || 'gpt-4o'` fallback goes away with plan 01 phase 1's shared defaults.

**Tests:**

- Runner: change provider and model in settings between pause and resume. The resumed requests use the pinned model (assert on the fake LLM's request log).
- Runner: `useCurrentSettings` uses the new model and an empty conversation.
- Runner: an old agent-state without `runtimeSettings` resumes with the manifest's provider.

### Phase 6: Show token usage (S)

1. In `run-header.tsx`, under the status line, when `job.usage` is present and `settings.hideEstimatedCost` is not set:

   ```tsx
   {
     job.usage && !hideUsage ? (
       <p className="font-body-md text-body-md text-outline">
         {formatTokens(job.usage.inputTokens)} tokens in
         {job.usage.cachedInputTokens
           ? ` (${formatTokens(job.usage.cachedInputTokens)} cached)`
           : ''}
         {' · '}
         {formatTokens(job.usage.outputTokens)} out
       </p>
     ) : null
   }
   ```

   `formatTokens` is `n.toLocaleString()`. Cached tokens come from plan 02 phase 2. Usage arrives in snapshots, and plan 01 phase 3 persists it, so it survives a restart.

2. Rename the toggle's label in `SafetyPanel.tsx` to "Hide token usage". Keep the stored key `hideEstimatedCost` so existing settings keep working, and note the old name in a comment where the key is declared.
3. README lines 256 and 257: replace the claim with "Shows input, cached, and output tokens for each job on the Run screen." Remove "estimated LLM fees".

**Manual check:** run a job and watch the token line grow each turn. Turn on the toggle and the line disappears. Restart the app and open the job: the totals are still there.

## Risks and mitigations

| Risk                                                                                                     | Mitigation                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| A path not listed here still sets `this.status` directly                                                 | Make `status` a private field read through a getter, and grep for `this.status =` in review. Phase 2's test fails if a terminal state is ever left. |
| Removing the read-time reconciliation leaves an old job stuck as `failed` although everything downloaded | Rare after plan 04 phase 1. Rerun is available, and the job's files are intact.                                                                     |
| Pinning settings surprises a user who changed the model to fix a failing job                             | "Resume with current settings" is shown exactly in that situation, with the reason in the log.                                                      |
| Summarized logs make debugging harder                                                                    | The full results are still in agent-state.json, and the console says where.                                                                         |

## Open questions

- Should paused jobs stay in `activeRunners` across a long idle period? They hold memory and a downloader. Unloading them after an hour and reloading on resume would be safe once phase 5 pins settings. Not needed yet.
