# Componentization plan: shadcn/ui + Phosphor Icons

## Current state (audited)

- Renderer: React 19, Tailwind v4 (PostCSS, no `tailwind.config`), Zustand store in `lib/store.ts`.
- UI code: ~4,600 lines in `App.tsx` + 5 route files (script-input 1101, settings 846, downloaded-stuff 813, onboarding 730, agent-run 589). Only 2 shared components exist (`BrandLogo`, `ErrorBoundary`).
- Raw elements, hand-styled each time: ~75 `<button>`, 20 `<input>`, 5 `<select>`, 3 `<textarea>`; the modal in `App.tsx` is custom (`fixed inset-0`).
- Icons: Material Symbols font (`material-symbols-outlined` class, ~34 distinct glyphs, ~117 usages) plus 7 inline `<svg>` (4 are platform logos: YouTube, Shorts, TikTok, Reels).
- Styling: `assets/main.css` (1,014 lines) with a custom design system: `--*-color` Material-style tokens, two themes (`.theme-flat-black` / `.theme-flat-white`, plus `.dark` toggled from `settings.theme`), and bespoke classes (`glass-panel`, `tactile-button`, `neo-brutalist-input`, ...).
- Path alias `@renderer/*` already exists in `tsconfig.web.json` and `electron.vite.config.ts`.

## Goals

1. Replace hand-rolled controls with shadcn/ui primitives.
2. Replace Material Symbols and ad-hoc SVGs with Phosphor Icons.
3. Break the 500-1,100 line route files into small, focused components and hooks.
4. Keep the current look (lime/purple "cyber" identity, both themes). This is a structural refactor, not a redesign.

## Key decisions

