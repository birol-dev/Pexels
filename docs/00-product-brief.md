# AI Stock Asset Finder - Product Plan

- **Official Website**: [https://stockfinderai.birol.tech](https://stockfinderai.birol.tech)
- **Developer**: [https://birol.tech](https://birol.tech)

Research date: 2026-05-27

## Goal

Build an Electron desktop app that helps a YouTube creator turn a script into a curated local folder of relevant stock videos and photos.

The user flow is:

1. User pastes a YouTube video script.
2. User chooses LLM provider, model id, output folder, and Pexels options.
3. A looping AI agent analyzes the script into visual beats.
4. The agent proposes concrete stock search ideas for each beat.
5. The agent calls Pexels tools to search and download photos/videos.
6. The app shows downloaded assets, metadata, licensing/source links, and agent logs.

The app is not a video editor in v1. It only discovers, downloads, organizes, and explains stock assets.

## Primary User

Solo YouTube creator, short-form editor, or faceless-video producer who has a script and needs fast stock visuals without manually searching Pexels.

## Core Promise

"Paste a script, pick a style, and the app downloads a useful Pexels asset pack for your video."

## Non-Goals For V1

- No timeline editor.
- No automatic video rendering.
- No voice generation.
- No commercial stock providers other than Pexels.
- No cloud sync.
- No user accounts.
- No multi-user collaboration.

## Main Screens

### Script Input

Purpose: collect the script and run configuration for one asset-finding job.

Required UI:

- Large script text area.
- Title input for the project.
- Target platform select: `YouTube`, `Shorts`, `TikTok`, `Instagram Reels`.
- Visual style select: `cinematic`, `documentary`, `business`, `tech`, `nature`, `lifestyle`, `abstract`.
- Asset mix segmented control:
  - `videos only`
  - `photos only`
  - `videos + photos`
- Max assets per beat number input.
- Max total downloads number input.
- Start / pause / cancel buttons.
- Re-run button after a job finishes.
- Job progress area with current agent step.

### Agent Run

Purpose: show what the looping agent is doing.

Required UI:

- Ordered list of script beats.
- For each beat:
  - beat text
  - generated search queries
  - selected assets
  - skipped/rejected assets and reason
- Live tool-call log:
  - `search_photos`
  - `search_videos`
  - `download_asset`
  - `save_manifest`
- Token/cost estimate if provider returns usage.
- Error panel with retry action.

### Downloaded Stuff

Purpose: inspect and manage local assets.

Required UI:

- Grid view with thumbnails.
- Filter tabs:
  - `All`
  - `Videos`
  - `Photos`
  - `Downloaded`
  - `Failed`
- Asset detail side panel:
  - preview
  - local file path
  - Pexels URL
  - photographer/videographer
  - dimensions
  - duration for videos
  - query that found it
  - related script beat
  - license/source note
- Open file location button.
- Delete local file button.
- Export manifest button.

### Settings

Purpose: configure providers and app behavior.

Required UI:

- LLM provider select:
  - `OpenAI`
  - `OpenRouter`
  - `Gemini`
- API key input for selected provider.
- Model id input, free text.
  - Examples:
    - `gpt-4.1`
    - `qwen/qwen3.7-max`
    - `gemini-2.5-pro`
- Pexels API key input.
- Default download folder picker.
- Concurrency controls:
  - max simultaneous Pexels downloads
  - max agent iterations
  - request timeout seconds
- Safety controls:
  - skip explicit/adult queries toggle
  - require user approval before downloads toggle
  - avoid people/faces toggle
- Diagnostics:
  - test Pexels key
  - test LLM key
  - show app data folder

## Required Data Artifacts

Each project run must create a project folder:

```text
<downloadRoot>/<safeProjectName>/
  manifest.json
  agent-log.jsonl
  photos/
  videos/
  thumbnails/
```

`manifest.json` must be human-readable JSON and include:

- project title
- original script
- selected provider/model
- run start/end time
- visual beats
- search queries
- downloaded asset records
- failed asset records
- Pexels source URLs
- local file paths
- license/source attribution fields

`agent-log.jsonl` must include one JSON object per event:

- agent thought summary
- tool call request
- tool call result
- validation result
- error
- retry
- final summary

Do not store raw API keys in `manifest.json` or `agent-log.jsonl`.

## UX Principles

- First screen must be the actual script workflow, not a marketing landing page.
- The app should feel like a quiet creator tool: dense, fast, and predictable.
- Use `shadcn/ui` components for inputs, tabs, dialogs, toasts, buttons, switches, sliders, and tables.
- Use icons in buttons where possible.
- Avoid decorative cards inside cards.
- Keep logs visible but not dominant.
- Make failed downloads recoverable.

## Technical Research Notes

Use these docs as source references during implementation:

- Pexels API docs: https://www.pexels.com/api/documentation/
- OpenRouter tool calling docs: https://openrouter.ai/docs/features/tool-calling
- Gemini function calling docs: https://ai.google.dev/gemini-api/docs/function-calling
- OpenAI function calling docs: https://platform.openai.com/docs/guides/function-calling
- shadcn/ui Vite installation docs: https://ui.shadcn.com/docs/installation/vite
- Electron security docs: https://www.electronjs.org/docs/latest/tutorial/security
- Electron context isolation docs: https://www.electronjs.org/docs/latest/tutorial/context-isolation

Important implementation assumption: all API details must be re-checked during implementation because provider model names, tool support, rate limits, and SDK APIs can change.
