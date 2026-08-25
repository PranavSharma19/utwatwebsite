import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import postcss from 'postcss'
import tailwindcss from 'tailwindcss'
import config from '../../tailwind.config.js'

/**
 * The guard for an entire class of silent breakage.
 *
 * Deleting a colour from tailwind.config.js does not fail a build, a lint or
 * a test — it just stops emitting the utilities that referenced it, and the
 * affected pages render with inherited colour and no fills. That is how the
 * live admissions portal at /apply ended up unstyled: it was out of scope for
 * the redesign, nobody edited it, and the shared token layer underneath it
 * was removed. "Out of scope" is not the same as "unaffected".
 *
 * So: compile the real config against the real sources, then take every
 * colour-shaped utility the codebase actually writes and require that the
 * stylesheet contains a rule for it. Catches deleted tokens, typo'd token
 * names, and colours declared in a form that cannot take an opacity modifier
 * (a bare `var(--x)`, which drops every `-name/NN` variant on the floor).
 */

const ROOT = path.resolve(import.meta.dirname, '../..')

const PREFIXES = [
  'bg', 'text', 'border', 'from', 'to', 'via', 'ring', 'shadow',
  'placeholder', 'divide', 'fill', 'stroke', 'caret', 'accent',
  'outline', 'decoration',
]

// `name` may be multi-segment (`surface-container-lowest`, `emerald-400`) and
// may carry an opacity modifier (`/40`). Arbitrary values (`text-[10px]`,
// `bg-[#11131c]/75`) are excluded: they cannot reference a missing token.
const CLASS_RE = new RegExp(
  `(?<![\\w-])(${PREFIXES.join('|')})-([a-z][a-z0-9]*(?:-[a-z0-9]+)*)(\\/\\d{1,3})?(?![\\w[-])`,
  'g',
)

function sourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) sourceFiles(full, out)
    // Test files are excluded: they talk *about* class names as often as they
    // use them, and Tailwind does not scan them either.
    else if (/\.(jsx|js)$/.test(entry.name) && !/\.test\./.test(entry.name)) out.push(full)
  }
  return out
}

/** `.bg-accent\/5`, `.hover\:bg-accent\/5:hover`, `.sm\:text-lg` all count. */
function isEmitted(css, className) {
  const escaped = className
    .replace(/\//g, '\\/')
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`[.:\\\\]${escaped}(?![\\w-])`).test(css)
}

const compiled = await postcss([tailwindcss(config)])
  .process('@tailwind utilities;', { from: undefined })
  .then((result) => result.css)

const files = [...sourceFiles(path.join(ROOT, 'src')), path.join(ROOT, 'index.html')]

const used = new Map()
for (const file of files) {
  for (const match of readFileSync(file, 'utf8').matchAll(CLASS_RE)) {
    if (!used.has(match[0])) used.set(match[0], new Set())
    used.get(match[0]).add(path.relative(ROOT, file))
  }
}

describe('every colour utility the codebase writes actually compiles', () => {
  it('finds classes to check at all (so a broken scanner cannot pass silently)', () => {
    expect(used.size).toBeGreaterThan(100)
    expect(compiled.length).toBeGreaterThan(10_000)
  })

  it('emits a rule for each one', () => {
    const missing = [...used]
      .filter(([className]) => !isEmitted(compiled, className))
      .map(([className, where]) => `${className}  (${[...where].join(', ')})`)
      .sort()

    expect(
      missing,
      'These classes resolve to no CSS at all. Either the token was removed ' +
        'from tailwind.config.js while something still referenced it, or it ' +
        'is declared in a form that cannot take an opacity modifier.',
    ).toEqual([])
  })

  it('still covers the admissions portal, which no redesign task may edit', () => {
    // The portal is the reason this test exists. If it ever stops being
    // scanned, the guard has quietly lapsed.
    const scanned = new Set([...used].flatMap(([, where]) => [...where]))
    expect([...scanned].some((f) => f.startsWith('src/admissions/'))).toBe(true)
    expect([...scanned].some((f) => f.startsWith('src/pages/Admissions'))).toBe(true)
    expect(scanned.has('index.html')).toBe(true)
  })

  it('would fail if a referenced token were deleted', () => {
    // Proves the assertion above has teeth rather than passing vacuously.
    const withoutPrimary = { ...config, theme: { ...config.theme, extend: {
      ...config.theme.extend,
      colors: Object.fromEntries(
        Object.entries(config.theme.extend.colors).filter(([k]) => k !== 'primary'),
      ),
    } } }
    return postcss([tailwindcss(withoutPrimary)])
      .process('@tailwind utilities;', { from: undefined })
      .then(({ css }) => {
        expect(isEmitted(compiled, 'text-primary')).toBe(true)
        expect(isEmitted(css, 'text-primary')).toBe(false)
      })
  })
})
