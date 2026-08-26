import { useEffect, useRef, useState } from 'react'
import { Turnstile } from '@marsidev/react-turnstile'
import { useFaction } from './FactionContext'
import { FACTIONS, factionClub, factionSchool, palette } from '../theme/tokens'
import { submitCheer } from '../cheer/cheerClient'
import useConfetti from './useConfetti'
import TugOfWar from '../cheer/TugOfWar'

// .trim() strips stray whitespace / BOM that env tooling can prepend, which
// would otherwise make Cloudflare reject the sitekey as malformed. (Same
// bug, same fix, as src/admissions/AuthPanel.jsx.)
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim()

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
// Border opacity is raised past the raw-token values (border-signal/40 ->
// 2.20:1, border-waterloo/40 -> 2.97:1) to clear WCAG 1.4.11's 3:1 for a UI
// component boundary, measured against the void #0A0C14 as the *effective*
// alpha-blended colour, not the raw token:
//   border-signal/60    -> #57698B   3.53:1  PASSES
//   border-waterloo/60  -> #9C8537   5.41:1  PASSES
const SIDE = {
  utmist: {
    // Solid, not a gradient. The gradient faded to 1.14:1 against the void
    // at its bottom edge — literally invisible, which is half of why these
    // panels read as transparent. #24406F is 1.89:1: an actual surface.
    // On it: ink 8.0:1, muted 6.3:1, and the faction name at 4.2:1 which
    // clears AA-large (3:1) for 30px+ bold display type.
    surface: 'bg-panel',
    border: 'border-signal/60',   // #57698B, 3.53:1 vs void — WCAG 1.4.11
    ink: 'text-signal',
    glow: 'sm:shadow-[0_0_40px_-8px_rgba(139,167,218,0.55)]',
    align: 'sm:text-left sm:items-start',
  },
  watai: {
    // Gold over the VOID, not over the navy — washing gold onto navy just
    // desaturates it to grey and stops it reading as the gold side at all.
    // /25 lands on #473D22 at 1.85:1, within 0.04 of the navy panel so both
    // sides feel equally solid. On it: waterloo 7.6:1, ink 8.4:1, muted 6.7:1.
    surface: 'bg-waterloo/25',
    border: 'border-waterloo/60', // #9C8537, 5.41:1 vs void — WCAG 1.4.11
    ink: 'text-waterloo',
    glow: 'sm:shadow-[0_0_40px_-8px_rgba(253,213,79,0.5)]',
    align: 'sm:text-right sm:items-end',
  },
}

// The burst is in the colour you just picked, with ink and muted mixed in so
// it reads as confetti rather than a spray of one flat hue.
const CONFETTI = {
  utmist: [palette.signal, palette.ink, palette.muted, palette.signal],
  watai: [palette.waterloo, palette.ink, palette.muted, palette.waterloo],
}


