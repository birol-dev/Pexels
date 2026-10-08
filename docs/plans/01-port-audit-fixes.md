# Plan 01: Port the `audit-fixes` Branch

Status: proposed · Size: M (phases 1 to 3 are S each) · Depends on: nothing

## Why

The local branch `audit-fixes` contains a tested fix for the most serious bug in the app (every job fails on the default model) and about a dozen smaller fixes. None of it is on `main`, and the branch exists only on this machine. Porting it is the cheapest, highest-value work in this folder.

## Current state (audited)

- One commit, `d00be56` (2026-10-03): "fix: audit fixes for theme, LLM limits, Pexels quota and downloads". It touches 74 files (+9,841 / −2,838). Most of that line count is unrelated to the main process: `.agents/skills/*` content, the website, and a renderer theme rewrite.
- There is no remote copy. `git branch -vv --all` lists no `origin/audit-fixes`.
- Its base is `904c261`. `main` has 8 commits since, including the renderer split into `src/renderer/src/features/` (`3f82d4a`), design-system tokens (`6801f1e`), and PR #4 (`778569e`, agent robustness and prompt changes).
- The branch documents itself in `docs/05-audit-fixes-and-followups.md`, which exists only on that branch. Read it with `git show d00be56:docs/05-audit-fixes-and-followups.md`. Its "Still open" list says no live job was ever run: "The token-cap fix is covered by unit tests using the documented error text, but it has not been exercised against the live API."

### Which files port cleanly

This table was produced with `git diff --numstat 904c261 main -- <file>` for every file the audit touched. Re-run that command before checking anything out, in case `main` has moved.

| File                                                                                         | Changed on `main` since `904c261`? | How to port                                   |
| -------------------------------------------------------------------------------------------- | ---------------------------------- | --------------------------------------------- |
| `src/main/services/llm/llm-provider.ts`                                                      | No                                 | `git checkout d00be56 -- <file>`              |
| `src/shared/llm-defaults.ts`                                                                 | New file                           | checkout                                      |
| `src/main/services/pexels/pexels-rate-limit.ts`                                              | No                                 | checkout                                      |
| `src/main/services/pexels/pexels-client.ts`                                                  | No                                 | checkout                                      |
| `src/main/services/pexels/pexels-downloader.ts`                                              | No                                 | checkout                                      |
| `src/main/services/pexels/download-url-validation.ts`                                        | No                                 | checkout                                      |
| `src/main/services/files/manifest-writer.ts`                                                 | No                                 | checkout                                      |
| `src/main/services/storage/settings-store.ts`                                                | No                                 | checkout                                      |
| `src/main/ipc/jobs.ipc.ts`, `assets.ipc.ts`, `settings.ipc.ts`                               | No                                 | checkout                                      |
| `src/renderer/src/lib/store.ts`, `src/renderer/src/env.d.ts`                                 | No                                 | checkout                                      |
| `electron-builder.yml`, `electron.vite.config.ts`, `tsconfig.node.json`, `tsconfig.web.json` | No                                 | checkout                                      |
| `test/model-request-quirks.test.ts`, `test/pexels-quota-and-redirects.test.ts`               | New files                          | checkout                                      |
| `test/manifest-writer.test.ts`                                                               | No                                 | checkout                                      |
| `src/main/services/agent/agent-runner.ts`                                                    | Yes (+220 / −118)                  | apply the hunks by hand (phases 1 to 3)       |
| `src/main/services/agent/tool-schemas.ts`                                                    | Yes (+144)                         | one message string, by hand                   |
| `src/main/services/llm/idea-expander.ts`                                                     | Yes                                | three lines, by hand                          |
| `src/main/index.ts`                                                                          | Yes                                | **do not port** (see below)                   |
| `src/renderer/src/routes/*.tsx`, `App.tsx`, `assets/main.css`, `index.html`                  | Rewritten on `main`                | do not port; phase 5 re-checks the behaviors  |
| `package.json`, `package-lock.json`                                                          | Yes                                | re-run the install commands instead (phase 4) |

**Do not port the Content-Security-Policy hunk in `src/main/index.ts`.** The audit removed `https://fonts.googleapis.com` and `https://fonts.gstatic.com` from the CSP because its version of the renderer stopped loading Google Fonts. On `main`, `src/renderer/index.html` lines 9 to 20 still load JetBrains Mono, Plus Jakarta Sans, Cabinet Grotesk, and Satoshi from Google Fonts. Taking the hunk would block every one of those fonts.

## Goals

- Every main-process fix from the branch is on `main`, together with its tests.
- A job with default settings completes against the live OpenAI API.
- Electron is on a supported major version.

