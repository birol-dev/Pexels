# Publishing StockFinder AI

This project publishes releases from git tags. Pushing a tag matching `v*` triggers three parallel GitHub Actions workflows that build installers for every platform. On a tag build, electron-builder (`--publish always`) uploads them to one **draft** GitHub Release, together with the metadata an updater needs to find and verify the files. You publish the draft by hand.

| Workflow                                             | Runner           | Files uploaded to the draft release                                                     |
| ---------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------- |
| [build-win.yml](.github/workflows/build-win.yml)     | `windows-latest` | `stockfinder-ai-<version>-setup.exe`, its `.exe.blockmap`, `latest.yml`                 |
| [build-mac.yml](.github/workflows/build-mac.yml)     | `macos-latest`   | `stockfinder-ai-<version>.dmg`, the `.zip`, a `.blockmap` for each, `latest-mac.yml`    |
| [build-linux.yml](.github/workflows/build-linux.yml) | `ubuntu-latest`  | `stockfinder-ai-<version>.AppImage`, `stockfinder-ai-<version>.deb`, `latest-linux.yml` |

`latest.yml`, `latest-mac.yml` and `latest-linux.yml` name the newest version and carry the size and SHA-512 of each installer. The `.blockmap` files let an updater download only the parts that changed. Don't delete or rename any of them in the draft.

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
  - Linux: the `.AppImage`, the `.deb`, `latest-linux.yml`

The first workflow to reach its upload creates the draft. The others find it by its tag name and add their files. Each one looks for the draft and creates it when there is none, without a lock, so two workflows that get there at the same moment can each create a draft. If you see two, delete the one with fewer files and re-run the workflows whose files it held.

9. Publish the draft from **GitHub → Releases** once its contents are right.

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
