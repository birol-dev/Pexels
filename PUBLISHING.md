# Publishing StockFinder AI

This project publishes releases from git tags. Pushing a tag matching `v*` triggers three parallel GitHub Actions workflows that build installers for every platform and upload them to the same GitHub Release.

| Workflow                                             | Runner           | Artifacts uploaded to the release                   |
| ---------------------------------------------------- | ---------------- | --------------------------------------------------- |
| [build-win.yml](.github/workflows/build-win.yml)     | `windows-latest` | `stockfinder-ai-*-setup.exe`                        |
| [build-mac.yml](.github/workflows/build-mac.yml)     | `macos-latest`   | `stockfinder-ai-*.dmg`                              |
| [build-linux.yml](.github/workflows/build-linux.yml) | `ubuntu-latest`  | `stockfinder-ai-*.AppImage`, `stockfinder-ai-*.deb` |

All three workflows also run on pull requests (build only, no release upload) and can be started manually from the Actions tab via **Run workflow**.

## Prerequisites

- Work from `main`.
- Keep unrelated user changes out of the release commit.
- Use Node.js 20 or newer.
- `GITHUB_TOKEN` is provided automatically in Actions — no extra secrets are required for draft/published release uploads.

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

8. Confirm publishing.

- Open **GitHub → Actions** and wait for all three workflows to pass:
  - **Build Windows Installer**
  - **Build macOS Installer**
  - **Build Linux Packages**
- Open **GitHub → Releases** and confirm the release contains:
  - Windows `.exe` installer
  - macOS `.dmg`
  - Linux `.AppImage` and `.deb`

The first workflow to finish creates the GitHub Release; the others attach their platform files to the same release.

## Manual workflow runs

To build installers without tagging (for testing CI):

1. Go to **Actions** in the repository.
2. Select **Build Windows Installer**, **Build macOS Installer**, or **Build Linux Packages**.
3. Click **Run workflow** → choose `main` → **Run workflow**.

Artifacts are saved to the workflow run even when no release is published.

## Platform notes

### Windows

- Produces an NSIS setup executable.
- Signed with no custom certificate in CI (standard for open-source Electron builds).

### macOS

- Produces an unsigned `.dmg` (`notarize: false` in `electron-builder.yml`).
- Users on macOS may need to right-click → Open the first time they launch the app.

### Linux

- Produces **AppImage** (portable) and **deb** (Debian/Ubuntu installer).
- Snap builds are disabled because they are unreliable in GitHub-hosted runners.

## Notes for AI agents

- Do not use `git reset --hard` or revert unrelated worktree changes.
- If workflow files change, follow the workflow files over this document.
- If the release tag already exists, stop and inspect before deleting or retagging.
- Do not force-push tags that have already been published.