## Non-goals

- The audit's theme and onboarding rewrites. `main` has since replaced those screens. Phase 5 lists which behaviors still need doing.
- The `.agents/skills/*` and `website/*` changes. If wanted, they go in separate PRs.

## Key decisions

| Decision               | Choice                                  | Why                                                                                                                |
| ---------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Merge, rebase, or port | Port file by file                       | The base is 8 commits behind and the renderer was restructured in between. A merge would conflict on every screen. |
| Order                  | LLM limits, then Pexels, then lifecycle | The LLM fix unblocks every job. The others are independent and smaller.                                            |
| Electron upgrade       | Its own PR                              | It is the riskiest change, so it should bisect on its own.                                                         |

## Phases

### Phase 0: Back up the branch (5 minutes)

```bash
git push -u origin audit-fixes
```

No other step in this plan is worth risking the only copy of that commit.

### Phase 1: LLM request limits (S, ship first)

**The bug.** `LLM_STRUCTURED_MAX_OUTPUT_TOKENS` and `LLM_AGENT_TURN_MAX_OUTPUT_TOKENS` in `llm-provider.ts` are both 32,768. The default model is `gpt-4o` (`settings-store.ts` line 51, `agent-runner.ts` line 225, `idea-expander.ts` line 131, `jobs.ipc.ts` line 250, `llm-provider.ts` line 396), and `gpt-4o` allows at most 16,384 output tokens. OpenAI rejects the request with HTTP 400. `fetchWithRetry` classifies a 400 as permanent, so the first LLM call of every job fails: idea expansion in idea mode, beat splitting in script mode. "Test connection" passes anyway because `testConnectionWithPing` sends `maxOutputTokens: 10`.

**The fix on the branch.** `sendWithLearnedQuirks` in the audit's `llm-provider.ts` wraps each request. When the provider answers 400, `learnModelRequestQuirk` reads the message:

