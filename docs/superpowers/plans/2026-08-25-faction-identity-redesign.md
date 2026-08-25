# Faction Identity Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the templated landing-page look with a code-generated "Deep Field" identity in which the UTMIST/WAT.ai rivalry is a real interaction — the visitor picks a side, the whole site themes to it, and a Supabase-backed tug-of-war bar shows how the split stands.

**Architecture:** Three layers, each independently revertible. (1) A design-token layer replacing the ~80-token Material dump, with contrast enforced by automated test rather than review. (2) A client-side faction layer — React context plus a `data-faction` attribute on the document element driving CSS custom properties, so no component needs to know which side is active. (3) A tracker layer where the browser never touches the database: a Supabase Edge Function running under the service role owns both read and write, and the table has RLS on with zero anon policies.

**Tech Stack:** React 19.2, Vite 5.4, Tailwind 3.4, Supabase (Postgres + Edge Functions), Cloudflare Turnstile, Vitest 2.1.9 + Testing Library (added by Task 1).

**Spec:** `docs/superpowers/specs/2026-08-25-faction-identity-redesign-design.md`

## Global Constraints

- **Branch:** `redesign/horizontal-starwars`. Revert point is tag `pre-redesign`. Never force-push; never push to `origin` without explicit instruction.
- **Out of scope, do not modify:** `src/pages/AdmissionsPage.jsx`, `src/pages/AdmissionsAdminPage.jsx`, everything under `src/admissions/`, and the two existing migrations in `supabase/migrations/`.
- **Palette, exact values:** `void #0A0C14`, `uoft #1E3765`, `signal #8BA7DA`, `waterloo #FDD54F`, `ink #E2E1EF`, `muted #C3CBDD`.
- **`#1E3765` is ground and nebula only — never foreground text.** It measures 1.66:1 on the void. The blue faction's foreground colour is `#8BA7DA`.
- **The factions are not symmetrical.** Gold is one token in both roles; blue is two tokens with different roles. Never write code that assumes a faction is a single colour.
- **Typography:** display `Chakra Petch` 700, body `IBM Plex Sans` 400/600, mono `IBM Plex Mono` 400/500.
- **Every text/background pair must meet WCAG AA (≥ 4.5:1)** in all three faction states (neutral, utmist, watai).
- **`prefers-reduced-motion: reduce` must disable** crawl animation, starfield parallax, and cursor glow — each with a static fallback.
- **The native cursor is never hidden.** The glow is additive, `pointer-events: none`, absent on `(pointer: coarse)`.
- **Sponsor logos never take the faction accent.** Opt out explicitly, not by omission.
- **No content is gated behind choosing a faction.** The neutral state is fully functional.
- **Crawl copy, verbatim (approved):** "Two schools. Thirty-six hours. One arena. UTMIST and WAT.ai send their finest builders to settle it the only way that matters — in code."
- **Zero Lucasfilm trademarks.** No franchise names, marks, or typefaces.
- **`localStorage` may throw** (private browsing, blocked site data). Every access is wrapped; the site renders correctly with no stored value.
- Run `npm run lint` and `npm run build` before every commit. Both must pass.

## Scope Check

The spec covers two subsystems: the identity + faction layer (Tasks 1–10) and the cheer tracker (Tasks 11–13). They are deliberately separable — the spec isolates the tracker so it can be removed without touching the faction work. They are kept in one plan because the tracker depends on the faction layer's types and would not be independently useful, but **Tasks 11–13 can be dropped wholesale** if the public-tally sign-off does not arrive, leaving Tasks 1–10 as a complete, shippable deliverable.

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `src/test/setup.js` | Testing Library matchers + per-test DOM cleanup |
| `src/theme/tokens.js` | Palette and faction→accent mapping. Single source of truth |
| `src/theme/contrast.js` | WCAG relative-luminance and contrast-ratio maths |
| `src/theme/tokens.test.js` | Asserts every shipped colour pair meets AA |
| `src/faction/factionStorage.js` | Throw-safe `localStorage` read/write |
| `src/faction/factionStorage.test.js` | |
| `src/faction/FactionContext.jsx` | Provider + `useFaction`; owns the `data-faction` attribute |
| `src/faction/FactionContext.test.jsx` | |
| `src/faction/FactionChoice.jsx` | The split "cheer on" UI |
| `src/faction/CursorGlow.jsx` | Pointer glow in `--accent` |
| `src/components/Starfield.jsx` | Parallax void; replaces `background.png` |
| `src/components/Crawl.jsx` | Perspective opening crawl |
| `src/cheer/cheerClient.js` | Talks to the Edge Function; never to the table |
| `src/cheer/cheerClient.test.js` | |
| `src/cheer/TugOfWar.jsx` | Territory bar |
| `src/data/sponsors.test.js` | Data-integrity guard on the sponsor wall |
| `supabase/migrations/202608250001_faction_cheers.sql` | Table, unique index, RLS |
| `supabase/functions/faction-cheer/index.ts` | Service-role read/write + Turnstile |

**Modified:** `package.json`, `vite.config.js`, `eslint.config.js`, `tailwind.config.js`, `src/index.css`, `src/App.jsx`, `src/pages/LandingPage.jsx`, and the six landing-page components.

**Deleted:** `src/assets/background.png` (3.86 MB), `src/assets/hand.png` (356 KB), `src/components/Hero_old.jsx`, `src/components/Hero_old_utf8.jsx`.

---

### Task 1: Test infrastructure and a first real guard

There is no test runner in this repo today — only `lint` and `build`. This task adds one and proves it works on a test with genuine value: the sponsor wall renders from `src/data/sponsors.js`, so a sponsor added without a logo or URL would ship a broken card silently.

**Files:**
- Modify: `package.json`, `vite.config.js`
- Create: `src/test/setup.js`, `src/data/sponsors.test.js`

**Interfaces:**
- Consumes: `sponsors` from `src/data/sponsors.js` (existing) — array of `{ name, logo, url, logoScale }`.
- Produces: `npm test` (single run) and `npm run test:watch`. All later tasks rely on these.

- [ ] **Step 1: Install the test toolchain**

Pinned to Vitest 2.x because Vitest 3 does not support Vite 5.

```bash
npm install -D vitest@2.1.9 jsdom@25 @testing-library/react@16 @testing-library/jest-dom@6 @testing-library/user-event@14
```

- [ ] **Step 2: Add the test scripts**

In `package.json`, add to `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Configure Vitest**

Replace `vite.config.js` with:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    css: false,
  },
})
```

- [ ] **Step 4: Create the setup file**

`src/test/setup.js`:

```js
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
  document.documentElement.removeAttribute('data-faction')
})
```

- [ ] **Step 5: Write the failing test**

`src/data/sponsors.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { sponsors } from './sponsors'

describe('sponsor data', () => {
  it('has at least the five confirmed sponsors', () => {
    expect(sponsors.length).toBeGreaterThanOrEqual(5)
  })

  it('gives every sponsor a name, a logo and a url', () => {
    for (const s of sponsors) {
      expect(s.name, 'sponsor is missing a name').toBeTruthy()
      expect(s.logo, `${s.name} is missing a logo`).toBeTruthy()
      expect(s.url, `${s.name} is missing a url`).toMatch(/^https:\/\//)
    }
  })

  it('uses a sane optical scale where one is given', () => {
    for (const s of sponsors) {
      if (s.logoScale === undefined) continue
      expect(s.logoScale, `${s.name} logoScale out of range`).toBeGreaterThan(0.3)
      expect(s.logoScale, `${s.name} logoScale out of range`).toBeLessThanOrEqual(1)
    }
  })

  it('has no duplicate sponsors', () => {
    const names = sponsors.map((s) => s.name.toLowerCase())
    expect(new Set(names).size).toBe(names.length)
  })
})
```

- [ ] **Step 6: Run the test**

Run: `npm test`
Expected: PASS, 4 tests. If it fails to start, the toolchain is misconfigured — fix before moving on.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vite.config.js src/test/setup.js src/data/sponsors.test.js
git commit -m "test: add vitest toolchain and sponsor data guard"
```

---

### Task 2: Design tokens with contrast enforced by test

The spec makes WCAG AA an acceptance criterion. This task makes it automated, so a future colour tweak that breaks legibility fails CI rather than shipping.

**Files:**
- Create: `src/theme/contrast.js`, `src/theme/tokens.js`, `src/theme/tokens.test.js`

**Interfaces:**
- Produces:
  - `relativeLuminance(hex: string) => number`
  - `contrastRatio(hexA: string, hexB: string) => number`
  - `meetsAA(hexA, hexB) => boolean` (≥ 4.5)
  - `palette` — object keyed `void|uoft|signal|waterloo|ink|muted`
  - `FACTIONS = ['utmist', 'watai']`
  - `factionAccent = { utmist: '#8BA7DA', watai: '#FDD54F' }`
  - `NEUTRAL_ACCENT = '#C3CBDD'`
  - `factionLabel = { utmist: 'UTMIST', watai: 'WAT.ai' }`
  - `factionSchool = { utmist: 'University of Toronto', watai: 'University of Waterloo' }`
  - Tasks 3, 4, 8, 12, 13 all import from here. `factionLabel` and
    `factionSchool` are consumed by Task 8 (`FactionChoice.jsx`) and
    `factionLabel` again by Task 13 (`TugOfWar.jsx`).

- [ ] **Step 1: Write the failing test**

`src/theme/tokens.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { contrastRatio, meetsAA } from './contrast'
import { palette, FACTIONS, factionAccent, NEUTRAL_ACCENT } from './tokens'

