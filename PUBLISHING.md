# Publishing StockFinder AI

This project publishes releases from git tags. A pushed tag matching `v*` triggers `.github/workflows/build-win.yml`, builds the Windows installer, and uploads `dist/stockfinder-ai-*-setup.exe` to the GitHub Release.

## Prerequisites

- Work from `main`.
- Keep unrelated user changes out of the release commit.
- Use Node.js 20 or newer.
- Make sure `origin` points to `https://github.com/eact6/Pexels.git`.

## Release Steps

1. Check the worktree.

```bash
git status --short --branch
git tag --sort=-v:refname | head
```

2. Bump the patch version.

```bash
npm version patch --no-git-tag-version
```

For a minor or major release, use `minor` or `major` instead of `patch`.

3. Update `README.md`.

- Change the title version.
- Add a changelog entry with the release date.
- Mention user-facing fixes and security changes.

4. Verify locally.

```bash
npm run typecheck
npm run lint
npm run build
```

5. Commit only release-related files.

```bash
git add package.json package-lock.json README.md PUBLISHING.md src/main/ipc/jobs.ipc.ts src/main/ipc/settings.ipc.ts src/main/services/agent/agent-runner.ts src/main/services/storage/secure-secrets.ts src/preload/index.ts src/preload/index.d.ts src/renderer/index.html src/renderer/src/lib/store.ts src/renderer/src/routes/agent-run.tsx src/renderer/src/routes/onboarding.tsx
git commit -m "Release v1.2.4"
```

Adjust the file list for the actual release. Do not stage unrelated deleted files or local experiments.

6. Tag the release.

```bash
git tag -a v1.2.4 -m "Release v1.2.4"
```

7. Push the commit and tag.

```bash
git push origin main
git push origin v1.2.4
```

8. Confirm publishing.

- Open GitHub Actions and wait for `Build Windows Installer` to pass.
- Confirm the GitHub Release has the installer attached.

## Notes For AI Agents

- Do not use `git reset --hard` or revert unrelated worktree changes.
- If there are pre-existing unrelated changes, leave them unstaged.
- If the build workflow changes, follow the workflow file over this document.
- If the release tag already exists, stop and inspect before deleting or retagging.
