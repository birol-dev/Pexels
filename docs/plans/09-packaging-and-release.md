# Plan 09: Packaging and Release

Status: proposed · Size: M (plus certificate lead time) · Depends on: plan 01 phases 4 and 6 (Electron upgrade, builder exclusions, minification)

## Why

Installed copies have no way to receive fixes. There's no auto-update, and builds are unsigned, so Windows SmartScreen and macOS Gatekeeper warn on every install. The release workflows upload installers but not the metadata an updater needs. The default-model failure that plan 01 fixes will stay broken on every existing install until users notice and reinstall by hand. Separately, about 38 MB of renderer libraries are packed into the app a second time, although Vite already bundles them.

## Current state (audited)

### Dependencies

`package.json` lists twelve runtime `dependencies`. Main and preload import only two third-party packages, `zod` and `@electron-toolkit/utils` (checked with a search over `src/main` and `src/preload`). Everything else is renderer code that Vite bundles into `out/renderer`:

| Package                                                                                                                          | Used by  | Bundled by Vite          | Unused |
| -------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------ | ------ |
| `zod`                                                                                                                            | main     | no (external at runtime) |        |
| `@electron-toolkit/utils`                                                                                                        | main     | no (external at runtime) |        |
| `@phosphor-icons/react` (about 31.5 MB installed)                                                                                | renderer | yes                      |        |
| `@paper-design/shaders`, `class-variance-authority`, `clsx`, `radix-ui`, `sonner`, `tailwind-merge`, `tw-animate-css`, `zustand` | renderer | yes                      |        |
| `cmdk`, `cn`, `next-themes`                                                                                                      | nothing  |                          | yes    |

electron-builder copies every `dependencies` package into `app.asar`, so the renderer packages ship twice: once bundled, once as raw `node_modules`. The review measured about 38 MB of them. Re-measure as part of phase 1.

### Release workflows

- `build-win.yml`, `build-mac.yml`, and `build-linux.yml` run `npm run build:<os> -- --publish never`, then upload installers with `softprops/action-gh-release` on tags.
- Windows uploads only `stockfinder-ai-*-setup.exe`. No `latest.yml` and no `.blockmap`, which `electron-updater` needs to find and verify updates.
- `electron-builder.yml` declares `publish: { provider: github, releaseType: draft }`, but `--publish never` means it's never used.
- No workflow has signing secrets. `mac.notarize` is `false`.
- `ci.yml` runs lint, typecheck, and tests, with no build. Plan 01 phase 6 adds the build step.
- `PUBLISHING.md` documents the tag-based release process.

### Docs

The README still describes features that changed:

- "estimated LLM fees in the progress header" (lines 256 and 257). Plan 06 phase 6 fixes the display.
- "32,768 output tokens" (line 186). Plan 01 phase 1 replaces the fixed cap with learned limits.
- No system requirements for the Electron version (plan 01 phase 4).
- Nothing about update checks, which matters for the privacy statement once phase 3 lands.

## Goals

- Only main-process runtime packages are in `dependencies`, and a test keeps it that way.
- Every release publishes the files auto-update needs.
- Installed copies update themselves, without interrupting a running job.
- Windows and macOS builds are signed, and macOS builds are notarized.
- A release checklist covers live provider checks and an update from the previous version.

## Non-goals

- Linux package signing (AppImage and deb). Publish checksums instead.
- A custom update server. GitHub Releases is enough.
- Telemetry. An update check is not telemetry, but the README should say it happens.

## Key decisions

| Decision                  | Choice                                                                                 | Why                                                                                                                                                   |
| ------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Who uploads release files | electron-builder (`--publish always` on tags)                                          | It uploads the installers, `latest*.yml`, and blockmaps together and consistently. The `softprops` step only knew about installers.                   |
| Update UX                 | Download in the background, then show "Restart to update". Never restart during a job. | Downloads can take minutes, and a forced restart would pause a job mid-download.                                                                      |
| Windows signing           | Decide between Azure Trusted Signing and a CA certificate on a hardware token          | Both work with electron-builder 26. Trusted Signing is cheaper and keyless in CI, but has identity-validation requirements. This is the owner's call. |
| macOS auto-update         | Only after signing                                                                     | Squirrel.Mac refuses unsigned updates. Ship Windows and Linux updates first if the Apple account takes time.                                          |

## Phases

### Phase 1: Runtime dependencies (S)

1. Measure first: `npm run build:unpack`, then note the size of `dist/win-unpacked/resources/app.asar` and of the installer from `npm run build:win`.
2. Remove the unused packages:

   ```bash
   npm uninstall cmdk cn next-themes
   ```