describe('contrast maths', () => {
  it('gives 21:1 for black on white', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1)
  })

  it('is order independent', () => {
    expect(contrastRatio('#0A0C14', '#FDD54F')).toBeCloseTo(
      contrastRatio('#FDD54F', '#0A0C14'), 5)
  })

  it('accepts hex with or without the leading hash', () => {
    expect(contrastRatio('0A0C14', '#FDD54F')).toBeCloseTo(
      contrastRatio('#0A0C14', '#FDD54F'), 5)
  })
})

describe('shipped colour pairs', () => {
  const foregrounds = ['ink', 'muted', 'signal', 'waterloo']

  it.each(foregrounds)('%s meets AA on the void', (key) => {
    expect(meetsAA(palette[key], palette.void)).toBe(true)
  })

  it.each(['ink', 'muted', 'waterloo'])('%s meets AA on the uoft surface', (key) => {
    expect(meetsAA(palette[key], palette.uoft)).toBe(true)
  })

  it.each(FACTIONS)('the %s accent meets AA on the void', (f) => {
    expect(meetsAA(factionAccent[f], palette.void)).toBe(true)
  })

  it('the neutral accent meets AA on the void', () => {
    expect(meetsAA(NEUTRAL_ACCENT, palette.void)).toBe(true)
  })
})

