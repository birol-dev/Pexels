# Publishing StockFinder AI

This project publishes releases from git tags. Pushing a tag matching `v*` triggers three parallel GitHub Actions workflows that build installers for every platform. On a tag build, electron-builder (`--publish always`) uploads them to one **draft** GitHub Release, together with the metadata an updater needs to find and verify the files. You publish the draft by hand.

| Workflow                                             | Runner           | Files uploaded to the draft release                                                                   |
| ---------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------- |
| [build-win.yml](.github/workflows/build-win.yml)     | `windows-latest` | `stockfinder-ai-<version>-setup.exe`, its `.exe.blockmap`, `latest.yml`                               |
| [build-mac.yml](.github/workflows/build-mac.yml)     | `macos-latest`   | `stockfinder-ai-<version>.dmg`, the `.zip`, a `.blockmap` for each, `latest-mac.yml`                  |
| [build-linux.yml](.github/workflows/build-linux.yml) | `ubuntu-latest`  | `stockfinder-ai-<version>.AppImage`, `stockfinder-ai-<version>.deb`, `latest-linux.yml`, `SHA256SUMS` |

`latest.yml`, `latest-mac.yml` and `latest-linux.yml` name the newest version and carry the size and SHA-512 of each installer. The `.blockmap` files let an updater download only the parts that changed. Don't delete or rename any of them in the draft.

`SHA256SUMS` lists the SHA-256 of the two Linux packages, which are not signed. The Linux workflow writes it after the build and adds it to the release while the release is still a draft. The README tells users how to check a download against it.

All three workflows also run on pull requests and on pushes to `main` (build only, `--publish never`, installers kept as workflow artifacts) and can be started manually from the Actions tab via **Run workflow**.

## Prerequisites

- Work from `main`.
- Keep unrelated user changes out of the release commit.
- Use Node.js 22 or newer.
- `GITHUB_TOKEN` is provided automatically in Actions — no extra secrets are required to create the draft release and upload to it.
- The tag must be `v` followed by the `version` in `package.json` (`v1.4.0` for `1.4.0`). electron-builder names the release after `package.json`, not after the pushed tag, so each workflow fails early when the two differ.
- Don't create the release for the tag by hand first. electron-builder uploads only to a draft: when a published release with the same tag already exists, it skips the upload and the build still passes.

## Release Steps

1. Check the worktree.

```bash
git status --short --branch
git tag --sort=-v:refname | head
```

2. Bump the version.

```bash
npm version patch --no-git-tag-version
```

For a minor or major release, use `minor` or `major` instead of `patch`.

3. Update release notes.

- Bump the version badge in `README.md`.
- Add a changelog entry with the release date.
- Update `website/index.html` footer version if it changed.
- Mention user-facing fixes and security changes.

4. Verify locally (optional but recommended).

```bash
npm run typecheck
npm run lint
npm run build
```

Platform-specific local builds:

```bash
npm run build:win
npm run build:mac
npm run build:linux
```

5. Commit the release.

```bash
git add package.json package-lock.json README.md website/index.html PUBLISHING.md
git commit -m "Release v1.2.9"
```

Adjust the file list for the actual release. Do not stage unrelated deleted files or local experiments.

6. Tag the release.

```bash
git tag -a v1.2.9 -m "Release v1.2.9"
```

7. Push the commit and tag.

```bash
git push origin main
git push origin v1.2.9
```

8. Check the draft.

- Open **GitHub → Actions** and wait for all three workflows to pass:
  - **Build Windows Installer**
  - **Build macOS Installer**
  - **Build Linux Packages**
- Open **GitHub → Releases** and confirm there is exactly one draft for the tag, containing:
  - Windows: `stockfinder-ai-<version>-setup.exe`, `stockfinder-ai-<version>-setup.exe.blockmap`, `latest.yml`
  - macOS: the `.dmg`, the `.zip`, their `.blockmap` files, `latest-mac.yml`
  - Linux: the `.AppImage`, the `.deb`, `latest-linux.yml`, `SHA256SUMS`

