import { useRef, useState } from 'react'
import { Turnstile } from '@marsidev/react-turnstile'
import { useFaction } from './FactionContext'
import { FACTIONS, factionLabel, factionSchool } from '../theme/tokens'
import { submitCheer } from '../cheer/cheerClient'

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
    surface: 'bg-uoft/40 hover:bg-uoft/60 border-signal/60',
    ink: 'text-signal',
    hover: 'group-hover:text-signal',
  },
  watai: {
    surface: 'bg-waterloo/10 hover:bg-waterloo/20 border-waterloo/60',
    ink: 'text-waterloo',
    hover: 'group-hover:text-waterloo',
  },
}

export default function FactionChoice({ onCheer }) {
  const { faction, choose } = useFaction()
  const [captchaToken, setCaptchaToken] = useState('')
  const turnstileRef = useRef(null)

  // The widget only runs when a site key is configured, so local dev and the
  // test environment (where VITE_TURNSTILE_SITE_KEY is unset) keep the
  // faction choice and site-wide theming fully working — only the cheer
  // submission (which the Edge Function requires a token for) is skipped.
  const captchaEnabled = Boolean(TURNSTILE_SITE_KEY)

  const resetCaptcha = () => {
    setCaptchaToken('')
    turnstileRef.current?.reset()
  }

  const pick = (side) => {
    choose(side)
    onCheer?.(side)
    if (captchaEnabled && captchaToken) {
      submitCheer({ faction: side, turnstileToken: captchaToken })
      // Turnstile tokens are single-use; reset after every attempt so a
      // visitor who switches sides doesn't submit a spent token.
      resetCaptcha()
    }
  }

  return (
    <>
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
            <span
              className={`mt-3 block font-mono text-[10px] uppercase tracking-[.2em] text-muted ${SIDE[side].hover}`}
            >
              {faction === side ? 'Standing with them' : 'Cheer them on →'}
            </span>
          </button>
        ))}
      </div>
      {captchaEnabled && (
        // interaction-only keeps this invisible unless Cloudflare actually
        // decides a challenge is needed — a visible CAPTCHA in front of a
        // "cheer for your school" button would suppress the very
        // participation this feature exists to create.
        <Turnstile
          ref={turnstileRef}
          siteKey={TURNSTILE_SITE_KEY}
          onSuccess={(token) => setCaptchaToken(token)}
          onExpire={() => setCaptchaToken('')}
          onError={() => setCaptchaToken('')}
          options={{ appearance: 'interaction-only', theme: 'dark' }}
        />
      )}
    </>
  )
}
