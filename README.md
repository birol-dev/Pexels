# StockFinder AI

**Website:** [https://stockfinderai.birol.tech](https://stockfinderai.birol.tech)

**Paste your script. Get a curated Pexels b-roll pack on your desktop — organized, downloaded, and ready for your editor.**

StockFinder AI is a free, open-source desktop app for YouTube creators, short-form editors, and video producers who are tired of tab-hopping through stock sites. It reads your video script, splits it into visual beats, searches [Pexels](https://www.pexels.com) with AI-driven keywords, and downloads matching stock photos and videos to a local folder — so you spend less time hunting footage and more time cutting.

[![Website](https://img.shields.io/badge/website-stockfinderai.birol.tech-05df72)](https://stockfinderai.birol.tech)
[![Version](https://img.shields.io/badge/version-1.2.9-cyber)](https://github.com/birol-dev/Pexels/releases)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)](#download)
[![License](https://img.shields.io/badge/license-Open%20Source-blue)](https://github.com/birol-dev/Pexels)

---

## Why creators use StockFinder AI

Most editing time disappears into stock footage searches — not the edit itself. You write the script, then lose an hour opening Pexels, typing slightly wrong keywords, and downloading clips one by one.

StockFinder AI automates that loop:

| Without StockFinder AI | With StockFinder AI |
| --- | --- |
| Manual keyword guessing per scene | AI breaks your script into visual beats |
| Dozens of browser tabs | One agent run, one organized folder |
| Clips scattered across Downloads | Assets named, grouped, and export-ready |
| Easy to miss Pexels attribution | Built-in credits and manifest export |

---

## How it works

1. **Paste your script** — Drop in your YouTube voiceover, narration, or scene list.
2. **Let the agent run** — StockFinder AI parses beats, searches Pexels photos and videos, and queues downloads (with optional approval before each batch).
3. **Open your asset pack** — Clips land in a local project folder with a media library, attribution info, and an exportable manifest for your workflow.

Works with **OpenAI**, **Google Gemini**, or **OpenRouter** for the AI layer, plus a free **Pexels API key** for stock media.

---

## Features

### Script-to-stock automation
Turns long-form scripts into scene-by-scene visual directions and Pexels search queries — no manual beat mapping.

### AI-powered Pexels search
Finds relevant stock b-roll videos and photos per beat, with caching and rate-limit handling so agent runs stay efficient.

### Local asset library
Browse, filter, and inspect everything the agent downloaded. Export a manifest with photographer credits for Pexels compliance.

### Human-in-the-loop controls
Pause before downloads, approve or reject individual assets, and rerun failed jobs without starting from scratch.

### Built for production workflows
- Encrypted API key storage (Electron `safeStorage`)
- Configurable download limits, timeouts, and content filters
- Dark and light themes
- Real-time run progress and agent console logs

### Open source
Inspect the code, report bugs, or contribute on [GitHub](https://github.com/birol-dev/Pexels).

---

## Who it's for

- **YouTube creators** building documentary, explainer, or talking-head videos with heavy b-roll
- **Short-form editors** who need fast stock pulls matched to a script structure
- **Video producers** who want a repeatable, local-first stock workflow — not another SaaS subscription
- **Developers** interested in Electron, AI agents, and media tooling

---

## Download

Product site and installers: **[stockfinderai.birol.tech](https://stockfinderai.birol.tech)**

Pre-built GitHub installers are also on the [Releases page](https://github.com/birol-dev/Pexels/releases).

| Platform | Command (build from source) |
| --- | --- |
| Windows | `npm run build:win` |
| macOS | `npm run build:mac` |
| Linux | `npm run build:linux` |

### What you need before your first run

1. A [Pexels API key](https://www.pexels.com/api/) (free)
2. An API key from **OpenAI**, **Gemini**, or **OpenRouter**
3. A folder on your machine for downloaded assets

The in-app onboarding wizard walks you through setup.

---

## Development

### Requirements

- **Node.js** 20+
- **npm** 11+
- Recommended: [VS Code](https://code.visualstudio.com/) with [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) and [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

### Install

```bash
npm install
```

### Run locally (hot reload)

```bash
npm start
# or
npm run dev
```

Renderer changes hot reload. Main process changes (`src/main/`, `src/preload/`) require a restart.

### Production preview (no hot reload)

```bash
npm run preview
```

### Build

```bash
npm run build        # typecheck + compile
npm run build:win    # Windows installer
npm run build:mac    # macOS app
npm run build:linux  # Linux package
```

---

## Tech stack

- **Desktop**: [Electron](https://www.electronjs.org/) + [electron-vite](https://electron-vite.org/)
- **UI**: React 19, Tailwind CSS 4, Zustand
- **AI**: OpenAI / Gemini / OpenRouter with tool-calling agent loop
- **Stock media**: [Pexels API v1](https://www.pexels.com/api/documentation/)
- **Language**: TypeScript throughout

---

## Keywords

StockFinder AI helps with: AI stock footage search, Pexels video downloader, YouTube b-roll finder, script to stock assets, free stock video for editing, AI video asset pack, desktop stock media tool, automated b-roll workflow, Pexels attribution export, open-source video production tool.

---

## Contributing

Found a bug or want to add a feature?

1. [Open an issue](https://github.com/birol-dev/Pexels/issues) — describe the problem or idea
2. Fork the repo and open a pull request
3. Star the repo if it saves you a run — it helps other creators find the tool

---

## Changelog

### v1.2.9 - Website, Branding & Open Source (2026-06-09)

- **Marketing Website**: Added a static landing page in `website/` with product copy, open-source messaging, and GitHub download links.
- **Brand Identity**: New logo assets and a shared `BrandLogo` component across the app sidebar, onboarding, and website.
- **MIT License**: Added `LICENSE` and declared MIT in `package.json`.
- **Open Source UX**: Settings GitHub card, dismissible Pexels attribution banner, and improved contrast on lime action buttons.
- **Repository Links**: Updated homepage and in-app links to `github.com/birol-dev/Pexels`.

### v1.2.8 - API Hardening & Attribution (2026-06-07)

- **Pexels API v1 Migration**: Video search and detail endpoints now use the current `/v1/videos/` paths instead of deprecated URLs.
- **Rate Limit Awareness**: Tracks `X-Ratelimit-*` headers, warns when quota is low, and waits when monthly quota is exhausted before further searches.
- **Search Result Caching**: Identical Pexels searches are cached for one hour to reduce redundant API calls during agent runs.
- **Shared API Error Handling**: Central retry/backoff with jitter for transient failures (429, 5xx, timeouts) and circuit breakers for Pexels and LLM providers.
- **Structured Beat Parsing**: Script segmentation now uses forced `submit_script_beats` tool calling instead of fragile free-text JSON extraction.
- **Pexels Attribution**: Media Library shows required photographer and Pexels credits; exported manifests include a full attribution block.
- **Download Safety**: URL validation runs at fetch time in the downloader; permanent errors skip wasteful retries.
- **Resume Reliability**: Paused jobs restore state correctly after app restart before resuming the agent loop.

### v1.2.6 - Bug Fixes & Stability (2026-06-07)

- **Phantom Delete Fix**: `assets:list` now verifies every `completed` asset's file path exists on disk before returning it. Missing files are automatically downgraded to `failed` in both the response and the manifest, so the UI no longer shows assets as deleted when files are actually present at the save location.
- **Media Library Flash Fix**: Clicking an asset in the Media Library no longer causes the list to momentarily blank out. Removed `selectedAsset` from `loadAssets`'s `useCallback` dependency array by tracking it via a ref, breaking the circular reload loop.
- **Progress View No-Scroll**: Removed the `useEffect` that auto-scrolled the page to the bottom on every agent log event. The view now stays in place while the job runs.
- **CRLF Line Endings**: Converted `App.tsx`, `script-input.tsx`, and `settings.tsx` from Windows CRLF to LF, clearing all Prettier lint warnings.
- **TypeScript Return Types**: Added explicit `: void` return types to `handleSaveTitle` (App.tsx) and all setter arrow functions in `script-input.tsx`.
- **Tailwind v4 Class Fixes**: Replaced deprecated `flex-shrink-0` → `shrink-0`, `bg-gradient-to-t` → `bg-linear-to-t`, and `translate-x-[-1px]` → `-translate-x-px` throughout the renderer.

### v1.2.4 - Release Hardening & Review Controls (2026-05-30)

- **Secret Storage Fail-Closed**:
  - Removed plaintext API key fallback when Electron `safeStorage` is unavailable or encryption fails.
  - Legacy plaintext secrets are refused until the user re-enters keys for encrypted storage.
- **Per-Asset Approval**:
  - Added approve/reject controls for each pending asset when human approval mode pauses a run.
  - Rejected assets are recorded with a user rejection reason instead of disappearing silently.
- **Resume Continuity**:
  - Preserved saved agent message history across resumed runs instead of restarting every agent loop.
- **Offline Onboarding**:
  - Replaced the remote onboarding background image with a local CSS background.
  - Removed the external onboarding image host from the renderer Content Security Policy.

### v1.1.0 - Hardening & Alignment Release (2026-05-27)

- **Tool-Loop Security Hardening**:
  - Exchanged the basic tool operations for a secure four-tool contract: `search_pexels_photos`, `search_pexels_videos`, `select_assets_for_download`, and `download_selected_assets`.
  - Implemented search candidate results caching (`pexelsCandidates` map) to verify download candidates strictly belong to the active job.
  - Added `validateDownloadUrl` checking download protocols (forcing `http` or `https`) and banning private subnet ranges, `localhost`, or `.local` lookup hosts.
- **Human Approval Flow**:
  - Integrated a review lock when `requireApprovalBeforeDownload` is enabled, pausing the agent runner and rendering an **Approve & Download** action button in the progress view.
- **Timeout Enforcement**:
  - Implemented combined timeout abort controllers (based on the user's `requestTimeoutSeconds` setting) across Pexels API calls, downloader connections, and LLM text generation turns.
- **Real-time Token and Cost Tracking**:
  - Added tracking properties mapping input and output token counts, displaying real-time usage statistics and estimated LLM fees in the progress header.
- **UI Refinements**:
  - Added a dedicated failed-run **Error Alert Card** with a retry runner trigger.
  - Exposed controls for request timeout and human approvals in the settings view.
  - Added a **Show App Data Folder** button for diagnostic navigation.
