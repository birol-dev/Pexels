# Plan 03: A Test Harness for the Agent Runner

Status: proposed · Size: M · Depends on: plan 01 phase 1 (so the token-cap test can pass)

## Why

`agent-runner.ts` is 2,012 lines and holds the agent's control flow, approval handling, resume logic, download bookkeeping, and finalization. No test loads it. The 258 tests that pass cover the helper modules it calls, not the runner. Every runner bug in plans 04 to 06 was found by reading the code or with a throwaway esbuild bundle. `docs/03-implementation-backlog.md` phase 4 already planned "fake providers" and an "integration test for a complete fake job". This plan does that work.

## Current state (audited)

- `npm test` runs `node --experimental-strip-types --test test/**/*.test.ts` on Node 22. Tests import source files directly with explicit `.ts` paths, for example `'../src/main/services/agent/message-compaction.ts'`.
- Node's type stripping removes type annotations but cannot tell which imported names are types. A plain `import { SomeInterface } from './x.ts'` survives as a runtime import, and loading fails with "does not provide an export named 'SomeInterface'". Node's ESM loader also requires file extensions on relative imports.
- Three things stop `agent-runner.ts` from loading under `node --test`:
  1. **Interfaces imported as values.**
     - `agent-runner.ts`: `AgentMessage` and `NormalizedToolCall` (lines 6 and 7), `DownloadTask` (line 14), `ManifestData` (line 32), `JobSummary` (line 33).
     - `pexels-client.ts` line 16: `PexelsQuotaSnapshot`.
     - The IPC files, which are needed for IPC tests: `jobs.ipc.ts` lines 3, 6, 9 (`StartJobInput`, `JobSnapshot`, `JobSummary`, `ExpandedScriptResult`) and `assets.ipc.ts` line 5 (`VisualBeat`).
  2. **Relative imports without an extension.** `pexels-client.ts` lines 1 to 3 and 15 to 18, `pexels-downloader.ts` lines 6 to 8, and every relative import in `src/main/ipc/*.ts`. `src/main/index.ts` is not needed by tests and can stay as it is.
  3. **Top-level `electron` imports** in modules the runner loads: `secure-secrets.ts` (`app`, `safeStorage`), `project-store.ts` (`app`), and `settings-store.ts` (`import * as electron`). The IPC files also import `ipcMain`, `shell`, `dialog`, and `BrowserWindow`.

- The network needs no dependency injection. All of it goes through the global `fetch`, from exactly two call sites: `fetchWithRetry` in `http/api-errors.ts` line 158 (LLM and Pexels API) and `pexels-downloader.ts` line 235 (media files). Plan 01's `fetchValidatedDownload` also uses the global `fetch`. A test can replace `globalThis.fetch` and see every request.
- `AgentRunner.start()` awaits the whole background run (`agent-runner.ts` lines 621 and 622), so a test can `await runner.start()` and then inspect the result.
- The storage modules use only `app.getPath('userData')` and `safeStorage.isEncryptionAvailable`, `encryptString`, and `decryptString`. A stub stays small.

## Goals

- `agent-runner.ts` and the IPC handlers load under `node --test`, with no bundler and no new test framework.
- Tests run complete fake jobs: a scripted LLM, fixture Pexels responses, small media files, and a temporary download folder.
- The bugs fixed in plans 01, 04, 05, and 06 each have an end-to-end test.
- A repeatable live evaluation exists for prompt and pipeline changes.

## Non-goals

- Renderer component tests. Plan 01 phase 5 covers the UI smoke tests.
- Dependency injection in the runner. The global `fetch` and the `electron` stub are enough, and keep production code unchanged.

## Key decisions

