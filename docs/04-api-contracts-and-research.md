# API Contracts And Research Notes

Research date: 2026-05-27

This file exists so the implementation agent does not guess provider-specific details from the product plan. Re-check every linked official doc immediately before implementation.

## Official Docs To Re-Check

- Pexels API: https://www.pexels.com/api/documentation/
- OpenAI function calling: https://platform.openai.com/docs/guides/function-calling
- OpenAI API reference: https://platform.openai.com/docs/api-reference
- OpenRouter tool calling: https://openrouter.ai/docs/features/tool-calling
- OpenRouter API reference: https://openrouter.ai/docs/api-reference/overview
- Gemini function calling: https://ai.google.dev/gemini-api/docs/function-calling
- Electron security: https://www.electronjs.org/docs/latest/tutorial/security
- shadcn/ui Vite setup: https://ui.shadcn.com/docs/installation/vite

## Pexels HTTP Contract

Base URL:

```text
https://api.pexels.com
```

Auth:

```http
Authorization: <PEXELS_API_KEY>
```

Photo search endpoint from Pexels docs:

```http
GET /v1/search?query=<query>&orientation=<orientation>&size=<size>&color=<color>&page=<page>&per_page=<perPage>
```

Video search endpoint from Pexels docs:

```http
GET /videos/search?query=<query>&orientation=<orientation>&size=<size>&page=<page>&per_page=<perPage>
```

Photo detail endpoint:

```http
GET /v1/photos/<id>
```

Video detail endpoint:

```http
GET /videos/videos/<id>
```

Implementation rules:

- Always URL-encode query params.
- Default `per_page` should be conservative:
  - photos: `15`
  - videos: `10`
- Never request more than Pexels allows; validate upper bounds from current docs.
- Capture rate-limit headers when present and write them to debug logs without secrets.
- On `429`, stop new Pexels calls for that job and show `pexels_rate_limited`.
- On `401` or `403`, show `invalid_api_key` or `pexels_auth_failed`.
- On empty results, broaden query before giving up.

## Pexels Result Normalization

Normalize photo response fields into:

```ts
type NormalizedPexelsPhoto = {
  assetType: 'photo'
  pexelsId: number
  sourceUrl: string
  photographer: string
  photographerUrl?: string
  width: number
  height: number
  avgColor?: string
  alt?: string
  previewUrl: string
  variants: Array<{
    label:
      | 'original'
      | 'large2x'
      | 'large'
      | 'medium'
      | 'small'
      | 'portrait'
      | 'landscape'
      | 'tiny'
      | string
    url: string
    width?: number
    height?: number
  }>
  raw: unknown
}
```

Normalize video response fields into:

```ts
type NormalizedPexelsVideo = {
  assetType: 'video'
  pexelsId: number
  sourceUrl: string
  creatorName?: string
  creatorUrl?: string
  width: number
  height: number
  durationSeconds: number
  previewImageUrl: string
  variants: Array<{
    id?: number
    quality?: string
    fileType?: string
    width?: number
    height?: number
    fps?: number
    url: string
  }>
  raw: unknown
}
```

## Provider-Neutral Tool Contract

Internal tools must use JSON Schema-compatible shapes because OpenAI-compatible providers and Gemini can both consume function declarations after adapter conversion.

```ts
type NormalizedToolDefinition = {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
    additionalProperties?: boolean
  }
}
```

```ts
type NormalizedToolCall = {
  id: string
  name: string
  argumentsJson: string
}
```

Tool result messages must be represented internally as:

```ts
type NormalizedToolResult = {
  toolCallId: string
  name: string
  resultJson: string
  isError: boolean
}
```

## OpenAI Adapter Mapping

Implementation must use current OpenAI docs. At a high level:

- Convert `NormalizedToolDefinition` into OpenAI function/tool definitions.
- Send system/developer/user messages plus available tools.
- Receive assistant output.
- Extract tool calls.
- Execute tools in app code.
- Send tool results back to the model.
- Continue until final answer or loop stop condition.

Do not make the renderer responsible for any OpenAI call.

## OpenRouter Adapter Mapping

OpenRouter is intended to be OpenAI-compatible for many workflows, but support is model-dependent.

Implementation rules:

- Base URL and exact endpoint must come from current OpenRouter docs.
- Use `Authorization: Bearer <OPENROUTER_API_KEY>`.
- Pass the user-entered model id exactly.
- If the selected model rejects tools, surface:

```text
The selected OpenRouter model does not appear to support tool calling. Choose another model or disable agent downloads.
```

- Keep provider-specific response metadata in logs, but remove secrets.

## Gemini Adapter Mapping

Gemini has its own function calling format.

Implementation rules:

- Convert each `NormalizedToolDefinition` to a Gemini function declaration.
- Convert Gemini function call parts to `NormalizedToolCall`.
- Convert `NormalizedToolResult` back to Gemini function response parts.
- Verify current model id and endpoint from official Gemini docs.
- Pass user-entered model id exactly.

## Model ID Policy

The app must not maintain a hard-coded allowlist for model ids in v1.

Rules:

- Accept arbitrary non-empty string after trimming.
- Persist model id per provider.
- Show examples in UI, but do not force them.
- Detect unsupported models by provider error response.
- Never silently replace the user's model id.

## Key Storage Policy

API keys are secrets.

Implementation rules:

- Store keys in secure OS storage when possible.
- If using a fallback encrypted file, document the fallback clearly in code.
- Renderer can ask whether a key exists, but cannot read the key.
- Logs must mask keys:

```text
sk-abc...xyz
```

Do not store full keys in:

- `manifest.json`
- `agent-log.jsonl`
- renderer state snapshots
- crash logs

## Download URL Safety

Never let the model introduce arbitrary download URLs.

Required behavior:

1. Pexels search result enters app memory as trusted candidate data.
2. Model can select by `pexelsId` and variant label/url from returned candidates.
3. App verifies selected URL exactly matches one candidate URL from the same job.
4. App downloads only verified Pexels candidate URLs.
5. App writes only inside the selected project folder.

Reject any tool call that attempts to download:

- `file://`
- local paths
- private network addresses
- URLs not returned by Pexels
- URLs from a previous job

## Manifest Schema Draft

```ts
type ProjectManifestV1 = {
  schemaVersion: 1
  projectId: string
  title: string
  createdAt: string
  finishedAt?: string
  script: string
  settingsSnapshot: {
    provider: 'openai' | 'openrouter' | 'gemini'
    modelId: string
    targetPlatform: string
    visualStyle: string
    assetMix: 'videos_only' | 'photos_only' | 'videos_and_photos'
    maxAssetsPerBeat: number
    maxTotalDownloads: number
  }
  beats: VisualBeat[]
  assets: AssetRecord[]
  failures: AssetFailure[]
  sourceDocsCheckedAt?: string
}
```

## Implementation Warning

The planning files intentionally avoid locking exact SDK versions. During implementation:

1. Check current docs.
2. Pin package versions in `package.json`.
3. Write adapter tests around observed response shapes.
4. Keep provider-specific code isolated.
5. Do not spread provider response parsing across UI components.