export default function FactionChoice({ onCheer }) {
  const { faction, choose } = useFaction()
  const [captchaToken, setCaptchaToken] = useState('')
  const turnstileRef = useRef(null)
  const { canvasRef, fire } = useConfetti()

  // interaction-only Turnstile resolves its first token asynchronously, and
  // the faction choice is the hero's primary call to action — most visitors
  // click within the window before that token exists. Rather than silently
  // dropping that first genuine cheer, we hold at most one pending pick and
  // submit it the moment a token arrives. This is one deferred submission,
  // not a retry queue: a later pick before the token arrives replaces it, it
  // is cleared the instant it is submitted, and it is cleared on unmount.
  const pendingFactionRef = useRef(null)

  // The widget only runs when a site key is configured, so local dev and the
  // test environment (where VITE_TURNSTILE_SITE_KEY is unset) keep the
  // faction choice and site-wide theming fully working — only the cheer
  // submission (which the Edge Function requires a token for) is skipped.
  const captchaEnabled = Boolean(TURNSTILE_SITE_KEY)

  useEffect(() => () => { pendingFactionRef.current = null }, [])

  const resetCaptcha = () => {
    setCaptchaToken('')
    turnstileRef.current?.reset()
  }

  const pick = (side, event) => {
    // Allegiance is permanent, so this fires at most once per visitor. Burst
    // from the panel they actually clicked rather than from screen centre —
    // the feedback belongs to the thing they hit.
    const rect = event?.currentTarget?.getBoundingClientRect()
    if (rect) {
      fire({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, CONFETTI[side])
    }
    choose(side)
    onCheer?.(side)
    if (!captchaEnabled) return
    if (captchaToken) {
      submitCheer({ faction: side, turnstileToken: captchaToken })
      // Turnstile tokens are single-use; reset after every attempt so a
      // visitor who switches sides doesn't submit a spent token.
      resetCaptcha()
    } else {
      // No token yet — queue this pick so it submits as soon as Turnstile
      // resolves one, rather than dropping it. Replaces any earlier pending
      // pick; never accumulates more than one.
      pendingFactionRef.current = side
    }
  }

  return (
    <>
      {/* Inert overlay for the pick burst. Never intercepts a click, never
          reaches assistive tech, and draws nothing at all under
          prefers-reduced-motion. */}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-50 h-full w-full"
      />
      {/* The arena. Two territories meeting at a lit seam, with the hand
          holding the line between them.

          The seam is a flex ITEM between the two panels, not an absolutely
          positioned overlay — so it stays exactly on the boundary when the
          chosen side expands, and it flips from a vertical divider to a
          horizontal one for free when the panels stack on mobile.

          The hand lives in the seam on purpose: that is neutral ground. It
          belongs to neither side, never takes --accent, and is not a
          descendant of either button, so it cannot intercept a click. */}
      <div
        className={`mx-auto flex max-w-4xl flex-col overflow-hidden rounded-xl border sm:flex-row ${
          faction ? 'border-accent/40' : 'border-signal/25'
        }`}
      >
        {(() => {
          const panels = FACTIONS.map((side) => {
            const chosen = faction === side
            const other = faction !== null && !chosen
            return (
              <button
                key={side}
                type="button"
                aria-pressed={chosen}
                // Allegiance is permanent, so the side not taken stops being
                // a control once a choice is made. Leaving it clickable but
                // inert would be worse than disabling it: it would look
                // actionable and silently do nothing.
                disabled={other}
                onClick={(event) => pick(side, event)}
                className={`group flex flex-1 flex-col justify-between gap-6 border-0 p-6 text-left transition-all duration-500 sm:p-8
                  ${SIDE[side].surface} ${SIDE[side].align}
                  ${chosen ? `sm:flex-[1.35] ${SIDE[side].glow}` : ''}
                  ${other ? 'cursor-default opacity-45 saturate-50' : 'hover:brightness-125'}`}
              >
                <span className="block">
                  <span className="block font-mono text-[10px] uppercase tracking-[.28em] text-muted">
                    {factionClub[side]}
                  </span>
                  <span
                    className={`mt-2 block font-display text-3xl font-bold leading-none sm:text-4xl ${SIDE[side].ink}`}
                  >
                    {factionSchool[side]}
                  </span>
                </span>
                <span
                  className={`block font-mono text-[10px] tracking-[.2em] ${
                    chosen ? SIDE[side].ink : 'text-muted'
                  }`}
                >
                  {chosen
                    ? `\u2713 You voted ${factionSchool[side]}`
                    : other
                      ? 'Not your side'
                      : `Vote ${factionSchool[side]}`}
                </span>
              </button>
            )
          })
          return (
            <>
              {panels[0]}
              <div className="faction-seam" aria-hidden="true" />
              {panels[1]}
            </>
          )
        })()}
      </div>

      {/* The consequence, in the same eyeful as the cause. */}
      <div className="mx-auto mt-5 max-w-4xl">
        <TugOfWar />
      </div>

      {captchaEnabled && (
        // interaction-only keeps this invisible unless Cloudflare actually
        // decides a challenge is needed — a visible CAPTCHA in front of a
        // "cheer for your school" button would suppress the very
        // participation this feature exists to create.
        <Turnstile
          ref={turnstileRef}
          siteKey={TURNSTILE_SITE_KEY}
          onSuccess={(token) => {
            const pending = pendingFactionRef.current
            if (pending) {
              // A pick already happened while we were waiting for this
              // token — submit it now instead of leaving it dropped, then
              // consume the token immediately so it is never replayed.
              submitCheer({ faction: pending, turnstileToken: token })
              pendingFactionRef.current = null
              resetCaptcha()
              return
            }
            setCaptchaToken(token)
          }}
          onExpire={() => setCaptchaToken('')}
          onError={() => setCaptchaToken('')}
          options={{ appearance: 'interaction-only', theme: 'dark' }}
        />
      )}
    </>
  )
}
