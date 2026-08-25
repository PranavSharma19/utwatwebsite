import { useState } from 'react'
import Crawl from './Crawl'
import FactionChoice from '../faction/FactionChoice'

/**
 * The Hero: three beats over the globally-mounted Starfield.
 *
 * 1. Crawl — the approved copy, receding into the page.
 * 2 & 3. Title and faction choice, revealed together once the crawl
 *    resolves. There is deliberately only one state transition between
 *    "crawl" and "revealed": Crawl's onDone fires synchronously and
 *    without a skip control under prefers-reduced-motion, so anything
 *    gated behind a further timer or animation would strand that visitor.
 *    Setting state directly in the handler is what keeps this safe.
 *
 * No background here — Starfield is mounted once by LandingPage and shows
 * through everywhere this section doesn't paint its own surface.
 */
const CRAWL_COPY =
  'Two schools. Thirty-six hours. One arena. UTMIST and WAT.ai send their finest builders to settle it the only way that matters — in code.'

export default function Hero() {
  const [revealed, setRevealed] = useState(false)

  return (
    <section className="relative overflow-hidden px-gutter py-20 sm:py-28">
      <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center text-center">
        {!revealed && (
          <Crawl text={CRAWL_COPY} onDone={() => setRevealed(true)} />
        )}

        {revealed && (
          <div className="flex w-full flex-col items-center">
            <span className="font-mono text-[10px] uppercase tracking-[.35em] text-muted">
              Toronto &amp; Waterloo &middot; Late Summer 2026
            </span>

            <h1 className="mt-6 font-display text-5xl font-black uppercase leading-[1.05] tracking-tight text-ink sm:text-7xl">
              Battle of the
              <br />
              <span className="text-accent">Schools</span>
            </h1>

            <p className="mt-6 max-w-xl font-sans text-base leading-relaxed text-muted sm:text-lg">
              Pick a side. The rivalry is real, the code is what settles it.
            </p>

            <div className="mt-10 w-full">
              <FactionChoice />
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
