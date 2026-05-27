# Technical Architecture Plan

Research date: 2026-05-27

## Stack

Use this stack unless a later implementation constraint makes it impossible:

- Electron
- TypeScript
- React
- Vite
- shadcn/ui
- Tailwind CSS
- Zustand or TanStack Store for renderer state
- Zod for runtime validation
- SQLite or JSON files for v1 persistence
- Native `fetch` for provider HTTP calls

Do not put API keys, filesystem writes, or direct network tool execution in the renderer.

## Process Boundaries

### Electron Main Process

Owns:

- app lifecycle
- secure storage access
- filesystem reads/writes
- Pexels API calls
- LLM API calls
- agent loop execution
- download queue
- project folder creation
- manifest and log writing

### Preload Script

Owns:

- a narrow `contextBridge` API
- input validation before IPC
- no business logic
- no direct API keys returned to renderer

Expose only this shape:

```ts
type AppApi = {
  settings: {
    getPublicSettings(): Promise<PublicSettings>;
    updateSettings(input: SettingsUpdate): Promise<void>;
    testProvider(input: ProviderTestRequest): Promise<ProviderTestResult>;
    chooseDownloadFolder(): Promise<string | null>;
  };
  jobs: {
    start(input: StartJobInput): Promise<JobId>;
    pause(jobId: JobId): Promise<void>;
    resume(jobId: JobId): Promise<void>;
    cancel(jobId: JobId): Promise<void>;
    rerun(jobId: JobId): Promise<JobId>;
    get(jobId: JobId): Promise<JobSnapshot>;
    list(): Promise<JobSummary[]>;
    onEvent(callback: (event: JobEvent) => void): Unsubscribe;
  };
  assets: {
    list(projectId: string): Promise<AssetRecord[]>;
    openInFolder(assetId: string): Promise<void>;
    deleteLocal(assetId: string): Promise<void>;
    exportManifest(projectId: string): Promise<string>;
  };
};
```

### Renderer

Owns:

- UI
- form state
- validation messages
- progress display
- asset grid
- settings panels

Renderer must never:

- call Pexels directly
- call LLM providers directly
- read secret keys
- write arbitrary filesystem paths
- execute shell commands

## Security Rules

Follow Electron security guidance:

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true` where compatible
- no remote module
- no arbitrary `ipcRenderer` exposure
- validate every IPC payload with Zod
- never interpolate user input into shell commands
- never execute downloaded files

All downloaded files must be treated as untrusted data.

## Suggested Folder Structure

```text
src/
  main/
    app.ts
    ipc/
      settings.ipc.ts
      jobs.ipc.ts
      assets.ipc.ts
    services/
      agent/
        agent-runner.ts
        agent-state.ts
        prompts.ts
        tool-registry.ts
      llm/
        llm-provider.ts
        openai-provider.ts
        openrouter-provider.ts
        gemini-provider.ts
        tool-normalizer.ts
      pexels/
        pexels-client.ts
        pexels-types.ts
        pexels-downloader.ts
      storage/
        settings-store.ts
        project-store.ts
        secure-secrets.ts
      files/
        safe-path.ts
        manifest-writer.ts
        asset-namer.ts
  preload/
    index.ts
  renderer/
    app.tsx
    routes/
      script-input.tsx
      agent-run.tsx
      downloaded-stuff.tsx
      settings.tsx
    components/
      layout/
      job/
      assets/
      settings/
    lib/
      api-client.ts
      schemas.ts
      format.ts
