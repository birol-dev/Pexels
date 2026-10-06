# Design system

Tokens live in `src/renderer/src/assets/main.css`. Light is the default (`@theme static`); dark is `.theme-flat-black`, applied together with `.dark` on `<html>` by `hooks/use-theme-class.ts`. Every token has a literal value per theme. There is no opacity-based colour mixing for text.

## Principles

1. **Semantic tokens only.** Components use roles (`text-on-surface`, `bg-surface-container`), never raw hex or Tailwind palette colours.
2. **Contrast is enforced.** `npm run check:contrast` checks 61 foreground/background pairs in both themes (4.5:1 for text, 3:1 for UI edges and large text). Add a pair there whenever you add a token.
3. **No opacity on text.** `opacity-*` on text or icons lowers contrast below the checked values. Pick a different token instead.
4. **Brutalist, hard-edged.** Borders are 2px, shadows are hard offsets with no blur.

## Roles

| Role | Tokens | Use |
| --- | --- | --- |
| Surfaces | `background`, `surface-container-lowest` … `-highest` | Page, cards, panels, raised areas |
| Text | `on-surface`, `on-surface-variant`, `outline` | Primary, secondary and tertiary text. `outline` is the weakest text colour and still passes AA |
| Primary | `primary`, `on-primary`, `primary-container`, `on-primary-container` | `primary` is lime-as-text on a surface. `primary-container` is the lime fill, always paired with `on-primary-container` |
| Secondary | `secondary`, `secondary-container` (violet) | Secondary actions and accents |
| Tertiary | `tertiary`, `tertiary-container` | Informational accents |
| Error | `error`, `error-container`, `destructive` | Failures and destructive actions |
| Structure | `border`, `input`, `ring`, `edge`, `control` | `border` is for dividers. `edge` is the strong outline on brutal cards and buttons. `control` is the outline on form controls (≥3:1 on every surface) |
| Shadows | `shadow-hard`, `shadow-hard-sm`, `shadow-hard-xs` | Hard offset shadows. They use `hard-shadow`, which is ink in light and lime in dark |

## Rules of thumb

- Text on a lime fill uses `text-on-primary-container` or `.text-on-lime`, never white.
- Selected toggles and active tabs use `primary-container`. They do not use `primary` as a background.
- Form controls get `border-control`. Decorative dividers get `border-border`.
- Dark mode `paper-white` is deliberately near-black (`#060607`), so legacy `bg-paper-white dark:bg-surface-container-lowest` pairs still resolve.

## Type scale

Classes: `text-display-xl`, `text-headline-lg`, `text-title-md`, `text-body-lg`, `text-body-md`, `text-label-sm`. Floor: sentence text is at least 12px, micro labels (badges, version strings) at least 11px.

## Spacing

Use Tailwind spacing steps. For panel padding use `p-component-padding`. Prefer `gap-*` over margins between siblings. Section headers in settings go through `SettingsSection`.

## Components

shadcn/ui primitives in `components/ui` carry the token styling. Use them instead of hand-rolled markup. `LiquidMetalButton` (`components/ui/liquid-metal-button.tsx`) is a hero call-to-action built on `@paper-design/shaders`, used on onboarding and the submit bar. It respects `prefers-reduced-motion`.