| Decision                  | Choice                                                                                          | Why                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| How to load the runner    | Make the source loadable by Node directly                                                       | No bundler step, matches how the existing 258 tests work, and the fixes are mechanical. |
| How to keep it loadable   | `verbatimModuleSyntax` in `tsconfig.node.json`, plus a small test that checks import extensions | Typecheck fails on a type imported as a value; the test fails on a missing extension.   |
| How to replace `electron` | A Node resolve hook registered with `--import`, mapping `electron` to a stub module             | Production code is unchanged; one line in the `test` script.                            |
| How to fake the network   | Replace `globalThis.fetch` with a router per test                                               | Every request is visible and can be asserted on.                                        |
| Where runner tests live   | `test/runner/*.test.ts`                                                                         | Already matched by the `test/**/*.test.ts` glob.                                        |

## Target structure

```text
test/
  support/
    register.mjs              registers the resolve hook (passed to node with --import)
    electron-resolve-hook.mjs maps 'electron' to the stub
    electron-stub.mjs         app, safeStorage, shell, ipcMain, BrowserWindow, dialog
    fake-network.ts           fetch router: scripted LLM, Pexels fixtures, media bodies
    pexels-fixtures.ts        photo() and video() builders shaped like real API responses
    run-job.ts                creates a runner with test settings and runs it to the end
  runner/
    happy-path.test.ts
    token-cap-retry.test.ts
    duplicate-clip.test.ts
    variant-dimensions.test.ts
    compaction-visibility.test.ts
    resume-requeue.test.ts
    approval-mode.test.ts
    pexels-quota.test.ts
    ipc-guards.test.ts
  import-specifiers.test.ts   fails on relative imports without .ts under src/main and src/shared
```

## Phases

### Phase 1: Make the main process loadable by Node (S)

1. Add `"verbatimModuleSyntax": true` to `compilerOptions` in `tsconfig.node.json`.
2. Run `npm run typecheck`. Every type imported as a value now fails with TS1484 ("… is a type and must be imported using a type-only import when 'verbatimModuleSyntax' is enabled"). Fix each one with an inline `type` modifier:

   ```ts
   import {
     LlmProviderFactory,
     type AgentMessage,
     type NormalizedToolCall,
     LLM_AGENT_REASONING
     // …
   } from '../llm/llm-provider.ts'
   import { PexelsDownloader, type DownloadTask } from '../pexels/pexels-downloader.ts'
   import { ManifestWriter, type ManifestData } from '../files/manifest-writer.ts'
   import { ProjectStore, type JobSummary } from '../storage/project-store.ts'
   ```

3. Add `.ts` to every relative import in `src/main/services/**` and `src/main/ipc/**`. electron-vite already resolves `.ts` specifiers (the runner uses them), and `tsconfig.node.json` already has `allowImportingTsExtensions`.
4. Add `test/import-specifiers.test.ts` so the extensions stay. It reads every `.ts` file under `src/main` and `src/shared` and fails on any relative `from '…'` specifier that doesn't end in `.ts`, except `src/main/index.ts`, which uses Vite's `?asset` import.

   ```ts
   const RELATIVE_IMPORT = /from\s+'(\.{1,2}\/[^']+)'/g
   for (const file of sourceFiles) {
     if (file.endsWith(join('src', 'main', 'index.ts'))) continue
     for (const [, specifier] of readFileSync(file, 'utf8').matchAll(RELATIVE_IMPORT)) {
       assert.ok(specifier.endsWith('.ts'), `${file}: import '${specifier}' needs a .ts extension`)
     }
   }
   ```

5. Run `npm run build` and `npm run dev` once to confirm electron-vite is unaffected.

Done when typecheck, lint, test, and build all pass. There's no behavior change, so this can ship on its own.

### Phase 2: The `electron` stub (S)

`test/support/electron-resolve-hook.mjs`:

```js
const stubUrl = new URL('./electron-stub.mjs', import.meta.url).href

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'electron') return { url: stubUrl, shortCircuit: true }
  return nextResolve(specifier, context)
}
```

`test/support/register.mjs`:

```js
import { register } from 'node:module'

register('./electron-resolve-hook.mjs', import.meta.url)
```

`test/support/electron-stub.mjs`:

