# Design system

Tokens live in `src/renderer/src/assets/main.css`. Light is the base (`@theme static`); dark is `.theme-flat-black`, applied together with `.dark` on `<html>` by `hooks/use-theme-class.ts`. Every token has a literal value per theme. There is no opacity-based colour mixing for text.

## The idea

The app is a gallery frame. Photos and videos from Pexels supply all the colour; the chrome stays white, mist and charcoal so it never competes with them.

1. **Monochrome frame.** Three greys carry the layout: the window frame (`frame`, #F4F4F4 / #181818), the canvas (`background`, white / #232323) and tinted panels (`surface-container-low`). Ink (`primary-container`) marks the one main action and selected states. Red (`error`) is the only hue, and only for failures.
2. **Space, then tint.** No borders around cards and no drop shadows on things that sit in the page. Group with whitespace first; if that is not enough, put the group on a tint. Tints go one level deep: a tinted panel may hold `bg-background` wells and pills, never another tinted panel.
3. **Very round.** Controls (buttons, inputs, selects, tabs, badges, chips) are pills (`rounded-full`). Inner pieces (thumbnails, wells, tiles) are 12–16px (`rounded-xl`, `rounded-2xl`). Panels are 24–32px (`rounded-3xl`).
4. **Shadows only float.** `shadow-lg` is for layers above the page: menus, popovers, dialogs, sheets, toasts, and the floating callout in the onboarding preview. `shadow-sm` and `shadow-xs` resolve to nothing.
5. **Hairlines, not boxes.** Lists and sections are separated by 1px `border-border` lines (#E5E5E2), like a Swiss grid. Form controls get `border-control`, which is strong enough (≥3:1) to find.
6. **Photos as they are.** No overlays, gradients, dimming or text on top of a photo. Captions, credits and status go underneath. The one exception is a small glyph badge (the play mark on a video), and dimming a thumbnail the user has rejected.

## Type

Size over weight. Page titles are large, thin Newsreader (serif); everything a person reads or scans in a panel is Satoshi (sans). Geist Mono is only for keys, paths and raw JSON.

| Class | Size | Use |
| --- | --- | --- |
| `font-display-xl text-display-xl` | 56px / 300 | The onboarding welcome headline |
| `font-headline-lg text-headline-lg` | 44px / 300 | One page title per screen |
| `text-title-md font-title-md` | 17px / 600 | Section headings |
| `text-body-lg` | 16px | Lead paragraphs under a title |
| `text-body-md` | 14px | Body text |
| `text-label-sm` | 13px / 500 | Field labels |

Page titles follow one pattern: the subject in ink, secondary words faded with `.text-fade`, and at most one italic word (`<em>`). For example `A new <em>pack</em>, <span class="text-fade">from a script or an idea</span>`, or a run's title followed by `, in progress` faded. `fade` is too light for body text; use it only at display sizes.

No uppercase micro labels and no letter-spaced captions. Labels are sentence case, 12–13px, in `text-outline`. Floor: sentence text is at least 12px, micro labels (version strings) at least 11px.

## Roles

| Role | Tokens | Use |
| --- | --- | --- |
| Frame | `frame`, `frame-selected` | The window around the canvas (sidebar, tab strip) and a selected item on it |
| Surfaces | `background`, `surface-container-low` … `-highest` | Canvas, tinted panels, then wells and hover fills inside them |
| Text | `on-surface`, `on-surface-variant`, `outline` | Primary, secondary and tertiary text. `outline` is the weakest text colour and still passes AA |
| Ink | `primary-container`, `on-primary-container` | The main action on a screen, selected toggles and tabs, done states |
| Tinted pill | `secondary-container`, `on-secondary-container` | Secondary actions |
| Error | `error`, `error-container`, `on-error-container`, `destructive` | Failures, and the hover of destructive actions |
| Structure | `border`, `edge`, `control`, `ring` | `border` for hairline dividers, `edge` for the 1px rim of floating layers, `control` for form-control outlines, `ring` for focus |
| Fade | `fade` | Faded words in display titles only |

## Patterns

- **One ink button per screen.** The thing the screen is for (Find footage, Approve selected, Open in library) is a `Button` with the default variant. Everything else is `secondary`, `ghost` or `link`. Destructive actions are quiet (`ghost` with an `error-container` hover) and always confirm.
- **Empty states** use `components/common/EmptyState.tsx`: a grey picture (~120px), a specific bold title ("No packs yet", not "Nothing here"), one line on why or what next, a primary button and an optional link.
- **Status** reads as words, not badges: a small dot plus a sentence-case label ("Running", "Paused", "Done"), with failures in `text-error`.
- **Setup progress** is a tinted tray ("Finish your setup 3/4") with a step per missing piece and a link to fix it.
- **Settings** have a big title, a left menu and a form; below `lg` the menu becomes a horizontal tab row and field pairs stack.
- **Onboarding** is two columns: a ~470px form on the left and a live preview of the app running off the right and bottom edges.

## Contrast

`npm run check:contrast` checks every text/surface pair in both themes (4.5:1 for text, 3:1 for UI edges and large text). Add a pair there whenever you add a token. Do not put `opacity-*` on text or icons; pick a weaker token instead.

## Components

shadcn/ui primitives in `components/ui` carry the token styling; use them instead of hand-rolled markup. `LiquidMetalButton` (`components/ui/liquid-metal-button.tsx`, built on `@paper-design/shaders`) is kept for exactly one place, the Find footage button on the Create screen. It respects `prefers-reduced-motion`.