3. Move renderer packages to `devDependencies`:

   ```bash
   npm install --save-dev @paper-design/shaders @phosphor-icons/react class-variance-authority clsx radix-ui sonner tailwind-merge tw-animate-css zustand
   ```

   `dependencies` should end up as exactly `zod` and `@electron-toolkit/utils`. electron-vite 5 leaves `dependencies` external for main and preload, which is why those two must stay (check this in the electron-vite docs for the installed version).

4. Verify:
   - `npm run build:unpack`, then `npx @electron/asar list dist/win-unpacked/resources/app.asar | Select-String node_modules`. Only `zod`, `@electron-toolkit/utils`, and their own dependencies remain.
   - Launch `dist/win-unpacked/stockfinder-ai.exe`, open every screen, and run one job. Icons, toasts, and shaders render.
   - Re-measure, and note the before and after sizes in the PR.
5. Add a guard test, `test/runtime-dependencies.test.ts`:

   ```ts
   import { test } from 'node:test'
   import assert from 'node:assert/strict'
   import { readFileSync, readdirSync, statSync } from 'node:fs'
   import { builtinModules } from 'node:module'
   import { join } from 'node:path'

   const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
     dependencies: Record<string, string>
   }

   function sourceFiles(dir: string): string[] {
     return readdirSync(dir).flatMap((name) => {
       const path = join(dir, name)
       return statSync(path).isDirectory() ? sourceFiles(path) : /\.tsx?$/.test(name) ? [path] : []
     })
   }

   function packageName(specifier: string): string {
     return specifier.startsWith('@')
       ? specifier.split('/').slice(0, 2).join('/')
       : specifier.split('/')[0]
   }

   test('runtime dependencies are exactly what main and preload import', () => {
     const imported = new Set<string>()
     for (const file of [...sourceFiles('src/main'), ...sourceFiles('src/preload')]) {
       for (const [, specifier] of readFileSync(file, 'utf8').matchAll(/from '([^'.][^']*)'/g)) {
         if (specifier === 'electron' || specifier.startsWith('node:')) continue
         imported.add(packageName(specifier))
       }
     }
     const builtins = new Set(builtinModules)
     const external = [...imported].filter((name) => !builtins.has(name)).sort()
     assert.deepEqual(Object.keys(pkg.dependencies).sort(), external)
   })
   ```

   When phase 3 adds `electron-updater`, the test requires it in `dependencies`, which is correct.

### Phase 2: Publish what an updater needs (S)

1. In each build workflow, publish from electron-builder on tag builds and keep PR builds local:

   ```yaml
   - name: Build and Package App
     run: npm run build:win -- --publish ${{ startsWith(github.ref, 'refs/tags/') && 'always' || 'never' }}
     env:
       GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
   ```

   Same for mac and linux. Remove the `softprops/action-gh-release` steps, and keep the `upload-artifact` steps for PR builds.

2. `releaseType: draft` stays. All three jobs upload to the same draft release, because electron-builder finds it by the version tag. The release is published by hand after the checks in phase 5.
3. Check one tagged pre-release (`v1.4.0-rc.1`) and confirm the draft contains:
   - Windows: `stockfinder-ai-<v>-setup.exe`, `.blockmap`, `latest.yml`
   - macOS: `.dmg`, `.zip`, `.blockmap` files, `latest-mac.yml`
   - Linux: `.AppImage`, `.deb`, `latest-linux.yml`
4. Update the artifact table in `PUBLISHING.md`.

### Phase 3: Auto-update (M)

1. `npm install electron-updater`. It's a main-process runtime dependency.
2. Add `src/main/services/updates/auto-update.ts`:

   ```ts
   import { app, BrowserWindow } from 'electron'
   import electronUpdater from 'electron-updater'
   import { AgentRunner } from '../agent/agent-runner.ts'

   const { autoUpdater } = electronUpdater
   const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

   function send(channel: string, payload?: unknown): void {
     for (const w of BrowserWindow.getAllWindows()) w.webContents.send(channel, payload)
   }

   export function startAutoUpdate(enabled: () => Promise<boolean>): void {
     if (!app.isPackaged) return
     autoUpdater.autoDownload = true
     autoUpdater.autoInstallOnAppQuit = true
     autoUpdater.on('update-downloaded', (info) =>
       send('app:updateReady', { version: info.version })
     )
     autoUpdater.on('error', (err) => console.error('Update check failed:', err))

     const check = async (): Promise<void> => {
       if (await enabled()) await autoUpdater.checkForUpdates().catch(() => undefined)
     }
     setTimeout(check, 10_000)
     setInterval(check, CHECK_INTERVAL_MS)
   }

   /** Pauses running jobs so they resume after the restart, then installs. */
   export async function restartToUpdate(): Promise<void> {
     await AgentRunner.pauseAll()
     autoUpdater.quitAndInstall()
   }
   ```

   `electron-updater` is CommonJS, hence the default import in this ESM project. Check that against the installed version's typings.