describe('uoft blue is ground-only', () => {
  // Documents WHY the factions are asymmetric. If this ever passes, someone
  // changed #1E3765 and the ground/foreground split needs revisiting.
  it('fails AA as a foreground on the void', () => {
    expect(meetsAA(palette.uoft, palette.void)).toBe(false)
  })

  it('is never used as a faction accent', () => {
    expect(Object.values(factionAccent)).not.toContain(palette.uoft)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test src/theme/tokens.test.js`
Expected: FAIL — cannot resolve `./contrast` and `./tokens`.

- [ ] **Step 3: Implement the contrast maths**

`src/theme/contrast.js`:

```js
/** WCAG 2.1 relative luminance and contrast ratio. */

function channel(value) {
  const c = value / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

export function relativeLuminance(hex) {
  const h = hex.replace('#', '')
  if (h.length !== 6) throw new Error(`expected a 6-digit hex colour, got "${hex}"`)
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrastRatio(hexA, hexB) {
  const a = relativeLuminance(hexA)
  const b = relativeLuminance(hexB)
  const lighter = Math.max(a, b)
  const darker = Math.min(a, b)
  return (lighter + 0.05) / (darker + 0.05)
}

/** WCAG AA for normal-size text. */
export function meetsAA(foreground, background) {
  return contrastRatio(foreground, background) >= 4.5
}
```

- [ ] **Step 4: Implement the tokens**

`src/theme/tokens.js`:

```js
/**
 * Single source of truth for the Deep Field palette.
 *
 * `uoft` is ground and nebula ONLY. It is a dark navy designed for white
 * paper and measures 1.66:1 on the void, so it can never carry foreground
 * text. The blue faction's foreground colour is `signal`, a lightened
 * derivative of the same hue.
 *
 * This makes the factions asymmetric: gold is one token in both roles,
 * blue is two tokens with different roles. Do not write code that assumes
 * a faction is a single colour.
 */
export const palette = {
  void: '#0A0C14',
  uoft: '#1E3765',
  signal: '#8BA7DA',
  waterloo: '#FDD54F',
  ink: '#E2E1EF',
  muted: '#C3CBDD',
}

export const FACTIONS = ['utmist', 'watai']

export const factionAccent = {
  utmist: palette.signal,
  watai: palette.waterloo,
}

/** Used before a side is chosen. Favours neither school. */
export const NEUTRAL_ACCENT = palette.muted

export const factionLabel = {
  utmist: 'UTMIST',
  watai: 'WAT.ai',
}

export const factionSchool = {
  utmist: 'University of Toronto',
  watai: 'University of Waterloo',
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test src/theme/tokens.test.js`
Expected: PASS, all tests.

- [ ] **Step 6: Commit**

```bash
git add src/theme
git commit -m "feat: add design tokens with contrast enforced by test"
```

---

### Task 3: Typography and Tailwind token replacement

Fixes a real bug: `tailwind.config.js:78` maps `mono` to `["Inter", "monospace"]`, so every `font-mono` on the site currently renders in a sans-serif.

**Files:**
- Modify: `tailwind.config.js`, `src/index.css`
- Create: `tailwind.config.test.js`

**Interfaces:**
- Consumes: `palette`, `NEUTRAL_ACCENT`, `factionAccent` from `src/theme/tokens.js`.
- Produces: Tailwind utilities `bg-void`, `text-ink`, `text-muted`, `text-signal`, `text-waterloo`, `bg-uoft`, `text-accent`, `bg-accent`, `border-accent`; font utilities `font-display`, `font-sans`, `font-mono`.

- [ ] **Step 1: Write the failing test**

`tailwind.config.test.js`:

```js
import { describe, it, expect } from 'vitest'
import config from './tailwind.config.js'
import { palette } from './src/theme/tokens.js'

const { fontFamily, colors } = config.theme.extend

describe('typography config', () => {
  it('uses a real monospace for the mono slot', () => {
    // Regression guard: this was ["Inter", "monospace"] — a sans in the mono slot.
    expect(fontFamily.mono[0]).toBe('IBM Plex Mono')
    expect(fontFamily.mono[0]).not.toBe('Inter')
  })

  it('keeps display, sans and mono distinct', () => {
    const heads = [fontFamily.display[0], fontFamily.sans[0], fontFamily.mono[0]]
    expect(new Set(heads).size).toBe(3)
  })

  it('uses Chakra Petch for display and IBM Plex Sans for body', () => {
    expect(fontFamily.display[0]).toBe('Chakra Petch')
    expect(fontFamily.sans[0]).toBe('IBM Plex Sans')
  })
})

describe('colour config', () => {
  it('exposes the palette tokens', () => {
    for (const key of ['void', 'uoft', 'signal', 'waterloo', 'ink', 'muted']) {
      expect(colors[key], `missing token ${key}`).toBe(palette[key])
    }
  })

  it('wires the accent to a CSS custom property so theming needs no JS', () => {
    expect(colors.accent).toBe('var(--accent)')
  })

  it('has dropped the unused Material dump', () => {
    expect(Object.keys(colors).length).toBeLessThan(15)
    expect(colors['on-tertiary-fixed-variant']).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test tailwind.config.test.js`
Expected: FAIL — `fontFamily.mono[0]` is `"Inter"`, and the Material tokens are still present.

- [ ] **Step 3: Rewrite the Tailwind config**

Replace the whole `theme.extend` block in `tailwind.config.js` with:

```js
import { palette } from './src/theme/tokens.js'

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ...palette,
        // Driven by [data-faction] on <html>. See src/faction/FactionContext.jsx.
        accent: 'var(--accent)',
        'accent-ink': 'var(--accent-ink)',
      },
      fontFamily: {
        display: ['Chakra Petch', 'system-ui', 'sans-serif'],
        sans: ['IBM Plex Sans', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      spacing: {
        gutter: '24px',
        'container-max': '1280px',
      },
      maxWidth: {
        'container-max': '1280px',
      },
    },
  },
  plugins: [],
}
```

- [ ] **Step 4: Swap the font imports and strip the effect soup**

In `src/index.css`, replace the Google Fonts `@import` on line 1 with:

```css
@import url('https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;600;700&family=IBM+Plex+Sans:wght@400;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
```

Then delete these rule blocks entirely: `.glass-panel`, `.glass-panel:hover`, `.glass-panel-blue`, `.glass-panel-blue:hover`, `.glass-panel-gold`, `.glass-panel-gold:hover`, `.glow-text-blue`, `.glow-text-gold`, `.glow-text-mixed`, `.network-pattern`, `.network-pattern-gold`, `.font-sarabun`, `.font-sagburn`.

Replace the `body` rule with (note: no `background-image` — Task 6 deletes `background.png`):

```css
body {
  margin: 0;
  background-color: #0A0C14;
  color: #E2E1EF;
  font-family: 'IBM Plex Sans', system-ui, sans-serif;
  overflow-x: hidden;
}
```

Add the faction theming block, which is what makes `text-accent` work everywhere:

```css
:root                   { --accent: #C3CBDD; --accent-ink: #0A0C14; }
[data-faction="utmist"] { --accent: #8BA7DA; --accent-ink: #0A0C14; }
[data-faction="watai"]  { --accent: #FDD54F; --accent-ink: #0A0C14; }
```

- [ ] **Step 5: Run tests and build**

Run: `npm test && npm run lint && npm run build`
Expected: tests PASS. The build will succeed; the page will look broken until later tasks land, because components still reference deleted classes. That is expected at this step.

- [ ] **Step 6: Commit**

```bash
git add tailwind.config.js tailwind.config.test.js src/index.css
git commit -m "feat: replace Material token dump with Deep Field tokens and real typography"
```

---

### Task 4: Throw-safe faction storage

`localStorage` throws outright in some privacy configurations. This is pure logic and fully testable.

**Files:**
- Create: `src/faction/factionStorage.js`, `src/faction/factionStorage.test.js`

**Interfaces:**
- Consumes: `FACTIONS` from `src/theme/tokens.js`.
- Produces:
  - `STORAGE_KEY = 'bots.faction'`
  - `readFaction() => 'utmist' | 'watai' | null`
  - `writeFaction(faction) => boolean` — `true` if persisted
  - `clearFaction() => void`
  - Task 5 consumes all three.

- [ ] **Step 1: Write the failing test**

`src/faction/factionStorage.test.js`:

```js
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { readFaction, writeFaction, clearFaction, STORAGE_KEY } from './factionStorage'

describe('factionStorage', () => {
  beforeEach(() => window.localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('returns null when nothing is stored', () => {
    expect(readFaction()).toBeNull()
  })

  it('round-trips a valid faction', () => {
    expect(writeFaction('utmist')).toBe(true)
    expect(readFaction()).toBe('utmist')
  })

  it('rejects a faction that is not real', () => {
    expect(writeFaction('mit')).toBe(false)
    expect(readFaction()).toBeNull()
  })

  it('ignores a corrupted stored value', () => {
    window.localStorage.setItem(STORAGE_KEY, 'not-a-faction')
    expect(readFaction()).toBeNull()
  })

  it('clears a stored faction', () => {
    writeFaction('watai')
    clearFaction()
    expect(readFaction()).toBeNull()
  })

  // The important cases: privacy modes make these throw, not return null.
  it('returns null instead of throwing when reads are blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied')
    })
    expect(() => readFaction()).not.toThrow()
    expect(readFaction()).toBeNull()
  })

  it('reports failure instead of throwing when writes are blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota')
    })
    expect(() => writeFaction('utmist')).not.toThrow()
    expect(writeFaction('utmist')).toBe(false)
  })

  it('does not throw when clearing is blocked', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('denied')
    })
    expect(() => clearFaction()).not.toThrow()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test src/faction/factionStorage.test.js`
Expected: FAIL — cannot resolve `./factionStorage`.

- [ ] **Step 3: Implement**

`src/faction/factionStorage.js`:

```js
import { FACTIONS } from '../theme/tokens'

export const STORAGE_KEY = 'bots.faction'

function isFaction(value) {
  return FACTIONS.includes(value)
}

/**
 * Every access is wrapped: localStorage throws outright in some privacy
 * configurations rather than returning null, and a faction preference is
 * never important enough to break the page over.
 */
export function readFaction() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return isFaction(stored) ? stored : null
  } catch {
    return null
  }
}

export function writeFaction(faction) {
  if (!isFaction(faction)) return false
  try {
    window.localStorage.setItem(STORAGE_KEY, faction)
    return true
  } catch {
    return false
  }
}

export function clearFaction() {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* nothing to do — the preference simply does not persist */
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test src/faction/factionStorage.test.js`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/faction/factionStorage.js src/faction/factionStorage.test.js
git commit -m "feat: add throw-safe faction storage"
```

---

### Task 5: Faction context and site-wide theming

The mechanism that makes every other component theme without knowing the faction: set one attribute on `<html>`, let CSS custom properties do the rest.

**Files:**
- Create: `src/faction/FactionContext.jsx`, `src/faction/FactionContext.test.jsx`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `readFaction`, `writeFaction`, `clearFaction` (Task 4); `FACTIONS` (Task 2).
- Produces:
  - `<FactionProvider>{children}</FactionProvider>`
  - `useFaction() => { faction, hasChosen, choose(faction), clear() }` where `faction` is `'utmist' | 'watai' | null` and `hasChosen` is `faction !== null`.
  - Tasks 8, 9, 12, 13 consume `useFaction`.

- [ ] **Step 1: Write the failing test**

`src/faction/FactionContext.test.jsx`:

```jsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FactionProvider, useFaction } from './FactionContext'
import { STORAGE_KEY } from './factionStorage'

function Probe() {
  const { faction, hasChosen, choose, clear } = useFaction()
  return (
    <div>
      <span data-testid="faction">{faction ?? 'none'}</span>
      <span data-testid="chosen">{String(hasChosen)}</span>
      <button onClick={() => choose('utmist')}>pick utmist</button>
      <button onClick={() => choose('watai')}>pick watai</button>
      <button onClick={clear}>clear</button>
    </div>
  )
}

const renderProbe = () =>
  render(<FactionProvider><Probe /></FactionProvider>)

describe('FactionProvider', () => {
  beforeEach(() => window.localStorage.clear())

  it('starts neutral with no stored choice', () => {
    renderProbe()
    expect(screen.getByTestId('faction')).toHaveTextContent('none')
    expect(screen.getByTestId('chosen')).toHaveTextContent('false')
  })

  it('leaves data-faction unset while neutral', () => {
    renderProbe()
    expect(document.documentElement.hasAttribute('data-faction')).toBe(false)
  })

  it('sets data-faction on the document element when a side is chosen', async () => {
    const user = userEvent.setup()
    renderProbe()
    await user.click(screen.getByText('pick watai'))
    expect(document.documentElement.getAttribute('data-faction')).toBe('watai')
  })

  it('persists the choice', async () => {
    const user = userEvent.setup()
    renderProbe()
    await user.click(screen.getByText('pick utmist'))
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('utmist')
  })

  it('rehydrates a stored choice on mount', () => {
    window.localStorage.setItem(STORAGE_KEY, 'watai')
    renderProbe()
    expect(screen.getByTestId('faction')).toHaveTextContent('watai')
    expect(document.documentElement.getAttribute('data-faction')).toBe('watai')
  })

  it('allows switching sides', async () => {
    const user = userEvent.setup()
    renderProbe()
    await user.click(screen.getByText('pick utmist'))
    await user.click(screen.getByText('pick watai'))
    expect(screen.getByTestId('faction')).toHaveTextContent('watai')
    expect(document.documentElement.getAttribute('data-faction')).toBe('watai')
  })

  it('returns to neutral and removes the attribute on clear', async () => {
    const user = userEvent.setup()
    renderProbe()
    await user.click(screen.getByText('pick utmist'))
    await user.click(screen.getByText('clear'))
    expect(screen.getByTestId('faction')).toHaveTextContent('none')
    expect(document.documentElement.hasAttribute('data-faction')).toBe(false)
  })

  it('ignores an invalid faction', async () => {
    function BadProbe() {
      const { faction, choose } = useFaction()
      return (
        <div>
          <span data-testid="faction">{faction ?? 'none'}</span>
          <button onClick={() => choose('mit')}>bad</button>
        </div>
      )
    }
    const user = userEvent.setup()
    render(<FactionProvider><BadProbe /></FactionProvider>)
    await user.click(screen.getByText('bad'))
    expect(screen.getByTestId('faction')).toHaveTextContent('none')
  })

  it('still works when storage is unavailable', () => {
    // The site must render correctly with no stored value available.
    const original = window.localStorage.getItem
    window.localStorage.getItem = () => { throw new DOMException('denied') }
    expect(() => renderProbe()).not.toThrow()
    window.localStorage.getItem = original
  })
})

describe('useFaction outside a provider', () => {
  it('throws a helpful error', () => {
    function Orphan() { useFaction(); return null }
    expect(() => render(<Orphan />)).toThrow(/FactionProvider/)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test src/faction/FactionContext.test.jsx`
Expected: FAIL — cannot resolve `./FactionContext`.

- [ ] **Step 3: Implement**

`src/faction/FactionContext.jsx`:

```jsx
import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { FACTIONS } from '../theme/tokens'
import { readFaction, writeFaction, clearFaction } from './factionStorage'

const FactionContext = createContext(null)

/**
 * Owns the visitor's chosen side and mirrors it onto <html data-faction="...">.
 *
 * Theming is done entirely in CSS from that one attribute (see the
 * [data-faction] rules in src/index.css), so no consuming component needs to
 * know which faction is active — it just uses the `accent` colour utilities.
 *
 * Neutral (no choice) is a fully supported state: the attribute is absent and
 * :root supplies a neutral accent that favours neither school.
 */
export function FactionProvider({ children }) {
  // Lazy initialiser, not useState(null) + a mount effect: this repo's
  // eslint-plugin-react-hooks 7.x sets `set-state-in-effect` to error, and
  // reading the stored value up front also avoids a returning visitor seeing
  // a frame of neutral theming before their side is reapplied.
  const [faction, setFaction] = useState(() => readFaction())

  useEffect(() => {
    const root = document.documentElement
    if (faction) root.setAttribute('data-faction', faction)
    else root.removeAttribute('data-faction')
  }, [faction])

  const choose = useCallback((next) => {
    if (!FACTIONS.includes(next)) return
    setFaction(next)
    writeFaction(next)
  }, [])

  const clear = useCallback(() => {
    setFaction(null)
    clearFaction()
  }, [])

  const value = useMemo(
    () => ({ faction, hasChosen: faction !== null, choose, clear }),
    [faction, choose, clear],
  )

  return <FactionContext.Provider value={value}>{children}</FactionContext.Provider>
}

export function useFaction() {
  const ctx = useContext(FactionContext)
  if (!ctx) throw new Error('useFaction must be used inside a FactionProvider')
  return ctx
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test src/faction/FactionContext.test.jsx`
Expected: PASS, 10 tests.

- [ ] **Step 5: Mount the provider**

In `src/App.jsx`, wrap the existing router tree in `<FactionProvider>`. Import it with `import { FactionProvider } from './faction/FactionContext'`. Do not change any route definitions — `/apply` and `/apply/admin` keep their current behaviour and simply inherit the neutral accent.

- [ ] **Step 6: Verify and commit**

Run: `npm test && npm run lint && npm run build`
Expected: all PASS.

```bash
git add src/faction/FactionContext.jsx src/faction/FactionContext.test.jsx src/App.jsx
git commit -m "feat: add faction context driving site-wide theming"
```

---

### Task 6: The starfield, and deleting 4.2 MB of images

**Files:**
- Create: `src/components/Starfield.jsx`, `src/components/Starfield.test.jsx`
- Modify: `src/pages/LandingPage.jsx`
- Delete: `src/assets/background.png`, `src/assets/hand.png`

**Interfaces:**
- Produces: `<Starfield />` — fixed-position, `aria-hidden`, `pointer-events: none`, renders behind all content.

- [ ] **Step 1: Write the failing test**

`src/components/Starfield.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import Starfield from './Starfield'

describe('Starfield', () => {
  it('is hidden from assistive technology', () => {
    const { container } = render(<Starfield />)
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true')
  })

  it('never intercepts pointer input', () => {
    const { container } = render(<Starfield />)
    expect(container.firstChild.className).toMatch(/pointer-events-none/)
  })

  it('renders three parallax depth layers', () => {
    const { container } = render(<Starfield />)
    expect(container.querySelectorAll('[data-layer]')).toHaveLength(3)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test src/components/Starfield.test.jsx`
Expected: FAIL — cannot resolve `./Starfield`.

- [ ] **Step 3: Implement**

`src/components/Starfield.jsx`:

```jsx
import { useEffect, useRef } from 'react'

/**
 * The void. Three depth layers of CSS point-stars over two institutional
 * nebulae — UofT blue bleeding from one corner, Waterloo gold from the
 * other, echoing the diagonal that was already in the old background.png.
 *
 * This replaces a 3.86 MB PNG with a few hundred bytes of gradients.
 * Parallax is skipped entirely under prefers-reduced-motion; the static
 * field remains, so nothing is lost but the movement.
 */
const LAYERS = [
  { depth: 0.02, size: '1.5px', count: 'a', opacity: 0.9 },
  { depth: 0.05, size: '1px', count: 'b', opacity: 0.6 },
  { depth: 0.09, size: '2px', count: 'c', opacity: 0.35 },
]

export default function Starfield() {
  const ref = useRef(null)

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (reduce.matches) return

    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const y = window.scrollY
        const node = ref.current
        if (!node) return
        for (const el of node.querySelectorAll('[data-layer]')) {
          const depth = Number(el.dataset.depth)
          el.style.transform = `translate3d(0, ${-y * depth}px, 0)`
        }
      })
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <div ref={ref} aria-hidden="true" className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
      <div className="absolute inset-0 bg-void" />
      <div className="absolute inset-0 starfield-nebula" />
      {LAYERS.map((layer) => (
        <div
          key={layer.count}
          data-layer={layer.count}
          data-depth={layer.depth}
          className={`absolute inset-0 starfield-layer starfield-${layer.count}`}
          style={{ opacity: layer.opacity, willChange: 'transform' }}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Add the star and nebula CSS**

Append to `src/index.css`:

```css
/* The void — see src/components/Starfield.jsx */
.starfield-nebula {
  background:
    radial-gradient(58% 74% at 14% 18%, rgba(30, 55, 101, .85) 0%, transparent 62%),
    radial-gradient(52% 68% at 88% 82%, rgba(253, 213, 79, .13) 0%, transparent 64%);
}
.starfield-layer { background-repeat: repeat; }
.starfield-a {
  background-image:
    radial-gradient(1.5px 1.5px at 20px 30px, #fff 50%, transparent 50%),
    radial-gradient(1.5px 1.5px at 130px 80px, #fff 50%, transparent 50%),
    radial-gradient(1.5px 1.5px at 75px 160px, #fff 50%, transparent 50%);
  background-size: 200px 200px;
}
.starfield-b {
  background-image:
    radial-gradient(1px 1px at 45px 70px, #fff 50%, transparent 50%),
    radial-gradient(1px 1px at 160px 20px, #fff 50%, transparent 50%),
    radial-gradient(1px 1px at 100px 130px, #fff 50%, transparent 50%);
  background-size: 180px 180px;
}
.starfield-c {
  background-image:
    radial-gradient(2px 2px at 90px 40px, #C3CBDD 50%, transparent 50%),
    radial-gradient(2px 2px at 30px 150px, #C3CBDD 50%, transparent 50%);
  background-size: 260px 260px;
}
@media (prefers-reduced-motion: reduce) {
  .starfield-layer { transform: none !important; }
}
```

- [ ] **Step 5: Mount it and delete the images**

In `src/pages/LandingPage.jsx`, replace the existing background `<div className="fixed inset-0 z-0 pointer-events-none">…</div>` block with `<Starfield />`.

```bash
git rm src/assets/background.png src/assets/hand.png
```

`hand.png` is imported by `src/components/Hero.jsx` — remove that import and the `<img src={handImg}>` element in the same step or the build will fail.

- [ ] **Step 6: Verify the weight drop**

Run: `npm test && npm run lint && npm run build`
Expected: tests PASS; build succeeds; `dist/assets/` no longer contains `background-*.png` or `hand-*.png`. Total `dist` size should fall by roughly 4.2 MB.

- [ ] **Step 7: Commit**

```bash
git add -A src/components/Starfield.jsx src/components/Starfield.test.jsx src/index.css src/pages/LandingPage.jsx src/components/Hero.jsx
git commit -m "feat: replace 4.2MB of background images with a CSS starfield"
```

---

### Task 7: The opening crawl

**Files:**
- Create: `src/components/Crawl.jsx`, `src/components/Crawl.test.jsx`
- Modify: `src/index.css`

**Interfaces:**
- Produces: `<Crawl text={string} onDone={() => void} />`. Renders the text in a receding 3D transform; calls `onDone` when the animation ends, or immediately under reduced motion.

- [ ] **Step 1: Write the failing test**

`src/components/Crawl.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import Crawl from './Crawl'

const COPY = 'Two schools. Thirty-six hours. One arena.'

function mockReducedMotion(reduce) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: query.includes('prefers-reduced-motion') ? reduce : false,
    media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }))
}

describe('Crawl', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('renders the crawl text as real, selectable content', () => {
    mockReducedMotion(false)
    render(<Crawl text={COPY} />)
    expect(screen.getByText(COPY)).toBeInTheDocument()
  })

  it('animates when motion is allowed', () => {
    mockReducedMotion(false)
    const { container } = render(<Crawl text={COPY} />)
    expect(container.querySelector('[data-animated="true"]')).toBeInTheDocument()
  })

  it('renders a static block under prefers-reduced-motion', () => {
    mockReducedMotion(true)
    const { container } = render(<Crawl text={COPY} />)
    expect(container.querySelector('[data-animated="true"]')).toBeNull()
    expect(screen.getByText(COPY)).toBeInTheDocument()
  })

  it('calls onDone immediately under reduced motion', () => {
    mockReducedMotion(true)
    const onDone = vi.fn()
    render(<Crawl text={COPY} onDone={onDone} />)
    expect(onDone).toHaveBeenCalledOnce()
  })

  it('offers a skip control that calls onDone', async () => {
    mockReducedMotion(false)
    const onDone = vi.fn()
    render(<Crawl text={COPY} onDone={onDone} />)
    screen.getByRole('button', { name: /skip/i }).click()
    expect(onDone).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test src/components/Crawl.test.jsx`
Expected: FAIL — cannot resolve `./Crawl`.

- [ ] **Step 3: Implement**

`src/components/Crawl.jsx`:

```jsx
import { useEffect, useRef, useState } from 'react'

/**
 * The opening crawl: text receding into the starfield on a CSS 3D transform.
 *
 * The wording and typeface are ours; only the perspective effect is borrowed,
 * and that is not protectable. No franchise names, marks, or typefaces appear
 * anywhere in this component.
 *
 * Under prefers-reduced-motion the text renders as a plain static block and
 * onDone fires immediately, so nobody is held behind an animation they asked
 * not to see. A skip control is always available.
 */
export default function Crawl({ text, onDone }) {
  const doneRef = useRef(false)

  // Lazy initialiser, not setState inside an effect: this repo's
  // eslint-plugin-react-hooks 7.x sets react-hooks/set-state-in-effect to error.
  const [animated] = useState(
    () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  const finish = () => {
    if (doneRef.current) return
    doneRef.current = true
    onDone?.()
  }

  useEffect(() => {
    // Nothing to wait for when motion is reduced, so release the caller at once
    // rather than holding it behind an animation it opted out of.
    if (!animated) finish()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!animated) {
    return (
      <div className="mx-auto max-w-2xl px-gutter text-center">
        <p className="font-sans text-base leading-relaxed text-muted">{text}</p>
      </div>
    )
  }

  return (
    <div className="crawl-stage" data-animated="true">
      <div className="crawl-track" onAnimationEnd={finish}>
        <p className="crawl-copy font-display uppercase">{text}</p>
      </div>
      <button
        type="button"
        onClick={finish}
        className="crawl-skip font-mono text-[10px] uppercase tracking-[.25em] text-muted hover:text-accent"
      >
        Skip intro
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Add the crawl CSS**

Append to `src/index.css`:

```css
/* Opening crawl — see src/components/Crawl.jsx */
.crawl-stage {
  position: relative;
  height: 62vh;
  perspective: 340px;
  overflow: hidden;
  mask-image: linear-gradient(to top, transparent 4%, #000 34%, #000 72%, transparent 96%);
}
.crawl-track {
  position: absolute;
  inset: 0 auto auto 50%;
  width: min(680px, 84vw);
  transform-origin: 50% 100%;
  transform: translateX(-50%) rotateX(52deg);
  animation: crawl 18s linear forwards;
}
.crawl-copy {
  color: #FDD54F;
  font-size: clamp(20px, 3.2vw, 34px);
  font-weight: 700;
  line-height: 1.45;
  letter-spacing: .01em;
  text-align: justify;
}
@keyframes crawl {
  from { top: 100%; }
  to   { top: -220%; }
}
.crawl-skip {
  position: absolute;
  right: 16px; bottom: 12px;
  padding: 6px 10px;
  border: 1px solid rgba(195, 203, 221, .25);
  border-radius: 3px;
  background: transparent;
  cursor: pointer;
}
@media (prefers-reduced-motion: reduce) {
  .crawl-track { animation: none; top: 20%; transform: translateX(-50%); }
  .crawl-stage { perspective: none; mask-image: none; height: auto; }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test src/components/Crawl.test.jsx`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add src/components/Crawl.jsx src/components/Crawl.test.jsx src/index.css
git commit -m "feat: add opening crawl with reduced-motion fallback"
```

---

### Task 8: The split faction choice

**Files:**
- Create: `src/faction/FactionChoice.jsx`, `src/faction/FactionChoice.test.jsx`

**Interfaces:**
- Consumes: `useFaction` (Task 5); `factionLabel`, `factionSchool`, `FACTIONS` (Task 2). Optionally `submitCheer` (Task 12) — until Task 12 lands, `onCheer` defaults to a no-op.
- Produces: `<FactionChoice onCheer={(faction) => void} />`.

- [ ] **Step 1: Write the failing test**

`src/faction/FactionChoice.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FactionProvider } from './FactionContext'
import FactionChoice from './FactionChoice'

const setup = (props = {}) =>
  render(<FactionProvider><FactionChoice {...props} /></FactionProvider>)

describe('FactionChoice', () => {
  beforeEach(() => window.localStorage.clear())

  it('offers both schools', () => {
    setup()
    expect(screen.getByRole('button', { name: /UTMIST/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /WAT\.ai/i })).toBeInTheDocument()
  })

  it('themes the document when a side is chosen', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: /WAT\.ai/i }))
    expect(document.documentElement.getAttribute('data-faction')).toBe('watai')
  })

  it('reports the cheer to its caller', async () => {
    const onCheer = vi.fn()
    const user = userEvent.setup()
    setup({ onCheer })
    await user.click(screen.getByRole('button', { name: /UTMIST/i }))
    expect(onCheer).toHaveBeenCalledWith('utmist')
  })

  it('marks the chosen side as pressed for assistive technology', async () => {
    const user = userEvent.setup()
    setup()
    const utmist = screen.getByRole('button', { name: /UTMIST/i })
    expect(utmist).toHaveAttribute('aria-pressed', 'false')
    await user.click(utmist)
    expect(utmist).toHaveAttribute('aria-pressed', 'true')
  })

  it('is operable by keyboard', async () => {
    const user = userEvent.setup()
    setup()
    await user.tab()
    expect(screen.getByRole('button', { name: /UTMIST/i })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(document.documentElement.getAttribute('data-faction')).toBe('utmist')
  })

  it('lets the visitor switch sides', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: /UTMIST/i }))
    await user.click(screen.getByRole('button', { name: /WAT\.ai/i }))
    expect(document.documentElement.getAttribute('data-faction')).toBe('watai')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test src/faction/FactionChoice.test.jsx`
Expected: FAIL — cannot resolve `./FactionChoice`.

- [ ] **Step 3: Implement**

`src/faction/FactionChoice.jsx`:

```jsx
import { useFaction } from './FactionContext'
import { FACTIONS, factionLabel, factionSchool } from '../theme/tokens'

/**
 * The polarised moment: two territories, one choice.
 *
 * Note the asymmetry — UTMIST's side paints with `uoft` (#1E3765) as a
 * SURFACE and `signal` (#8BA7DA) as its foreground, because #1E3765 is
 * illegible as text on the void. WAT.ai's gold serves both roles. Do not
 * "simplify" this into one colour per faction.
 *
 * Choosing is never required to use the site.
 */
const SIDE = {
  utmist: {
    surface: 'bg-uoft/40 hover:bg-uoft/60 border-signal/40',
    ink: 'text-signal',
  },
  watai: {
    surface: 'bg-waterloo/10 hover:bg-waterloo/20 border-waterloo/40',
    ink: 'text-waterloo',
  },
}

export default function FactionChoice({ onCheer }) {
  const { faction, choose } = useFaction()

  const pick = (side) => {
    choose(side)
    onCheer?.(side)
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl mx-auto">
      {FACTIONS.map((side) => (
        <button
          key={side}
          type="button"
          aria-pressed={faction === side}
          onClick={() => pick(side)}
          className={`group rounded-lg border p-6 text-left transition-colors duration-300 ${SIDE[side].surface} ${
            faction === side ? 'ring-1 ring-accent' : ''
          }`}
        >
          <span className="block font-mono text-[10px] uppercase tracking-[.28em] text-muted">
            {factionSchool[side]}
          </span>
          <span className={`mt-2 block font-display text-2xl font-bold uppercase ${SIDE[side].ink}`}>
            {factionLabel[side]}
          </span>
          <span className="mt-3 block font-mono text-[10px] uppercase tracking-[.2em] text-muted group-hover:text-accent">
            {faction === side ? 'Standing with them' : 'Cheer them on →'}
          </span>
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test src/faction/FactionChoice.test.jsx`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/faction/FactionChoice.jsx src/faction/FactionChoice.test.jsx
git commit -m "feat: add split faction choice"
```

---

### Task 9: Cursor glow

**Files:**
- Create: `src/faction/CursorGlow.jsx`, `src/faction/CursorGlow.test.jsx`
- Modify: `src/index.css`

**Interfaces:**
- Produces: `<CursorGlow />` — renders `null` on coarse pointers or under reduced motion.

- [ ] **Step 1: Write the failing test**

`src/faction/CursorGlow.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import CursorGlow from './CursorGlow'

function mockMedia({ reduce = false, coarse = false } = {}) {
  window.matchMedia = vi.fn().mockImplementation((q) => ({
    matches: q.includes('prefers-reduced-motion') ? reduce
           : q.includes('pointer: coarse') ? coarse : false,
    media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }))
}

describe('CursorGlow', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('renders on a fine pointer with motion allowed', () => {
    mockMedia()
    const { container } = render(<CursorGlow />)
    expect(container.querySelector('[data-cursor-glow]')).toBeInTheDocument()
  })

  it('renders nothing on touch devices', () => {
    mockMedia({ coarse: true })
    const { container } = render(<CursorGlow />)
    expect(container.querySelector('[data-cursor-glow]')).toBeNull()
  })

  it('renders nothing under prefers-reduced-motion', () => {
    mockMedia({ reduce: true })
    const { container } = render(<CursorGlow />)
    expect(container.querySelector('[data-cursor-glow]')).toBeNull()
  })

  it('is inert and hidden from assistive technology', () => {
    mockMedia()
    const { container } = render(<CursorGlow />)
    const glow = container.querySelector('[data-cursor-glow]')
    expect(glow).toHaveAttribute('aria-hidden', 'true')
    expect(glow.className).toMatch(/pointer-events-none/)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test src/faction/CursorGlow.test.jsx`
Expected: FAIL — cannot resolve `./CursorGlow`.

- [ ] **Step 3: Implement**

`src/faction/CursorGlow.jsx`:

```jsx
import { useEffect, useRef, useState } from 'react'

/**
 * A soft glow in the current faction accent that follows the pointer.
 *
 * Purely decorative, and deliberately additive: the native cursor is never
 * hidden, the element never receives pointer events, and it renders nothing
 * at all on touch devices or under prefers-reduced-motion. Removing it costs
 * the site no function.
 */
export default function CursorGlow() {
  const ref = useRef(null)

  // Lazy initialiser, not setState inside an effect: this repo's
  // eslint-plugin-react-hooks 7.x sets react-hooks/set-state-in-effect to error.
  const [enabled] = useState(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const coarse = window.matchMedia('(pointer: coarse)').matches
    return !reduce && !coarse
  })

  useEffect(() => {
    if (!enabled) return
    let frame = 0
    let x = 0
    let y = 0

    const onMove = (event) => {
      x = event.clientX
      y = event.clientY
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const node = ref.current
        if (node) node.style.transform = `translate3d(${x}px, ${y}px, 0)`
      })
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [enabled])

  if (!enabled) return null

  return <div ref={ref} data-cursor-glow aria-hidden="true" className="cursor-glow pointer-events-none" />
}
```

- [ ] **Step 4: Add the glow CSS**

Append to `src/index.css`:

```css
/* Cursor glow — see src/faction/CursorGlow.jsx. Never replaces the native cursor. */
.cursor-glow {
  position: fixed;
  top: 0; left: 0;
  width: 260px; height: 260px;
  margin: -130px 0 0 -130px;
  border-radius: 9999px;
  z-index: 5;
  background: radial-gradient(circle, var(--accent) 0%, transparent 62%);
  opacity: .10;
  mix-blend-mode: screen;
  will-change: transform;
}
```

- [ ] **Step 5: Mount and verify**

Add `<CursorGlow />` inside the `FactionProvider` in `src/App.jsx`, as a sibling of the router.

Run: `npm test && npm run lint && npm run build`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/faction/CursorGlow.jsx src/faction/CursorGlow.test.jsx src/index.css src/App.jsx
git commit -m "feat: add faction-tinted cursor glow"
```

---

### Task 10: Restyle the sections, with sponsors explicitly exempt

**Files:**
- Modify: `src/components/Hero.jsx`, `src/components/About.jsx`, `src/components/OrgSpotlight.jsx`, `src/components/Sponsors.jsx`, `src/components/Faq.jsx`, `src/components/Navbar.jsx`, `src/components/Footer.jsx`, `src/pages/LandingPage.jsx`
- Create: `src/components/Sponsors.test.jsx`
- Delete: `src/components/Hero_old.jsx`, `src/components/Hero_old_utf8.jsx`
- Modify: `eslint.config.js`

**Interfaces:**
- Consumes: `Crawl` (Task 7), `FactionChoice` (Task 8), `useFaction` (Task 5), `sponsors` (existing).

- [ ] **Step 1: Write the failing test**

`src/components/Sponsors.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FactionProvider } from '../faction/FactionContext'
import Sponsors from './Sponsors'
import { sponsors } from '../data/sponsors'

const setup = () => render(<FactionProvider><Sponsors /></FactionProvider>)

describe('Sponsors', () => {
  it('renders every sponsor', () => {
    setup()
    for (const s of sponsors) {
      expect(screen.getByAltText(`${s.name} logo`)).toBeInTheDocument()
    }
  })

  it('links each sponsor out safely', () => {
    setup()
    for (const s of sponsors) {
      const link = screen.getByRole('link', { name: new RegExp(s.name, 'i') })
      expect(link).toHaveAttribute('href', s.url)
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
    }
  })

  // Sponsor marks carry their own brand colours — Shopify's greens,
  // Accenture's purple. A faction wash would corrupt them.
  it('never applies the faction accent to a sponsor card', () => {
    const { container } = setup()
    const section = container.querySelector('#sponsors')
    expect(section.querySelectorAll('[class*="accent"]')).toHaveLength(0)
  })

  it('no longer advertises sponsors as coming soon', () => {
    setup()
    expect(screen.queryByText(/coming soon/i)).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test src/components/Sponsors.test.jsx`
Expected: FAIL — `Sponsors.jsx` still uses `glass-panel` and colour tokens deleted in Task 3, and its links have no accessible name matching the sponsor.

- [ ] **Step 3: Rebuild the Hero**

Replace the body of `src/components/Hero.jsx` with a three-beat structure. Remove the `handImg` import, the two `blur-[120px]` pulsing orbs, the `network-pattern` overlay, and the `backdrop-blur` glass card — the starfield is the background now.

```jsx
import { useState } from 'react'
import Crawl from './Crawl'
import FactionChoice from '../faction/FactionChoice'

const CRAWL_COPY =
  'Two schools. Thirty-six hours. One arena. UTMIST and WAT.ai send their ' +
  'finest builders to settle it the only way that matters — in code.'

export default function Hero() {
  const [introDone, setIntroDone] = useState(false)

  return (
    <section className="relative min-h-[92vh] flex flex-col items-center justify-center py-16">
      <div className="relative z-10 mx-auto w-full max-w-5xl px-gutter text-center">
        {!introDone && <Crawl text={CRAWL_COPY} onDone={() => setIntroDone(true)} />}

        {introDone && (
          <>
            <p className="font-mono text-[10px] uppercase tracking-[.3em] text-waterloo">
              Toronto, Ontario · Late Summer 2026
            </p>
            <h1 className="mt-5 font-display text-5xl sm:text-7xl font-bold uppercase leading-[0.95] text-ink">
              Battle of<br />the <span className="text-accent">Schools</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl font-sans text-base leading-relaxed text-muted">
              Two schools. Thirty-six hours. One arena.
            </p>
            <div className="mt-12">
              <p className="mb-4 font-mono text-[10px] uppercase tracking-[.28em] text-muted">
                Pick a side
              </p>
              <FactionChoice />
            </div>
          </>
        )}
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Restyle the remaining sections**

Apply these substitutions across `About.jsx`, `OrgSpotlight.jsx`, `Sponsors.jsx`, `Faq.jsx`, `Navbar.jsx`, `Footer.jsx`:

| Remove | Replace with |
|---|---|
| `glass-panel`, `glass-panel-blue`, `glass-panel-gold` | `border border-signal/15 bg-uoft/20 rounded-lg` |
| `glow-text-blue`, `glow-text-gold`, `glow-text-mixed` | nothing |
| `network-pattern` overlays | nothing — the starfield is the background |
| `text-primary`, `text-primary-fixed-dim` | `text-accent` |
| `text-on-surface-variant`, `text-outline` | `text-muted` |
| `text-white` | `text-ink` |
| `bg-surface-container-lowest`, `bg-surface-container` | `bg-uoft/20` |
| `font-display` on body copy | `font-sans` |
| `backdrop-blur-*` | nothing |
| The `NN // SECTION` chip `<div>` at the top of every section | delete the element; keep the `<h2>` |

**In `Sponsors.jsx` specifically:** the sponsor `<section>` and everything inside it must use `text-muted` and `text-waterloo` — never `text-accent`, `bg-accent`, or `border-accent`. Add this comment above the section so the exemption survives future edits:

```jsx
{/* Sponsor marks carry their own brand colours (Shopify greens, Accenture
    purple). This section opts out of faction theming deliberately — do not
    introduce `accent` utilities here. */}
```

Also add an accessible name to each sponsor link so the test can find it: the existing `aria-label={`${sponsor.name} - visit website`}` already satisfies this — keep it.

**In `OrgSpotlight.jsx`:** keep the existing `activeOrg` toggle and stat data. Recolour so the UTMIST panel uses `bg-uoft/40` with `text-signal`, and the WAT.ai panel uses `bg-waterloo/10` with `text-waterloo`.

- [ ] **Step 5: Delete the dead files and their lint exemption**

```bash
git rm src/components/Hero_old.jsx src/components/Hero_old_utf8.jsx
```

In `eslint.config.js`, change `globalIgnores(['dist', 'src/components/Hero_old*.jsx'])` to `globalIgnores(['dist'])` — the exemption exists only for files that no longer exist.

- [ ] **Step 6: Run the full suite**

Run: `npm test && npm run lint && npm run build`
Expected: all PASS. Then open `http://localhost:5173/` and confirm: the crawl plays and can be skipped; both faction buttons theme the page; sponsor logos are untinted in all three states.

- [ ] **Step 7: Commit**

```bash
git add -A src/components src/pages eslint.config.js
git commit -m "feat: restyle landing sections to the Deep Field identity"
```

---

### Task 11: Cheer tracker — database and Edge Function

> Tasks 11–13 implement the tracker. They can be dropped wholesale if the public-tally sign-off does not arrive; Tasks 1–10 stand alone.

**Files:**
- Create: `supabase/migrations/202608250001_faction_cheers.sql`, `supabase/functions/faction-cheer/index.ts`

**Interfaces:**
- Produces: `POST /functions/v1/faction-cheer` with `{ faction, turnstileToken }` → `{ utmist: number, watai: number }`; `GET` the same path → the same shape. Task 12 consumes both.

- [ ] **Step 1: Write the migration**

`supabase/migrations/202608250001_faction_cheers.sql`:

```sql
-- Cheer tally for the Battle of the Schools faction split.
--
-- The browser never reaches this table. RLS is on with NO anon policies;
-- all access goes through the faction-cheer Edge Function under the service
-- role, which is also where Turnstile verification and IP hashing happen.

create table public.faction_cheers (
  id           uuid primary key default gen_random_uuid(),
  faction      text not null check (faction in ('utmist', 'watai')),
  visitor_hash text not null,
  created_at   timestamptz not null default now()
);

-- One cheer per visitor. Server-side dedup; a client-side guard is not a defence.
create unique index faction_cheers_visitor_uniq
  on public.faction_cheers (visitor_hash);

create index faction_cheers_faction_idx
  on public.faction_cheers (faction);

alter table public.faction_cheers enable row level security;

-- Intentionally no policies: nothing reaches this table with the anon key.

revoke all on public.faction_cheers from anon, authenticated;
```

- [ ] **Step 2: Write the Edge Function**

`supabase/functions/faction-cheer/index.ts`:

```ts
// Owns all access to public.faction_cheers. The browser never touches the
// table directly. Verifies Turnstile, derives the visitor hash server-side
// from the request IP (never from anything the client sends, because anything
// the client sends can be forged), and returns aggregate counts only.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const FACTIONS = ['utmist', 'watai'] as const
type Faction = (typeof FACTIONS)[number]

const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

async function hashVisitor(ip: string): Promise<string> {
  // Salt rotates daily so the hash is not a durable identifier.
  const salt = Deno.env.get('CHEER_HASH_SALT') ?? ''
  const day = new Date().toISOString().slice(0, 10)
  const data = new TextEncoder().encode(`${ip}|${day}|${salt}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const secret = Deno.env.get('TURNSTILE_SECRET_KEY')
  if (!secret) return false
  const body = new FormData()
  body.append('secret', secret)
  body.append('response', token)
  body.append('remoteip', ip)
  const res = await fetch(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    { method: 'POST', body },
  )
  const result = await res.json()
  return result.success === true
}

async function tally(): Promise<Record<Faction, number>> {
  const counts = { utmist: 0, watai: 0 }
  for (const faction of FACTIONS) {
    const { count, error } = await admin
      .from('faction_cheers')
      .select('*', { count: 'exact', head: true })
      .eq('faction', faction)
    if (error) throw error
    counts[faction] = count ?? 0
  }
  return counts
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('cf-connecting-ip') ??
    'unknown'

  try {
    if (req.method === 'GET') return json(await tally())

    if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

    const { faction, turnstileToken } = await req.json()

    if (!FACTIONS.includes(faction)) return json({ error: 'unknown faction' }, 400)
    if (!turnstileToken) return json({ error: 'captcha required' }, 400)
    if (!(await verifyTurnstile(turnstileToken, ip)))
      return json({ error: 'captcha failed' }, 403)

    const visitor_hash = await hashVisitor(ip)

    // Unique index makes a repeat cheer a no-op rather than a double count.
    const { error } = await admin
      .from('faction_cheers')
      .insert({ faction, visitor_hash })

    if (error && error.code !== '23505') throw error

    return json(await tally())
  } catch (err) {
    console.error('faction-cheer failed', err)
    return json({ error: 'internal error' }, 500)
  }
})
```

- [ ] **Step 3: Document the required secrets**

Append to `README.md` under the Supabase section:

```markdown
### Faction cheer tracker

Apply `supabase/migrations/202608250001_faction_cheers.sql`, then deploy the
`faction-cheer` Edge Function. It needs:

```bash
SUPABASE_SERVICE_ROLE_KEY=...
TURNSTILE_SECRET_KEY=...
CHEER_HASH_SALT=<any long random string>
ALLOWED_ORIGIN=https://<production-domain>
```

The `faction_cheers` table has RLS enabled with no policies — it is
unreachable with the anon key by design. All access goes through the
function under the service role.
```

- [ ] **Step 4: Verify the table is unreachable from the client**

Run this against the linked project after applying the migration:

```bash
npx supabase db push
```

Then confirm with a quick script that a select using the anon key returns no rows and no data (permission denied or empty), not the table contents.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/202608250001_faction_cheers.sql supabase/functions/faction-cheer/index.ts README.md
git commit -m "feat: add faction cheer table and edge function"
```

---

### Task 12: Cheer client

**Files:**
- Create: `src/cheer/cheerClient.js`, `src/cheer/cheerClient.test.js`

**Interfaces:**
- Produces:
  - `fetchTally() => Promise<{ utmist: number, watai: number }>`
  - `submitCheer({ faction, turnstileToken }) => Promise<{ utmist, watai }>`
  - Both return `{ utmist: 0, watai: 0 }` rather than throwing when the tracker is unconfigured or unreachable, so the page never breaks over a decorative counter. Task 13 consumes both.

- [ ] **Step 1: Write the failing test**

`src/cheer/cheerClient.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchTally, submitCheer } from './cheerClient'

describe('cheerClient', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()) })
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('returns the tally on success', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ utmist: 7, watai: 5 }) })
    await expect(fetchTally()).resolves.toEqual({ utmist: 7, watai: 5 })
  })

  it('returns zeroes rather than throwing when the network fails', async () => {
    fetch.mockRejectedValue(new Error('offline'))
    await expect(fetchTally()).resolves.toEqual({ utmist: 0, watai: 0 })
  })

  it('returns zeroes rather than throwing on a server error', async () => {
    fetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    await expect(fetchTally()).resolves.toEqual({ utmist: 0, watai: 0 })
  })

  it('posts the faction and captcha token', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ utmist: 1, watai: 0 }) })
    await submitCheer({ faction: 'utmist', turnstileToken: 'tok' })
    const [, init] = fetch.mock.calls[0]
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ faction: 'utmist', turnstileToken: 'tok' })
  })

  it('refuses an unknown faction without calling the network', async () => {
    await expect(submitCheer({ faction: 'mit', turnstileToken: 't' }))
      .resolves.toEqual({ utmist: 0, watai: 0 })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('coerces malformed counts to zero', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ utmist: 'lots' }) })
    await expect(fetchTally()).resolves.toEqual({ utmist: 0, watai: 0 })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test src/cheer/cheerClient.test.js`
Expected: FAIL — cannot resolve `./cheerClient`.

- [ ] **Step 3: Implement**

`src/cheer/cheerClient.js`:

```js
import { FACTIONS } from '../theme/tokens'

const EMPTY = { utmist: 0, watai: 0 }

function endpoint() {
  const base = import.meta.env.VITE_SUPABASE_URL
  return base ? `${base}/functions/v1/faction-cheer` : null
}

function normalise(payload) {
  const out = { ...EMPTY }
  for (const faction of FACTIONS) {
    const value = payload?.[faction]
    out[faction] = Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
  }
  return out
}

/**
 * The tally is decorative. Every failure path returns zeroes instead of
 * throwing, so an unconfigured or unreachable tracker degrades to an empty
 * bar rather than breaking the page.
 */
export async function fetchTally() {
  const url = endpoint()
  if (!url) return { ...EMPTY }
  try {
    const res = await fetch(url, { method: 'GET' })
    if (!res.ok) return { ...EMPTY }
    return normalise(await res.json())
  } catch {
    return { ...EMPTY }
  }
}

export async function submitCheer({ faction, turnstileToken }) {
  const url = endpoint()
  if (!url || !FACTIONS.includes(faction)) return { ...EMPTY }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ faction, turnstileToken }),
    })
    if (!res.ok) return { ...EMPTY }
    return normalise(await res.json())
  } catch {
    return { ...EMPTY }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test src/cheer/cheerClient.test.js`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/cheer/cheerClient.js src/cheer/cheerClient.test.js
git commit -m "feat: add cheer client that degrades to zero on failure"
```

---

### Task 13: Tug-of-war bar

Territory, not a scoreboard — a lopsided split reads as a contested border rather than a defeat.

**Files:**
- Create: `src/cheer/TugOfWar.jsx`, `src/cheer/TugOfWar.test.jsx`
- Modify: `src/components/OrgSpotlight.jsx`, `src/faction/FactionChoice.jsx`

**Interfaces:**
- Consumes: `fetchTally`, `submitCheer` (Task 12); `useFaction` (Task 5).
- Produces: `<TugOfWar />`.

- [ ] **Step 1: Write the failing test**

`src/cheer/TugOfWar.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { FactionProvider } from '../faction/FactionContext'
import TugOfWar from './TugOfWar'

vi.mock('./cheerClient', () => ({
  fetchTally: vi.fn(),
  submitCheer: vi.fn(),
}))
import { fetchTally } from './cheerClient'

const setup = () => render(<FactionProvider><TugOfWar /></FactionProvider>)

describe('TugOfWar', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('splits the bar in proportion to the tally', async () => {
    fetchTally.mockResolvedValue({ utmist: 75, watai: 25 })
    setup()
    await waitFor(() => {
      expect(screen.getByTestId('tug-utmist')).toHaveStyle({ width: '75%' })
    })
  })

  it('sits at an even split when nobody has cheered', async () => {
    fetchTally.mockResolvedValue({ utmist: 0, watai: 0 })
    setup()
    await waitFor(() => {
      expect(screen.getByTestId('tug-utmist')).toHaveStyle({ width: '50%' })
    })
  })

  // Territory, never a scoreline: a side that is losing badly still holds ground.
  it('never lets either side fall below a visible floor', async () => {
    fetchTally.mockResolvedValue({ utmist: 1000, watai: 1 })
    setup()
    await waitFor(() => {
      const width = parseFloat(screen.getByTestId('tug-utmist').style.width)
      expect(width).toBeLessThanOrEqual(90)
      expect(width).toBeGreaterThanOrEqual(10)
    })
  })

  it('does not show raw counts', async () => {
    fetchTally.mockResolvedValue({ utmist: 75, watai: 25 })
    setup()
    await waitFor(() => expect(screen.getByTestId('tug-utmist')).toBeInTheDocument())
    expect(screen.queryByText('75')).toBeNull()
    expect(screen.queryByText('25')).toBeNull()
  })

  it('exposes the split to assistive technology', async () => {
    fetchTally.mockResolvedValue({ utmist: 60, watai: 40 })
    setup()
    await waitFor(() => {
      const bar = screen.getByRole('meter')
      expect(bar).toHaveAttribute('aria-valuenow', '60')
      expect(bar).toHaveAttribute('aria-valuemin', '0')
      expect(bar).toHaveAttribute('aria-valuemax', '100')
    })
  })

  it('renders an even split when the tracker is unreachable', async () => {
    fetchTally.mockResolvedValue({ utmist: 0, watai: 0 })
    setup()
    await waitFor(() => {
      expect(screen.getByTestId('tug-utmist')).toHaveStyle({ width: '50%' })
    })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test src/cheer/TugOfWar.test.jsx`
Expected: FAIL — cannot resolve `./TugOfWar`.

- [ ] **Step 3: Implement**

`src/cheer/TugOfWar.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { fetchTally } from './cheerClient'
import { factionLabel } from '../theme/tokens'

/** Neither side ever drops below this, so the bar reads as contested
 *  territory rather than a scoreline. */
const FLOOR = 10

export default function TugOfWar() {
  const [tally, setTally] = useState({ utmist: 0, watai: 0 })

  useEffect(() => {
    let alive = true
    fetchTally().then((next) => { if (alive) setTally(next) })
    return () => { alive = false }
  }, [])

  const total = tally.utmist + tally.watai
  const raw = total === 0 ? 50 : (tally.utmist / total) * 100
  const share = Math.min(100 - FLOOR, Math.max(FLOOR, raw))

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-2 flex justify-between font-mono text-[10px] uppercase tracking-[.24em]">
        <span className="text-signal">{factionLabel.utmist}</span>
        <span className="text-waterloo">{factionLabel.watai}</span>
      </div>
      <div
        role="meter"
        aria-valuenow={Math.round(raw)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Share of cheers for UTMIST versus WAT.ai"
        className="flex h-3 w-full overflow-hidden rounded-full border border-signal/20"
      >
        <div
          data-testid="tug-utmist"
          className="h-full bg-signal transition-[width] duration-700 ease-out"
          style={{ width: `${share}%` }}
        />
        <div
          data-testid="tug-watai"
          className="h-full bg-waterloo transition-[width] duration-700 ease-out"
          style={{ width: `${100 - share}%` }}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Wire the cheer through**

In `src/components/OrgSpotlight.jsx`, render `<TugOfWar />` beneath the org panels.

In `src/faction/FactionChoice.jsx`, change the default `onCheer` so a pick submits. Import `submitCheer` from `../cheer/cheerClient` and call it inside `pick`, after `choose(side)`. Turnstile token wiring reuses the existing `@marsidev/react-turnstile` integration; until a token is available, `submitCheer` returns zeroes and the bar simply does not move — the theming still works.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test && npm run lint && npm run build`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/cheer src/components/OrgSpotlight.jsx src/faction/FactionChoice.jsx
git commit -m "feat: add tug-of-war territory bar"
```

---

### Task 14: Final verification

**Files:** none created; this task only verifies and records.

- [ ] **Step 1: Full automated suite**

Run: `npm test && npm run lint && npm run build`
Expected: every test passes, zero lint errors, build succeeds.

- [ ] **Step 2: Confirm the weight drop**

```bash
du -sh dist
ls dist/assets | grep -E 'background' && echo "FAIL: background.png still shipping" || echo "OK: background.png gone"
ls dist/assets | grep -E 'hand' && echo "OK: hand.png present as intended" || echo "FAIL: hand.png missing"
```

Expected: `background.png` gone, `hand.png` present, and `dist` roughly 3.86 MB smaller than at tag `pre-redesign`. (`hand.png` is kept at the user's direction — see spec §7.6.)

- [ ] **Step 3: Manual pass at `http://localhost:5173/`**

Confirm each, and fix anything that fails before finishing:

- The neutral state is complete and readable without choosing a side.
- Both faction buttons theme the whole page; the choice survives a reload.
- Sponsor logos are untinted in all three states (neutral, utmist, watai).
- The crawl plays, and "Skip intro" works.
- `/apply` still loads and is unchanged.

- [ ] **Step 4: Reduced-motion pass**

Enable *System Settings → Accessibility → Display → Reduce motion* on macOS, reload, and confirm: the crawl renders as static text, the starfield does not parallax on scroll, and no cursor glow appears.

- [ ] **Step 5: Storage-blocked pass**

Open the site in a private window with site data blocked. Confirm the page renders, a faction can still be chosen for the session, and nothing throws in the console.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: final verification pass for the faction identity redesign"
```

---

## Self-Review

**Spec coverage.** Every section maps to a task: §4 colour → Tasks 2–3; §5 void → Task 6; §6 crawl → Task 7; §7.1 neutral → Tasks 5, 8; §7.2 choosing → Tasks 4, 5, 8; §7.3 theming → Tasks 3, 5; §7.4 sponsor exemption → Task 10; §7.5 cursor → Task 9; §8 tracker → Tasks 11–13; §9 sections and deletions → Tasks 6, 10; §10 accessibility → Tasks 2, 6, 7, 9, 14; §12 verification → Task 14. No gaps.

**Placeholder scan.** No TBDs, no "add error handling", no "similar to Task N". Every code step carries the actual code.

**Type consistency.** `readFaction`/`writeFaction`/`clearFaction` are defined in Task 4 and consumed under those exact names in Task 5. `useFaction` returns `{ faction, hasChosen, choose, clear }` in Task 5 and is destructured with those names in Tasks 8 and 13. `fetchTally`/`submitCheer` are defined in Task 12 and consumed under those names in Task 13. `palette`, `FACTIONS`, `factionAccent`, `NEUTRAL_ACCENT`, `factionLabel`, `factionSchool` are all defined in Task 2 and imported by exact name in Tasks 3, 4, 8, 12, 13.

**One ordering note for the executor.** Task 3 deletes CSS classes that Tasks 6, 7 and 10 replace usages of. Between Task 3 and Task 10 the page will look broken in the browser while `npm run build` still succeeds. This is expected; do not "fix" it early by reintroducing the deleted classes.