```js
import { mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// node --test runs each test file in its own process, so each file gets its own userData.
const userData = mkdtempSync(join(tmpdir(), 'stockfinder-test-'))

/** What the code under test asked the OS to do, for assertions. */
export const calls = { trashed: [], opened: [], shownInFolder: [] }

export const app = {
  getPath: (name) => (name === 'userData' ? userData : join(userData, name)),
  getVersion: () => '0.0.0-test',
  isPackaged: false
}

export const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(`test:${value}`, 'utf8'),
  decryptString: (buffer) => buffer.toString('utf8').replace(/^test:/, '')
}

export const shell = {
  async trashItem(path) {
    calls.trashed.push(path)
    await rm(path, { recursive: true, force: true })
  },
  async openPath(path) {
    calls.opened.push(path)
    return ''
  },
  showItemInFolder(path) {
    calls.shownInFolder.push(path)
  },
  async openExternal() {}
}

const handlers = new Map()

export const ipcMain = {
  handle: (channel, handler) => handlers.set(channel, handler),
  removeHandler: (channel) => handlers.delete(channel)
}

/** Calls a registered IPC handler the way the renderer would. */
export function invokeIpc(channel, ...args) {
  const handler = handlers.get(channel)
  if (!handler) throw new Error(`No IPC handler registered for ${channel}`)
  return handler({ sender: null }, ...args)
}

export const BrowserWindow = { getAllWindows: () => [] }
export const dialog = { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) }

export default { app, safeStorage, shell, ipcMain, BrowserWindow, dialog }
```

Change the `test` script in `package.json`:

```json
"test": "node --experimental-strip-types --import ./test/support/register.mjs --test test/**/*.test.ts"
```

Tests that need `invokeIpc` or `calls` import them from `'../support/electron-stub.mjs'`. The hook maps `electron` to the same URL, so the test and the code under test share one module instance.

Done when a smoke test `import { AgentRunner } from '../../src/main/services/agent/agent-runner.ts'` loads and constructs a runner.

### Phase 3: Fake network and fixtures (M)

**`test/support/pexels-fixtures.ts`.** Builders whose output passes the Zod schemas in `pexels-types.ts`, because the client validates every response:

```ts
export function photo(id: number, alt: string, width = 6000, height = 4000): PexelsPhoto {
  const base = `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg`
  return {
    id,
    width,
    height,
    alt,
    url: `https://www.pexels.com/photo/${slugify(alt)}-${id}/`,
    photographer: 'Test Photographer',
    photographer_url: 'https://www.pexels.com/@test',
    avg_color: '#808080',
    src: {
      original: base,
      large2x: `${base}?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940`,
      large: `${base}?auto=compress&cs=tinysrgb&h=650&w=940`,
      medium: `${base}?auto=compress&cs=tinysrgb&h=350`,
      small: `${base}?auto=compress&cs=tinysrgb&h=130`,
      portrait: `${base}?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=800`,
      landscape: `${base}?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200`,
      tiny: `${base}?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=280`
    }
  }
}

export function video(
  id: number,
  slug: string,
  files: Array<[quality: 'uhd' | 'hd' | 'sd', width: number, height: number]> = [
    ['uhd', 3840, 2160],
    ['hd', 1920, 1080],
    ['sd', 960, 540]
  ],
  duration = 12
): PexelsVideo {
  return {
    id,
    width: files[0][1],
    height: files[0][2],
    duration,
    url: `https://www.pexels.com/video/${slug}-${id}/`,
    image: `https://images.pexels.com/videos/${id}/pictures/preview-0.jpeg`,
    user: { name: 'Test Creator', url: 'https://www.pexels.com/@creator' },
    video_files: files.map(([quality, w, h], index) => ({
      id: id * 10 + index,
      quality,
      file_type: 'video/mp4',
      width: w,
      height: h,
      link: `https://videos.pexels.com/video-files/${id}/${id}-${quality}_${w}_${h}_25fps.mp4`
    })),
    video_pictures: []
  }
}
```

Adjust the field lists to whatever `pexels-types.ts` requires, and add one self-test that parses a fixture with the real schema, so drift fails loudly.

**`test/support/fake-network.ts`.** A router installed per test:

```ts
export interface RecordedRequest {
  url: URL
  method: string
  headers: Record<string, string>
  json?: unknown
}

