# Bugfix log

Recursive search on the entire repo. Branch: `bugfix/recursive-search`.

---

## [Iteration 1] Concurrent project registry saves drop jobs

- File(s): `src/main/services/storage/project-store.ts`
- Severity: blocker
- Root cause: `save()` / `delete()` read `projects.json` outside the write queue. Two running jobs could snapshot the same list; the later write discarded the earlier job’s status or even a newly added project.
- Fix: Run the full read-modify-write inside the existing serial write queue.
- Test added/updated: none needed at this seam (depends on Electron `app.getPath`). Covered by the queueing change matching the proven `ManifestWriter` pattern.
- Verified: `npm run typecheck` pass; `npm test` pass

## [Iteration 1] Resume reloads manifest and duplicates in-flight downloads

- File(s): `src/main/services/agent/agent-runner.ts`
- Severity: major
- Root cause: `resume()` → `start()` always called `loadStateFromManifest()`, which resets `downloading` assets to `pending`. The downloader was still running those tasks, and the agent could enqueue them again.
- Fix: Reload from disk only when this runner has no beats in memory (fresh start / crash reconstruct already loads via `initializeAndLoadState`).
- Test added/updated: none needed, existing start/resume control flow; duplicate enqueue also guarded below
- Verified: `npm run typecheck` pass

## [Iteration 1] Expired Pexels CDN URLs never refresh

- File(s): `src/main/services/pexels/pexels-downloader.ts`, `src/main/services/pexels/download-task-utils.ts`
- Severity: major
- Root cause: Download HTTP 401/403 was classified as permanent, so the existing `refreshUrl` retry path never ran. Signed Pexels/Vimeo links commonly expire with 403.
- Fix: Treat 401/403/408/429/5xx as retryable for downloads only (API auth failures stay permanent in `classifyHttpStatus`).
- Test added/updated: `test/download-retry.test.ts`
- Verified: `npm test` — 13 pass

## [Iteration 1] Backoff marked assets pending and allowed a second enqueue

- File(s): `src/main/services/pexels/pexels-downloader.ts`, `src/main/services/pexels/download-task-utils.ts`, `src/main/services/agent/agent-runner.ts`
- Severity: major
- Root cause: Retry backoff set queue status to `pending`, which propagated to the asset record. `download_selected_assets` then treated it as not in-flight and enqueued a duplicate.
- Fix: Deduplicate in-flight enqueue; keep the asset `downloading` while `backingOff`.
- Test added/updated: `test/download-retry.test.ts` (`findInFlightDownload`)
- Verified: `npm test` pass

## [Iteration 1] Pause/cancel waited out retry backoff

- File(s): `src/main/services/http/api-errors.ts`
- Severity: major
- Root cause: `fetchWithRetry` classified `AbortError` as transient and slept up to 30s before noticing `isAborted()`. Pause felt stuck.
- Fix: Interrupt backoff with the request AbortSignal; if the caller already aborted, fail permanently without another retry.
- Test added/updated: `test/api-errors.test.ts`
- Verified: `npm test` pass

## [Iteration 1] Combined timeout signal ignored an already-aborted parent

- File(s): `src/main/services/http/abort-signal.ts`, `src/main/services/agent/agent-runner.ts`
- Severity: major
- Root cause: `addEventListener('abort')` does not fire for a past abort. A pause that won the race with `getCombinedSignal` left the LLM/Pexels request running until timeout.
- Fix: Abort the child immediately when the parent is already aborted.
- Test added/updated: `test/abort-signal.test.ts`
- Verified: `npm test` pass

## [Iteration 1] Local asset delete errors were swallowed

- File(s): `src/main/ipc/assets.ipc.ts`, `src/renderer/src/routes/downloaded-stuff.tsx`
- Severity: major
- Root cause: `assets:deleteLocal` logged I/O failures and returned success. The library UI cleared the selection as if the file was gone.
- Fix: Rethrow after logging; the renderer shows a delete-failed alert.
- Test added/updated: none needed, existing test covers it — no unit seam for Electron IPC; behavior is a thrown error vs swallow
- Verified: `npm run typecheck` pass

## [Iteration 1] Media library type and status filters overwrote each other

- File(s): `src/renderer/src/routes/downloaded-stuff.tsx`
- Severity: minor
- Root cause: One `filter` state backed both the Videos/Photos buttons and the Status dropdown, so choosing Videos made the status `<select>` invalid and dropped status filtering.
- Fix: Independent `typeFilter` and `statusFilter`.
- Test added/updated: none needed, existing test covers it
- Verified: `npm run typecheck` pass

## [Iteration 2] Settings and secrets files could lose concurrent writes

- File(s): `src/main/services/storage/settings-store.ts`, `src/main/services/storage/secure-secrets.ts`
- Severity: major
- Root cause: Same read-modify-write race as the project registry, for `settings.json` and `secrets.json`.
- Fix: Serialize updates on a write queue; secret encrypt/write is a single queued operation per key.
- Test added/updated: none needed, existing test covers it (Electron `app` / `safeStorage`)
- Verified: `npm run typecheck` pass; `npm test` pass

## [Iteration 2] Lint failures on vanilla JS and Prettier

- File(s): `eslint.config.mjs`, `src/renderer/src/components/BrandLogo.tsx`
- Severity: cosmetic
- Root cause: `@typescript-eslint/explicit-function-return-type` ran on `website/site.js`; BrandLogo extra parens failed Prettier.
- Fix: Disable that rule for `**/*.js`; Prettier-format the icon return.
- Test added/updated: none needed
- Verified: `npm run lint` pass

---

## Final summary

- **Found / fixed:** 10 confirmed (1 blocker, 7 major, 1 minor, 1 cosmetic)
- **Deferred (needs human review or out of scope):**
  - `PexelsRateLimitTracker.waitForQuota` can sleep up to 1 hour when monthly quota is exhausted — looks intentional, but it blocks the agent with no cancel path besides job abort.
  - LLM/Pexels timeouts still cannot retry the same `AbortController` after it fires (a new controller per attempt would be a larger change).
  - `jobs:cancel` with no live runner only updates the registry, not `manifest.json`.
  - Crashed jobs left as `running` cannot be resumed (resume only restores `paused`). Unclear if that should auto-pause on startup.
  - Sidebar footer still says “v1.0 Industrial” while `package.json` is 1.2.9 — may be branding, not a version string.
- **User-visible behavior changes:**
  - Pause/cancel returns without waiting out HTTP backoff.
  - Expired video/photo CDN links retry with a refreshed Pexels URL instead of failing immediately.
  - Resume no longer restarts in-flight downloads from scratch.
  - Failed local deletes show an error instead of silently succeeding.
  - Media library can filter by type and download status at the same time.
- **Confidence the codebase is clean:** medium-high for logic in main-process stores, downloads, abort, and resume. Medium overall — the Electron UI and full agent loop still have a thin automated suite (no IPC/e2e tests), so renderer-only races could remain.
