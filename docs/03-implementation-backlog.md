# Implementation Backlog

Research date: 2026-05-27

## Phase 0 - Project Setup

Acceptance criteria:

- Electron + React + Vite + TypeScript app runs locally.
- Renderer uses shadcn/ui and Tailwind.
- Main/preload/renderer split exists.
- Basic tab navigation exists:
  - Script Input
  - Agent Run
  - Downloaded Stuff
  - Settings

Tasks:

1. Scaffold Electron/Vite/React/TypeScript project.
2. Install and configure Tailwind.
3. Install and configure shadcn/ui.
4. Add base layout with top navigation or side navigation.
5. Add renderer routes/screens with placeholder state.
6. Add preload `contextBridge` skeleton.
7. Add IPC request/response helpers with Zod validation.

## Phase 1 - Settings And Secrets

Acceptance criteria:

- User can save provider type, model id, Pexels key, and default download folder.
- Secrets are not stored in normal JSON logs.
- User can test Pexels and selected LLM provider connection.

Tasks:

1. Create settings schema:
   - provider
   - model id
   - default download folder
   - max downloads
   - max iterations
   - download concurrency
   - safety toggles
2. Add secure secret storage wrapper.
3. Add settings IPC handlers.
4. Build Settings screen.
5. Implement Pexels key test.
6. Implement provider key test stubs.
7. Add user-safe error messages.

## Phase 2 - Pexels Client

Acceptance criteria:

- App can search Pexels photos and videos from main process.
- App can parse and normalize Pexels results.
- App can download selected asset variants to a project folder.

Tasks:

1. Read current Pexels API docs before coding endpoints.
2. Implement `PexelsClient`.
3. Add Zod schemas for photo/video search results.
4. Normalize photo results into internal candidates.
5. Normalize video results into internal candidates.
6. Implement bounded download queue.
7. Implement temp-file then rename behavior.
8. Implement asset file naming.
9. Write tests with Pexels response fixtures.

## Phase 3 - LLM Provider Adapters

Acceptance criteria:

- One internal tool-call format works across OpenAI, OpenRouter, and Gemini.
- User-entered model ids are passed through.
- Provider errors are surfaced clearly.

Tasks:

1. Define `LlmProvider` interface.
2. Define normalized message, tool, and tool-call types.
3. Implement OpenAI adapter.
4. Implement OpenRouter adapter.
5. Implement Gemini adapter.
6. Implement provider capability error:
   - if tool calling fails because model does not support tools, show a specific message
7. Add fake provider for tests.
8. Write adapter unit tests using fixture responses.

## Phase 4 - Agent Runner

Acceptance criteria:

- Given a script and fake providers, the agent can:
  - create beats
  - search fake Pexels
  - select assets
  - download fake assets
  - write manifest and logs

Tasks:

1. Implement `AgentState`.
2. Implement prompts.
3. Implement tool registry.
4. Implement loop with max iterations.
5. Implement cancellation with `AbortController`.
6. Implement pause/resume if feasible; otherwise mark pause as v1.1.
7. Implement event stream from main to renderer.
8. Write `manifest.json`.
9. Write `agent-log.jsonl`.
10. Add integration test for a complete fake job.

## Phase 5 - UI Completion

Acceptance criteria:

- User can run a real job from the Script Input screen.
- User can watch progress in Agent Run.
- User can browse downloaded files in Downloaded Stuff.
- User can open a downloaded file location.

Tasks:

1. Build Script Input form.
2. Add form validation.
3. Build Agent Run screen:
   - beat list
   - current status
   - tool call log
   - errors
4. Build Downloaded Stuff screen:
   - grid
   - filters
   - detail panel
   - open in folder
   - delete local file
5. Add toasts for job start, finish, and failure.
6. Add loading/empty/error states.
7. Test at desktop window sizes:
   - 1280x720
   - 1440x900
   - 1920x1080

## Phase 6 - Hardening

Acceptance criteria:

- App behaves safely with bad keys, bad model ids, empty scripts, long scripts, no Pexels results, and disk errors.

Tasks:

1. Add request timeouts.
2. Add rate-limit handling.
3. Add retry/backoff.
4. Add structured error codes.
5. Add privacy-safe logs.
6. Add manifest schema version.
7. Add migration strategy for future manifest versions.
8. Add manual QA checklist.

## Definition Of Done

The feature is done when:

- A user can paste a script and run the agent.
- The app downloads at least one relevant photo or video from Pexels for a simple test script.
- Downloaded assets appear in the UI with source metadata.
- `manifest.json` and `agent-log.jsonl` are created.
- API keys are not written to logs.
- Cancel works during an active run.
- Invalid API keys produce understandable errors.
- Renderer never directly receives secret values.

## Suggested First Test Script

```text
Most people think productivity means doing more every day. But the highest leverage founders do the opposite: they remove low-value work, protect deep focus, and build systems that make the important tasks easier to repeat.
```

Expected visual beats:

1. person working at laptop
2. busy office or task overload
3. clean focused workspace
4. founder/team planning
5. automation or system workflow

Expected Pexels query examples:

- `person working laptop office`
- `busy office paperwork`
- `minimal desk focus`
- `startup team whiteboard`
- `automation workflow computer`

## Risks

- Some user-selected model ids may not support tool calling.
- Pexels search quality may vary by query.
- Pexels rate limits may block large jobs.
- Video downloads can be large and slow.
- Provider APIs may change; implementation must re-check official docs.
- Gemini tool-calling request/response format differs from OpenAI-compatible providers.

## Future V1.1 Ideas

- storyboard export
- CSV export
- local thumbnail cache
- duplicate detection by perceptual hash
- user approval board before downloads
- more providers such as Pixabay or Unsplash
- direct import into video editor folder structures
- project templates by YouTube niche
