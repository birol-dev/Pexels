// Verifies WCAG contrast for the design tokens in main.css (both themes).
// Run: npm run check:contrast
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../src/renderer/src/assets/main.css', import.meta.url), 'utf8')

function block(selector) {
  const start = css.indexOf(selector)
  if (start === -1) throw new Error(`Missing ${selector} in main.css`)
  const open = css.indexOf('{', start)
  const close = css.indexOf('\n}', open)
  const tokens = {}
  for (const [, name, value] of css.slice(open, close).matchAll(/--color-([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    tokens[name] = value
  }
  return tokens
}

const light = block('@theme static')
const dark = { ...light, ...block('.theme-flat-black') }

const channel = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16) / 255))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const SURFACES = [
  'background',
  'surface-container-lowest',
  'surface-container-low',
  'surface-container',
  'surface-container-high',
  'surface-container-highest'
]

// [foreground, background, minimum ratio]. 4.5 = AA text, 3 = AA UI / large text.
const PAIRS = [
  ...['on-surface', 'on-surface-variant', 'outline', 'primary', 'secondary', 'tertiary', 'error'].flatMap(
    (fg) => SURFACES.map((bg) => [fg, bg, 4.5])
  ),
  ['on-primary', 'primary', 4.5],
  ['on-primary-container', 'primary-container', 4.5],
  ['on-secondary', 'secondary', 4.5],
  ['on-secondary-container', 'secondary-container', 4.5],
  ['on-tertiary', 'tertiary', 4.5],
  ['on-tertiary-container', 'tertiary-container', 4.5],
  ['on-error', 'error', 4.5],
  ['on-error-container', 'error-container', 4.5],
  ['popover-foreground', 'popover', 4.5],
  ['card-foreground', 'card', 4.5],
  ['muted-foreground', 'muted', 4.5],
  ['ink-black', 'background', 3],
  ['ink-black', 'surface-container-low', 3],
  ['secondary-container', 'background', 3],
  ['ring', 'background', 3],
  ...['background', 'surface-container-lowest', 'surface-container-low', 'surface-container'].map((bg) => ['control', bg, 3])
]

let failures = 0
for (const [name, tokens] of [
  ['light', light],
  ['dark', dark]
]) {
  for (const [fg, bg, min] of PAIRS) {
    if (!tokens[fg] || !tokens[bg]) {
      console.error(`[${name}] missing token: ${!tokens[fg] ? fg : bg}`)
      failures++
      continue
    }
    const value = ratio(tokens[fg], tokens[bg])
    if (value < min) {
      console.error(`[${name}] ${fg} on ${bg}: ${value.toFixed(2)} < ${min}`)
      failures++
    }
  }
}

if (failures) {
  console.error(`\n${failures} contrast failure(s)`)
  process.exit(1)
}
console.log(`Contrast OK (${PAIRS.length} pairs x 2 themes)`)