- If it names an output-token limit, `statedTokenCap` extracts the number ("at most 16384", "maximum of …", "up to …", or Gemini's "range is from 1 (inclusive) to 8193 (exclusive)"). If there's no number, the cap is half of what was sent.
- If it says temperature is unsupported ("Only the default (1) value is supported"), temperature is omitted.

The learned values are stored per endpoint and model (`${url}::${model}`) for the rest of the session, and the request is resent, at most twice per turn. There's no model table, as docs/04 requires.

Steps:

1. Create the branch and take the files that apply cleanly:

   ```bash
   git switch main && git pull
   git switch -c port/audit-llm-limits
   git checkout d00be56 -- src/main/services/llm/llm-provider.ts src/shared/llm-defaults.ts \
     test/model-request-quirks.test.ts tsconfig.node.json tsconfig.web.json \
     src/main/services/storage/settings-store.ts
   ```

   The two `tsconfig` files only add `src/shared/**/*` to `include`. `settings-store.ts` takes its defaults from `llm-defaults.ts` and adds an optional `modelIdByProvider` field.

2. Replace the remaining hard-coded defaults by hand:
   - `src/main/services/llm/idea-expander.ts` lines 130 and 131: `params.providerId || DEFAULT_LLM_PROVIDER` and `params.modelId || DEFAULT_MODEL_IDS[providerId]`, importing from `'../../../shared/llm-defaults.ts'`.
   - `src/main/services/agent/agent-runner.ts` lines 225 and 226: `private modelId = DEFAULT_MODEL_IDS[DEFAULT_LLM_PROVIDER]` and `private providerId: LlmProviderId = DEFAULT_LLM_PROVIDER`.
   - `src/main/ipc/jobs.ipc.ts` lines 249 and 250 (in `jobs:expandIdea`): the same two defaults. Phase 3 replaces this file entirely, but doing it now keeps phase 1 self-contained.
   - `src/main/services/agent/tool-schemas.ts`, the `zero_downloads` message in `decideRunFinalize`: replace "Try using a model with robust tool calling support (such as gpt-4o, claude-3.7-sonnet, …)" with "Try a model with reliable tool calling support."

   Then check that nothing is left: `rg "'gpt-4o'" src` should match only `src/shared/llm-defaults.ts`.

3. Run `npm run typecheck` and `npm test`. `test/model-request-quirks.test.ts` covers the OpenAI token cap, the unsupported-temperature error, and the Gemini range wording.

4. Live check (needs an OpenAI key). Set the provider to OpenAI and the model to `gpt-4o`, then start a job with a three-sentence script. Expected: the job finishes, and the first beat-split request is sent twice (once rejected, once with 16,384). Paste the exact 400 message into the PR description. If OpenAI's wording no longer matches `statedTokenCap`, fix the regular expression and add the new wording to the test.

Done when the live job completes and the quirk tests pass.

### Phase 2: Pexels quota and download safety (S)

**The bugs.**

- _Quota stall._ When the monthly quota is exhausted, `PexelsRateLimitTracker.waitForQuota` sleeps up to `MAX_WAIT_MS = 3_600_000` (one hour) inside a tool call, and the job looks hung. docs/04 line 64 says: "On `429`, stop new Pexels calls for that job and show `pexels_rate_limited`."
- _Redirects._ `pexels-downloader.ts` calls `fetch(task.url, { signal })` with the default `redirect: 'follow'` and validates `response.url` afterwards. By then, a redirect to a host outside the allowlist has already been requested.
- _Size._ There is no download size cap and no free-space check.

**The fix on the branch.**

- `waitForQuota` waits only when the reset is under 90 seconds away (`MAX_INLINE_WAIT_MS`). Otherwise it throws a permanent `ApiError` with status 429 and a message starting `pexels_rate_limited`. The runner then pauses the job and logs the reset time. The quota wait sits outside the circuit-breaker `try`, so an exhausted quota doesn't count as an upstream failure.
- `fetchValidatedDownload` follows up to 5 redirects by hand with `redirect: 'manual'`, validating each hop before requesting it.
- Downloads are capped at 4 GiB (`MAX_DOWNLOAD_BYTES`), checked against `content-length` and again while streaming. `statfs` checks free space, leaving a 200 MiB margin; when `statfs` is unsupported, as on some network shares, the check is skipped.
- Changing the Pexels key clears learned quota state (`PexelsClient.resetQuota()` in `settings.ipc.ts`).

Steps:

1. Take the files:

   ```bash
   git checkout d00be56 -- src/main/services/pexels/pexels-rate-limit.ts \
     src/main/services/pexels/pexels-client.ts src/main/services/pexels/pexels-downloader.ts \
     src/main/services/pexels/download-url-validation.ts src/main/ipc/settings.ipc.ts \
     test/pexels-quota-and-redirects.test.ts
   ```

   `settings.ipc.ts` also brings `removeSecrets` (explicit key removal) and `modelIdByProvider`. Both do nothing until the renderer uses them (phase 5).

2. Add the runner hunk by hand. In `executeToolCall`'s `catch` block (`agent-runner.ts` around line 1696), after `result = failure.result`:

   ```ts
   if (
     error instanceof ApiError &&
     error.statusCode === 429 &&
     PexelsClient.isQuotaExhausted() &&
     this.status === 'running'
   ) {
     this.pauseForPexelsQuota()
   }
   ```

   Add the method next to `executeToolCall`. This is verbatim from `d00be56`:

   ```ts
   /** docs/04: on an exhausted quota, stop new Pexels calls for this job and say why. */
   private pauseForPexelsQuota(): void {
     const quota = PexelsClient.getQuotaSnapshot()
     const resetNote = quota ? ` It resets ${new Date(quota.resetAt * 1000).toLocaleString()}.` : ''
     this.status = 'paused'
     this.log(
       'error',
       `Pexels API quota is exhausted, so the job was paused.${resetNote} Resume after the reset, or add a different Pexels key in Settings.`
     )
     this.updateProgress('Paused — Pexels quota exhausted', this.progress)
     this.abortController?.abort()
   }
   ```

   `ApiError` is not imported in `agent-runner.ts` on `main`. Add `import { ApiError } from '../http/api-errors.ts'`.

3. Run `npm test`. The new test file covers failing fast, the quota-remaining path, and the redirect cases.

4. Manual check: a real exhausted quota is hard to produce. Rely on the tests here. Plan 03's runner tests add an end-to-end case with a fake 429.

### Phase 3: Job lifecycle, deletes, and token usage (S)

**The bugs.**

- `jobs:approveAndResume` (`jobs.ipc.ts` lines 192 to 213) creates a runner for any job that has a summary. `initializeAndLoadState()` forces the status to `paused`, so approving a completed or cancelled job restarts it.
- `cancel()` on a paused runner never removes it from `AgentRunner.activeRunners`, because only `runBackground`'s `finally` does that and no run is in flight. `jobs:get` keeps serving the stale instance.
- Every `snapshot` event carries the full `logs` array, which includes every tool result.
- Token usage isn't persisted. A resumed job starts counting from zero.
- Deletes are permanent: `jobs:delete` uses `fs.rm(…, { recursive: true, force: true })` and `assets:deleteLocal` uses `fs.unlink`.

**The fix on the branch.**

- `approveAndResume` only creates a runner when `summary.status === 'paused'`.
- `cancel()` drops the paused runner from the map.
- `emitSnapshot()` sends snapshots without `logs`, and the renderer store keeps its own log list. `jobs:get` still returns everything.
- `usage` is saved in `manifest.json` through `parseTokenUsage`, carried across resumes, and returned for inactive jobs.
- Deletes go to the OS trash with `shell.trashItem`. If the trash is unavailable, the delete fails with a message rather than deleting permanently.

Steps:

1. Take the files:

   ```bash
   git checkout d00be56 -- src/main/ipc/jobs.ipc.ts src/main/ipc/assets.ipc.ts \
     src/main/services/files/manifest-writer.ts test/manifest-writer.test.ts \
     src/renderer/src/lib/store.ts src/renderer/src/env.d.ts
   ```

   The renderer store hasn't changed on `main` since the base, so the audit's version applies whole. It merges log-less snapshot events into the active job and buffers snapshots that arrive before the first `jobs:get` returns.

2. Apply the runner hunks by hand in `agent-runner.ts`:
   - Add `emitSnapshot()`, then replace each `this.emit('event', { jobId: this.jobId, type: 'snapshot', data: this.getSnapshot() })` with `this.emitSnapshot()`. On `main` there are six, at lines 345, 652, 676, 692, 854, and 1952.

     ```ts
     /**
      * Snapshot events omit `logs`: every entry already went out as its own 'log'
      * event, and tool results make the array megabytes on long runs. `jobs:get`
      * still returns the full snapshot.
      */
     private emitSnapshot(): void {
       const snapshot: Partial<JobSnapshot> = this.getSnapshot()
       delete snapshot.logs
       this.emit('event', { jobId: this.jobId, type: 'snapshot', data: snapshot })
     }
     ```

   - In `cancel()` (line 680), inside `if (!this.activePromise) {`, add `AgentRunner.activeRunners.delete(this.jobId)` as the first line.
   - In `loadStateFromManifest`, after the `visualConcept` block (line 464): `this.usage = parseTokenUsage(manifest.usage) ?? this.usage`.
   - In `writeManifest`, add `usage: parseTokenUsage(this.usage)` to the manifest object.
   - Change the import to `import { ManifestWriter, type ManifestData, parseTokenUsage } from '../files/manifest-writer.ts'`.

3. Run `npm test`, then check by hand:
   - Start an approval-mode job and cancel it while it waits for approval. Open another job and come back: the cancelled job shows as cancelled, not paused.
   - Delete an asset in the Library. It appears in the OS trash.
   - Pause a job, quit the app, reopen it, and resume. The token total continues from where it was.

### Phase 4: Electron upgrade (M, its own PR)

`package.json` pins `"electron": "^39.2.6"`. Electron supports the three newest stable majors, so 39 no longer gets security fixes. The audit moved to 44.5.1 and verified a build and a first launch on Windows. It did not run a job, and it did not test macOS or Linux.

1. Check the newest stable major on [releases.electronjs.org](https://releases.electronjs.org) and pick it (44.x on the audit date).
2. `npm install --save-dev electron@^44`. The audit built with electron-vite 5 and electron-builder 26, so those stay.
3. Read Electron's breaking-changes document for every major from 40 to the target. Check the APIs this app uses:
   - `protocol.registerSchemesAsPrivileged` and `protocol.handle` (`index.ts` lines 18 and 132)
   - `session.defaultSession.webRequest.onHeadersReceived` (line 160)
   - `safeStorage` (`secure-secrets.ts`)
   - `shell.trashItem`, `shell.openPath`, `shell.showItemInFolder`, `shell.openExternal`
   - `BrowserWindow` with `sandbox: true` and a preload script
   - `net.fetch` and `dialog.showOpenDialog`
4. Platform minimums: the audit doc says Electron 44 needs macOS 13 or later and drops 32-bit Windows. Confirm this in the release notes and add it to the README's system requirements.
5. Verify: `npm run build`, then `npm run build:unpack`, launch `dist/win-unpacked`, run one job, and play a downloaded video in the Library (this exercises the `media://` protocol).

### Phase 5: Renderer behaviors to redo in `features/` (M)

The audit changed these behaviors in screens that `main` has since replaced. Check each one on `main` and re-implement only what's missing.

| Behavior the audit added                                      | Where to look on `main`                                                                                | Status on `main`                                                                                                                                                                     |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Token usage on the Run screen, and a working "hide" toggle    | `features/agent-run/components/run-header.tsx`, `features/settings/components/SafetyPanel.tsx` line 45 | **Missing.** `JobSnapshot.usage` exists in `store.ts`, but no component reads it. The toggle saves `hideEstimatedCost` and nothing reads that either. Plan 06 phase 6 implements it. |
| Stored API keys can be removed                                | `features/settings/components/ProviderPanel.tsx`, `PexelsPanel.tsx`                                    | **Missing.** `removeSecrets` appears only in the store. Add a "Remove key" action that calls `updateSettings({ removeSecrets: ['openaiKey'] })`.                                     |
| Model id remembered per provider                              | `ProviderPanel.tsx`, `features/settings/hooks/useSettingsForm.ts`                                      | Check: switch provider and back; the last model id should return. If not, read and write `modelIdByProvider`.                                                                        |
| API keys saved on Enter or blur, not on every keystroke       | `features/settings/hooks/usePersistQueue.ts`                                                           | Check.                                                                                                                                                                               |
| Cancel asks for confirmation                                  | `features/agent-run/components/run-actions.tsx`                                                        | Check. `components/common/ConfirmModal.tsx` exists.                                                                                                                                  |
| Real version number in the app shell                          | App shell or sidebar                                                                                   | Check. `__APP_VERSION__` is defined once phase 6's Vite config is in.                                                                                                                |
| Library durations shown as `m:ss`                             | `features/library/utils.ts`                                                                            | Check.                                                                                                                                                                               |
| Onboarding reports missing keys and real test failure reasons | `features/onboarding/hooks/useOnboarding.ts`                                                           | Check.                                                                                                                                                                               |
| Readable contrast in both themes                              | `npm run check:contrast`                                                                               | `main` has its own contrast guard. Run it.                                                                                                                                           |

Optional: port the Playwright UI smoke tests (`test/ui/*`, the `test:ui` and `preview:ui` scripts, and the `@playwright/test` dev dependency). They were written against the old screens, so the selectors need rework. They're worth the effort, since nothing else tests the rendered UI.

### Phase 6: Build and tooling (S)

1. Take the files:

   ```bash
   git checkout d00be56 -- electron-builder.yml electron.vite.config.ts .gitattributes
   ```

   - `electron-builder.yml` keeps `.agents`, `.claude`, `.cursor`, `.github`, Playwright output, `skills-lock.json`, `postcss.config.js`, and `*.tsbuildinfo` out of the installer.
   - `electron.vite.config.ts` turns on renderer minification (`build.minify: 'esbuild'`; the audit measured 793 kB → 328 kB) and defines `__APP_VERSION__`.
   - `.gitattributes` forces LF line endings. Commit it, then run `git add --renormalize .` and commit that separately. The renormalize commit is large but changes no content.

2. CI: add the audit's `npm run build` step to `.github/workflows/ci.yml`. Add the UI and Electron smoke steps only once phase 5's tests exist.
3. Verify with `npm run build:unpack` and `npx @electron/asar list dist/win-unpacked/resources/app.asar`. Plan 09 continues the packaging work from here.

## Tests

| Test                                                                        | Source  | Covers                                                 |
| --------------------------------------------------------------------------- | ------- | ------------------------------------------------------ |
| `test/model-request-quirks.test.ts`                                         | ported  | token cap, temperature, Gemini range wording           |
| `test/pexels-quota-and-redirects.test.ts`                                   | ported  | quota fails fast, quota remaining, redirect validation |
| `test/manifest-writer.test.ts`                                              | ported  | `usage` round trip                                     |
| Runner end-to-end: token-cap retry, quota pause, approve on a completed job | plan 03 | the runner hunks from phases 1 to 3                    |

## Risks and mitigations

| Risk                                                                      | Mitigation                                                                                                            |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| A checkout overwrites a change made on `main` after this plan was written | Re-run `git diff --numstat 904c261 main -- <file>` before each checkout. Any file with output must be merged by hand. |
| The provider changes its error wording and the quirk regex stops matching | The original 400 is surfaced unchanged, so the failure is visible, not silent. Add the new wording to the test.       |
| The OS trash is unavailable (some network drives)                         | The audit's code fails with a message instead of deleting permanently. Keep that behavior.                            |
| The Electron upgrade breaks something                                     | It is a separate PR. Test on Windows before merging, and on macOS and Linux before the release (docs/05 item 3).      |

## Open questions

- Should the audit's theme rewrite be redone on `main`, or does `main`'s own design-system work (`6801f1e`, `468d6f0`) supersede it? Compare screenshots of both before deciding.
- Should the audit's `.agents/skills/*` additions stay in the repo? They don't affect the app, and plan 09 keeps `.agents` out of the installer either way.