```

## Provider Adapter Interface

All LLM providers must implement the same internal interface:

```ts
export interface LlmProvider {
  id: "openai" | "openrouter" | "gemini";
  createToolTurn(input: LlmToolTurnInput): Promise<LlmToolTurnResult>;
  testConnection(input: ProviderCredentials): Promise<ProviderTestResult>;
}
```

Internal normalized request:

```ts
type LlmToolTurnInput = {
  model: string;
  systemPrompt: string;
  messages: AgentMessage[];
  tools: NormalizedToolDefinition[];
  toolChoice: "auto" | "none" | { name: string };
  temperature: number;
  maxOutputTokens: number;
  abortSignal?: AbortSignal;
};
```

Internal normalized result:

```ts
type LlmToolTurnResult = {
  assistantMessage: AgentMessage;
  toolCalls: NormalizedToolCall[];
  stopReason: "tool_calls" | "final" | "length" | "error";
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  raw: unknown;
};
```

## Provider-Specific Notes

### OpenAI

Use OpenAI's current tool/function calling API at implementation time. Prefer the current official API surface and do not hard-code old request shapes without checking docs.

Adapter responsibilities:

- Convert normalized tools to OpenAI tool definitions.
- Convert OpenAI tool calls to `NormalizedToolCall`.
- Support model ids as free text.
- Surface provider error messages in a safe, user-readable form.

### OpenRouter

OpenRouter is OpenAI-compatible for many chat/tool workflows, but model-level support varies.

Adapter responsibilities:

- Use the OpenRouter base URL and `Authorization: Bearer <key>`.
- Accept user-entered model ids like `qwen/qwen3.7-max`.
- Check and surface when a selected model does not support tools.
- Preserve OpenRouter-specific metadata in `raw`.

### Gemini

Gemini uses function declarations and its own response shape.

Adapter responsibilities:

- Convert normalized tools to Gemini `functionDeclarations`.
- Convert Gemini function calls to `NormalizedToolCall`.
- Convert tool results back into Gemini-compatible function response parts.
- Accept free-text Gemini model ids.

## Pexels Client

Create one `PexelsClient` in main process.

Required methods:

```ts
class PexelsClient {
  searchPhotos(input: PexelsPhotoSearchInput): Promise<PexelsPhotoSearchResult>;
  searchVideos(input: PexelsVideoSearchInput): Promise<PexelsVideoSearchResult>;
  getPhoto(id: number): Promise<PexelsPhoto>;
  getVideo(id: number): Promise<PexelsVideo>;
}
```

Use official Pexels API docs during implementation. Pexels uses an API key in the `Authorization` header.

Known endpoint families from docs:

- photo search
- video search
- curated/popular resources
- photo/video detail resources

Do not assume every response field is present. Validate with Zod and keep unknown fields in `raw`.

## Download Queue

Create a queue with bounded concurrency.

Rules:

- Default max concurrent downloads: `3`.
- Retry failed network downloads up to `2` times with exponential backoff.
- Verify HTTP status before writing a file.
- Stream downloads to disk when practical.
- Write to a temporary file first, then rename after success.
- Never overwrite existing files unless content hash or asset id matches.
- Store failed downloads in manifest with reason.

File naming:

```text
<assetType>_<pexelsId>_<width>x<height>_<slugifiedQuery>.<ext>
```

Examples:

```text
video_123456_1920x1080_ai-office-b-roll.mp4
photo_987654_3000x2000_keyboard-closeup.jpeg
```

## Persistence

V1 can use JSON files instead of a database.

Use:

- secure OS keychain or Electron-safe secret storage for API keys
- JSON settings file for non-secret settings
- project `manifest.json` for run history
- project `agent-log.jsonl` for event stream

Never write API keys to logs.

## Error Handling

Classify errors:

- `missing_api_key`
- `invalid_api_key`
- `provider_rate_limited`
- `model_does_not_support_tools`
- `pexels_rate_limited`
- `download_failed`
- `disk_write_failed`
- `invalid_agent_tool_args`
- `agent_max_iterations_reached`
- `user_cancelled`

Every error should include:

- stable code
- user-safe message
- technical details for logs
- retryable boolean

## Testing Plan

Unit tests:

- safe path creation
- file naming
- Zod schemas
- provider normalization
- Pexels response parsing
- agent loop state transitions

Integration tests:

- fake LLM provider that emits tool calls
- fake Pexels client with fixtures
- one full job run writes manifest and assets

Manual tests:

- missing keys
- invalid Pexels key
- model without tool support
- cancel job mid-download
- re-run same project title
- very long script
- no results from Pexels
