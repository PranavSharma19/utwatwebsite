# Battle of the Schools — Faction Identity Redesign

**Date:** 2026-08-25
**Branch:** `redesign/horizontal-starwars`
**Revert point:** tag `pre-redesign` (commit `139f6fc` on `main`)
**Scope:** the public landing page (`/`) only. The admissions portal (`/apply`, `/apply/admin`) is out of scope.

---

## 1. Problem

The landing page is functional but reads as templated. This is diagnosable, not a vague impression:

- **Typography is default.** Inter for body and Sarabun for display, both generic. `tailwind.config.js:78` maps the `mono` slot to `["Inter", "monospace"]`, so every `font-mono` on the site renders in a sans-serif. There is no monospace on the site despite the design leaning on a technical aesthetic.
- **Effects are applied uniformly rather than chosen.** `glass-panel` + `backdrop-blur-2xl` + a blurred radial glow + a `hover:shadow-[0_0_30px_...]` appear on nearly every surface. `Hero.jsx` stacks four ambient effects (two `blur-[120px]` pulsing orbs, a dot-grid overlay, a blurred glass card) with none of them carrying meaning.
- **Every section opens identically** with an `NN // SECTION` mono chip above a centred heading and blurb. This repeated scaffold is the strongest single tell.
- **The design token file is a dump.** `tailwind.config.js` defines ~80 Material 3 colour tokens (`on-tertiary-fixed-variant`, `inverse-on-surface`, …); roughly eight are used.
- **Dead code ships alongside live code.** `Hero_old.jsx` and `Hero_old_utf8.jsx` are two-line stubs in `src/components/`.

By contrast, the sites used as benchmarks win on art direction and typography, not on interaction novelty:

| Site | Scroll axis | Custom `<img>` tags | Typography |
|---|---|---|---|
| Hack the Valley | vertical | 1628 | self-hosted VCR OSD Mono |
| Hack the 6ix | vertical | 462 | custom |
| Hack the North | vertical + parallax | not countable (SPA shell) | Castledown Heavy, Satoshi, Jersey 10, Pixelify Sans |
| **BOTS (current)** | vertical | **10** (3 are logos) | Inter + Sarabun |

None of the three scroll horizontally. Verified: Hack the Valley's `translateX(-54%)` centres an oversized gradient backdrop, not a scroll track; Hack the North's 641 KB bundle shows 22 parallax references, framer-motion and sticky positioning, with zero GSAP and zero scroll-snap; Hack the 6ix has no horizontal, scroll-snap, or wheel handlers at all.

**Conclusion: the gap is identity, not scroll axis.** A horizontal scroller built on the current foundation would be a novel way to navigate a site that still looks generic.

## 2. Goals

1. Give the site a distinctive visual identity that does not depend on illustration.
2. Make the UTMIST/WAT.ai rivalry structural rather than decorative.
3. Turn the landing page into something the visitor participates in.
4. Keep every change reversible and keep `/apply` untouched.

**Non-goal:** horizontal scrolling. It is deferred and re-evaluated after the identity exists (§11).

## 3. Locked decisions

| Decision | Choice | Rationale |
|---|---|---|
| Sequencing | Identity first, scroll axis later | Closes the measured gap; horizontal is the most expensive and least reversible piece |
| Art strategy | Code/type-led, zero image files | No illustration capacity. Star Wars' core imagery — starfields, receding text, wipes — is geometric and therefore code |
| Homage level | Overt, zero trademarks | Recognisably Star Wars-shaped; no Lucasfilm assets, names, or typefaces. The crawl's perspective effect is not protectable. Matters because the page carries Accenture and Shopify logos |
| Display type | Chakra Petch (700) | Selected from a three-way visual comparison |
| Body type | IBM Plex Sans (400/600) | |
| Mono type | IBM Plex Mono (400/500) | A real monospace, fixing the Inter-as-mono bug |
| Palette | "Deep Field" — the void | Selected from a three-way visual comparison |
| Tracker | Built together with the faction work | See §8 |

All four typefaces are OFL-licensed and self-hostable — no per-view licensing concerns with sponsor logos present.

## 4. Colour system

Institutional colours, verified against official brand guidelines:

- **UofT Blue `#1E3765`** (Pantone 655) — U of T's sole primary colour.
- **Waterloo Gold `#FDD54F`** (Gold/Yellow Level 3) — Waterloo's primary.

Measured contrast against the void ground, WCAG 2.1:

```
UofT Blue     #1E3765  on void #0A0C14 ......  1.66:1   FAIL
Signal Blue   #8BA7DA  on void #0A0C14 ......  8.03:1   AAA
Waterloo Gold #FDD54F  on void #0A0C14 ..... 13.77:1   AAA
Body ink      #E2E1EF  on void #0A0C14 ..... 15.11:1   AAA
Neutral       #C3CBDD  on void #0A0C14 ..... 12.00:1   AAA

Waterloo Gold #FDD54F  on UofT #1E3765 ......  8.27:1   AAA
Body ink      #E2E1EF  on UofT #1E3765 ......  9.08:1   AAA
Neutral       #C3CBDD  on UofT #1E3765 ......  7.21:1   AAA
```

**UofT Blue is a dark navy designed for white paper and is illegible as an accent on a dark ground.** It is therefore used as *ground and nebula*, never as foreground. A lightened derivative of the same hue, **Signal Blue `#8BA7DA`**, carries the blue faction in the foreground.

Consequence: the two factions are **not symmetrical in implementation**. Gold is a single token used everywhere; blue is two tokens with different roles. Any code that assumes a faction is one colour is wrong.

### Tokens

Replace the ~80-token Material dump with:

```js
void:     '#0A0C14',  // ground
uoft:     '#1E3765',  // UofT blue — nebula, surfaces, never foreground text
signal:   '#8BA7DA',  // lightened UofT blue — blue faction foreground
waterloo: '#FDD54F',  // Waterloo gold — gold faction, both roles
ink:      '#E2E1EF',  // body text
muted:    '#C3CBDD',  // secondary text and the neutral accent
```

## 5. The void

A `Starfield` component replaces the current background system:

- Layered parallax star fields built from CSS `radial-gradient` point stars, three depth layers at different scroll rates.
- Two nebulae as large radial gradients — UofT blue bleeding from one corner, Waterloo gold from the opposite — echoing the diagonal already present in `background.png`.
- Parallax disabled entirely under `prefers-reduced-motion: reduce`; the static field remains.

**This deletes `background.png` (3.86 MB) and `hand.png` (356 KB)** — 4.2 MB of images replaced by a few hundred bytes of CSS. The site currently ships a 3.8 MB background before anything renders.

## 6. The crawl

A `Crawl` component is the signature opening beat: text receding into the starfield on a CSS 3D `perspective` transform, resolving into the title.

- Wording and typeface are ours. Only the perspective effect is borrowed, and it is not protectable.
- Under `prefers-reduced-motion: reduce`, renders as a static block of text with no transform. Non-negotiable.
- Must be skippable — it never blocks access to the page content beneath it.

## 7. The faction system

The core interaction. The visitor arrives at a **polarised** page and leaves it **committed**.

### 7.1 Neutral state

Before a choice is made the page is genuinely split — UofT blue territory and Waterloo gold territory, with a lit seam. Chrome that must not favour a side uses the neutral accent `--accent: #C3CBDD`.

**The neutral state is fully designed and fully functional.** The site is never gated behind a faction choice: sponsors verifying their placement, press, prospective applicants heading to `/apply`, and anyone who simply wants the date and location must get everything without picking a team.

### 7.2 Choosing

Each side of the split hero carries a "cheer on" action. On selection:

1. The faction is written to React context (`FactionContext`).
2. Persisted to `localStorage` under `bots.faction`, wrapped in `try/catch` — private browsing and blocked site data both throw, and the site must render correctly with no stored value.
3. `data-faction="utmist" | "watai"` is set on the document element.
4. A cheer is recorded (§8).

The visitor may change sides. Only the first cheer counts toward the tally.

### 7.3 Theming

Theming is driven by CSS custom properties keyed off the root attribute, so no component needs to know the faction:

```css
:root                     { --accent: #C3CBDD; --accent-ink: #0A0C14; }
[data-faction="utmist"]   { --accent: #8BA7DA; --accent-ink: #0A0C14; }
[data-faction="watai"]    { --accent: #FDD54F; --accent-ink: #0A0C14; }
```

Tailwind exposes this as `accent: 'var(--accent)'`. The polarised split collapses to the chosen hue; the rivalry framing gives way to a single allegiance for the rest of the session.

Both faction accents are AAA on the void, so theming cannot push any text below contrast minimums. This must be re-verified whenever an accent value changes.

### 7.4 Sponsor exemption

**Sponsor logos and cards never take the faction accent.** Shopify's mark carries brand greens and Accenture's carries purple; a faction wash would corrupt brand assets. The sponsor wall opts out of `--accent` explicitly rather than by omission, so a future global change cannot silently tint it.

### 7.5 Cursor

A soft radial glow in `--accent` follows the pointer.

- **The native cursor is never hidden.** The glow is additive decoration behind it.
- `pointer-events: none` so it can never intercept input.
- Disabled under `prefers-reduced-motion: reduce` and on `(pointer: coarse)` — there is no cursor on touch devices.
- Purely decorative: it degrades to nothing with no loss of function.

