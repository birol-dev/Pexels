# StockFinder AI (v1.2.4)

An Electron-based desktop application that helps YouTube creators, short-form editors, and visual producers turn script narratives into a curated local asset pack of stock b-roll videos and photos.

## Core Features

- **Script Parsing**: Analyzes YouTube video scripts into individual visual beats.
- **AI Stock Media Finding**: Uses Pexels search and detail APIs to discover stock b-roll photos/videos.
- **Secure Download Sandbox**: Enforces strict URL safety guidelines preventing local or unauthorized network lookups.
- **Human Approval Option**: Restricts the agent from downloading assets without explicit approval in the UI.
- **Diagnostics Controls**: Allows connection testing for OpenAI, Gemini, and OpenRouter, as well as testing Pexels API credentials.

## Recommended Setup

- **IDE**: [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)
- **Node**: version 20 or higher.

## Getting Started

### 1. Installation

Install all node dependencies:

```bash
$ npm install
```

### 2. Development Mode

Launch the Electron Vite development server:

```bash
$ npm run dev
```

### 3. Build & Packaging

To package the production desktop application for your system platform:

```bash
# For Windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```

## Changelog

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