3. Wire it up:
   - Call `startAutoUpdate` in `index.ts` after the window is created.
   - Add an IPC handler `app:restartToUpdate`.
   - Add a preload method.
   - Add a renderer banner: "Version X is ready. Restart to update." Show it only when no job is running. While a job runs, keep the banner hidden and install on quit, since `autoInstallOnAppQuit` already does that.
   - Check the quit path: `before-quit` in `index.ts` (line 203) already pauses jobs, then quits. `quitAndInstall` triggers `before-quit`, so make sure the `shutdownStarted` guard doesn't block the installer's relaunch.
4. Add a setting, "Check for updates automatically" (default on), plus "Check now" and the current version in Settings, using the `__APP_VERSION__` that plan 01 phase 6 adds.
5. Add a README privacy note: "The app checks GitHub Releases for updates every six hours. You can turn this off in Settings."
6. **Test the update path** before relying on it:
   - Install the previous release.
   - Publish a newer pre-release draft to a test repository, or use `dev-app-update.yml` pointing at a test feed.
   - Confirm download, the banner, and restart.
   - Run a job, then confirm no restart happens while it runs.
7. macOS updates need phase 4's signing. Until then, skip the updater on macOS with a log line.

### Phase 4: Code signing (M, plus lead time)

1. **Windows.** Pick one:
   - **Azure Trusted Signing.** Create the account and the certificate profile, pass identity validation, and add the electron-builder 26 `win.azureSignOptions` (endpoint, account, profile). In CI, authenticate with a service principal stored in secrets.
   - **A CA code-signing certificate.** New certificates must live on a hardware token or a cloud HSM, so CI needs the vendor's cloud signing tool. Configure `win.signtoolOptions` accordingly.

   Either way, set `win.publisherName` once signing works, so `electron-updater` verifies that updates come from the same publisher. Check the exact field names in the electron-builder docs for the installed version.

2. **macOS.**
   - Use an Apple Developer ID Application certificate. Export it as `.p12` and store it as `CSC_LINK` (base64) and `CSC_KEY_PASSWORD`.
   - Set `mac.notarize: true`, with an App Store Connect API key in `APPLE_API_KEY`, `APPLE_API_KEY_ID`, and `APPLE_API_ISSUER`.
   - Check that `build/entitlements.mac.plist` has what hardened runtime needs for Electron.
3. **CI:** sign only on tag builds. PR builds stay unsigned, and forks never see the secrets.
4. **Linux:** publish `SHA256SUMS` with each release. The README tells users how to check it.
5. **Verify:**
   - Windows: `Get-AuthenticodeSignature .\stockfinder-ai-<v>-setup.exe`, plus a SmartScreen check on a clean VM.
   - macOS: `spctl --assess --type execute -vv "StockFinder AI.app"` and `xcrun stapler validate` on the dmg.

### Phase 5: Release checklist and docs (S)

Extend `PUBLISHING.md` with a "Before publishing the draft" section:

1. CI is green on the tag: lint, typecheck, tests, build.
2. **One live job per provider** (OpenAI, OpenRouter, Gemini) on the signed installer, each with that provider's default model. Record model, beat count, result, and tokens in the release notes. This is the roadmap's definition of done.
3. Fresh install with default settings: onboarding, "Test connection", and one 10-beat job.
4. **Update path:** install the previous release, let it find the draft (as a pre-release on a test channel, or by temporarily pointing at it), update, then resume a paused job across the update.
5. Read the README sections that the release changed. At minimum:
   - features
   - system requirements
   - privacy (update checks)
   - safety toggles (best effort, from plan 07 phase 4)
   - token usage (plan 06 phase 6)
6. Publish the draft.

Also fix the stale README lines listed above as part of the plans that change the behavior, not all at release time.

## Risks and mitigations

| Risk                                                                                | Mitigation                                                                                                                                          |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Moving packages to `devDependencies` breaks a runtime import that the search missed | Phase 1's guard test and the unpacked-build smoke run.                                                                                              |
| A broken update reaches every user                                                  | Drafts plus the phase 5 checks. Keep the previous release published, so a manual downgrade is possible. Consider a pre-release channel for testers. |
| The installer restarts during a job                                                 | Install only on quit or after an explicit restart click, and pause jobs first.                                                                      |
| Certificate costs or identity checks delay signing                                  | Ship phases 1 to 3 first. Windows and Linux updates work without signing, although SmartScreen warns.                                               |

## Open questions

- Who owns the signing accounts (Apple Developer, Azure or CA), and what's the budget?
- Should there be a beta channel (`allowPrerelease`) for testers to get release candidates first?