| Topic | Decision |
|---|---|
| shadcn setup | Run `shadcn init` manually configured for Tailwind v4 + Vite (no Next.js). `components.json` with `aliases` pointing at `@renderer/components/ui`, `@renderer/lib/utils`. Adds `clsx`, `tailwind-merge`, `class-variance-authority`, `tw-animate-css`; Radix UI comes in per component. |
| Tokens | shadcn expects `--background`, `--foreground`, `--primary`, `--border`, `--ring`, etc. Map them onto the existing tokens (e.g. `--primary: var(--primary-container-color)`) in one `@theme inline` block rather than renaming the existing 100+ variables. Keeps both themes working. |
| Dark mode | Existing `@custom-variant dark` + `.dark` class already matches shadcn's convention. Keep it; map `.theme-flat-*` onto it. |
| Icons | `@phosphor-icons/react` (tree-shakeable named imports). Remove the Material Symbols font and `.material-symbols-outlined` CSS once the last usage is gone. Keep the 4 platform logos as small custom SVG components in `components/icons/` (Phosphor has no TikTok/Reels/Shorts marks that match). |
| Toasts / modal | Replace the custom modal in `App.tsx` with shadcn `AlertDialog`/`Dialog`; consider `sonner` for transient errors. |
| Theming of components | Edit the generated shadcn files (they're owned code) to use existing effects (glow, tactile press) via `cva` variants, instead of leaving the `tactile-button` class strings scattered. |

## Target structure

```
src/renderer/src/
  components/
    ui/                 # shadcn primitives (button, input, textarea, select, dialog, tabs, switch, badge, tooltip, progress, scroll-area, ...)
    icons/              # platform logos (YouTube, Shorts, TikTok, Reels)
    layout/             # AppShell, Sidebar, TabBar
    common/             # BrandLogo, ErrorBoundary, EmptyState, ConfirmModal
  features/
    script-input/       # components + hooks split from routes/script-input.tsx
    agent-run/
    library/            # was downloaded-stuff
    settings/           # one component per settings panel
    onboarding/         # one component per step
  lib/
    utils.ts            # cn()
    store.ts, api-client.ts, media-url.ts (unchanged)
  routes/               # thin: compose feature components only (<100 lines each)
```

## Phases

Each phase ends with `npm run typecheck`, `npm run lint`, `npm test`, and a manual `npm run dev` smoke test. Each is its own commit, so any phase can be reverted.

**Phase 0: Safety net**
- Create a branch. Capture baseline screenshots of every screen in both themes (for before/after comparison).
- Confirm typecheck/lint/tests are green.

**Phase 1: Foundation (no visible change)**
- Install `@phosphor-icons/react`, `clsx`, `tailwind-merge`, `class-variance-authority`, `tw-animate-css`.
- Add `lib/utils.ts` (`cn`) and `components.json`.
- Add the shadcn token mapping block in `main.css`; verify both themes still render identically.

**Phase 2: Primitives**
- Add shadcn components: button, input, textarea, select, label, switch, checkbox, tabs, dialog, alert-dialog, badge, tooltip, progress, scroll-area, separator, dropdown-menu (only those actually used).
- Customize `Button` variants (`default`, `secondary`, `ghost`, `destructive`, `tactile`) to reproduce `tactile-button` / `tactile-btn-secondary` / `btn-gradient`.
- Customize `Input`/`Textarea`/`Select` to match `glass-input` / `neo-brutalist-input`.

**Phase 3: Shell and shared pieces**
- Extract `AppShell`, `Sidebar`, `TabBar` (with inline title editing) from `App.tsx`; replace the custom modal with `AlertDialog`/`Dialog`; extract the settings-error screen.
- Move `BrandLogo`/`ErrorBoundary` under `components/common/`.
- Target: `App.tsx` under ~100 lines.

**Phase 4: Icons migration**
- Create a mapping table from the ~34 Material glyph names to Phosphor equivalents (e.g. `error` -> `WarningCircle`, `info` -> `Info`, `help_outline` -> `Question`).
- Migrate icons screen by screen alongside Phases 5-6 (not as one giant find/replace), using `weight` (`regular`/`bold`/`fill`) to match the old filled/outlined state.
- Move the 4 platform SVGs into `components/icons/`.
- Final step: delete the Material Symbols font link and CSS.

**Phase 5: Split routes, smallest to largest** (extract components and hooks, swap in shadcn controls as each is touched)
1. `agent-run` (589): job header, beat list, asset approval grid, log/progress panel.
2. `onboarding` (730): one component per step + a `useOnboarding` hook.
3. `downloaded-stuff` (813): filter bar, asset grid, `AssetCard`, detail drawer, manifest export.
4. `settings` (846): one panel component per section (provider keys, Pexels key, theme, paths, ...), shared `SettingsField`.
5. `script-input` (1101): script editor, platform/format picker, options panel, tab handling; move logic to hooks.

**Phase 6: Cleanup**
- Delete CSS classes made dead by the migration (`glass-*`, `tactile-*`, etc.) after grep-confirming they're unused. Aim to shrink `main.css` substantially.
- Add a short `docs/ui-guidelines.md`: where components live, how to add a shadcn component, icon usage rules.
- Final visual diff against Phase 0 screenshots, in both themes.

## Risks and mitigations

- **Visual drift:** the custom theme is strongly stylized. Mitigate with Phase 0 screenshots and by styling variants to existing tokens instead of adopting shadcn defaults.
- **Electron CSP / fonts:** Radix portals render to `document.body`; verify dialogs, selects and tooltips work under the app's CSP and in packaged builds (`build:unpack`).
- **Behavior regressions in large files:** extract without changing logic first; refactor logic only in hooks, in separate commits. There are no renderer tests today, so rely on manual smoke tests per screen; add a few tests for pure helpers pulled out of components.
- **Scope creep:** do not redesign layouts or rewrite the store during this work.
- **Tailwind v4 + shadcn:** use the v4-compatible shadcn setup (`@theme inline`, `tw-animate-css`, no `tailwind.config.js`). Verify the current CLI output before copying components.

## Suggested order of work for approval

Phases 0-2 first (foundation + primitives, ~no visible change), then Phase 3, then Phases 4-5 together per screen, then Phase 6.

## Open questions

1. Is a pixel-faithful result required, or is minor visual cleanup acceptable where shadcn defaults differ?
2. Should we do everything on one long-lived branch, or one PR per phase?
3. Is adding `sonner` for toasts in scope?
