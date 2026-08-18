# StockFinder AI — Technical Project Reference (v1.2.9)

- **Official Product Portal**: [https://stockfinderai.birol.tech](https://stockfinderai.birol.tech)
- **Developer Website**: [https://birol.tech](https://birol.tech)
- **Source Code Repository**: [https://github.com/birol-dev/Pexels](https://github.com/birol-dev/Pexels)

StockFinder AI (registered in `package.json` as `stockfinder-ai`) is an Electron-based desktop application designed for video producers, YouTube creators, documentary editors, and short-form creators. It uses an AI-driven agent to parse narrational video scripts into structured visual scenes ("beats"), generate highly contextual stock media queries, search the Pexels API for relevant stock photos and videos, and automatically download and organize them into structured local project workspaces.

---

## 1. Architectural Overview

StockFinder AI follows Electron’s secure multi-process architecture with strict context isolation.

```mermaid
graph TD
    %% Main Architecture Elements
    subgraph Renderer [Renderer Process (React + Vite + Tailwind v4 + Radix UI)]
        App[App.tsx]
        Store[Zustand Store: store.ts]
        View1[ScriptInput / IdeaExpander View]
        View2[AgentRun View]
        View3[DownloadedStuff View]
        View4[Settings View]
    end

    subgraph Preload [Preload Bridge Layer]
        API[contextBridge API (window.api)]
    end

    subgraph Main [Main Process (Node.js Environment)]
        Index[index.ts Electron Entry]

        subgraph IPCHandlers [IPC Gateways]
            JobsIPC[jobs.ipc.ts]
            AssetsIPC[assets.ipc.ts]
            SettingsIPC[settings.ipc.ts]
        end

        subgraph BackendServices [Backend Services]
            Runner[AgentRunner: AI Loop]
            IdeaExp[IdeaExpander]
            LLM[LlmProviderFactory]
            RateLimiter[LlmRateLimiter]
            Pexels[PexelsClient]
            Quota[PexelsRateLimitTracker]
            Cache[PexelsSearchCache]
            Downloader[PexelsDownloader]
            StoreProj[ProjectStore]
            StoreSet[SettingsStore]
            Secure[SecureSecrets]
            Manifest[ManifestWriter]
        end
    end

    %% External APIs
    subgraph External [External Interfaces]
        PexelsAPI[Pexels REST API]
        LLM_API[OpenAI / Gemini / OpenRouter]
        LocalFS[Local Disk Project Workspace]
    end

    %% Wiring Connections
    App --> Store
    Store --> View1 & View2 & View3 & View4
    Store <==>|"window.api"| API
    API <==>|"IPC (Invoke / Send / on)"| IPCHandlers
    Index --> IPCHandlers

    %% IPC to Services Connections
    JobsIPC --> Runner & StoreProj & IdeaExp
    AssetsIPC --> StoreProj & Manifest
    SettingsIPC --> StoreSet & Secure & LLM & RateLimiter

    %% Runner internals connections
    Runner --> LLM & RateLimiter & Pexels & Downloader & Manifest & StoreProj
    Pexels --> Secure & StoreSet & Quota & Cache & PexelsAPI
    Downloader --> LocalFS
    Manifest --> LocalFS
    StoreProj --> LocalFS
    StoreSet --> LocalFS
    Secure --> LocalFS
    LLM --> RateLimiter & LLM_API
```

### Core Architecture Layers:

1. **Main Process (`src/main`)**: The Node.js backend. Manages the Electron lifecycle, secure local storage, network requests, custom stream protocols (`media://`), file system operations, rate limiters, and the AI agent loop.
2. **Preload Script (`src/preload`)**: The secure gateway exposing a minimal, typed IPC bridge (`window.api`) to the renderer via `contextBridge` and `ipcRenderer`.
3. **Renderer Process (`src/renderer`)**: The React frontend built with Vite, Tailwind CSS (v4), Zustand state management, and Radix UI primitives.

---

## 2. Directory Layout & Key Modules

```
Pexels/
├── .github/                    # GitHub actions / CI workflows
├── docs/                       # Architectural specs and research docs
│   ├── 00-product-brief.md
│   ├── 01-technical-architecture.md
│   ├── 02-agent-loop-prompts-tools.md
│   ├── 03-implementation-backlog.md
│   └── 04-api-contracts-and-research.md
├── electron-builder.yml        # Multi-platform distribution packager
├── electron.vite.config.ts     # Bundling configs for main, preload, renderer
├── package.json                # Project dependencies, build scripts, metadata
├── postcss.config.js           # PostCSS Tailwind setup
├── project-reference.md        # Comprehensive technical manual (this document)
├── README.md                   # Repository overview
├── test/                       # Node test runner suite
│   ├── abort-signal.test.ts
│   ├── agent-tools-contract.test.ts
│   ├── api-errors.test.ts
│   ├── beat-parse-tool.test.ts
│   ├── download-retry.test.ts
│   ├── idea-expander.test.ts
│   ├── llm-provider.test.ts
│   ├── manifest-writer.test.ts
│   ├── path-safety.test.ts
│   ├── pexels-client.test.ts
│   └── rate-limiter.test.ts
├── src/
│   ├── main/                   # ELECTRON MAIN PROCESS (Node.js)
│   │   ├── index.ts            # App entry, custom media:// protocol, window management
│   │   ├── ipc/                # Inter-Process Communication (IPC)
│   │   │   ├── assets.ipc.ts   # Asset management, manifest export, file explorer
│   │   │   ├── jobs.ipc.ts     # Job orchestration, pause/resume, rerun, idea expander
│   │   │   └── settings.ipc.ts # Preferences, API validation, directory chooser
│   │   └── services/           # Backend Logic Services
│   │       ├── agent/          # Agent loop orchestrator and StockScout prompts
│   │       │   ├── agent-runner.ts
│   │       │   └── prompts.ts
│   │       ├── files/          # Manifest writer, atomic saves, path safety
│   │       │   ├── manifest-writer.ts
│   │       │   └── path-safety.ts
│   │       ├── http/           # HTTP helpers, abort signals, error mappers
│   │       │   ├── abort-signal.ts
│   │       │   └── api-errors.ts
│   │       ├── llm/            # Unified LLM provider adapters & rate limiting
│   │       │   ├── beat-parse-tool.ts
│   │       │   ├── idea-expander.ts
│   │       │   ├── llm-fetch.ts
│   │       │   ├── llm-provider.ts
│   │       │   └── llm-rate-limiter.ts
│   │       ├── pexels/         # Pexels API client, quota tracker, cache, downloader
│   │       │   ├── download-task-utils.ts
│   │       │   ├── download-url-validation.ts
│   │       │   ├── pexels-attribution.ts
│   │       │   ├── pexels-client.ts
│   │       │   ├── pexels-downloader.ts
│   │       │   ├── pexels-rate-limit.ts
│   │       │   ├── pexels-search-cache.ts
│   │       │   └── pexels-types.ts
│   │       └── storage/        # File-based persistent databases
│   │           ├── project-store.ts
│   │           ├── secure-secrets.ts
│   │           └── settings-store.ts
│   ├── preload/                # IPC BRIDGE LAYER
│   │   ├── index.d.ts          # Type declarations for window.api
│   │   └── index.ts            # Preload script exposing window.api
│   └── renderer/               # REACT CLIENT (Web Environment)
│       ├── index.html          # HTML entry point
│       └── src/
│           ├── App.tsx         # Main layout & view routing
│           ├── assets/main.css # CSS variables, dark theme, glassmorphism
│           ├── components/     # UI components (BrandLogo, ErrorBoundary, Radix primitives)
│           ├── lib/            # Zustand store, API client, media URL resolver
│           └── routes/         # Application Views
│               ├── agent-run.tsx        # Live execution console, beat progress
│               ├── downloaded-stuff.tsx # Media dashboard, local playback
│               ├── onboarding.tsx      # Welcome & initial key setup
│               ├── script-input.tsx    # Script & Idea setup form
│               └── settings.tsx        # Provider keys, rate limits, performance tuning
└── website/                    # Static Product Portal and SEO Documentation
```

---

## 3. IPC (Inter-Process Communication) Interface

Communication across the Electron security boundary is strictly managed by typed IPC channels.

| Channel                         | Method           | Arguments                        | Returns                                          | Description                                                                    |
| :------------------------------ | :--------------- | :------------------------------- | :----------------------------------------------- | :----------------------------------------------------------------------------- |
| **Settings**                    |                  |                                  |                                                  |                                                                                |
| `settings:getPublicSettings`    | `invoke`         | None                             | `Promise<PublicSettings>`                        | Returns public settings; API keys masked as `••••••••••••••••`.                |
| `settings:updateSettings`       | `invoke`         | `Partial<Settings>`              | `Promise<PublicSettings>`                        | Validates inputs via Zod, persists public settings and updates encrypted keys. |
| `settings:testProvider`         | `invoke`         | `{ provider, apiKey, modelId }`  | `Promise<ProviderTestResult>`                    | Tests connection to OpenAI, Gemini, or OpenRouter.                             |
| `settings:testPexelsKey`        | `invoke`         | `apiKey: string`                 | `Promise<{ success: boolean, message: string }>` | Verifies Pexels API key by issuing a lightweight search query.                 |
| `settings:chooseDownloadFolder` | `invoke`         | None                             | `Promise<string \| null>`                        | Opens native directory picker dialog.                                          |
| `settings:openAppDataFolder`    | `invoke`         | None                             | `Promise<void>`                                  | Opens local OS file explorer at `app.getPath('userData')`.                     |
| **Jobs**                        |                  |                                  |                                                  |                                                                                |
| `jobs:start`                    | `invoke`         | `StartJobInput`                  | `Promise<string>`                                | Spawns a new background `AgentRunner` job and returns `jobId`.                 |
| `jobs:pause`                    | `invoke`         | `jobId: string`                  | `Promise<void>`                                  | Pauses the agent loop execution.                                               |
| `jobs:resume`                   | `invoke`         | `jobId: string`                  | `Promise<void>`                                  | Resumes a paused agent loop.                                                   |
| `jobs:approveAndResume`         | `invoke`         | `jobId: string`                  | `Promise<void>`                                  | Approves pending asset candidates and initiates the download queue.            |
| `jobs:cancel`                   | `invoke`         | `jobId: string`                  | `Promise<void>`                                  | Halts the job and marks status as `cancelled`.                                 |
| `jobs:rerun`                    | `invoke`         | `jobId: string`                  | `Promise<string>`                                | Creates a fresh job run using previous settings.                               |
| `jobs:get`                      | `invoke`         | `jobId: string`                  | `Promise<JobSnapshot>`                           | Returns combined snapshot of manifest, visual beats, and log records.          |
| `jobs:list`                     | `invoke`         | None                             | `Promise<JobSummary[]>`                          | Lists all recorded projects.                                                   |
| `jobs:expandIdea`               | `invoke`         | `IdeaExpanderInput`              | `Promise<IdeaExpanderResult>`                    | Expands a brief concept into a structured script with visual directions.       |
| `jobs:event`                    | `send` _(Event)_ | `AgentEvent`                     | `void`                                           | Emits live logs, progress updates, tool events, and download metrics.          |
| **Assets**                      |                  |                                  |                                                  |                                                                                |
| `assets:list`                   | `invoke`         | `jobId: string`                  | `Promise<AssetRecord[]>`                         | Returns flat array of assets from local `manifest.json`.                       |
| `assets:openInFolder`           | `invoke`         | `jobId: string, assetId: string` | `Promise<void>`                                  | Reveals downloaded asset in the native OS file explorer.                       |
| `assets:deleteLocal`            | `invoke`         | `jobId: string, assetId: string` | `Promise<void>`                                  | Safely deletes local asset file and updates manifest record.                   |
| `assets:exportManifest`         | `invoke`         | `jobId: string`                  | `Promise<string>`                                | Returns project's `manifest.json` as a formatted string.                       |

---

## 4. Backend Services & Core Logic

### A. The Agent Loop (`AgentRunner` - `src/main/services/agent/agent-runner.ts`)

The `AgentRunner` executes a deterministic 10-step AI search and download loop:

```
[Start Job]
    │
    ▼
[Step 1: Parse Script into Visual Beats (structured output / tool call)]
    │
    ▼
[Step 2-8: Iterative Agent Loop (up to maxAgentIterations)]
    │
    ├── 1. Formulate Pexels queries for next pending beat
    ├── 2. Execute `search_pexels_photos` / `search_pexels_videos`
    ├── 3. Register trusted candidate media in `pexelsCandidates`
    ├── 4. Model calls `select_assets_for_download`
    ├── 5. Safety check: verify URLs match candidate pool (anti-hallucination)
    ├── 6. User Approval check (if `requireApprovalBeforeDownload` enabled)
    └── 7. Trigger `PexelsDownloader` to fetch media into local workspace
    │
    ▼
[Step 9: Build Manifest & Attribution Document (`pexels-attribution.ts`)]
    │
    ▼
[Step 10: Finalize Workspace (`manifest.json`, `agent-log.jsonl`) -> Status: Done]
```

#### Visual Beat Schema:

```typescript
interface VisualBeat {
  id: string // e.g. "beat_1", "beat_2"
  order: number
  scriptExcerpt: string // Script section text
  visualIntent: string // Scene direction
  mood: string // Emotional / cinematic tone
  subjects: string[] // Key visual elements
  searchQueries: string[] // Queries performed
  desiredAssetTypes: ('photo' | 'video')[]
  minNeeded: number
  status: 'pending' | 'searching' | 'selecting' | 'downloading' | 'completed' | 'failed'
  assets: AssetRecord[]
}
```

#### Termination Conditions:

The agent stops when any of the following occur:

1. All visual beats are satisfied (`completed` or `skipped`).
2. Total downloaded assets reach `maxTotalDownloads`.
3. Agent loop iterations reach `maxAgentIterations` (default `20`).
4. User cancels or pauses the job.
5. Repeated unparseable tool errors (3 strikes).

---

### B. LLM Providers & Normalization (`src/main/services/llm/`)

The application provides a unified interface across 3 major LLM providers:

```typescript
interface LlmProvider {
  id: 'openai' | 'openrouter' | 'gemini'
  name: string
  testConnection(credentials: ProviderCredentials, modelId: string): Promise<ProviderTestResult>
  createToolTurn(
    request: ToolTurnRequest,
    credentials: ProviderCredentials
  ): Promise<ToolTurnResponse>
}
```

#### Provider Formatting Rules:

1. **OpenAI (`OpenAiProvider`)**:
   - Base URL: `https://api.openai.com/v1/chat/completions`.
   - Tool calling: standard OpenAI `tools: [{ type: 'function', function: { name, description, parameters } }]`.
   - Auth: `Authorization: Bearer <API_KEY>`.
2. **OpenRouter (`OpenRouterProvider`)**:
   - Base URL: `https://openrouter.ai/api/v1/chat/completions`.
   - Headers: passes `HTTP-Referer: https://github.com/birol-dev/Pexels` and `X-Title: AI Stock Asset Finder`.
   - Error detection: detects unsupported models with custom guidance: `"The selected OpenRouter model does not appear to support tool calling."`
3. **Google Gemini (`GeminiProvider`)**:
   - Base URL: `https://generativelanguage.googleapis.com/v1beta/models/{modelId}:generateContent?key={apiKey}`.
   - Converts schema types to **UPPERCASE** (e.g. `type: 'STRING'`, `type: 'OBJECT'`, `type: 'ARRAY'`).
   - Strips unsupported JSON Schema keys such as `additionalProperties`.
   - Formats `systemInstruction`, `functionDeclarations`, and `functionResponse` parts.
   - Detects `SAFETY` finish reasons and returns clear error messaging.

---

### C. Rate Limiting Architecture

StockFinder AI implements two distinct rate limiting layers to prevent 429 throttling:

1. **LLM Sliding-Window Rate Limiter (`LlmRateLimiter` - `llm-rate-limiter.ts`)**:
   - Enforces a configurable Requests-Per-Minute (`requestsPerMinute`) cap.
   - Uses a sliding time window (60s) with mutex concurrency locking.
   - Rejects cleanly upon `AbortSignal` without leaking pending timers.
   - Set `requestsPerMinute: 0` for unlimited throughput.

2. **Pexels Quota Tracker (`PexelsRateLimitTracker` - `pexels-rate-limit.ts`)**:
   - Inspects Pexels response headers: `X-Ratelimit-Limit`, `X-Ratelimit-Remaining`, `X-Ratelimit-Reset`.
   - When remaining quota falls $\le 10$, automatically applies backoff delays.
   - When quota is exhausted, pauses requests until `X-Ratelimit-Reset`.

---

### D. Pexels API & Resilient Video Schemas (`src/main/services/pexels/`)

#### Pexels Response Resilience:

Pexels API responses can include `null` or omitted values for `quality`, `file_type`, `fps`, `width`, `height`, and `user.url` (e.g., on HLS streams or preview transcode variants).

`PexelsVideoFileSchema` and `PexelsPhotoSchema` in [pexels-types.ts](file:///c:/Users/omerb/Desktop/antigravity/Pexels/src/main/services/pexels/pexels-types.ts) are strictly configured to accept nullable/optional fields:

```typescript
export const PexelsVideoFileSchema = z
  .object({
    id: z.number().optional(),
    quality: z.string().nullable().optional(),
    file_type: z.string().nullable().optional(),
    width: z.number().nullable().optional(),
    height: z.number().nullable().optional(),
    fps: z.number().nullable().optional(),
    link: z.string()
  })
  .passthrough()
```

#### Safe Asset Downloader (`PexelsDownloader`):

- **Concurrency Control**: 1–5 parallel workers.
- **Retry Mechanism**: Exponential backoff with jitter on transient network/server failures (5xx, 429, 401/403 expired CDN tokens). Non-retryable on 404/400.
- **Atomic Writing**: Streams chunks to `.tmp` files and renames only after successful completion and hash/size verification.
- **Domain Verification**: Enforces strict URL validation to prevent SSRF (`download-url-validation.ts`).

---

### E. File System & Manifest Structure (`ManifestWriter`)

Each project workspace is created inside the user's selected download folder:

```
[Download Directory]/[slugified-project-title]-[unique-suffix]/
├── manifest.json         # Complete snapshot of project settings, beats, assets, attribution
├── agent-log.jsonl       # Real-time JSON Lines audit log with timestamps
├── photos/               # Downloaded photo assets (e.g. photo-12345-large.jpg)
├── videos/               # Downloaded video assets (e.g. video-67890-hd.mp4)
└── thumbnails/           # Downloaded preview thumbnails
```

#### Attribution Compliance (`pexels-attribution.ts`):

Builds canonical attribution records in `manifest.json` conforming to Pexels API Guidelines:

- Official Pexels credit text & logo URLs.
- Per-asset photographer credits: `"Photo by [Photographer] on Pexels (ID [ID])"`.
- Direct links to original Pexels asset pages.

---

## 5. Security & Isolation Controls

1. **Custom `media://` Protocol**:
   - Replaces insecure `file://` protocols in the renderer.
   - Streamlines local video/image playback with full HTTP range seeking support.
2. **Encrypted Secret Storage (`SecureSecrets`)**:
   - Uses Electron `safeStorage` (Windows DPAPI, macOS Keychain).
   - Encrypted keys stored as hex strings prefixed with `encrypted:`.
   - Never logs unmasked keys (`sk-abc...xyz`).
3. **Anti-Hallucination & Anti-SSRF URL Validation**:
   - Candidates returned by Pexels are indexed in `pexelsCandidates`.
   - When the agent selects an asset, the URL is verified against the candidates map before downloading.
   - Blocks private IP ranges (`127.0.0.1`, `10.0.0.0/8`, `192.168.0.0/16`, `localhost`).
4. **Path Traversal Protection (`path-safety.ts`)**:
   - Checks `isPathInside` before any file deletion or local file open operations.

---

## 6. Testing Guide & Test Architecture

StockFinder AI includes an automated unit test suite executed using Node's native test runner (`node --test` with `--experimental-strip-types`):

```bash
# Run all unit test suites
$ npm test

# Run TypeScript type check
$ npm run typecheck

# Run code formatter
$ npm run format
```

### Complete Test Catalog:

| Test File                           | Covered Modules                                                                | Primary Assertions                                                                                              |
| :---------------------------------- | :----------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------- |
| `test/rate-limiter.test.ts`         | `LlmRateLimiter`                                                               | Sliding window enforcement, capacity checks, abort signal handling, timer cleanup.                              |
| `test/pexels-client.test.ts`        | `PexelsClient`, `pexels-types.ts`, `pexels-rate-limit.ts`                      | Zod schema validation, nullable `quality: null` handling, quota tracking, search cache keys.                    |
| `test/agent-tools-contract.test.ts` | `AgentRunner`, Tool schemas                                                    | Argument validation bounds (2-100 chars, page 1-10, perPage 80), anti-hallucination candidate safety.           |
| `test/manifest-writer.test.ts`      | `ManifestWriter`                                                               | Title slugification, atomic `.tmp` writes, directory structure, JSONL log appending.                            |
| `test/llm-provider.test.ts`         | `LlmProviderFactory`, `GeminiProvider`, `OpenAiProvider`, `OpenRouterProvider` | Gemini uppercase parameter formatting, additionalProperties stripping, OpenRouter headers, safety finishReason. |
| `test/idea-expander.test.ts`        | `IdeaExpander`                                                                 | Concept expansion, prompt generation, duration and tone parameters.                                             |
| `test/beat-parse-tool.test.ts`      | `beat-parse-tool.ts`                                                           | Script segmentation into beats, structured schema fallback.                                                     |
| `test/download-retry.test.ts`       | `download-task-utils.ts`                                                       | Retryable status codes (401/403/429/500 vs 404), in-flight queue deduplication.                                 |
| `test/path-safety.test.ts`          | `path-safety.ts`                                                               | Directory containment, path traversal rejection.                                                                |
| `test/abort-signal.test.ts`         | `abort-signal.ts`                                                              | Timeout signal composition, abort propagation.                                                                  |
| `test/api-errors.test.ts`           | `api-errors.ts`                                                                | HTTP status code error mapping, user-friendly messages.                                                         |

---

## 7. Troubleshooting & Error Code Matrix

| Error Code / Message                                                     | Cause                                                             | Resolution                                                                                   |
| :----------------------------------------------------------------------- | :---------------------------------------------------------------- | :------------------------------------------------------------------------------------------- |
| `Invalid input: expected string, received null` (`quality`)              | Pexels API returned `null` for transcode quality on video stream. | Fixed in `pexels-types.ts` by using `z.string().nullable().optional()`.                      |
| `pexels_rate_limited` (429)                                              | Exceeded Pexels hourly request quota (200 req/hr).                | Agent will back off; adjust `maxConcurrentDownloads` or wait for quota reset.                |
| `llm_rate_limited`                                                       | Exceeded RPM limit set in settings or provider tier limit.        | Adjust **Rate Limit (Requests / Min)** slider in Settings -> Performance Tuning.             |
| `SAFETY` (Gemini)                                                        | Prompt or script triggered Gemini safety filters.                 | Enable `skipExplicitQueries` or adjust script wording.                                       |
| `The selected OpenRouter model does not appear to support tool calling.` | Selected model does not implement tool calling.                   | Choose a tool-capable model (e.g. `anthropic/claude-3.5-sonnet`, `google/gemini-2.5-flash`). |
| `Invalid download URL domain`                                            | Asset URL does not belong to authorized Pexels CDN hosts.         | Security check prevented download of unverified host.                                        |