export interface FakeNetwork {
  requests: RecordedRequest[]
  /** Chat completion requests only, in order. */
  llmRequests(): Array<{ messages: unknown[]; tools?: unknown[]; [key: string]: unknown }>
  llm: ScriptedLlm
  pexels: FakePexels
  restore(): void
}

export function installFakeNetwork(): FakeNetwork
```

Routes:

| Request                                                          | Answer                                                                                       |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `POST https://api.openai.com/v1/chat/completions`                | the next scripted LLM reply                                                                  |
| `GET https://api.pexels.com/v1/search`                           | `pexels.photos(query)` fixture, with `X-Ratelimit-Limit`, `-Remaining`, and `-Reset` headers |
| `GET https://api.pexels.com/videos/search`                       | `pexels.videos(query)` fixture, same headers                                                 |
| `GET https://api.pexels.com/v1/photos/:id`, `/videos/videos/:id` | the fixture with that id (used by `refreshDownloadUrl`)                                      |
| `GET https://images.pexels.com/…`, `https://videos.pexels.com/…` | 1 KB body with `content-length`, or a scripted redirect or error                             |
| Anything else                                                    | throws `Unexpected network request: <url>`, so a test can never reach the real internet      |

The scripted LLM returns OpenAI wire-format bodies:

```ts
export interface ScriptedLlm {
  /** The next reply calls these tools. */
  tools(calls: Array<{ name: string; args: unknown }>): ScriptedLlm
  /** The next reply is plain text with no tool calls. */
  text(content: string): ScriptedLlm
  /** The next reply is an HTTP error with an OpenAI-shaped error body. */
  error(status: number, message: string): ScriptedLlm
  /** The next reply is computed from the request, for tests that react to tool results. */
  dynamic(reply: (request: { messages: AgentWireMessage[] }) => LlmReply): ScriptedLlm
}

function chatCompletion(calls: Array<{ name: string; args: unknown }>, content: string | null) {
  return {
    id: 'chatcmpl-test',
    object: 'chat.completion',
    model: 'gpt-4o',
    choices: [
      {
        index: 0,
        finish_reason: calls.length > 0 ? 'tool_calls' : 'stop',
        message: {
          role: 'assistant',
          content,
          tool_calls:
            calls.length > 0
              ? calls.map((call, i) => ({
                  id: `call_${nextId()}_${i}`,
                  type: 'function',
                  function: { name: call.name, arguments: JSON.stringify(call.args) }
                }))
              : undefined
        }
      }
    ],
    usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 }
  }
}
```

If the queue runs out, the router fails the test with the request body, which makes a wrong script easy to debug.

**`test/support/run-job.ts`.** Mirrors `jobs:start` (`jobs.ipc.ts` lines 148 to 164) and waits for the run:

```ts
export async function runJob(
  input: Partial<StartJobInput>,
  settings: Partial<PublicSettings> = {}
): Promise<JobRun> {
  await SecureSecrets.setSecret('openaiKey', 'sk-test')
  await SecureSecrets.setSecret('pexelsKey', 'pexels-test')
  await SettingsStore.updateSettings({
    llmProvider: 'openai',
    modelId: 'gpt-4o',
    downloadFolder: await mkdtemp(join(tmpdir(), 'stockfinder-downloads-')),
    maxConcurrentDownloads: 2,
    requestsPerMinute: 0,
    requireApprovalBeforeDownload: false,
    ...settings
  })
  const jobId = `job_${Date.now()}${String(counter++).padStart(3, '0')}`
  const runner = new AgentRunner(jobId, {
    title: 'Test job',
    script: 'One sentence. Another sentence.',
    platform: 'YouTube',
    style: 'cinematic',
    mix: 'videos + photos',
    maxAssetsPerBeat: 1,
    maxTotalDownloads: 10,
    ...input
  })
  const events: unknown[] = []
  runner.on('event', (event) => events.push(event))
  await runner.ensureRegistered()
  await runner.start()
  const summary = await ProjectStore.get(jobId)
  const manifest = JSON.parse(await readFile(join(summary!.downloadPath, 'manifest.json'), 'utf8'))
  return { jobId, runner, events, summary: summary!, manifest, snapshot: runner.getSnapshot() }
}
```