## 8. The cheer tracker

### 8.1 Visualisation

A **tug-of-war bar**, not a scoreboard. The split is shown as territory — the boundary between blue and gold shifts with the tally. It never bottoms out and never displays a raw score, so a lopsided result reads as a contested border rather than a defeat.

This is a deliberate mitigation. Battle of the Schools is co-hosted, and a live public counter means one of the two host organisations may spend the run-up visibly losing on the homepage. The tug-of-war framing softens that; it does not remove it. Building it is decided. What remains is a **publishing** check: confirm both organisations are comfortable with a public tally before this section goes live on the production domain. The tracker is isolated in its own module so it can be removed without touching §7 if that confirmation does not arrive.

### 8.2 Data model

```sql
create table public.faction_cheers (
  id           uuid primary key default gen_random_uuid(),
  faction      text not null check (faction in ('utmist','watai')),
  visitor_hash text not null,
  created_at   timestamptz not null default now()
);

create unique index faction_cheers_visitor_uniq
  on public.faction_cheers (visitor_hash);

alter table public.faction_cheers enable row level security;
-- No anon policies. The table is unreachable from the client.
```

`visitor_hash` is computed **server-side** from the request IP plus a rotating salt. It is never supplied by the client, because anything the client supplies can be forged.

### 8.3 Access path

The client never talks to the table. A Supabase Edge Function (service role) — matching the existing `admin-applications` pattern — handles both directions:

- **Write:** verify the Cloudflare Turnstile token, derive `visitor_hash`, upsert, return the new tally.
- **Read:** return aggregate counts only. Individual rows are never exposed.

### 8.4 Abuse mitigation

Two rival CS schools and a public counter will be scripted against, quickly. Client-side guards are not a defence.

- Turnstile verification on every write — already integrated in this repo for the sign-in flow.
- Unique index on `visitor_hash` for server-side dedup.
- Per-IP rate limiting in the Edge Function.
- `localStorage` is a UX convenience only — it suppresses the prompt for returning visitors and is never treated as proof.

## 9. Section-by-section

| Section | Change |
|---|---|
| `Hero` | Rebuilt: crawl → split faction hero → title. `hand.png` and the four stacked ambient effects removed |
| `About` | Restyled to the new system; drop the `NN //` chip |
| `OrgSpotlight` | Reframed from a tab switcher into two opposing sides. `OrgSpotlight.jsx:8` already holds a UTMIST/WAT.ai toggle with per-org stats — the scaffolding exists and is reused |
| `Sponsors` | Restyled only. Data module and layout from `139f6fc` are correct and stay. **Exempt from faction theming** |
| `Faq` | Restyled; accordion behaviour unchanged |
| `Navbar` / `Footer` | Restyled; adopt `--accent` |

### Deleted

`hand.png`, `background.png`, `Hero_old.jsx`, `Hero_old_utf8.jsx`, the `glass-panel` / `glow-text` / `network-pattern` CSS block, and the repeated `NN // SECTION` chip.

## 10. Accessibility

Treated as acceptance criteria, not polish:

- Every text/background pair meets WCAG AA (4.5:1); the palette in §4 is already verified.
- `prefers-reduced-motion: reduce` disables the crawl animation, starfield parallax, and cursor glow. Every one has a static fallback.
- The cursor glow never replaces the native cursor and is absent on touch.
- The faction choice is reachable and operable by keyboard, with visible focus states.
- No content is gated behind choosing a faction.

## 11. Out of scope

- **Horizontal scrolling.** Deferred by decision. Re-evaluated once the identity exists. It would need a separate mobile story and a keyboard/accessibility layer, and `/apply` must stay vertical regardless.
- **`/apply` and `/apply/admin`.** Working functional code with its own security hardening; no reason to destabilise it.
- **Toralis Labs.** A confirmed sponsor with no usable asset. Adding an entry to `src/data/sponsors.js` puts them on the wall automatically.

## 12. Verification

- `npm run lint` clean.
- `npm run build` succeeds; confirm `background.png` and `hand.png` are absent from `dist/` and total asset weight drops by ~4.2 MB.
- Contrast re-checked for every text/background pair, in all three faction states (neutral, utmist, watai).
- Manual pass on `localhost:5173`: neutral state complete without choosing; theming persists across reloads; theming survives `localStorage` being unavailable; sponsor logos untinted in all three states.
- Reduced-motion pass with the OS setting enabled.
- Tracker: verify the table is unreachable with the anon key; verify a second cheer from the same `visitor_hash` does not double-count.

## 13. Rollback

```
git checkout main               # back to the working vertical site
git reset --hard pre-redesign   # discard the redesign entirely
```

Nothing is pushed. `UTMIST/utwat-website` is untouched until explicitly published.