The first workflow to reach its upload creates the draft. The others find it by its tag name and add their files. Each one looks for the draft and creates it when there is none, without a lock, so two workflows that get there at the same moment can each create a draft. If you see two, delete the one with fewer files and re-run the workflows whose files it held.

9. Go through [Before publishing the draft](#before-publishing-the-draft), then publish it from **GitHub → Releases**.

## Before publishing the draft

The draft is the last point where a bad build can be stopped. Once it is published, installed copies will be offered it as an update (when auto-update ships), and electron-builder no longer replaces its files.

1. CI is green: **Build and Check** (lint, typecheck, tests, build) on the release commit, and all three build workflows on the tag.
2. **One live job per provider** (OpenAI, OpenRouter, Gemini), run on the installer from the draft, each with that provider's default model (`src/shared/llm-defaults.ts`). Record the model, the beat count, the result and the token totals in the release notes. Once builds are signed, run this on the signed installer.
3. Fresh install with default settings: onboarding, "Test connection", and one 10-beat job.
4. **Update path.** Install the previous release, let it find the draft (as a pre-release on a test channel, or by temporarily pointing the updater at it), update, then resume a paused job across the update. Until a release with auto-update exists, run the new installer over the previous version instead and check that a paused job still resumes.
5. Linux: download the `.AppImage`, the `.deb` and `SHA256SUMS` from the draft and run `sha256sum --check SHA256SUMS`.
6. Read the README sections this release changed. At minimum:
   - features
   - system requirements
   - privacy (update checks)
   - safety toggles
   - token usage
7. Publish the draft.

Keep the previous release published, so a manual downgrade stays possible.

## Manual workflow runs

To build installers without tagging (for testing CI):

1. Go to **Actions** in the repository.
2. Select **Build Windows Installer**, **Build macOS Installer**, or **Build Linux Packages**.
3. Click **Run workflow** → choose `main` → **Run workflow**.

Artifacts are saved to the workflow run even when no release is published.

A run started on a branch never publishes. A run started on a tag (choose the tag instead of `main`) uploads to that version's draft release, which is how you redo one platform after a failed build.

## Platform notes

### Windows

- Produces an NSIS setup executable.
- Not signed: CI has no certificate, so SmartScreen warns on install. See [Code signing (pending)](#code-signing-pending).

### macOS

- Produces an unsigned `.dmg` and `.zip` (`notarize: false` in `electron-builder.yml`).
- Users on macOS may need to right-click → Open the first time they launch the app.

### Linux

- Produces **AppImage** (portable) and **deb** (Debian/Ubuntu installer).
- Not signed. `SHA256SUMS` is published with the packages instead.
- Snap builds are disabled because they are unreliable in GitHub-hosted runners.

## Code signing (pending)

Nothing in this section is set up yet. Builds are unsigned, so Windows SmartScreen and macOS Gatekeeper warn on every install, and macOS cannot auto-update at all, because Squirrel.Mac refuses unsigned updates. Signing needs accounts and certificates that only the owner can get, and the choice between the two Windows options is the owner's. These are the steps for when they exist.

The option names below were checked against the installed electron-builder 26.8.1 (`node_modules/app-builder-lib/scheme.json`). Check them again if electron-builder has been upgraded since.

Rules for every platform:

- Sign only on tag builds. Pull-request builds stay unsigned, and runs from forks never receive the secrets.
- Keep Windows signing options out of `electron-builder.yml`. Once `win.azureSignOptions` is in the config, every Windows build tries to sign and fails when the Azure variables are missing. Put them in `build/electron-builder.signed.yml`, which extends the main file. Files in `build/` are not packed into the app.

  ```yaml
  # build/electron-builder.signed.yml
  extends: ./electron-builder.yml
  win:
    azureSignOptions: # or signtoolOptions, see below
      # ...
  ```

  On tag builds, pass it to the build step: `npm run build:win -- --config build/electron-builder.signed.yml --publish always`.

- Give each secret only to the workflow that needs it. `CSC_LINK` is read by Windows builds too, so set it in `build-mac.yml` only.

### Windows, option A: Azure Trusted Signing

Cheaper, and CI holds no key. Azure has identity-validation requirements that the owner has to pass first.

1. In Azure, create a Trusted Signing account and a certificate profile, and pass identity validation.
2. Create a Microsoft Entra app registration (a service principal) with a client secret, and give it the signer role on the certificate profile.
3. Add the options. All four are required:

   ```yaml
   win:
     azureSignOptions:
       endpoint: <the endpoint URL of the account's region>
       codeSigningAccountName: <account name>
       certificateProfileName: <profile name>
       publisherName: <publisher name, exactly as on the certificate>
   ```

4. Add the repository secrets `AZURE_TENANT_ID`, `AZURE_CLIENT_ID` and `AZURE_CLIENT_SECRET`, and pass them as `env` to the build step on tag builds. electron-builder checks for them before it signs, installs the `TrustedSigning` PowerShell module on the runner, and signs each file with `Invoke-TrustedSigning`.

### Windows, option B: a CA code-signing certificate

1. Buy an OV or EV code-signing certificate. New certificates must keep their key on a hardware token or a cloud HSM, so there is no `.pfx` file to store as a secret. CI needs the vendor's cloud signing tool.
2. On tag builds, install the vendor's tool on the runner and sign in with it, so that `signtool` can use the certificate.
3. Add the options:

   ```yaml
   win:
     signtoolOptions:
       certificateSha1: <thumbprint of the certificate> # or certificateSubjectName
       publisherName: <publisher name, exactly as on the certificate>
       # sign: ./build/sign.cjs # only when the vendor needs its own signing command
   ```

4. Add the secrets the vendor's tool needs to sign in. Their names come from the vendor, not from electron-builder.

### Windows, both options

- Set `publisherName` as shown. In electron-builder 26 it belongs under `azureSignOptions` or `signtoolOptions`; there is no `win.publisherName`. `electron-updater` uses it to check that an update comes from the same publisher.
- Verify: `Get-AuthenticodeSignature .\stockfinder-ai-<version>-setup.exe` reports `Valid`. Then install on a clean VM and check that SmartScreen stays quiet.

### macOS

1. Join the Apple Developer Program and create a **Developer ID Application** certificate.
2. Export the certificate with its private key as a `.p12` file. Store it base64-encoded in the secret `CSC_LINK` and its password in `CSC_KEY_PASSWORD`.
3. Create an App Store Connect API key for notarization. Store the key id in `APPLE_API_KEY_ID`, the issuer id in `APPLE_API_ISSUER`, and the contents of the `.p8` file in a secret of its own. electron-builder reads `APPLE_API_KEY` as the path to the `.p8` file, so the tag build has to write that secret to a file and set `APPLE_API_KEY` to the path.
4. Set `mac.notarize: true` in `electron-builder.yml` (it is `false` today). With `true`, electron-builder notarizes when the three `APPLE_API_*` variables are set and skips notarization with a warning when none are, so unsigned pull-request builds keep working.
5. Check `build/entitlements.mac.plist` against Electron's code-signing guide. Hardened runtime is on by default in electron-builder, and the file already allows JIT, unsigned executable memory and dyld environment variables.
6. Pass the five variables as `env` to the build step in `build-mac.yml` on tag builds only.
7. Verify on a Mac, on the app from the built `.dmg`: `spctl --assess --type execute -vv "StockFinder AI.app"` reports it as accepted and notarized, and `xcrun stapler validate "StockFinder AI.app"` passes. electron-builder notarizes the app, not the `.dmg` around it, so the same check on the `.dmg` applies only if you notarize the `.dmg` as well.

macOS auto-update can be turned on only after this.

### Linux

No package signing is planned. `SHA256SUMS` is published instead.

## Notes for AI agents

- Do not use `git reset --hard` or revert unrelated worktree changes.
- If workflow files change, follow the workflow files over this document.
- If the release tag already exists, stop and inspect before deleting or retagging.
- Do not force-push tags that have already been published.