Job ids must match `/^job_\d+$/`, which is the IPC schema.

The settings and project stores keep module-level caches, and each test file runs in its own process. Give every test its own job id and download folder, and don't depend on resetting the caches within a file. Reset the module-level network state that does exist between tests: `PexelsSearchCache.clear()`, `PexelsClient.resetCircuit()`, `resetLlmCircuit()`, `resetModelRequestQuirks()` (plan 01), and `PexelsRateLimitTracker.clear()` (plan 01). Avoid scripted 5xx or 429 replies in runner tests unless you enable `mock.timers`. The retry backoff in `fetchWithRetry` sleeps for real.

### Phase 4: Regression tests (M)

Write each test against the behavior the fixing plan promises. Mark it `it.todo` until that plan lands, and the fixing plan changes it to `it`. A `todo` test that fails doesn't fail the run.

| Test file                       | Scenario                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Passes after    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| `happy-path.test.ts`            | Two beats; search, select, download, finish. Expect status `completed`, two files on disk, every beat `completed` in the manifest, attribution present.                                                                                                                                                                                                                                                                                                                  | now             |
| `token-cap-retry.test.ts`       | The first LLM call returns 400 "max_tokens is too large: 32768. This model supports at most 16384 completion tokens…". Expect exactly one retry, with `max_completion_tokens: 16384`, and a completed job.                                                                                                                                                                                                                                                               | plan 01 phase 1 |
| `pexels-quota.test.ts`          | The first search returns 429 with `X-Ratelimit-Remaining: 0` and a reset five days out. Expect status `paused`, a log entry with the reset time, and no further Pexels requests.                                                                                                                                                                                                                                                                                         | plan 01 phase 2 |
| `ipc-guards.test.ts`            | `invokeIpc('jobs:approveAndResume', id, {})` on a completed job creates no runner and leaves the status alone. Cancelling a paused runner removes it from the active map.                                                                                                                                                                                                                                                                                                | plan 01 phase 3 |
| `duplicate-clip.test.ts`        | The model selects video 101 for `beat_1` and `beat_2`. Expect the second selection to be rejected with a reason naming `beat_1`, and the job not to end `failed`.                                                                                                                                                                                                                                                                                                        | plan 04 phase 1 |
| `variant-dimensions.test.ts`    | The model selects the `sd` 960×540 file of a 3840×2160 video. Expect the record to say 960×540 and the file name to contain `960x540`.                                                                                                                                                                                                                                                                                                                                   | plan 04 phase 2 |
| `resume-requeue.test.ts`        | Write a saved paused job to disk, as a quit after the select turn leaves it: a registry entry with status `paused`, a manifest whose records are `pending`, and an agent-state with `iterationsUsed` equal to `maxAgentIterations`. Call `invokeIpc('jobs:resume', id)`. Expect the downloads to finish, no LLM request, and status `completed`. (A job that runs out of turns while running ends `failed`, not `paused`, so it can't be set up by scripting the model.) | plan 04 phase 3 |
| `approval-mode.test.ts`         | Approval on. One turn selects for three beats in three separate calls. Expect all three processed, then a pause, then `approveAndResume({})` completes the job.                                                                                                                                                                                                                                                                                                          | plan 04 phase 4 |
| `compaction-visibility.test.ts` | Ten beats. Turn 1 makes ten searches. Expect the turn-2 request to contain all ten results in full (no `"omitted":true`).                                                                                                                                                                                                                                                                                                                                                | plan 05 phase 1 |

Assert on requests, not only on outcomes. For example, `network.llmRequests()[1].messages` shows exactly what the model was given, which is how the compaction bug shows up.

### Phase 5: A live evaluation set (M)

Unit tests can't tell whether the footage fits the script. Prompt and pipeline changes (plans 07 and 08) need a fixed set of scripts run against the real APIs, with results that are cheap to compare.

**Scripts:** ten files in `eval/scripts/`, chosen to stress different things:

1. A 30-second YouTube Short hook (vertical).
2. A 60-second explainer with abstract ideas ("compound interest", "focus").
3. A "5 facts" list script.
4. A narrative with one recurring subject (likely to tempt duplicate picks).
5. A nature documentary passage.
6. A tech product explainer that mentions brand names.
7. A people-heavy lifestyle script, run once with "avoid people" on.
8. A 3-minute deep dive (30+ beats; exercises the download cap).
9. A Spanish or German script (translation into English queries).
10. An idea-mode input (exercises idea expansion).

**Runner:** `scripts/eval-agent.mts`, run with the same `--import ./test/support/register.mjs` flag so the `electron` stub applies, but with the real `fetch`.

- Keys come from environment variables (`EVAL_OPENAI_KEY`, `EVAL_PEXELS_KEY`, and so on), never from the app's secret store.
- Pexels responses are recorded to `eval-cache/` keyed by query and parameters, and replayed on later runs. Re-runs then spend no Pexels quota, and two prompt versions are compared on identical search results. Pexels documents a default limit of 200 requests per hour and 20,000 per month (verify against the current API docs), and one full run can approach the hourly figure.
- Flags: `--provider`, `--model`, `--pipeline loop|pipeline` (for plan 08), `--only <script>`.

**Output:** `eval-results/<timestamp>/` (gitignored), containing one `report.json` per script and a `summary.md` table with:

| Metric            | How it's computed                                         |
| ----------------- | --------------------------------------------------------- |
| Script fidelity   | joined beat text equals the script, ignoring whitespace   |
| Coverage          | beats with at least one completed asset, divided by beats |
| Duplicates        | assets used by more than one beat                         |
| Orientation match | assets whose shape matches the platform                   |
| Resolution        | assets with a long edge of at least 1,920 pixels          |
| Clip length       | videos between 3 and 30 seconds                           |
| Cost              | LLM calls, input, cached, and output tokens               |
| Time              | wall-clock seconds                                        |

Relevance needs a human. The runner also writes `contact-sheet.html`: for each beat, its text and the chosen thumbnails, with good / ok / bad buttons and a "copy scores" button that produces JSON for `scores.json`. Scoring 10 scripts this way takes about 15 minutes, which is cheap enough to do for every prompt change that matters.

Add `eval-results/` and `eval-cache/` to `.gitignore`, and `eval` and `scripts` to the installer exclusions (plan 09).

## Risks and mitigations

| Risk                                                        | Mitigation                                                                                                                                |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `verbatimModuleSyntax` produces many errors at once         | They're mechanical (`type` modifiers). Fix them in phase 1 before anything else changes.                                                  |
| Fixtures drift from the real Pexels response shape          | A self-test parses the fixtures with the production Zod schemas. The live evaluation catches the rest.                                    |
| Runner tests become slow or flaky                           | No real network, no real backoff, 1 KB media bodies, and one scenario per test. If a test needs time, use `mock.timers` from `node:test`. |
| Tests pass on fakes that don't match real provider behavior | Fakes come from documented wire formats. The live evaluation and the release checklist (one real job per provider) cover the gap.         |

## Open questions

- Should the evaluation's human scores be stored in the repo, so prompt changes have a history? A small `eval/history.md` with one line per run would be enough.
